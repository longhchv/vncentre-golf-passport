-- Mã VNC: hoàn tiền đơn mua số thì THU HỒI số (anh Long chốt 28/11/2026).
--   · Số rời khỏi hồ sơ người nhận. Nếu người nhận đã đặt số đó làm mã chính → mã chính quay về mã khác của họ
--     (ưu tiên mã được cấp ban đầu), mọi tra cứu bằng mã cũ vẫn ra đúng người.
--   · Số về kho ở trạng thái KHOÁ (reserved), không tự bán lại: spec 12 mục 1 "mã đã gắn với một người không cấp lại cho
--     người khác" và số có thể đã in trên QR — admin tự quyết mở khoá để bán lại hay giữ.
--   · Nhật ký 'revoke'; báo gia đình người nhận. Đơn chưa gắn được số (failed) hoàn tiền thì không có gì để thu hồi.
-- Thay thân vnc_orders_after_status (thêm nhánh refunded). Còn lại chỉ thêm.

alter table public.vnc_code_orders drop constraint if exists vnc_code_orders_status_check;
alter table public.vnc_code_orders add constraint vnc_code_orders_status_check
  check (status in ('pending', 'paid', 'released', 'failed', 'refunded'));
alter table public.vnc_code_events drop constraint if exists vnc_code_events_action_check;
alter table public.vnc_code_events add constraint vnc_code_events_action_check
  check (action in ('assign', 'gift', 'sell', 'set_primary', 'lock', 'unlock', 'price', 'order', 'release', 'sell_failed', 'revoke'));

create or replace function public.vnc_revoke_order(p_order_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  vo public.vnc_code_orders;
  v public.vnc_codes;
  v_order bigint;
  v_back text;
begin
  select * into vo from public.vnc_code_orders where order_id = p_order_id and status = 'paid' for update;
  if vo.id is null then return; end if;
  select order_code into v_order from public.orders where id = p_order_id;
  select * into v from public.vnc_codes where code = vo.code for update;
  if v.code is not null and v.owner_id = vo.recipient_student_id then
    if v.is_primary then
      -- Mã chính quay về mã khác của người đó: mã được cấp ban đầu, rồi mã có sớm nhất
      select code into v_back from public.vnc_codes
      where owner_id = vo.recipient_student_id and code <> vo.code
      order by (acquired_by = 'cap') desc, acquired_at nulls last, code limit 1;
      if v_back is null then raise exception 'no_other_code' using errcode = 'P0001'; end if;
      update public.students set student_code = 'VNC-' || v_back where id = vo.recipient_student_id;
    end if;
    update public.vnc_codes set owner_id = null, is_primary = false, status = 'reserved', acquired_at = null, acquired_by = null,
           gifted_by = null, note = 'Thu hồi do hoàn tiền đơn ' || v_order
    where code = vo.code;
  end if;
  update public.vnc_code_orders set status = 'refunded' where id = vo.id;
  insert into public.vnc_code_events (code, action, student_id, detail)
  values (vo.code, 'revoke', vo.recipient_student_id, jsonb_build_object('order_id', p_order_id, 'order_code', v_order, 'new_primary', v_back));
  perform public.notify_student_guardians(vo.recipient_student_id, 'vnc_revoked',
    'Đã hoàn tiền mã VNC', 'VNC code refunded',
    'VN Centre đã hoàn tiền đơn ' || v_order || '. Mã VNC-' || vo.code || ' đã được thu hồi'
      || case when v_back is not null then '; mã chính quay về VNC-' || v_back else '' end || '.',
    'VN Centre refunded order ' || v_order || '. Code VNC-' || vo.code || ' was withdrawn'
      || case when v_back is not null then '; your primary code is back to VNC-' || v_back else '' end || '.',
    '/vnc');
end $$;

create or replace function public.vnc_orders_after_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and exists (select 1 from public.vnc_code_orders where order_id = new.id) then
    if new.status = 'paid' then perform public.vnc_fulfill_order(new.id);
    elsif new.status in ('expired', 'cancelled') then perform public.vnc_release_order(new.id);
    elsif new.status = 'refunded' then perform public.vnc_revoke_order(new.id);
    end if;
  end if;
  return new;
end $$;

do $$
begin
  revoke execute on function public.vnc_revoke_order(uuid) from public, anon, authenticated;
end $$;
