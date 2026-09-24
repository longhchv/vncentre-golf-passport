-- Kiểm thử Bước 13: báo mất sổ, đơn hàng, R10 (chỉ webhook đổi trạng thái đã thanh toán), hết hạn, hoá đơn, hoàn tiền, cấp sổ mới.
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
  par uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  school uuid; s1 uuid; g1 uuid; g2 uuid; tier uuid; batch uuid;
  p_old uuid; p_new uuid; code_new text;
  o1 uuid; o2 uuid; oc bigint; r jsonb; ok boolean; n int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s13-adm@example.test', now()),
    (par, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s13-par@example.test', now()),
    (viewer, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s13-view@example.test', now()),
    (stranger, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s13-x@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  select id into school from public.schools order by created_at limit 1;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Mat So', '2016-01-01', school) returning id into s1;
  insert into public.guardians (user_id, full_name) values (par, 'PH quan ly') returning id into g1;
  insert into public.guardians (user_id, full_name) values (viewer, 'PH chi xem') returning id into g2;
  insert into public.student_guardians (student_id, guardian_id, is_primary, can_manage, status) values (s1, g1, true, true, 'active'), (s1, g2, false, false, 'active');
  select id into tier from public.passport_tiers order by level_from limit 1;
  perform pg_temp.act_as(adm);
  batch := public.create_passport_batch('Test S13', tier, 2, 'decal');
  perform pg_temp.act_as(null);
  select id into p_old from public.passports where batch_id = batch order by passport_code limit 1;
  select id, passport_code into p_new, code_new from public.passports where batch_id = batch and id <> p_old limit 1;
  update public.passports set student_id = s1, status = 'active', issued_at = now(), activated_at = now() where id = p_old;

  ------------------------------------------------------------------ Quyền báo mất
  perform pg_temp.act_as(viewer);
  ok := false;
  begin perform public.report_lost_passport(p_old); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người chỉ xem báo mất được'; end if;
  perform pg_temp.act_as(stranger);
  ok := false;
  begin perform public.report_lost_passport(p_old); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người lạ báo mất được'; end if;

  ------------------------------------------------------------------ Báo mất → lost ngay + đơn 200.000 đ, hạn 7 ngày
  perform pg_temp.act_as(par);
  o1 := public.report_lost_passport(p_old);
  if public.report_lost_passport(p_old) <> o1 then raise exception 'FAIL: báo mất lần 2 tạo đơn mới'; end if;
  r := public.order_detail(o1);
  if r ->> 'status' <> 'pending' or (r ->> 'amount_vnd')::bigint <> (select price_vnd from public.products where code = 'passport_replacement') then raise exception 'FAIL đơn: %', r; end if;
  if (r ->> 'expires_at')::timestamptz not between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' then raise exception 'FAIL hạn đơn'; end if;
  perform pg_temp.act_as(null);
  if (select status from public.passports where id = p_old) <> 'lost' then raise exception 'FAIL: sổ chưa chuyển lost'; end if;
  oc := (select order_code from public.orders where id = o1);

  ------------------------------------------------------------------ R10: trình duyệt không tự đổi trạng thái
  perform pg_temp.act_as(par);
  update public.orders set status = 'paid' where id = o1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL R10: phụ huynh sửa được trạng thái đơn'; end if;
  ok := false;
  begin perform public.mark_order_paid(oc, 200000, 'x'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL R10: phụ huynh gọi được mark_order_paid'; end if;
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.mark_order_paid(oc, 200000, 'x'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL R10: admin gọi thẳng được mark_order_paid'; end if;
  perform pg_temp.act_as(stranger);
  ok := false;
  begin perform public.order_detail(o1); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người lạ xem được đơn'; end if;

  ------------------------------------------------------------------ Hoá đơn
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.request_invoice(o1, '{"buyer_type":"company","buyer_name":"Cong ty A","tax_code":"123"}'); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: mã số thuế sai vẫn nhận'; end if;
  perform public.request_invoice(o1, '{"buyer_type":"company","buyer_name":"Công ty TNHH A","tax_code":"0101234567","address":"Hà Nội","email":"KT@A.VN"}');

  ------------------------------------------------------------------ Webhook (service_role) → đã thanh toán; trả thiếu thì không
  perform pg_temp.act_as(null);
  execute 'set local role service_role';
  r := public.mark_order_paid(oc, 150000, 'thieu');
  if r ->> 'result' <> 'underpaid' then raise exception 'FAIL: trả thiếu vẫn thành đã thanh toán %', r; end if;
  r := public.mark_order_paid(oc, 200000, 'REF1');
  if r ->> 'result' <> 'paid' then raise exception 'FAIL mark paid: %', r; end if;
  if public.mark_order_paid(oc, 200000, 'REF1') ->> 'result' <> 'already_paid' then raise exception 'FAIL: webhook lặp không an toàn'; end if;
  execute 'reset role';
  if not exists (select 1 from public.notifications where user_id = par and type = 'order_paid') then raise exception 'FAIL: chưa báo thanh toán thành công'; end if;

  ------------------------------------------------------------------ Admin: cần cấp sổ → gán sổ mới thay sổ mất → phụ huynh được báo
  perform pg_temp.act_as(adm);
  r := public.admin_orders(null, true);
  if not (r @> jsonb_build_array(jsonb_build_object('id', o1, 'needs_passport', true))) then raise exception 'FAIL: đơn không vào "Cần cấp sổ"'; end if;
  perform public.assign_passport(code_new, s1);
  if (select replaced_passport_id from public.passports where id = p_new) <> p_old then raise exception 'FAIL: sổ mới không trỏ sổ cũ'; end if;
  if jsonb_array_length(public.admin_orders(null, true)) > 0 and public.admin_orders(null, true) @> jsonb_build_array(jsonb_build_object('id', o1)) then
    raise exception 'FAIL: đơn vẫn ở "Cần cấp sổ" sau khi gán sổ';
  end if;
  perform pg_temp.act_as(null);
  if not exists (select 1 from public.notifications where user_id = par and type = 'passport_replaced') then raise exception 'FAIL: chưa báo sổ mới đã cấp'; end if;
  perform pg_temp.act_as(par);
  if public.order_detail(o1) ->> 'new_passport_code' <> code_new then raise exception 'FAIL: đơn không hiện mã sổ mới'; end if;

  ------------------------------------------------------------------ Hoá đơn đã xuất, hoàn tiền (bắt buộc ghi chú)
  perform pg_temp.act_as(adm);
  perform public.invoice_mark_issued(o1, 'HD-0001');
  ok := false;
  begin perform public.refund_order(o1, ''); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: hoàn tiền không ghi chú'; end if;
  perform public.refund_order(o1, 'Khách tìm lại được sổ');
  perform pg_temp.act_as(par);
  r := public.order_detail(o1);
  if r ->> 'status' <> 'refunded' or r -> 'invoice' ->> 'issued_invoice_no' <> 'HD-0001' then raise exception 'FAIL: trạng thái/hoá đơn: %', r; end if;

  ------------------------------------------------------------------ Hết hạn → expired; sổ vẫn lost; tạo lại đơn được
  perform pg_temp.act_as(null);
  update public.passports set status = 'active' where id = p_new;
  perform pg_temp.act_as(par);
  o2 := public.report_lost_passport(p_new);
  perform pg_temp.act_as(null);
  update public.orders set expires_at = now() - interval '1 minute' where id = o2;
  perform public.expire_orders();
  if (select status from public.orders where id = o2) <> 'expired' or (select status from public.passports where id = p_new) <> 'lost' then
    raise exception 'FAIL: hết hạn đơn';
  end if;
  perform pg_temp.act_as(par);
  if public.report_lost_passport(p_new) = o2 then raise exception 'FAIL: không tạo lại được đơn sau khi hết hạn'; end if;
  if jsonb_array_length(public.my_orders()) <> 3 then raise exception 'FAIL: my_orders %', jsonb_array_length(public.my_orders()); end if;
  perform pg_temp.act_as(viewer);
  if jsonb_array_length(public.my_orders()) <> 0 then raise exception 'FAIL: người chỉ xem thấy đơn'; end if;

  raise exception 'ALL_OK';
end $$;
