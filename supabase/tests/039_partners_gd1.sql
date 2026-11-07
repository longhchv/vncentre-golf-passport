-- Spec 18 · Golf Passport Partners GĐ1: QR động, lượt quầy, điểm, giới thiệu MỘT CẤP, đối soát, khoá chi trả, quyền quầy.
-- Tiêu chí 2, 3, 4, 5, 6, 7, 8 ở tầng SQL. Toàn bộ bị huỷ ở cuối.
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
  ca uuid := gen_random_uuid();   -- quầy Đảo Sen
  cb uuid := gen_random_uuid();   -- quầy đối tác khác
  ua uuid := gen_random_uuid();   -- khách A (phụ huynh), đăng ký qua link của B
  ub uuid := gen_random_uuid();   -- B: người giới thiệu A; chính B được C giới thiệu
  uc uuid := gen_random_uuid();   -- C
  sales uuid := gen_random_uuid();
  p1 uuid; p2 uuid; o_bonus uuid; o_pct uuid; o_fixed uuid;
  ga uuid; kid uuid; kid2 uuid;
  code_b text; code_c text; tok text; r jsonb; v1 uuid; v2 uuid; ok boolean; n int; st uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ptn-' || x || '@example.test', now()
  from unnest(array[adm, ca, cb, ua, ub, uc, sales]) x;
  insert into public.user_roles (user_id, role) values (adm, 'admin');

  insert into public.students (full_name, birth_year) values ('Nguyễn Văn An', 2015) returning id into kid;
  insert into public.students (full_name, birth_year) values ('Nguyễn Thị Bình', 2017) returning id into kid2;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH A', '+84900002001', ua) returning id into ga;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (kid, ga, 'mother', true, true, 'admin', 'active', now()), (kid2, ga, 'mother', true, true, 'admin', 'active', now());

  ------------------------------------------------------------------ Tiêu chí 1 (tầng dữ liệu): admin tạo đối tác, ưu đãi, quầy
  perform pg_temp.act_as(adm);
  insert into public.partners (name, kind, status, fee_rate, sales_owner_user_id) values ('Test Đảo Sen', 'driving_range', 'active', 0.08, sales) returning id into p1;
  insert into public.partners (name, kind, status, fee_rate) values ('Test đối tác khác', 'cafe', 'active', 0.05) returning id into p2;
  insert into public.partner_offers (partner_id, name_vi, kind, bonus_vi) values (p1, 'Tặng thêm 30 bóng', 'bonus_item', '+30 bóng') returning id into o_bonus;
  insert into public.partner_offers (partner_id, name_vi, kind, percent) values (p1, 'Giảm 10%', 'percent', 10) returning id into o_pct;
  insert into public.partner_offers (partner_id, name_vi, kind, percent, points_mode, fixed_points) values (p2, 'Giảm 15%', 'percent', 15, 'fixed', 25) returning id into o_fixed;
  perform public.partner_staff_set(p1, ca::text);
  perform public.partner_staff_set(p2, cb::text);
  if not exists (select 1 from public.user_roles where user_id = ca and role = 'partner_staff' and deleted_at is null) then
    raise exception 'FAIL gán quầy phải có vai partner_staff';
  end if;
  ok := false;
  begin update public.partners set fee_rate = 0.2 where id = p1; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL fee_rate ngoài 5–10%%'; end if;
  ok := false;
  begin insert into public.partner_offers (partner_id, name_vi, kind, percent) values (p1, 'Sai', 'percent', 60); exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL ưu đãi ngoài 10–50%%'; end if;

  ------------------------------------------------------------------ Tiêu chí 7: không bật được chi trả khi chưa duyệt pháp lý
  ok := false;
  begin update public.app_settings set value = 'true' where key = 'partners.payouts_enabled'; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL bật được chi trả khi chưa duyệt pháp lý'; end if;
  if (select value from public.app_settings where key = 'profile.business_tab_enabled') <> 'true'::jsonb then
    raise exception 'FAIL khối Kinh doanh phải bật';
  end if;

  ------------------------------------------------------------------ Giới thiệu: C → B → A
  perform pg_temp.act_as(uc);
  code_c := public.referral_my_code();
  if public.referral_my_code() <> code_c then raise exception 'FAIL mã giới thiệu phải cố định'; end if;
  perform pg_temp.act_as(ub);
  if (public.referral_claim(code_c) ->> 'ok')::boolean is not true then raise exception 'FAIL B gắn mã của C'; end if;
  if (public.referral_claim(code_c) ->> 'reason') <> 'already_linked' then raise exception 'FAIL gắn mã lần hai'; end if;
  code_b := public.referral_my_code();
  if (public.referral_claim(code_b) ->> 'ok')::boolean then raise exception 'FAIL tự giới thiệu chính mình'; end if;
  perform pg_temp.act_as(ua);
  if (public.referral_claim(lower(code_b)) ->> 'ok')::boolean is not true then raise exception 'FAIL A gắn mã của B'; end if;

  ------------------------------------------------------------------ Tiêu chí 2: QR động, quầy quét, 180.000 đ → +18 điểm
  perform pg_temp.act_as(ca);
  ok := false;
  begin perform public.partner_qr_issue(kid); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người không phải phụ huynh mở được QR'; end if;
  perform pg_temp.act_as(ua);
  tok := public.partner_qr_issue(kid) ->> 'token';
  perform pg_temp.act_as(ca);
  r := public.partner_scan(p1, tok);
  if r ->> 'name' <> 'Nguyễn V. A.' or jsonb_array_length(r -> 'offers') <> 2 or r ? 'birth_year' or r ? 'phone' or (r ->> 'limit_reached')::boolean then
    raise exception 'FAIL quét mã: %', r;
  end if;
  r := public.partner_record_visit(jsonb_build_object('partner_id', p1, 'token', tok, 'offer_id', o_bonus,
         'list_amount', 180000, 'paid_amount', 180000, 'invoice_no', 'HD-001'));
  v1 := (r ->> 'id')::uuid;
  if r ->> 'status' <> 'recorded' or (r ->> 'points')::int <> 18 then raise exception 'FAIL lượt 180.000 đ: %', r; end if;
  perform pg_temp.act_as(ua);
  if (public.reward_balance(kid) ->> 'balance')::int <> 18 then raise exception 'FAIL khách phải +18 điểm'; end if;

  -- Mã đã dùng / quá 60 giây → hết hạn
  perform pg_temp.act_as(ca);
  ok := false;
  begin perform public.partner_scan(p1, tok); exception when raise_exception then ok := sqlerrm = 'qr_expired'; end;
  if not ok then raise exception 'FAIL mã đã dùng phải báo hết hạn'; end if;
  perform pg_temp.act_as(ua);
  tok := public.partner_qr_issue(kid2) ->> 'token';
  perform pg_temp.act_as(null);
  update public.partner_qr_tokens set expires_at = now() - interval '1 second' where token = tok;
  perform pg_temp.act_as(ca);
  ok := false;
  begin perform public.partner_scan(p1, tok); exception when raise_exception then ok := sqlerrm = 'qr_expired'; end;
  if not ok then raise exception 'FAIL mã quá 60 giây phải báo hết hạn'; end if;

  ------------------------------------------------------------------ Tiêu chí 3: lần 2 trong ngày bị chặn; hoá đơn 6.000.000 đ → flagged
  perform pg_temp.act_as(ua);
  tok := public.partner_qr_issue(kid) ->> 'token';
  perform pg_temp.act_as(ca);
  if (public.partner_scan(p1, tok) ->> 'limit_reached')::boolean is not true then raise exception 'FAIL quét phải báo đã dùng hôm nay'; end if;
  ok := false;
  begin
    perform public.partner_record_visit(jsonb_build_object('partner_id', p1, 'token', tok, 'offer_id', o_pct, 'list_amount', 200000, 'paid_amount', 180000));
  exception when raise_exception then ok := sqlerrm = 'daily_limit';
  end;
  if not ok then raise exception 'FAIL lượt thứ 2 trong ngày không bị chặn'; end if;

  perform pg_temp.act_as(ua);
  tok := public.partner_qr_issue(kid2) ->> 'token';
  perform pg_temp.act_as(ca);
  r := public.partner_record_visit(jsonb_build_object('partner_id', p1, 'token', tok, 'offer_id', o_pct, 'list_amount', 6600000, 'paid_amount', 6000000));
  v2 := (r ->> 'id')::uuid;
  if r ->> 'status' <> 'flagged' or (r ->> 'points')::int <> 0 then raise exception 'FAIL hoá đơn 6.000.000 đ phải flagged: %', r; end if;
  perform pg_temp.act_as(null);
  if exists (select 1 from public.referral_earnings where visit_id = v2) then raise exception 'FAIL lượt flagged chưa được sinh thưởng'; end if;

  ------------------------------------------------------------------ Tiêu chí 4: thưởng một cấp
  if not exists (select 1 from public.referral_earnings where visit_id = v1 and referrer_user_id = ub and status = 'provisional' and amount = 9000) then
    raise exception 'FAIL lượt của A phải sinh 9.000 đ tạm tính cho B: % / % / %', (select jsonb_agg(to_jsonb(e)) from public.referral_earnings e), (select customer_user_id from public.partner_visits where id = v1), (select jsonb_agg(to_jsonb(l)) from public.referral_links l);
  end if;
  if exists (select 1 from public.referral_earnings where referrer_user_id = uc) then raise exception 'FAIL C (cấp trên của B) không được nhận gì'; end if;
  perform pg_temp.act_as(adm);
  perform public.partner_visit_review(v2);
  if (select status from public.partner_visits where id = v2) <> 'recorded'
     or not exists (select 1 from public.referral_earnings where visit_id = v2 and referrer_user_id = ub and amount = 300000) then
    raise exception 'FAIL admin xác nhận lượt flagged';
  end if;
  if exists (select 1 from public.referral_earnings where referrer_user_id = uc) then raise exception 'FAIL C nhận thưởng sau xác nhận'; end if;
  -- Thưởng không chuyển được sang confirmed khi chưa bật chi trả
  ok := false;
  begin perform pg_temp.act_as(null); update public.referral_earnings set status = 'confirmed' where visit_id = v1; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL chuyển thưởng sang confirmed khi chi trả tắt'; end if;

  ------------------------------------------------------------------ Tiêu chí 5: B thấy số lượng + tổng; không thấy hoá đơn của A
  perform pg_temp.act_as(ub);
  r := public.referral_my_summary();
  if (r ->> 'referred_count')::int <> 1 or (r ->> 'provisional_total')::bigint <> 309000 or r ->> 'code' <> code_b
     or r::text like '%HD-001%' or r::text like '%Nguyễn%' then
    raise exception 'FAIL tóm tắt Kinh doanh của B: %', r;
  end if;
  select count(*) into n from public.referral_earnings;
  if n <> 0 then raise exception 'FAIL B đọc thẳng bảng thưởng'; end if;
  select count(*) into n from public.partner_visits;
  if n <> 0 then raise exception 'FAIL B đọc thẳng bảng lượt'; end if;

  ------------------------------------------------------------------ Tiêu chí 8: quầy đối tác khác không đọc được lượt Đảo Sen
  perform pg_temp.act_as(cb);
  ok := false;
  begin perform public.partner_today_visits(p1); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL quầy khác đọc được lượt Đảo Sen'; end if;
  ok := false;
  begin perform public.partner_void_visit(v1, 'thử'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL quầy khác huỷ được lượt Đảo Sen'; end if;
  select count(*) into n from public.partner_visits;
  if n <> 0 then raise exception 'FAIL quầy khác đọc thẳng bảng lượt'; end if;
  if jsonb_array_length(public.partner_my_partners()) <> 1 or public.partner_my_partners() #>> '{0,id}' <> p2::text then
    raise exception 'FAIL quầy khác chỉ thấy đối tác của mình';
  end if;
  perform pg_temp.act_as(ca);
  if jsonb_array_length(public.partner_today_visits(p1)) <> 2 then raise exception 'FAIL quầy Đảo Sen thấy lượt trong ngày'; end if;

  -- Huỷ lượt: trừ điểm, huỷ thưởng
  perform public.partner_void_visit(v1, 'Nhập nhầm');
  perform pg_temp.act_as(ua);
  if (public.reward_balance(kid) ->> 'balance')::int <> 0 then raise exception 'FAIL huỷ lượt phải trừ điểm'; end if;
  perform pg_temp.act_as(null);
  if (select status from public.referral_earnings where visit_id = v1) <> 'void' then raise exception 'FAIL huỷ lượt phải huỷ thưởng'; end if;

  ------------------------------------------------------------------ Tiêu chí 6: đối soát tháng
  perform pg_temp.act_as(adm);
  st := public.partner_settlement_build(p1, current_date);
  if not exists (select 1 from public.partner_settlements where id = st and visits_count = 1 and paid_total = 6000000 and fee_amount = 480000 and status = 'draft') then
    raise exception 'FAIL đối soát: %', (select to_jsonb(s) from public.partner_settlements s where id = st);
  end if;
  if not exists (select 1 from public.sales_commissions where settlement_id = st and sales_owner_user_id = sales and amount = 48000 and status = 'provisional') then
    raise exception 'FAIL hoa hồng tạm tính của người chốt deal';
  end if;
  if jsonb_array_length(public.partner_settlement_lines(st)) <> 1 then raise exception 'FAIL dòng đối soát'; end if;
  perform public.partner_settlement_set_status(st, 'sent');
  perform public.partner_settlement_set_status(st, 'confirmed');
  ok := false;
  begin perform public.partner_settlement_build(p1, current_date); exception when raise_exception then ok := sqlerrm = 'settled'; end;
  if not ok then raise exception 'FAIL lập lại đối soát đã xác nhận'; end if;
  ok := false;
  begin perform public.partner_void_visit(v2, 'muộn'); exception when raise_exception then ok := sqlerrm = 'settled'; end;
  if not ok then raise exception 'FAIL huỷ lượt của kỳ đã đối soát'; end if;

  -- Tài khoản con không có mã giới thiệu; người chưa đăng nhập không gọi được hàm
  perform pg_temp.act_as(null);
  if has_function_privilege('anon', 'public.partner_record_visit(jsonb)', 'execute') then raise exception 'FAIL anon gọi được partner_record_visit'; end if;
  if has_function_privilege('authenticated', 'public.partner_visit_apply(uuid)', 'execute') then raise exception 'FAIL partner_visit_apply lộ ra ngoài'; end if;

  raise exception 'ALL_OK';
end $$;
