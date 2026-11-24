-- App Handicap WHS · phần máy chủ dùng chung với Golf Passport (anh Long chốt 24/11/2026)
-- Minh · 24/11/2026. App Handicap vẫn là app riêng (hdcp.vncentre.net) nhưng dùng chung máy chủ và tài khoản với Golf Passport,
-- gắn hội viên handicap với hồ sơ golfer public.students (mã VNC = students.student_code).
--
-- Chỉ THÊM: mọi bảng/hàm mới mang tiền tố whs_. Không sửa, không xoá bảng hay hàm nào của Golf Passport.
-- Chạy lại nhiều lần không lỗi. Gộp bản demo GĐ3 (whs_core + whs_youth) và phần gắn hồ sơ golfer.
--
-- Nguyên tắc chống gian lận (giữ từ bản demo):
--   1. Golfer và CLB KHÔNG ghi thẳng vào bảng vòng đấu; mọi thay đổi đi qua hàm whs_* và được ghi nhật ký.
--   2. Nhật ký (whs_round_log) chỉ thêm, không sửa, không xoá.
--   3. Kết quả tính HI (whs_round_results, whs_hi_history, whs_youth_*) chỉ máy chủ (service role, hàm whs-recompute) được ghi.
--   4. Vòng phải được bạn chơi (marker) xác nhận; ai xác nhận, lúc nào, ở đâu đều lưu lại.
--
-- Ai thao tác cho một hội viên: chính golfer (tài khoản học viên my_student_id() hoặc hồ sơ tự tạo quan hệ 'self'),
-- hoặc phụ huynh đang liên kết (student_guardians.status = 'active', can_manage). Xem: thêm phụ huynh liên kết không có quyền quản lý.

begin;

create extension if not exists pgcrypto with schema extensions;


-------------------------------------------------------------------------------
-- 0. Hàm quyền nền tảng
-------------------------------------------------------------------------------
create or replace function public.whs_is_platform_admin() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r boolean := false;
begin
  if to_regprocedure('public.is_admin()') is not null then
    execute 'select coalesce(public.is_admin(), false)' into r;
  end if;
  return r;
end $$;

-------------------------------------------------------------------------------
-- 1. Liên đoàn (tenant) và phiên bản cấu hình theo ngày hiệu lực
-------------------------------------------------------------------------------
create table if not exists public.whs_federations (
  id text primary key check (id ~ '^[a-z0-9-]{2,20}$'),      -- vd 'vn', 'la', 'kh'
  name text not null, short text not null,
  country char(2) not null,
  lang text not null default 'en',
  tz text not null default 'UTC',
  unit text not null default 'yd' check (unit in ('yd', 'm')),
  color text,
  status text not null default 'trial' check (status in ('trial', 'active', 'suspended')),
  -- Cấu hình chống gian lận (xem whs_integrity()). Không phải Discretionary Item của WHS.
  integrity jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Discretionary Items (A1–A14, B1–B10…) theo ngày hiệu lực; chỉ thêm phiên bản, không sửa phiên bản cũ.
create table if not exists public.whs_fed_configs (
  id uuid primary key default gen_random_uuid(),
  federation_id text not null references public.whs_federations(id),
  effective_from date not null,
  values jsonb not null,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (federation_id, effective_from)
);

-- Mức tối thiểu và giới hạn dùng chung (giá trị mặc định cho mọi liên đoàn).
-- Liên đoàn ghi đè bằng cùng khoá trong whs_fed_configs.values (phiên bản có hiệu lực mới nhất).
-- Theo hướng mở anh Long chốt 23/11/2026: dễ nhất để golfer sớm có chỉ số; admin đổi bằng dữ liệu, không sửa code.
create table if not exists public.whs_settings (
  key text primary key check (key ~ '^[A-Za-z0-9_]{2,40}$'),
  value jsonb not null,
  note text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
insert into public.whs_settings (key, value, note) values
  ('initMinHoles', '27', 'Số hố đã nộp (vòng được xác nhận) tối thiểu để cấp chỉ số lần đầu. Luật WHS 5.2a: 54; mặc định mở: 27 (3 vòng 9 hố).'),
  ('initMinScores', '3', 'Số điểm (vòng) được xác nhận tối thiểu để cấp chỉ số lần đầu. Engine cần ít nhất 3 differential.'),
  ('minLen18', '0', 'Độ dài tee tối thiểu cho vòng 18 hố (đơn vị theo sân, yd hoặc m). 0 = không giới hạn. Tham khảo WHS: 3.000 yd.'),
  ('minLen9', '0', 'Độ dài tee tối thiểu cho vòng 9 hố. 0 = không giới hạn. Tham khảo WHS: 1.500 yd.'),
  ('maxHI', '54', 'Chỉ số tối đa (không vượt 54.0 theo WHS).')
on conflict (key) do nothing;

-- Giá trị đang áp dụng cho liên đoàn: cấu hình liên đoàn (bản hiệu lực mới nhất) → giá trị chung
create or replace function public.whs_setting(p_fed text, p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.values -> p_key from public.whs_fed_configs c
      where c.federation_id = p_fed and c.effective_from <= current_date and c.values ? p_key
      order by c.effective_from desc limit 1),
    (select s.value from public.whs_settings s where s.key = p_key))
$$;


create table if not exists public.whs_clubs (
  id uuid primary key default gen_random_uuid(),
  federation_id text not null references public.whs_federations(id),
  name text not null check (char_length(name) <= 200),
  home_course_id text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);
create index if not exists whs_clubs_fed on public.whs_clubs (federation_id);

-------------------------------------------------------------------------------
-- 2. Sân và tee (một kho chung cho mọi liên đoàn; dữ liệu theo định dạng engine)
--    data = {par:[..], si:[..], h:18|9, tees:{key:{name,g,cr,sr,par,F,B,yd}}, suspend?}
-------------------------------------------------------------------------------
create table if not exists public.whs_courses (
  id text primary key,                                   -- khoá sân dùng trong engine
  gc_course_id uuid,                                     -- liên kết khu quản trị sân Golf Passport (nếu có)
  name text not null,
  country char(2) not null,
  province text,
  unit text not null default 'yd' check (unit in ('yd', 'm')),
  lat double precision, lng double precision,
  data jsonb not null,
  source text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- 3. Golfer (chung tài khoản Golf Passport) và nhân sự liên đoàn/CLB
-------------------------------------------------------------------------------
create table if not exists public.whs_members (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),          -- hồ sơ golfer Golf Passport (mã VNC = students.student_code)
  user_id uuid references auth.users(id) on delete set null,        -- tài khoản đã đăng ký tham gia (golfer hoặc phụ huynh), chỉ để tra vết
  federation_id text not null references public.whs_federations(id),
  home_club_id uuid references public.whs_clubs(id),
  full_name text not null check (char_length(full_name) <= 120),    -- chép từ students lúc tham gia
  gender char(1) not null check (gender in ('M', 'F')),
  birth_year int check (birth_year between 1900 and 2100),          -- dưới 18 tuổi luôn ẩn khỏi tra cứu
  is_minor boolean not null default false,
  public_lookup boolean not null default true,                      -- cho người khác tra HI; trẻ em luôn ẩn
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'left')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Bản demo (đã có trên máy chủ dùng chung, bảng rỗng): bỏ cột/ràng buộc cũ, thêm student_id.
-- Phải bỏ chính sách cũ trước vì chính sách tham chiếu cột guardian_user_id.
drop policy if exists whs_member_read on public.whs_members;
drop policy if exists whs_member_self_update on public.whs_members;
alter table public.whs_members drop constraint if exists whs_members_check;
alter table public.whs_members drop constraint if exists whs_members_user_id_key;
alter table public.whs_members drop constraint if exists whs_members_federation_id_member_no_key;
alter table public.whs_members drop column if exists member_no;
alter table public.whs_members drop column if exists guardian_user_id;
alter table public.whs_members drop column if exists gp_student_id;
alter table public.whs_members add column if not exists student_id uuid references public.students(id);
alter table public.whs_members add column if not exists birth_year int check (birth_year between 1900 and 2100);
do $$ begin
  if not exists (select 1 from public.whs_members where student_id is null) then
    alter table public.whs_members alter column student_id set not null;
  end if;
end $$;
-- Một hồ sơ golfer chỉ là hội viên một lần trong mỗi liên đoàn
create unique index if not exists whs_members_fed_student on public.whs_members (federation_id, student_id);
create index if not exists whs_members_student on public.whs_members (student_id);
create index if not exists whs_members_fed on public.whs_members (federation_id, home_club_id);

create table if not exists public.whs_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  federation_id text not null references public.whs_federations(id),
  club_id uuid references public.whs_clubs(id),
  role text not null check (role in ('fed_admin', 'committee', 'club_admin')),
  granted_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((role = 'club_admin') = (club_id is not null))
);
create unique index if not exists whs_staff_uniq on public.whs_staff (user_id, federation_id, role, coalesce(club_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null;

-------------------------------------------------------------------------------
-- 4. Vòng đấu, nhật ký, sự kiện của Hội đồng Handicap
-------------------------------------------------------------------------------
create table if not exists public.whs_rounds (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.whs_members(id),
  federation_id text not null references public.whs_federations(id),
  course_id text not null references public.whs_courses(id),
  tee_key text not null,
  played_on date not null,
  seq int not null default 0,
  holes text not null check (holes in ('18', 'F', 'B')),
  format text not null default 'stroke',
  type text not null default 'general' check (type in ('general', 'competition')),
  status text not null default 'registered'
    check (status in ('registered', 'submitted', 'attested', 'disputed', 'rejected', 'void', 'expired', 'cancelled')),
  -- Đăng ký trước khi đánh
  registered_at timestamptz,
  reg_lat double precision, reg_lng double precision, reg_distance_m int,
  -- Nộp điểm
  gross int[],                                           -- 18 hoặc 9 phần tử; null = không chơi hố đó
  valid_reason boolean not null default false,           -- lý do hợp lệ khi không hoàn thành (Rule 2.2)
  total_only boolean not null default false,
  submitted_at timestamptz,
  entered_by uuid,
  -- Xác nhận
  marker_member_id uuid references public.whs_members(id),
  attested_at timestamptz,
  attested_by uuid,
  attest_note text,
  flags text[] not null default '{}',                    -- dấu hiệu cần Hội đồng xem (xa sân, quá nhanh, nộp muộn…)
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (marker_member_id is null or marker_member_id <> member_id)
);
create index if not exists whs_rounds_member on public.whs_rounds (member_id, played_on);
create index if not exists whs_rounds_marker on public.whs_rounds (marker_member_id) where status = 'submitted';
create index if not exists whs_rounds_fed_status on public.whs_rounds (federation_id, status);
-- Mỗi golfer chỉ có một vòng đang đăng ký dở
create unique index if not exists whs_rounds_one_open on public.whs_rounds (member_id) where status = 'registered';

create table if not exists public.whs_round_log (
  id bigint generated always as identity primary key,
  round_id uuid not null references public.whs_rounds(id),
  actor uuid,
  action text not null,
  before jsonb, after jsonb,
  reason text,
  at timestamptz not null default now()
);
create index if not exists whs_round_log_round on public.whs_round_log (round_id, id);

create table if not exists public.whs_member_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.whs_members(id),
  type text not null check (type in ('freeze', 'unfreeze', 'withdraw', 'reinstate', 'penalty', 'adjust', 'resetLHI')),
  date date not null,
  value numeric,
  reason text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- 5. Kết quả do máy chủ tính (chỉ service role ghi)
-------------------------------------------------------------------------------
create table if not exists public.whs_compute_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rules_version text,
  stats jsonb,
  error text
);

create table if not exists public.whs_round_results (
  round_id uuid primary key references public.whs_rounds(id),
  run_id uuid references public.whs_compute_runs(id),
  ok boolean not null,
  status_text text,
  kind text,
  ags numeric, diff numeric, pcc numeric,
  hi_before numeric, hi_after numeric,
  notes jsonb,
  computed_at timestamptz not null default now()
);

create table if not exists public.whs_hi_history (
  member_id uuid not null references public.whs_members(id),
  as_of date not null,
  hi numeric, low_hi numeric, cap text,
  n_diff int,
  frozen boolean not null default false,
  withdrawn boolean not null default false,
  run_id uuid references public.whs_compute_runs(id),
  computed_at timestamptz not null default now(),
  primary key (member_id, as_of)
);

-------------------------------------------------------------------------------
-- 6. Hàm hỗ trợ quyền
-------------------------------------------------------------------------------
-- Nhân sự liên đoàn (fed_admin/committee) hoặc admin nền tảng
create or replace function public.whs_is_fed_staff(p_fed text, p_roles text[] default array['fed_admin', 'committee']) returns boolean
language sql stable security definer set search_path = public as $$
  select public.whs_is_platform_admin() or exists (
    select 1 from public.whs_staff s
    where s.user_id = auth.uid() and s.federation_id = p_fed and s.role = any(p_roles) and s.deleted_at is null)
$$;

create or replace function public.whs_is_club_admin(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.whs_staff s
    where s.user_id = auth.uid() and s.club_id = p_club and s.role = 'club_admin' and s.deleted_at is null)
$$;

-- Ai được quản lý golfer: liên đoàn của golfer, hoặc admin CLB chủ quản
create or replace function public.whs_can_manage_member(p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.whs_members m where m.id = p_member and
    (public.whs_is_fed_staff(m.federation_id) or (m.home_club_id is not null and public.whs_is_club_admin(m.home_club_id))))
$$;

-- Hồ sơ golfer (public.students) mà người đăng nhập được thao tác:
--   hồ sơ của chính tài khoản học viên (my_student_id), hồ sơ tự tạo hoặc con đang quản lý (student_guardians active + can_manage)
create or replace function public.whs_my_students() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.id from public.students s
  where s.deleted_at is null and s.merged_into_student_id is null and (
    s.id = public.my_student_id()
    or exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
               where sg.student_id = s.id and g.user_id = auth.uid() and g.deleted_at is null and sg.deleted_at is null
                 and sg.status = 'active' and sg.can_manage))
$$;

-- Hồ sơ golfer của chính người đăng nhập (không tính con): tài khoản học viên, hoặc hồ sơ tự tạo (quan hệ 'self')
create or replace function public.whs_own_student() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_student_id(), (
    select sg.student_id from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    join public.students s on s.id = sg.student_id
    where g.user_id = auth.uid() and g.deleted_at is null and sg.deleted_at is null
      and sg.relationship = 'self' and sg.status = 'active' and sg.can_manage
      and s.deleted_at is null and s.merged_into_student_id is null
    order by sg.linked_at nulls last, sg.created_at limit 1))
$$;

-- Người đăng nhập được thao tác cho hội viên này (chính golfer hoặc phụ huynh quản lý)
create or replace function public.whs_can_act_for(p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.whs_members m where m.id = p_member and m.student_id in (select public.whs_my_students()))
$$;

-- Hội viên của chính người đăng nhập (liên đoàn tham gia sớm nhất)
create or replace function public.whs_my_member() returns uuid
language sql stable security definer set search_path = public as $$
  select m.id from public.whs_members m
  where m.student_id = public.whs_own_student() and m.status in ('active', 'pending')
  order by m.created_at limit 1
$$;

-- Xem hội viên: chính golfer, phụ huynh đang liên kết (kể cả không có quyền quản lý), nhân sự liên đoàn/CLB, admin
create or replace function public.whs_can_see_member(p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.whs_can_act_for(p_member)
    or exists (select 1 from public.whs_members m where m.id = p_member and public.is_guardian_of(m.student_id))
    or public.whs_can_manage_member(p_member)
$$;

-- Chọn hội viên đang thao tác: p_member = null → hội viên của chính mình; có giá trị → phải là mình hoặc con đang quản lý
create or replace function public.whs_resolve_member(p_member uuid, p_statuses text[]) returns public.whs_members
language plpgsql stable security definer set search_path = public as $$
declare m whs_members; v uuid := p_member;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v is null then v := whs_my_member();
  elsif not whs_can_act_for(v) then raise exception 'not_your_member'; end if;
  select * into m from whs_members where id = v;
  if m.id is null or not (m.status = any(p_statuses)) then raise exception 'not_active_member'; end if;
  return m;
end $$;

-- Độ dài tee tối thiểu theo cấu hình liên đoàn (minLen18 / minLen9; 0 = không giới hạn; tee không có độ dài thì bỏ qua)
create or replace function public.whs_check_course_length(p_fed text, p_course public.whs_courses, p_tee text, p_holes text) returns void
language plpgsql stable security definer set search_path = public as $$
declare yd jsonb := p_course.data -> 'tees' -> p_tee -> 'yd'; v_len numeric; v_min numeric;
begin
  v_min := coalesce((whs_setting(p_fed, case when p_holes = '18' then 'minLen18' else 'minLen9' end))::text::numeric, 0);
  if v_min <= 0 or yd is null then return; end if;
  if jsonb_typeof(yd) = 'array' then
    select sum((x.v #>> '{}')::numeric) into v_len from jsonb_array_elements(yd) with ordinality x(v, i)
    where (p_holes = '18') or (p_holes = 'F' and x.i <= 9) or (p_holes = 'B' and x.i > 9);
  elsif jsonb_typeof(yd) = 'number' then
    v_len := (yd #>> '{}')::numeric * case when p_holes = '18' then 1 else 0.5 end;
  end if;
  if v_len is not null and v_len < v_min then raise exception 'course_too_short'; end if;
end $$;

-- Cấu hình chống gian lận có giá trị mặc định
create or replace function public.whs_integrity(p_fed text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'preRegGeneral', true,    -- chơi thường phải đăng ký trước khi đánh
    'geo', 'flag',            -- 'off' | 'flag' (đánh dấu) | 'block' (chặn) khi đăng ký xa sân
    'maxDistM', 3000,
    'minMinutes18', 120,      -- nộp sớm hơn thời gian tối thiểu kể từ lúc đăng ký → đánh dấu
    'minMinutes9', 60,
    'submitHours', 24,        -- đăng ký mà không nộp trong N giờ → hết hạn, báo Hội đồng
    'attestHours', 72,        -- marker không xác nhận trong N giờ → chuyển Hội đồng
    'cancelMinutes', 15       -- được huỷ đăng ký trong N phút đầu mà không bị đánh dấu
  ) || coalesce((select integrity from public.whs_federations where id = p_fed), '{}'::jsonb)
$$;

create or replace function public.whs_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns int language sql immutable as $$
  select round(2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))::int
$$;

-- Ghi nhật ký (nội bộ)
create or replace function public.whs_log(p_round uuid, p_action text, p_before jsonb, p_after jsonb, p_reason text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.whs_round_log (round_id, actor, action, before, after, reason)
  values (p_round, auth.uid(), p_action, p_before, p_after, p_reason)
$$;
revoke execute on function public.whs_log(uuid, text, jsonb, jsonb, text) from public, anon, authenticated;

-- Nhật ký không được sửa / xoá
create or replace function public.whs_log_immutable() returns trigger language plpgsql as $$
begin raise exception 'whs_round_log là nhật ký chỉ thêm, không được sửa hoặc xoá'; end $$;
drop trigger if exists whs_round_log_no_change on public.whs_round_log;
create trigger whs_round_log_no_change before update or delete on public.whs_round_log
  for each row execute function public.whs_log_immutable();

create or replace function public.whs_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists whs_rounds_touch on public.whs_rounds;
create trigger whs_rounds_touch before update on public.whs_rounds for each row execute function public.whs_touch();
drop trigger if exists whs_members_touch on public.whs_members;
create trigger whs_members_touch before update on public.whs_members for each row execute function public.whs_touch();

-------------------------------------------------------------------------------
-- 7. Luồng của golfer
-------------------------------------------------------------------------------
-- Gia nhập: tạo hội viên chờ CLB/liên đoàn duyệt, gắn với hồ sơ golfer Golf Passport.
-- p_student = null: hồ sơ của chính người đăng nhập (tài khoản học viên hoặc hồ sơ tự tạo qua training_create_self_profile).
-- p_student có giá trị: hồ sơ của chính mình hoặc con đang quản lý. Họ tên, giới tính, năm sinh lấy từ hồ sơ.
-- Golfer từ 10 tuổi tự đăng ký bằng tài khoản của mình; dưới 10 tuổi phụ huynh đăng ký thay. Dưới 18 tuổi luôn ẩn khỏi tra cứu.
drop function if exists public.whs_join(text, uuid, text, text, boolean, uuid);
drop function if exists public.whs_join(text, uuid, text, text, int, uuid);
create or replace function public.whs_join(p_fed text, p_club uuid default null, p_student uuid default null, p_gender text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_student uuid; s students; v_id uuid; v_age int; v_minor boolean; v_g char(1); v_by int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from whs_federations where id = p_fed and status <> 'suspended') then raise exception 'federation_not_found'; end if;
  if p_club is not null and not exists (select 1 from whs_clubs where id = p_club and federation_id = p_fed and status = 'active') then
    raise exception 'club_not_in_federation'; end if;
  v_student := coalesce(p_student, whs_own_student());
  if v_student is null then raise exception 'no_golfer_profile'; end if;
  if v_student not in (select whs_my_students()) then raise exception 'not_your_golfer'; end if;
  select * into s from students where id = v_student;
  if s.date_of_birth is null then raise exception 'birth_date_required'; end if;
  v_by := extract(year from s.date_of_birth)::int;
  v_age := extract(year from age(current_date, s.date_of_birth))::int;
  if v_age > 110 then raise exception 'birth_year_invalid'; end if;
  -- Dưới 10 tuổi: chỉ phụ huynh đăng ký thay (không tự đăng ký bằng tài khoản của chính các con)
  if v_age < 10 and v_student = whs_own_student() then raise exception 'under10_parent_required'; end if;
  v_minor := v_age < 18;
  v_g := case s.gender when 'male' then 'M' when 'female' then 'F' else upper(nullif(btrim(coalesce(p_gender, '')), '')) end;
  if v_g is null or v_g not in ('M', 'F') then raise exception 'gender_required'; end if;
  if exists (select 1 from whs_members where federation_id = p_fed and student_id = v_student) then raise exception 'already_member'; end if;
  insert into whs_members (student_id, user_id, federation_id, home_club_id, full_name, gender, birth_year, is_minor, public_lookup)
  values (v_student, auth.uid(), p_fed, p_club, left(s.full_name, 120), v_g, v_by, v_minor, not v_minor)
  returning id into v_id;
  return v_id;
end $$;

-- Danh sách hồ sơ golfer người đăng nhập được thao tác (mình và các con), kèm mã VNC và hội viên handicap đã có
create or replace function public.whs_my_golfers() returns table (
  student_id uuid, student_code text, full_name text, birth_year int, gender text, is_self boolean,
  member_id uuid, federation_id text, member_status text)
language sql stable security definer set search_path = public as $$
  select s.id, s.student_code, s.full_name, extract(year from s.date_of_birth)::int, s.gender, coalesce(s.id = public.whs_own_student(), false),
         m.id, m.federation_id, m.status
  from public.students s
  left join public.whs_members m on m.student_id = s.id
  where s.id in (select public.whs_my_students())
  order by coalesce(s.id = public.whs_own_student(), false) desc, s.full_name
$$;

-- Tìm bạn chơi làm marker theo mã VNC (chỉ trả hội viên đang hoạt động của liên đoàn đó; không lộ thông tin khác)
create or replace function public.whs_find_marker(p_fed text, p_code text) returns table (member_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select m.id, m.full_name from public.whs_members m join public.students s on s.id = m.student_id
  where auth.uid() is not null and m.federation_id = p_fed and m.status = 'active'
    and upper(s.student_code) = upper(btrim(p_code))
$$;

-- Đăng ký vòng trước khi đánh (có vị trí nếu điện thoại cho phép)
drop function if exists public.whs_register_round(text, text, text, text, text, double precision, double precision);
create or replace function public.whs_register_round(p_course text, p_tee text, p_holes text, p_format text default 'stroke',
  p_type text default 'general', p_lat double precision default null, p_lng double precision default null, p_member uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m whs_members; c whs_courses; cfg jsonb; v_id uuid; v_dist int; v_flags text[] := '{}';
begin
  m := whs_resolve_member(p_member, array['active']);
  select * into c from whs_courses where id = p_course and status = 'active';
  if c.id is null then raise exception 'course_not_found'; end if;
  if not (c.data -> 'tees') ? p_tee then raise exception 'tee_not_found'; end if;
  perform whs_check_course_length(m.federation_id, c, p_tee, p_holes);
  cfg := whs_integrity(m.federation_id);
  if p_lat is null or p_lng is null then
    if cfg ->> 'geo' <> 'off' then v_flags := v_flags || 'no_location'::text; end if;
  elsif c.lat is not null and c.lng is not null then
    v_dist := whs_distance_m(p_lat, p_lng, c.lat, c.lng);
    if v_dist > (cfg ->> 'maxDistM')::int then
      if cfg ->> 'geo' = 'block' then raise exception 'too_far_from_course'; end if;
      if cfg ->> 'geo' = 'flag' then v_flags := v_flags || 'far_from_course'::text; end if;
    end if;
  end if;
  insert into whs_rounds (member_id, federation_id, course_id, tee_key, played_on, holes, format, type,
    registered_at, reg_lat, reg_lng, reg_distance_m, flags, entered_by)
  values (m.id, m.federation_id, p_course, p_tee, (now() at time zone (select tz from whs_federations where id = m.federation_id))::date,
    p_holes, p_format, p_type, now(), p_lat, p_lng, v_dist, v_flags, auth.uid())
  returning id into v_id;
  perform whs_log(v_id, 'register', null, jsonb_build_object('course', p_course, 'tee', p_tee, 'holes', p_holes, 'distance_m', v_dist, 'flags', v_flags));
  return v_id;
end $$;

-- Huỷ đăng ký (ghi lại; huỷ muộn bị đánh dấu)
create or replace function public.whs_cancel_round(p_round uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r whs_rounds; cfg jsonb;
begin
  select * into r from whs_rounds where id = p_round for update;
  if r.id is null or not whs_can_act_for(r.member_id) then raise exception 'not_your_round'; end if;
  if r.status <> 'registered' then raise exception 'cannot_cancel_status_%', r.status; end if;
  cfg := whs_integrity(r.federation_id);
  update whs_rounds set status = 'cancelled',
    flags = case when now() - r.registered_at > make_interval(mins => (cfg ->> 'cancelMinutes')::int) then flags || 'late_cancel'::text else flags end
  where id = p_round;
  perform whs_log(p_round, 'cancel', jsonb_build_object('status', r.status), jsonb_build_object('status', 'cancelled'), p_reason);
end $$;

-- Kiểm tra mảng điểm
create or replace function public.whs_check_gross(p_holes text, p_gross int[]) returns void language plpgsql immutable as $$
begin
  if p_gross is null or array_length(p_gross, 1) <> (case when p_holes = '18' then 18 else 9 end) then raise exception 'gross_length'; end if;
  if exists (select 1 from unnest(p_gross) g where g is not null and (g < 1 or g > 20)) then raise exception 'gross_range'; end if;
end $$;

-- Nộp điểm cho vòng đã đăng ký
create or replace function public.whs_submit_round(p_round uuid, p_gross int[], p_marker uuid,
  p_valid_reason boolean default false, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r whs_rounds; cfg jsonb; v_flags text[]; v_min int; mk whs_members;
begin
  select * into r from whs_rounds where id = p_round for update;
  if r.id is null or not whs_can_act_for(r.member_id) then raise exception 'not_your_round'; end if;
  if r.status <> 'registered' then raise exception 'cannot_submit_status_%', r.status; end if;
  perform whs_check_gross(r.holes, p_gross);
  select * into mk from whs_members where id = p_marker and status = 'active';
  if mk.id is null then raise exception 'marker_not_active_member'; end if;
  if mk.id = r.member_id then raise exception 'marker_cannot_be_self'; end if;
  cfg := whs_integrity(r.federation_id);
  v_flags := r.flags;
  v_min := (cfg ->> case when r.holes = '18' then 'minMinutes18' else 'minMinutes9' end)::int;
  if now() - r.registered_at < make_interval(mins => v_min) then v_flags := v_flags || 'too_fast'::text; end if;
  update whs_rounds set status = 'submitted', gross = p_gross, marker_member_id = p_marker, valid_reason = coalesce(p_valid_reason, false),
    submitted_at = now(), note = p_note, flags = v_flags
  where id = p_round;
  perform whs_log(p_round, 'submit', null, jsonb_build_object('gross', p_gross, 'marker', p_marker, 'flags', v_flags));
end $$;

-- Nộp điểm không đăng ký trước (khi liên đoàn cho phép, hoặc nộp bù)
drop function if exists public.whs_post_unregistered(text, text, date, text, int[], uuid, text, text, boolean, text);
create or replace function public.whs_post_unregistered(p_course text, p_tee text, p_played_on date, p_holes text, p_gross int[],
  p_marker uuid, p_format text default 'stroke', p_type text default 'general', p_valid_reason boolean default false, p_note text default null,
  p_member uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare m whs_members; c whs_courses; cfg jsonb; v_id uuid; v_flags text[] := array['not_preregistered']; mk whs_members; v_today date;
begin
  m := whs_resolve_member(p_member, array['active']);
  select * into c from whs_courses where id = p_course and status = 'active';
  if c.id is null then raise exception 'course_not_found'; end if;
  if not (c.data -> 'tees') ? p_tee then raise exception 'tee_not_found'; end if;
  perform whs_check_course_length(m.federation_id, c, p_tee, p_holes);
  cfg := whs_integrity(m.federation_id);
  if p_type = 'general' and (cfg ->> 'preRegGeneral')::boolean then raise exception 'prereg_required'; end if;
  v_today := (now() at time zone (select tz from whs_federations where id = m.federation_id))::date;
  if p_played_on > v_today then raise exception 'future_date'; end if;
  if p_played_on < v_today then v_flags := v_flags || 'late_submit'::text; end if;
  perform whs_check_gross(p_holes, p_gross);
  select * into mk from whs_members where id = p_marker and status = 'active';
  if mk.id is null then raise exception 'marker_not_active_member'; end if;
  if mk.id = m.id then raise exception 'marker_cannot_be_self'; end if;
  insert into whs_rounds (member_id, federation_id, course_id, tee_key, played_on, holes, format, type, status,
    gross, marker_member_id, valid_reason, submitted_at, flags, note, entered_by)
  values (m.id, m.federation_id, p_course, p_tee, p_played_on, p_holes, p_format, p_type, 'submitted',
    p_gross, p_marker, coalesce(p_valid_reason, false), now(), v_flags, p_note, auth.uid())
  returning id into v_id;
  perform whs_log(v_id, 'submit_unregistered', null, jsonb_build_object('gross', p_gross, 'marker', p_marker, 'played_on', p_played_on, 'flags', v_flags));
  return v_id;
end $$;

-- Marker xác nhận hoặc phản đối
create or replace function public.whs_attest_round(p_round uuid, p_accept boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r whs_rounds;
begin
  select * into r from whs_rounds where id = p_round for update;
  if r.id is null or r.marker_member_id is null or not whs_can_act_for(r.marker_member_id) then raise exception 'not_marker'; end if;
  -- Người đang quản lý hồ sơ của golfer (chính golfer, phụ huynh) không được tự xác nhận vòng của golfer đó
  if whs_can_act_for(r.member_id) then raise exception 'cannot_attest_own_round'; end if;
  if r.status <> 'submitted' then raise exception 'cannot_attest_status_%', r.status; end if;
  if not p_accept and coalesce(trim(p_note), '') = '' then raise exception 'dispute_needs_reason'; end if;
  update whs_rounds set status = case when p_accept then 'attested' else 'disputed' end,
    attested_at = now(), attested_by = auth.uid(), attest_note = p_note
  where id = p_round;
  perform whs_log(p_round, case when p_accept then 'attest' else 'dispute' end,
    jsonb_build_object('status', r.status), jsonb_build_object('status', case when p_accept then 'attested' else 'disputed' end), p_note);
end $$;

-------------------------------------------------------------------------------
-- 8. Luồng của Hội đồng Handicap / CLB / liên đoàn
-------------------------------------------------------------------------------
-- Quyết định với một vòng: accept | reject | void | edit (sửa điểm). Luôn bắt buộc lý do.
create or replace function public.whs_committee_decide(p_round uuid, p_action text, p_reason text, p_gross int[] default null) returns void
language plpgsql security definer set search_path = public as $$
declare r whs_rounds; v_new text;
begin
  select * into r from whs_rounds where id = p_round for update;
  if r.id is null then raise exception 'round_not_found'; end if;
  if not whs_can_manage_member(r.member_id) then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if p_action = 'edit' then
    if r.status not in ('submitted', 'attested', 'disputed') then raise exception 'cannot_edit_status_%', r.status; end if;
    perform whs_check_gross(r.holes, p_gross);
    update whs_rounds set gross = p_gross, flags = case when 'committee_edit' = any(flags) then flags else flags || 'committee_edit'::text end where id = p_round;
    perform whs_log(p_round, 'committee_edit', jsonb_build_object('gross', r.gross), jsonb_build_object('gross', p_gross), p_reason);
    return;
  end if;
  v_new := case p_action when 'accept' then 'attested' when 'reject' then 'rejected' when 'void' then 'void' end;
  if v_new is null then raise exception 'bad_action'; end if;
  if p_action = 'accept' and r.status not in ('submitted', 'disputed') then raise exception 'cannot_accept_status_%', r.status; end if;
  if p_action = 'reject' and r.status not in ('submitted', 'disputed', 'attested') then raise exception 'cannot_reject_status_%', r.status; end if;
  update whs_rounds set status = v_new,
    attested_at = case when p_action = 'accept' then now() else attested_at end,
    attested_by = case when p_action = 'accept' then auth.uid() else attested_by end
  where id = p_round;
  perform whs_log(p_round, 'committee_' || p_action, jsonb_build_object('status', r.status), jsonb_build_object('status', v_new), p_reason);
end $$;

-- Ban tổ chức giải nhập điểm thi đấu (đã được ban tổ chức kiểm tra → xác nhận luôn)
create or replace function public.whs_enter_competition_score(p_member uuid, p_course text, p_tee text, p_played_on date, p_holes text,
  p_gross int[], p_format text default 'stroke', p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare m whs_members; v_id uuid;
begin
  select * into m from whs_members where id = p_member and status = 'active';
  if m.id is null then raise exception 'not_active_member'; end if;
  if not whs_can_manage_member(p_member) then raise exception 'forbidden'; end if;
  if not exists (select 1 from whs_courses where id = p_course and (data -> 'tees') ? p_tee) then raise exception 'course_or_tee_not_found'; end if;
  perform whs_check_gross(p_holes, p_gross);
  insert into whs_rounds (member_id, federation_id, course_id, tee_key, played_on, holes, format, type, status,
    gross, submitted_at, attested_at, attested_by, note, entered_by)
  values (m.id, m.federation_id, p_course, p_tee, p_played_on, p_holes, p_format, 'competition', 'attested',
    p_gross, now(), now(), auth.uid(), p_note, auth.uid())
  returning id into v_id;
  perform whs_log(v_id, 'competition_entry', null, jsonb_build_object('gross', p_gross, 'played_on', p_played_on));
  return v_id;
end $$;

-- Duyệt / khoá / cho rời hội viên
drop function if exists public.whs_set_member_status(uuid, text, text, text);
create or replace function public.whs_set_member_status(p_member uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not whs_can_manage_member(p_member) then raise exception 'forbidden'; end if;
  if p_status not in ('pending', 'active', 'suspended', 'left') then raise exception 'bad_status'; end if;
  update whs_members set status = p_status where id = p_member;
end $$;

-- Sự kiện của Hội đồng (đóng băng, thu hồi, phạt, điều chỉnh, đặt lại LHI)
create or replace function public.whs_member_event(p_member uuid, p_type text, p_date date, p_value numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; m whs_members;
begin
  select * into m from whs_members where id = p_member;
  if m.id is null then raise exception 'member_not_found'; end if;
  -- Chỉ Hội đồng của liên đoàn (không phải admin CLB) được tác động trực tiếp vào HI
  if not whs_is_fed_staff(m.federation_id) then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  insert into whs_member_events (member_id, type, date, value, reason) values (p_member, p_type, p_date, p_value, p_reason) returning id into v_id;
  return v_id;
end $$;

-- Việc định kỳ: hết hạn đăng ký không nộp, chuyển vòng chờ marker quá hạn sang Hội đồng
create or replace function public.whs_sweep() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_exp int := 0; n_esc int := 0; r record;
begin
  for r in select w.* from whs_rounds w where w.status = 'registered'
    and now() - w.registered_at > make_interval(hours => (whs_integrity(w.federation_id) ->> 'submitHours')::int) loop
    update whs_rounds set status = 'expired', flags = flags || 'auto_expired'::text where id = r.id;
    perform whs_log(r.id, 'expire', jsonb_build_object('status', 'registered'), jsonb_build_object('status', 'expired'), 'Đăng ký nhưng không nộp điểm');
    n_exp := n_exp + 1;
  end loop;
  for r in select w.* from whs_rounds w where w.status = 'submitted' and not ('attest_overdue' = any(w.flags))
    and now() - w.submitted_at > make_interval(hours => (whs_integrity(w.federation_id) ->> 'attestHours')::int) loop
    update whs_rounds set flags = flags || 'attest_overdue'::text where id = r.id;
    perform whs_log(r.id, 'attest_overdue', null, null, 'Marker chưa xác nhận đúng hạn – chuyển Hội đồng');
    n_esc := n_esc + 1;
  end loop;
  return jsonb_build_object('expired', n_exp, 'escalated', n_esc);
end $$;
revoke execute on function public.whs_sweep() from public, anon, authenticated;

-- Tra cứu HI công khai theo tên hoặc mã VNC (không có trẻ em, không có người tắt tra cứu)
drop function if exists public.whs_lookup(text, text);
create or replace function public.whs_lookup(p_q text, p_fed text default null) returns table (
  member_id uuid, full_name text, vnc_code text, federation_id text, club text, hi numeric, as_of date)
language sql stable security definer set search_path = public as $$
  select m.id, m.full_name, s.student_code, m.federation_id, c.name, h.hi, h.as_of
  from whs_members m
  join students s on s.id = m.student_id
  left join whs_clubs c on c.id = m.home_club_id
  left join lateral (select hi, as_of from whs_hi_history x where x.member_id = m.id and not x.withdrawn order by as_of desc limit 1) h on true
  where m.status = 'active' and not m.is_minor and m.public_lookup
    and (p_fed is null or m.federation_id = p_fed)
    and length(trim(p_q)) >= 2 and (m.full_name ilike '%' || trim(p_q) || '%' or upper(s.student_code) = upper(trim(p_q)))
  order by m.full_name limit 30
$$;

-------------------------------------------------------------------------------
-- 9. RLS
-------------------------------------------------------------------------------
alter table public.whs_federations enable row level security;
alter table public.whs_fed_configs enable row level security;
alter table public.whs_clubs enable row level security;
alter table public.whs_courses enable row level security;
alter table public.whs_members enable row level security;
alter table public.whs_staff enable row level security;
alter table public.whs_rounds enable row level security;
alter table public.whs_round_log enable row level security;
alter table public.whs_member_events enable row level security;
alter table public.whs_compute_runs enable row level security;
alter table public.whs_round_results enable row level security;
alter table public.whs_hi_history enable row level security;

-- Dữ liệu tham chiếu: ai cũng đọc được
drop policy if exists whs_fed_read on public.whs_federations;
create policy whs_fed_read on public.whs_federations for select using (true);
drop policy if exists whs_fed_write on public.whs_federations;
create policy whs_fed_write on public.whs_federations for all to authenticated
  using (public.whs_is_platform_admin() or public.whs_is_fed_staff(id, array['fed_admin']))
  with check (public.whs_is_platform_admin() or public.whs_is_fed_staff(id, array['fed_admin']));

drop policy if exists whs_cfg_read on public.whs_fed_configs;
create policy whs_cfg_read on public.whs_fed_configs for select using (true);
drop policy if exists whs_cfg_insert on public.whs_fed_configs;
create policy whs_cfg_insert on public.whs_fed_configs for insert to authenticated
  with check (public.whs_is_fed_staff(federation_id, array['fed_admin']));

drop policy if exists whs_club_read on public.whs_clubs;
create policy whs_club_read on public.whs_clubs for select using (true);
drop policy if exists whs_club_write on public.whs_clubs;
create policy whs_club_write on public.whs_clubs for all to authenticated
  using (public.whs_is_fed_staff(federation_id, array['fed_admin']))
  with check (public.whs_is_fed_staff(federation_id, array['fed_admin']));

drop policy if exists whs_course_read on public.whs_courses;
create policy whs_course_read on public.whs_courses for select using (true);
drop policy if exists whs_course_write on public.whs_courses;
create policy whs_course_write on public.whs_courses for all to authenticated
  using (public.whs_is_platform_admin() or exists (select 1 from public.whs_staff s where s.user_id = auth.uid() and s.role = 'fed_admin' and s.deleted_at is null))
  with check (public.whs_is_platform_admin() or exists (select 1 from public.whs_staff s where s.user_id = auth.uid() and s.role = 'fed_admin' and s.deleted_at is null));

-- Hội viên: chính golfer, phụ huynh, nhân sự quản lý; marker thấy tên người mình chấm (qua vòng)
drop policy if exists whs_member_read on public.whs_members;
create policy whs_member_read on public.whs_members for select to authenticated
  using (public.whs_can_see_member(id)
    or exists (select 1 from public.whs_rounds r where r.member_id = whs_members.id
               and r.marker_member_id is not null and public.whs_can_act_for(r.marker_member_id)));
-- Golfer/phụ huynh tự đổi tuỳ chọn tra cứu (cột khác bị chặn bằng trigger)
drop policy if exists whs_member_self_update on public.whs_members;
create policy whs_member_self_update on public.whs_members for update to authenticated
  using (public.whs_can_act_for(id)) with check (public.whs_can_act_for(id));

create or replace function public.whs_member_self_guard() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.whs_can_manage_member(old.id) then
    if (new.student_id, new.user_id, new.federation_id, new.home_club_id, new.full_name, new.gender, new.birth_year, new.is_minor, new.status)
       is distinct from (old.student_id, old.user_id, old.federation_id, old.home_club_id, old.full_name, old.gender, old.birth_year, old.is_minor, old.status)
    then raise exception 'golfer_can_only_change_public_lookup'; end if;
    if old.is_minor and new.public_lookup then raise exception 'minor_always_hidden'; end if;
  end if;
  return new;
end $$;
drop trigger if exists whs_members_self_guard on public.whs_members;
create trigger whs_members_self_guard before update on public.whs_members for each row execute function public.whs_member_self_guard();

drop policy if exists whs_staff_read on public.whs_staff;
create policy whs_staff_read on public.whs_staff for select to authenticated
  using (user_id = auth.uid() or public.whs_is_fed_staff(federation_id, array['fed_admin']));
drop policy if exists whs_staff_write on public.whs_staff;
create policy whs_staff_write on public.whs_staff for all to authenticated
  using (public.whs_is_platform_admin() or (role <> 'fed_admin' and public.whs_is_fed_staff(federation_id, array['fed_admin'])))
  with check (public.whs_is_platform_admin() or (role <> 'fed_admin' and public.whs_is_fed_staff(federation_id, array['fed_admin'])));

-- Vòng đấu: chủ vòng, người giám hộ, marker, nhân sự quản lý. Không có quyền ghi trực tiếp.
drop policy if exists whs_round_read on public.whs_rounds;
create policy whs_round_read on public.whs_rounds for select to authenticated
  using (public.whs_can_see_member(member_id) or (marker_member_id is not null and public.whs_can_act_for(marker_member_id)));
revoke insert, update, delete on public.whs_rounds from anon, authenticated;

drop policy if exists whs_log_read on public.whs_round_log;
create policy whs_log_read on public.whs_round_log for select to authenticated
  using (exists (select 1 from public.whs_rounds r where r.id = round_id
    and (public.whs_can_see_member(r.member_id) or (r.marker_member_id is not null and public.whs_can_act_for(r.marker_member_id)))));
revoke insert, update, delete on public.whs_round_log from anon, authenticated;

drop policy if exists whs_event_read on public.whs_member_events;
create policy whs_event_read on public.whs_member_events for select to authenticated using (public.whs_can_see_member(member_id));
revoke insert, update, delete on public.whs_member_events from anon, authenticated;

drop policy if exists whs_result_read on public.whs_round_results;
create policy whs_result_read on public.whs_round_results for select to authenticated
  using (exists (select 1 from public.whs_rounds r where r.id = round_id and public.whs_can_see_member(r.member_id)));
revoke insert, update, delete on public.whs_round_results from anon, authenticated;

drop policy if exists whs_hi_read on public.whs_hi_history;
create policy whs_hi_read on public.whs_hi_history for select to authenticated using (public.whs_can_see_member(member_id));
revoke insert, update, delete on public.whs_hi_history from anon, authenticated;

drop policy if exists whs_run_read on public.whs_compute_runs;
create policy whs_run_read on public.whs_compute_runs for select to authenticated using (public.whs_is_platform_admin());
revoke insert, update, delete on public.whs_compute_runs from anon, authenticated;

-- Hàm chỉ cho người đã đăng nhập
revoke execute on function public.whs_join(text, uuid, uuid, text) from public, anon;
revoke execute on function public.whs_register_round(text, text, text, text, text, double precision, double precision, uuid) from public, anon;
revoke execute on function public.whs_cancel_round(uuid, text) from public, anon;
revoke execute on function public.whs_submit_round(uuid, int[], uuid, boolean, text) from public, anon;
revoke execute on function public.whs_post_unregistered(text, text, date, text, int[], uuid, text, text, boolean, text, uuid) from public, anon;
revoke execute on function public.whs_attest_round(uuid, boolean, text) from public, anon;
revoke execute on function public.whs_committee_decide(uuid, text, text, int[]) from public, anon;
revoke execute on function public.whs_enter_competition_score(uuid, text, text, date, text, int[], text, text) from public, anon;
revoke execute on function public.whs_set_member_status(uuid, text, text) from public, anon;
revoke execute on function public.whs_member_event(uuid, text, date, numeric, text) from public, anon;
grant execute on function public.whs_sweep() to service_role;
grant execute on function public.whs_log(uuid, text, jsonb, jsonb, text) to service_role;

-------------------------------------------------------------------------------
-- 1. Layout SNAG và tee trẻ em (thuộc liên đoàn; nhân sự liên đoàn/CLB khai báo)
-------------------------------------------------------------------------------
create table if not exists public.whs_youth_layouts (
  id text primary key default ('L' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  federation_id text not null references public.whs_federations(id),
  name text not null check (char_length(name) between 1 and 120),
  holes jsonb not null,               -- [{par, dist}] – từ 3 hố
  archived boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(holes) = 'array' and jsonb_array_length(holes) between 3 and 18)
);

create table if not exists public.whs_youth_tees (
  id text primary key default ('T' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  federation_id text not null references public.whs_federations(id),
  course_id text references public.whs_courses(id),
  name text not null check (char_length(name) between 1 and 120),
  age_group text not null check (age_group in ('U7', 'U8', 'U9', 'U10', 'U11', 'U13', 'U15')),
  yd int[] not null, par int[] not null, si int[] not null,
  cr0 numeric(4,1),                   -- rating ban đầu admin tự nhập (bỏ trống = tính theo chiều dài & nhóm tuổi)
  archived boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(yd) in (6, 9, 18) and cardinality(par) = cardinality(yd) and cardinality(si) = cardinality(yd))
);

-------------------------------------------------------------------------------
-- 2. Vòng SNAG / Junior và ảnh thẻ điểm
-------------------------------------------------------------------------------
create table if not exists public.whs_youth_rounds (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.whs_members(id),
  federation_id text not null references public.whs_federations(id),
  kind text not null check (kind in ('snag', 'junior')),
  layout_id text references public.whs_youth_layouts(id),
  tee_id text references public.whs_youth_tees(id),
  played_on date not null,
  round_type text not null default 'event' check (round_type in ('event', 'practice')),
  scores jsonb,                       -- [số gậy | "X" | null]; null cả mảng = chỉ gửi ảnh, admin nhập điểm
  via text not null default 'app' check (via in ('app', 'photo', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  submitted_by uuid default auth.uid(),
  decided_by uuid, decided_at timestamptz, decision_note text,
  created_at timestamptz not null default now(),
  check ((kind = 'snag') = (layout_id is not null) and (kind = 'junior') = (tee_id is not null))
);
create index if not exists whs_youth_rounds_member on public.whs_youth_rounds (member_id, kind, played_on);
create index if not exists whs_youth_rounds_pending on public.whs_youth_rounds (federation_id, status) where status = 'pending';

create table if not exists public.whs_youth_photos (
  round_id uuid primary key references public.whs_youth_rounds(id) on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data text not null check (char_length(data) <= 1500000),   -- base64, app đã nén ≤ ~1 MB
  created_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- 3. Kết quả tính (chỉ máy chủ ghi)
-------------------------------------------------------------------------------
create table if not exists public.whs_youth_results (
  round_id uuid primary key references public.whs_youth_rounds(id) on delete cascade,
  member_id uuid not null references public.whs_members(id),
  kind text not null,
  ok boolean not null,
  status_text text,
  adj int, rating numeric(5,1), diff numeric(5,1), idx_before numeric(4,1), idx_after numeric(4,1),
  notes jsonb not null default '[]',
  run_id uuid, computed_at timestamptz not null default now()
);
create table if not exists public.whs_youth_index (
  member_id uuid not null references public.whs_members(id),
  kind text not null check (kind in ('snag', 'junior')),
  idx numeric(4,1),                   -- null = chưa đủ điều kiện
  n_rounds int not null default 0, holes int not null default 0, need int not null default 0,
  as_of date,
  history jsonb not null default '[]',
  run_id uuid, computed_at timestamptz not null default now(),
  primary key (member_id, kind)
);
create table if not exists public.whs_youth_ratings (     -- rating từng chặng SNAG / mỗi lần hiệu chỉnh tee Junior
  kind text not null, ref_id text not null, played_on date not null,
  rating numeric(5,1), anchors int, detail jsonb,
  run_id uuid, computed_at timestamptz not null default now(),
  primary key (kind, ref_id, played_on)
);
create table if not exists public.whs_youth_tee_state (
  tee_id text primary key references public.whs_youth_tees(id) on delete cascade,
  cr0 numeric(5,1), cr numeric(5,1), delta numeric(5,1), calibrated int, d numeric(6,1),
  run_id uuid, computed_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- 4. Hàm
-------------------------------------------------------------------------------
-- Kiểm tra mảng điểm: SNAG đủ mọi hố; Junior được bỏ trống hố không chơi nhưng ≥ 6 hố
create or replace function public.whs_youth_check_scores(p_kind text, p_n int, p_scores jsonb) returns void
language plpgsql immutable as $$
declare e jsonb; played int := 0;
begin
  if p_scores is null or jsonb_typeof(p_scores) <> 'array' then raise exception 'scores_required'; end if;
  if jsonb_array_length(p_scores) <> p_n then raise exception 'scores_length'; end if;
  for e in select value from jsonb_array_elements(p_scores) loop
    if jsonb_typeof(e) = 'null' then
      if p_kind = 'snag' then raise exception 'scores_missing_hole'; end if;
    elsif jsonb_typeof(e) = 'string' then
      if e #>> '{}' <> 'X' then raise exception 'scores_bad_value'; end if; played := played + 1;
    elsif jsonb_typeof(e) = 'number' then
      if (e #>> '{}')::numeric not between 1 and 20 or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric) then raise exception 'scores_bad_value'; end if;
      played := played + 1;
    else raise exception 'scores_bad_value'; end if;
  end loop;
  if p_kind = 'junior' and played < 6 then raise exception 'junior_min_6_holes'; end if;
end $$;

create or replace function public.whs_youth_ref_holes(p_kind text, p_ref text, p_fed text) returns int
language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  if p_kind = 'snag' then
    select jsonb_array_length(holes) into n from whs_youth_layouts where id = p_ref and federation_id = p_fed and not archived;
  elsif p_kind = 'junior' then
    select cardinality(yd) into n from whs_youth_tees where id = p_ref and federation_id = p_fed and not archived;
  else raise exception 'bad_kind'; end if;
  if n is null then raise exception 'ref_not_found'; end if;
  return n;
end $$;

-- Gửi điểm. p_member = null: golfer tự gửi (chờ admin). p_member có giá trị: nhân sự nhập hộ (xác nhận luôn).
create or replace function public.whs_youth_submit(p_kind text, p_ref text, p_played_on date, p_scores jsonb,
  p_type text default 'event', p_photo text default null, p_photo_mime text default null, p_member uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare m whs_members; v_id uuid; n int;
  -- Nhân sự nhập hộ (xác nhận luôn) chỉ khi người gọi quản lý hội viên mà không phải chính golfer/phụ huynh của golfer đó
  v_staff boolean := p_member is not null and whs_can_manage_member(p_member) and not whs_can_act_for(p_member);
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_staff then
    select * into m from whs_members where id = p_member;
  else
    m := whs_resolve_member(p_member, array['active', 'pending']);
  end if;
  if m.status not in ('active', 'pending') then raise exception 'member_inactive'; end if;
  if p_played_on is null or p_played_on > current_date + 1 then raise exception 'bad_date'; end if;
  n := whs_youth_ref_holes(p_kind, p_ref, m.federation_id);
  if p_scores is not null then perform whs_youth_check_scores(p_kind, n, p_scores);
  elsif p_photo is null or v_staff then raise exception 'scores_or_photo_required'; end if;
  if p_photo is not null and p_photo_mime not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'bad_photo'; end if;
  insert into whs_youth_rounds (member_id, federation_id, kind, layout_id, tee_id, played_on, round_type, scores, via, status, decided_by, decided_at)
  values (m.id, m.federation_id, p_kind, case when p_kind = 'snag' then p_ref end, case when p_kind = 'junior' then p_ref end,
    p_played_on, coalesce(p_type, 'event'), p_scores,
    case when v_staff then 'admin' when p_photo is not null then 'photo' else 'app' end,
    case when v_staff then 'confirmed' else 'pending' end,
    case when v_staff then auth.uid() end, case when v_staff then now() end)
  returning id into v_id;
  if p_photo is not null then insert into whs_youth_photos (round_id, mime, data) values (v_id, p_photo_mime, p_photo); end if;
  return v_id;
end $$;

-- Golfer huỷ điểm còn đang chờ của chính mình
create or replace function public.whs_youth_withdraw(p_round uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from whs_youth_rounds where id = p_round and status = 'pending' and whs_can_act_for(member_id);
  if not found then raise exception 'cannot_withdraw'; end if;
end $$;

-- Admin xác nhận (có thể nhập/sửa điểm từ ảnh) hoặc từ chối
create or replace function public.whs_youth_decide(p_round uuid, p_approve boolean, p_scores jsonb default null, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r whs_youth_rounds; n int;
begin
  select * into r from whs_youth_rounds where id = p_round for update;
  if r.id is null then raise exception 'round_not_found'; end if;
  if not whs_can_manage_member(r.member_id) then raise exception 'forbidden'; end if;
  if r.status <> 'pending' then raise exception 'not_pending'; end if;
  if p_approve then
    n := whs_youth_ref_holes(r.kind, coalesce(r.layout_id, r.tee_id), r.federation_id);
    if p_scores is not null then perform whs_youth_check_scores(r.kind, n, p_scores);
    elsif r.scores is null then raise exception 'scores_required';
    else perform whs_youth_check_scores(r.kind, n, r.scores); end if;
    update whs_youth_rounds set status = 'confirmed', scores = coalesce(p_scores, scores),
      decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = p_round;
  else
    update whs_youth_rounds set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = p_round;
  end if;
end $$;

-- Khai báo / sửa layout SNAG
create or replace function public.whs_youth_save_layout(p_id text, p_fed text, p_name text, p_holes jsonb, p_archived boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text; h jsonb;
begin
  if not whs_is_fed_staff(p_fed, array['fed_admin', 'committee', 'club_admin']) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_holes) <> 'array' or jsonb_array_length(p_holes) not between 3 and 18 then raise exception 'layout_3_to_18_holes'; end if;
  for h in select value from jsonb_array_elements(p_holes) loop
    if (h ->> 'par') is null or (h ->> 'par')::int not between 2 and 6 then raise exception 'bad_par'; end if;
  end loop;
  if p_id is null then
    insert into whs_youth_layouts (federation_id, name, holes) values (p_fed, p_name, p_holes) returning id into v_id;
  else
    -- Layout đã có vòng được tính thì không đổi số hố/par (tránh sai lịch sử) – chỉ đổi tên / lưu trữ
    if exists (select 1 from whs_youth_rounds where layout_id = p_id) and
       (select holes from whs_youth_layouts where id = p_id) is distinct from p_holes then raise exception 'layout_in_use'; end if;
    update whs_youth_layouts set name = p_name, holes = p_holes, archived = coalesce(p_archived, false), updated_at = now()
    where id = p_id and federation_id = p_fed returning id into v_id;
    if v_id is null then raise exception 'ref_not_found'; end if;
  end if;
  return v_id;
end $$;

-- Khai báo / sửa tee trẻ em
create or replace function public.whs_youth_save_tee(p_id text, p_fed text, p_name text, p_group text, p_yd int[], p_par int[], p_si int[],
  p_cr0 numeric default null, p_course text default null, p_archived boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not whs_is_fed_staff(p_fed, array['fed_admin', 'committee', 'club_admin']) then raise exception 'forbidden'; end if;
  if cardinality(p_yd) not in (6, 9, 18) or cardinality(p_par) <> cardinality(p_yd) then raise exception 'tee_6_9_18_holes'; end if;
  if p_si is null or cardinality(p_si) <> cardinality(p_yd) then
    select array_agg(i order by i) into p_si from generate_series(1, cardinality(p_yd)) i;
  end if;
  if exists (select 1 from unnest(p_yd) y where y not between 20 and 700) then raise exception 'bad_length'; end if;
  if exists (select 1 from unnest(p_par) x where x not between 3 and 6) then raise exception 'bad_par'; end if;
  if p_id is null then
    insert into whs_youth_tees (federation_id, course_id, name, age_group, yd, par, si, cr0)
    values (p_fed, p_course, p_name, p_group, p_yd, p_par, p_si, p_cr0) returning id into v_id;
  else
    if exists (select 1 from whs_youth_rounds where tee_id = p_id) and exists (select 1 from whs_youth_tees t where t.id = p_id and
       (t.yd is distinct from p_yd or t.par is distinct from p_par or t.age_group is distinct from p_group)) then raise exception 'tee_in_use'; end if;
    update whs_youth_tees set name = p_name, course_id = p_course, age_group = p_group, yd = p_yd, par = p_par, si = p_si, cr0 = p_cr0,
      archived = coalesce(p_archived, false), updated_at = now()
    where id = p_id and federation_id = p_fed returning id into v_id;
    if v_id is null then raise exception 'ref_not_found'; end if;
  end if;
  return v_id;
end $$;

-------------------------------------------------------------------------------
-- 5. Phân quyền
-------------------------------------------------------------------------------
alter table public.whs_youth_layouts enable row level security;
alter table public.whs_youth_tees enable row level security;
alter table public.whs_youth_rounds enable row level security;
alter table public.whs_youth_photos enable row level security;
alter table public.whs_youth_results enable row level security;
alter table public.whs_youth_index enable row level security;
alter table public.whs_youth_ratings enable row level security;
alter table public.whs_youth_tee_state enable row level security;

drop policy if exists whs_ylayout_read on public.whs_youth_layouts;
create policy whs_ylayout_read on public.whs_youth_layouts for select using (true);
drop policy if exists whs_ytee_read on public.whs_youth_tees;
create policy whs_ytee_read on public.whs_youth_tees for select using (true);
drop policy if exists whs_yround_read on public.whs_youth_rounds;
create policy whs_yround_read on public.whs_youth_rounds for select to authenticated using (public.whs_can_see_member(member_id));
drop policy if exists whs_yphoto_read on public.whs_youth_photos;
create policy whs_yphoto_read on public.whs_youth_photos for select to authenticated
  using (exists (select 1 from public.whs_youth_rounds r where r.id = round_id and public.whs_can_see_member(r.member_id)));
drop policy if exists whs_yres_read on public.whs_youth_results;
create policy whs_yres_read on public.whs_youth_results for select to authenticated using (public.whs_can_see_member(member_id));
drop policy if exists whs_yidx_read on public.whs_youth_index;
create policy whs_yidx_read on public.whs_youth_index for select to authenticated using (public.whs_can_see_member(member_id));
drop policy if exists whs_yrat_read on public.whs_youth_ratings;
create policy whs_yrat_read on public.whs_youth_ratings for select using (true);
drop policy if exists whs_ytst_read on public.whs_youth_tee_state;
create policy whs_ytst_read on public.whs_youth_tee_state for select using (true);

revoke insert, update, delete on public.whs_youth_layouts, public.whs_youth_tees, public.whs_youth_rounds, public.whs_youth_photos,
  public.whs_youth_results, public.whs_youth_index, public.whs_youth_ratings, public.whs_youth_tee_state from anon, authenticated;
grant select on public.whs_youth_layouts, public.whs_youth_tees, public.whs_youth_ratings, public.whs_youth_tee_state to anon, authenticated;
grant select on public.whs_youth_rounds, public.whs_youth_photos, public.whs_youth_results, public.whs_youth_index to authenticated;
grant all on public.whs_youth_layouts, public.whs_youth_tees, public.whs_youth_rounds, public.whs_youth_photos,
  public.whs_youth_results, public.whs_youth_index, public.whs_youth_ratings, public.whs_youth_tee_state to service_role;

revoke execute on function public.whs_youth_submit(text, text, date, jsonb, text, text, text, uuid) from public, anon;
revoke execute on function public.whs_youth_withdraw(uuid) from public, anon;
revoke execute on function public.whs_youth_decide(uuid, boolean, jsonb, text) from public, anon;
revoke execute on function public.whs_youth_save_layout(text, text, text, jsonb, boolean) from public, anon;
revoke execute on function public.whs_youth_save_tee(text, text, text, text, int[], int[], int[], numeric, text, boolean) from public, anon;
grant execute on function public.whs_youth_submit(text, text, date, jsonb, text, text, text, uuid) to authenticated;
grant execute on function public.whs_youth_withdraw(uuid) to authenticated;
grant execute on function public.whs_youth_decide(uuid, boolean, jsonb, text) to authenticated;
grant execute on function public.whs_youth_save_layout(text, text, text, jsonb, boolean) to authenticated;
grant execute on function public.whs_youth_save_tee(text, text, text, text, int[], int[], int[], numeric, text, boolean) to authenticated;
revoke execute on function public.whs_youth_ref_holes(text, text, text) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Gắn Golf Passport: cấu hình chung, chỉ số cho app Tập luyện, phân quyền hàm mới
-------------------------------------------------------------------------------
alter table public.whs_settings enable row level security;
drop policy if exists whs_settings_read on public.whs_settings;
create policy whs_settings_read on public.whs_settings for select using (true);
drop policy if exists whs_settings_write on public.whs_settings;
create policy whs_settings_write on public.whs_settings for all to authenticated
  using (public.whs_is_platform_admin()) with check (public.whs_is_platform_admin());

-- Chỉ số WHS hiện tại của một golfer, cho app Tập luyện (chỉ đọc).
-- Trả 1 dòng khi người gọi xem được golfer (chính golfer, phụ huynh đang liên kết, HLV của lớp, admin, nhân sự liên đoàn quản lý);
-- không xem được → không dòng nào. Chưa đủ số hố / số điểm tối thiểu (cấu hình liên đoàn) hoặc chưa có chỉ số → handicap_index = null.
-- holes_posted / scores_posted: số hố có điểm và số vòng của các vòng đã được xác nhận (attested).
create or replace function public.whs_current_index(p_student_id uuid)
returns table (handicap_index numeric, holes_posted int, scores_posted int, min_holes_required int, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  m whs_members; v_fed text; v_holes int := 0; v_scores int := 0; v_min_h int; v_min_s int; v_max numeric;
  v_hi numeric; v_withdrawn boolean; v_at timestamptz;
begin
  if p_student_id is null or auth.uid() is null then return; end if;
  -- coalesce: các hàm quyền có thể trả null (vd. my_student_id() = null) – null phải tính là không được xem
  if not coalesce(public.training_can_view(p_student_id) or public.is_guardian_of(p_student_id)
          or public.my_student_id() = p_student_id or public.whs_own_student() = p_student_id
          or public.whs_is_platform_admin()
          or exists (select 1 from whs_members x where x.student_id = p_student_id and public.whs_can_manage_member(x.id)), false) then
    return;
  end if;
  -- Golfer có thể là hội viên nhiều liên đoàn: lấy liên đoàn có chỉ số mới nhất, rồi liên đoàn tham gia sớm nhất
  select x.* into m from whs_members x
  left join lateral (select max(hh.as_of) as as_of from whs_hi_history hh where hh.member_id = x.id) l on true
  where x.student_id = p_student_id and x.status in ('active', 'pending', 'suspended')
  order by l.as_of desc nulls last, x.created_at limit 1;
  v_fed := m.federation_id;
  v_min_h := (public.whs_setting(v_fed, 'initMinHoles') #>> '{}')::int;
  v_min_s := (public.whs_setting(v_fed, 'initMinScores') #>> '{}')::int;
  v_max := least(coalesce((public.whs_setting(v_fed, 'maxHI') #>> '{}')::numeric, 54.0), 54.0);
  if m.id is not null then
    select coalesce(sum((select count(*) from unnest(r.gross) g where g is not null)), 0)::int, count(*)::int
      into v_holes, v_scores
    from whs_rounds r where r.member_id = m.id and r.status = 'attested';
    select hh.hi, hh.withdrawn, hh.computed_at into v_hi, v_withdrawn, v_at
    from whs_hi_history hh where hh.member_id = m.id order by hh.as_of desc limit 1;
  end if;
  handicap_index := case when v_hi is not null and not coalesce(v_withdrawn, false)
                          and v_holes >= coalesce(v_min_h, 0) and v_scores >= coalesce(v_min_s, 0)
                     then least(v_hi, v_max) end;
  holes_posted := v_holes;
  scores_posted := v_scores;
  min_holes_required := v_min_h;
  updated_at := greatest(v_at, m.updated_at);
  return next;
end $$;

-- Hàm nội bộ: chỉ gọi từ trong các hàm whs_* khác
revoke execute on function public.whs_resolve_member(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.whs_check_course_length(text, public.whs_courses, text, text) from public, anon, authenticated;
-- Hàm quyền dùng trong chính sách RLS: người đã đăng nhập cần quyền chạy
revoke execute on function public.whs_my_students() from public, anon;
revoke execute on function public.whs_own_student() from public, anon;
revoke execute on function public.whs_can_act_for(uuid) from public, anon;
revoke execute on function public.whs_my_member() from public, anon;
revoke execute on function public.whs_can_see_member(uuid) from public, anon;
grant execute on function public.whs_my_students(), public.whs_own_student(), public.whs_can_act_for(uuid),
  public.whs_my_member(), public.whs_can_see_member(uuid) to authenticated;
-- Hàm app gọi
revoke execute on function public.whs_my_golfers() from public, anon;
revoke execute on function public.whs_find_marker(text, text) from public, anon;
revoke execute on function public.whs_current_index(uuid) from public, anon;
grant execute on function public.whs_join(text, uuid, uuid, text), public.whs_my_golfers(), public.whs_find_marker(text, text),
  public.whs_current_index(uuid), public.whs_setting(text, text) to authenticated;
grant execute on function public.whs_current_index(uuid) to service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261124000006', 'whs_handicap') on conflict (version) do nothing;

commit;
