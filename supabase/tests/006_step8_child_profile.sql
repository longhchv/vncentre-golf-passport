-- Kiểm thử hồ sơ học viên (Bước 8): ai xem được gì — phụ huynh, phụ huynh chờ duyệt (D32), HLV lớp mình / lớp khác,
-- người lạ; R7 (khoá học chờ duyệt không hiện), R8 (không lộ liên hệ phụ huynh), R4/R5 hiển thị level; sửa thông tin con.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

do $$
declare
  parent uuid := gen_random_uuid();
  parent2 uuid := gen_random_uuid();   -- chỉ có quyền xem (can_manage = false)
  pending uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  coach_in uuid := gen_random_uuid();
  coach_out uuid := gen_random_uuid();
  school uuid; program uuid; cls uuid; cls2 uuid; l1 uuid; s uuid; g1 uuid; g2 uuid; g3 uuid;
  r jsonb; ok boolean; txt text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-prof-' || id || '@example.test', now()
  from unnest(array[parent, parent2, pending, stranger, coach_in, coach_out]) id;
  insert into public.user_roles (user_id, role) values (coach_in, 'coach'), (coach_out, 'coach');

  select id into school from public.schools order by created_at limit 1;
  select id into program from public.programs where code = 'core20';
  select id into l1 from public.levels where program_id = program and number = 1;
  insert into public.classes (name, school_id, program_id) values ('TEST prof', school, program) returning id into cls;
  insert into public.classes (name, school_id, program_id) values ('TEST prof 2', school, program) returning id into cls2;
  insert into public.class_staff (class_id, user_id, role) values (cls, coach_in, 'coach'), (cls2, coach_out, 'coach');

  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Ho So', '2018-01-01', school) returning id into s;
  insert into public.enrollments (student_id, class_id) values (s, cls);
  insert into public.guardians (user_id, full_name, phone, email) values (parent, 'Test Me', '+84900005555', 'me@example.test') returning id into g1;
  insert into public.guardians (user_id, full_name) values (parent2, 'Test Bo') returning id into g2;
  insert into public.guardians (user_id, full_name) values (pending, 'Test Cho Duyet') returning id into g3;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, status) values
    (s, g1, 'mother', true, true, 'active'), (s, g2, 'father', false, false, 'active'), (s, g3, 'other', false, false, 'pending_confirmation');

  insert into public.course_history (student_id, school_id, academic_year_text, course_name, source, status) values
    (s, school, '2024-2025', 'Khoa da duyet', 'admin', 'approved'),
    (s, school, '2025-2026', 'Khoa cho duyet', 'school_entry', 'pending_review');
  insert into public.level_records (student_id, level_id, source, approval_status, completed_at) values (s, l1, 'legacy_import', 'approved', '2025-05-30');

  -- Phụ huynh: thấy đủ; level hiện tại = Level 2 (R5); chỉ khoá đã duyệt (R7)
  perform pg_temp.act_as(parent);
  r := public.student_profile(s);
  if r ->> 'viewer' <> 'guardian' or not (r ->> 'can_manage')::boolean then raise exception 'FAIL phụ huynh: %', r ->> 'viewer'; end if;
  if (r -> 'level' ->> 'number')::int <> 2 then raise exception 'FAIL R5: level %', r -> 'level' ->> 'number'; end if;
  if jsonb_array_length(r -> 'courses') <> 1 or r -> 'courses' -> 0 ->> 'course_name' <> 'Khoa da duyet' then raise exception 'FAIL R7: %', r -> 'courses'; end if;
  if jsonb_array_length(r -> 'completed_levels') <> 1 then raise exception 'FAIL: level đã hoàn thành'; end if;
  if (r ->> 'guardians') ~ '(0900005555|me@example)' then raise exception 'FAIL: lộ liên hệ trong danh sách người giám hộ'; end if;
  perform public.update_child_info(s, '{"gender":"male","golf_goals":["athlete"]}');
  perform public.request_history_update(s, 'Con học CLB từ 2023');

  -- Phụ huynh không có quyền quản lý: xem được, không sửa được
  perform pg_temp.act_as(parent2);
  if (public.student_profile(s) ->> 'can_manage')::boolean then raise exception 'FAIL: can_manage sai'; end if;
  ok := false;
  begin perform public.update_child_info(s, '{"gender":"female"}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người giám hộ không quản lý sửa được thông tin'; end if;

  -- D32: chờ duyệt → chỉ tên + level
  perform pg_temp.act_as(pending);
  r := public.student_profile(s);
  if r ->> 'viewer' <> 'pending' or r ? 'courses' or r -> 'student' ? 'student_code' then raise exception 'FAIL D32: %', r; end if;

  -- HLV lớp mình: xem được, không có liên hệ phụ huynh (R8); HLV lớp khác: bị từ chối
  perform pg_temp.act_as(coach_in);
  r := public.student_profile(s);
  if r ->> 'viewer' <> 'staff' or r -> 'guardians' <> 'null'::jsonb then raise exception 'FAIL HLV: %', r ->> 'viewer'; end if;
  txt := r::text;
  if txt ~ '(0900005555|me@example\.test)' then raise exception 'FAIL R8: hồ sơ lộ liên hệ phụ huynh cho HLV'; end if;
  perform pg_temp.act_as(coach_out);
  ok := false;
  begin perform public.student_profile(s); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: HLV lớp khác xem được hồ sơ'; end if;

  -- Người lạ
  perform pg_temp.act_as(stranger);
  ok := false;
  begin perform public.student_profile(s); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người lạ xem được hồ sơ'; end if;
  ok := false;
  begin perform public.request_history_update(s, 'x'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người lạ gửi được yêu cầu'; end if;

  perform pg_temp.act_as(null);
  if (select gender || '|' || array_to_string(golf_goals, ',') from public.students where id = s) <> 'male|athlete' then
    raise exception 'FAIL: sửa thông tin con';
  end if;
  if not exists (select 1 from public.support_requests where student_id = s and type = 'history_update') then
    raise exception 'FAIL: chưa tạo yêu cầu cập nhật lịch sử';
  end if;

  raise exception 'ALL_OK';
end $$;
