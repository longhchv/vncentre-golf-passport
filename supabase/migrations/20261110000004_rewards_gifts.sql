-- Spec 19 · bước 5 (phần C): kho quà, đổi quà trừ vào sổ điểm thưởng, huỷ / hoàn điểm, trạng thái đơn, phí ship qua payOS.
-- docs/spec/19-mapping.md mục 3.C, Q7, Q8, Q10. Không seed quà (admin nhập trên màn Kho quà).
-- Sửa thân mark_order_paid: chỉ tách lời thông báo theo sản phẩm (đơn cấp lại sổ giữ nguyên lời cũ).

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('rewards.student_can_redeem', 'false', 'Tài khoản con được tự đổi quà (Q7: tắt, chỉ phụ huynh đặt)', 'Student accounts may redeem gifts themselves', false)
on conflict do nothing;

-- Q8: phí gửi quà qua bưu điện, admin nhập số tiền từng đơn
insert into public.products (code, name_vi, name_en, price_vnd)
values ('gift_shipping', 'Phí gửi quà qua bưu điện', 'Gift postage fee', 0)
on conflict (code) do nothing;

-- Ảnh quà: kho công khai (không có dữ liệu cá nhân), chỉ admin ghi
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gift-photos', 'gift-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "gift photos: admin" on storage.objects for all to authenticated
  using (bucket_id = 'gift-photos' and public.is_admin())
  with check (bucket_id = 'gift-photos' and public.is_admin());

-------------------------------------------------------------------------------
-- Hàm nội bộ
-------------------------------------------------------------------------------
-- Số dư khả dụng = tổng delta các dòng chưa treo
create or replace function public.reward_available(p_student_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int from public.reward_ledger where student_id = p_student_id and not is_frozen
$$;

create or replace function public.gift_stock(p_gift_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(qty), 0)::int from public.gift_stock_moves where gift_id = p_gift_id
$$;

-- Ai đổi quà cho một học viên: phụ huynh có quyền quản lý, admin; tài khoản con khi bật rewards.student_can_redeem
create or replace function public.gift_can_redeem(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (public.is_admin() or public.can_manage_student(p_student_id)
    or (coalesce((select value = 'true'::jsonb from public.app_settings where key = 'rewards.student_can_redeem'), false)
        and exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)))
$$;

create or replace function public.gift_order_json(o public.gift_orders)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'student_id', o.student_id, 'gift_id', o.gift_id, 'gift_vi', g.name_vi, 'gift_en', g.name_en,
    'photo_path', g.photo_path, 'qty', o.qty, 'points', o.points, 'pickup', o.pickup, 'ship_address', o.ship_address,
    'ship_fee_vnd', o.ship_fee_vnd, 'ship_order_id', o.ship_order_id, 'ship_order_status',
    (select case when ord.status = 'pending' and ord.expires_at < now() then 'expired' else ord.status end from public.orders ord where ord.id = o.ship_order_id),
    'status', o.status, 'note', o.note, 'cancel_reason', o.cancel_reason, 'created_at', o.created_at,
    'prepared_at', o.prepared_at, 'handed_at', o.handed_at, 'completed_at', o.completed_at, 'cancelled_at', o.cancelled_at,
    'can_cancel', o.status = 'placed' or (o.status = 'prepared' and public.is_admin()))
  from public.gift_items g where g.id = o.gift_id
$$;

-------------------------------------------------------------------------------
-- Phụ huynh: danh mục quà kèm số dư khả dụng, đơn quà của con
-------------------------------------------------------------------------------
create or replace function public.gift_catalog(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_guardian_of(p_student_id)
          or exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'available', public.reward_available(p_student_id),
    'frozen', coalesce((select sum(delta) from public.reward_ledger where student_id = p_student_id and is_frozen), 0),
    'can_redeem', public.gift_can_redeem(p_student_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name_vi', g.name_vi, 'name_en', g.name_en, 'kind', g.kind,
        'description_vi', g.description_vi, 'description_en', g.description_en, 'photo_path', g.photo_path, 'points', g.points,
        'stock', public.gift_stock(g.id), 'per_student_limit', g.per_student_limit,
        'ordered', (select coalesce(sum(o.qty), 0) from public.gift_orders o where o.gift_id = g.id and o.student_id = p_student_id and o.status <> 'cancelled'))
      order by g.sort_order, g.points)
      from public.gift_items g where g.is_active), '[]'));
end $$;

create or replace function public.gift_my_orders(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_guardian_of(p_student_id)
          or exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(public.gift_order_json(o) || jsonb_build_object('can_cancel', o.status = 'placed' and public.gift_can_redeem(o.student_id))
                                    order by o.created_at desc)
                   from public.gift_orders o where o.student_id = p_student_id), '[]');
end $$;

-------------------------------------------------------------------------------
-- Đổi quà: MỘT giao dịch, khoá theo học viên (rồi theo quà) → kiểm số dư khả dụng, tồn kho, giới hạn → đơn + sổ (−) + kho (−)
-------------------------------------------------------------------------------
create or replace function public.gift_order_place(p_student_id uuid, p_gift_id uuid, p_qty int, p_pickup text,
  p_ship_address jsonb default null, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g public.gift_items;
  v_qty int := coalesce(p_qty, 1);
  v_points int;
  v_addr jsonb;
  v_order uuid;
begin
  if not public.gift_can_redeem(p_student_id) then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if v_qty < 1 or v_qty > 20 then raise exception 'invalid_qty' using errcode = '22023'; end if;
  if p_pickup not in ('league', 'school', 'office', 'post') then raise exception 'invalid_pickup' using errcode = '22023'; end if;
  if p_pickup = 'post' then
    v_addr := jsonb_build_object('name', btrim(coalesce(p_ship_address ->> 'name', '')), 'phone', btrim(coalesce(p_ship_address ->> 'phone', '')),
                                 'address', btrim(coalesce(p_ship_address ->> 'address', '')));
    if v_addr ->> 'name' = '' or v_addr ->> 'address' = '' or (v_addr ->> 'phone') !~ '^\+?[0-9 .]{9,15}$' then
      raise exception 'address_required' using errcode = '22023';
    end if;
  end if;

  -- Khoá theo học viên: hai lần bấm cùng lúc xếp hàng ở đây, lần sau thấy số dư mới (tiêu chí 8)
  perform 1 from public.students where id = p_student_id and deleted_at is null and merged_into_student_id is null for update;
  if not found then raise exception 'student_not_found' using errcode = 'P0002'; end if;
  select * into g from public.gift_items where id = p_gift_id for update;
  if g.id is null or not g.is_active then raise exception 'gift_unavailable' using errcode = '22023'; end if;

  v_points := g.points * v_qty;
  if g.per_student_limit is not null and v_qty + (select coalesce(sum(qty), 0) from public.gift_orders
        where student_id = p_student_id and gift_id = g.id and status <> 'cancelled') > g.per_student_limit then
    raise exception 'limit_reached' using errcode = '22023';
  end if;
  if public.gift_stock(g.id) < v_qty then raise exception 'out_of_stock' using errcode = '22023'; end if;
  if public.reward_available(p_student_id) < v_points then raise exception 'insufficient_points' using errcode = '22023'; end if;

  insert into public.gift_orders (student_id, gift_id, qty, points, pickup, ship_address, note, created_by)
  values (p_student_id, g.id, v_qty, v_points, p_pickup, v_addr, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_order;
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, note, created_by)
  values (p_student_id, -v_points, 'gift_order', 'gift_order', v_order, g.name_vi || case when v_qty > 1 then ' × ' || v_qty else '' end, auth.uid());
  insert into public.gift_stock_moves (gift_id, qty, reason, order_id, created_by) values (g.id, -v_qty, 'order', v_order, auth.uid());

  return jsonb_build_object('order_id', v_order, 'points', v_points, 'available', public.reward_available(p_student_id));
end $$;

-- Huỷ trước khi giao: phụ huynh khi "đã đặt"; admin khi "đã đặt" / "đã chuẩn bị". Hoàn điểm + nhập lại kho; huỷ đơn phí ship chưa trả.
create or replace function public.gift_order_cancel(p_order_id uuid, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare o public.gift_orders;
begin
  select * into o from public.gift_orders where id = p_order_id for update;
  if o.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.is_admin() or public.gift_can_redeem(o.student_id)) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if o.status not in ('placed', 'prepared') then raise exception 'not_cancellable' using errcode = '22023'; end if;
  -- Phụ huynh chỉ huỷ khi đơn còn "đã đặt"
  if o.status <> 'placed' and not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.orders where id = o.ship_order_id and status = 'paid') and not public.is_admin() then
    raise exception 'ship_fee_paid' using errcode = '22023';      -- đã trả phí ship: admin huỷ và hoàn tiền tay
  end if;
  perform 1 from public.students where id = o.student_id for update;
  update public.gift_orders set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
    cancel_reason = nullif(btrim(coalesce(p_reason, '')), '') where id = o.id;
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, note, created_by)
  values (o.student_id, o.points, 'gift_order_refund', 'gift_order', o.id, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());
  insert into public.gift_stock_moves (gift_id, qty, reason, order_id, created_by) values (o.gift_id, o.qty, 'order_cancel', o.id, auth.uid());
  update public.orders set status = 'cancelled' where id = o.ship_order_id and status = 'pending';
end $$;

-------------------------------------------------------------------------------
-- Admin: trạng thái đơn, phí ship, kho
-------------------------------------------------------------------------------
-- placed → prepared → delivered (nhận trực tiếp) / shipped (bưu điện, đã trả phí) → completed. Được bỏ qua bước "đã chuẩn bị".
create or replace function public.gift_order_set_status(p_order_id uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare o public.gift_orders;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  select * into o from public.gift_orders where id = p_order_id for update;
  if o.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ((o.status = 'placed' and p_status in ('prepared', 'delivered', 'shipped'))
       or (o.status = 'prepared' and p_status in ('delivered', 'shipped'))
       or (o.status in ('delivered', 'shipped') and p_status = 'completed')) then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if p_status = 'delivered' and o.pickup = 'post' then raise exception 'invalid_transition' using errcode = '22023'; end if;
  if p_status = 'shipped' then
    if o.pickup <> 'post' then raise exception 'invalid_transition' using errcode = '22023'; end if;
    if o.ship_fee_vnd is null then raise exception 'ship_fee_required' using errcode = '22023'; end if;
    if o.ship_fee_vnd > 0 and not exists (select 1 from public.orders where id = o.ship_order_id and status = 'paid') then
      raise exception 'ship_fee_unpaid' using errcode = '22023';
    end if;
  end if;
  update public.gift_orders set status = p_status,
    prepared_at = case when p_status = 'prepared' then now() else prepared_at end,
    handed_at = case when p_status in ('delivered', 'shipped') then now() else handed_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end
  where id = o.id;
end $$;

-- Q8: admin nhập phí ship → tạo đơn payOS (sản phẩm gift_shipping) cho phụ huynh trả; 0 đ = miễn phí ship
create or replace function public.gift_order_set_ship_fee(p_order_id uuid, p_fee_vnd bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o public.gift_orders;
  prod public.products;
  v_ord uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  select * into o from public.gift_orders where id = p_order_id for update;
  if o.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if o.pickup <> 'post' or o.status not in ('placed', 'prepared') then raise exception 'invalid_transition' using errcode = '22023'; end if;
  if p_fee_vnd is null or p_fee_vnd < 0 or p_fee_vnd > 5000000 then raise exception 'invalid_fee' using errcode = '22023'; end if;
  if exists (select 1 from public.orders where id = o.ship_order_id and status = 'paid') then raise exception 'ship_fee_paid' using errcode = '22023'; end if;
  update public.orders set status = 'cancelled' where id = o.ship_order_id and status = 'pending';
  if p_fee_vnd > 0 then
    select * into prod from public.products where code = 'gift_shipping' and is_active;
    if prod.id is null then raise exception 'product_not_found' using errcode = 'P0002'; end if;
    insert into public.orders (payer_user_id, student_id, product_id, amount_vnd, expires_at, note)
    values (coalesce(o.created_by, public.partner_customer_user(o.student_id)), o.student_id, prod.id, p_fee_vnd,
            now() + make_interval(days => public.setting_int('order.expiry_days', 7)), 'gift_order:' || o.id)
    returning id into v_ord;
    perform public.notify_student_guardians(o.student_id, 'gift_ship_fee',
      'Phí gửi quà', 'Gift postage fee',
      'Quà của con sẽ được gửi qua bưu điện. Vui lòng thanh toán phí gửi để VN Centre gửi quà.',
      'Your child''s gift will be posted. Please pay the postage fee so VN Centre can send it.',
      '/app/orders/' || v_ord);
  end if;
  update public.gift_orders set ship_fee_vnd = p_fee_vnd, ship_order_id = v_ord where id = o.id;
  return jsonb_build_object('ship_order_id', v_ord);
end $$;

-- Nhập kho / điều chỉnh (âm được, nhưng tồn không âm)
create or replace function public.gift_stock_add(p_gift_id uuid, p_qty int, p_reason text default 'restock', p_note text default null)
returns int language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if p_reason not in ('restock', 'adjust') or coalesce(p_qty, 0) = 0 or (p_reason = 'restock' and p_qty < 0) then
    raise exception 'invalid_qty' using errcode = '22023';
  end if;
  perform 1 from public.gift_items where id = p_gift_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.gift_stock(p_gift_id) + p_qty < 0 then raise exception 'out_of_stock' using errcode = '22023'; end if;
  if p_reason = 'adjust' and nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'note_required' using errcode = '22023'; end if;
  insert into public.gift_stock_moves (gift_id, qty, reason, note, created_by) values (p_gift_id, p_qty, p_reason, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  return public.gift_stock(p_gift_id);
end $$;

create or replace function public.gift_admin_items()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  return coalesce((select jsonb_agg(to_jsonb(g) || jsonb_build_object('stock', public.gift_stock(g.id),
      'open_orders', (select count(*) from public.gift_orders o where o.gift_id = g.id and o.status in ('placed', 'prepared'))) order by g.sort_order, g.points)
    from public.gift_items g), '[]');
end $$;

create or replace function public.gift_admin_orders(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  return coalesce((select jsonb_agg(public.gift_order_json(o) || jsonb_build_object('full_name', st.full_name, 'student_code', st.student_code)
                                    order by o.created_at desc)
    from public.gift_orders o join public.students st on st.id = o.student_id
    where p_status is null or o.status = p_status or (p_status = 'open' and o.status in ('placed', 'prepared'))), '[]');
end $$;

-------------------------------------------------------------------------------
-- Ví điểm: thêm tên quà cho dòng đổi quà / hoàn điểm
-------------------------------------------------------------------------------
create or replace function public.reward_balance(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_guardian_of(p_student_id)
          or exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'balance', coalesce((select sum(delta) from public.reward_ledger where student_id = p_student_id), 0),
    'available', public.reward_available(p_student_id),
    'frozen', coalesce((select sum(delta) from public.reward_ledger where student_id = p_student_id and is_frozen), 0),
    'recent', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select l.id, l.delta, l.reason, l.created_at, l.is_frozen,
               case when l.source_type in ('tournament_result', 'gift_order') or l.reason in ('merge_transfer') then null else l.note end as note,
               p.name as partner_name,
               case when t.id is not null then jsonb_build_object('series_vi', ts.name_vi, 'series_en', ts.name_en, 'stage_no', t.stage_no,
                                                                  'season', se.code, 'played_on', t.played_on) end as tournament,
               case when l.source_type = 'tournament_result' and t.id is null then l.note end as tournament_note,
               case when rr.id is not null then jsonb_build_object('name_vi', rr.name_vi, 'name_en', rr.name_en) end as rule,
               case when gi.id is not null then jsonb_build_object('name_vi', gi.name_vi, 'name_en', gi.name_en, 'qty', go.qty) end as gift
        from public.reward_ledger l
        left join public.partner_visits v on v.id = l.source_id and l.source_type = 'partner_visit'
        left join public.partners p on p.id = v.partner_id
        left join public.tournament_results tr on tr.id = l.source_id and l.source_type = 'tournament_result'
        left join public.tournaments t on t.id = tr.tournament_id
        left join public.tournament_series ts on ts.id = t.series_id
        left join public.seasons se on se.id = t.season_id
        left join public.reward_rules rr on rr.id = l.rule_id or (l.rule_id is null and rr.code = l.reason)
        left join public.gift_orders go on go.id = l.source_id and l.source_type = 'gift_order'
        left join public.gift_items gi on gi.id = go.gift_id
        where l.student_id = p_student_id order by l.created_at desc limit 50) x), '[]'));
end $$;

-------------------------------------------------------------------------------
-- Thông báo khi webhook báo đã trả: tách lời theo sản phẩm (cấp lại sổ giữ nguyên)
-------------------------------------------------------------------------------
create or replace function public.mark_order_paid(p_order_code bigint, p_amount bigint, p_reference text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
  v_product text;
begin
  select * into o from public.orders where order_code = p_order_code for update;
  if o.id is null then return jsonb_build_object('result', 'not_found'); end if;
  if o.status = 'paid' then return jsonb_build_object('result', 'already_paid', 'order_id', o.id); end if;
  if o.status not in ('pending', 'expired') then return jsonb_build_object('result', 'ignored', 'status', o.status); end if;
  if p_amount < o.amount_vnd then
    update public.orders set note = concat_ws(' · ', note, format('Nhận %s đ, thiếu so với %s đ (%s)', p_amount, o.amount_vnd, p_reference)) where id = o.id;
    return jsonb_build_object('result', 'underpaid', 'order_id', o.id);
  end if;
  update public.orders set status = 'paid', paid_at = now(), provider_ref = coalesce(p_reference, provider_ref) where id = o.id;
  select code into v_product from public.products where id = o.product_id;
  if v_product = 'gift_shipping' then
    perform public.notify_student_guardians(o.student_id, 'order_paid',
      'Thanh toán thành công', 'Payment received',
      'VN Centre đã nhận phí gửi quà. Quà sẽ được gửi qua bưu điện trong thời gian sớm nhất.',
      'VN Centre received the postage fee. The gift will be posted as soon as possible.',
      '/app/orders/' || o.id);
  else
    -- F15 bước 5: thông báo phụ huynh
    perform public.notify_student_guardians(o.student_id, 'order_paid',
      'Thanh toán thành công', 'Payment received',
      'VN Centre đã nhận phí cấp lại sổ. Sổ mới sẽ được gửi tới con; quét sổ mới để dùng tiếp hồ sơ.',
      'VN Centre received the passport replacement fee. The new passport will be sent to your child; scan it to continue the same record.',
      '/app/orders/' || o.id);
  end if;
  return jsonb_build_object('result', 'paid', 'order_id', o.id);
end $$;

do $$
begin
  revoke execute on function public.reward_available(uuid) from public, anon, authenticated;
  revoke execute on function public.gift_stock(uuid) from public, anon, authenticated;
  revoke execute on function public.gift_order_json(public.gift_orders) from public, anon, authenticated;
  revoke execute on function public.gift_can_redeem(uuid) from public, anon, authenticated;
  revoke execute on function public.gift_catalog(uuid) from public, anon;
  revoke execute on function public.gift_my_orders(uuid) from public, anon;
  revoke execute on function public.gift_order_place(uuid, uuid, int, text, jsonb, text) from public, anon;
  revoke execute on function public.gift_order_cancel(uuid, text) from public, anon;
  revoke execute on function public.gift_order_set_status(uuid, text) from public, anon;
  revoke execute on function public.gift_order_set_ship_fee(uuid, bigint) from public, anon;
  revoke execute on function public.gift_stock_add(uuid, int, text, text) from public, anon;
  revoke execute on function public.gift_admin_items() from public, anon;
  revoke execute on function public.gift_admin_orders(text) from public, anon;
  grant execute on function public.gift_catalog(uuid), public.gift_my_orders(uuid), public.gift_order_place(uuid, uuid, int, text, jsonb, text),
    public.gift_order_cancel(uuid, text), public.gift_order_set_status(uuid, text), public.gift_order_set_ship_fee(uuid, bigint),
    public.gift_stock_add(uuid, int, text, text), public.gift_admin_items(), public.gift_admin_orders(text) to authenticated;
end $$;
