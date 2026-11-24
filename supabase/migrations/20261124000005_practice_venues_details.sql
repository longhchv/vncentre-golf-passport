-- Spec 29 · Sân tập & phòng 3D — GĐ1 "Thông tin chi tiết": giá theo từng loại máy, giá sân tập chi tiết, thuê gậy,
-- ưu đãi, điểm mạnh nhất, học viện + HLV (chỉ tên đã công khai), giờ vắng/đông, trẻ em, shop golf, tiện nghi,
-- ngôn ngữ nhân viên, nhãn "Phù hợp với". Anh Long giao 24/11/2026.
-- Minh · 24/11/2026. Chỉ THÊM cột; view pv_public_venues giữ nguyên tên + mọi cột cũ (kể cả region, type, status),
-- cột mới nối vào cuối. Chạy lại nhiều lần không lỗi.

-------------------------------------------------------------------------------
-- 1. Cột mới
-------------------------------------------------------------------------------
alter table public.practice_venues
  add column if not exists highlight_vi text,                              -- điểm mạnh nhất, 1 câu
  add column if not exists highlight_en text,
  add column if not exists sim_rates jsonb not null default '[]'::jsonb,   -- [{brand, model, bays, unit, weekday, weekend, note}]
  add column if not exists range_rates jsonb not null default '[]'::jsonb, -- [{kind, label, balls, weekday, weekend, note}]
  add column if not exists club_rental jsonb not null default '{}'::jsonb, -- {available, price, note}
  add column if not exists promos jsonb not null default '[]'::jsonb,      -- [{title, detail, until, url}]
  add column if not exists academy jsonb not null default '{}'::jsonb,     -- {has, name, note}
  add column if not exists coaches jsonb not null default '[]'::jsonb,     -- [{name, title, src}] — src: link công khai, bắt buộc
  add column if not exists busy jsonb not null default '{}'::jsonb,        -- {quiet: [slot], busy: [slot], note}
  add column if not exists kids jsonb not null default '{}'::jsonb,        -- {junior_clubs, junior_class, min_age, note}
  add column if not exists shop jsonb not null default '{}'::jsonb,        -- {apparel, accessories, clubs, fitting, note}
  add column if not exists facilities jsonb not null default '{}'::jsonb,  -- {waiting_area, vip_room, surface, covered, note}
  add column if not exists languages text[] not null default '{}',         -- en, ko, ja, zh
  add column if not exists fit_tags text[] not null default '{}',          -- noon, early, after_work, kids_mall, group, foreigners
  add column if not exists info_sources jsonb not null default '{}'::jsonb,-- {trường: {src, url, at}} — nội bộ
  add column if not exists needs_survey text[] not null default '{}';      -- trường còn thiếu, cần khảo sát / gọi hỏi — nội bộ

-------------------------------------------------------------------------------
-- 2. Kiểm tra dữ liệu (trigger, để mọi đường ghi — admin, khảo sát, chủ sân, đề xuất — cùng một luật)
-------------------------------------------------------------------------------
create or replace function public.pv_slots() returns text[] language sql immutable as $$
  select array['early', 'morning', 'noon', 'afternoon', 'evening', 'late']
$$;
create or replace function public.pv_fit_tags() returns text[] language sql immutable as $$
  select array['noon', 'early', 'after_work', 'kids_mall', 'group', 'foreigners']
$$;

create or replace function public.pv_money_ok(j jsonb) returns boolean language sql immutable as $$
  select j is null or jsonb_typeof(j) = 'null' or (jsonb_typeof(j) = 'number' and (j #>> '{}')::numeric between 0 and 100000000)
$$;

create or replace function public.pv_validate_details() returns trigger
language plpgsql set search_path = public as $$
declare e jsonb;
begin
  if char_length(coalesce(new.highlight_vi, '')) > 160 or char_length(coalesce(new.highlight_en, '')) > 160 then raise exception 'detail_invalid: highlight'; end if;
  if jsonb_typeof(new.sim_rates) <> 'array' or jsonb_array_length(new.sim_rates) > 20 then raise exception 'detail_invalid: sim_rates'; end if;
  for e in select * from jsonb_array_elements(new.sim_rates) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'brand', '') = ''
       or coalesce(e ->> 'unit', 'hour_room') not in ('hour_room', 'hour_person', 'round', 'other')
       or not public.pv_money_ok(e -> 'weekday') or not public.pv_money_ok(e -> 'weekend') then
      raise exception 'detail_invalid: sim_rates';
    end if;
  end loop;
  if jsonb_typeof(new.range_rates) <> 'array' or jsonb_array_length(new.range_rates) > 30 then raise exception 'detail_invalid: range_rates'; end if;
  for e in select * from jsonb_array_elements(new.range_rates) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'kind', '') not in ('balls', 'hour', 'unlimited', 'month', 'lesson', 'other')
       or not public.pv_money_ok(e -> 'weekday') or not public.pv_money_ok(e -> 'weekend') then
      raise exception 'detail_invalid: range_rates';
    end if;
  end loop;
  if jsonb_typeof(new.promos) <> 'array' or jsonb_array_length(new.promos) > 10 then raise exception 'detail_invalid: promos'; end if;
  if jsonb_typeof(new.coaches) <> 'array' or jsonb_array_length(new.coaches) > 30 then raise exception 'detail_invalid: coaches'; end if;
  for e in select * from jsonb_array_elements(new.coaches) loop
    -- Chỉ ghi tên HLV đã được chính họ hoặc học viện công khai: bắt buộc có link nguồn
    if coalesce(e ->> 'name', '') = '' or coalesce(e ->> 'src', '') !~ '^https?://' then raise exception 'detail_invalid: coach_source'; end if;
  end loop;
  foreach e in array array[new.club_rental, new.academy, new.busy, new.kids, new.shop, new.facilities, new.info_sources] loop
    if jsonb_typeof(e) <> 'object' then raise exception 'detail_invalid: object'; end if;
  end loop;
  if not public.pv_money_ok(new.club_rental -> 'price') then raise exception 'detail_invalid: club_rental'; end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(new.busy -> 'quiet', '[]')) x where x <> all (public.pv_slots()))
     or exists (select 1 from jsonb_array_elements_text(coalesce(new.busy -> 'busy', '[]')) x where x <> all (public.pv_slots())) then
    raise exception 'detail_invalid: busy';
  end if;
  if coalesce(new.facilities ->> 'surface', 'unknown') not in ('mat', 'grass', 'both', 'unknown') then raise exception 'detail_invalid: surface'; end if;
  if not new.languages <@ array['en', 'ko', 'ja', 'zh'] then raise exception 'detail_invalid: languages'; end if;
  if not new.fit_tags <@ public.pv_fit_tags() then raise exception 'detail_invalid: fit_tags'; end if;
  return new;
end $$;
drop trigger if exists pv_validate_details on public.practice_venues;
create trigger pv_validate_details before insert or update on public.practice_venues
  for each row execute function public.pv_validate_details();

-------------------------------------------------------------------------------
-- 3. Trường được sửa qua đề xuất / khảo sát (pv_edit_fields) và chủ sân tự sửa (pv_owner_fields)
-------------------------------------------------------------------------------
create or replace function public.pv_detail_fields() returns text[] language sql immutable as $$
  select array['highlight_vi', 'highlight_en', 'sim_rates', 'range_rates', 'club_rental', 'promos', 'academy', 'coaches',
               'busy', 'kids', 'shop', 'facilities', 'languages', 'fit_tags']
$$;
create or replace function public.pv_edit_fields() returns text[] language sql immutable as $$
  select array['name', 'type', 'district', 'address', 'lat', 'lng', 'phone', 'email', 'web', 'fb_url', 'hours', 'late',
               'machine', 'machine_detail', 'bays', 'svc', 'parking', 'parking_note', 'residents_only', 'prices']
         || public.pv_detail_fields()
$$;
create or replace function public.pv_owner_fields() returns text[] language sql immutable as $$
  select array['phone', 'email', 'web', 'fb_url', 'hours', 'late', 'machine', 'machine_detail', 'bays', 'svc',
               'parking', 'parking_note', 'prices']
         || public.pv_detail_fields()
$$;

create or replace function public.pv_apply_patch(p_venue_id text, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare cur jsonb; merged public.practice_venues;
begin
  select to_jsonb(v) into cur from public.practice_venues v where id = p_venue_id for update;
  if cur is null then raise exception 'venue_not_found'; end if;
  merged := jsonb_populate_record(null::public.practice_venues, cur || p_patch);
  update public.practice_venues set
    name = merged.name, type = merged.type, district = merged.district, address = merged.address,
    lat = merged.lat, lng = merged.lng, phone = merged.phone, email = merged.email, web = merged.web,
    fb_url = merged.fb_url, hours = merged.hours, late = merged.late, machine = merged.machine,
    machine_detail = merged.machine_detail, bays = merged.bays, svc = merged.svc, parking = merged.parking,
    parking_note = merged.parking_note, residents_only = merged.residents_only, prices = merged.prices,
    status = merged.status, owner_updated_at = merged.owner_updated_at,
    highlight_vi = merged.highlight_vi, highlight_en = merged.highlight_en, sim_rates = merged.sim_rates,
    range_rates = merged.range_rates, club_rental = merged.club_rental, promos = merged.promos, academy = merged.academy,
    coaches = merged.coaches, busy = merged.busy, kids = merged.kids, shop = merged.shop, facilities = merged.facilities,
    languages = merged.languages, fit_tags = merged.fit_tags, info_sources = merged.info_sources, needs_survey = merged.needs_survey,
    updated_by = auth.uid()
  where id = p_venue_id;
end $$;
revoke execute on function public.pv_apply_patch(text, jsonb) from public, anon, authenticated;

-- Khôi phục: bản lịch sử cũ (trước GĐ1) không có cột mới → giữ giá trị hiện tại cho các cột đó
create or replace function public.pv_restore(p_history_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare h record; v public.practice_venues; cur jsonb;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select * into h from public.practice_venue_history where id = p_history_id;
  if h is null or h.before is null then raise exception 'nothing_to_restore'; end if;
  select to_jsonb(x) into cur from public.practice_venues x where x.id = h.venue_id;
  v := jsonb_populate_record(null::public.practice_venues, coalesce(cur, '{}'::jsonb) || h.before);
  perform set_config('pv.source', 'restore', true);
  perform set_config('pv.source_id', p_history_id::text, true);
  insert into public.practice_venues select v.*
  on conflict (id) do update set
    region = excluded.region, name = excluded.name, type = excluded.type, district = excluded.district,
    address = excluded.address, lat = excluded.lat, lng = excluded.lng, phone = excluded.phone,
    email = excluded.email, web = excluded.web, fb_url = excluded.fb_url, fb_chain_url = excluded.fb_chain_url,
    fb_chain_name = excluded.fb_chain_name, videos = excluded.videos, hours = excluded.hours, late = excluded.late,
    machine = excluded.machine, machine_detail = excluded.machine_detail, bays = excluded.bays, svc = excluded.svc,
    parking = excluded.parking, parking_note = excluded.parking_note, residents_only = excluded.residents_only,
    prices = excluded.prices, google_rating = excluded.google_rating, google_reviews = excluded.google_reviews,
    google_at = excluded.google_at, status = excluded.status, partner_id = excluded.partner_id,
    highlight_vi = excluded.highlight_vi, highlight_en = excluded.highlight_en, sim_rates = excluded.sim_rates,
    range_rates = excluded.range_rates, club_rental = excluded.club_rental, promos = excluded.promos, academy = excluded.academy,
    coaches = excluded.coaches, busy = excluded.busy, kids = excluded.kids, shop = excluded.shop, facilities = excluded.facilities,
    languages = excluded.languages, fit_tags = excluded.fit_tags, info_sources = excluded.info_sources, needs_survey = excluded.needs_survey,
    updated_by = auth.uid();
end $$;
revoke execute on function public.pv_restore(bigint) from anon, public;
grant execute on function public.pv_restore(bigint) to authenticated;

-------------------------------------------------------------------------------
-- 4. View công khai: GIỮ NGUYÊN tên, thứ tự và mọi cột cũ (trang chủ vncentre.net đang đọc region, type, status);
--    cột mới chỉ nối vào cuối. info_sources, needs_survey là nội bộ — không đưa ra view.
-------------------------------------------------------------------------------
create or replace view public.pv_public_venues with (security_invoker = false) as
  select v.id, v.region, v.name, v.type, v.district, v.address, v.lat, v.lng, v.phone, v.email, v.web,
         v.fb_url, v.fb_chain_url, v.fb_chain_name, v.videos, v.hours, v.late, v.machine, v.machine_detail, v.bays,
         v.svc, v.parking, v.parking_note, v.residents_only, v.prices, v.google_rating, v.google_reviews,
         v.status, v.vnc_score, v.vnc_scored_at, v.user_rating, v.user_reviews, v.updated_at,
         v.owner_updated_at, (select p.path from public.practice_venue_photos p where p.id = v.cover_photo_id and p.status = 'approved') as cover_path,
         (v.partner_id is not null) as claimed,
         v.highlight_vi, v.highlight_en, v.sim_rates, v.range_rates, v.club_rental, v.promos, v.academy, v.coaches,
         v.busy, v.kids, v.shop, v.facilities, v.languages, v.fit_tags
  from public.practice_venues v
  where v.status in ('active', 'closed_temp');
grant select on public.pv_public_venues to anon, authenticated;
