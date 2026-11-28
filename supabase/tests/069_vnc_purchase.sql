-- Kiểm thử đợt B (migration 20261128000003): mua số cho mình / mua tặng, giữ chỗ, trả tiền → gắn số, hết hạn → trả về kho.
-- Quy ước: chạy trong một khối DO; thành công thì raise 'ALL_OK' để toàn bộ dữ liệu thử bị huỷ.

do $$
declare
  buyer_u uuid := gen_random_uuid();
  admin_u uuid := gen_random_uuid();
  me uuid; friend uuid; g uuid;
  friend_code text;
  c1 text; c2 text; c3 text;
  j jsonb; o1 uuid; o2 uuid; o3 uuid;
  ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (buyer_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-buy@example.test', now()),
    (admin_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-buy-admin@example.test', now());
  insert into public.user_roles (user_id, role) values (admin_u, 'admin');
  insert into public.students (full_name) values ('Test Buyer Self') returning id into me;
  insert into public.students (full_name) values ('Nguyen Van Ban') returning id, student_code into friend, friend_code;
  insert into public.guardians (user_id, full_name) values (buyer_u, 'Test Buyer') returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (me, g, 'self', true, true, 'admin', 'active', now());
  select code into c1 from public.vnc_codes where status = 'available' and tier = 'bac' order by code limit 1;
  select code into c2 from public.vnc_codes where status = 'available' and tier = 'dong' order by code limit 1;
  -- Số năm sinh chưa có trong sổ (không khoá trước)
  select x into c3 from (select '05' || y::text as x from generate_series(1960, 1999) y) z
  where public.vnc_tier_of(public.vnc_categories(x)) = 'nam_sinh' and not exists (select 1 from public.vnc_codes v where v.code = x) limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', buyer_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer_u::text, true);
  execute 'set local role authenticated';

  -- Người nhận bằng mã VNC: tên đã che
  j := public.vnc_recipient_preview(friend_code);
  if j ->> 'masked_name' <> 'N***** V** B**' then raise exception 'FAIL: che tên %', j; end if;
  -- Số thường không bán
  ok := false;
  begin perform public.vnc_order_place('012467'); exception when others then ok := sqlerrm in ('not_for_sale', 'code_not_available'); end;
  if not ok then raise exception 'FAIL: bán số thường'; end if;

  -- Mua cho mình: giữ chỗ, đơn đúng giá niêm yết
  j := public.vnc_order_place(c1);
  o1 := (j ->> 'order_id')::uuid;
  if (j ->> 'amount_vnd')::bigint <> public.vnc_list_price('bac') then raise exception 'FAIL: giá %', j; end if;
  if exists (select 1 from jsonb_array_elements(public.vnc_search(c1)) x where x ->> 'code' = c1) then raise exception 'FAIL: số đang giữ vẫn hiện'; end if;
  ok := false;
  begin perform public.vnc_order_place(c1); exception when others then ok := sqlerrm = 'code_not_available'; end;
  if not ok then raise exception 'FAIL: hai đơn cho một số'; end if;
  if public.order_detail(o1) ->> 'vnc_code' <> c1 or public.order_detail(o1) ->> 'product_code' <> 'vnc_code' then raise exception 'FAIL: chi tiết đơn'; end if;

  -- Mua tặng bằng mã VNC; mua số năm sinh chưa có trong sổ
  o2 := (public.vnc_order_place(c2, friend_code) ->> 'order_id')::uuid;
  o3 := (public.vnc_order_place(c3) ->> 'order_id')::uuid;
  execute 'reset role';

  -- Trả tiền đơn 1, 2 (như webhook payOS)
  perform public.mark_order_paid((select order_code from public.orders where id = o1), 10000000, 'TEST1');
  perform public.mark_order_paid((select order_code from public.orders where id = o2), 10000000, 'TEST2');
  if not exists (select 1 from public.vnc_codes where code = c1 and owner_id = me and status = 'sold' and acquired_by = 'mua' and not is_primary) then
    raise exception 'FAIL: mua cho mình';
  end if;
  if not exists (select 1 from public.vnc_codes where code = c2 and owner_id = friend and status = 'sold') then raise exception 'FAIL: mua tặng'; end if;
  if (select status from public.vnc_code_orders where order_id = o1) <> 'paid' then raise exception 'FAIL: trạng thái đơn mã'; end if;

  -- Đơn 3 hết hạn → số năm sinh bỏ khỏi sổ; số đẹp hết hạn → về kho
  update public.orders set status = 'expired' where id = o3;
  if exists (select 1 from public.vnc_codes where code = c3) then raise exception 'FAIL: số năm sinh chưa trả'; end if;
  -- Trả tiền sau khi hết hạn mà số vẫn trống → vẫn gắn
  update public.orders set status = 'paid', paid_at = now() where id = o3;
  if not exists (select 1 from public.vnc_codes where code = c3 and owner_id = me and status = 'sold') then raise exception 'FAIL: trả sau hạn'; end if;

  -- Admin không mở tay số đang chờ thanh toán
  select code into c1 from public.vnc_codes where status = 'available' and tier = 'vang' order by code limit 1;
  perform set_config('request.jwt.claim.sub', buyer_u::text, true);
  execute 'set local role authenticated';
  o1 := (public.vnc_order_place(c1) ->> 'order_id')::uuid;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin perform public.vnc_admin_set_lock(c1, false); exception when others then ok := sqlerrm = 'code_in_order'; end;
  if not ok then raise exception 'FAIL: mở được số đang chờ thanh toán'; end if;
  execute 'reset role';
  update public.orders set status = 'expired' where id = o1;
  if (select status from public.vnc_codes where code = c1) <> 'available' then raise exception 'FAIL: số đẹp hết hạn chưa về kho'; end if;

  raise exception 'ALL_OK';
end $$;
