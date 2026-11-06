-- Spec 15 bản 1.1 (mục 1b, Minh 05/11 tối) cho các hàm đã chạy từ migration 20261106000001:
--   · Không có quyền → lỗi 42501 'forbidden' (như league_student_profile), không trả null.
--   · Thẻ VĐV: phần điểm / hạng SNAG gọi lại league_student_summary (spec 14), không viết truy vấn thứ hai.
--   · Khoá ảnh đổi tên avatar_path → avatar_url (cột students.avatar_url, đường dẫn trong kho riêng tư).
--   · Mục tự động "courses": course_history status = 'approved' và deleted_at is null.
-- Các điểm khác của 1b đã đúng từ bản trước: is_guardian_of(id, false), student_accounts.is_active, nhánh từ origin/main.
--   · can_view_athlete_profile xét hồ sơ hiện hành (sau gộp), như set_scholarship_item.
-- Chỉ thay lại hàm (create or replace), không đổi bảng.

-- Quyền xét theo hồ sơ hiện hành: mở bằng id của hồ sơ đã gộp → xét hồ sơ giữ lại (như set_scholarship_item).
-- Trước đây xét id cũ nên phụ huynh của hồ sơ giữ lại bị chặn (lộ ra khi đổi null → 42501, test 037).
create or replace function public.can_view_athlete_profile(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with c as (select public.league_current_student(p_student_id) as id)
  select auth.uid() is not null and (
       public.is_guardian_of((select id from c), false)
    or exists (select 1 from public.student_accounts a where a.student_id = (select id from c) and a.user_id = auth.uid() and a.is_active)
    or public.is_admin())
$$;
revoke execute on function public.can_view_athlete_profile(uuid) from public, anon, authenticated;

create or replace function public.student_athlete_card(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_series uuid := public.league_series_id();
  v_id uuid;
  s record;
  v_level jsonb; v_stage jsonb; v_tier jsonb;
  v_league jsonb;
  c record;
  v_awards jsonb;
begin
  if not public.can_view_athlete_profile(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_id := public.league_current_student(p_student_id);
  select x.*, coalesce(sc.short_name, sc.name) as school_name into s
  from public.students x left join public.schools sc on sc.id = x.current_school_id
  where x.id = v_id and x.deleted_at is null;
  if s.id is null then return null; end if;

  -- Level / giai đoạn / hạng sổ: như trang hồ sơ đợt 1 (student_profile)
  select jsonb_build_object('id', l.id, 'number', l.number, 'name_vi', l.name_vi, 'name_en', l.name_en),
         case when ps.id is null then null else jsonb_build_object('number', ps.number, 'name_vi', ps.name_vi, 'name_en', ps.name_en, 'color', ps.color) end,
         case when t.id is null then null else jsonb_build_object('code', t.code, 'name_vi', t.name_vi, 'name_en', t.name_en) end
    into v_level, v_stage, v_tier
  from public.levels l
  left join public.passport_stages ps on ps.id = l.passport_stage_id
  left join public.passport_tiers t on t.id = l.passport_tier_id
  where l.id = s.current_level_id;
  -- Chưa có level (vd. VĐV chỉ thi giải): hạng sổ lấy theo sổ đang dùng
  if v_tier is null then
    select jsonb_build_object('code', t.code, 'name_vi', t.name_vi, 'name_en', t.name_en) into v_tier
    from public.passports p join public.passport_tiers t on t.id = p.tier_id
    where p.student_id = s.id and p.status not in ('unassigned', 'void')
    order by (p.status = 'active') desc, p.created_at desc limit 1;
  end if;

  -- Điểm / hạng SNAG: dùng lại league_student_summary (spec 14), không tính lại (spec 15 bản 1.1, mục 1b).
  -- stages_played = số chặng của mùa trong summary (B23: khớp BXH mùa); bỏ danh sách chặng (đã có ở mục Thành tích SNAG).
  v_league := public.league_student_summary(s.id);
  if v_league is not null and v_league ->> 'total_points' is not null then
    v_league := (v_league - 'stages' - 'certificates' - 'name' - 'anonymous') || jsonb_build_object('stages_played',
      (select count(*) from jsonb_array_elements(v_league -> 'stages') x where x ->> 'season' = v_league ->> 'season'));
  else
    v_league := null;
  end if;

  select count(*) filter (where r.rank_title_code = 'best_gross') as best_gross,
         count(*) filter (where r.rank_title_code = 'winner') as winner,
         count(*) filter (where r.rank_title_code like 'runner\_up\_%') as runner_up,
         count(*) filter (where cu.id is not null) as culture_awards
    into c
  from public.tournament_results r
  join public.tournaments t on t.id = r.tournament_id and t.deleted_at is null and t.series_id = v_series
  left join public.tournament_point_rules cu on cu.series_id = v_series and cu.code = r.culture_award_code
                                             and cu.kind = 'culture' and cu.counts_as_award
  where r.student_id = s.id and r.participant_kind = 'student';

  -- Mỗi danh hiệu thi đấu và mỗi giải văn hoá là một dòng riêng, mới nhất trước
  select coalesce(jsonb_agg(a.j order by a.played_on desc, a.stage_no desc, a.ord), '[]') into v_awards
  from (
    select t.played_on, t.stage_no, 0 as ord,
           jsonb_build_object('played_on', t.played_on, 'stage_no', t.stage_no, 'season', se.code, 'kind', 'rank',
                              'code', r.rank_title_code, 'name_vi', pr.name_vi, 'name_en', pr.name_en) as j
    from public.tournament_results r
    join public.tournaments t on t.id = r.tournament_id and t.deleted_at is null and t.series_id = v_series
    join public.seasons se on se.id = t.season_id
    join public.tournament_point_rules pr on pr.series_id = v_series and pr.code = r.rank_title_code and pr.kind = 'rank' and pr.counts_as_award
    where r.student_id = s.id and r.participant_kind = 'student'
    union all
    select t.played_on, t.stage_no, 1,
           jsonb_build_object('played_on', t.played_on, 'stage_no', t.stage_no, 'season', se.code, 'kind', 'culture',
                              'code', r.culture_award_code, 'name_vi', pr.name_vi, 'name_en', pr.name_en)
    from public.tournament_results r
    join public.tournaments t on t.id = r.tournament_id and t.deleted_at is null and t.series_id = v_series
    join public.seasons se on se.id = t.season_id
    join public.tournament_point_rules pr on pr.series_id = v_series and pr.code = r.culture_award_code and pr.kind = 'culture' and pr.counts_as_award
    where r.student_id = s.id and r.participant_kind = 'student'
  ) a;

  return jsonb_build_object(
    'id', s.id,
    'student_code', s.student_code,
    'full_name', s.full_name,
    'avatar_url', s.avatar_url,
    'birth_year', coalesce(s.birth_year, extract(year from s.date_of_birth)::int),
    'school', s.school_name,
    'level', v_level, 'stage', v_stage, 'passport_tier', v_tier,
    'league', v_league,
    'counts', jsonb_build_object('best_gross', c.best_gross, 'winner', c.winner, 'runner_up', c.runner_up,
                                 'culture_awards', c.culture_awards),
    'graduated', c.best_gross >= public.setting_int('league.graduation_best_gross', 3),
    'awards', v_awards);
end $$;

create or replace function public.scholarship_checklist(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
  v_courses boolean; v_comp boolean; v_culture boolean;
  v jsonb;
begin
  if not public.can_view_athlete_profile(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_id := public.league_current_student(p_student_id);
  if not exists (select 1 from public.students where id = v_id and deleted_at is null) then return null; end if;

  v_courses := exists (select 1 from public.course_history h where h.student_id = v_id and h.status = 'approved' and h.deleted_at is null);
  v_comp := exists (select 1 from public.tournament_results r where r.student_id = v_id and r.participant_kind = 'student');
  v_culture := exists (select 1 from public.tournament_results r
                       join public.tournaments t on t.id = r.tournament_id
                       join public.tournament_point_rules pr on pr.series_id = t.series_id and pr.code = r.culture_award_code
                                                            and pr.kind = 'culture' and pr.counts_as_award
                       where r.student_id = v_id and r.participant_kind = 'student');

  with it as (
    select i.*,
           case when i.auto_source is not null then 'auto' else 'guardian' end as source,
           case i.auto_source
             when 'courses' then case when v_courses then 'done' else 'not_started' end
             when 'competitions' then case when v_comp then 'done' else 'not_started' end
             when 'culture_awards' then case when v_culture then 'done' else 'not_started' end
             else coalesce(st.status, 'not_started') end as cur_status,
           case when i.auto_source is null then st.note end as cur_note,
           case when i.auto_source is null then st.updated_at end as cur_updated_at
    from public.scholarship_checklist_items i
    left join public.scholarship_checklist_status st on st.item_id = i.id and st.student_id = v_id
    where i.is_active
  ),
  stages(stage, ord) as (values ('primary', 1), ('lower_secondary', 2), ('upper_secondary', 3))
  select jsonb_agg(jsonb_build_object(
           'stage', sg.stage,
           'done_count', (select count(*) from it where it.stage = sg.stage and it.cur_status = 'done'),
           'total_count', (select count(*) from it where it.stage = sg.stage),
           'items', (select coalesce(jsonb_agg(jsonb_build_object(
                        'id', it.id, 'group', it.item_group, 'title_vi', it.title_vi, 'title_en', it.title_en,
                        'help_vi', it.help_vi, 'help_en', it.help_en,
                        'status', it.cur_status, 'source', it.source, 'note', it.cur_note, 'updated_at', it.cur_updated_at)
                      order by it.sort_order, it.title_vi), '[]')
                     from it where it.stage = sg.stage))
         order by sg.ord)
    into v
  from stages sg;

  return jsonb_build_object('student_id', v_id, 'stages', v,
                            'can_edit', public.is_guardian_of(v_id, false));
end $$;
