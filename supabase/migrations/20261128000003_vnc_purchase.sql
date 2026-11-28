-- Mã VNC — đợt B của mục 5 (docs/spec/12-ma-vnc-so-dep-dang-nhap.md): mua số cho mình hoặc mua tặng, trả qua đơn payOS sẵn có.
--   · Đặt mua: số trống, có hạng, có giá niêm yết → giữ chỗ (vnc_codes.status 'reserved') + đơn hàng sản phẩm 'vnc_code'
--     theo giá niêm yết hiện tại, hạn vnc.order_minutes phút. Trang /app/orders/<id> lo phần thanh toán (Edge Function payments).
--   · Trả tiền (mark_order_paid → orders.status 'paid'): số thành mã phụ của người nhận (status 'sold', acquired_by 'mua');
--     người nhận tự đặt làm mã chính. Nhật ký 'sell'.
--   · Đơn hết hạn / huỷ: tự trả số về kho (số đẹp → available; số năm sinh → bỏ khỏi sổ như trước khi giữ chỗ).
--   · Người nhận: chính mình / con đang quản lý, hoặc người khác bằng MÃ VNC (hiện tên đã che để xác nhận). Không tìm theo tên
--     (tránh lộ danh sách học viên cho mọi tài khoản).
--   · Không chuyển nhượng / bán lại giữa người dùng (mục 1): chỉ mua từ kho của VN Centre.
-- Thay thân mark_order_paid (thêm lời báo cho 'vnc_code'), order_detail (thêm product_code, vnc_code), vnc_admin_set_lock
-- (không mở số đang chờ thanh toán). Còn lại chỉ thêm.

insert into public.products (code, name_vi, name_en, price_vnd)
values ('vnc_code', 'Mã VNC số đẹp', 'Special VNC code', 0)
on conflict (code) do nothing;

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('vnc.order_minutes', '30', 'Mua mã VNC: số được giữ trong bấy nhiêu phút chờ thanh toán', 'Minutes a VNC code is held while awaiting payment', false)
on conflict do nothing;

create table if not exists public.vnc_code_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  order_id uuid not null unique references public.orders(id),
  code char(6) not null check (code ~ '^\d{6}$'),
  recipient_student_id uuid not null references public.students(id),
  buyer_user_id uuid not null default auth.uid(),
  status text not null default 'pending' check (status in ('pending', 'paid', 'released', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Một số chỉ có một đơn đang chờ
create unique index if not exists vnc_code_orders_one_pending on public.vnc_code_orders (code) where status = 'pending';
alter table public.vnc_code_orders enable row level security;
revoke all on public.vnc_code_orders from anon;
drop policy if exists vnc_code_orders_read on public.vnc_code_orders;
create policy vnc_code_orders_read on public.vnc_code_orders for select to authenticated
  using (public.is_admin() or buyer_user_id = auth.uid() or public.can_manage_student(recipient_student_id));
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.vnc_code_orders'::regclass) then
    create trigger set_updated_at before update on public.vnc_code_orders for each row execute function public.set_updated_at();
    create trigger audit_row after insert or update or delete on public.vnc_code_orders for each row execute function public.audit_row();
  end if;
end $$;

alter table public.vnc_code_events drop constraint if exists vnc_code_events_action_check;
alter table public.vnc_code_events add constraint vnc_code_events_action_check
  check (action in ('assign', 'gift', 'sell', 'set_primary', 'lock', 'unlock', 'price', 'order', 'release', 'sell_failed'));

-------------------------------------------------------------------------------
-- Trả số về kho khi đơn không thành
-------------------------------------------------------------------------------
create or replace function public.vnc_release_order(p_order_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare vo public.vnc_code_orders;
begin
  select * into vo from public.vnc_code_orders where order_id = p_order_id and status = 'pending' for update;
  if vo.id is null then return; end if;
  update public.vnc_code_orders set status = 'released' where id = vo.id;
  -- Số đẹp quay lại kho; số không thuộc kho (năm sinh) bỏ khỏi sổ như trước khi giữ chỗ
  update public.vnc_codes set status = 'available', note = null
  where code = vo.code and owner_id is null and status = 'reserved' and public.vnc_is_premium_tier(tier);
  delete from public.vnc_codes
  where code = vo.code and owner_id is null and status = 'reserved' and not public.vnc_is_premium_tier(tier);
  insert into public.vnc_code_events (code, action, student_id, actor_user_id, detail)
  values (vo.code, 'release', vo.recipient_student_id, null, jsonb_build_object('order_id', p_order_id));
end $$;

-- Gắn số cho người nhận khi đơn đã trả
create or replace function public.vnc_fulfill_order(p_order_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare vo public.vnc_code_orders; v_code bigint;
begin
  select * into vo from public.vnc_code_orders where order_id = p_order_id and status in ('pending', 'released') for update;
  if vo.id is null then return; end if;
  select order_code into v_code from public.orders where id = p_order_id;
  -- Trả tiền sau khi đơn đã hết hạn (số đã về kho): vẫn gắn nếu số còn trống
  -- (số năm sinh đã bị bỏ khỏi sổ khi đơn hết hạn → ghi lại)
  insert into public.vnc_codes (code, owner_id, is_primary, status, category, tier, acquired_at, acquired_by, note)
  values (vo.code, vo.recipient_student_id, false, 'sold', public.vnc_categories(vo.code),
          public.vnc_tier_of(public.vnc_categories(vo.code)), now(), 'mua', 'Đơn ' || v_code)
  on conflict (code) do update set owner_id = excluded.owner_id, is_primary = false, status = 'sold',
         acquired_at = excluded.acquired_at, acquired_by = 'mua', note = excluded.note
    where public.vnc_codes.owner_id is null;
  if found then
    update public.vnc_code_orders set status = 'paid' where id = vo.id;
    insert into public.vnc_code_events (code, action, student_id, actor_user_id, detail)
    values (vo.code, 'sell', vo.recipient_student_id, vo.buyer_user_id, jsonb_build_object('order_id', p_order_id, 'order_code', v_code));
  else
    -- Số đã thuộc người khác (đơn hết hạn rồi mới trả, số đã bán cho người khác): admin hoàn tiền hoặc đổi số
    update public.vnc_code_orders set status = 'failed' where id = vo.id;
    update public.orders set note = concat_ws(' · ', note, 'Mã VNC ' || vo.code || ' không còn trống khi nhận tiền — cần hoàn tiền hoặc đổi số')
    where id = p_order_id;
    insert into public.vnc_code_events (code, action, student_id, actor_user_id, detail)
    values (vo.code, 'sell_failed', vo.recipient_student_id, vo.buyer_user_id, jsonb_build_object('order_id', p_order_id, 'order_code', v_code));
  end if;
end $$;

create or replace function public.vnc_orders_after_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and exists (select 1 from public.vnc_code_orders where order_id = new.id) then
    if new.status = 'paid' then perform public.vnc_fulfill_order(new.id);
    elsif new.status in ('expired', 'cancelled') then perform public.vnc_release_order(new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists vnc_orders_after_status on public.orders;
create trigger vnc_orders_after_status after update of status on public.orders
  for each row execute function public.vnc_orders_after_status();

-------------------------------------------------------------------------------
-- Người nhận bằng mã VNC: chỉ hiện tên đã che (xác nhận đúng người, không lộ hồ sơ)
-------------------------------------------------------------------------------
create or replace function public.vnc_mask_name(p_name text)
returns text language sql immutable as $$
  select string_agg(case when length(w) <= 1 then w else left(w, 1) || repeat('*', length(w) - 1) end, ' ' order by i)
  from unnest(string_to_array(btrim(coalesce(p_name, '')), ' ')) with ordinality as t(w, i)
$$;

create or replace function public.vnc_recipient_preview(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(regexp_replace(coalesce(p_code, ''), '\D', '', 'g')) <> 6 then return null; end if;
  v := public.vnc_student_id(p_code);
  if v is null then return null; end if;
  return jsonb_build_object('student_code', (select student_code from public.students where id = v),
    'masked_name', public.vnc_mask_name((select full_name from public.students where id = v)));
end $$;

-------------------------------------------------------------------------------
-- Đặt mua. p_recipient: null = hồ sơ của chính mình; id hồ sơ mình quản lý; hoặc mã VNC người nhận. Trả id đơn hàng.
-------------------------------------------------------------------------------
create or replace function public.vnc_order_place(p_code text, p_recipient text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c text := right(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), 6);
  v_to uuid;
  v_cats text[];
  v_tier text;
  v_price bigint;
  v_product uuid := (select id from public.products where code = 'vnc_code');
  v_order uuid;
  v_minutes int := public.setting_int('vnc.order_minutes', 30);
  r record;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(c) <> 6 then raise exception 'code_invalid' using errcode = '22023'; end if;
  -- Người nhận
  if nullif(btrim(coalesce(p_recipient, '')), '') is null then
    v_to := public.auth_self_student();
  elsif p_recipient ~ '^[0-9a-f-]{36}$' then
    v_to := p_recipient::uuid;
    if not public.can_manage_student(v_to) then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    v_to := public.vnc_student_id(p_recipient);
  end if;
  if v_to is null then raise exception 'recipient_not_found' using errcode = 'P0002'; end if;

  v_cats := public.vnc_categories(c);
  v_tier := public.vnc_tier_of(v_cats);
  v_price := public.vnc_list_price(v_tier);
  if v_tier = 'thuong' or v_price is null or v_price <= 0 then raise exception 'not_for_sale' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtext('vnc_order:' || c));
  -- Đơn cũ của số này đã quá hạn mà lịch quét chưa chạy: trả số trước
  for r in select vo.order_id from public.vnc_code_orders vo join public.orders o on o.id = vo.order_id
           where vo.code = c and vo.status = 'pending' and o.status = 'pending' and o.expires_at < now() loop
    update public.orders set status = 'expired' where id = r.order_id;
  end loop;

  -- Giữ chỗ: số trong kho (available) hoặc chưa có trong sổ
  insert into public.vnc_codes (code, status, category, tier, note)
  values (c, 'reserved', v_cats, v_tier, 'Đang chờ thanh toán')
  on conflict (code) do update set status = 'reserved', note = 'Đang chờ thanh toán'
    where public.vnc_codes.status = 'available' and public.vnc_codes.owner_id is null;
  if not found then raise exception 'code_not_available' using errcode = '22023'; end if;

  insert into public.orders (payer_user_id, student_id, product_id, amount_vnd, expires_at)
  values (auth.uid(), v_to, v_product, v_price, now() + make_interval(mins => v_minutes))
  returning id into v_order;
  insert into public.vnc_code_orders (order_id, code, recipient_student_id, buyer_user_id) values (v_order, c, v_to, auth.uid());
  insert into public.vnc_code_events (code, action, student_id, detail)
  values (c, 'order', v_to, jsonb_build_object('order_id', v_order, 'price', v_price));
  return jsonb_build_object('order_id', v_order, 'code', c, 'amount_vnd', v_price, 'tier', v_tier);
end $$;

-------------------------------------------------------------------------------
-- Thân hàm thay thế (bản mới nhất trong repo + phần cho mã VNC)
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
  if v_product = 'vnc_code' then
    -- Mã VNC số đẹp: gắn số cho người nhận (trigger vnc_orders_after_status lo phần gắn số), báo cho gia đình người nhận
    perform public.notify_student_guardians(o.student_id, 'order_paid',
      'Thanh toán thành công', 'Payment received',
      'VN Centre đã nhận tiền mua mã VNC. Mã mới đã có trong mục "Mã VNC của tôi"; đặt làm mã chính nếu muốn.',
      'VN Centre received the payment for the VNC code. The new code is in "My VNC codes"; make it primary if you like.',
      '/vnc');
  elsif v_product = 'gift_shipping' then
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

create or replace function public.order_detail(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o record;
begin
  if not public.can_access_order(p_order_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select ord.*, pr.code as product_code, pr.name_vi as product_vi, pr.name_en as product_en, s.full_name as student_name, ps.passport_code
    into o
  from public.orders ord join public.products pr on pr.id = ord.product_id
  left join public.students s on s.id = ord.student_id
  left join public.passports ps on ps.id = ord.related_passport_id
  where ord.id = p_order_id;
  return jsonb_build_object(
    'id', o.id, 'order_code', o.order_code, 'status', case when o.status = 'pending' and o.expires_at < now() then 'expired' else o.status end,
    'amount_vnd', o.amount_vnd, 'product_code', o.product_code, 'product_vi', o.product_vi, 'product_en', o.product_en,
    'vnc_code', (select vo.code from public.vnc_code_orders vo where vo.order_id = o.id),
    'student_id', o.student_id, 'student_name', o.student_name, 'passport_code', o.passport_code,
    'related_passport_id', o.related_passport_id,
    'qr_code', o.qr_code, 'checkout_url', o.checkout_url, 'payment_info', o.payment_info,
    'expires_at', o.expires_at, 'paid_at', o.paid_at, 'created_at', o.created_at, 'note', case when o.status = 'refunded' then o.note end,
    'invoice', (select jsonb_build_object('buyer_type', ir.buyer_type, 'buyer_name', ir.buyer_name, 'tax_code', ir.tax_code,
                  'address', ir.address, 'email', ir.email, 'status', ir.status, 'issued_invoice_no', ir.issued_invoice_no, 'issued_at', ir.issued_at)
                from public.invoice_requests ir where ir.order_id = o.id),
    'new_passport_code', (select np.passport_code from public.passports np where np.replaced_passport_id = o.related_passport_id
                          and np.status in ('assigned', 'active') order by np.issued_at desc limit 1));
end $$;

create or replace function public.vnc_admin_set_lock(p_code text, p_locked boolean, p_note text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare c text := right(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), 6);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(c) <> 6 then raise exception 'code_invalid' using errcode = '22023'; end if;
  if p_locked then
    -- Số chưa có trong sổ cũng khoá được (ví dụ số năm sinh)
    insert into public.vnc_codes (code, status, category, tier, note)
    values (c, 'reserved', public.vnc_categories(c), public.vnc_tier_of(public.vnc_categories(c)), nullif(btrim(p_note), ''))
    on conflict (code) do update set status = 'reserved', note = coalesce(excluded.note, public.vnc_codes.note)
      where public.vnc_codes.status = 'available';
    if not found then raise exception 'code_not_available' using errcode = '22023'; end if;
  else
    -- Số đang chờ khách thanh toán (đợt B) không mở tay được; hết hạn / huỷ đơn thì tự trả về kho
    if exists (select 1 from public.vnc_code_orders where code = c and status = 'pending') then
      raise exception 'code_in_order' using errcode = '22023';
    end if;
    update public.vnc_codes set status = 'available' where code = c and status = 'reserved';
    if not found then raise exception 'code_not_locked' using errcode = '22023'; end if;
  end if;
  insert into public.vnc_code_events (code, action, detail)
  values (c, case when p_locked then 'lock' else 'unlock' end, jsonb_build_object('note', nullif(btrim(p_note), '')));
end $$;

do $$
begin
  revoke execute on function public.vnc_release_order(uuid) from public, anon, authenticated;
  revoke execute on function public.vnc_fulfill_order(uuid) from public, anon, authenticated;
  revoke execute on function public.vnc_orders_after_status() from public, anon, authenticated;
  revoke execute on function public.vnc_recipient_preview(text) from public, anon;
  revoke execute on function public.vnc_order_place(text, text) from public, anon;
  grant execute on function public.vnc_recipient_preview(text), public.vnc_order_place(text, text) to authenticated;
end $$;
