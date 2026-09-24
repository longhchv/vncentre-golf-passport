-- Bước 9 (sửa): nhập tay khoá học không chọn trường → lấy trường hiện tại của học viên.
-- Nhập tay một khoá cho một học sinh (F13 — quản lý trường; admin cũng dùng được)
create or replace function public.add_course_history(p_student_id uuid, p_data jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_school uuid := nullif(p_data ->> 'school_id', '')::uuid;
  v_center boolean := public.is_center_staff();
  v_approve boolean := v_center and coalesce((p_data ->> 'approve_now')::boolean, false);
  v_level int := nullif(p_data ->> 'level_number', '')::int;
  v_rec uuid;
  v_id uuid;
begin
  if not (v_center or exists (select 1 from public.students s where s.id = p_student_id and s.current_school_id = any(public.my_school_ids()))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not v_center and (v_school is null or not (v_school = any(public.my_school_ids()))) then
    v_school := (select current_school_id from public.students where id = p_student_id);
  end if;
  -- Không chọn trường → dùng trường hiện tại của học viên
  v_school := coalesce(v_school, (select current_school_id from public.students where id = p_student_id));
  if coalesce(btrim(p_data ->> 'course_name'), '') = '' or coalesce(p_data ->> 'academic_year', '') !~ '^\d{4}-\d{4}$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_level is not null then
    v_rec := public.upsert_level_completion(p_student_id, v_level, case when v_center then 'admin' else 'school_entry' end,
                                            v_approve, public.academic_year_end(p_data ->> 'academic_year'), 'manual');
  end if;
  insert into public.course_history (student_id, school_id, grade_class, academic_year_text, program_id, course_name,
                                     sessions_count, level_achieved_id, source, status, submitted_by, reviewed_by, reviewed_at)
  values (p_student_id, v_school, nullif(p_data ->> 'grade_class', ''), p_data ->> 'academic_year',
          coalesce(nullif(p_data ->> 'program_id', '')::uuid, (select id from public.programs where code = 'core20')),
          btrim(p_data ->> 'course_name'), nullif(p_data ->> 'sessions_count', '')::int,
          (select level_id from public.level_records where id = v_rec),
          case when v_center then 'admin' else 'school_entry' end,
          case when v_approve then 'approved' else 'pending_review' end, auth.uid(),
          case when v_approve then auth.uid() end, case when v_approve then now() end)
  returning id into v_id;
  return v_id;
end $$;

