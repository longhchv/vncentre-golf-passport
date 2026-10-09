-- Kho sự kiện: lấy danh sách mẫu, xuất kho, phát quà trừ dần ở quầy (hết quà / không đủ điểm bị chặn), kiểm kê khi trả về.
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
  btc uuid := gen_random_uuid();
  ev uuid; batch uuid; a text; b text; x jsonb; v_gift uuid; v_bat uuid; ok boolean; n int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-inv-adm@example.test', now()),
    (btc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-inv-btc@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  perform pg_temp.act_as(adm);
  ev := public.admin_create_event('{"name_vi":"Thử kho","event_date":"2026-10-10"}');
  batch := public.create_event_card_batch(ev, 2);
  perform public.set_event_staff(ev, btc, true);
  perform pg_temp.act_as(null);
  update public.events set status = 'open' where id = ev;
  select passport_code into a from public.passports where batch_id = batch order by passport_code limit 1;
  select passport_code into b from public.passports where batch_id = batch order by passport_code offset 1 limit 1;
  execute 'set local role anon';
  perform public.event_register(a, '{"player_type":"child","full_name":"Bé Kho Một","phone":"0944000001"}');
  perform public.event_register(b, '{"player_type":"child","full_name":"Bé Kho Hai","phone":"0944000002"}');

  perform pg_temp.act_as(btc);
  -- Lấy danh sách mẫu 26 món, chạy lại không nhân đôi
  n := public.inv_seed_from_template(ev);
  if n <> 26 or public.inv_seed_from_template(ev) <> 0 then raise exception 'FAIL: lấy danh sách mẫu %', n; end if;
  x := public.inv_list(ev);
  if jsonb_array_length(x) <> 26 or (select count(*) from jsonb_array_elements(x) i where i ->> 'category' = 'gift') <> 2 then
    raise exception 'FAIL: phân loại quà %', x;
  end if;
  -- Quà Móc khóa: 1 cái, 20 điểm; thêm món Gậy sắt 7: xuất 10
  select (i ->> 'id')::uuid into v_gift from jsonb_array_elements(x) i where i ->> 'name' = 'Móc khóa';
  perform public.inv_save_item(ev, jsonb_build_object('id', v_gift, 'qty_out', 1, 'points', 20));
  v_bat := public.inv_save_item(ev, '{"category":"equipment","box":"THI ĐẤU","name":"Gậy sắt 7","unit":"cây","qty_out":10}');

  -- Quầy: điểm thẻ a = 20 (đủ), b = 10 (không đủ)
  perform public.counter_save_scores(ev, a, '{"putt":"5","chip":"5","pitch":"5","full_swing":"5"}');
  perform public.counter_save_scores(ev, b, '{"putt":"5","chip":"5"}');
  ok := false;
  begin perform public.counter_redeem_gift(ev, b, v_gift); exception when invalid_parameter_value then ok := sqlerrm like 'not_enough_points%'; end;
  if not ok then raise exception 'FAIL: đổi quà khi không đủ điểm'; end if;
  perform public.counter_redeem_gift(ev, a, v_gift);
  x := public.inv_gifts(ev);
  if (select (g ->> 'remaining')::int from jsonb_array_elements(x) g where (g ->> 'id')::uuid = v_gift) <> 0 then raise exception 'FAIL: chưa trừ quà %', x; end if;
  -- Hết quà
  perform public.counter_save_scores(ev, b, '{"putt":"5","chip":"5","pitch":"10","full_swing":"10"}');
  ok := false;
  begin perform public.counter_redeem_gift(ev, b, v_gift); exception when invalid_parameter_value then ok := sqlerrm = 'out_of_stock'; end;
  if not ok then raise exception 'FAIL: phát khi hết quà'; end if;
  -- Không cho sửa số xuất thấp hơn số đã phát; không xoá món đã phát
  ok := false;
  begin perform public.inv_save_item(ev, jsonb_build_object('id', v_gift, 'qty_out', 0)); exception when invalid_parameter_value then ok := sqlerrm like 'out_below_given%'; end;
  if not ok then raise exception 'FAIL: xuất thấp hơn đã phát'; end if;
  ok := false;
  begin perform public.inv_delete_item(v_gift); exception when invalid_parameter_value then ok := sqlerrm = 'item_has_redemptions'; end;
  if not ok then raise exception 'FAIL: xoá món đã phát'; end if;

  -- Kiểm kê khi trả về: gậy xuất 10, trả 8 (1 hỏng) → thiếu 2
  perform public.inv_save_item(ev, jsonb_build_object('id', v_bat, 'qty_returned', 8, 'qty_damaged', 1, 'packed', true));
  x := public.inv_list(ev);
  if (select (i ->> 'missing')::int from jsonb_array_elements(x) i where (i ->> 'id')::uuid = v_bat) <> 2
     or not (select (i ->> 'packed')::boolean from jsonb_array_elements(x) i where (i ->> 'id')::uuid = v_bat) then
    raise exception 'FAIL: kiểm kê %', x;
  end if;
  ok := false;
  begin perform public.inv_save_item(ev, jsonb_build_object('id', v_bat, 'qty_returned', 1, 'qty_damaged', 3)); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: hỏng nhiều hơn trả'; end if;

  -- Người không phải BTC sự kiện không xem được kho
  perform pg_temp.act_as(null);
  execute 'set local role anon';
  ok := false;
  begin perform public.inv_list(ev); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: anon xem kho'; end if;

  raise exception 'ALL_OK';
end $$;
