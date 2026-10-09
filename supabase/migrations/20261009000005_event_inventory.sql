-- Kho sự kiện (anh Long 09/10/2026): xuất kho dụng cụ, trang thiết bị (gậy, thảm, bóng…) và quà cho một sự kiện;
-- đóng thùng; quầy phát quà trừ dần số còn lại sau từng lần phát; kiểm kê khi trả về kho (trả, hỏng, thiếu).
-- Chỉ thêm: bảng mới event_inventory_items, cột mới event_redemptions.inventory_item_id (null được), hàm mới.

create table public.event_inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  event_id uuid not null references public.events(id),
  category text not null default 'equipment' check (category in ('equipment', 'gift', 'supply')),
  box text,
  name text not null check (btrim(name) <> ''),
  unit text,
  qty_out int not null default 0 check (qty_out >= 0),          -- xuất kho mang đi
  qty_returned int check (qty_returned >= 0),                   -- trả về kho (tính cả đồ hỏng); null = chưa kiểm kê
  qty_damaged int not null default 0 check (qty_damaged >= 0),  -- trong số trả về, bao nhiêu hỏng
  points int check (points > 0),                                -- quà: số điểm để đổi (B18)
  role_code text check (role_code ~ '^[A-Z]$'),                 -- bộ phận chuẩn bị
  packed_at timestamptz,
  packed_by uuid references public.profiles(user_id) on delete set null,
  note text,
  sort_order int not null default 0,
  template_supply_id uuid references public.event_crew_supplies(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_inventory_items_event_idx on public.event_inventory_items (event_id);
create unique index event_inventory_items_template_uq on public.event_inventory_items (event_id, template_supply_id) where template_supply_id is not null;
create trigger set_updated_at before update on public.event_inventory_items for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.event_inventory_items for each row execute function public.audit_row();
alter table public.event_inventory_items enable row level security;
create policy admin_all on public.event_inventory_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Quà phát ở quầy gắn với món trong kho để trừ số còn lại
alter table public.event_redemptions add column inventory_item_id uuid references public.event_inventory_items(id);

-- Danh sách kho của sự kiện: quà đã phát (từ event_redemptions), còn lại, thiếu sau kiểm kê
create or replace function public.inv_list(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'category', i.category, 'box', i.box, 'name', i.name, 'unit', i.unit, 'qty_out', i.qty_out,
      'qty_returned', i.qty_returned, 'qty_damaged', i.qty_damaged, 'points', i.points, 'role_code', i.role_code,
      'packed', i.packed_at is not null, 'note', i.note, 'given', x.given,
      'remaining', i.qty_out - x.given,
      'missing', case when i.qty_returned is null then null else greatest(i.qty_out - x.given - i.qty_returned, 0) end,
      'surplus', case when i.qty_returned is null then null else greatest(i.qty_returned - (i.qty_out - x.given), 0) end)
      order by case i.category when 'gift' then 0 when 'equipment' then 1 else 2 end, i.box, i.sort_order, i.name)
    from public.event_inventory_items i
    cross join lateral (select count(*)::int given from public.event_redemptions r where r.inventory_item_id = i.id) x
    where i.event_id = p_event_id), '[]');
end $$;

-- Lấy danh sách mẫu (thùng đồ 26 món) vào kho sự kiện; quà thì category = gift. Chạy lại không nhân đôi.
create or replace function public.inv_seed_from_template(p_event_id uuid)
returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.event_inventory_items (event_id, category, box, name, qty_out, role_code, sort_order, template_supply_id)
  select p_event_id, case when s.box = 'QUÀ' and s.item not like 'Dấu%' and s.item not like 'Thẻ treo%' then 'gift'
                          when s.box in ('THI ĐẤU', 'AN TOÀN', 'CHẤM ĐIỂM', 'TRUYỀN THÔNG') then 'equipment' else 'supply' end,
         s.box, s.item, coalesce(s.quantity, 0), s.role_code, s.sort_order, s.id
  from public.event_crew_supplies s
  where not exists (select 1 from public.event_inventory_items i where i.event_id = p_event_id and i.template_supply_id = s.id);
  get diagnostics n = row_count;
  return n;
end $$;

-- Thêm / sửa một món (p_item.id có thì sửa). Trường: category, box, name, unit, qty_out, qty_returned, qty_damaged, points, role_code, packed, note
create or replace function public.inv_save_item(p_event_id uuid, p_item jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := nullif(p_item ->> 'id', '')::uuid;
  v_out int := nullif(p_item ->> 'qty_out', '')::int;
  v_ret int := nullif(p_item ->> 'qty_returned', '')::int;
  v_dmg int := coalesce(nullif(p_item ->> 'qty_damaged', '')::int, 0);
  v_given int;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_id is null and nullif(btrim(coalesce(p_item ->> 'name', '')), '') is null then raise exception 'name_required' using errcode = '22023'; end if;
  if v_ret is not null and v_dmg > v_ret then raise exception 'damaged_over_returned' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.event_inventory_items (event_id, category, box, name, unit, qty_out, qty_returned, qty_damaged, points, role_code, note, sort_order)
    values (p_event_id, coalesce(nullif(p_item ->> 'category', ''), 'equipment'), nullif(btrim(coalesce(p_item ->> 'box', '')), ''),
            btrim(p_item ->> 'name'), nullif(btrim(coalesce(p_item ->> 'unit', '')), ''), coalesce(v_out, 0), v_ret, v_dmg,
            nullif(p_item ->> 'points', '')::int, nullif(p_item ->> 'role_code', ''), nullif(btrim(coalesce(p_item ->> 'note', '')), ''), 1000)
    returning id into v_id;
    return v_id;
  end if;
  if not exists (select 1 from public.event_inventory_items where id = v_id and event_id = p_event_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Không cho xuất ít hơn số quà đã phát
  select count(*) into v_given from public.event_redemptions where inventory_item_id = v_id;
  if v_out is not null and v_out < v_given then raise exception 'out_below_given:%', v_given using errcode = '22023'; end if;
  update public.event_inventory_items set
    category = coalesce(nullif(p_item ->> 'category', ''), category),
    box = case when p_item ? 'box' then nullif(btrim(coalesce(p_item ->> 'box', '')), '') else box end,
    name = coalesce(nullif(btrim(coalesce(p_item ->> 'name', '')), ''), name),
    unit = case when p_item ? 'unit' then nullif(btrim(coalesce(p_item ->> 'unit', '')), '') else unit end,
    qty_out = coalesce(v_out, qty_out),
    qty_returned = case when p_item ? 'qty_returned' then v_ret else qty_returned end,
    qty_damaged = case when p_item ? 'qty_damaged' then v_dmg else qty_damaged end,
    points = case when p_item ? 'points' then nullif(p_item ->> 'points', '')::int else points end,
    note = case when p_item ? 'note' then nullif(btrim(coalesce(p_item ->> 'note', '')), '') else note end,
    packed_at = case when p_item ? 'packed' then case when (p_item ->> 'packed')::boolean then coalesce(packed_at, now()) end else packed_at end,
    packed_by = case when p_item ? 'packed' and (p_item ->> 'packed')::boolean then coalesce(packed_by, auth.uid()) when p_item ? 'packed' then null else packed_by end
  where id = v_id;
  return v_id;
end $$;

create or replace function public.inv_delete_item(p_item_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_inventory_items where id = p_item_id;
  if v_event is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.is_event_staff(v_event) then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.event_redemptions where inventory_item_id = p_item_id) then raise exception 'item_has_redemptions' using errcode = '22023'; end if;
  delete from public.event_inventory_items where id = p_item_id;
end $$;

-- Quầy: quà của sự kiện còn bao nhiêu (để chọn khi đổi quà)
create or replace function public.inv_gifts(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'points', i.points, 'qty_out', i.qty_out,
      'remaining', i.qty_out - (select count(*) from public.event_redemptions r where r.inventory_item_id = i.id)) order by i.points nulls last, i.name)
    from public.event_inventory_items i where i.event_id = p_event_id and i.category = 'gift'), '[]');
end $$;

-- Quầy: đổi một món quà trong kho. Trừ đúng số điểm của quà (B18), không vượt điểm còn lại, không phát khi hết quà.
create or replace function public.counter_redeem_gift(p_event_id uuid, p_code text, p_item_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  i public.event_inventory_items;
  v_balance int;
  v_given int;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.event_card(p_code);
  if c.passport_id is null then raise exception 'card_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.event_participations where passport_id = c.passport_id) then raise exception 'card_not_registered' using errcode = '22023'; end if;
  select * into i from public.event_inventory_items where id = p_item_id and event_id = p_event_id and category = 'gift' for update;
  if i.id is null then raise exception 'gift_not_found' using errcode = 'P0002'; end if;
  if i.points is null then raise exception 'gift_points_missing' using errcode = '22023'; end if;
  select count(*) into v_given from public.event_redemptions where inventory_item_id = i.id;
  if v_given >= i.qty_out then raise exception 'out_of_stock' using errcode = '22023'; end if;
  perform 1 from public.passports where id = c.passport_id for update;
  v_balance := (public.event_card_points(c.passport_id) ->> 'balance')::int;
  if i.points > v_balance then raise exception 'not_enough_points:%', v_balance using errcode = '22023'; end if;
  insert into public.event_redemptions (passport_id, event_id, points, gift_label, redeemed_by, inventory_item_id)
  values (c.passport_id, p_event_id, i.points, i.name, auth.uid(), i.id);
  return public.counter_card(p_event_id, p_code);
end $$;

revoke execute on function public.inv_list(uuid) from public, anon;
revoke execute on function public.inv_seed_from_template(uuid) from public, anon;
revoke execute on function public.inv_save_item(uuid, jsonb) from public, anon;
revoke execute on function public.inv_delete_item(uuid) from public, anon;
revoke execute on function public.inv_gifts(uuid) from public, anon;
revoke execute on function public.counter_redeem_gift(uuid, text, uuid) from public, anon;
