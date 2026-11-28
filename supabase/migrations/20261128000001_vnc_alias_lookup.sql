-- Mã VNC giai đoạn 1, mục 6 (docs/spec/12-ma-vnc-so-dep-dang-nhap.md mục 5): tra cứu, quét QR, nhập điểm bằng BẤT KỲ mã nào
-- của một người đều ra cùng hồ sơ. Các hàm dưới đây trước so thẳng students.student_code với mã nhập vào; nay so bằng
-- vnc_same_person: khớp như cũ (cùng mã) HOẶC mã nhập vào (đủ 6 chữ số) là mã phụ của chính người giữ mã chính đó.
-- Mỗi hàm chép nguyên bản định nghĩa mới nhất trong repo, chỉ thay biểu thức so mã — hành vi cũ giữ nguyên, chỉ nhận thêm mã phụ.
-- Hồ sơ đã gộp vẫn khớp bằng mã riêng của nó như trước; nhánh mã phụ chỉ khớp dòng giữ MÃ CHÍNH nên không sinh thêm dòng.
-- Quyền thực thi các hàm giữ nguyên (create or replace không đổi quyền). Cần migration 20261127000080 chạy trước.

create or replace function public.vnc_same_person(p_student_code text, p_input text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.normalize_code(p_student_code) = public.normalize_code(p_input)
      or (length(regexp_replace(coalesce(p_input, ''), '\D', '', 'g')) = 6
          and exists (select 1 from public.vnc_codes a
                      where a.code = right(regexp_replace(coalesce(p_student_code, ''), '\D', '', 'g'), 6)
                        and a.is_primary
                        and a.owner_id = public.vnc_student_id(p_input)))
$$;
revoke execute on function public.vnc_same_person(text, text) from public, anon;
grant execute on function public.vnc_same_person(text, text) to authenticated;

-- league_lookup: bản mới nhất từ 20261105000002_snag_league_bridge.sql; chỉ thay phép so mã VNC
create or replace function public.league_lookup(p_code text, p_ip text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := public.normalize_code(p_code);
  v_ip text := coalesce(nullif(btrim(coalesce(p_ip, '')), ''), 'unknown');
  v_student uuid;
  s public.students;
  p public.passports;
  g record;
begin
  if (select count(*) from public.code_attempts where kind = 'league_lookup' and ip = v_ip and created_at > now() - interval '1 minute')
     >= public.setting_int('league.lookup_per_minute', 20) then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  if v_code ~ '^VNC\d+$' then
    select id into v_student from public.students where public.vnc_same_person(student_code, v_code);
  elsif v_code <> '' then
    select student_id into v_student from public.passports where passport_code = v_code and status not in ('unassigned', 'void');
  end if;
  v_student := public.league_current_student(v_student);
  select * into s from public.students where id = v_student and deleted_at is null;
  insert into public.code_attempts (kind, code, ip, success) values ('league_lookup', left(v_code, 20), v_ip, s.id is not null);
  if s.id is null then return jsonb_build_object('found', false); end if;

  p := public.league_student_passport(s.id);
  select g2.full_name, g2.phone, g2.email into g from public.student_guardians sg join public.guardians g2 on g2.id = sg.guardian_id
  where sg.student_id = s.id and sg.deleted_at is null and g2.deleted_at is null and sg.status = 'active'
  order by sg.is_primary desc, sg.linked_at nulls last limit 1;

  return jsonb_build_object('found', true, 'student_code', s.student_code, 'passport_code', p.passport_code,
    'name', s.full_name, 'name_masked', public.mask_name(s.full_name), 'birth_year', s.birth_year, 'dob', s.date_of_birth,
    'gender', s.gender, 'school', (select coalesce(sc.short_name, sc.name) from public.schools sc where sc.id = s.current_school_id),
    'guardian', case when g.full_name is not null or g.phone is not null or g.email is not null
                     then jsonb_build_object('name', g.full_name, 'phone', g.phone, 'email', g.email) end);
end $$;

-- league_save_stage: bản mới nhất từ 20261105000003_snag_league_school_alias.sql; chỉ thay phép so mã VNC
create or replace function public.league_save_stage(p_stage_no int, p_date date, p_venue text, p_holes int, p_rows jsonb,
  p_source text, p_create_profiles boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_series uuid := public.league_series_id();
  v_season uuid;
  v_t uuid;
  x jsonb;
  v_name text;
  v_norm text;
  v_kind text;
  v_student uuid;
  v_existing public.tournament_results;
  v_rank public.tournament_point_rules;
  v_cult public.tournament_point_rules;
  v_part int := coalesce((select points from public.tournament_point_rules where series_id = public.league_series_id() and code = 'participation' and is_active), 0);
  v_pp int; v_pr int; v_pb int;
  v_res uuid;
  v_ms text;
  v_mid uuid;
  v_mc uuid[];
  v_seen text[] := '{}';
  v_saved int := 0; v_unmatched int := 0; v_created int := 0; v_review int := 0; v_matched int := 0;
  v_warn jsonb := '[]';
  v_mismatch jsonb := '[]';
  v_reason text;
  v_school uuid;
begin
  if v_series is null then raise exception 'series_not_found' using errcode = 'P0002'; end if;
  if p_stage_no is null or p_stage_no < 1 then raise exception 'invalid_stage' using errcode = '22023'; end if;
  if p_date is null then raise exception 'date_required' using errcode = '22023'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'rows_required' using errcode = '22023'; end if;
  select id into v_season from public.seasons where p_date between start_date and end_date order by start_date desc limit 1;
  if v_season is null then raise exception 'season_not_found' using errcode = 'P0002'; end if;

  insert into public.tournaments (series_id, season_id, stage_no, played_on, venue, holes, results_source, results_received_at)
  values (v_series, v_season, p_stage_no, p_date, nullif(btrim(coalesce(p_venue, '')), ''), p_holes, p_source, now())
  on conflict (series_id, season_id, stage_no) do update
    set played_on = excluded.played_on, venue = coalesce(excluded.venue, tournaments.venue), holes = coalesce(excluded.holes, tournaments.holes),
        results_source = excluded.results_source, results_received_at = now(), deleted_at = null
  returning id into v_t;

  for x in select * from jsonb_array_elements(p_rows) loop
    v_name := regexp_replace(btrim(coalesce(x ->> 'name', '')), '\s+', ' ', 'g');
    if v_name = '' then raise exception 'row_name_required' using errcode = '22023'; end if;
    v_norm := public.normalize_name(v_name);
    if v_norm = any(v_seen) then raise exception 'duplicate_name: %', v_name using errcode = '22023'; end if;
    v_seen := v_seen || v_norm;
    v_kind := coalesce(nullif(x ->> 'kind', ''), case when public.normalize_name(x ->> 'club') = 'parent' then 'parent' else 'student' end);
    if v_kind not in ('student', 'parent', 'teacher') then v_kind := 'student'; end if;

    -- Danh hiệu, giải văn hoá → điểm theo thang (bảng cấu hình)
    v_rank := public.league_point_rule(v_series, 'rank', x ->> 'title');
    v_cult := public.league_point_rule(v_series, 'culture', x ->> 'culture');
    if nullif(btrim(coalesce(x ->> 'title', '')), '') is not null and v_rank.id is null then
      v_warn := v_warn || jsonb_build_object('name', v_name, 'unknown_title', x ->> 'title'); end if;
    if nullif(btrim(coalesce(x ->> 'culture', '')), '') is not null and v_cult.id is null then
      v_warn := v_warn || jsonb_build_object('name', v_name, 'unknown_culture', x ->> 'culture'); end if;
    if p_source = 'import' and x ? 'points_rank' then
      -- Lịch sử: lấy điểm trong file (K10), đối chiếu với điểm tính lại
      v_pp := coalesce((x ->> 'points_participation')::int, 0);
      v_pr := coalesce((x ->> 'points_rank')::int, 0);
      v_pb := coalesce((x ->> 'points_bonus')::int, 0);
      if v_pp <> v_part or v_pr <> coalesce(v_rank.points, 0) or v_pb <> coalesce(v_cult.points, 0) then
        v_mismatch := v_mismatch || jsonb_build_object('stage', p_stage_no, 'name', v_name, 'file', jsonb_build_array(v_pp, v_pr, v_pb),
                                                       'rules', jsonb_build_array(v_part, coalesce(v_rank.points, 0), coalesce(v_cult.points, 0)));
      end if;
    else
      v_pp := v_part; v_pr := coalesce(v_rank.points, 0); v_pb := coalesce(v_cult.points, 0);
    end if;

    select * into v_existing from public.tournament_results where tournament_id = v_t and raw_name_normalized = v_norm;
    -- Trường: thử tên CLB rồi mọi cách viết đi kèm (school_names, script dựng từ clb-quy-doi)
    v_school := coalesce(public.league_school_id(x ->> 'club'),
      (select public.league_school_id(sn) from jsonb_array_elements_text(case when jsonb_typeof(x -> 'school_names') = 'array' then x -> 'school_names' else '[]' end) sn
       where public.league_school_id(sn) is not null limit 1));
    v_student := null; v_ms := null; v_mid := null; v_mc := '{}'; v_reason := null;
    if v_kind = 'student' then
      if nullif(btrim(coalesce(x ->> 'student_code', '')), '') is not null then
        select id into v_student from public.students where public.vnc_same_person(student_code, x ->> 'student_code');
        v_student := public.league_current_student(v_student);
        if v_student is null then v_warn := v_warn || jsonb_build_object('name', v_name, 'unknown_student_code', x ->> 'student_code'); end if;
      end if;
      if v_student is null and v_existing.student_id is not null then
        v_student := public.league_current_student(v_existing.student_id);
      end if;
      -- Cùng tên đã ghép ở chặng khác của giải: lịch sử (danh sách VĐV duy nhất theo tên) → dùng lại;
      -- app giải → chỉ khi cùng CLB. Phải chỉ ra đúng một hồ sơ.
      if v_student is null then
        select case when count(distinct public.league_current_student(tr.student_id)) = 1
                    then min(public.league_current_student(tr.student_id)::text)::uuid end
          into v_student
        from public.tournament_results tr join public.tournaments t on t.id = tr.tournament_id
        where t.series_id = v_series and tr.tournament_id <> v_t and tr.raw_name_normalized = v_norm
          and tr.student_id is not null and tr.participant_kind = 'student'
          and ((p_source = 'import' and tr.source = 'import')
               or (nullif(public.normalize_name(x ->> 'club'), '') is not null
                   and public.normalize_name(tr.club_name) = public.normalize_name(x ->> 'club')));
        if v_student is not null then v_matched := v_matched + 1; end if;
      end if;
      if v_student is null then
        select f.status, f.student_id, f.candidate_ids into v_ms, v_mid, v_mc
        from public.league_find_student(v_name, null, nullif(x ->> 'birth_year', '')::int, null, v_school) f;
        if v_ms = 'matched' then
          v_student := v_mid; v_matched := v_matched + 1;
        elsif p_create_profiles then
          insert into public.students (full_name, birth_year, gender, current_school_id, verification_status)
          values (v_name, nullif(x ->> 'birth_year', '')::int, public.league_norm_gender(x ->> 'gender'),
                  v_school, 'pending_review')
          returning id into v_student;
          perform public.league_issue_card(v_student);
          v_created := v_created + 1;
          if v_ms = 'review' then v_reason := 'same_name_unsure'; v_review := v_review + 1; end if;
        else
          v_reason := case when v_ms = 'review' then 'same_name_unsure' else 'no_match' end;
        end if;
      end if;
    end if;

    insert into public.tournament_results (tournament_id, student_id, participant_kind, raw_name, raw_club, club_name, group_name, to_par,
      rank_title_code, rank_title_raw, culture_award_code, culture_award_raw, points_participation, points_rank, points_bonus, source)
    values (v_t, v_student, v_kind, v_name, nullif(btrim(coalesce(x ->> 'raw_club', x ->> 'club', '')), ''), nullif(btrim(coalesce(x ->> 'club', '')), ''),
      nullif(btrim(coalesce(x ->> 'group', '')), ''), nullif(x ->> 'to_par', '')::int,
      v_rank.code, nullif(btrim(coalesce(x ->> 'title', '')), ''), v_cult.code, nullif(btrim(coalesce(x ->> 'culture', '')), ''),
      v_pp, v_pr, v_pb, p_source)
    on conflict (tournament_id, raw_name_normalized) do update set
      student_id = excluded.student_id, participant_kind = excluded.participant_kind, raw_name = excluded.raw_name,
      raw_club = excluded.raw_club, club_name = excluded.club_name, group_name = excluded.group_name, to_par = excluded.to_par,
      rank_title_code = excluded.rank_title_code, rank_title_raw = excluded.rank_title_raw,
      culture_award_code = excluded.culture_award_code, culture_award_raw = excluded.culture_award_raw,
      points_participation = excluded.points_participation, points_rank = excluded.points_rank, points_bonus = excluded.points_bonus,
      source = excluded.source
    returning id into v_res;
    v_saved := v_saved + 1;
    if v_kind = 'student' and v_student is null then v_unmatched := v_unmatched + 1; end if;

    if v_reason is not null and not exists (select 1 from public.league_match_queue q where q.tournament_result_id = v_res and q.status = 'pending' and q.deleted_at is null) then
      insert into public.league_match_queue (source, tournament_result_id, new_student_id, candidate_student_ids, reason, payload)
      values (case when p_source = 'import' then 'import' else 'results' end, v_res,
              case when p_create_profiles then v_student end, coalesce(v_mc, '{}'), v_reason,
              jsonb_build_object('name', v_name, 'club', x ->> 'club', 'group', x ->> 'group', 'birth_year', x ->> 'birth_year', 'stage', p_stage_no));
    end if;
  end loop;

  -- Thay thế cả chặng: bỏ dòng không còn trong danh sách gửi
  delete from public.tournament_results where tournament_id = v_t and not (raw_name_normalized = any(v_seen));

  insert into public.audit_logs (action, entity_type, entity_id, after)
  values ('league.results', 'tournaments', v_t, jsonb_build_object('stage', p_stage_no, 'source', p_source, 'saved', v_saved, 'unmatched', v_unmatched));

  return jsonb_build_object('tournament_id', v_t, 'saved', v_saved, 'unmatched', v_unmatched, 'matched_by_name', v_matched,
    'created', v_created, 'review', v_review, 'warnings', v_warn, 'mismatches', v_mismatch);
end $$;

-- league_staff_history: bản mới nhất từ 20261106000008_adult_profile_league_history.sql; chỉ thay phép so mã VNC
create or replace function public.league_staff_history(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_no int; v_date date;
  t public.tournaments;
  r jsonb;
  v_code text; v_student uuid; v_user uuid; v_role text; v_done int; v_total int; v_hours numeric;
  v_saved int := 0; v_waiting int := 0;
  v_unmatched jsonb := '[]';
  v_users uuid[] := '{}';
  v_students uuid[] := '{}';
begin
  begin
    v_no := (p #>> '{event,no}')::int;
    v_date := (p #>> '{event,date}')::date;
  exception when others then raise exception 'invalid_event' using errcode = '22023';
  end;
  select * into t from public.tournaments
  where series_id = public.league_series_id() and stage_no = v_no and played_on = v_date and deleted_at is null;
  if t.id is null then raise exception 'tournament_not_found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p -> 'rows') is distinct from 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;

  for r in select * from jsonb_array_elements(p -> 'rows') loop
    v_code := upper(btrim(coalesce(r ->> 'student_code', '')));
    begin
      v_done := nullif(r ->> 'tasks_done', '')::int;
      v_total := nullif(r ->> 'tasks_total', '')::int;
      v_hours := nullif(r ->> 'hours', '')::numeric;
    exception when others then raise exception 'invalid_row: %', v_code using errcode = '22023';
    end;
    if v_done < 0 or v_total < 0 or v_hours < 0 or v_done > v_total then raise exception 'invalid_row: %', v_code using errcode = '22023'; end if;
    v_role := nullif(btrim(coalesce(r ->> 'role', '')), '');
    select public.league_current_student(s.id) into v_student from public.students s where public.vnc_same_person(s.student_code, v_code) and s.deleted_at is null;
    if v_student is null then
      v_unmatched := v_unmatched || to_jsonb(v_code);
      continue;
    end if;
    v_user := public.staff_user_for_student(v_student);
    if v_user is null then
      insert into public.staff_history_pending (tournament_id, student_id, role, tasks_done, tasks_total, hours)
      values (t.id, v_student, v_role, v_done, v_total, v_hours)
      on conflict (tournament_id, student_id) do update
        set role = excluded.role, tasks_done = excluded.tasks_done, tasks_total = excluded.tasks_total, hours = excluded.hours,
            attached_at = null, attached_engagement_id = null;
      v_students := v_students || v_student;
      v_waiting := v_waiting + 1;
    else
      perform public.staff_history_upsert(v_user, t, v_role, v_done, v_total, v_hours);
      v_users := v_users || v_user;
      v_saved := v_saved + 1;
    end if;
  end loop;

  -- Người không còn trong lần gửi này: bỏ dòng cũ của chặng
  update public.staff_engagements set deleted_at = now()
  where tournament_id = t.id and source = 'league_app' and deleted_at is null and not (user_id = any(v_users));
  delete from public.staff_history_pending where tournament_id = t.id and attached_at is null and not (student_id = any(v_students));

  insert into public.audit_logs (action, entity_type, entity_id, after)
  values ('league.staff_history', 'tournaments', t.id,
          jsonb_build_object('stage_no', t.stage_no, 'saved', v_saved, 'waiting', v_waiting, 'unmatched', v_unmatched));
  return jsonb_build_object('ok', true, 'saved', v_saved + v_waiting, 'waiting', v_waiting,
                            'unmatched', jsonb_array_length(v_unmatched), 'unmatched_codes', v_unmatched);
end $$;

-- reward_import_match: bản mới nhất từ 20261111000001_rewards_opening_import.sql; chỉ thay phép so mã VNC
create or replace function public.reward_import_match(p_rows jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
  v_out jsonb := '[]';
  v_code text; v_name text; v_year int; v_phone text; v_school text;
  v_ids uuid[]; v_tmp uuid[];
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 3000 then raise exception 'invalid_rows' using errcode = '22023'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_code := nullif(btrim(coalesce(r ->> 'code', '')), '');
    v_name := public.normalize_name(r ->> 'name');
    v_year := case when (r ->> 'year') ~ '^\d{4}$' then (r ->> 'year')::int end;
    v_school := nullif(public.normalize_name(r ->> 'school'), '');
    begin
      v_phone := public.league_norm_phone(r ->> 'phone');
    exception when others then v_phone := null;
    end;

    if v_code is not null then
      select array_agg(st.id) into v_ids from public.students st
      where st.deleted_at is null and st.merged_into_student_id is null
        and public.vnc_same_person(st.student_code, v_code);
    elsif v_name <> '' then
      select array_agg(st.id) into v_ids from public.students st
      where st.deleted_at is null and st.merged_into_student_id is null and st.full_name_normalized = v_name;
    else
      v_ids := null;
    end if;

    -- Năm sinh (khi dò theo tên): loại hồ sơ có năm sinh khác (hồ sơ chưa có năm sinh vẫn giữ)
    if v_year is not null and v_code is null and cardinality(v_ids) >= 1 then
      select array_agg(st.id) into v_tmp from public.students st
      where st.id = any(v_ids)
        and coalesce(st.birth_year::int, extract(year from st.date_of_birth)::int, v_year) = v_year;
      v_ids := v_tmp;
    end if;
    -- SĐT phụ huynh: nếu có hồ sơ khớp số thì chỉ giữ các hồ sơ đó
    if v_phone is not null and cardinality(v_ids) > 1 then
      select array_agg(distinct sg.student_id) into v_tmp from public.student_guardians sg
      join public.guardians g on g.id = sg.guardian_id
      where sg.student_id = any(v_ids) and sg.status = 'active' and g.phone = v_phone;
      if cardinality(v_tmp) > 0 then v_ids := v_tmp; end if;
    end if;
    -- Trường: tương tự
    if v_school is not null and cardinality(v_ids) > 1 then
      select array_agg(st.id) into v_tmp from public.students st join public.schools sc on sc.id = st.current_school_id
      where st.id = any(v_ids)
        and (public.normalize_name(sc.name) like '%' || v_school || '%' or public.normalize_name(sc.short_name) = v_school);
      if cardinality(v_tmp) > 0 then v_ids := v_tmp; end if;
    end if;

    v_out := v_out || jsonb_build_object(
      'row', r -> 'row',
      'status', case when coalesce(cardinality(v_ids), 0) = 0 then 'not_found' when cardinality(v_ids) = 1 then 'matched' else 'ambiguous' end,
      'candidates', coalesce((select jsonb_agg(jsonb_build_object(
          'id', st.id, 'full_name', st.full_name, 'student_code', st.student_code,
          'birth_year', coalesce(st.birth_year::int, extract(year from st.date_of_birth)::int),
          'school', sc.name,
          'opening', (select sum(l.delta) from public.reward_ledger l
                      where l.student_id = st.id and l.reason in ('opening_balance', 'opening_balance_adjust')),
          'available', public.reward_available(st.id)) order by st.full_name, st.student_code)
        from public.students st left join public.schools sc on sc.id = st.current_school_id
        where st.id = any(v_ids) and cardinality(v_ids) <= 10), '[]'));
  end loop;
  return v_out;
end $$;

-- reward_find_students: bản mới nhất từ 20261110000003_rewards_manual.sql; chỉ thay phép so mã VNC
create or replace function public.reward_find_students(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := btrim(coalesce(p_query, ''));
begin
  if not (public.is_admin() or public.is_head_coach()) then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if length(q) < 2 then return '[]'; end if;
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', st.id, 'full_name', st.full_name, 'student_code', st.student_code, 'birth_year', st.birth_year) as x
    from public.students st
    where st.deleted_at is null and st.merged_into_student_id is null
      and (public.vnc_same_person(st.student_code, q)
           or public.normalize_name(st.full_name) like '%' || public.normalize_name(q) || '%')
    order by st.full_name limit 20) z), '[]');
end $$;

-- whs_find_marker: bản mới nhất từ 20261124000006_whs_handicap.sql; chỉ thay phép so mã VNC
create or replace function public.whs_find_marker(p_fed text, p_code text) returns table (member_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select m.id, m.full_name from public.whs_members m join public.students s on s.id = m.student_id
  where auth.uid() is not null and m.federation_id = p_fed and m.status = 'active'
    and public.vnc_same_person(s.student_code, btrim(p_code))
$$;

-- whs_lookup: bản mới nhất từ 20261124000006_whs_handicap.sql; chỉ thay phép so mã VNC
create or replace function public.whs_lookup(p_q text, p_fed text default null) returns table (
  member_id uuid, full_name text, vnc_code text, federation_id text, club text, hi numeric, as_of date)
language sql stable security definer set search_path = public as $$
  select m.id, m.full_name, s.student_code, m.federation_id, c.name, h.hi, h.as_of
  from whs_members m
  join students s on s.id = m.student_id
  left join whs_clubs c on c.id = m.home_club_id
  left join lateral (select hi, as_of from whs_hi_history x where x.member_id = m.id and not x.withdrawn order by as_of desc limit 1) h on true
  where m.status = 'active' and not m.is_minor and m.public_lookup
    and (p_fed is null or m.federation_id = p_fed)
    and length(trim(p_q)) >= 2 and (m.full_name ilike '%' || trim(p_q) || '%' or public.vnc_same_person(s.student_code, trim(p_q)))
  order by m.full_name limit 30
$$;

-- whs_sim_ingest: bản mới nhất từ 20261125000001_whs_simulator.sql; chỉ thay phép so mã VNC
create or replace function public.whs_sim_ingest(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare fed text := coalesce(p_payload ->> 'federation', 'vn'); v practice_venues; cs whs_sim_courses; m whs_members;
  v_gross int[]; v_id uuid; v_holes text := p_payload ->> 'holes';
begin
  if not whs_sim_bool(fed, 'simApiEnabled', false) then raise exception 'api_not_enabled'; end if;
  if coalesce((p_payload ->> 'mulligan')::boolean, false) then raise exception 'mulligan_not_counted'; end if;
  select * into v from practice_venues where id = p_payload ->> 'venue_id' and type = '3d';
  if v.id is null or v.machine is null then raise exception 'venue_not_found'; end if;
  if not whs_sim_brand_official(v.machine) then raise exception 'brand_not_official'; end if;
  select mb.* into m from whs_members mb join students s on s.id = mb.student_id
  where public.vnc_same_person(s.student_code, p_payload ->> 'student_code') and mb.federation_id = fed and mb.status in ('active', 'pending');
  if m.id is null then raise exception 'member_not_found'; end if;
  select * into cs from whs_sim_courses where id = (p_payload ->> 'course_id')::uuid and brand = v.machine;
  select array_agg(x::int order by o) into v_gross from jsonb_array_elements_text(p_payload -> 'gross') with ordinality t(x, o);
  perform whs_sim_check_round(cs, v_holes, v_gross);
  insert into whs_sim_rounds (member_id, federation_id, venue_id, brand, course_id, holes, played_on, gross, gimme, via, external_ref,
    status, decided_at, flags)
  values (m.id, fed, v.id, v.machine, cs.id, v_holes, (p_payload ->> 'played_on')::date, v_gross,
    coalesce((p_payload ->> 'gimme')::boolean, false), 'api', p_payload ->> 'external_ref', 'confirmed', now(),
    case when coalesce((p_payload ->> 'gimme')::boolean, false) then array['gimme'] else '{}' end)
  returning id into v_id;
  perform whs_sim_log(v_id, 'ingest', null, p_payload, null);
  perform whs_sim_recompute(m.id, v.machine);
  return v_id;
end $$;

-- whs_find_peer: bản mới nhất từ 20261126000001_whs_plus.sql; chỉ thay phép so mã VNC
create or replace function public.whs_find_peer(p_fed text, p_code text) returns table (member_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select m.id, m.full_name from public.whs_members m join public.students s on s.id = m.student_id
  where auth.uid() is not null and m.federation_id = p_fed and m.status in ('active', 'pending')
    and public.vnc_same_person(s.student_code, btrim(p_code))
$$;

-- whs_lookup_plus: bản mới nhất từ 20261126000001_whs_plus.sql; chỉ thay phép so mã VNC
create or replace function public.whs_lookup_plus(p_q text) returns table (
  member_id uuid, full_name text, vnc_code text, federation_id text, club text, is_minor boolean,
  hi numeric, hi_as_of date, junior numeric, snag numeric, sims jsonb, recent jsonb)
language sql stable security definer set search_path = public as $$
  with q as (select btrim(coalesce(p_q, '')) as q),
  cand as (
    select m.*, s.student_code from whs_members m join students s on s.id = m.student_id, q
    where length(q.q) >= 2 and (
      -- Người lớn: theo tên hoặc mã, đang hoạt động, cho phép tra cứu
      (not m.is_minor and m.public_lookup and m.status = 'active'
        and (m.full_name ilike '%' || q.q || '%' or public.vnc_same_person(s.student_code, q.q)))
      -- Trẻ em: chỉ đúng mã VNC, người tra phải đăng nhập, liên đoàn cho phép
      or (m.is_minor and m.status in ('active', 'pending') and auth.uid() is not null
        and public.vnc_same_person(s.student_code, q.q)
        and coalesce((whs_setting(m.federation_id, 'lookupMinors') #>> '{}')::boolean, true)))
    order by m.full_name limit 30)
  select c.id, case when c.is_minor then whs_short_name(c.full_name) else c.full_name end, c.student_code, c.federation_id,
    case when c.is_minor then null else cl.name end, c.is_minor,
    h.hi, h.as_of,
    (select idx from whs_youth_index y where y.member_id = c.id and y.kind = 'junior'),
    (select idx from whs_youth_index y where y.member_id = c.id and y.kind = 'snag'),
    coalesce((select jsonb_agg(jsonb_build_object('brand', si.brand, 'idx', si.idx, 'official', si.official) order by si.brand)
              from whs_sim_index si where si.member_id = c.id and si.idx is not null), '[]'::jsonb),
    case when c.is_minor then '[]'::jsonb else coalesce((
      select jsonb_agg(x order by x ->> 'date' desc) from (
        select jsonb_build_object('date', r.played_on, 'course', co.name, 'holes', r.holes, 'diff', rr.diff) as x
        from whs_rounds r join whs_round_results rr on rr.round_id = r.id and rr.ok
        left join whs_courses co on co.id = r.course_id
        where r.member_id = c.id and r.status = 'attested' order by r.played_on desc limit 5) z), '[]'::jsonb) end
  from cand c
  left join whs_clubs cl on cl.id = c.home_club_id
  left join lateral (select hi, as_of from whs_hi_history x where x.member_id = c.id and not x.withdrawn order by as_of desc limit 1) h on true
$$;

-- whs_bulk_import: bản mới nhất từ 20261126000001_whs_plus.sql; chỉ thay phép so mã VNC
create or replace function public.whs_bulk_import(p_fed text, p_kind text, p_event text, p_date date, p_ref text, p_holes text,
  p_rows jsonb, p_commit boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb; v_line int := 0; v_code text; v_ref text; v_date date; v_holes text; v_scores jsonb; v_gross int[];
  m whs_members; v_err text; v_id uuid; v_rep jsonb := '[]'::jsonb; v_ok int := 0; v_bad int := 0; v_imp uuid; v_n int;
  v_course text; v_tee text; v_seen text[] := '{}';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not whs_is_fed_staff(p_fed) then raise exception 'forbidden'; end if;
  if p_kind not in ('whs', 'junior', 'snag') then raise exception 'bad_kind'; end if;
  if coalesce(char_length(btrim(p_event)), 0) < 2 then raise exception 'event_required'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'rows_required'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'too_many_rows'; end if;
  if p_commit then
    insert into whs_imports (federation_id, kind, event_name, played_on) values (p_fed, p_kind, btrim(p_event), p_date) returning id into v_imp;
  end if;

  for e in select value from jsonb_array_elements(p_rows) loop
    v_line := v_line + 1; v_err := null; v_id := null; m := null;
    v_code := upper(btrim(coalesce(e ->> 'code', '')));
    v_ref := coalesce(nullif(btrim(e ->> 'ref'), ''), p_ref);
    v_holes := coalesce(nullif(e ->> 'holes', ''), p_holes, '18');
    v_scores := e -> 'scores';
    v_date := p_date;
    begin
      if nullif(btrim(e ->> 'date'), '') is not null then v_date := (e ->> 'date')::date; end if;
      if v_code = '' then raise exception 'code_required'; end if;
      if v_date is null or v_date > current_date + 1 then raise exception 'bad_date'; end if;
      if v_ref is null then raise exception 'ref_required'; end if;
      select x.* into m from whs_members x join students s on s.id = x.student_id
       where x.federation_id = p_fed and public.vnc_same_person(s.student_code, v_code);
      if m.id is null then raise exception 'member_not_found'; end if;
      if v_code || '|' || v_ref || '|' || v_date = any(v_seen) then raise exception 'duplicate_in_file'; end if;
      v_seen := v_seen || (v_code || '|' || v_ref || '|' || v_date);
      if p_kind = 'whs' then
        if m.status <> 'active' then raise exception 'not_active_member'; end if;
        v_course := split_part(v_ref, '|', 1); v_tee := split_part(v_ref, '|', 2);
        if not exists (select 1 from whs_courses where id = v_course and (data -> 'tees') ? v_tee) then raise exception 'course_or_tee_not_found'; end if;
        if v_holes not in ('18', 'F', 'B') then raise exception 'bad_holes'; end if;
        if jsonb_typeof(v_scores) <> 'array' then raise exception 'scores_required'; end if;
        select array_agg(case when jsonb_typeof(x) = 'number' then (x #>> '{}')::int end order by o) into v_gross
          from jsonb_array_elements(v_scores) with ordinality a(x, o);
        perform whs_check_gross(v_holes, v_gross);
        if exists (select 1 from whs_rounds r where r.member_id = m.id and r.course_id = v_course and r.played_on = v_date
                   and r.gross = v_gross and r.status not in ('cancelled', 'rejected', 'void')) then raise exception 'duplicate_round'; end if;
        if p_commit then
          insert into whs_rounds (member_id, federation_id, course_id, tee_key, played_on, holes, format, type, status,
            gross, submitted_at, attested_at, attested_by, note, entered_by, import_id)
          values (m.id, m.federation_id, v_course, v_tee, v_date, v_holes, 'stroke', 'competition', 'attested',
            v_gross, now(), now(), auth.uid(), btrim(p_event), auth.uid(), v_imp)
          returning id into v_id;
          perform whs_log(v_id, 'bulk_import', null, jsonb_build_object('gross', v_gross, 'event', btrim(p_event), 'import', v_imp));
        end if;
      else
        if m.status not in ('active', 'pending') then raise exception 'member_inactive'; end if;
        v_n := whs_youth_ref_holes(p_kind, v_ref, p_fed);
        perform whs_youth_check_scores(p_kind, v_n, v_scores);
        if exists (select 1 from whs_youth_rounds r where r.member_id = m.id and r.kind = p_kind and r.played_on = v_date
                   and coalesce(r.tee_id, r.layout_id) = v_ref and r.scores = v_scores and r.status <> 'rejected') then
          raise exception 'duplicate_round';
        end if;
        if p_commit then
          insert into whs_youth_rounds (member_id, federation_id, kind, layout_id, tee_id, played_on, round_type, scores, via, status,
            decided_by, decided_at, decision_note, import_id)
          values (m.id, m.federation_id, p_kind, case when p_kind = 'snag' then v_ref end, case when p_kind = 'junior' then v_ref end,
            v_date, 'event', v_scores, 'admin', 'confirmed', auth.uid(), now(), btrim(p_event), v_imp)
          returning id into v_id;
        end if;
      end if;
      v_ok := v_ok + 1;
    exception when others then
      v_err := sqlerrm; v_bad := v_bad + 1;
    end;
    v_rep := v_rep || jsonb_build_object('line', coalesce((e ->> 'line')::int, v_line), 'code', v_code,
      'name', m.full_name, 'ok', v_err is null, 'error', v_err, 'round', v_id);
  end loop;

  if p_commit then
    update whs_imports set n_ok = v_ok, n_err = v_bad, report = v_rep where id = v_imp;
  end if;
  return jsonb_build_object('import', v_imp, 'ok', v_ok, 'err', v_bad, 'rows', v_rep, 'committed', p_commit);
end $$;

-- admin_search_students: bản mới nhất từ 20260924000001_step3_classes_staff.sql; chỉ thay phép so mã VNC
create or replace function public.admin_search_students(
  p_query text default null,
  p_school_id uuid default null,
  p_limit int default 50
)
returns table (
  id uuid,
  student_code text,
  full_name text,
  date_of_birth date,
  gender text,
  current_school_id uuid,
  school_name text,
  current_grade_class text,
  level_number int,
  verification_status text,
  guardian_count int,
  activated boolean
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  q text := nullif(btrim(coalesce(p_query, '')), '');
  q_norm text := public.normalize_name(q);
  q_digits text := regexp_replace(coalesce(q, ''), '\D', '', 'g');
  q_phone text;
begin
  if not public.is_center_staff() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  -- 0912… → +84912…; 84912… → +84912…
  q_phone := case
    when q_digits ~ '^0\d{8,10}$' then '+84' || substr(q_digits, 2)
    when length(q_digits) >= 8 then '+' || q_digits
    else null end;

  return query
  select s.id, s.student_code, s.full_name, s.date_of_birth, s.gender, s.current_school_id,
         coalesce(sc.short_name, sc.name), s.current_grade_class, l.number, s.verification_status,
         (select count(*)::int from public.student_guardians sg where sg.student_id = s.id and sg.deleted_at is null),
         s.activated_at is not null
  from public.students s
  left join public.schools sc on sc.id = s.current_school_id
  left join public.levels l on l.id = s.current_level_id
  where s.deleted_at is null and s.merged_into_student_id is null
    and (p_school_id is null or s.current_school_id = p_school_id)
    and (q is null
         or s.full_name_normalized like '%' || q_norm || '%'
         or upper(replace(s.student_code, '-', '')) like '%' || upper(replace(q, '-', '')) || '%'
         or public.vnc_same_person(s.student_code, q)
         or (q_phone is not null and exists (
               select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
               where sg.student_id = s.id and sg.deleted_at is null and g.phone like q_phone || '%')))
  order by s.full_name_normalized
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
end $$;

-- league_staff_search: bản mới nhất từ 20261105000005_league_staff.sql; chỉ thay phép so mã VNC
create or replace function public.league_staff_search(p_query text default null, p_limit int default 30)
returns table (
  id uuid,
  student_code text,
  full_name text,
  birth_year int,
  school_name text,
  stages_count int
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  q text := nullif(btrim(coalesce(p_query, '')), '');
  q_norm text := public.normalize_name(q);
  q_code text := upper(replace(coalesce(q, ''), '-', ''));
  q_pass text := public.normalize_code(regexp_replace(coalesce(q, ''), '^.*/p/', ''));
  q_digits text := regexp_replace(coalesce(q, ''), '\D', '', 'g');
  q_phone text;
begin
  if not (public.is_league_staff() or public.is_admin()) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  q_phone := case
    when q_digits ~ '^0\d{8,10}$' then '+84' || substr(q_digits, 2)
    when length(q_digits) >= 8 then '+' || q_digits
    else null end;

  return query
  select s.id, s.student_code, s.full_name,
         coalesce(s.birth_year, extract(year from s.date_of_birth)::int),
         coalesce(sc.short_name, sc.name),
         (select count(*)::int from public.tournament_results r
          where r.student_id = s.id and r.participant_kind = 'student')
  from public.league_staff_student_ids() i
  join public.students s on s.id = i
  left join public.schools sc on sc.id = s.current_school_id
  where q is null
     or s.full_name_normalized like '%' || q_norm || '%'
     or upper(replace(s.student_code, '-', '')) like '%' || q_code || '%'
     or public.vnc_same_person(s.student_code, q_code)
     or (q_pass <> '' and exists (
           select 1 from public.passports p
           where p.passport_code = q_pass and p.status not in ('unassigned', 'void')
             and public.league_current_student(p.student_id) = s.id))
     or (q_phone is not null and exists (
           select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
           where sg.student_id = s.id and sg.deleted_at is null and sg.status = 'active' and g.phone like q_phone || '%'))
  order by s.full_name_normalized
  limit least(greatest(coalesce(p_limit, 30), 1), 200);
end $$;

-- admin_students_page: bản mới nhất từ 20261105000006_admin_students.sql; chỉ thay phép so mã VNC
create or replace function public.admin_students_page(
  p_query text default null,
  p_school_id uuid default null,
  p_tier_code text default null,
  p_verification text default null,
  p_league boolean default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  q text := nullif(btrim(coalesce(p_query, '')), '');
  q_norm text := public.normalize_name(q);
  q_code text := upper(replace(coalesce(q, ''), '-', ''));
  q_pass text := public.normalize_code(regexp_replace(coalesce(q, ''), '^.*/p/', ''));
  q_digits text := regexp_replace(coalesce(q, ''), '\D', '', 'g');
  q_phone text;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_total int;
  v_rows jsonb;
begin
  if not public.is_center_staff() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  q_phone := case
    when q_digits ~ '^0\d{8,10}$' then '+84' || substr(q_digits, 2)
    when length(q_digits) >= 8 then '+' || q_digits
    else null end;

  with m as (
    select s.*
    from public.students s
    where s.deleted_at is null and s.merged_into_student_id is null
      and (p_school_id is null or s.current_school_id = p_school_id)
      and (p_verification is null or s.verification_status = p_verification)
      and (p_tier_code is null or exists (
             select 1 from public.passports p join public.passport_tiers t on t.id = p.tier_id
             where p.student_id = s.id and t.code = p_tier_code and p.status not in ('unassigned', 'void')))
      and (p_league is null or p_league = exists (
             select 1 from public.tournament_results r where r.student_id = s.id and r.participant_kind = 'student'))
      and (q is null
           or s.full_name_normalized like '%' || q_norm || '%'
           or upper(replace(s.student_code, '-', '')) like '%' || q_code || '%'
           or public.vnc_same_person(s.student_code, q_code)
           or (q_pass <> '' and exists (
                 select 1 from public.passports p where p.student_id = s.id and p.passport_code = q_pass))
           or (q_phone is not null and exists (
                 select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                 where sg.student_id = s.id and sg.deleted_at is null and g.phone like q_phone || '%')))
  ),
  pg as (
    select m.* from m order by m.full_name_normalized, m.id limit v_limit offset v_offset
  )
  select (select count(*) from m)::int,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', pg.id, 'student_code', pg.student_code, 'full_name', pg.full_name,
           'date_of_birth', pg.date_of_birth, 'birth_year', coalesce(pg.birth_year, extract(year from pg.date_of_birth)::int),
           'school_name', (select coalesce(sc.short_name, sc.name) from public.schools sc where sc.id = pg.current_school_id),
           'current_grade_class', pg.current_grade_class,
           'level_number', (select l.number from public.levels l where l.id = pg.current_level_id),
           'verification_status', pg.verification_status,
           'activated', pg.activated_at is not null,
           'passports', (select coalesce(jsonb_agg(jsonb_build_object('code', p.passport_code, 'tier_code', t.code, 'status', p.status)
                                                   order by p.created_at desc), '[]')
                         from public.passports p join public.passport_tiers t on t.id = p.tier_id
                         where p.student_id = pg.id and p.status not in ('unassigned', 'void')),
           'league_stages', (select count(*) from public.tournament_results r where r.student_id = pg.id and r.participant_kind = 'student'))
           order by pg.full_name_normalized, pg.id), '[]')
    into v_total, v_rows
  from pg;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

-- admin_certificates: bản mới nhất từ 20260927000001_step12_certificates.sql; chỉ thay phép so mã VNC
create or replace function public.admin_certificates(p_search text default null, p_status text default null, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_center_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
    select jsonb_build_object('id', c.id, 'student_id', c.student_id, 'student_name', c.data ->> 'student_name',
      'student_code', s.student_code, 'class_name', cl.name, 'title_vi', c.title_vi, 'title_en', c.title_en, 'type', c.type,
      'status', c.status, 'issued_at', c.issued_at, 'verify_code', c.verify_code, 'revoked_reason', c.revoked_reason,
      'created_at', c.created_at) x
    from public.certificates c join public.students s on s.id = c.student_id
    left join public.classes cl on cl.id = c.class_id
    where (p_status is null or c.status = p_status)
      and (v_q is null or c.verify_code = upper(regexp_replace(v_q, '[^A-Za-z0-9]', '', 'g'))
           or s.full_name_normalized like '%' || public.normalize_name(v_q) || '%' or s.student_code ilike v_q or public.vnc_same_person(s.student_code, v_q))
    order by c.created_at desc limit least(coalesce(p_limit, 100), 500)) q), '[]');
end $$;
