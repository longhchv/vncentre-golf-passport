-- SNAG League · bước 2 (sửa sau khi chạy thử nhập lịch sử trên staging 05/11/2026):
-- league_save_stage tìm trường theo mọi cách viết của CLB (school_names, dựng từ clb-quy-doi.csv).
-- Lý do: file kết quả quy đổi "TH Tô Vĩnh Diện" → "TVD", danh mục trường lưu tên đầy đủ → không ghép được hồ sơ có sẵn.
-- Chỉ thay hàm; quyền giữ nguyên (create or replace không đổi grant).

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
