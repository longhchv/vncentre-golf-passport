-- Module Trải nghiệm sự kiện (10-module-trai-nghiem-su-kien.md) · S1: dữ liệu cho cả module + E1 (chuẩn bị sự kiện).
-- Ngoại lệ trong đợt 1, chủ sản phẩm duyệt 07/10/2026. Chỉ áp dụng cho thẻ hạng event_experience.

-------------------------------------------------------------------------------
-- Hạng thẻ, trạng thái, giá trị mới (mục 3)
-------------------------------------------------------------------------------
-- Hạng sự kiện không gắn dải level
alter table public.passport_tiers
  alter column level_from drop not null,
  alter column level_to drop not null,
  add column if not exists counts_toward_single_active boolean not null default true;
alter table public.passport_tiers drop constraint if exists passport_tiers_check;
alter table public.passport_tiers add constraint passport_tiers_level_range_check
  check (level_from is null and level_to is null or level_to >= level_from);
insert into public.passport_tiers (code, name_vi, name_en, level_from, level_to, validity_months, counts_toward_single_active)
values ('event_experience', 'Trải nghiệm sự kiện', 'Event Experience', null, null, 12, false)
on conflict (code) do nothing;

alter table public.passports drop constraint if exists passports_status_check;
alter table public.passports add constraint passports_status_check
  check (status in ('unassigned', 'event_registered', 'assigned', 'active', 'lost', 'void', 'retired'));

-- E-R5: hạng counts_toward_single_active = false không tính vào R2 (một sổ active mỗi học viên).
-- Chỉ mục duy nhất không tham chiếu được bảng khác → giữ cờ trên từng sổ, đồng bộ theo hạng bằng trigger.
alter table public.passports add column if not exists counts_toward_single_active boolean not null default true;
create or replace function public.passport_sync_tier_flag()
returns trigger language plpgsql set search_path = public as $$
begin
  select t.counts_toward_single_active into new.counts_toward_single_active from public.passport_tiers t where t.id = new.tier_id;
  return new;
end $$;
create trigger passport_sync_tier_flag before insert or update of tier_id on public.passports
  for each row execute function public.passport_sync_tier_flag();
update public.passports p set counts_toward_single_active = t.counts_toward_single_active from public.passport_tiers t where t.id = p.tier_id;
drop index if exists public.passports_one_active;
create unique index passports_one_active on public.passports (student_id) where status = 'active' and counts_toward_single_active;

alter table public.students drop constraint if exists students_verification_status_check;
alter table public.students add constraint students_verification_status_check
  check (verification_status in ('verified', 'pending_review', 'event_guest'));

alter table public.student_guardians drop constraint if exists student_guardians_relationship_check;
alter table public.student_guardians add constraint student_guardians_relationship_check
  check (relationship in ('father', 'mother', 'guardian', 'other', 'self'));
alter table public.student_guardians drop constraint if exists student_guardians_linked_via_check;
alter table public.student_guardians add constraint student_guardians_linked_via_check
  check (linked_via in ('passport', 'claim_code', 'invite', 'class_code', 'admin', 'import', 'event_card'));

alter table public.consents drop constraint if exists consents_type_check;
alter table public.consents add constraint consents_type_check
  check (type in ('terms', 'privacy', 'leaderboard_name', 'photo', 'contact_by_vncentre'));

-- Chương trình và loại lớp riêng cho sự kiện (không lẫn vào lộ trình 20 level — quyết định 12)
insert into public.programs (code, name_vi, name_en, description_vi, description_en, is_official_level_track)
values ('event_experience', 'Trải nghiệm sự kiện', 'Event Experience',
        'Trải nghiệm golf tại sự kiện cộng đồng (4 trạm).', 'Golf experience at community events (4 stations).', false)
on conflict (code) do nothing;
insert into public.class_types (code, name_vi, name_en, default_scoring_mode)
values ('event_experience', 'Trải nghiệm sự kiện', 'Event experience', 'measured')
on conflict (code) do nothing;

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('event.max_open_claims', '3', 'Số yêu cầu tự xác nhận (đang chờ hoặc bị từ chối) tối đa mỗi thẻ', 'Max pending/rejected self-claims per card', false),
  ('event.phone_check_max_failures', '5', 'Nhập sai SĐT khi kích hoạt thẻ sự kiện tối đa', 'Max wrong phone attempts when activating an event card', false),
  ('event.phone_check_lock_hours', '24', 'Khoá thẻ sự kiện sau khi sai SĐT quá số lần (giờ)', 'Event card lock after too many wrong phones (hours)', false),
  ('passport_decal.layout_event', '{"page":"A4","width_mm":25,"height_mm":30,"columns":7,"rows":8,"margin_top_mm":14,"margin_left_mm":12,"gap_x_mm":2,"gap_y_mm":3,"cut_lines":true}',
   'Bố cục tờ decal cho thẻ sự kiện (ô QR trên thẻ 90×55 mm)', 'Decal layout for event cards (QR area on a 90×55 mm card)', false)
on conflict do nothing;

-------------------------------------------------------------------------------
-- Bảng mới
-------------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  class_id uuid not null unique references public.classes(id),
  name_vi text not null,
  name_en text not null,
  event_date date not null,
  venue text,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  self_claim_closes_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'archived')),
  zalo_oa_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.passport_batches add column if not exists event_id uuid references public.events(id);

create table public.event_stations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name_vi text not null,
  name_en text not null,
  sort_order int not null default 0,
  max_score int check (max_score is null or max_score >= 0),     -- không giới hạn khi null (quyết định 10)
  score_step int not null default 5 check (score_step > 0),
  min_score_to_complete int not null default 5 check (min_score_to_complete >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

create table public.event_participations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  event_id uuid not null references public.events(id),
  passport_id uuid not null unique references public.passports(id),
  student_id uuid not null references public.students(id),
  player_type text not null check (player_type in ('self', 'child')),
  age_at_registration int check (age_at_registration is null or age_at_registration between 1 and 120),
  residence text,
  registered_by uuid references public.profiles(user_id) on delete set null,   -- null: người chơi tự ghi tên
  completion_status text not null default 'registered' check (completion_status in ('registered', 'pending_review', 'completed', 'rejected')),
  completed_via text check (completed_via in ('counter', 'self_claim')),
  completed_at timestamptz,
  completed_by uuid references public.profiles(user_id) on delete set null,
  phone_check_failures int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_participations_event_idx on public.event_participations (event_id);
create index event_participations_student_idx on public.event_participations (student_id);

-- Điểm gắn theo thẻ, không theo học viên
create table public.event_scores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  event_id uuid not null references public.events(id),
  passport_id uuid not null references public.passports(id),
  station_id uuid not null references public.event_stations(id),
  score int not null check (score >= 0),
  entered_by uuid references public.profiles(user_id) on delete set null,
  entered_at timestamptz not null default now(),
  updated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (passport_id, station_id)
);

create table public.event_completion_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  participation_id uuid not null references public.event_participations(id),
  photo_path text not null,
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'rejected' or reject_reason is not null)
);

-- Đổi quà bằng điểm (quyết định B18): nhiều lần, không vượt số điểm còn lại; mỗi lần gắn với một đợt đổi quà (events)
create table public.event_redemptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  passport_id uuid not null references public.passports(id),
  event_id uuid not null references public.events(id),
  points int not null check (points > 0),
  gift_label text,
  redeemed_by uuid references public.profiles(user_id) on delete set null,
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_redemptions_passport_idx on public.event_redemptions (passport_id);

-- updated_at + nhật ký (E-R13) + RLS mặc định từ chối: chỉ admin đọc/ghi thẳng; người khác đi qua hàm
do $$
declare t text;
begin
  foreach t in array array['events', 'event_stations', 'event_participations', 'event_scores', 'event_completion_claims', 'event_redemptions'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Quyền và điểm
-------------------------------------------------------------------------------
-- Nhân viên sự kiện: vai trò event_staff gán theo lớp của sự kiện (admin luôn được)
create or replace function public.is_event_staff(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_roles r join public.events e on e.class_id = r.class_id join public.profiles p on p.user_id = r.user_id
    where e.id = p_event_id and r.user_id = auth.uid() and r.role = 'event_staff' and r.deleted_at is null and p.status = 'active')
$$;

-- Tổng điểm tích luỹ và điểm còn lại của một thẻ (không lưu cứng — tính từ event_scores và event_redemptions)
create or replace function public.event_card_points(p_passport_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', coalesce((select sum(score) from public.event_scores where passport_id = p_passport_id), 0),
    'redeemed', coalesce((select sum(points) from public.event_redemptions where passport_id = p_passport_id), 0),
    'balance', coalesce((select sum(score) from public.event_scores where passport_id = p_passport_id), 0)
             - coalesce((select sum(points) from public.event_redemptions where passport_id = p_passport_id), 0))
$$;

-------------------------------------------------------------------------------
-- E1 · Chuẩn bị sự kiện (admin)
-------------------------------------------------------------------------------
-- Tạo sự kiện: tự tạo lớp loại event_experience và 4 trạm mặc định (bước 5, tối thiểu 5 để qua trạm)
create or replace function public.admin_create_event(p_data jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_class uuid;
  v_event uuid;
  v_name text := btrim(coalesce(p_data ->> 'name_vi', ''));
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if nullif(p_data ->> 'event_date', '') is null then raise exception 'date_required' using errcode = '22023'; end if;
  insert into public.classes (name, program_id, class_type_id, scoring_mode, start_date, end_date, status)
  values (v_name, (select id from public.programs where code = 'event_experience'),
          (select id from public.class_types where code = 'event_experience'), 'measured',
          (p_data ->> 'event_date')::date, (p_data ->> 'event_date')::date, 'active')
  returning id into v_class;
  insert into public.events (class_id, name_vi, name_en, event_date, venue, registration_opens_at, registration_closes_at,
                             self_claim_closes_at, zalo_oa_url)
  values (v_class, v_name, coalesce(nullif(btrim(p_data ->> 'name_en'), ''), v_name), (p_data ->> 'event_date')::date,
          nullif(btrim(coalesce(p_data ->> 'venue', '')), ''),
          nullif(p_data ->> 'registration_opens_at', '')::timestamptz, nullif(p_data ->> 'registration_closes_at', '')::timestamptz,
          nullif(p_data ->> 'self_claim_closes_at', '')::timestamptz, nullif(btrim(coalesce(p_data ->> 'zalo_oa_url', '')), ''))
  returning id into v_event;
  insert into public.event_stations (event_id, code, name_vi, name_en, sort_order) values
    (v_event, 'putt', 'Putt', 'Putt', 1),
    (v_event, 'chip', 'Chip', 'Chip', 2),
    (v_event, 'pitch', 'Pitch', 'Pitch', 3),
    (v_event, 'full_swing', 'Full swing', 'Full swing', 4);
  return v_event;
end $$;

-- Lô thẻ sự kiện (F11): hạng event_experience, gắn với sự kiện, không gán trước cho ai
create or replace function public.create_event_card_batch(p_event_id uuid, p_quantity int)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_batch uuid;
  e public.events;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  v_batch := public.create_passport_batch(e.name_vi || ' · thẻ sự kiện', (select id from public.passport_tiers where code = 'event_experience'),
                                          p_quantity, 'decal');
  update public.passport_batches set event_id = e.id where id = v_batch;
  return v_batch;
end $$;

-- Gán / gỡ vai trò event_staff cho một sự kiện
create or replace function public.set_event_staff(p_event_id uuid, p_user_id uuid, p_on boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_class uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select class_id into v_class from public.events where id = p_event_id;
  if v_class is null then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if p_on then
    if not exists (select 1 from public.user_roles where user_id = p_user_id and role = 'event_staff' and class_id = v_class and deleted_at is null) then
      insert into public.user_roles (user_id, role, class_id, granted_by) values (p_user_id, 'event_staff', v_class, auth.uid());
    end if;
  else
    update public.user_roles set deleted_at = now() where user_id = p_user_id and role = 'event_staff' and class_id = v_class and deleted_at is null;
  end if;
end $$;

-- Danh sách sự kiện kèm số liệu nhanh (admin)
create or replace function public.admin_events()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'event_date' desc) from (
    select jsonb_build_object('id', e.id, 'name_vi', e.name_vi, 'name_en', e.name_en, 'event_date', e.event_date, 'venue', e.venue,
      'status', e.status, 'class_id', e.class_id,
      'cards', (select count(*) from public.passports p join public.passport_batches b on b.id = p.batch_id where b.event_id = e.id and p.status <> 'void'),
      'registered', (select count(*) from public.event_participations ep where ep.event_id = e.id),
      'completed', (select count(*) from public.event_participations ep where ep.event_id = e.id and ep.completion_status = 'completed'),
      'staff', (select count(*) from public.user_roles r where r.class_id = e.class_id and r.role = 'event_staff' and r.deleted_at is null)) x
    from public.events e) q), '[]');
end $$;

-- Nhân viên sự kiện của một sự kiện (admin)
create or replace function public.event_staff_list(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'full_name', p.full_name, 'email', p.email, 'status', p.status)
                                    order by p.full_name)
    from public.user_roles r join public.events e on e.class_id = r.class_id join public.profiles p on p.user_id = r.user_id
    where e.id = p_event_id and r.role = 'event_staff' and r.deleted_at is null), '[]');
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_create_event(jsonb)', 'public.create_event_card_batch(uuid, int)',
                           'public.set_event_staff(uuid, uuid, boolean)', 'public.admin_events()', 'public.event_staff_list(uuid)',
                           'public.is_event_staff(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke execute on function public.event_card_points(uuid) from public, anon, authenticated;
end $$;
