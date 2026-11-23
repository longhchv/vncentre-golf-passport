-- Spec 25 / 26 · Sân tập & phòng golf 3D — ĐỢT A (nền): địa điểm, hồ sơ hãng máy, lịch sử, vai trò khảo sát viên,
-- view công khai cho tapgolf.vncentre.net, hàm nạp dữ liệu ban đầu.
-- BẢN NHÁP của Minh · 24/11/2026 · đội code rà theo quy ước repo trước khi chạy; chạy STAGING trước.
-- Chỉ thêm. Chạy lại nhiều lần không lỗi, không xoá dữ liệu.

-------------------------------------------------------------------------------
-- 0. Vai trò khảo sát viên (nới ràng buộc, giữ nguyên các vai trò đang có)
-------------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.user_roles'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%partner_staff%'
  loop
    execute format('alter table public.user_roles drop constraint %I', c);
  end loop;
end $$;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'head_coach', 'coach', 'assistant', 'school_manager',
                  'pe_teacher', 'partner', 'event_staff', 'league_staff', 'partner_staff',
                  'venue_surveyor'));

create or replace function public.is_venue_surveyor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('venue_surveyor')
$$;

-------------------------------------------------------------------------------
-- 1. Hồ sơ hãng máy (thay brands.js)
-------------------------------------------------------------------------------
create table if not exists public.sim_brands (
  key text primary key,                                  -- 'Trackman', 'Garmin R50'… đúng tên web đang dùng
  "group" text not null check ("group" in ('tour', 'screen', 'home')),
  origin_vi text, origin_en text,
  badges text[] not null default '{}',
  sum_vi text, sum_en text, tech_vi text, tech_en text, fit_vi text, fit_en text,
  models jsonb not null default '[]'::jsonb,             -- [[tên, mô tả], …]
  feats jsonb not null default '[]'::jsonb,              -- [chuỗi, …]
  apps jsonb not null default '[]'::jsonb,               -- [[tên, mô tả], …]
  sources text[] not null default '{}',
  sort int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- 2. Địa điểm
-------------------------------------------------------------------------------
create table if not exists public.practice_venues (
  id text primary key check (id ~ '^(hn|hcm|dn|north|central|south)-[0-9]+$'),
  region text not null check (region in ('hn', 'hcm', 'dn', 'north', 'central', 'south')),
  name text not null,
  type text not null check (type in ('range', '3d', 'academy', 'course', 'mini')),
  district text, address text,
  lat numeric(9, 6), lng numeric(9, 6),
  phone text, email text, web text,
  fb_url text, fb_chain_url text, fb_chain_name text,
  videos text[] not null default '{}' check (cardinality(videos) <= 4),
  hours text,
  late boolean not null default false,
  machine text references public.sim_brands(key) on update cascade,
  machine_detail jsonb not null default '{}'::jsonb,     -- {model, software, bays, note}
  bays int check (bays is null or bays between 0 and 500),
  svc text[] not null default '{}',
  parking text not null default 'unknown' check (parking in ('free', 'paid', 'none', 'unknown')),
  parking_note text,
  residents_only boolean not null default false,
  prices jsonb not null default '[]'::jsonb,             -- [{item_vi, item_en, price, unit, note, verified_at}]
  google_rating numeric(2, 1), google_reviews int, google_at date,
  status text not null default 'active' check (status in ('draft', 'active', 'closed_temp', 'closed')),
  partner_id uuid references public.partners(id) on delete set null,
  cover_photo_id uuid,                                   -- FK thêm ở đợt B khi có bảng ảnh
  vnc_score numeric(3, 1), vnc_scored_at date,           -- đợt C
  user_rating numeric(2, 1), user_reviews int not null default 0,  -- đợt C
  created_by uuid default auth.uid(), updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists practice_venues_region_idx on public.practice_venues (region, status);
create index if not exists practice_venues_machine_idx on public.practice_venues (machine);

-- Cấp mã mới theo vùng: <vùng>-<số lớn nhất + 1>
create or replace function public.pv_next_id(p_region text) returns text
language sql stable security definer set search_path = public as $$
  select p_region || '-' || coalesce(max(split_part(id, '-', 2)::int) + 1, 0)
  from public.practice_venues where region = p_region
$$;

-------------------------------------------------------------------------------
-- 3. Lịch sử (trước/sau) — ghi bằng trigger, khôi phục bằng pv_restore
-------------------------------------------------------------------------------
create table if not exists public.practice_venue_history (
  id bigint generated always as identity primary key,
  venue_id text not null,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now(),
  source text not null default 'admin' check (source in ('admin', 'submission', 'survey', 'import', 'restore', 'owner')),
  source_id text,
  before jsonb, after jsonb
);
create index if not exists practice_venue_history_venue_idx on public.practice_venue_history (venue_id, changed_at desc);

create or replace function public.pv_log_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.practice_venue_history (venue_id, source, source_id, before, after)
  values (coalesce(new.id, old.id),
          coalesce(nullif(current_setting('pv.source', true), ''), 'admin'),
          nullif(current_setting('pv.source_id', true), ''),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-------------------------------------------------------------------------------
-- 4. Trigger chung, RLS
-------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sim_brands', 'practice_venues'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('drop trigger if exists audit_row on public.%I', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
drop trigger if exists pv_log_change on public.practice_venues;
create trigger pv_log_change after insert or update or delete on public.practice_venues
  for each row execute function public.pv_log_change();
alter table public.practice_venue_history enable row level security;

-- Hãng máy: ai cũng đọc bản đang dùng; admin ghi
drop policy if exists sim_brands_read on public.sim_brands;
create policy sim_brands_read on public.sim_brands for select using (active or public.is_admin());
drop policy if exists sim_brands_admin on public.sim_brands;
create policy sim_brands_admin on public.sim_brands for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.sim_brands to anon, authenticated;
grant insert, update, delete on public.sim_brands to authenticated;

-- Địa điểm: người xem đọc qua view công khai; bảng gốc chỉ admin (khảo sát viên đọc, không ghi)
drop policy if exists pv_admin on public.practice_venues;
create policy pv_admin on public.practice_venues for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists pv_surveyor_read on public.practice_venues;
create policy pv_surveyor_read on public.practice_venues for select to authenticated using (public.is_venue_surveyor());
revoke all on public.practice_venues from anon;
grant select, insert, update, delete on public.practice_venues to authenticated;

drop policy if exists pvh_admin_read on public.practice_venue_history;
create policy pvh_admin_read on public.practice_venue_history for select to authenticated using (public.is_admin());
revoke all on public.practice_venue_history from anon;
grant select on public.practice_venue_history to authenticated;

-------------------------------------------------------------------------------
-- 5. View công khai cho tapgolf.vncentre.net (chỉ cột hiển thị, chỉ địa điểm đang hiện)
-------------------------------------------------------------------------------
create or replace view public.pv_public_venues with (security_invoker = false) as
  select id, region, name, type, district, address, lat, lng, phone, email, web,
         fb_url, fb_chain_url, fb_chain_name, videos, hours, late, machine, machine_detail, bays,
         svc, parking, parking_note, residents_only, prices, google_rating, google_reviews,
         status, vnc_score, vnc_scored_at, user_rating, user_reviews, updated_at
  from public.practice_venues
  where status in ('active', 'closed_temp');
grant select on public.pv_public_venues to anon, authenticated;

-------------------------------------------------------------------------------
-- 6. Khôi phục một bản trong lịch sử
-------------------------------------------------------------------------------
create or replace function public.pv_restore(p_history_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare h record; v public.practice_venues;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select * into h from public.practice_venue_history where id = p_history_id;
  if h is null or h.before is null then raise exception 'nothing_to_restore'; end if;
  v := jsonb_populate_record(null::public.practice_venues, h.before);
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
    updated_by = auth.uid();
end $$;
revoke execute on function public.pv_restore(bigint) from anon, public;
grant execute on function public.pv_restore(bigint) to authenticated;

-------------------------------------------------------------------------------
-- 7. Nạp dữ liệu ban đầu (chạy một lần): docs/spec/data/sim-brands.json, practice-venues.json
--    select public.pv_import('<nội dung sim-brands.json>'::jsonb, '<nội dung practice-venues.json>'::jsonb);
--    Chạy lại: cập nhật theo id, không xoá dòng nào.
-------------------------------------------------------------------------------
create or replace function public.pv_import(p_brands jsonb, p_venues jsonb)
returns table (brands_in int, venues_in int)
language plpgsql security definer set search_path = public as $$
declare nb int; nv int;
begin
  if not public.is_admin() and auth.uid() is not null then raise exception 'not_allowed'; end if;
  perform set_config('pv.source', 'import', true);

  insert into public.sim_brands (key, "group", origin_vi, origin_en, badges, sum_vi, sum_en, tech_vi, models, feats, apps, fit_vi, sort)
  select b->>'key', b->>'group', b->>'origin_vi', b->>'origin_en',
         coalesce(array(select jsonb_array_elements_text(b->'badges')), '{}'),
         b->>'sum_vi', b->>'sum_en', b->>'tech_vi',
         coalesce(b->'models', '[]'), coalesce(b->'feats', '[]'), coalesce(b->'apps', '[]'),
         b->>'fit_vi', coalesce((b->>'sort')::int, 100)
  from jsonb_array_elements(p_brands) b
  on conflict (key) do update set
    "group" = excluded."group", origin_vi = excluded.origin_vi, origin_en = excluded.origin_en, badges = excluded.badges,
    sum_vi = excluded.sum_vi, sum_en = excluded.sum_en, tech_vi = excluded.tech_vi, models = excluded.models,
    feats = excluded.feats, apps = excluded.apps, fit_vi = excluded.fit_vi, sort = excluded.sort;
  get diagnostics nb = row_count;

  insert into public.practice_venues (id, region, name, type, district, address, lat, lng, phone, email, web,
    fb_url, fb_chain_url, fb_chain_name, videos, hours, late, machine, svc, parking, residents_only,
    google_rating, google_reviews, google_at, status)
  select v->>'id', v->>'region', v->>'name', v->>'type', v->>'district', v->>'address',
         (v->>'lat')::numeric, (v->>'lng')::numeric, v->>'phone', v->>'email', v->>'web',
         v->>'fb_url', v->>'fb_chain_url', v->>'fb_chain_name',
         coalesce(array(select jsonb_array_elements_text(v->'videos')), '{}'),
         v->>'hours', coalesce((v->>'late')::boolean, false), nullif(v->>'machine', ''),
         coalesce(array(select jsonb_array_elements_text(v->'svc')), '{}'),
         coalesce(v->>'parking', 'unknown'), coalesce((v->>'residents_only')::boolean, false),
         (v->>'google_rating')::numeric, (v->>'google_reviews')::int, date '2026-11-23',
         coalesce(v->>'status', 'active')
  from jsonb_array_elements(p_venues) v
  on conflict (id) do update set
    region = excluded.region, name = excluded.name, type = excluded.type, district = excluded.district,
    address = excluded.address, lat = excluded.lat, lng = excluded.lng, phone = excluded.phone, email = excluded.email,
    web = excluded.web, fb_url = excluded.fb_url, fb_chain_url = excluded.fb_chain_url, fb_chain_name = excluded.fb_chain_name,
    videos = excluded.videos, hours = excluded.hours, late = excluded.late, machine = excluded.machine, svc = excluded.svc,
    parking = excluded.parking, residents_only = excluded.residents_only, google_rating = excluded.google_rating,
    google_reviews = excluded.google_reviews, google_at = excluded.google_at;
  get diagnostics nv = row_count;

  brands_in := nb; venues_in := nv; return next;
end $$;
revoke execute on function public.pv_import(jsonb, jsonb) from anon, public;
grant execute on function public.pv_import(jsonb, jsonb) to authenticated;
