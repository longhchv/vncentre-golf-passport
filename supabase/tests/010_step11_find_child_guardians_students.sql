-- Kiểm thử Bước 11: tự tìm con (F5, R3), người giám hộ thứ hai (F6), tài khoản học viên (F7, R14).
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
  coach uuid := gen_random_uuid();
  pa uuid := gen_random_uuid();   -- phụ huynh có mã lớp
  pb uuid := gen_random_uuid();   -- phụ huynh không có mã lớp
  pc uuid := gen_random_uuid();   -- người giám hộ thứ hai
  pd uuid := gen_random_uuid();   -- phụ huynh đoán mã lớp
  school uuid; prog uuid; cls uuid; code text;
  s1 uuid; s2 uuid; s_young uuid; s_nodob uuid;
  req uuid; link_a uuid; link_c uuid; g_c uuid;
  r jsonb; ok boolean; i int;
  cons jsonb := '{"terms":true,"privacy":true}';
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s11-adm@example.test', now()),
    (coach, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s11-coach@example.test', now()),
    (pa, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s11-pa@example.test', now()),
    (pb, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s11-pb@example.test', now()),
    (pc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s11-pc@example.test', now()),
    (pd, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s11-pd@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (coach, 'coach');
  select id into school from public.schools order by created_at limit 1;
  select id into prog from public.programs p where p.code = 'core20';
  insert into public.classes (name, school_id, program_id) values ('Test lop S11', school, prog) returning id, class_join_code into cls, code;
  insert into public.class_staff (class_id, user_id, role) values (cls, coach, 'coach');
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Tim Con', '2016-03-03', school) returning id into s1;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Khong Ma', '2017-04-04', school) returning id into s2;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Con Nho', current_date - interval '7 years', school) returning id into s_young;
  insert into public.students (full_name, current_school_id) values ('Test Chua Ngay Sinh', school) returning id into s_nodob;
  insert into public.enrollments (student_id, class_id) values (s1, cls), (s2, cls);

  ------------------------------------------------------------------ F5 có mã lớp: khớp đúng 1 em → nối ngay
  perform pg_temp.act_as(pa);
  r := public.find_child_request(jsonb_build_object('child_name', 'test  tìm con', 'dob', '2016-03-03', 'class_code', lower(code),
                                                    'relationship', 'mother', 'consents', cons));
  if r ->> 'result' <> 'linked' then raise exception 'FAIL F5 mã lớp: %', r; end if;
  -- R3: kết quả chỉ là "đã nối"/"đang chờ", không có danh sách học viên
  if r ? 'students' or r ? 'matches' or (select count(*) from jsonb_object_keys(r)) > 2 then raise exception 'FAIL R3: trả thêm dữ liệu %', r; end if;
  if (public.student_profile(s1) ->> 'viewer') <> 'guardian' then raise exception 'FAIL: chưa thấy con sau khi nối bằng mã lớp'; end if;
  -- R3: phụ huynh vẫn không đọc thẳng bảng students
  if exists (select 1 from public.students) then raise exception 'FAIL R3: phụ huynh đọc được bảng students'; end if;

  ------------------------------------------------------------------ F5 sai mã lớp tối đa 5 lần/ngày
  perform pg_temp.act_as(pd);
  for i in 1..5 loop
    r := public.find_child_request(jsonb_build_object('child_name', 'Test Tim Con', 'class_code', 'ZZZZ' || i, 'relationship', 'father', 'consents', cons));
    if r <> jsonb_build_object('result', 'wrong_code', 'remaining', 5 - i) then raise exception 'FAIL mã sai lần %: %', i, r; end if;
  end loop;
  -- Lần 6, kể cả mã đúng → bị khoá
  r := public.find_child_request(jsonb_build_object('child_name', 'Test Tim Con', 'class_code', code, 'relationship', 'father', 'consents', cons));
  if r ->> 'result' <> 'locked' then raise exception 'FAIL: sai mã lớp 5 lần vẫn thử tiếp được: %', r; end if;

  ------------------------------------------------------------------ F5 không có mã lớp → chờ duyệt, không lộ gì
  perform pg_temp.act_as(pb);
  r := public.find_child_request(jsonb_build_object('child_name', 'Test Khong Ma', 'dob', '2017-04-04', 'school', 'Trường thử',
                                                    'grade_class', '3A', 'relationship', 'father', 'consents', cons));
  if r <> '{"result":"pending"}'::jsonb then raise exception 'FAIL F5 không mã: %', r; end if;
  ok := false;
  begin perform public.student_profile(s2); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: yêu cầu chờ duyệt đã xem được hồ sơ'; end if;
  select id into req from public.link_requests where requester_user_id = pb;
  if req is null then raise exception 'FAIL: phụ huynh không xem được yêu cầu của mình'; end if;
  -- Phụ huynh không xem được danh sách ứng viên
  ok := false;
  begin perform public.link_request_candidates(req); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL R3: phụ huynh xem được ứng viên'; end if;

  -- HLV lớp khác không thấy yêu cầu không có mã lớp; admin chọn đúng học viên và duyệt
  perform pg_temp.act_as(coach);
  if jsonb_array_length(public.coach_link_requests()) <> 0 then raise exception 'FAIL: HLV thấy yêu cầu không thuộc lớp mình'; end if;
  perform pg_temp.act_as(adm);
  r := public.link_request_candidates(req);
  if not (r @> jsonb_build_array(jsonb_build_object('id', s2, 'name_match', true, 'dob_match', true))) then raise exception 'FAIL ứng viên: %', r; end if;
  -- Duyệt kiểu cũ (không chọn học viên) bị chặn
  ok := false;
  begin perform public.review_items('link_request', array[req], 'approve'); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: duyệt mà không chọn học viên'; end if;
  perform public.approve_link_request(req, s2);
  perform pg_temp.act_as(pb);
  if (public.student_profile(s2) ->> 'viewer') <> 'guardian' then raise exception 'FAIL: được duyệt mà chưa thấy con'; end if;
  if not exists (select 1 from public.notifications where user_id = pb and type = 'link_request_result') then raise exception 'FAIL: không báo kết quả'; end if;

  -- Yêu cầu có mã lớp đúng nhưng không khớp → HLV lớp đó duyệt/từ chối được
  perform pg_temp.act_as(pc);
  r := public.find_child_request(jsonb_build_object('child_name', 'Ten Khac Han', 'class_code', code, 'relationship', 'other', 'consents', cons));
  if r ->> 'result' <> 'pending' then raise exception 'FAIL: tên không khớp mà vẫn nối: %', r; end if;
  select id into req from public.link_requests where requester_user_id = pc;
  perform pg_temp.act_as(coach);
  if jsonb_array_length(public.coach_link_requests()) <> 1 then raise exception 'FAIL: HLV không thấy yêu cầu lớp mình'; end if;
  perform public.reject_link_request(req, 'Không có học viên này trong lớp');
  perform pg_temp.act_as(null);
  if not exists (select 1 from public.notifications where user_id = pc and type = 'link_request_result' and body_vi like '%Không có học viên%') then
    raise exception 'FAIL: không báo từ chối';
  end if;

  ------------------------------------------------------------------ F6 người giám hộ thứ hai
  select sg.id into link_a from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where sg.student_id = s1 and g.user_id = pa;
  select id into g_c from public.guardians where user_id = pc;  -- đã tạo khi pc gửi yêu cầu ở trên
  insert into public.student_guardians (student_id, guardian_id, relationship, can_manage, linked_via, status, linked_at)
  values (s1, g_c, 'father', false, 'invite', 'active', now()) returning id into link_c;

  perform pg_temp.act_as(pc);
  if (public.student_profile(s1) ->> 'can_manage')::boolean then raise exception 'FAIL F6: người thứ hai có quyền quản lý mặc định'; end if;
  ok := false;
  begin perform public.set_guardian_can_manage(link_c, true); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL F6: người không có quyền tự bật quyền'; end if;
  ok := false;
  begin perform public.remove_guardian_link(link_a); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL F6: người không có quyền gỡ người khác'; end if;

  perform pg_temp.act_as(pa);
  perform public.set_guardian_can_manage(link_c, true);
  perform pg_temp.act_as(pc);
  if not (public.student_profile(s1) ->> 'can_manage')::boolean then raise exception 'FAIL F6: bật quyền không có tác dụng'; end if;

  -- Không gỡ người giám hộ chính cuối cùng
  perform pg_temp.act_as(pa);
  ok := false;
  begin perform public.remove_guardian_link(link_a); exception when invalid_parameter_value then ok := sqlerrm = 'last_primary'; end;
  if not ok then raise exception 'FAIL F6: gỡ được người giám hộ chính cuối cùng'; end if;
  perform public.remove_guardian_link(link_c);
  perform pg_temp.act_as(pc);
  ok := false;
  begin perform public.student_profile(s1); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL F6: người bị gỡ vẫn xem được'; end if;

  ------------------------------------------------------------------ F7 tài khoản học viên, R14
  perform pg_temp.act_as(pa);
  perform public.student_account_check(s1, 'test.timcon1');
  ok := false;
  begin perform public.student_account_check(s1, 'AB'); exception when invalid_parameter_value then ok := sqlerrm = 'invalid_username'; end;
  if not ok then raise exception 'FAIL: tên đăng nhập sai dạng'; end if;

  perform pg_temp.act_as(null);
  select id into g_c from public.guardians where user_id = pd;
  insert into public.student_guardians (student_id, guardian_id, can_manage, is_primary, status) values
    (s_young, g_c, true, true, 'active'), (s_nodob, g_c, true, true, 'active');
  perform pg_temp.act_as(pd);
  ok := false;
  begin perform public.student_account_check(s_young, 'test.connho'); exception when invalid_parameter_value then ok := sqlerrm = 'too_young'; end;
  if not ok then raise exception 'FAIL R14: tạo được tài khoản cho con 7 tuổi'; end if;
  ok := false;
  begin perform public.student_account_check(s_nodob, 'test.chuangay'); exception when invalid_parameter_value then ok := sqlerrm = 'dob_required'; end;
  if not ok then raise exception 'FAIL R14: chưa có ngày sinh mà vẫn tạo'; end if;
  if (public.student_account_info(s_young) ->> 'age')::int <> 7 then raise exception 'FAIL: tuổi tính sai'; end if;
  -- Người không quản lý con không tạo được
  ok := false;
  begin perform public.student_account_check(s1, 'test.nguoila'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người lạ tạo tài khoản cho con người khác'; end if;

  -- R14 chặn cả ở CSDL (mọi đường tạo)
  perform pg_temp.act_as(null);
  ok := false;
  begin insert into public.student_accounts (student_id, username) values (s_young, 'test.connho');
  exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL R14: CSDL nhận tài khoản cho con dưới 8 tuổi'; end if;

  -- Học viên đăng nhập: chỉ xem hồ sơ mình, viewer = student, không có danh sách người giám hộ
  insert into public.student_accounts (student_id, username, user_id) values (s1, 'test.timcon1', pb);
  perform pg_temp.act_as(pb);
  if public.my_student_id() <> s1 then raise exception 'FAIL: my_student_id'; end if;
  r := public.student_profile(s1);
  if r ->> 'viewer' <> 'student' or (r ->> 'can_manage')::boolean or r -> 'guardians' <> 'null'::jsonb then raise exception 'FAIL: học viên xem hồ sơ %', r ->> 'viewer'; end if;
  ok := false;
  begin perform public.update_child_info(s1, '{"gender":"male"}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: học viên sửa được thông tin'; end if;

  raise exception 'ALL_OK';
end $$;
