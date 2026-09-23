-- Kiểm thử nhập danh sách học sinh (Bước 4, F10): dò trùng, quyết định từng dòng, ghi dữ liệu,
-- người giám hộ dùng chung theo SĐT, ghi danh lớp, sinh mã học viên + mã kích hoạt.
do $$
declare
  admin_u uuid := gen_random_uuid();
  coach_u uuid := gen_random_uuid();
  school uuid;
  year uuid;
  program uuid;
  cls uuid;
  batch uuid;
  existing uuid;
  existing_count_before int;
  res jsonb;
  n int;
  ok boolean;
  v text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (admin_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-imp-admin@example.test', now()),
    (coach_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-imp-coach@example.test', now());
  insert into public.user_roles (user_id, role) values (admin_u, 'admin'), (coach_u, 'coach');

  select id into school from public.schools order by created_at limit 1;
  select id into year from public.academic_years where is_current;
  select id into program from public.programs where code = 'core20';
  insert into public.classes (name, school_id, academic_year_id, program_id)
  values ('TEST import', school, year, program) returning id into cls;

  -- Học viên có sẵn để dò trùng
  insert into public.students (full_name, date_of_birth, current_school_id)
  values ('Test Trung Lap', '2018-05-05', school) returning id into existing;
  select count(*) into existing_count_before from public.students;

  -- HLV không được nhập
  perform set_config('request.jwt.claims', json_build_object('sub', coach_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', coach_u::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin
    perform public.import_commit_student_list(gen_random_uuid());
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: HLV gọi được import_commit_student_list'; end if;
  execute 'reset role';

  -- Admin: tạo lô + dòng như trình duyệt làm
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  execute 'set local role authenticated';

  insert into public.import_batches (type, file_name, school_id, academic_year_id, class_id, program_id, created_by)
  values ('student_list', 'test.xlsx', school, year, cls, program, admin_u) returning id into batch;

  insert into public.import_rows (batch_id, row_number, raw, normalized, status, messages) values
    -- 2: trùng học viên có sẵn → chọn dùng hồ sơ có sẵn
    (batch, 2, '{}', jsonb_build_object('full_name', 'TEST TRÙNG LẶP', 'date_of_birth', '2018-05-05', 'school_id', school,
       'grade_class', '3A1', 'contact_name', 'Test Me', 'contact_phone', '+84900000077', 'contact_email', null), 'ok', '[]'),
    -- 3, 4: hai anh em, cùng SĐT → một người giám hộ
    (batch, 3, '{}', jsonb_build_object('full_name', 'Test Anh Mot', 'date_of_birth', '2017-01-01', 'school_id', school,
       'grade_class', '4A1', 'contact_name', 'Test Me', 'contact_phone', '+84900000077', 'contact_email', 'me@example.test'), 'ok', '[]'),
    (batch, 4, '{}', jsonb_build_object('full_name', 'Test Em Hai', 'date_of_birth', null, 'school_id', school,
       'grade_class', '2A1', 'contact_name', 'Test Me', 'contact_phone', '+84900000077', 'contact_email', null), 'warning',
       '[{"code":"missing_dob"}]'),
    -- 5: lỗi (thiếu tên) → không nhập
    (batch, 5, '{}', jsonb_build_object('full_name', null), 'error', '[{"code":"missing_name"}]');

  res := public.import_validate_student_list(batch);
  select count(*) into n from public.import_rows where batch_id = batch and status = 'duplicate_suspect';
  if n <> 1 then raise exception 'FAIL: dò trùng ra % dòng (mong đợi 1)', n; end if;
  if (select matched_student_id from public.import_rows where batch_id = batch and row_number = 2) <> existing then
    raise exception 'FAIL: dòng 2 không khớp đúng học viên có sẵn';
  end if;

  -- Chưa quyết định dòng trùng → dòng đó bị bỏ qua; chọn "dùng hồ sơ có sẵn" rồi nhập
  update public.import_rows set decision = 'use_existing' where batch_id = batch and row_number = 2;
  res := public.import_commit_student_list(batch);

  if (res ->> 'created')::int <> 2 then raise exception 'FAIL: tạo % học viên mới (mong đợi 2) %', res ->> 'created', res; end if;
  if (res ->> 'updated')::int <> 1 then raise exception 'FAIL: cập nhật % (mong đợi 1)', res ->> 'updated'; end if;
  if (res ->> 'errors')::int <> 1 then raise exception 'FAIL: lỗi % (mong đợi 1)', res ->> 'errors'; end if;
  if (res ->> 'guardians_created')::int <> 1 or (res ->> 'guardians_reused')::int <> 2 then
    raise exception 'FAIL: người giám hộ tạo %, dùng lại % (mong đợi 1, 2)', res ->> 'guardians_created', res ->> 'guardians_reused';
  end if;

  select count(*) into n from public.students;
  if n <> existing_count_before + 2 then raise exception 'FAIL: tổng học viên tăng % (mong đợi 2)', n - existing_count_before; end if;

  select count(*) into n from public.guardians where phone = '+84900000077';
  if n <> 1 then raise exception 'FAIL: % người giám hộ cùng SĐT (mong đợi 1)', n; end if;
  select count(*) into n from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where g.phone = '+84900000077';
  if n <> 3 then raise exception 'FAIL: người giám hộ nối với % học viên (mong đợi 3)', n; end if;

  select count(*) into n from public.enrollments where class_id = cls;
  if n <> 3 then raise exception 'FAIL: ghi danh % em (mong đợi 3)', n; end if;

  select s.student_code || '|' || s.claim_code || '|' || s.full_name into v
  from public.students s where s.full_name = 'Test Anh Mot';
  if v !~ '^VNC-\d{6}\|[23456789A-HJ-NP-Z]{8}\|Test Anh Mot$' then raise exception 'FAIL: mã sinh ra sai: %', v; end if;

  if (select current_grade_class from public.students where id = existing) <> '3A1' then
    raise exception 'FAIL: hồ sơ có sẵn không được cập nhật lớp';
  end if;

  select count(*) into n from public.student_school_history h where h.academic_year_id = year
    and h.student_id in (select student_id from public.enrollments where class_id = cls);
  if n <> 3 then raise exception 'FAIL: lịch sử trường % dòng (mong đợi 3)', n; end if;

  -- Không nhập lại được lô đã nhập
  ok := false;
  begin
    perform public.import_commit_student_list(batch);
  exception when invalid_parameter_value then ok := true;
  end;
  if not ok then raise exception 'FAIL: nhập lại được lô đã nhập'; end if;

  execute 'reset role';
  raise exception 'ALL_OK';
end $$;
