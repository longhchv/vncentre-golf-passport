-- Spec 22 · bước 5: màn hình admin + nhà trường.
--   · next_promotion_school_year(): năm học của lần tự lên lớp sắp tới (cờ "không tự lên lớp" đặt cho năm này).
--   · school_grade_roster(trường): danh sách học viên, lớp hiện tại, cờ năm sắp tới — quản lý trường đó hoặc admin.
--   · scholarship_admin_stats(): số học viên theo hướng; tỉ lệ hoàn thành mục đến hạn theo lớp — chỉ admin.
-- Migration chỉ thêm (hàm mới).

-- Đang trong khung 05/9–30/9 mà năm học này chưa chạy → năm học này; còn lại → năm học bắt đầu ở 05/9 kế tiếp.
create or replace function public.next_promotion_school_year()
returns text language sql stable security definer set search_path = public as $$
  select case
    when extract(month from public.vn_today()) = 9 and extract(day from public.vn_today()) >= 5
         and not exists (select 1 from public.grade_promotion_runs where school_year = public.school_year_of(public.vn_today()))
      then public.school_year_of(public.vn_today())
    when public.vn_today() < make_date(extract(year from public.vn_today())::int, 9, 5)
      then public.school_year_of(make_date(extract(year from public.vn_today())::int, 9, 5))
    else public.school_year_of(make_date(extract(year from public.vn_today())::int + 1, 9, 5)) end
$$;

create or replace function public.school_grade_roster(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_year text := public.next_promotion_school_year();
begin
  if auth.uid() is null or not (public.is_admin() or public.is_school_manager_of(p_school_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'school_year', v_year,
    'students', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', s.id, 'student_code', s.student_code, 'full_name', s.full_name,
                   'current_grade', s.current_grade, 'grade_class', s.current_grade_class,
                   'hold', h.id is not null, 'hold_note', h.note)
                 order by s.current_grade nulls last, s.full_name_normalized), '[]')
                 from public.students s
                 left join public.grade_promotion_holds h on h.student_id = s.id and h.school_year = v_year
                 where s.current_school_id = p_school_id and s.deleted_at is null and s.merged_into_student_id is null));
end $$;

-- Thống kê cho admin. Mục đến hạn của một học viên: mục chung + hướng đang chọn, start_grade ≤ lớp hiện tại;
-- xong = trạng thái đã lưu 'done' hoặc nguồn tự động có dữ liệu.
create or replace function public.scholarship_admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  with st as (
    select s.id, s.current_grade,
           exists (select 1 from public.course_history h where h.student_id = s.id and h.status = 'approved' and h.deleted_at is null) as a_courses,
           exists (select 1 from public.tournament_results r where r.student_id = s.id and r.participant_kind = 'student') as a_comp,
           exists (select 1 from public.tournament_results r join public.tournaments t on t.id = r.tournament_id
                   join public.tournament_point_rules pr on pr.series_id = t.series_id and pr.code = r.culture_award_code
                                                        and pr.kind = 'culture' and pr.counts_as_award
                   where r.student_id = s.id and r.participant_kind = 'student') as a_culture
    from public.students s
    where s.deleted_at is null and s.merged_into_student_id is null and s.current_grade is not null
  ), due as (
    select st.id, st.current_grade,
           (coalesce(x.status, 'not_started') = 'done'
            or (i.auto_source = 'courses' and st.a_courses) or (i.auto_source = 'competitions' and st.a_comp)
            or (i.auto_source = 'culture_awards' and st.a_culture)) as is_done
    from st
    join public.scholarship_checklist_items i on i.is_active and i.start_grade <= st.current_grade
      and (i.track = 'common' or i.track in (select t.track from public.student_scholarship_tracks t
                                            where t.student_id = st.id and t.removed_at is null))
    left join public.scholarship_checklist_status x on x.student_id = st.id and x.item_id = i.id
  )
  select jsonb_build_object(
    'students_total', (select count(*) from public.students where deleted_at is null and merged_into_student_id is null),
    'students_with_grade', (select count(*) from st),
    'students_with_tracks', (select count(distinct t.student_id) from public.student_scholarship_tracks t
                             join public.students s on s.id = t.student_id and s.deleted_at is null and s.merged_into_student_id is null
                             where t.removed_at is null),
    'by_track', (select coalesce(jsonb_agg(jsonb_build_object('track', tr, 'students', n) order by tr), '[]') from (
                   select t.track as tr, count(*) as n from public.student_scholarship_tracks t
                   join public.students s on s.id = t.student_id and s.deleted_at is null and s.merged_into_student_id is null
                   where t.removed_at is null group by t.track) a),
    'by_grade', (select coalesce(jsonb_agg(jsonb_build_object('grade', g, 'students', n, 'due', d, 'done', k,
                                                             'pct', case when d = 0 then null else round(100.0 * k / d)::int end)
                                           order by g), '[]') from (
                   select st.current_grade as g, count(*) as n,
                          coalesce(sum((select count(*) from due where due.id = st.id)), 0) as d,
                          coalesce(sum((select count(*) from due where due.id = st.id and due.is_done)), 0) as k
                   from st group by st.current_grade) b))
    into v;
  return v;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.school_grade_roster(uuid)', 'public.scholarship_admin_stats()', 'public.next_promotion_school_year()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
