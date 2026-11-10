-- Spec 19 · bước 5 (phần C): kho quà, đổi quà, huỷ / hoàn điểm, trạng thái, phí ship. Tiêu chí 7, 8 (tuần tự), 9, 10.
-- Tiêu chí 8 với hai phiên chạy song song cần kiểm trên staging (PGlite chỉ có một kết nối). Toàn bộ bị huỷ ở cuối.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

create or replace function pg_temp.bal(p uuid) returns int language sql as $f$
  select coalesce(sum(delta), 0)::int from public.reward_ledger where student_id = p and not is_frozen
$f$;
create or replace function pg_temp.stock(g uuid) returns int language sql as $f$
  select coalesce(sum(qty), 0)::int from public.gift_stock_moves where gift_id = g
$f$;

do $$
declare
  adm uuid := gen_random_uuid();
  par uuid := gen_random_uuid();
  other uuid := gen_random_uuid();   -- phụ huynh khác
  kidu uuid := gen_random_uuid();    -- tài khoản con
  k1 uuid; k2 uuid; g1 uuid; g2 uuid; g300 uuid; gd uuid; o1 uuid; o2 uuid; op uuid; ship uuid; ser uuid; v_t uuid;
  r jsonb; ok boolean; n int; v_rank int; v_code bigint;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rwg-' || x || '@example.test', now()
  from unnest(array[adm, par, other, kidu]) x;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.students (full_name, date_of_birth) values ('Test RWG Một', '2013-05-01') returning id into k1;
  insert into public.students (full_name, birth_year) values ('Test RWG Hai', 2015) returning id into k2;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH RWG', '+84900004701', par) returning id into gd;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (k1, gd, 'mother', true, true, 'admin', 'active', now());
  insert into public.student_accounts (student_id, username, user_id) values (k1, 'test.rwg1', kidu);

  -- Điểm: 250 khả dụng + 100 đang treo (gói Free) cho k1; điểm xếp hạng từ một chặng
  ser := public.league_series_id();
  insert into public.tournaments (series_id, season_id, stage_no, played_on)
  select ser, id, 81, '2026-11-08' from public.seasons where '2026-11-08' between start_date and end_date order by start_date desc limit 1
  returning id into v_t;
  insert into public.tournament_results (tournament_id, student_id, raw_name, points_participation, points_rank, source)
  values (v_t, k1, 'Test RWG Một', 50, 150, 'import');                                  -- +200 điểm thưởng qua phần A
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id) values (k1, 50, 'partner_visit', 'partner_visit', gen_random_uuid());
  insert into public.reward_ledger (student_id, delta, reason, source_type, is_frozen) values (k1, 100, 'admin_adjust', 'test', true);
  if pg_temp.bal(k1) <> 250 then raise exception 'FAIL chuẩn bị số dư: %', pg_temp.bal(k1); end if;
  select total_points into v_rank from public.league_standings where student_id = k1 and series_id = ser;

  ------------------------------------------------------------------ Admin: kho quà
  perform pg_temp.act_as(adm);
  insert into public.gift_items (name_vi, name_en, kind, points) values ('Bóng tập', 'Practice balls', 'equipment', 100) returning id into g1;
  insert into public.gift_items (name_vi, name_en, kind, points, per_student_limit) values ('Mũ', 'Cap', 'apparel', 50, 1) returning id into g2;
  insert into public.gift_items (name_vi, name_en, kind, points) values ('Áo', 'Shirt', 'apparel', 300) returning id into g300;
  perform public.gift_stock_add(g1, 5);
  perform public.gift_stock_add(g2, 3);
  perform public.gift_stock_add(g300, 2);
  ok := false;
  begin perform public.gift_stock_add(g1, -10, 'adjust', 'kiểm kê'); exception when invalid_parameter_value then ok := sqlerrm = 'out_of_stock'; end;
  if not ok then raise exception 'FAIL tồn âm'; end if;
  ok := false;
  begin perform public.gift_stock_add(g1, -1, 'adjust', null); exception when invalid_parameter_value then ok := sqlerrm = 'note_required'; end;
  if not ok then raise exception 'FAIL điều chỉnh kho không ghi chú'; end if;
  if (select (x ->> 'stock')::int from jsonb_array_elements(public.gift_admin_items()) x where x ->> 'id' = g1::text) <> 5 then raise exception 'FAIL tồn kho admin'; end if;

  ------------------------------------------------------------------ Phụ huynh: danh mục + số dư khả dụng (không tính phần treo)
  perform pg_temp.act_as(par);
  r := public.gift_catalog(k1);
  if (r ->> 'available')::int <> 250 or (r ->> 'frozen')::int <> 100 or not (r ->> 'can_redeem')::boolean then raise exception 'FAIL danh mục: %', r; end if;
  if jsonb_array_length(r -> 'items') <> 3 then raise exception 'FAIL số quà'; end if;

  ------------------------------------------------------------------ Tiêu chí 7: đổi 300 khi khả dụng 250 → từ chối, sổ và kho không đổi
  ok := false;
  begin perform public.gift_order_place(k1, g300, 1, 'office'); exception when invalid_parameter_value then ok := sqlerrm = 'insufficient_points'; end;
  if not ok then raise exception 'FAIL đổi quá số dư'; end if;
  perform pg_temp.act_as(null);
  if pg_temp.bal(k1) <> 250 or pg_temp.stock(g300) <> 2 or exists (select 1 from public.gift_orders where student_id = k1) then
    raise exception 'FAIL sổ / kho đổi sau lần bị từ chối';
  end if;

  ------------------------------------------------------------------ Đổi thành công: đơn + sổ (−) + kho (−); điểm xếp hạng không đổi (tiêu chí 10)
  perform pg_temp.act_as(par);
  r := public.gift_order_place(k1, g1, 2, 'league');
  o1 := (r ->> 'order_id')::uuid;
  if (r ->> 'available')::int <> 50 then raise exception 'FAIL số dư sau đổi: %', r; end if;
  perform pg_temp.act_as(null);
  if (select status from public.gift_orders where id = o1) <> 'placed' or (select points from public.gift_orders where id = o1) <> 200 then raise exception 'FAIL đơn'; end if;
  if not exists (select 1 from public.reward_ledger where source_id = o1 and reason = 'gift_order' and delta = -200 and not is_frozen) then raise exception 'FAIL dòng sổ đổi quà'; end if;
  if pg_temp.stock(g1) <> 3 then raise exception 'FAIL kho sau đổi'; end if;
  if (select total_points from public.league_standings where student_id = k1 and series_id = ser) <> v_rank then raise exception 'FAIL đổi quà làm đổi điểm xếp hạng'; end if;

  ------------------------------------------------------------------ Tiêu chí 8 (tuần tự): số dư chỉ đủ một lần → lần thứ hai bị từ chối
  perform pg_temp.act_as(par);
  r := public.gift_order_place(k1, g2, 1, 'school');
  o2 := (r ->> 'order_id')::uuid;
  ok := false;
  begin perform public.gift_order_place(k1, g2, 1, 'school'); exception when invalid_parameter_value then ok := sqlerrm in ('insufficient_points', 'limit_reached'); end;
  if not ok then raise exception 'FAIL lần đổi thứ hai'; end if;
  perform pg_temp.act_as(null);
  if pg_temp.bal(k1) <> 0 then raise exception 'FAIL số dư âm hoặc sai: %', pg_temp.bal(k1); end if;
  if (select count(*) from public.gift_orders where student_id = k1 and status <> 'cancelled') <> 2 then raise exception 'FAIL số đơn'; end if;
  -- Không bao giờ âm: mọi đơn đều kiểm khả dụng
  if exists (select 1 from public.reward_ledger where student_id = k1 group by student_id having sum(delta) filter (where not is_frozen) < 0) then
    raise exception 'FAIL số dư khả dụng âm';
  end if;

  ------------------------------------------------------------------ Tiêu chí 9: huỷ đơn "đã đặt" → hoàn điểm, nhập lại kho
  perform pg_temp.act_as(other);
  ok := false;
  begin perform public.gift_order_cancel(o1, 'x'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh khác huỷ được'; end if;
  perform pg_temp.act_as(par);
  perform public.gift_order_cancel(o1, 'Đổi ý');
  perform pg_temp.act_as(null);
  if pg_temp.bal(k1) <> 200 or pg_temp.stock(g1) <> 5 then raise exception 'FAIL hoàn sau huỷ: % / %', pg_temp.bal(k1), pg_temp.stock(g1); end if;
  if (select status from public.gift_orders where id = o1) <> 'cancelled' then raise exception 'FAIL trạng thái huỷ'; end if;
  if not exists (select 1 from public.reward_ledger where source_id = o1 and reason = 'gift_order_refund' and delta = 200) then raise exception 'FAIL dòng hoàn điểm'; end if;
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.gift_order_cancel(o1, 'lần 2'); exception when invalid_parameter_value then ok := sqlerrm = 'not_cancellable'; end;
  if not ok then raise exception 'FAIL huỷ hai lần'; end if;

  ------------------------------------------------------------------ Trạng thái: chỉ admin; phụ huynh không huỷ khi đã chuẩn bị
  ok := false;
  begin perform public.gift_order_set_status(o2, 'prepared'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh đổi trạng thái'; end if;
  perform pg_temp.act_as(adm);
  perform public.gift_order_set_status(o2, 'prepared');
  ok := false;
  begin perform public.gift_order_set_status(o2, 'shipped'); exception when invalid_parameter_value then ok := sqlerrm = 'invalid_transition'; end;
  if not ok then raise exception 'FAIL gửi bưu điện cho đơn nhận tại trường'; end if;
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.gift_order_cancel(o2, 'muộn'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh huỷ đơn đã chuẩn bị'; end if;
  perform pg_temp.act_as(adm);
  perform public.gift_order_set_status(o2, 'delivered');
  perform public.gift_order_set_status(o2, 'completed');
  ok := false;
  begin perform public.gift_order_cancel(o2, 'đã giao'); exception when invalid_parameter_value then ok := sqlerrm = 'not_cancellable'; end;
  if not ok then raise exception 'FAIL huỷ đơn đã giao'; end if;

  ------------------------------------------------------------------ Q8: gửi bưu điện, phí ship qua đơn payOS
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.gift_order_place(k1, g1, 1, 'post', '{"name":"Mẹ","phone":"0900","address":""}'); exception when invalid_parameter_value then ok := sqlerrm = 'address_required'; end;
  if not ok then raise exception 'FAIL gửi bưu điện thiếu địa chỉ'; end if;
  r := public.gift_order_place(k1, g1, 1, 'post', '{"name":"Mẹ An","phone":"0900004701","address":"1 Lê Lợi, Q1, TP.HCM"}');
  op := (r ->> 'order_id')::uuid;
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.gift_order_set_status(op, 'shipped'); exception when invalid_parameter_value then ok := sqlerrm = 'ship_fee_required'; end;
  if not ok then raise exception 'FAIL gửi khi chưa nhập phí'; end if;
  r := public.gift_order_set_ship_fee(op, 30000);
  ship := (r ->> 'ship_order_id')::uuid;
  ok := false;
  begin perform public.gift_order_set_status(op, 'shipped'); exception when invalid_parameter_value then ok := sqlerrm = 'ship_fee_unpaid'; end;
  if not ok then raise exception 'FAIL gửi khi chưa trả phí'; end if;
  perform pg_temp.act_as(par);
  r := public.order_detail(ship);
  if (r ->> 'amount_vnd')::int <> 30000 or r ->> 'product_vi' <> 'Phí gửi quà qua bưu điện' then raise exception 'FAIL đơn phí ship: %', r; end if;
  if not exists (select 1 from public.notifications where user_id = par and type = 'gift_ship_fee') then raise exception 'FAIL thông báo phí ship'; end if;
  perform pg_temp.act_as(null);
  select order_code into v_code from public.orders where id = ship;
  r := public.mark_order_paid(v_code, 30000, 'TEST');
  if r ->> 'result' <> 'paid' then raise exception 'FAIL trả phí: %', r; end if;
  if not exists (select 1 from public.notifications where user_id = par and type = 'order_paid' and body_vi like '%phí gửi quà%') then raise exception 'FAIL lời thông báo đã trả'; end if;
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.gift_order_cancel(op, 'thôi'); exception when invalid_parameter_value then ok := sqlerrm = 'ship_fee_paid'; end;
  if not ok then raise exception 'FAIL phụ huynh huỷ khi đã trả phí ship'; end if;
  perform pg_temp.act_as(adm);
  perform public.gift_order_set_status(op, 'shipped');
  r := public.gift_admin_orders('shipped');
  if not exists (select 1 from jsonb_array_elements(r) x where x ->> 'id' = op::text and x ->> 'ship_order_status' = 'paid') then raise exception 'FAIL danh sách đơn admin'; end if;

  ------------------------------------------------------------------ Giới hạn mỗi người, hết hàng, quà ngừng bán
  update public.gift_items set is_active = false where id = g300;
  perform pg_temp.act_as(null);
  insert into public.reward_ledger (student_id, delta, reason, source_type) values (k1, 1000, 'admin_adjust', 'test');
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.gift_order_place(k1, g300, 1, 'office'); exception when invalid_parameter_value then ok := sqlerrm = 'gift_unavailable'; end;
  if not ok then raise exception 'FAIL đổi quà ngừng bán'; end if;
  ok := false;
  begin perform public.gift_order_place(k1, g2, 1, 'office'); exception when invalid_parameter_value then ok := sqlerrm = 'limit_reached'; end;
  if not ok then raise exception 'FAIL vượt giới hạn mỗi người'; end if;
  ok := false;
  begin perform public.gift_order_place(k1, g1, 9, 'office'); exception when invalid_parameter_value then ok := sqlerrm = 'out_of_stock'; end;
  if not ok then raise exception 'FAIL đổi quá tồn kho'; end if;

  ------------------------------------------------------------------ Q7: tài khoản con chỉ xem; phụ huynh khác / con khác bị chặn
  perform pg_temp.act_as(kidu);
  r := public.gift_catalog(k1);
  if (r ->> 'can_redeem')::boolean then raise exception 'FAIL tài khoản con được đổi'; end if;
  ok := false;
  begin perform public.gift_order_place(k1, g1, 1, 'office'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL tài khoản con tự đổi quà'; end if;
  if jsonb_array_length(public.gift_my_orders(k1)) <> 3 then raise exception 'FAIL con xem đơn của mình'; end if;
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.gift_catalog(k2); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL xem quà của con người khác'; end if;
  r := public.reward_balance(k1);
  if not exists (select 1 from jsonb_array_elements(r -> 'recent') x where x #>> '{gift,name_vi}' = 'Bóng tập') then raise exception 'FAIL ví thiếu tên quà'; end if;
  ok := false;
  begin perform public.gift_admin_orders(null); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh xem đơn admin'; end if;

  -- Tiêu chí 10 lần cuối: điểm xếp hạng vẫn nguyên
  perform pg_temp.act_as(null);
  if (select total_points from public.league_standings where student_id = k1 and series_id = ser) <> v_rank then raise exception 'FAIL BXH đổi'; end if;
  if has_function_privilege('authenticated', 'public.reward_available(uuid)', 'execute') then raise exception 'FAIL reward_available lộ ra ngoài'; end if;

  raise exception 'ALL_OK';
end $$;
