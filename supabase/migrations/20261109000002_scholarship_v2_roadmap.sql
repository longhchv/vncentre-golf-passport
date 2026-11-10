-- Spec 22 · bước 3: chọn hướng + checklist theo lớp (tiêu chí 4, 5, 8). Mapping: docs/spec/22-mapping.md mục 3–5 (Q3, Q6, Q7).
--   · students.current_grade (số, 1–13; 13 = sau tốt nghiệp). current_grade_class (chữ, vd. "5A1") giữ nguyên, không tự sửa.
--   · student_grade_history: mỗi lần đổi lớp một dòng, theo năm học dạng 'YYYY-YYYY' (năm học mới tính từ 05/9).
--   · set_student_grade: phụ huynh đã xác nhận / quản lý trường của học viên / admin; ghi audit_logs.
--     Thông báo khi lên lớp, tự lên lớp 05/9, cờ "không tự lên lớp": bước 4.
--   · set_scholarship_tracks: phụ huynh đã xác nhận; bỏ chọn = removed_at, không xoá; trạng thái mục không bị đụng.
--   · scholarship_roadmap: mục chung + hướng đang chọn, chia now / upcoming / later / done theo lớp hiện tại.
-- Migration chỉ thêm.

-------------------------------------------------------------------------------
-- 1. Lớp hiện tại dạng số + lịch sử
-------------------------------------------------------------------------------
alter table public.students add column if not exists current_grade smallint check (current_grade between 1 and 13);

-- Nạp từ current_grade_class nếu đọc được số lớp ở đầu ("5A1", "10A2", "Lớp 3B"); không đọc được → để trống, nhắc bố mẹ.
update public.students
set current_grade = substring(current_grade_class from '^\s*(?:[Ll]ớp\s*)?(1[0-2]|[1-9])(?:\D|$)')::smallint
where current_grade is null and current_grade_class ~ '^\s*(?:[Ll]ớp\s*)?(1[0-2]|[1-9])(?:\D|$)';

-- Năm học chứa ngày d; năm học mới bắt đầu 05/9 (ngày tự lên lớp, D75)
create or replace function public.school_year_of(d date)
returns text language sql immutable as $$
  select case when d >= make_date(extract(year from d)::int, 9, 5)
              then extract(year from d)::int || '-' || (extract(year from d)::int + 1)
              else (extract(year from d)::int - 1) || '-' || extract(year from d)::int end
$$;

create table public.student_grade_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  school_year text not null check (school_year ~ '^\d{4}-\d{4}$'),
  previous_grade smallint check (previous_grade between 1 and 13),
  grade smallint not null check (grade between 1 and 13),
  source text not null check (source in ('auto', 'guardian', 'school', 'admin', 'backfill')),
  changed_by uuid references public.profiles(user_id) on delete set null,
  merge_trail uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index student_grade_history_student_idx on public.student_grade_history (student_id, created_at desc);
-- Tự lên lớp tối đa một lần mỗi năm học (tiêu chí 11, bước 4)
create unique index student_grade_history_auto_once on public.student_grade_history (student_id, school_year) where source = 'auto';
alter table public.student_grade_history enable row level security;
create policy admin_read on public.student_grade_history for select to authenticated using (public.is_admin());
revoke all on public.student_grade_history from anon;

insert into public.student_grade_history (student_id, school_year, grade, source)
select id, public.school_year_of(current_date), current_grade, 'backfill'
from public.students where current_grade is not null and deleted_at is null;

-- Gộp học viên: lịch sử lớp của hồ sơ bị gộp chuyển sang hồ sơ giữ lại (trừ dòng 'auto' trùng năm), hoàn tác thì trả về
create or replace function public.grade_history_follow_student_merge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.merged_into_student_id is null and new.merged_into_student_id is not null then
    update public.student_grade_history h
    set student_id = new.merged_into_student_id, merge_trail = h.merge_trail || old.id
    where h.student_id = old.id
      and not (h.source = 'auto' and exists (select 1 from public.student_grade_history k where k.student_id = new.merged_into_student_id
                                              and k.school_year = h.school_year and k.source = 'auto'));
  elsif old.merged_into_student_id is not null and new.merged_into_student_id is null then
    update public.student_grade_history
    set student_id = old.id, merge_trail = merge_trail[1:cardinality(merge_trail) - 1]
    where merge_trail[cardinality(merge_trail)] = old.id;
  end if;
  return null;
end $$;
create trigger grade_history_follow_student_merge after update of merged_into_student_id on public.students
  for each row execute function public.grade_history_follow_student_merge();
revoke execute on function public.grade_history_follow_student_merge() from public, anon, authenticated;

-------------------------------------------------------------------------------
-- 2. Sửa lớp: phụ huynh đã xác nhận, quản lý trường của học viên, admin. Mọi lần sửa ghi audit_logs.
-------------------------------------------------------------------------------
create or replace function public.set_student_grade(p_student_id uuid, p_grade int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := public.league_current_student(p_student_id);
  s public.students;
  v_source text;
begin
  select * into s from public.students where id = v_id and deleted_at is null;
  if auth.uid() is null or s.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_source := case when public.is_guardian_of(v_id, false) then 'guardian'
                   when public.is_admin() then 'admin'
                   when s.current_school_id is not null and public.is_school_manager_of(s.current_school_id) then 'school' end;
  if v_source is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_grade is null or p_grade not between 1 and 13 then raise exception 'invalid_grade' using errcode = '22023'; end if;

  if s.current_grade is distinct from p_grade then
    update public.students set current_grade = p_grade where id = v_id;
    insert into public.student_grade_history (student_id, school_year, previous_grade, grade, source, changed_by)
    values (v_id, public.school_year_of(current_date), s.current_grade, p_grade, v_source, auth.uid());
    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
    values (auth.uid(), 'student_grade_set', 'students', v_id,
            jsonb_build_object('current_grade', s.current_grade),
            jsonb_build_object('current_grade', p_grade, 'source', v_source));
  end if;
  return jsonb_build_object('student_id', v_id, 'current_grade', p_grade, 'previous_grade', s.current_grade);
end $$;

-------------------------------------------------------------------------------
-- 3. Chọn hướng (nhiều). Hướng không có trong danh sách → removed_at; chọn lại → bỏ removed_at. Trạng thái mục giữ nguyên.
-------------------------------------------------------------------------------
create or replace function public.set_scholarship_tracks(p_student_id uuid, p_tracks text[])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := public.league_current_student(p_student_id);
  v_tracks text[] := (select coalesce(array_agg(distinct t order by t), '{}') from unnest(coalesce(p_tracks, '{}')) t);
begin
  if auth.uid() is null or not public.is_guardian_of(v_id, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not v_tracks <@ array['us', 'uk', 'au', 'asia', 'vn', 'hs', 'career'] then
    raise exception 'invalid_track' using errcode = '22023';
  end if;

  update public.student_scholarship_tracks set removed_at = now()
  where student_id = v_id and removed_at is null and not (track = any (v_tracks));
  insert into public.student_scholarship_tracks (student_id, track, chosen_by)
  select v_id, t, auth.uid() from unnest(v_tracks) t
  on conflict (student_id, track) do update
    set removed_at = null, chosen_at = now(), chosen_by = excluded.chosen_by
    where student_scholarship_tracks.removed_at is not null;

  return jsonb_build_object('student_id', v_id, 'tracks', to_jsonb(v_tracks));
end $$;

-------------------------------------------------------------------------------
-- 4. Lộ trình của một học viên. Quyền như scholarship_checklist (không quyền → 42501). Không trả source_ref.
-- bucket: done · now (start_grade ≤ lớp) · upcoming (1–2 năm tới) · later (xa hơn); chưa có lớp → null (giao diện chia theo cấp).
-- Chưa chọn hướng → chỉ mục chung (giao diện mời chọn hướng).
-------------------------------------------------------------------------------
create or replace function public.scholarship_roadmap(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
  v_grade int;
  v_courses boolean; v_comp boolean; v_culture boolean;
  v_tracks text[];
  v_items jsonb;
begin
  if not public.can_view_athlete_profile(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_id := public.league_current_student(p_student_id);
  select current_grade into v_grade from public.students where id = v_id and deleted_at is null;
  if not found then return null; end if;

  v_courses := exists (select 1 from public.course_history h where h.student_id = v_id and h.status = 'approved' and h.deleted_at is null);
  v_comp := exists (select 1 from public.tournament_results r where r.student_id = v_id and r.participant_kind = 'student');
  v_culture := exists (select 1 from public.tournament_results r
                       join public.tournaments t on t.id = r.tournament_id
                       join public.tournament_point_rules pr on pr.series_id = t.series_id and pr.code = r.culture_award_code
                                                            and pr.kind = 'culture' and pr.counts_as_award
                       where r.student_id = v_id and r.participant_kind = 'student');
  select coalesce(array_agg(track order by track), '{}') into v_tracks
  from public.student_scholarship_tracks where student_id = v_id and removed_at is null;

  with it as (
    select i.*,
           coalesce(case i.auto_source when 'courses' then v_courses when 'competitions' then v_comp
                                       when 'culture_awards' then v_culture end, false) as auto_done,
           st.status as saved_status, st.note, st.updated_at as saved_at
    from public.scholarship_checklist_items i
    left join public.scholarship_checklist_status st on st.item_id = i.id and st.student_id = v_id
    where i.is_active and (i.track = 'common' or i.track = any (v_tracks))
  ), it2 as (
    select it.*, case when auto_done then 'done' else coalesce(saved_status, 'not_started') end as cur_status from it
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'code', code, 'track', track, 'group', item_group, 'stage', stage,
           'title_vi', title_vi, 'title_en', title_en, 'help_vi', help_vi, 'help_en', help_en,
           'start_grade', start_grade, 'start_note_vi', start_note_vi, 'start_note_en', start_note_en,
           'has_deadline', has_deadline, 'is_verified', is_verified,
           'status', cur_status, 'source', case when auto_source is not null then 'auto' else 'guardian' end,
           'auto_done', auto_done, 'note', note, 'updated_at', saved_at,
           'bucket', case when cur_status = 'done' then 'done'
                          when v_grade is null then null
                          when start_grade <= v_grade then 'now'
                          when start_grade <= v_grade + 2 then 'upcoming'
                          else 'later' end)
         order by start_grade, sort_order), '[]')
    into v_items
  from it2;

  return jsonb_build_object('student_id', v_id, 'current_grade', v_grade, 'tracks', to_jsonb(v_tracks),
                            'can_edit', public.is_guardian_of(v_id, false), 'items', v_items);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_student_grade(uuid, int)', 'public.set_scholarship_tracks(uuid, text[])', 'public.scholarship_roadmap(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
