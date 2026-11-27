-- Kiểm thử lớp học trực tiếp (migration 20261127000030): tạo hồ sơ, điểm khởi đầu, chấm điểm gửi lại nhiều lần,
-- hoàn tác, mức điểm 5–50, điểm danh có điểm, trần mỗi buổi theo loại lớp, điểm danh / nhận xét, quyền HLV theo lớp, tổng tích luỹ không trừ khi đổi quà.
-- Quy ước: chạy trong một khối DO; thành công thì raise 'ALL_OK' để toàn bộ dữ liệu thử bị huỷ.

do $$
declare
  coach_a uuid := gen_random_uuid();
  coach_b uuid := gen_random_uuid();
  program uuid;
  class_x uuid;
  class_y uuid;
  s1 uuid; s2 uuid; s3 uuid; class_z uuid;
  r jsonb; b jsonb; st jsonb;
  op1 uuid := gen_random_uuid();
  ok boolean;
  d date := public.vn_date(now());
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (coach_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-live-a@example.test', now()),
         (coach_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-live-b@example.test', now());
  insert into public.profiles (user_id, full_name) values (coach_a, 'Test HLV A'), (coach_b, 'Test HLV B') on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role) values (coach_a, 'coach'), (coach_b, 'coach');
  select id into program from public.programs where code = 'core20';
  insert into public.classes (name, program_id) values ('TEST LIVE X', program) returning id into class_x;
  insert into public.classes (name, program_id) values ('TEST LIVE Y', program) returning id into class_y;
  insert into public.class_staff (class_id, user_id, role) values (class_x, coach_a, 'coach'), (class_y, coach_b, 'coach');

  perform set_config('request.jwt.claims', json_build_object('sub', coach_a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', coach_a::text, true);
  execute 'set local role authenticated';

  -- 1. Tạo hồ sơ: mã VNC tự sinh, có mã liên kết phụ huynh, vào lớp ngay
  r := public.class_live_create_student(class_x, '  Test   Live Một ', null, null, null);
  s1 := (r ->> 'id')::uuid;
  if r ->> 'student_code' not like 'VNC-%' or r ->> 'claim_code' is null then raise exception 'FAIL: mã hồ sơ %', r; end if;
  r := public.class_live_create_student(class_x, 'Test Live Hai', '2017-05-01', 'data:image/jpeg;base64,AAAA', gen_random_uuid());
  s2 := (r ->> 'id')::uuid;
  -- gửi lại cùng id → không tạo thêm
  if (public.class_live_create_student(class_x, 'Test Live Hai', null, null, s2) ->> 'created')::boolean then raise exception 'FAIL: tạo trùng theo id'; end if;
  ok := false;
  begin perform public.class_live_create_student(class_x, 'test live một', null, null, null);
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL: cho tạo trùng tên trong lớp'; end if;
  ok := false;
  begin perform public.class_live_create_student(class_y, 'Test Ngoai Lop', null, null, null);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: HLV A tạo hồ sơ ở lớp Y'; end if;

  -- 2. Điểm khởi đầu: lần đầu opening_balance, sửa lại ghi phần chênh
  perform public.class_live_set_opening(class_x, s1, 120);
  perform public.class_live_set_opening(class_x, s1, 100);
  execute 'reset role';
  if (select count(*) from public.reward_ledger where student_id = s1 and source_type = 'opening_balance') <> 2
     or (select sum(delta) from public.reward_ledger where student_id = s1) <> 100 then
    raise exception 'FAIL: điểm khởi đầu';
  end if;
  execute 'set local role authenticated';

  -- 3. Chấm điểm: gửi lại cùng id chỉ ghi một lần; sửa nhầm không dưới 0; ngoài lớp bị bỏ qua
  r := public.class_live_sync(jsonb_build_array(
    jsonb_build_object('op', 'points', 'id', op1, 'class_id', class_x, 'date', d, 'student_id', s1, 'delta', 20, 'tag', 'rules'),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s1, 'delta', -10),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', -5),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', 7),
    jsonb_build_object('op', 'topic', 'class_id', class_x, 'date', d, 'session_no', 10, 'topic', 'Pitching + Luật golf'),
    jsonb_build_object('op', 'mark', 'class_id', class_x, 'date', d, 'student_id', s1, 'attendance', 'late', 'comment_tags', '["focused","fair_play"]'::jsonb),
    jsonb_build_object('op', 'mark', 'class_id', class_x, 'date', d, 'student_id', s1, 'leave_count', 2, 'note', 'Nghe hiệu lệnh tốt')));
  if (r ->> 'applied')::int <> 5 or jsonb_array_length(r -> 'skipped') <> 2 then raise exception 'FAIL: sync %', r; end if;
  r := public.class_live_sync(jsonb_build_array(
    jsonb_build_object('op', 'points', 'id', op1, 'class_id', class_x, 'date', d, 'student_id', s1, 'delta', 20, 'tag', 'rules')));
  execute 'reset role';
  if (select count(*) from public.reward_ledger where id = op1) <> 1 then raise exception 'FAIL: ghi trùng khi gửi lại'; end if;
  if (select note from public.reward_ledger where id = op1) <> 'Đúng luật golf' then raise exception 'FAIL: lý do'; end if;
  execute 'set local role authenticated';

  b := public.class_live_board(class_x, d);
  select x into st from jsonb_array_elements(b -> 'students') x where (x ->> 'id')::uuid = s1;
  if (st ->> 'today')::int <> 20 or (st ->> 'total')::int <> 120 or (st ->> 'available')::int <> 120 or (st ->> 'opening')::int <> 100
     or st ->> 'attendance' <> 'late' or (st ->> 'leave_count')::int <> 2 or jsonb_array_length(st -> 'comment_tags') <> 2
     or st ->> 'note' <> 'Nghe hiệu lệnh tốt' then
    raise exception 'FAIL: bảng điểm %', st;
  end if;
  if jsonb_array_length(b -> 'topics') < 1 then raise exception 'FAIL: giáo án %', b -> 'topics'; end if;
  if b -> 'steps' <> '[1, 5, 10, 20, 30, 40, 50]'::jsonb then raise exception 'FAIL: mức điểm %', b -> 'steps'; end if;
  if (b -> 'session' ->> 'session_no')::int <> 10 or b -> 'session' ->> 'topic' <> 'Pitching + Luật golf' then raise exception 'FAIL: buổi %', b -> 'session'; end if;

  r := public.class_live_history(class_x, s1);
  if jsonb_array_length(r -> 'sessions') <> 1 or (r -> 'sessions' -> 0 ->> 'points')::int <> 20 then raise exception 'FAIL: lịch sử %', r; end if;

  -- Đổi quà không làm giảm tổng tích luỹ (chỉ giảm điểm đổi quà)
  execute 'reset role';
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id) values (s1, -50, 'gift_order', 'gift_order', gen_random_uuid());
  execute 'set local role authenticated';
  select x into st from jsonb_array_elements(public.class_live_board(class_x, d) -> 'students') x where (x ->> 'id')::uuid = s1;
  if (st ->> 'total')::int <> 120 or (st ->> 'available')::int <> 70 then raise exception 'FAIL: sau đổi quà %', st; end if;

  -- Điểm danh: vào muộn đã +10 (lớp CLB); đổi sang vắng thì trừ lại
  r := public.class_live_sync(jsonb_build_array(
    jsonb_build_object('op', 'mark', 'class_id', class_x, 'date', d, 'student_id', s1, 'attendance', 'absent')));
  select x into st from jsonb_array_elements(public.class_live_board(class_x, d) -> 'students') x where (x ->> 'id')::uuid = s1;
  if (st ->> 'today')::int <> 10 then raise exception 'FAIL: bỏ điểm danh %', st; end if;

  -- Trần lớp CLB 200 điểm mỗi buổi
  r := public.class_live_sync(jsonb_build_array(
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', 50),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', 50),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', 50),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', 50),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', 5)));
  if (r ->> 'applied')::int <> 4 or r -> 'skipped' -> 0 ->> 'reason' <> 'session_cap' then raise exception 'FAIL: trần CLB %', r; end if;

  -- Trừ điểm (phạt): đúng một mức, lý do 'penalty'; cộng không được gắn lý do trừ; không xuống dưới 0
  r := public.class_live_sync(jsonb_build_array(
    jsonb_build_object('op', 'points', 'id', op1 /* đã có */, 'class_id', class_x, 'date', d, 'student_id', s1, 'delta', 20, 'tag', 'rules'),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', -5, 'tag', 'penalty'),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', 5, 'tag', 'penalty'),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', -5, 'tag', 'rules'),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', -1),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', -50, 'tag', 'penalty'),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', -50, 'tag', 'penalty'),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', -50, 'tag', 'penalty'),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', -50, 'tag', 'penalty')));
  -- s2: 200 → −5 → 195 → −1 → 194 → −50 ×3 → 44 → −50 bị chặn (below_zero)
  if (r ->> 'applied')::int <> 6 or (select count(*) from jsonb_array_elements(r -> 'skipped') x where x ->> 'reason' = 'invalid_tag') <> 2
     or (select count(*) from jsonb_array_elements(r -> 'skipped') x where x ->> 'reason' = 'below_zero') <> 1 then
    raise exception 'FAIL: trừ điểm %', r;
  end if;
  select x into st from jsonb_array_elements(public.class_live_board(class_x, d) -> 'students') x where (x ->> 'id')::uuid = s2;
  if (st ->> 'today')::int <> 44 then raise exception 'FAIL: điểm sau trừ %', st; end if;
  execute 'reset role';
  if not exists (select 1 from public.reward_ledger where student_id = s2 and delta = -5 and note = 'Trừ điểm')
     or not exists (select 1 from public.reward_ledger where student_id = s2 and delta = -1 and note = 'Sửa nhầm') then
    raise exception 'FAIL: nhãn trừ điểm / sửa nhầm';
  end if;
  execute 'set local role authenticated';

  -- Đánh số buổi: buổi hôm nay là Buổi 10 → ngày mai là Buổi 11 (không phải số buổi + 1 = 2)
  if (public.class_live_board(class_x, d + 1) ->> 'next_session_no')::int <> 11 then
    raise exception 'FAIL: số buổi tiếp theo %', public.class_live_board(class_x, d + 1) ->> 'next_session_no';
  end if;

  -- Lớp trường công lập (GDTC trường công): có mặt +5, trần 20
  execute 'reset role';
  insert into public.classes (name, program_id, class_type_id)
  values ('TEST LIVE Z', program, (select id from public.class_types where code = 'pe_core')) returning id into class_z;
  insert into public.class_staff (class_id, user_id, role) values (class_z, coach_a, 'coach');
  execute 'set local role authenticated';
  b := public.class_live_board(class_z, d);
  if b -> 'rules' ->> 'kind' <> 'public_school' or (b -> 'rules' ->> 'session_cap')::int <> 20 then raise exception 'FAIL: quy tắc lớp công lập %', b -> 'rules'; end if;
  s3 := (public.class_live_create_student(class_z, 'Test Cong Lap', null, null, null) ->> 'id')::uuid;
  r := public.class_live_sync(jsonb_build_array(
    jsonb_build_object('op', 'mark', 'class_id', class_z, 'date', d, 'student_id', s3, 'attendance', 'present'),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_z, 'date', d, 'student_id', s3, 'delta', 10),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_z, 'date', d, 'student_id', s3, 'delta', 10),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_z, 'date', d, 'student_id', s3, 'delta', 5)));
  select x into st from jsonb_array_elements(public.class_live_board(class_z, d) -> 'students') x where (x ->> 'id')::uuid = s3;
  if (st ->> 'today')::int <> 20 or jsonb_array_length(r -> 'skipped') <> 1 then raise exception 'FAIL: lớp công lập % %', st, r; end if;

  -- 4. HLV B không xem / chấm được lớp X
  perform set_config('request.jwt.claims', json_build_object('sub', coach_b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', coach_b::text, true);
  ok := false;
  begin perform public.class_live_board(class_x, d);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: HLV B xem được lớp X'; end if;
  r := public.class_live_sync(jsonb_build_array(
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s1, 'delta', 5)));
  if (r ->> 'applied')::int <> 0 then raise exception 'FAIL: HLV B chấm được lớp X'; end if;
  ok := false;
  begin perform public.class_live_set_opening(class_x, s1, 999);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: HLV B sửa điểm khởi đầu lớp X'; end if;

  raise exception 'ALL_OK';
end $$;
