-- Kết nối SNAG Golf League ↔ Golf Passport · bước 3: dữ liệu cho giao diện (spec 13 mục 6).
--   league_public_profile: mục "Thành tích SNAG Golf League" trên /p/{mã} (ai cũng xem được, kể cả chưa đăng nhập)
--   admin_league_queue / admin_league_resolve: trang admin "Ghép VĐV SNAG League"

-------------------------------------------------------------------------------
-- 6.1 / 6.2 Trang /p/{mã}. Không trả ngày sinh, năm sinh, trường, CLB, phụ huynh.
-- Tên hiện khi: phụ huynh đồng ý leaderboard_name (lần ghi mới nhất, chưa rút), hoặc đã thi đến hết chặng
-- league.name_shown_until_stage của mùa 2026 mà chưa xin tắt (K4). Xin tắt = đồng ý ghi "không" hoặc students.league_name_hidden.
-- Phụ huynh đang đăng nhập (đã gắn với con) nhận thêm danh sách chứng nhận giải để tải.
-------------------------------------------------------------------------------
create or replace function public.league_public_profile(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_code text := public.normalize_code(p_code);
  v_series uuid := public.league_series_id();
  v_student uuid;
  s public.students;
  st record;
  v_consent boolean;
  v_early boolean;
  v_show boolean;
  v_best_all int;
  v_stages jsonb;
  v_certs jsonb;
begin
  select public.league_current_student(p.student_id) into v_student from public.passports p
  where p.passport_code = v_code and p.status not in ('unassigned', 'void');
  select * into s from public.students where id = v_student and deleted_at is null;
  if s.id is null or v_series is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'stage_no', t.stage_no, 'played_on', t.played_on, 'venue', t.venue, 'season', se.code,
           'counts_for_ranking', t.counts_for_ranking, 'group', r.group_name, 'to_par', r.to_par,
           'title_code', r.rank_title_code, 'title_vi', rk.name_vi, 'title_en', rk.name_en,
           'culture_code', r.culture_award_code, 'culture_vi', cu.name_vi, 'culture_en', cu.name_en,
           'points', r.points_total)
         order by t.played_on desc, t.stage_no desc), '[]'),
         count(*) filter (where r.rank_title_code = 'best_gross')
    into v_stages, v_best_all
  from public.tournament_results r
  join public.tournaments t on t.id = r.tournament_id and t.deleted_at is null and t.series_id = v_series
  join public.seasons se on se.id = t.season_id
  left join public.tournament_point_rules rk on rk.series_id = v_series and rk.code = r.rank_title_code
  left join public.tournament_point_rules cu on cu.series_id = v_series and cu.code = r.culture_award_code
  where r.student_id = s.id and r.participant_kind = 'student';
  if jsonb_array_length(v_stages) = 0 then return null; end if;

  -- Mùa gần nhất có hạng
  select l.total_points, l.rank, l.tied, l.players, l.stages_played, se.code as season_code, se.name_vi as season_vi, se.name_en as season_en
    into st
  from public.league_standings l join public.seasons se on se.id = l.season_id
  where l.series_id = v_series and l.student_id = s.id
  order by se.start_date desc limit 1;

  select c.granted into v_consent from public.consents c
  where c.student_id = s.id and c.type = 'leaderboard_name' and c.revoked_at is null
  order by c.granted_at desc, c.created_at desc limit 1;
  select exists (select 1 from public.tournament_results r join public.tournaments t on t.id = r.tournament_id
                 join public.seasons se on se.id = t.season_id
                 where r.student_id = s.id and t.series_id = v_series and se.code = '2026'
                   and t.stage_no <= public.setting_int('league.name_shown_until_stage', 9))
    into v_early;
  v_show := not s.league_name_hidden and (v_consent is true or (v_consent is null and v_early));

  if auth.uid() is not null and public.is_guardian_of(s.id, true) then
    select coalesce(jsonb_agg(jsonb_build_object('verify_code', c.verify_code, 'title_vi', c.title_vi, 'title_en', c.title_en, 'issued_at', c.issued_at)
                              order by c.issued_at desc), '[]')
      into v_certs
    from public.certificates c where c.student_id = s.id and c.type = 'tournament' and c.status = 'valid' and c.verify_code is not null;
  end if;

  return jsonb_build_object(
    'name', case when v_show then s.full_name end,
    'anonymous', not v_show,
    'season', st.season_code, 'season_vi', st.season_vi, 'season_en', st.season_en,
    'total_points', st.total_points, 'rank', st.rank, 'tied', st.tied, 'players', st.players,
    'stages_count', jsonb_array_length(v_stages),
    'best_gross_count', v_best_all,
    'graduated', v_best_all >= public.setting_int('league.graduation_best_gross', 3),
    'stages', v_stages,
    'certificates', v_certs);
end $$;

-------------------------------------------------------------------------------
-- 6.3 Admin · hàng chờ ghép VĐV
-------------------------------------------------------------------------------
create or replace function public.league_student_card(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'student_code', s.student_code, 'full_name', s.full_name, 'date_of_birth', s.date_of_birth,
    'birth_year', s.birth_year, 'gender', s.gender, 'verification_status', s.verification_status, 'created_at', s.created_at,
    'merged_into', s.merged_into_student_id, 'deleted', s.deleted_at is not null,
    'school', (select coalesce(sc.short_name, sc.name) from public.schools sc where sc.id = s.current_school_id),
    'event_age', (select max(ep.age_at_registration) from public.event_participations ep where ep.student_id = s.id),
    'event_year', (select max(extract(year from e.event_date))::int from public.event_participations ep join public.events e on e.id = ep.event_id where ep.student_id = s.id),
    'guardians', (select count(*) from public.student_guardians sg where sg.student_id = s.id and sg.deleted_at is null),
    'league_stages', (select count(*) from public.tournament_results r where r.student_id = s.id))
  from public.students s where s.id = p_id
$$;

create or replace function public.admin_league_queue(p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
    select jsonb_build_object('id', q.id, 'source', q.source, 'reason', q.reason, 'status', q.status, 'note', q.note,
      'created_at', q.created_at, 'resolved_at', q.resolved_at, 'payload', q.payload,
      'new_student', case when q.new_student_id is not null then public.league_student_card(q.new_student_id) end,
      'result', (select jsonb_build_object('id', r.id, 'stage_no', t.stage_no, 'played_on', t.played_on, 'raw_name', r.raw_name,
                   'club', r.club_name, 'group', r.group_name, 'points', r.points_total, 'student_id', r.student_id)
                 from public.tournament_results r join public.tournaments t on t.id = r.tournament_id where r.id = q.tournament_result_id),
      'league_ref', (select league_ref from public.league_issue_requests where id = q.issue_request_id),
      'candidates', coalesce((select jsonb_agg(public.league_student_card(c)) from unnest(q.candidate_student_ids) c), '[]')) x
    from public.league_match_queue q
    where q.deleted_at is null and (p_status = 'all' or q.status = p_status)) z), '[]');
end $$;

-- p_action: 'merged' (đã gộp bằng công cụ gộp học viên) · 'linked' (gắn dòng kết quả chưa có hồ sơ vào p_student_id)
--           'kept_new' (giữ hồ sơ mới, không phải cùng người) · 'dismissed' (bỏ qua)
create or replace function public.admin_league_resolve(p_id uuid, p_action text, p_student_id uuid default null, p_note text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare q public.league_match_queue;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.league_match_queue where id = p_id and deleted_at is null for update;
  if q.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if q.status <> 'pending' then raise exception 'already_resolved' using errcode = '22023'; end if;

  if p_action = 'merged' then
    -- Hồ sơ mới đã gộp vào hồ sơ có sẵn, hoặc ngược lại
    if q.new_student_id is null or not (
         exists (select 1 from public.students where id = q.new_student_id and merged_into_student_id is not null)
      or exists (select 1 from public.students where merged_into_student_id = q.new_student_id and id = any(q.candidate_student_ids))) then
      raise exception 'not_merged' using errcode = '22023';
    end if;
  elsif p_action = 'linked' then
    if q.new_student_id is not null then raise exception 'use_merge' using errcode = '22023'; end if;
    if q.tournament_result_id is null or p_student_id is null then raise exception 'student_required' using errcode = '22023'; end if;
    if not exists (select 1 from public.students where id = p_student_id and deleted_at is null and merged_into_student_id is null) then
      raise exception 'student_not_found' using errcode = 'P0002';
    end if;
    update public.tournament_results set student_id = p_student_id where id = q.tournament_result_id;
  elsif p_action = 'kept_new' then
    if q.new_student_id is null then raise exception 'no_new_student' using errcode = '22023'; end if;
  elsif p_action <> 'dismissed' then
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  update public.league_match_queue
  set status = p_action, resolved_by = auth.uid(), resolved_at = now(), note = nullif(btrim(coalesce(p_note, '')), '')
  where id = q.id;
end $$;

-- Học viên ẩn tên trên BXH khi phụ huynh xin tắt qua điện thoại/Zalo (K4)
create or replace function public.admin_set_league_name_hidden(p_student_id uuid, p_hidden boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.students set league_name_hidden = p_hidden where id = p_student_id;
  if not found then raise exception 'student_not_found' using errcode = 'P0002'; end if;
end $$;

do $$
declare f text;
begin
  revoke execute on function public.league_public_profile(text) from public;
  grant execute on function public.league_public_profile(text) to anon, authenticated, service_role;
  revoke execute on function public.league_student_card(uuid) from public, anon, authenticated;
  foreach f in array array['public.admin_league_queue(text)', 'public.admin_league_resolve(uuid, text, uuid, text)',
                           'public.admin_set_league_name_hidden(uuid, boolean)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
