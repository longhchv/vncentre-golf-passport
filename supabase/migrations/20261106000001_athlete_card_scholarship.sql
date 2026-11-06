-- Spec 15 · bước 1: Thẻ VĐV + Giải thưởng (hàm đọc, không bảng mới) và Hành trang học bổng (2 bảng + 2 hàm).
-- Quyết định anh Long 06/11/2026 (B23, phụ lục D):
--   · "Phụ huynh đang gắn" = đã xác nhận: is_guardian_of(id, false); phụ huynh chờ xác nhận không xem, không sửa.
--   · Thẻ VĐV: tổng điểm · hạng · số chặng đều của mùa gần nhất (league_standings.stages_played), giao diện ghi rõ mùa.
--   · counts.runner_up gộp runner_up_1 … runner_up_4.
--   · Chỉ mã có tournament_point_rules.counts_as_award mới là giải (style_bonus = false).
--   · Ảnh: students.avatar_url là đường dẫn trong kho riêng tư → trả avatar_path, giao diện xin link có hạn (như student_profile).
--   · updated_by trỏ profiles(user_id) như các bảng khác.
-- Migration chỉ thêm: bảng mới, hàm mới. Không sửa league_public_profile.

-------------------------------------------------------------------------------
-- Mã nào được tính là giải thưởng / danh hiệu (Thẻ VĐV, khối Giải thưởng, checklist "Giải văn hoá").
-- Anh Long 06/11: "Điểm thưởng Phong cách" (style_bonus) chỉ là điểm cộng, không phải giải. Admin chỉnh được.
-------------------------------------------------------------------------------
alter table public.tournament_point_rules add column if not exists counts_as_award boolean not null default true;
update public.tournament_point_rules set counts_as_award = false where code in ('participation', 'style_bonus');

-------------------------------------------------------------------------------
-- Ai được xem Thẻ VĐV / checklist: phụ huynh đã xác nhận, chính học viên, admin
-------------------------------------------------------------------------------
create or replace function public.can_view_athlete_profile(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
       public.is_guardian_of(p_student_id, false)
    or exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)
    or public.is_admin())
$$;

-------------------------------------------------------------------------------
-- 3.1 Thẻ VĐV + Giải thưởng. Không quyền → null. Không trả ngày sinh đầy đủ, liên hệ phụ huynh.
-------------------------------------------------------------------------------
create or replace function public.student_athlete_card(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_series uuid := public.league_series_id();
  v_id uuid;
  s record;
  v_level jsonb; v_stage jsonb; v_tier jsonb;
  st record;
  c record;
  v_awards jsonb;
begin
  if not public.can_view_athlete_profile(p_student_id) then return null; end if;
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

  -- Mùa gần nhất có hạng (giống league_public_profile)
  select l.total_points, l.rank, l.tied, l.players, l.stages_played,
         se.code as season_code, se.name_vi as season_vi, se.name_en as season_en
    into st
  from public.league_standings l join public.seasons se on se.id = l.season_id
  where l.series_id = v_series and l.student_id = s.id
  order by se.start_date desc limit 1;

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
    'avatar_path', s.avatar_url,
    'birth_year', coalesce(s.birth_year, extract(year from s.date_of_birth)::int),
    'school', s.school_name,
    'level', v_level, 'stage', v_stage, 'passport_tier', v_tier,
    'league', case when st.total_points is null then null else jsonb_build_object(
      'season', st.season_code, 'season_vi', st.season_vi, 'season_en', st.season_en,
      'total_points', st.total_points, 'rank', st.rank, 'tied', st.tied, 'players', st.players,
      'stages_played', st.stages_played) end,
    'counts', jsonb_build_object('best_gross', c.best_gross, 'winner', c.winner, 'runner_up', c.runner_up,
                                 'culture_awards', c.culture_awards),
    'graduated', c.best_gross >= public.setting_int('league.graduation_best_gross', 3),
    'awards', v_awards);
end $$;

-------------------------------------------------------------------------------
-- 3.2 Hành trang học bổng
-------------------------------------------------------------------------------
create table public.scholarship_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  stage text not null check (stage in ('primary', 'lower_secondary', 'upper_secondary')),
  item_group text not null check (item_group in ('golf', 'academic', 'personal')),
  title_vi text not null check (btrim(title_vi) <> ''),
  title_en text not null check (btrim(title_en) <> ''),
  help_vi text,
  help_en text,
  auto_source text check (auto_source in ('courses', 'competitions', 'culture_awards')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage, title_vi)
);

create table public.scholarship_checklist_status (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  item_id uuid not null references public.scholarship_checklist_items(id),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  note text check (note is null or char_length(note) <= 500),
  updated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, item_id)
);

create trigger set_updated_at before update on public.scholarship_checklist_items for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.scholarship_checklist_status for each row execute function public.set_updated_at();
-- Danh mục do admin sửa: nhật ký tự động. Trạng thái: nhật ký ghi trong set_scholarship_item (action scholarship_item_set).
create trigger audit_row after insert or update or delete on public.scholarship_checklist_items for each row execute function public.audit_row();

alter table public.scholarship_checklist_items enable row level security;
alter table public.scholarship_checklist_status enable row level security;
create policy admin_all on public.scholarship_checklist_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Trạng thái: admin chỉ đọc; không ai ghi thẳng (mọi thao tác qua hàm)
create policy admin_read on public.scholarship_checklist_status for select to authenticated using (public.is_admin());
revoke all on public.scholarship_checklist_items from anon;
revoke all on public.scholarship_checklist_status from anon;

-- 3.3 Danh mục ban đầu (docs/spec/data/scholarship-checklist.csv), sort_order theo thứ tự dòng
insert into public.scholarship_checklist_items (stage, item_group, title_vi, title_en, auto_source, sort_order)
values
  ('primary', 'golf', 'Lộ trình chương trình golf đã học, level', 'Golf programmes completed and level', 'courses', 1),
  ('primary', 'golf', 'Thành tích giải trong hệ thống VN Centre', 'Results in VN Centre events', 'competitions', 2),
  ('primary', 'golf', 'Giải văn hoá – tinh thần', 'Spirit and etiquette awards', 'culture_awards', 3),
  ('primary', 'golf', 'Thành tích giải ngoài (VGA Junior Tour…)', 'Results in external events (VGA Junior Tour…)', null, 4),
  ('primary', 'academic', 'Học bạ / bảng điểm từng năm', 'School reports for each year', null, 5),
  ('primary', 'academic', 'Chứng chỉ tiếng Anh (Cambridge…)', 'English certificates (Cambridge…)', null, 6),
  ('primary', 'personal', 'Hoạt động ngoại khoá, thiện nguyện', 'Extracurricular and volunteer activities', null, 7),
  ('lower_secondary', 'golf', 'Handicap chính thức (WHS)', 'Official handicap (WHS)', null, 8),
  ('lower_secondary', 'golf', 'Video swing định kỳ 6 tháng (link YouTube)', 'Swing video every 6 months (YouTube link)', null, 9),
  ('lower_secondary', 'golf', 'Giải tính điểm WAGR', 'WAGR-counting events', null, 10),
  ('lower_secondary', 'academic', 'Chứng chỉ IELTS / TOEFL', 'IELTS / TOEFL certificate', null, 11),
  ('upper_secondary', 'academic', 'Bảng điểm dịch thuật công chứng từ lớp 9', 'Certified translated transcripts from Grade 9', null, 12),
  ('upper_secondary', 'academic', 'SAT / ACT (nếu trường yêu cầu)', 'SAT / ACT (if required)', null, 13),
  ('upper_secondary', 'academic', 'Đăng ký NCAA Eligibility Center', 'NCAA Eligibility Center registration', null, 14),
  ('upper_secondary', 'personal', 'Thư giới thiệu (HLV, giáo viên)', 'Recommendation letters (coach, teacher)', null, 15),
  ('upper_secondary', 'personal', 'Golf resume 1 trang', 'One-page golf resume', null, 16),
  ('upper_secondary', 'personal', 'Danh sách trường mục tiêu, liên hệ HLV đại học', 'Target colleges and college coach contacts', null, 17)
on conflict (stage, title_vi) do nothing;

-------------------------------------------------------------------------------
-- Checklist của một học viên: 3 cấp, mỗi cấp danh sách mục + done_count / total_count. Không quyền → null.
-- Mục auto_source: trạng thái tính lúc đọc, không lưu.
-------------------------------------------------------------------------------
create or replace function public.scholarship_checklist(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
  v_courses boolean; v_comp boolean; v_culture boolean;
  v jsonb;
begin
  if not public.can_view_athlete_profile(p_student_id) then return null; end if;
  v_id := public.league_current_student(p_student_id);
  if not exists (select 1 from public.students where id = v_id and deleted_at is null) then return null; end if;

  v_courses := exists (select 1 from public.course_history h where h.student_id = v_id and h.status = 'approved');
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

-------------------------------------------------------------------------------
-- Phụ huynh đã xác nhận đổi trạng thái / ghi chú một mục (không phải mục tự động). Ghi audit_logs.
-------------------------------------------------------------------------------
create or replace function public.set_scholarship_item(p_student_id uuid, p_item_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := public.league_current_student(p_student_id);
  i public.scholarship_checklist_items;
  v_before public.scholarship_checklist_status;
  v_after public.scholarship_checklist_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not public.is_guardian_of(v_id, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into i from public.scholarship_checklist_items where id = p_item_id and is_active;
  if i.id is null then raise exception 'item_not_found' using errcode = 'P0002'; end if;
  if i.auto_source is not null then raise exception 'auto_item' using errcode = '22023'; end if;
  if p_status is null or p_status not in ('not_started', 'in_progress', 'done') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then raise exception 'note_too_long' using errcode = '22023'; end if;

  select * into v_before from public.scholarship_checklist_status where student_id = v_id and item_id = i.id;
  insert into public.scholarship_checklist_status (student_id, item_id, status, note, updated_by)
  values (v_id, i.id, p_status, v_note, auth.uid())
  on conflict (student_id, item_id) do update
    set status = excluded.status, note = excluded.note, updated_by = excluded.updated_by
  returning * into v_after;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'scholarship_item_set', 'scholarship_checklist_status', v_after.id,
          case when v_before.id is null then null else jsonb_build_object('status', v_before.status, 'note', v_before.note) end,
          jsonb_build_object('student_id', v_id, 'item_id', i.id, 'status', v_after.status, 'note', v_after.note));

  return jsonb_build_object('item_id', i.id, 'status', v_after.status, 'note', v_after.note, 'updated_at', v_after.updated_at);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.student_athlete_card(uuid)', 'public.scholarship_checklist(uuid)', 'public.set_scholarship_item(uuid, uuid, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  execute 'revoke execute on function public.can_view_athlete_profile(uuid) from public, anon, authenticated';
end $$;
