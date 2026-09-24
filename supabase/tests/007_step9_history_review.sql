-- Kiểm thử Bước 9: nhập lịch sử khoá học (A2), hàng chờ duyệt, R6, R7, admin sửa level, cổng quản lý trường.
-- Kịch bản nghiệm thu 6 (2 năm dữ liệu cũ → "Hoàn thành Level 1" + 2 khoá) và 13 (nhà trường nhập → duyệt → phụ huynh thấy).
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
  adm uuid := gen_random_uuid();
  hc uuid := gen_random_uuid();
  mgr uuid := gen_random_uuid();
  parent uuid := gen_random_uuid();
  school uuid; other_school uuid; program uuid; s uuid; g uuid; b uuid; b2 uuid;
  r jsonb; n int; ok boolean; ids uuid[];
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s9-' || id || '@example.test', now()
  from unnest(array[adm, hc, mgr, parent]) id;
  select id into school from public.schools order by created_at limit 1;
  select id into other_school from public.schools where id <> school order by created_at limit 1;
  select id into program from public.programs where code = 'core20';
  insert into public.user_roles (user_id, role, school_id) values (adm, 'admin', null), (hc, 'head_coach', null), (mgr, 'school_manager', school);

  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Lich Su', '2017-02-02', school) returning id into s;
  insert into public.guardians (user_id, full_name) values (parent, 'Test PH lich su') returning id into g;
  insert into public.student_guardians (student_id, guardian_id, can_manage, status) values (s, g, true, 'active');

  ------------------------------------------------------------------ Kịch bản 6: admin nhập 2 năm, không duyệt luôn
  perform pg_temp.act_as(adm);
  insert into public.import_batches (type, file_name, school_id, program_id) values ('course_history', 't.xlsx', school, program) returning id into b;
  insert into public.import_rows (batch_id, row_number, raw, normalized, status, messages) values
    (b, 2, '{}', jsonb_build_object('full_name', 'TEST LỊCH SỬ', 'date_of_birth', '2017-02-02', 'school_id', school, 'grade_class', '1A1',
       'academic_year', '2024-2025', 'course_name', 'Golf GDTC học kỳ 2 (18 tiết)', 'level_number', 1), 'ok', '[]'),
    (b, 3, '{}', jsonb_build_object('full_name', 'Test Lich Su', 'date_of_birth', '2017-02-02', 'school_id', school, 'grade_class', '2A1',
       'academic_year', '2025-2026', 'course_name', 'Golf GDTC (25 tiết)', 'level_number', 1), 'ok', '[]'),
    (b, 4, '{}', jsonb_build_object('full_name', 'Test Em Chua Co', 'date_of_birth', '2017-09-09', 'school_id', school,
       'academic_year', '2025-2026', 'course_name', 'Golf GDTC', 'level_number', 1), 'ok', '[]');
  r := public.history_import_validate(b);
  if (select count(*) from public.import_rows where batch_id = b and matched_student_id = s and decision = 'use_existing') <> 2 then
    raise exception 'FAIL: không tự khớp học viên có sẵn';
  end if;
  if (select status from public.import_rows where batch_id = b and row_number = 4) <> 'warning' then raise exception 'FAIL: dòng không khớp'; end if;
  update public.import_rows set decision = 'skip' where batch_id = b and row_number = 4;
  r := public.history_import_commit(b, false);
  if (r ->> 'courses')::int <> 2 or (r ->> 'skipped')::int <> 1 then raise exception 'FAIL commit: %', r; end if;
  if (select count(*) from public.level_records where student_id = s) <> 1 then raise exception 'FAIL E23: tạo trùng level 1'; end if;

  -- R7: chưa duyệt → phụ huynh chưa thấy
  perform pg_temp.act_as(parent);
  r := public.student_profile(s);
  if jsonb_array_length(r -> 'courses') <> 0 or (r -> 'level' ->> 'number')::int <> 1 then raise exception 'FAIL R7: phụ huynh thấy dữ liệu chờ duyệt'; end if;

  -- HLV trưởng duyệt hàng loạt khoá học (kèm level)
  perform pg_temp.act_as(hc);
  r := public.review_queue();
  select array_agg((x ->> 'id')::uuid) into ids from jsonb_array_elements(r -> 'course_history') x where (x ->> 'student_id')::uuid = s;
  if coalesce(array_length(ids, 1), 0) <> 2 then raise exception 'FAIL: hàng chờ có % khoá', array_length(ids, 1); end if;
  ok := false;
  begin perform public.review_items('course_history', ids, 'reject', ''); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: từ chối không cần lý do'; end if;
  n := public.review_items('course_history', ids, 'approve');
  if n <> 2 then raise exception 'FAIL: duyệt % khoá', n; end if;

  perform pg_temp.act_as(parent);
  r := public.student_profile(s);
  if jsonb_array_length(r -> 'courses') <> 2 then raise exception 'FAIL kịch bản 6: phụ huynh thấy % khoá', jsonb_array_length(r -> 'courses'); end if;
  if (r -> 'level' ->> 'number')::int <> 2 or jsonb_array_length(r -> 'completed_levels') <> 1 then raise exception 'FAIL kịch bản 6: level'; end if;
  if not exists (select 1 from public.notifications where user_id = parent) then raise exception 'FAIL: chưa báo phụ huynh'; end if;

  ------------------------------------------------------------------ Kịch bản 13 + R6: quản lý trường nhập tay
  perform pg_temp.act_as(mgr);
  perform public.add_course_history(s, jsonb_build_object('academic_year', '2026-2027', 'course_name', 'CLB hè', 'level_number', 2, 'approve_now', true));
  -- R6: không tạo được level đã duyệt, kể cả gửi approve_now
  if exists (select 1 from public.level_records lr join public.levels l on l.id = lr.level_id
             where lr.student_id = s and l.number = 2 and lr.approval_status = 'approved') then
    raise exception 'FAIL R6: nhà trường tạo được level đã duyệt';
  end if;
  ok := false;
  begin
    insert into public.level_records (student_id, level_id, source, approval_status)
    values (s, (select id from public.levels where program_id = program and number = 3), 'school_entry', 'approved');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL R6: nhà trường ghi thẳng level_records'; end if;
  -- Quản lý trường không nhập cho trường khác, không dùng hàng chờ
  ok := false;
  begin perform public.review_queue(); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: quản lý trường mở được hàng chờ'; end if;
  r := public.school_overview(school);
  if (r ->> 'pending_history')::int < 1 then raise exception 'FAIL: tổng quan trường'; end if;
  ok := false;
  begin perform public.school_overview(other_school); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: quản lý trường xem được trường khác'; end if;
  if not exists (select 1 from public.school_students(school) x where x.student_id = s) then raise exception 'FAIL: danh sách học sinh trường'; end if;

  perform pg_temp.act_as(parent);
  if jsonb_array_length(public.student_profile(s) -> 'courses') <> 2 then raise exception 'FAIL kịch bản 13: phụ huynh thấy khoá chờ duyệt'; end if;
  perform pg_temp.act_as(hc);
  select array_agg((x ->> 'id')::uuid) into ids from jsonb_array_elements(public.review_queue() -> 'course_history') x where (x ->> 'student_id')::uuid = s;
  perform public.review_items('course_history', ids, 'approve');
  perform pg_temp.act_as(parent);
  r := public.student_profile(s);
  if jsonb_array_length(r -> 'courses') <> 3 or (r -> 'level' ->> 'number')::int <> 3 then raise exception 'FAIL kịch bản 13: sau duyệt %', r -> 'level'; end if;

  ------------------------------------------------------------------ Admin sửa level trực tiếp (bắt buộc lý do)
  perform pg_temp.act_as(hc);
  ok := false;
  begin perform public.admin_set_level(s, 5, 'x'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: HLV trưởng sửa level trực tiếp được'; end if;
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.admin_set_level(s, 5, ' '); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: sửa level không cần lý do'; end if;
  perform public.admin_set_level(s, 5, 'Kiểm tra trình độ đầu vào');
  perform pg_temp.act_as(null);
  if (select l.number from public.students st join public.levels l on l.id = st.current_level_id where st.id = s) <> 5 then raise exception 'FAIL: sửa lên level 5'; end if;
  perform pg_temp.act_as(adm);
  perform public.admin_set_level(s, 2, 'Nhập nhầm');
  perform pg_temp.act_as(null);
  if (select l.number from public.students st join public.levels l on l.id = st.current_level_id where st.id = s) <> 2 then raise exception 'FAIL: hạ về level 2'; end if;
  if not exists (select 1 from public.audit_logs where entity_type = 'level_records' and reason = 'Nhập nhầm') then
    raise exception 'FAIL: nhật ký không ghi lý do sửa level';
  end if;

  ------------------------------------------------------------------ Yêu cầu từ phụ huynh
  perform pg_temp.act_as(parent);
  perform public.request_history_update(s, 'Con học CLB 2023');
  perform pg_temp.act_as(adm);
  select array_agg((x ->> 'id')::uuid) into ids from jsonb_array_elements(public.review_queue() -> 'support_requests') x where (x ->> 'student_id')::uuid = s;
  if public.review_items('support_request', ids, 'approve', 'Đã cập nhật') <> 1 then raise exception 'FAIL: xử lý yêu cầu'; end if;

  perform pg_temp.act_as(null);
  raise exception 'ALL_OK';
end $$;
