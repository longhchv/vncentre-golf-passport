-- Kiểm thử thu hồi mã VNC khi hoàn tiền (migration 20261128000005).
-- Quy ước: chạy trong một khối DO; thành công thì raise 'ALL_OK' để toàn bộ dữ liệu thử bị huỷ.

do $$
declare
  buyer_u uuid := gen_random_uuid();
  admin_u uuid := gen_random_uuid();
  me uuid; g uuid;
  my_code text; c1 text; c2 text;
  o1 uuid; o2 uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (buyer_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rf-buy@example.test', now()),
    (admin_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rf-admin@example.test', now());
  insert into public.user_roles (user_id, role) values (admin_u, 'admin');
  insert into public.students (full_name) values ('Test Refund Me') returning id, student_code into me, my_code;
  insert into public.guardians (user_id, full_name) values (buyer_u, 'Test Refund Buyer') returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (me, g, 'self', true, true, 'admin', 'active', now());
  select code into c1 from public.vnc_codes where status = 'available' and tier = 'vang' order by code limit 1;
  select code into c2 from public.vnc_codes where status = 'available' and tier = 'dong' order by code limit 1;

  -- Mua 2 số, trả tiền, đặt số 1 làm mã chính
  perform set_config('request.jwt.claims', json_build_object('sub', buyer_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer_u::text, true);
  execute 'set local role authenticated';
  o1 := (public.vnc_order_place(c1) ->> 'order_id')::uuid;
  o2 := (public.vnc_order_place(c2) ->> 'order_id')::uuid;
  execute 'reset role';
  perform public.mark_order_paid((select order_code from public.orders where id = o1), 100000000, 'RF1');
  perform public.mark_order_paid((select order_code from public.orders where id = o2), 100000000, 'RF2');
  execute 'set local role authenticated';
  perform public.vnc_set_primary(me, c1);
  execute 'reset role';
  if (select student_code from public.students where id = me) <> 'VNC-' || c1 then raise exception 'FAIL: đặt mã chính'; end if;

  -- Admin hoàn tiền đơn 1 (số đang là mã chính) → thu hồi, mã chính quay về mã cấp ban đầu
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  execute 'set local role authenticated';
  perform public.refund_order(o1, 'Khách đổi ý');
  perform public.refund_order(o2, 'Khách đổi ý');
  execute 'reset role';
  if (select student_code from public.students where id = me) <> my_code then raise exception 'FAIL: mã chính không quay về mã cũ'; end if;
  if not exists (select 1 from public.vnc_codes where code = substr(my_code, 5) and owner_id = me and is_primary) then raise exception 'FAIL: cờ mã chính'; end if;
  if exists (select 1 from public.vnc_codes where code in (c1, c2) and (owner_id is not null or status <> 'reserved')) then
    raise exception 'FAIL: số chưa về kho ở trạng thái khoá';
  end if;
  if public.vnc_student_id(c1) is not null then raise exception 'FAIL: số đã thu hồi vẫn tra ra người cũ'; end if;
  if (select count(*) from public.vnc_code_events where code in (c1, c2) and action = 'revoke') <> 2 then raise exception 'FAIL: nhật ký thu hồi'; end if;
  if (select status from public.vnc_code_orders where order_id = o1) <> 'refunded' then raise exception 'FAIL: trạng thái đơn mã'; end if;
  if not exists (select 1 from public.notifications where user_id = buyer_u and type = 'vnc_revoked') then raise exception 'FAIL: thông báo'; end if;

  raise exception 'ALL_OK';
end $$;
