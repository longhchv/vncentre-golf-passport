-- Spec 18 · Golf Passport Partners – giai đoạn 1: đối tác, ưu đãi, quầy quét QR động, điểm tích luỹ,
-- mã giới thiệu MỘT CẤP, thưởng / hoa hồng TẠM TÍNH (không chi trả), đối soát tháng, khối Kinh doanh.
-- Anh Long chốt 07/11/2026:
--   · Ưu đãi chọn được cả hai cách tính điểm: theo số tiền khách trả (1 điểm / 10.000 đ, admin chỉnh) hoặc điểm cố định
--     (theo tinh thần Tem đối tác 04-dot-3 mục 4). Bảng partner_activities / partner_stamps của Đợt 3 CHƯA tạo.
--   · Quét sổ của một bé → thưởng tính cho người đã giới thiệu TÀI KHOẢN PHỤ HUYNH quản lý sổ (một cấp).
--   · Vai mới partner_staff cho nhân viên quầy (vai partner cũ để nguyên).
-- Một cấp: referral_earnings chỉ sinh cho referral_links.referrer_user_id của CHÍNH tài khoản khách. Không có hàm / view nào
-- đi lên "người giới thiệu của người giới thiệu".
-- RLS mặc định từ chối; quầy, khách, người giới thiệu chỉ đi qua hàm security definer.

-------------------------------------------------------------------------------
-- Vai partner_staff
-------------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.user_roles'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%league_staff%'
  loop
    execute format('alter table public.user_roles drop constraint %I', c);
  end loop;
end $$;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'head_coach', 'coach', 'assistant', 'school_manager',
                  'pe_teacher', 'partner', 'event_staff', 'league_staff', 'partner_staff'));

-------------------------------------------------------------------------------
-- Cấu hình (admin chỉnh ở Cấu hình; nhật ký qua trigger audit có sẵn trên app_settings)
-------------------------------------------------------------------------------
create or replace function public.setting_num(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_settings where key = p_key), p_default)
$$;

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('partners.points_per_10k', '1', 'Điểm tích luỹ cho mỗi 10.000 đ khách trả tại đối tác (ưu đãi tính điểm theo tiền)', 'Points per 10,000 VND paid at a partner', true),
  ('partners.referral_rate', '0.05', 'Tỷ lệ thưởng người giới thiệu trên số tiền khách trả (không vượt phí VN Centre của đối tác)', 'Referrer reward rate on paid amount (capped at the partner fee rate)', false),
  ('partners.max_visits_per_day', '1', 'Số lượt ưu đãi tối đa mỗi sổ / ngày / đối tác', 'Max offer uses per passport per day per partner', false),
  ('partners.flag_amount', '5000000', 'Hoá đơn lớn hơn mức này (đồng) bị đánh dấu bất thường, chờ admin xem', 'Bills above this amount (VND) are flagged for review', false),
  ('partners.sales_commission_rate', '0.1', 'Hoa hồng tạm tính của người chốt deal, tính trên phí VN Centre thu của đối tác', 'Provisional sales commission rate on the VN Centre fee', false),
  ('partners.void_window_minutes', '30', 'Quầy được huỷ lượt vừa nhập trong số phút này', 'Minutes a counter can void a visit it just recorded', false),
  ('partners.legal_review', '{"approved": false, "note": null}', 'Đã duyệt pháp lý mô hình thưởng / hoa hồng (luật sư). Chưa duyệt thì không bật được chi trả', 'Legal review of the reward model; payouts cannot be enabled until approved', false),
  ('partners.payouts_enabled', 'false', 'Chi trả thưởng / hoa hồng. Giai đoạn 1 tắt; chỉ bật được khi đã duyệt pháp lý', 'Pay out rewards / commissions (phase 1: off)', false),
  ('referral.claim_window_days', '7', 'Tài khoản mới được gắn mã giới thiệu trong số ngày này kể từ khi tạo', 'Days after sign-up during which a referral code can be attached', false)
on conflict do nothing;

-- Spec 17 đã chừa khối Kinh doanh: bật
update public.app_settings set value = 'true' where key = 'profile.business_tab_enabled';

-- Chặn bật chi trả khi chưa duyệt pháp lý (kể cả admin)
create or replace function public.partners_guard_payouts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.key = 'partners.payouts_enabled' and new.value = 'true'::jsonb
     and coalesce((select (value ->> 'approved')::boolean from public.app_settings where key = 'partners.legal_review'), false) is not true then
    raise exception 'payouts_need_legal_review' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger partners_guard_payouts before insert or update on public.app_settings
  for each row execute function public.partners_guard_payouts();

-------------------------------------------------------------------------------
-- Bảng
-------------------------------------------------------------------------------
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  name text not null,
  kind text not null check (kind in ('golf_course', 'driving_range', 'restaurant', 'cafe', 'other')),
  address text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  photo_url text,
  description_vi text,
  description_en text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  fee_rate numeric(4, 3) not null default 0.05 check (fee_rate between 0.05 and 0.10),
  trial_start date,
  trial_end date check (trial_end is null or trial_start is null or trial_end >= trial_start),
  sales_owner_user_id uuid references public.profiles(user_id) on delete set null,
  contract_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  partner_id uuid not null references public.partners(id) on delete cascade,
  name_vi text not null,
  name_en text,
  kind text not null check (kind in ('percent', 'bonus_item')),
  percent int check (percent between 10 and 50),
  bonus_vi text,
  bonus_en text,
  service_vi text,
  service_en text,
  conditions_vi text,
  conditions_en text,
  -- Cách tính điểm: theo tiền khách trả (partners.points_per_10k) hoặc số điểm cố định mỗi lượt
  points_mode text not null default 'per_amount' check (points_mode in ('per_amount', 'fixed')),
  fixed_points int check (fixed_points is null or fixed_points >= 0),
  valid_from date,
  valid_to date check (valid_to is null or valid_from is null or valid_to >= valid_from),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or percent is not null),
  check (kind <> 'bonus_item' or bonus_vi is not null),
  check (points_mode <> 'fixed' or fixed_points is not null)
);
create index partner_offers_partner_idx on public.partner_offers (partner_id);

create table public.partner_staff (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null default 'cashier' check (role in ('cashier', 'manager')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index partner_staff_one on public.partner_staff (partner_id, user_id) where deleted_at is null;

-- Mã QR động của khách: mỗi mã sống partners.qr_seconds (60 giây), chỉ dùng được một lần
create table public.partner_qr_tokens (
  token text primary key,
  student_id uuid not null references public.students(id),
  issued_by uuid not null references public.profiles(user_id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index partner_qr_tokens_exp_idx on public.partner_qr_tokens (expires_at);

create table public.partner_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  partner_id uuid not null references public.partners(id),
  student_id uuid not null references public.students(id),
  offer_id uuid references public.partner_offers(id),
  list_amount bigint not null check (list_amount >= 0),
  paid_amount bigint not null check (paid_amount >= 0),
  invoice_no text,
  invoice_photo_path text,
  cashier_user_id uuid references public.profiles(user_id) on delete set null,
  -- Tài khoản khách (phụ huynh quản lý sổ / chính chủ) lúc quét — dùng tìm người giới thiệu một cấp
  customer_user_id uuid references public.profiles(user_id) on delete set null,
  points int not null default 0,
  status text not null default 'recorded' check (status in ('recorded', 'flagged', 'void')),
  void_reason text,
  voided_by uuid references public.profiles(user_id) on delete set null,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partner_visits_partner_idx on public.partner_visits (partner_id, created_at desc);
create index partner_visits_student_idx on public.partner_visits (student_id, created_at desc);

-- Điểm tích luỹ (01-du-lieu mục điểm thưởng); cycle_no / is_frozen để Đợt 3 dùng tiếp
create table public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  delta int not null,
  reason text not null check (reason in ('partner_visit', 'partner_visit_void', 'admin_adjust')),
  source_type text,
  source_id uuid,
  cycle_no int,
  is_frozen boolean not null default false,
  note text,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reward_ledger_student_idx on public.reward_ledger (student_id);

create table public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  user_id uuid not null unique references public.profiles(user_id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referral_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  referred_user_id uuid not null unique references public.profiles(user_id) on delete cascade,
  referrer_user_id uuid not null references public.profiles(user_id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referred_user_id <> referrer_user_id)
);
create index referral_links_referrer_idx on public.referral_links (referrer_user_id);

create table public.referral_earnings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  referrer_user_id uuid not null references public.profiles(user_id) on delete cascade,
  visit_id uuid not null unique references public.partner_visits(id),
  rate numeric(5, 4) not null,
  amount bigint not null,
  status text not null default 'provisional' check (status in ('provisional', 'confirmed', 'void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index referral_earnings_referrer_idx on public.referral_earnings (referrer_user_id);

create table public.partner_settlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  partner_id uuid not null references public.partners(id),
  month date not null check (extract(day from month) = 1),
  visits_count int not null,
  paid_total bigint not null,
  fee_rate numeric(4, 3) not null,
  fee_amount bigint not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'confirmed', 'paid')),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(user_id) on delete set null,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, month)
);

create table public.sales_commissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  sales_owner_user_id uuid not null references public.profiles(user_id) on delete cascade,
  partner_id uuid not null references public.partners(id),
  settlement_id uuid unique references public.partner_settlements(id) on delete cascade,
  period date not null,
  basis_amount bigint not null,
  rate numeric(5, 4) not null,
  amount bigint not null,
  status text not null default 'provisional' check (status in ('provisional', 'confirmed', 'void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Giai đoạn 1: thưởng / hoa hồng không được chuyển sang confirmed khi chưa bật chi trả
create or replace function public.partners_guard_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' and coalesce((select value = 'true'::jsonb from public.app_settings where key = 'partners.payouts_enabled'), false) is not true then
    raise exception 'payouts_disabled' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger guard_confirmed before insert or update on public.referral_earnings for each row execute function public.partners_guard_confirmed();
create trigger guard_confirmed before insert or update on public.sales_commissions for each row execute function public.partners_guard_confirmed();

-- updated_at + nhật ký + RLS mặc định từ chối
do $$
declare t text;
begin
  foreach t in array array['partners', 'partner_offers', 'partner_staff', 'partner_visits', 'reward_ledger', 'referral_codes',
                           'referral_links', 'referral_earnings', 'partner_settlements', 'sales_commissions'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  -- Đối tác, ưu đãi: admin sửa thẳng. Còn lại: admin chỉ xem, ghi qua hàm
  foreach t in array array['partners', 'partner_offers'] loop
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  foreach t in array array['partner_staff', 'partner_visits', 'reward_ledger', 'referral_codes', 'referral_links',
                           'referral_earnings', 'partner_settlements', 'sales_commissions'] loop
    execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;
alter table public.partner_qr_tokens enable row level security;
revoke all on public.partner_qr_tokens from anon, authenticated;

-------------------------------------------------------------------------------
-- Hàm dùng chung
-------------------------------------------------------------------------------
-- Tài khoản khách của một sổ: chính chủ (self) nếu có tài khoản, không thì phụ huynh chính đang quản lý
create or replace function public.partner_customer_user(p_student_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select g.user_id
  from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id and g.deleted_at is null and g.user_id is not null
  where sg.student_id = p_student_id and sg.deleted_at is null and sg.status = 'active'
  order by (sg.relationship = 'self') desc, sg.is_primary desc, sg.can_manage desc, sg.linked_at nulls last
  limit 1
$$;

create or replace function public.is_partner_staff(p_partner_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partner_staff ps
    join public.profiles p on p.user_id = ps.user_id and p.status = 'active'
    where ps.partner_id = p_partner_id and ps.user_id = auth.uid() and ps.deleted_at is null)
$$;

-- Ngày theo giờ Việt Nam
create or replace function public.vn_date(p_ts timestamptz)
returns date language sql immutable as $$ select (p_ts at time zone 'Asia/Ho_Chi_Minh')::date $$;

-------------------------------------------------------------------------------
-- Khách: mã QR động (phụ huynh mở thay cho tài khoản con)
-------------------------------------------------------------------------------
create or replace function public.partner_qr_issue(p_student_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_token text;
  v_exp timestamptz := now() + make_interval(secs => 60);
begin
  if auth.uid() is null or not public.is_guardian_of(p_student_id) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  delete from public.partner_qr_tokens where expires_at < now() - interval '1 day';
  v_token := 'GPP-' || public.random_code(16);
  insert into public.partner_qr_tokens (token, student_id, issued_by, expires_at) values (v_token, p_student_id, auth.uid(), v_exp);
  return jsonb_build_object('token', v_token, 'expires_at', v_exp, 'seconds', 60);
end $$;

-- Điểm tích luỹ của một sổ (phụ huynh, chính chủ, tài khoản con, admin)
create or replace function public.reward_balance(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_guardian_of(p_student_id)
          or exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'balance', coalesce((select sum(delta) from public.reward_ledger where student_id = p_student_id), 0),
    'recent', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select l.delta, l.reason, l.created_at, p.name as partner_name
        from public.reward_ledger l
        left join public.partner_visits v on v.id = l.source_id and l.source_type = 'partner_visit'
        left join public.partners p on p.id = v.partner_id
        where l.student_id = p_student_id order by l.created_at desc limit 20) x), '[]'));
end $$;

-- Danh sách đối tác đang có ưu đãi (mọi người đăng nhập)
create or replace function public.partner_public_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'kind', p.kind, 'address', p.address, 'lat', p.lat, 'lng', p.lng,
      'photo_url', p.photo_url, 'description_vi', p.description_vi, 'description_en', p.description_en,
      'offers', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name_vi', o.name_vi, 'name_en', o.name_en, 'kind', o.kind,
                   'percent', o.percent, 'bonus_vi', o.bonus_vi, 'bonus_en', o.bonus_en, 'service_vi', o.service_vi, 'service_en', o.service_en,
                   'conditions_vi', o.conditions_vi, 'conditions_en', o.conditions_en, 'valid_to', o.valid_to) order by o.created_at), '[]')
                 from public.partner_offers o
                 where o.partner_id = p.id and o.is_active
                   and (o.valid_from is null or o.valid_from <= public.vn_date(now()))
                   and (o.valid_to is null or o.valid_to >= public.vn_date(now()))))
    order by p.name), '[]')
  from public.partners p
  where p.status = 'active' and auth.uid() is not null
$$;

-------------------------------------------------------------------------------
-- Quầy đối tác (/partner)
-------------------------------------------------------------------------------
create or replace function public.partner_my_partners()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'role', ps.role) order by p.name), '[]')
  from public.partner_staff ps join public.partners p on p.id = ps.partner_id
  where ps.user_id = auth.uid() and ps.deleted_at is null and public.is_partner_staff(p.id)
$$;

-- Ưu đãi đang có của một đối tác (dùng chung cho quầy)
create or replace function public.partner_active_offers(p_partner_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name_vi', o.name_vi, 'name_en', o.name_en, 'kind', o.kind, 'percent', o.percent,
           'bonus_vi', o.bonus_vi, 'bonus_en', o.bonus_en, 'points_mode', o.points_mode, 'fixed_points', o.fixed_points) order by o.created_at), '[]')
  from public.partner_offers o
  where o.partner_id = p_partner_id and o.is_active
    and (o.valid_from is null or o.valid_from <= public.vn_date(now()))
    and (o.valid_to is null or o.valid_to >= public.vn_date(now()))
$$;

-- Quét mã: tên che bớt, hạng sổ, ưu đãi; không ngày sinh, SĐT, trường, lịch sử nơi khác
create or replace function public.partner_scan(p_partner_id uuid, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t public.partner_qr_tokens;
  s public.students;
  v_tier jsonb;
  v_today int;
begin
  if not public.is_partner_staff(p_partner_id) then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.partners where id = p_partner_id and status = 'active') then
    raise exception 'partner_inactive' using errcode = 'P0001';
  end if;
  select * into t from public.partner_qr_tokens where token = btrim(p_token);
  if t.token is null then raise exception 'qr_invalid' using errcode = 'P0002'; end if;
  if t.expires_at < now() or t.used_at is not null then raise exception 'qr_expired' using errcode = 'P0001'; end if;
  select * into s from public.students where id = t.student_id and deleted_at is null;
  if s.id is null then raise exception 'qr_invalid' using errcode = 'P0002'; end if;
  select jsonb_build_object('code', pt.code, 'name_vi', pt.name_vi, 'name_en', pt.name_en) into v_tier
  from public.passports pp join public.passport_tiers pt on pt.id = pp.tier_id
  where pp.student_id = s.id and pp.status = 'active' limit 1;
  select count(*) into v_today from public.partner_visits
  where partner_id = p_partner_id and student_id = s.id and status <> 'void' and public.vn_date(created_at) = public.vn_date(now());
  return jsonb_build_object(
    'name', public.mask_name(s.full_name), 'tier', v_tier, 'expires_at', t.expires_at,
    'used_today', v_today, 'limit_reached', v_today >= public.setting_int('partners.max_visits_per_day', 1),
    'offers', public.partner_active_offers(p_partner_id));
end $$;

create or replace function public.partner_record_visit(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_partner public.partners;
  v_offer public.partner_offers;
  t public.partner_qr_tokens;
  v_paid bigint := (p ->> 'paid_amount')::bigint;
  v_list bigint := coalesce((p ->> 'list_amount')::bigint, (p ->> 'paid_amount')::bigint);
  v_status text := 'recorded';
  v_points int := 0;
  v_customer uuid;
  v_visit uuid;
begin
  select * into v_partner from public.partners where id = (p ->> 'partner_id')::uuid;
  if v_partner.id is null or not public.is_partner_staff(v_partner.id) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if v_partner.status <> 'active' then raise exception 'partner_inactive' using errcode = 'P0001'; end if;
  if v_paid is null or v_paid < 0 or v_list < 0 then raise exception 'invalid_amount' using errcode = 'invalid_parameter_value'; end if;

  -- Khoá mã để hai quầy không dùng cùng lúc
  select * into t from public.partner_qr_tokens where token = btrim(p ->> 'token') for update;
  if t.token is null then raise exception 'qr_invalid' using errcode = 'P0002'; end if;
  if t.expires_at < now() or t.used_at is not null then raise exception 'qr_expired' using errcode = 'P0001'; end if;

  if p ->> 'offer_id' is not null then
    select * into v_offer from public.partner_offers o
    where o.id = (p ->> 'offer_id')::uuid and o.partner_id = v_partner.id
      and exists (select 1 from jsonb_array_elements(public.partner_active_offers(v_partner.id)) x where x ->> 'id' = o.id::text);
    if v_offer.id is null then raise exception 'offer_invalid' using errcode = 'invalid_parameter_value'; end if;
  end if;

  -- Giới hạn lượt / ngày / đối tác (khoá theo sổ để hai lần lưu đồng thời không lọt)
  perform pg_advisory_xact_lock(hashtext('partner_visit:' || v_partner.id || ':' || t.student_id));
  if (select count(*) from public.partner_visits
      where partner_id = v_partner.id and student_id = t.student_id and status <> 'void'
        and public.vn_date(created_at) = public.vn_date(now())) >= public.setting_int('partners.max_visits_per_day', 1) then
    raise exception 'daily_limit' using errcode = 'P0001';
  end if;

  if v_paid > public.setting_num('partners.flag_amount', 5000000) then v_status := 'flagged'; end if;
  v_points := case when v_offer.points_mode = 'fixed' then v_offer.fixed_points
                   else floor(v_paid / 10000.0 * public.setting_num('partners.points_per_10k', 1))::int end;
  v_customer := public.partner_customer_user(t.student_id);

  insert into public.partner_visits (partner_id, student_id, offer_id, list_amount, paid_amount, invoice_no, invoice_photo_path,
                                     cashier_user_id, customer_user_id, points, status)
  values (v_partner.id, t.student_id, v_offer.id, v_list, v_paid, nullif(btrim(p ->> 'invoice_no'), ''), nullif(p ->> 'invoice_photo_path', ''),
          auth.uid(), v_customer, v_points, v_status)
  returning id into v_visit;
  update public.partner_qr_tokens set used_at = now() where token = t.token;

  -- Lượt bất thường: chưa cộng điểm, chưa sinh thưởng — chờ admin xác nhận (partner_visit_review)
  if v_status = 'recorded' then
    perform public.partner_visit_apply(v_visit);
  end if;

  return jsonb_build_object('id', v_visit, 'status', v_status, 'points', case when v_status = 'recorded' then v_points else 0 end);
end $$;

-- Cộng điểm + thưởng người giới thiệu MỘT CẤP cho một lượt (nội bộ)
create or replace function public.partner_visit_apply(p_visit_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v public.partner_visits;
  v_fee numeric;
  v_referrer uuid;
  v_rate numeric;
begin
  select * into v from public.partner_visits where id = p_visit_id;
  if v.points <> 0 and not exists (select 1 from public.reward_ledger where source_type = 'partner_visit' and source_id = v.id and reason = 'partner_visit') then
    insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, created_by)
    values (v.student_id, v.points, 'partner_visit', 'partner_visit', v.id, auth.uid());
  end if;
  -- Chỉ người đã giới thiệu CHÍNH tài khoản khách; không đi lên cấp trên
  select l.referrer_user_id into v_referrer from public.referral_links l where l.referred_user_id = v.customer_user_id;
  if v_referrer is not null and v.paid_amount > 0 then
    select fee_rate into v_fee from public.partners where id = v.partner_id;
    v_rate := least(public.setting_num('partners.referral_rate', 0.05), v_fee);
    insert into public.referral_earnings (referrer_user_id, visit_id, rate, amount)
    values (v_referrer, v.id, v_rate, round(v.paid_amount * v_rate))
    on conflict (visit_id) do update set status = 'provisional', rate = excluded.rate, amount = excluded.amount;
  end if;
end $$;

-- Huỷ lượt: quầy trong partners.void_window_minutes phút; admin lúc nào cũng được. Trừ điểm, huỷ thưởng
create or replace function public.partner_void_visit(p_visit_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v public.partner_visits;
  v_given int;
begin
  select * into v from public.partner_visits where id = p_visit_id for update;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.is_admin() or (public.is_partner_staff(v.partner_id)
          and v.created_at > now() - make_interval(mins => public.setting_int('partners.void_window_minutes', 30)))) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if v.status = 'void' then return; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'reason_required' using errcode = 'invalid_parameter_value'; end if;
  if exists (select 1 from public.partner_settlements s where s.partner_id = v.partner_id and s.month = date_trunc('month', public.vn_date(v.created_at))::date and s.status <> 'draft') then
    raise exception 'settled' using errcode = 'P0001';
  end if;
  update public.partner_visits set status = 'void', void_reason = btrim(p_reason), voided_by = auth.uid(), voided_at = now() where id = v.id;
  select coalesce(sum(delta), 0) into v_given from public.reward_ledger where source_type = 'partner_visit' and source_id = v.id;
  if v_given <> 0 then
    insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, created_by, note)
    values (v.student_id, -v_given, 'partner_visit_void', 'partner_visit', v.id, auth.uid(), btrim(p_reason));
  end if;
  update public.referral_earnings set status = 'void' where visit_id = v.id;
end $$;

-- Lượt trong ngày của quầy (chỉ đối tác của mình)
create or replace function public.partner_today_visits(p_partner_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_partner_staff(p_partner_id) then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'created_at', v.created_at, 'name', public.mask_name(s.full_name), 'offer_vi', o.name_vi, 'offer_en', o.name_en,
      'list_amount', v.list_amount, 'paid_amount', v.paid_amount, 'invoice_no', v.invoice_no, 'points', v.points, 'status', v.status,
      'mine', v.cashier_user_id = auth.uid(),
      'can_void', v.status <> 'void' and v.created_at > now() - make_interval(mins => public.setting_int('partners.void_window_minutes', 30)))
    order by v.created_at desc)
    from public.partner_visits v
    join public.students s on s.id = v.student_id
    left join public.partner_offers o on o.id = v.offer_id
    where v.partner_id = p_partner_id and public.vn_date(v.created_at) = public.vn_date(now())), '[]');
end $$;

-------------------------------------------------------------------------------
-- Admin
-------------------------------------------------------------------------------
-- Gán / gỡ nhân viên quầy (tìm theo SĐT hoặc email tài khoản Golf Passport); đồng bộ vai partner_staff
create or replace function public.partner_staff_set(p_partner_id uuid, p_login text, p_role text default 'cashier', p_remove boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_user uuid;
  v_login text := lower(btrim(p_login));
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  select user_id into v_user from public.profiles
  where lower(email) = v_login or phone = v_login
     or (v_login ~ '^0[0-9]{9}$' and phone = '+84' || substr(v_login, 2))
     or user_id::text = v_login
  limit 1;
  if v_user is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if p_remove then
    update public.partner_staff set deleted_at = now() where partner_id = p_partner_id and user_id = v_user and deleted_at is null;
    if not exists (select 1 from public.partner_staff where user_id = v_user and deleted_at is null) then
      update public.user_roles set deleted_at = now() where user_id = v_user and role = 'partner_staff' and deleted_at is null;
    end if;
  else
    if p_role not in ('cashier', 'manager') then raise exception 'invalid_role' using errcode = 'invalid_parameter_value'; end if;
    insert into public.partner_staff (partner_id, user_id, role) values (p_partner_id, v_user, p_role)
    on conflict (partner_id, user_id) where deleted_at is null do update set role = excluded.role;
    if not exists (select 1 from public.user_roles where user_id = v_user and role = 'partner_staff' and deleted_at is null) then
      insert into public.user_roles (user_id, role, granted_by) values (v_user, 'partner_staff', auth.uid());
    end if;
  end if;
  return jsonb_build_object('user_id', v_user);
end $$;

create or replace function public.partner_staff_list(p_partner_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', ps.user_id, 'role', ps.role, 'full_name', p.full_name,
                     'phone', p.phone, 'email', p.email) order by p.full_name)
    from public.partner_staff ps join public.profiles p on p.user_id = ps.user_id
    where ps.partner_id = p_partner_id and ps.deleted_at is null), '[]');
end $$;

-- Lượt (lọc theo đối tác, trạng thái, tháng) cho admin
create or replace function public.partner_admin_visits(p_partner_id uuid default null, p_status text default null, p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'created_at', v.created_at, 'partner_id', v.partner_id, 'partner_name', pa.name,
      'student_id', v.student_id, 'student_name', s.full_name, 'student_code', s.student_code,
      'offer_vi', o.name_vi, 'list_amount', v.list_amount, 'paid_amount', v.paid_amount, 'invoice_no', v.invoice_no,
      'points', v.points, 'status', v.status, 'void_reason', v.void_reason, 'cashier_name', cp.full_name,
      'referral_amount', re.amount, 'referral_status', re.status)
    order by v.created_at desc)
    from public.partner_visits v
    join public.partners pa on pa.id = v.partner_id
    join public.students s on s.id = v.student_id
    left join public.partner_offers o on o.id = v.offer_id
    left join public.profiles cp on cp.user_id = v.cashier_user_id
    left join public.referral_earnings re on re.visit_id = v.id
    where (p_partner_id is null or v.partner_id = p_partner_id)
      and (p_status is null or v.status = p_status)
      and (p_month is null or date_trunc('month', public.vn_date(v.created_at))::date = date_trunc('month', p_month)::date)), '[]');
end $$;

-- Lượt bị đánh dấu: admin xác nhận (cộng điểm, sinh thưởng) hoặc huỷ (partner_void_visit)
create or replace function public.partner_visit_review(p_visit_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  update public.partner_visits set status = 'recorded' where id = p_visit_id and status = 'flagged';
  if found then perform public.partner_visit_apply(p_visit_id); end if;
end $$;

-- Lập đối soát tháng (lượt void không tính). Chỉ lập lại được khi còn draft. Kèm hoa hồng tạm tính của người chốt deal
create or replace function public.partner_settlement_build(p_partner_id uuid, p_month date)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_partner public.partners;
  v_month date := date_trunc('month', p_month)::date;
  v_count int;
  v_paid bigint;
  v_fee bigint;
  v_id uuid;
  v_rate numeric := public.setting_num('partners.sales_commission_rate', 0.1);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  select * into v_partner from public.partners where id = p_partner_id;
  if v_partner.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.partner_settlements where partner_id = p_partner_id and month = v_month and status <> 'draft') then
    raise exception 'settled' using errcode = 'P0001';
  end if;
  select count(*), coalesce(sum(paid_amount), 0) into v_count, v_paid
  from public.partner_visits
  where partner_id = p_partner_id and status <> 'void' and date_trunc('month', public.vn_date(created_at))::date = v_month;
  v_fee := round(v_paid * v_partner.fee_rate);
  insert into public.partner_settlements (partner_id, month, visits_count, paid_total, fee_rate, fee_amount, created_by)
  values (p_partner_id, v_month, v_count, v_paid, v_partner.fee_rate, v_fee, auth.uid())
  on conflict (partner_id, month) do update set visits_count = excluded.visits_count, paid_total = excluded.paid_total,
    fee_rate = excluded.fee_rate, fee_amount = excluded.fee_amount
  returning id into v_id;
  delete from public.sales_commissions where settlement_id = v_id;
  if v_partner.sales_owner_user_id is not null and v_fee > 0 then
    insert into public.sales_commissions (sales_owner_user_id, partner_id, settlement_id, period, basis_amount, rate, amount)
    values (v_partner.sales_owner_user_id, p_partner_id, v_id, v_month, v_fee, v_rate, round(v_fee * v_rate));
  end if;
  return v_id;
end $$;

create or replace function public.partner_settlement_set_status(p_id uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_old text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  select status into v_old from public.partner_settlements where id = p_id for update;
  if v_old is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ((v_old, p_status) in (('draft', 'sent'), ('sent', 'confirmed'), ('confirmed', 'paid'), ('sent', 'draft'))) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  update public.partner_settlements
  set status = p_status,
      confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
      confirmed_by = case when p_status = 'confirmed' then auth.uid() else confirmed_by end
  where id = p_id;
end $$;

-- Chi tiết lượt của một kỳ đối soát (xuất file gửi đối tác): tên che bớt, không SĐT
create or replace function public.partner_settlement_lines(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st public.partner_settlements;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  select * into st from public.partner_settlements where id = p_id;
  return coalesce((select jsonb_agg(jsonb_build_object('created_at', v.created_at, 'name', public.mask_name(s.full_name),
      'offer_vi', o.name_vi, 'invoice_no', v.invoice_no, 'list_amount', v.list_amount, 'paid_amount', v.paid_amount, 'status', v.status)
    order by v.created_at)
    from public.partner_visits v join public.students s on s.id = v.student_id left join public.partner_offers o on o.id = v.offer_id
    where v.partner_id = st.partner_id and v.status <> 'void' and date_trunc('month', public.vn_date(v.created_at))::date = st.month), '[]');
end $$;

-- Thưởng / hoa hồng tạm tính (admin chỉ xem)
create or replace function public.partner_admin_rewards()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  return jsonb_build_object(
    'referrals', coalesce((select jsonb_agg(x order by x.provisional_total desc) from (
        select e.referrer_user_id as user_id, p.full_name, count(*) filter (where e.status = 'provisional') as visits,
               coalesce(sum(e.amount) filter (where e.status = 'provisional'), 0) as provisional_total,
               (select count(*) from public.referral_links l where l.referrer_user_id = e.referrer_user_id) as referred_count
        from public.referral_earnings e join public.profiles p on p.user_id = e.referrer_user_id
        group by e.referrer_user_id, p.full_name) x), '[]'),
    'commissions', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'full_name', p.full_name, 'partner_name', pa.name,
        'period', c.period, 'basis_amount', c.basis_amount, 'rate', c.rate, 'amount', c.amount, 'status', c.status) order by c.period desc, pa.name)
      from public.sales_commissions c join public.profiles p on p.user_id = c.sales_owner_user_id join public.partners pa on pa.id = c.partner_id), '[]'),
    'payouts_enabled', coalesce((select value = 'true'::jsonb from public.app_settings where key = 'partners.payouts_enabled'), false));
end $$;

-------------------------------------------------------------------------------
-- Mã giới thiệu (một cấp)
-------------------------------------------------------------------------------
-- Người lớn có tài khoản (không phải tài khoản con /me): lấy hoặc tạo mã cố định
create or replace function public.referral_my_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_code text;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where user_id = auth.uid())
     or exists (select 1 from public.student_accounts where user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select code into v_code from public.referral_codes where user_id = auth.uid();
  if v_code is null then
    loop
      v_code := public.random_code(8);
      exit when not exists (select 1 from public.referral_codes where code = v_code);
    end loop;
    insert into public.referral_codes (user_id, code) values (auth.uid(), v_code);
  end if;
  return v_code;
end $$;

-- Tài khoản mới gắn mã một lần (gọi ngay sau khi đăng ký qua link /r/<mã>); không đổi về sau
create or replace function public.referral_claim(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_ref uuid;
  v_created timestamptz;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.referral_links where referred_user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'already_linked');
  end if;
  select user_id into v_ref from public.referral_codes where code = upper(btrim(p_code));
  if v_ref is null then return jsonb_build_object('ok', false, 'reason', 'code_not_found'); end if;
  if v_ref = auth.uid() then return jsonb_build_object('ok', false, 'reason', 'own_code'); end if;
  select created_at into v_created from auth.users where id = auth.uid();
  if v_created < now() - make_interval(days => public.setting_int('referral.claim_window_days', 7)) then
    return jsonb_build_object('ok', false, 'reason', 'account_too_old');
  end if;
  insert into public.referral_links (referred_user_id, referrer_user_id, code) values (auth.uid(), v_ref, upper(btrim(p_code)));
  return jsonb_build_object('ok', true);
end $$;

-- Khối Kinh doanh: chỉ SỐ người đã giới thiệu và TỔNG tạm tính — không tên, hoá đơn, chi tiêu; không sơ đồ mạng lưới
create or replace function public.referral_my_summary()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'code', public.referral_my_code(),
    'referred_count', (select count(*) from public.referral_links where referrer_user_id = auth.uid()),
    'provisional_total', coalesce((select sum(amount) from public.referral_earnings where referrer_user_id = auth.uid() and status = 'provisional'), 0),
    'payouts_enabled', coalesce((select value = 'true'::jsonb from public.app_settings where key = 'partners.payouts_enabled'), false),
    'partners', public.partner_public_list());
end $$;

-------------------------------------------------------------------------------
-- Quyền gọi hàm
-------------------------------------------------------------------------------
do $$
begin
  revoke execute on function public.partner_visit_apply(uuid) from public, anon, authenticated;
  revoke execute on function public.partner_customer_user(uuid) from public, anon, authenticated;
  revoke execute on function public.partners_guard_payouts() from public, anon, authenticated;
  revoke execute on function public.partners_guard_confirmed() from public, anon, authenticated;
  revoke execute on function public.partner_qr_issue(uuid) from public, anon;
  revoke execute on function public.reward_balance(uuid) from public, anon;
  revoke execute on function public.partner_public_list() from public, anon;
  revoke execute on function public.partner_my_partners() from public, anon;
  revoke execute on function public.partner_active_offers(uuid) from public, anon, authenticated;
  revoke execute on function public.partner_scan(uuid, text) from public, anon;
  revoke execute on function public.partner_record_visit(jsonb) from public, anon;
  revoke execute on function public.partner_void_visit(uuid, text) from public, anon;
  revoke execute on function public.partner_today_visits(uuid) from public, anon;
  revoke execute on function public.partner_staff_set(uuid, text, text, boolean) from public, anon;
  revoke execute on function public.partner_staff_list(uuid) from public, anon;
  revoke execute on function public.partner_admin_visits(uuid, text, date) from public, anon;
  revoke execute on function public.partner_visit_review(uuid) from public, anon;
  revoke execute on function public.partner_settlement_build(uuid, date) from public, anon;
  revoke execute on function public.partner_settlement_set_status(uuid, text) from public, anon;
  revoke execute on function public.partner_settlement_lines(uuid) from public, anon;
  revoke execute on function public.partner_admin_rewards() from public, anon;
  revoke execute on function public.referral_my_code() from public, anon;
  revoke execute on function public.referral_claim(text) from public, anon;
  revoke execute on function public.referral_my_summary() from public, anon;
  grant execute on function public.partner_qr_issue(uuid), public.reward_balance(uuid), public.partner_public_list(),
    public.partner_my_partners(), public.partner_scan(uuid, text), public.partner_record_visit(jsonb),
    public.partner_void_visit(uuid, text), public.partner_today_visits(uuid), public.partner_staff_set(uuid, text, text, boolean),
    public.partner_staff_list(uuid), public.partner_admin_visits(uuid, text, date), public.partner_visit_review(uuid),
    public.partner_settlement_build(uuid, date), public.partner_settlement_set_status(uuid, text), public.partner_settlement_lines(uuid),
    public.partner_admin_rewards(), public.referral_my_code(), public.referral_claim(text), public.referral_my_summary()
  to authenticated;
end $$;
