-- Bước 13 · Báo mất sổ và thu phí cấp lại (F15): đơn hàng, thanh toán payOS (webhook có chữ ký — R10),
-- hết hạn đơn, hoá đơn, hoàn tiền, "Cần cấp sổ".

alter table public.orders add column if not exists payment_info jsonb;   -- ngân hàng, số TK, tên TK, nội dung CK (từ payOS)

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('payment.mode', '"mock"', 'Chế độ thanh toán: mock (thử, admin giả lập đã nhận tiền) hoặc payos (thật)', 'Payment mode: mock (test) or payos (live)', false)
on conflict do nothing;

-------------------------------------------------------------------------------
-- Quyền trên đơn: người trả tiền, hoặc người giám hộ có quyền quản lý của học viên, hoặc admin
-------------------------------------------------------------------------------
create or replace function public.can_access_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o where o.id = p_order_id
                 and (o.payer_user_id = auth.uid() or public.can_manage_student(o.student_id) or public.is_admin()))
$$;

-------------------------------------------------------------------------------
-- F15 bước 1–2: báo mất sổ → sổ 'lost' ngay, tạo đơn phí cấp lại (hạn N ngày)
-- Gọi lại với sổ đã 'lost' (đơn cũ hết hạn) → tạo đơn mới (bước 7).
-------------------------------------------------------------------------------
create or replace function public.report_lost_passport(p_passport_id uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  p public.passports;
  prod public.products;
  v_order uuid;
begin
  select * into p from public.passports where id = p_passport_id for update;
  if p.id is null or p.student_id is null then raise exception 'passport_not_found' using errcode = 'P0002'; end if;
  if not (public.can_manage_student(p.student_id) or public.is_admin()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status in ('assigned', 'active') then
    update public.passports set status = 'lost', note = concat_ws(' · ', note, 'Báo mất ' || to_char(now(), 'DD/MM/YYYY')) where id = p.id;
  elsif p.status <> 'lost' then
    raise exception 'passport_not_reportable:%', p.status using errcode = '22023';
  end if;

  -- Đã có đơn đang chờ hoặc đã trả cho sổ này → dùng lại
  select id into v_order from public.orders
  where related_passport_id = p.id and status in ('pending', 'paid') and (status = 'paid' or expires_at > now())
  order by created_at desc limit 1;
  if v_order is not null then return v_order; end if;

  select * into prod from public.products where code = 'passport_replacement' and is_active;
  if prod.id is null then raise exception 'product_not_found' using errcode = 'P0002'; end if;
  insert into public.orders (payer_user_id, student_id, product_id, related_passport_id, amount_vnd, expires_at)
  values (case when public.is_admin() and not public.can_manage_student(p.student_id) then null else auth.uid() end,
          p.student_id, prod.id, p.id, prod.price_vnd,
          now() + make_interval(days => public.setting_int('order.expiry_days', 7)))
  returning id into v_order;
  return v_order;
end $$;

-- Thông tin đơn cho trang thanh toán / danh sách đơn của phụ huynh
create or replace function public.order_detail(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o record;
begin
  if not public.can_access_order(p_order_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select ord.*, pr.name_vi as product_vi, pr.name_en as product_en, s.full_name as student_name, ps.passport_code
    into o
  from public.orders ord join public.products pr on pr.id = ord.product_id
  left join public.students s on s.id = ord.student_id
  left join public.passports ps on ps.id = ord.related_passport_id
  where ord.id = p_order_id;
  return jsonb_build_object(
    'id', o.id, 'order_code', o.order_code, 'status', case when o.status = 'pending' and o.expires_at < now() then 'expired' else o.status end,
    'amount_vnd', o.amount_vnd, 'product_vi', o.product_vi, 'product_en', o.product_en,
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

create or replace function public.my_orders()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.order_detail(o.id) order by o.created_at desc), '[]')
  from public.orders o
  where o.payer_user_id = auth.uid() or public.can_manage_student(o.student_id)
$$;

-------------------------------------------------------------------------------
-- Hoá đơn: phụ huynh yêu cầu (trước hoặc sau khi trả tiền); kế toán/admin nhập số hoá đơn đã xuất
-------------------------------------------------------------------------------
create or replace function public.request_invoice(p_order_id uuid, p_data jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_type text := coalesce(p_data ->> 'buyer_type', 'individual');
  v_name text := btrim(coalesce(p_data ->> 'buyer_name', ''));
  v_tax text := nullif(btrim(coalesce(p_data ->> 'tax_code', '')), '');
begin
  if not public.can_access_order(p_order_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_type not in ('individual', 'company') then raise exception 'invalid_buyer_type' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'buyer_name_required' using errcode = '22023'; end if;
  if v_type = 'company' and (v_tax is null or v_tax !~ '^\d{10}(-\d{3})?$') then raise exception 'invalid_tax_code' using errcode = '22023'; end if;
  if exists (select 1 from public.invoice_requests where order_id = p_order_id and status = 'issued') then
    raise exception 'invoice_already_issued' using errcode = '22023';
  end if;
  insert into public.invoice_requests (order_id, buyer_type, buyer_name, tax_code, address, email)
  values (p_order_id, v_type, v_name, v_tax, nullif(btrim(coalesce(p_data ->> 'address', '')), ''), nullif(lower(btrim(coalesce(p_data ->> 'email', ''))), ''))
  on conflict (order_id) do update set buyer_type = excluded.buyer_type, buyer_name = excluded.buyer_name, tax_code = excluded.tax_code,
    address = excluded.address, email = excluded.email;
end $$;

create or replace function public.invoice_mark_issued(p_order_id uuid, p_invoice_no text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_invoice_no), '') = '' then raise exception 'invoice_no_required' using errcode = '22023'; end if;
  update public.invoice_requests set status = 'issued', issued_invoice_no = btrim(p_invoice_no), issued_by = auth.uid(), issued_at = now()
  where order_id = p_order_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-------------------------------------------------------------------------------
-- R10: chỉ Edge Function payos-webhook (service_role) gọi, sau khi kiểm tra chữ ký
-------------------------------------------------------------------------------
create or replace function public.mark_order_paid(p_order_code bigint, p_amount bigint, p_reference text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare o public.orders;
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
  -- F15 bước 5: thông báo phụ huynh
  perform public.notify_student_guardians(o.student_id, 'order_paid',
    'Thanh toán thành công', 'Payment received',
    'VN Centre đã nhận phí cấp lại sổ. Sổ mới sẽ được gửi tới con; quét sổ mới để dùng tiếp hồ sơ.',
    'VN Centre received the passport replacement fee. The new passport will be sent to your child; scan it to continue the same record.',
    '/app/orders/' || o.id);
  return jsonb_build_object('result', 'paid', 'order_id', o.id);
end $$;

-- F15 bước 7: đơn quá hạn chưa trả → expired (chạy định kỳ)
create or replace function public.expire_orders()
returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  update public.orders set status = 'expired' where status = 'pending' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Hoàn tiền thủ công (bắt buộc ghi chú)
create or replace function public.refund_order(p_order_id uuid, p_note text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'note_required' using errcode = '22023'; end if;
  update public.orders set status = 'refunded', note = concat_ws(' · ', note, 'Hoàn tiền: ' || btrim(p_note)) where id = p_order_id and status = 'paid';
  if not found then raise exception 'not_refundable' using errcode = '22023'; end if;
end $$;

-- Danh sách đơn cho admin: lọc trạng thái; "Cần cấp sổ" = đã trả, chưa có sổ mới thay sổ mất
create or replace function public.admin_orders(p_status text default null, p_needs_passport boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform 1;
  return coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
    select jsonb_build_object(
      'id', o.id, 'order_code', o.order_code,
      'status', case when o.status = 'pending' and o.expires_at < now() then 'expired' else o.status end,
      'amount_vnd', o.amount_vnd, 'created_at', o.created_at, 'paid_at', o.paid_at, 'expires_at', o.expires_at, 'note', o.note,
      'provider_ref', o.provider_ref, 'student_id', s.id, 'student_name', s.full_name, 'student_code', s.student_code,
      'passport_code', ps.passport_code, 'tier_id', ps.tier_id, 'payer_name', pr.full_name, 'payer_phone', pr.phone, 'payer_email', pr.email,
      'needs_passport', o.status = 'paid' and not exists (select 1 from public.passports np where np.replaced_passport_id = o.related_passport_id),
      'new_passport_code', (select np.passport_code from public.passports np where np.replaced_passport_id = o.related_passport_id order by np.issued_at desc limit 1),
      'invoice', (select jsonb_build_object('buyer_type', ir.buyer_type, 'buyer_name', ir.buyer_name, 'tax_code', ir.tax_code, 'address', ir.address,
                    'email', ir.email, 'status', ir.status, 'issued_invoice_no', ir.issued_invoice_no) from public.invoice_requests ir where ir.order_id = o.id)) x
    from public.orders o
    left join public.students s on s.id = o.student_id
    left join public.passports ps on ps.id = o.related_passport_id
    left join public.profiles pr on pr.user_id = o.payer_user_id
    where (p_status is null or o.status = p_status or (p_status = 'expired' and o.status = 'pending' and o.expires_at < now()))
      and (not p_needs_passport or (o.status = 'paid' and not exists (select 1 from public.passports np where np.replaced_passport_id = o.related_passport_id)))
    limit 1000) q), '[]');
end $$;

-------------------------------------------------------------------------------
-- F17: "Sổ mới đã cấp" — báo phụ huynh khi admin gán sổ thay sổ mất
-------------------------------------------------------------------------------
create or replace function public.passport_replaced_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.replaced_passport_id is not null and new.status = 'assigned' and old.status = 'unassigned' then
    perform public.notify_student_guardians(new.student_id, 'passport_replaced',
      'Sổ Passport mới đã được cấp', 'New passport issued',
      'Khi nhận sổ mới, hãy quét mã QR trên sổ để kích hoạt — hồ sơ của con giữ nguyên.',
      'When you receive the new passport, scan its QR code to activate it — your child''s record stays the same.',
      '/app/children/' || new.student_id || '?tab=passport');
  end if;
  return new;
end $$;
create trigger passport_replaced_notify after update on public.passports
  for each row execute function public.passport_replaced_notify();

-------------------------------------------------------------------------------
-- Quyền gọi hàm; lịch hết hạn đơn
-------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.mark_order_paid(bigint, bigint, text)', 'public.expire_orders()', 'public.can_access_order(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  grant execute on function public.mark_order_paid(bigint, bigint, text) to service_role;
  foreach f in array array[
    'public.report_lost_passport(uuid)', 'public.order_detail(uuid)', 'public.my_orders()', 'public.request_invoice(uuid, jsonb)',
    'public.invoice_mark_issued(uuid, text)', 'public.refund_order(uuid, text)', 'public.admin_orders(text, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

create extension if not exists pg_cron;
select cron.schedule('expire-orders', '*/15 * * * *', 'select public.expire_orders()');
