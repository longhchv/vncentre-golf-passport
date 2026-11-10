-- Spec 22 · bước 4: so sánh hướng, tự lên lớp 05/9 (D75), nhắc khi lên lớp (tiêu chí 6, 7, 10, 11).
--   · Ngày 05/9 (giờ VN) mỗi năm: học viên lớp 1–8, không bị đánh dấu "không tự lên lớp" năm học đó → +1 lớp.
--     Lớp 9–12: không đổi, nhắc bố mẹ xác nhận / sửa lớp. Chưa có lớp: nhắc bố mẹ bổ sung. Lớp 13: bỏ qua.
--   · Chạy lại trong cùng năm học không cộng thêm (bảng grade_promotion_runs + chỉ mục duy nhất 'auto' theo năm học).
--   · Lớp đổi (tự động hay sửa tay) → thông báo trong app: con đã lên lớp mấy + các mục vừa đến hạn. Zalo/email chờ D57.
--   · Đánh dấu "không tự lên lớp": quản lý trường của học viên hoặc admin. Admin sửa lớp hàng loạt theo trường + lớp.
--   · scholarship_roadmap thêm khối compare (không xếp hạng hướng).
-- Migration chỉ thêm (bảng, hàm mới; create or replace hàm của bước 3).

-------------------------------------------------------------------------------
-- 1. Cờ "không tự lên lớp" theo năm học + nhật ký mỗi lần chạy
-------------------------------------------------------------------------------
create table public.grade_promotion_holds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  school_year text not null check (school_year ~ '^\d{4}-\d{4}$'),
  note text check (note is null or char_length(note) <= 300),
  set_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, school_year)
);
create trigger set_updated_at before update on public.grade_promotion_holds for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.grade_promotion_holds for each row execute function public.audit_row();
alter table public.grade_promotion_holds enable row level security;
create policy admin_read on public.grade_promotion_holds for select to authenticated using (public.is_admin());
revoke all on public.grade_promotion_holds from anon;

create table public.grade_promotion_runs (
  school_year text primary key check (school_year ~ '^\d{4}-\d{4}$'),
  ran_on date not null,
  stats jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.grade_promotion_runs enable row level security;
create policy admin_read on public.grade_promotion_runs for select to authenticated using (public.is_admin());
revoke all on public.grade_promotion_runs from anon;

-- Ngày hôm nay theo giờ Việt Nam (pg_cron và now() chạy giờ UTC)
create or replace function public.vn_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

-------------------------------------------------------------------------------
-- 2. Thông báo khi lớp đổi: mục chung + hướng đang chọn có start_grade trong (lớp cũ, lớp mới], chưa xong
-------------------------------------------------------------------------------
create or replace function public.notify_grade_changed(p_student_id uuid, p_prev int, p_new int)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_name text; v_list_vi text; v_list_en text; v_n int;
begin
  select full_name into v_name from public.students where id = p_student_id;
  select count(*), string_agg('• ' || i.title_vi, E'\n' order by i.start_grade, i.sort_order),
         string_agg('• ' || i.title_en, E'\n' order by i.start_grade, i.sort_order)
    into v_n, v_list_vi, v_list_en
  from public.scholarship_checklist_items i
  left join public.scholarship_checklist_status st on st.item_id = i.id and st.student_id = p_student_id
  where i.is_active and i.start_grade > coalesce(p_prev, 0) and i.start_grade <= p_new
    and coalesce(st.status, 'not_started') <> 'done'
    and (i.track = 'common' or i.track in (select track from public.student_scholarship_tracks
                                           where student_id = p_student_id and removed_at is null));
  perform public.notify_student_guardians(p_student_id, 'grade_changed',
    v_name || ' đã lên lớp ' || p_new, v_name || ' is now in grade ' || p_new,
    case when v_n > 0 then 'Việc vừa đến hạn trong Hành trang học bổng (' || v_n || '):' || E'\n' || v_list_vi
         else 'Không có việc mới đến hạn trong Hành trang học bổng.' end,
    case when v_n > 0 then 'Newly due in the scholarship roadmap (' || v_n || '):' || E'\n' || v_list_en
         else 'Nothing newly due in the scholarship roadmap.' end,
    '/app/children/' || p_student_id || '#athlete-scholarship');
end $$;

-- Sửa lớp (bước 3) + thông báo khi lớp tăng
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
    values (v_id, public.school_year_of(public.vn_today()), s.current_grade, p_grade, v_source, auth.uid());
    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
    values (auth.uid(), 'student_grade_set', 'students', v_id,
            jsonb_build_object('current_grade', s.current_grade),
            jsonb_build_object('current_grade', p_grade, 'source', v_source));
    if p_grade > coalesce(s.current_grade, 0) then
      perform public.notify_grade_changed(v_id, s.current_grade, p_grade);
    end if;
  end if;
  return jsonb_build_object('student_id', v_id, 'current_grade', p_grade, 'previous_grade', s.current_grade);
end $$;

-------------------------------------------------------------------------------
-- 3. Đánh dấu "không tự lên lớp" (ở lại / vượt lớp) cho năm học sắp tới hoặc đang chạy
-------------------------------------------------------------------------------
create or replace function public.set_grade_promotion_hold(p_student_id uuid, p_school_year text, p_hold boolean, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := public.league_current_student(p_student_id);
  s public.students;
begin
  select * into s from public.students where id = v_id and deleted_at is null;
  if auth.uid() is null or s.id is null or not (public.is_admin()
     or (s.current_school_id is not null and public.is_school_manager_of(s.current_school_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_school_year is null or p_school_year !~ '^\d{4}-\d{4}$' then raise exception 'invalid_school_year' using errcode = '22023'; end if;
  if p_hold then
    insert into public.grade_promotion_holds (student_id, school_year, note, set_by)
    values (v_id, p_school_year, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    on conflict (student_id, school_year) do update set note = excluded.note, set_by = excluded.set_by;
  else
    delete from public.grade_promotion_holds where student_id = v_id and school_year = p_school_year;
  end if;
  return jsonb_build_object('student_id', v_id, 'school_year', p_school_year, 'hold', p_hold);
end $$;

-- Admin sửa hàng loạt: mọi học viên của trường đang ở lớp p_from → lớp p_to. Trả số học viên đã đổi.
create or replace function public.admin_bulk_set_grade(p_school_id uuid, p_from int, p_to int)
returns int language plpgsql volatile security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from not between 1 and 13 or p_to not between 1 and 13 then raise exception 'invalid_grade' using errcode = '22023'; end if;
  for r in select id from public.students
           where current_school_id = p_school_id and current_grade = p_from and deleted_at is null and merged_into_student_id is null loop
    perform public.set_student_grade(r.id, p_to);
    n := n + 1;
  end loop;
  return n;
end $$;

-------------------------------------------------------------------------------
-- 4. Tự lên lớp. Chỉ chạy từ 05/9 đến hết tháng 9 (giờ VN); mỗi năm học một lần.
-------------------------------------------------------------------------------
create or replace function public.promote_grades(p_today date default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, public.vn_today());
  v_year text := public.school_year_of(v_today);
  r record;
  v_promoted int := 0; v_held int := 0; v_confirm int := 0; v_missing int := 0;
  v_stats jsonb;
begin
  if extract(month from v_today) <> 9 or extract(day from v_today) < 5 then
    return jsonb_build_object('skipped', 'not_promotion_window', 'date', v_today);
  end if;
  if exists (select 1 from public.grade_promotion_runs where school_year = v_year) then
    return jsonb_build_object('skipped', 'already_ran', 'school_year', v_year);
  end if;

  -- Lớp 1–8: mọi học viên. Nhắc (lớp ≥ 9 / chưa có lớp): chỉ học viên có phụ huynh đang liên kết.
  for r in select s.id, s.current_grade from public.students s
           where s.deleted_at is null and s.merged_into_student_id is null
             and (s.current_grade between 1 and 8
                  or exists (select 1 from public.student_guardians sg
                             where sg.student_id = s.id and sg.status = 'active' and sg.deleted_at is null))
           order by s.id loop
    if r.current_grade between 1 and 8 then
      if exists (select 1 from public.grade_promotion_holds h where h.student_id = r.id and h.school_year = v_year) then
        v_held := v_held + 1;
      elsif not exists (select 1 from public.student_grade_history h where h.student_id = r.id and h.school_year = v_year and h.source = 'auto') then
        update public.students set current_grade = r.current_grade + 1 where id = r.id;
        insert into public.student_grade_history (student_id, school_year, previous_grade, grade, source)
        values (r.id, v_year, r.current_grade, r.current_grade + 1, 'auto');
        perform public.notify_grade_changed(r.id, r.current_grade, r.current_grade + 1);
        v_promoted := v_promoted + 1;
      end if;
    elsif r.current_grade between 9 and 12 then
      perform public.notify_student_guardians(r.id, 'grade_confirm',
        'Xác nhận lớp năm học ' || v_year, 'Confirm the grade for ' || v_year,
        'Từ lớp 9, app không tự lên lớp. Bố mẹ xác nhận hoặc sửa lớp hiện tại của con để Hành trang học bổng nhắc đúng việc.',
        'From grade 9 the app does not move grades automatically. Please confirm or update your child''s current grade.',
        '/app/children/' || r.id || '#athlete-scholarship');
      v_confirm := v_confirm + 1;
    elsif r.current_grade is null then
      perform public.notify_student_guardians(r.id, 'grade_missing',
        'Bổ sung lớp hiện tại của con', 'Add your child''s current grade',
        'App chưa biết con đang học lớp mấy. Thêm lớp để Hành trang học bổng sắp việc theo đúng thời điểm.',
        'The app does not know your child''s grade yet. Add it so the scholarship roadmap is timed correctly.',
        '/app/children/' || r.id || '#athlete-scholarship');
      v_missing := v_missing + 1;
    end if;
  end loop;

  v_stats := jsonb_build_object('promoted', v_promoted, 'held', v_held, 'confirm_reminders', v_confirm, 'missing_reminders', v_missing);
  insert into public.grade_promotion_runs (school_year, ran_on, stats) values (v_year, v_today, v_stats);
  insert into public.audit_logs (action, entity_type, after)
  values ('grade_promotion_run', 'students', v_stats || jsonb_build_object('school_year', v_year, 'date', v_today));
  return v_stats || jsonb_build_object('school_year', v_year);
end $$;

-- 17:00 UTC ngày 04/9 = 00:00 ngày 05/9 giờ VN
select cron.schedule('promote-grades', '0 17 4 9 *', 'select public.promote_grades()');

-------------------------------------------------------------------------------
-- 5. Lộ trình + so sánh hướng. compare: mỗi hướng đang chọn — mục đến hạn (chung + hướng), đã xong, %, còn thiếu,
-- mục tiếp theo (mục chưa xong có start_grade nhỏ nhất). Chưa có lớp → compare rỗng. Không xếp hạng.
-------------------------------------------------------------------------------
create or replace function public.scholarship_roadmap(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
  v_grade int;
  v_courses boolean; v_comp boolean; v_culture boolean;
  v_tracks text[];
  v_items jsonb;
  v_compare jsonb;
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

  with rm as (
    select i.*, a.auto_done,
           case when a.auto_done then 'done' else coalesce(st.status, 'not_started') end as cur_status,
           st.note, st.updated_at as saved_at
    from public.scholarship_checklist_items i
    cross join lateral (select coalesce(case i.auto_source when 'courses' then v_courses when 'competitions' then v_comp
                                                           when 'culture_awards' then v_culture end, false) as auto_done) a
    left join public.scholarship_checklist_status st on st.item_id = i.id and st.student_id = v_id
    where i.is_active and (i.track = 'common' or i.track = any (v_tracks))
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
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
            order by start_grade, sort_order), '[]') from rm),
    case when v_grade is null then '[]'::jsonb else
    (select coalesce(jsonb_agg(jsonb_build_object(
              'track', tr,
              'due_count', (select count(*) from rm x where (x.track = 'common' or x.track = tr) and x.start_grade <= v_grade),
              'done_count', (select count(*) from rm x where (x.track = 'common' or x.track = tr) and x.start_grade <= v_grade and x.cur_status = 'done'),
              'missing_count', (select count(*) from rm x where (x.track = 'common' or x.track = tr) and x.start_grade <= v_grade and x.cur_status <> 'done'),
              'pct', (select case when count(*) = 0 then null
                                  else round(100.0 * count(*) filter (where x.cur_status = 'done') / count(*))::int end
                      from rm x where (x.track = 'common' or x.track = tr) and x.start_grade <= v_grade),
              'next', (select jsonb_build_object('code', n.code, 'title_vi', n.title_vi, 'title_en', n.title_en, 'start_grade', n.start_grade)
                       from rm n where (n.track = 'common' or n.track = tr) and n.cur_status <> 'done'
                       order by n.start_grade, (n.track = 'common'), n.sort_order limit 1))
            order by tr), '[]') from unnest(v_tracks) tr) end
    into v_items, v_compare;

  return jsonb_build_object('student_id', v_id, 'current_grade', v_grade, 'tracks', to_jsonb(v_tracks),
                            'can_edit', public.is_guardian_of(v_id, false), 'items', v_items, 'compare', v_compare);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_grade_promotion_hold(uuid, text, boolean, text)', 'public.admin_bulk_set_grade(uuid, int, int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.promote_grades(date)', 'public.notify_grade_changed(uuid, int, int)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
