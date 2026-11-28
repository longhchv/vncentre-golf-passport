-- Kiểm thử lớp học trực tiếp việc 4, 6, 7 (migration 20261128000004): đội A/B, đổi quà trên lớp, quà riêng của lớp,
-- tóm tắt cuối buổi gửi phụ huynh, phụ huynh xem lịch sử buổi học của con.
-- Quy ước: chạy trong một khối DO; thành công thì raise 'ALL_OK' để toàn bộ dữ liệu thử bị huỷ.

do $$
declare
  coach_u uuid := gen_random_uuid();
  parent_u uuid := gen_random_uuid();
  program uuid; class_x uuid; class_y uuid;
  s1 uuid; s2 uuid; other uuid; g uuid;
  gift uuid; global_gift uuid;
  d date := public.vn_date(now());
  j jsonb; st jsonb;
  n int;
  ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (coach_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-more-coach@example.test', now()),
    (parent_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-more-parent@example.test', now());
  insert into public.user_roles (user_id, role) values (coach_u, 'coach');
  select id into program from public.programs where code = 'core20';
  insert into public.classes (name, program_id) values ('TEST MORE X', program) returning id into class_x;
  insert into public.classes (name, program_id) values ('TEST MORE Y', program) returning id into class_y;
  insert into public.class_staff (class_id, user_id, role) values (class_x, coach_u, 'coach');
  insert into public.students (full_name) values ('Test More One') returning id into s1;
  insert into public.students (full_name) values ('Test More Two') returning id into s2;
  insert into public.students (full_name) values ('Test More Other') returning id into other;
  insert into public.enrollments (student_id, class_id) values (s1, class_x), (s2, class_x), (other, class_y);
  insert into public.guardians (user_id, full_name) values (parent_u, 'Test More Parent') returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s1, g, 'mother', true, true, 'admin', 'active', now());
  insert into public.gift_items (name_vi, points) values ('Test quà chung', 30) returning id into global_gift;
  insert into public.gift_stock_moves (gift_id, qty, reason) values (global_gift, 5, 'restock');

  perform set_config('request.jwt.claims', json_build_object('sub', coach_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', coach_u::text, true);
  execute 'set local role authenticated';

  -- Buổi học: điểm, đội, nhận xét
  j := public.class_live_sync(jsonb_build_array(
    jsonb_build_object('op', 'mark', 'class_id', class_x, 'date', d, 'student_id', s1, 'attendance', 'present', 'team', 'A',
                       'comment_tags', '["focused"]'::jsonb, 'note', 'Nghe lời'),
    jsonb_build_object('op', 'mark', 'class_id', class_x, 'date', d, 'student_id', s2, 'team', 'B'),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s1, 'delta', 50, 'tag', 'rules'),
    jsonb_build_object('op', 'points', 'id', gen_random_uuid(), 'class_id', class_x, 'date', d, 'student_id', s2, 'delta', 20, 'tag', 'game')));
  if (j ->> 'applied')::int <> 4 then raise exception 'FAIL: sync %', j; end if;
  j := public.class_live_board(class_x, d);
  select x into st from jsonb_array_elements(j -> 'students') x where (x ->> 'id')::uuid = s1;
  if st ->> 'team' <> 'A' then raise exception 'FAIL: đội %', st; end if;

  -- Quà riêng của lớp X: hiện cho bạn lớp X, không hiện cho lớp khác
  gift := public.class_live_gift_add(class_x, 'Test bóng golf', 40, 3);
  j := public.class_live_gifts(class_x, s1);
  if (j ->> 'available')::int <> 60 or jsonb_array_length(j -> 'items') < 2 then raise exception 'FAIL: quà của lớp %', j; end if;
  if (select (x ->> 'gap')::int from jsonb_array_elements(j -> 'items') x where (x ->> 'id')::uuid = gift) <> 0 then raise exception 'FAIL: còn thiếu'; end if;
  execute 'reset role';
  if not public.gift_visible_to((select class_id from public.gift_items where id = gift), s1)
     or public.gift_visible_to((select class_id from public.gift_items where id = gift), other) then
    raise exception 'FAIL: quà riêng lộ sang lớp khác';
  end if;
  execute 'set local role authenticated';
  -- HLV đổi quà hộ: trừ điểm hiện có, tổng tích luỹ giữ nguyên
  perform public.gift_order_place(s1, gift, 1, 'school');
  j := public.class_live_gifts(class_x, s1);
  if (j ->> 'available')::int <> 20 or (j ->> 'total')::int <> 60 or (j ->> 'next_gap')::int <> 10 then raise exception 'FAIL: sau đổi quà %', j; end if;
  -- HLV không đổi quà cho bạn lớp khác
  ok := false;
  begin perform public.gift_order_place(other, global_gift, 1, 'school'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: đổi quà cho bạn lớp khác'; end if;

  -- Tóm tắt cuối buổi: một lần mỗi buổi
  n := public.class_live_send_summary(class_x, d);
  if n <> 2 then raise exception 'FAIL: gửi % tóm tắt', n; end if;
  ok := false;
  begin perform public.class_live_send_summary(class_x, d); exception when others then ok := sqlerrm = 'already_sent'; end;
  if not ok then raise exception 'FAIL: gửi tóm tắt hai lần'; end if;
  execute 'reset role';
  if not exists (select 1 from public.notifications where user_id = parent_u and type = 'class_summary' and body_vi like '%được 60 điểm%Nghe lời%') then
    raise exception 'FAIL: phụ huynh không nhận tóm tắt: %', (select body_vi from public.notifications where user_id = parent_u order by created_at desc limit 1);
  end if;

  -- Phụ huynh xem lịch sử buổi học của con, không xem được bạn khác
  perform set_config('request.jwt.claims', json_build_object('sub', parent_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', parent_u::text, true);
  execute 'set local role authenticated';
  j := public.class_live_student_report(s1);
  if jsonb_array_length(j -> 'sessions') <> 1 or (j -> 'sessions' -> 0 ->> 'points')::int <> 60 or j -> 'sessions' -> 0 ->> 'note' <> 'Nghe lời' then
    raise exception 'FAIL: phụ huynh xem %', j;
  end if;
  ok := false;
  begin perform public.class_live_student_report(s2); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: phụ huynh xem được bạn khác'; end if;

  raise exception 'ALL_OK';
end $$;
