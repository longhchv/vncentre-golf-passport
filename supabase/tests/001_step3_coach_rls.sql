-- Kiểm thử phân quyền HLV (Bước 3): R8 và "chỉ thấy lớp mình" (kịch bản nghiệm thu 12).
-- Quy ước: chạy trong một khối DO; thành công thì raise 'ALL_OK' để toàn bộ dữ liệu thử bị huỷ.

do $$
declare
  coach_a uuid := gen_random_uuid();
  coach_b uuid := gen_random_uuid();
  admin_u uuid := gen_random_uuid();
  school uuid;
  program uuid;
  class_x uuid;
  class_y uuid;
  s1 uuid;
  s2 uuid;
  g1 uuid;
  n int;
  ok boolean;
  code_before text;
  code_after text;
begin
  -- Chuẩn bị dữ liệu (quyền postgres)
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (coach_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-coach-a@example.test', now()),
         (coach_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-coach-b@example.test', now()),
         (admin_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-admin@example.test', now());
  insert into public.user_roles (user_id, role) values (coach_a, 'coach'), (coach_b, 'coach'), (admin_u, 'admin');

  select id into school from public.schools order by created_at limit 1;
  select id into program from public.programs where code = 'core20';
  insert into public.classes (name, school_id, program_id) values ('TEST X', school, program) returning id into class_x;
  insert into public.classes (name, school_id, program_id) values ('TEST Y', school, program) returning id into class_y;
  insert into public.class_staff (class_id, user_id, role) values (class_x, coach_a, 'coach'), (class_y, coach_b, 'coach');

  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Hoc Vien Mot', '2018-01-01', school) returning id into s1;
  insert into public.students (full_name, current_school_id) values ('Test Hoc Vien Hai', school) returning id into s2;
  insert into public.enrollments (student_id, class_id) values (s1, class_x), (s2, class_y);
  insert into public.guardians (full_name, phone, email) values ('Test Phu Huynh', '+84900000001', 'ph@example.test') returning id into g1;
  insert into public.student_guardians (student_id, guardian_id, relationship) values (s1, g1, 'mother');
  select class_join_code into code_before from public.classes where id = class_x;

  ---------------------------------------------------------------------------
  -- Đóng vai HLV A
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', coach_a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', coach_a::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.classes where name like 'TEST %';
  if n <> 1 then raise exception 'FAIL: HLV A thấy % lớp TEST (mong đợi 1)', n; end if;

  select count(*) into n from public.class_roster(class_x);
  if n <> 1 then raise exception 'FAIL: roster lớp X có % học viên (mong đợi 1)', n; end if;

  -- Không xem được lớp của người khác
  ok := false;
  begin
    perform * from public.class_roster(class_y);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: HLV A xem được roster lớp Y'; end if;

  -- R8: không đọc trực tiếp học viên, phụ huynh, liên kết phụ huynh
  select count(*) into n from public.students;
  if n <> 0 then raise exception 'FAIL R8: HLV đọc được % dòng students', n; end if;
  select count(*) into n from public.guardians;
  if n <> 0 then raise exception 'FAIL R8: HLV đọc được % dòng guardians', n; end if;
  select count(*) into n from public.student_guardians;
  if n <> 0 then raise exception 'FAIL R8: HLV đọc được % dòng student_guardians', n; end if;

  -- R8: roster không có cột nào chứa SĐT/email
  select count(*) into n from pg_proc p, unnest(p.proargnames) as a(arg)
  where p.proname = 'class_roster' and p.pronamespace = 'public'::regnamespace
    and (a.arg ilike '%phone%' or a.arg ilike '%email%' or a.arg ilike '%claim%');
  if n <> 0 then raise exception 'FAIL R8: class_roster có % cột liên hệ/mã bí mật', n; end if;

  -- Đổi mã lớp mình được, lớp khác không
  perform public.regenerate_class_code(class_x);
  ok := false;
  begin
    perform public.regenerate_class_code(class_y);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: HLV A đổi được mã lớp Y'; end if;

  -- Không dùng được công cụ tìm kiếm của admin
  ok := false;
  begin
    perform * from public.admin_search_students('test');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: HLV dùng được admin_search_students'; end if;

  -- Không sửa được lớp
  update public.classes set name = 'hack' where id = class_x;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: HLV sửa được lớp'; end if;

  execute 'reset role';
  select class_join_code into code_after from public.classes where id = class_x;
  if code_after = code_before then raise exception 'FAIL: mã lớp không đổi'; end if;

  ---------------------------------------------------------------------------
  -- Đóng vai admin: tìm học viên theo SĐT phụ huynh dạng 09…
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.admin_search_students('0900000001');
  if n <> 1 then raise exception 'FAIL: tìm theo SĐT phụ huynh ra % kết quả', n; end if;
  select count(*) into n from public.admin_search_students('hoc vien mot');
  if n <> 1 then raise exception 'FAIL: tìm theo tên không dấu ra % kết quả', n; end if;
  select count(*) into n from public.admin_list_users() where email like 'test-%@example.test';
  if n <> 3 then raise exception 'FAIL: admin_list_users ra % tài khoản test', n; end if;

  execute 'reset role';
  raise exception 'ALL_OK';
end $$;
