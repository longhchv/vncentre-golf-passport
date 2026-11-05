-- Kết nối SNAG Golf League ↔ Golf Passport · bước 2: hàm cho cổng league-bridge (lookup / issue / results) và nhập lịch sử.
-- Spec 13 mục 4–5, quyết định K1–K12 ở docs/spec/13-mapping.md.
-- Mọi hàm chỉ cấp cho service_role: Edge Function league-bridge kiểm khoá X-League-Key rồi mới gọi.

-------------------------------------------------------------------------------
-- Tiện ích
-------------------------------------------------------------------------------
create or replace function public.league_series_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.tournament_series where code = 'snag_league'
$$;

-- SĐT về dạng +84…; rỗng → null; sai dạng → lỗi invalid_phone
create or replace function public.league_norm_phone(p text)
returns text language plpgsql immutable as $$
declare v text := nullif(regexp_replace(coalesce(p, ''), '[\s.()-]', '', 'g'), '');
begin
  if v is null then return null; end if;
  if v ~ '^0\d{9,10}$' then v := '+84' || substr(v, 2); end if;
  if v ~ '^84\d{9,10}$' then v := '+' || v; end if;
  if v !~ '^\+[1-9]\d{6,14}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;
  return v;
end $$;

create or replace function public.league_norm_gender(p text)
returns text language sql stable set search_path = public as $$
  select case public.normalize_name(p)
    when 'male' then 'male' when 'nam' then 'male' when 'm' then 'male'
    when 'female' then 'female' when 'nu' then 'female' when 'f' then 'female'
    when 'other' then 'other' else null end
$$;

-- Trường theo tên hoặc tên ngắn (bỏ dấu); chỉ nhận khi khớp đúng một trường. Không tạo trường mới.
create or replace function public.league_school_id(p text)
returns uuid language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then (array_agg(id))[1] end
  from public.schools
  where deleted_at is null and nullif(btrim(coalesce(p, '')), '') is not null
    and (public.normalize_name(name) = public.normalize_name(p) or public.normalize_name(short_name) = public.normalize_name(p))
$$;

-- Hồ sơ hiện hành (đi theo các lần gộp)
create or replace function public.league_current_student(p_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid := p_id; n int := 0; nxt uuid;
begin
  loop
    select merged_into_student_id into nxt from public.students where id = v;
    exit when nxt is null or n > 20;
    v := nxt; n := n + 1;
  end loop;
  return v;
end $$;

-- Sổ dùng cho cổng giải: sổ thường active > sổ active khác > assigned > thẻ sự kiện đã ghi tên
create or replace function public.league_student_passport(p_student uuid)
returns public.passports language sql stable security definer set search_path = public as $$
  select p.* from public.passports p
  where p.student_id = p_student and p.status in ('active', 'assigned', 'event_registered')
  order by case when p.status = 'active' and p.counts_toward_single_active then 0
                when p.status = 'active' then 1 when p.status = 'assigned' then 2 else 3 end, p.created_at
  limit 1
$$;

-------------------------------------------------------------------------------
-- Ghép học viên (K1, K8). Khớp chắc khi tên chuẩn hoá trùng, không mâu thuẫn ngày/năm sinh, và một trong:
--   ngày sinh trùng · SĐT phụ huynh trùng · năm sinh trùng (trường không mâu thuẫn) ·
--   thiếu năm sinh nhưng cùng trường và chỉ có đúng một người trùng tên.
-- Trả: status 'matched' (1 hồ sơ) · 'review' (có người trùng tên nhưng không chắc) · 'none'.
-------------------------------------------------------------------------------
create or replace function public.league_find_student(p_name text, p_dob date, p_birth_year int, p_phone text, p_school_id uuid,
  out status text, out student_id uuid, out candidate_ids uuid[])
language plpgsql stable security definer set search_path = public as $$
declare
  v_by int := coalesce(p_birth_year, extract(year from p_dob)::int);
  v_all uuid[];
  v_strong uuid[];
begin
  select coalesce(array_agg(s.id order by s.created_at), '{}') into v_all from public.students s
  where s.full_name_normalized = public.normalize_name(p_name) and s.deleted_at is null and s.merged_into_student_id is null;
  if cardinality(v_all) = 0 then status := 'none'; candidate_ids := '{}'; return; end if;

  select coalesce(array_agg(s.id order by s.created_at), '{}') into v_strong from public.students s
  where s.id = any(v_all)
    and not (p_dob is not null and s.date_of_birth is not null and s.date_of_birth <> p_dob)
    and not (v_by is not null and s.birth_year is not null and s.birth_year <> v_by)
    and ((p_dob is not null and s.date_of_birth = p_dob)
      or (p_phone is not null and exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
            where sg.student_id = s.id and sg.deleted_at is null and g.deleted_at is null and g.phone = p_phone))
      or (v_by is not null and s.birth_year = v_by
          and (p_school_id is null or s.current_school_id is null or s.current_school_id = p_school_id))
      or ((v_by is null or s.birth_year is null) and p_school_id is not null and s.current_school_id = p_school_id
          and cardinality(v_all) = 1));

  if cardinality(v_strong) = 1 then
    status := 'matched'; student_id := v_strong[1]; candidate_ids := v_strong;
  else
    status := 'review'; candidate_ids := case when cardinality(v_strong) > 1 then v_strong else v_all end;
  end if;
end $$;

-- Sổ thẻ số snag_league, trạng thái assigned
create or replace function public.league_issue_card(p_student uuid)
returns public.passports language plpgsql volatile security definer set search_path = public as $$
declare p public.passports; v_months int;
begin
  select validity_months into v_months from public.passport_tiers where code = 'snag_league';
  insert into public.passports (tier_id, student_id, status, issued_at, expires_at, note)
  values ((select id from public.passport_tiers where code = 'snag_league'), p_student, 'assigned', now(),
          now() + make_interval(months => coalesce(v_months, 12)), 'SNAG Golf League')
  returning * into p;
  return p;
end $$;

create or replace function public.league_qr_url(p_code text)
returns text language sql stable security definer set search_path = public as $$
  select rtrim(coalesce((select value #>> '{}' from public.app_settings where key = 'app.public_base_url'), 'https://app.vncentre.net'), '/')
         || '/p/' || p_code
$$;

-------------------------------------------------------------------------------
-- 4.1 lookup: mã VNC hoặc mã sổ. Giới hạn theo IP (league.lookup_per_minute).
-------------------------------------------------------------------------------
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
    select id into v_student from public.students where public.normalize_code(student_code) = v_code;
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

-------------------------------------------------------------------------------
-- 4.2 issue: cấp mã cho bạn đăng ký giải. Gọi lại cùng league_ref → kết quả cũ (theo hồ sơ hiện hành).
-- Chỉ đọc các trường cho phép; mọi trường khác (sức khoẻ, tài trợ, chuyển khoản…) bị bỏ qua.
-------------------------------------------------------------------------------
create or replace function public.league_issue(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_ref text := btrim(coalesce(p ->> 'league_ref', ''));
  v_name text := regexp_replace(btrim(coalesce(p #>> '{child,name}', '')), '\s+', ' ', 'g');
  v_dob date;
  v_gender text := public.league_norm_gender(p #>> '{child,gender}');
  v_school_raw text := nullif(btrim(coalesce(p #>> '{child,school}', '')), '');
  v_school uuid := public.league_school_id(p #>> '{child,school}');
  v_phone text := public.league_norm_phone(p #>> '{guardian,phone}');
  v_gname text := nullif(btrim(coalesce(p #>> '{guardian,name}', '')), '');
  v_email text := nullif(lower(btrim(coalesce(p #>> '{guardian,email}', ''))), '');
  v_versions jsonb;
  req public.league_issue_requests;
  m record;
  v_status text;
  v_student uuid;
  v_guardian uuid;
  pp public.passports;
begin
  if v_ref = '' then raise exception 'league_ref_required' using errcode = '22023'; end if;
  select * into req from public.league_issue_requests where league_ref = v_ref;
  if req.id is not null then
    v_student := public.league_current_student(req.student_id);
    pp := public.league_student_passport(v_student);
    return jsonb_build_object('status', req.status, 'student_code', (select student_code from public.students where id = v_student),
      'passport_code', pp.passport_code, 'qr_url', case when pp.passport_code is not null then public.league_qr_url(pp.passport_code) end,
      'repeated', true);
  end if;

  if v_name = '' then raise exception 'name_required' using errcode = '22023'; end if;
  begin
    v_dob := nullif(p #>> '{child,dob}', '')::date;
  exception when others then raise exception 'invalid_dob' using errcode = '22023';
  end;
  if v_dob is not null and (v_dob > current_date or v_dob < date '1920-01-01') then raise exception 'invalid_dob' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;

  select * into m from public.league_find_student(v_name, v_dob, null, v_phone, v_school);
  select value into v_versions from public.app_settings where key = 'legal.versions';

  if m.status = 'matched' then
    v_status := 'matched';
    v_student := m.student_id;
    -- K1: điền thêm thông tin còn trống (bạn 10/10 chỉ có tên)
    update public.students set date_of_birth = coalesce(date_of_birth, v_dob), gender = coalesce(gender, v_gender),
                               current_school_id = coalesce(current_school_id, v_school)
    where id = v_student;
    -- Đồng ý chỉ ghi cho phụ huynh đã gắn với con và trùng SĐT; không tự gắn phụ huynh mới vào hồ sơ có sẵn
    select g.id into v_guardian from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = v_student and sg.deleted_at is null and g.deleted_at is null and v_phone is not null and g.phone = v_phone
    limit 1;
  else
    v_status := case when m.status = 'review' then 'review' else 'created' end;
    insert into public.students (full_name, date_of_birth, gender, current_school_id, verification_status)
    values (v_name, v_dob, v_gender, v_school, 'pending_review') returning id into v_student;
    if v_phone is not null then
      select g.id into v_guardian from public.guardians g where g.phone = v_phone and g.deleted_at is null
      order by (g.user_id is not null) desc, g.created_at limit 1;
    end if;
    if v_guardian is null and (v_phone is not null or v_gname is not null or v_email is not null) then
      insert into public.guardians (full_name, phone, email) values (v_gname, v_phone, v_email) returning id into v_guardian;
    end if;
    if v_guardian is not null then
      insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
      values (v_student, v_guardian, 'guardian', true, true, 'league', 'active', now());
    end if;
  end if;

  if v_guardian is not null and p ? 'consents' then
    insert into public.consents (guardian_id, student_id, type, version, granted)
    select v_guardian, v_student, x.t, coalesce(v_versions ->> 'privacy', 'v0'), coalesce((p #>> array['consents', x.t])::boolean, false)
    from unnest(array['photo', 'leaderboard_name']) as x(t)
    where p -> 'consents' ? x.t;
  end if;

  pp := public.league_student_passport(v_student);
  if pp.id is null then pp := public.league_issue_card(v_student); end if;

  insert into public.league_issue_requests (league_ref, status, student_id, passport_id)
  values (v_ref, v_status, v_student, pp.id) returning * into req;
  if v_status = 'review' then
    insert into public.league_match_queue (source, issue_request_id, new_student_id, candidate_student_ids, reason, payload)
    values ('issue', req.id, v_student, m.candidate_ids, 'same_name_unsure',
            jsonb_build_object('name', v_name, 'dob', v_dob, 'gender', v_gender, 'school', v_school_raw, 'league_ref', v_ref));
  end if;
  insert into public.audit_logs (action, entity_type, entity_id, after)
  values ('league.issue', 'students', v_student, jsonb_build_object('status', v_status, 'league_ref', v_ref, 'passport_id', pp.id));

  return jsonb_build_object('status', v_status, 'student_code', (select student_code from public.students where id = v_student),
    'passport_code', pp.passport_code, 'qr_url', public.league_qr_url(pp.passport_code));
end $$;

-------------------------------------------------------------------------------
-- Ghi kết quả một chặng (dùng chung cho lệnh results và nhập lịch sử). Gửi lại → thay thế cả chặng:
-- dòng cùng tên được cập nhật tại chỗ (giữ ghép tay của admin và hàng chờ), dòng không còn trong danh sách bị xoá.
-- p_rows: [{ student_code?, name, club?, group?, to_par?, title?, culture?, kind?, birth_year?, gender?,
--            points_participation?, points_rank?, points_bonus? (chỉ nhập lịch sử) }]
-------------------------------------------------------------------------------
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
    v_student := null; v_ms := null; v_mid := null; v_mc := '{}'; v_reason := null;
    if v_kind = 'student' then
      if nullif(btrim(coalesce(x ->> 'student_code', '')), '') is not null then
        select id into v_student from public.students where public.normalize_code(student_code) = public.normalize_code(x ->> 'student_code');
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
        from public.league_find_student(v_name, null, nullif(x ->> 'birth_year', '')::int, null, public.league_school_id(x ->> 'club')) f;
        if v_ms = 'matched' then
          v_student := v_mid; v_matched := v_matched + 1;
        elsif p_create_profiles then
          insert into public.students (full_name, birth_year, gender, current_school_id, verification_status)
          values (v_name, nullif(x ->> 'birth_year', '')::int, public.league_norm_gender(x ->> 'gender'),
                  public.league_school_id(x ->> 'club'), 'pending_review')
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

-------------------------------------------------------------------------------
-- 4.3 results: BTC chốt chặng → app giải gửi. Không tự tạo hồ sơ: dòng không chắc vào hàng chờ.
-------------------------------------------------------------------------------
create or replace function public.league_results(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_no int; v_date date; v_holes int; r jsonb;
begin
  begin
    v_no := (p #>> '{event,no}')::int;
    v_date := (p #>> '{event,date}')::date;
    v_holes := nullif(p #>> '{event,holes}', '')::int;
  exception when others then raise exception 'invalid_event' using errcode = '22023';
  end;
  -- Chỉ lấy trường cho phép; điểm do Passport tính từ thang điểm
  r := public.league_save_stage(v_no, v_date, p #>> '{event,venue}', v_holes,
    coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('student_code', e ->> 'student_code', 'name', e ->> 'name', 'club', e ->> 'club',
               'group', e ->> 'group', 'to_par', e ->> 'to_par', 'title', e ->> 'title', 'culture', e ->> 'culture', 'kind', e ->> 'kind')))
              from jsonb_array_elements(case when jsonb_typeof(p -> 'rows') = 'array' then p -> 'rows' else '[]' end) e), '[]'),
    'league_app', false);
  return jsonb_build_object('ok', true, 'saved', r -> 'saved', 'unmatched', r -> 'unmatched', 'warnings', r -> 'warnings');
end $$;

-------------------------------------------------------------------------------
-- Nhập lịch sử Chặng 1–10 (spec 13 mục 5). p_stages: [{ no, date, venue?, rows: [...] }] — script trên máy dựng từ CSV.
-- p_dry_run: chạy đủ rồi huỷ toàn bộ, chỉ trả báo cáo (tổng điểm từng VĐV, dòng lệch).
-------------------------------------------------------------------------------
create or replace function public.league_import_history(p_stages jsonb, p_dry_run boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  st jsonb;
  r jsonb;
  v_report jsonb := jsonb_build_object('stages', '[]'::jsonb);
  v_series uuid := public.league_series_id();
begin
  begin
    for st in select * from jsonb_array_elements(p_stages) loop
      r := public.league_save_stage((st ->> 'no')::int, (st ->> 'date')::date, st ->> 'venue', nullif(st ->> 'holes', '')::int,
                                    st -> 'rows', 'import', true);
      v_report := jsonb_set(v_report, '{stages}', (v_report -> 'stages') || (r || jsonb_build_object('no', (st ->> 'no')::int)));
    end loop;
    v_report := v_report || jsonb_build_object(
      'standings', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(s.full_name, l.display_raw_name), 'student_code', s.student_code,
                               'total', l.total_points, 'rank', l.rank, 'tied', l.tied, 'stages', l.stages_played, 'best_gross', l.best_gross_count)
                             order by l.rank, coalesce(s.full_name, l.display_raw_name))
                             from public.league_standings l left join public.students s on s.id = l.student_id
                             join public.seasons se on se.id = l.season_id
                             where l.series_id = v_series and se.code = '2026'), '[]'),
      'queue_pending', (select count(*) from public.league_match_queue where status = 'pending' and deleted_at is null and source = 'import'),
      'dry_run', p_dry_run);
    if p_dry_run then raise exception using errcode = 'LGDRY', message = v_report::text; end if;
  exception when sqlstate 'LGDRY' then
    return sqlerrm::jsonb;
  end;
  return v_report;
end $$;

-------------------------------------------------------------------------------
-- Quyền: chỉ service_role (Edge Function league-bridge, script nhập trên máy)
-------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.league_series_id()', 'public.league_norm_phone(text)', 'public.league_norm_gender(text)',
    'public.league_school_id(text)', 'public.league_current_student(uuid)', 'public.league_student_passport(uuid)',
    'public.league_find_student(text, date, int, text, uuid)', 'public.league_issue_card(uuid)', 'public.league_qr_url(text)',
    'public.league_lookup(text, text)', 'public.league_issue(jsonb)',
    'public.league_save_stage(int, date, text, int, jsonb, text, boolean)', 'public.league_results(jsonb)',
    'public.league_import_history(jsonb, boolean)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
