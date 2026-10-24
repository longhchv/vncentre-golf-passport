-- Module Hồ sơ nhân sự (11-module-ho-so-nhan-su.md, bước 1) · Chặng A: dữ liệu, phân quyền, tự sinh engagement.
-- Migration chỉ thêm: cột mới trên profiles, bảng mới, hàm mới. Không đổi phân quyền đang có.
-- Anh Long chốt 24/10/2026 (khi bắt đầu chặng A):
--   1. Engagement sự kiện tự sinh từ CẢ vai trò event_staff (user_roles) LẪN phân công crew (event_crew_assignments)
--      khi hồ sơ crew đã gắn tài khoản (hồ sơ tự chơi `self`). Kích hoạt tài khoản sau thì tự sinh bù.
--   2. "Người phụ trách sự kiện" là một dấu riêng theo từng sự kiện, admin bật cho từng người (bảng event_managers).
--   3. Ghi nhận cho nhân sự lớp: HLV trưởng của chính lớp đó (class_staff.role = head_coach) và HLV trưởng toàn trung tâm.
--   4. Gỡ khỏi event_staff / class_staff / crew: dòng tự sinh chưa ai ghi nhận thì xoá mềm; đã ghi nhận thì giữ.

-------------------------------------------------------------------------------
-- profiles: mẫu CV, ngày tham gia, có in liên hệ không
-------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists cv_type text check (cv_type in ('coach', 'volunteer', 'organizer')),
  add column if not exists joined_vncentre_on date,
  add column if not exists show_contact_on_cv boolean not null default false;

-- Người dùng tự sửa được tên, ngôn ngữ, ảnh, có in liên hệ trên CV; chỉ admin đổi trạng thái, mẫu CV, ngày tham gia (S-R3)
create or replace function public.guard_profile_update()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status
       or new.user_id is distinct from old.user_id
       or new.email is distinct from old.email
       or new.phone is distinct from old.phone
       or new.org_id is distinct from old.org_id
       or new.cv_type is distinct from old.cv_type
       or new.joined_vncentre_on is distinct from old.joined_vncentre_on then
      raise exception 'Không có quyền sửa trường này' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-------------------------------------------------------------------------------
-- Bảng mới
-------------------------------------------------------------------------------
-- Người phụ trách sự kiện (quyết định 2): được ghi nhận vị trí, số giờ, kỹ năng, kết quả cho nhân sự của sự kiện
create table public.event_managers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  event_id uuid not null references public.events(id),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  granted_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index event_managers_active_uq on public.event_managers (event_id, user_id) where deleted_at is null;

create table public.staff_skills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_vi text not null,
  name_en text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.staff_skills (code, name_vi, name_en, sort_order) values
  ('coordination', 'Điều phối', 'Coordination', 1),
  ('child_guidance', 'Hướng dẫn trẻ em', 'Working with children', 2),
  ('communications', 'Truyền thông', 'Communications', 3),
  ('guest_reception', 'Tiếp đón khách', 'Guest reception', 4),
  ('event_logistics', 'Hậu cần sự kiện', 'Event logistics', 5),
  ('tournament_coordination', 'Điều phối giải đấu', 'Tournament coordination', 6)
on conflict (code) do nothing;

-- Một dòng = một lần nhân sự đảm nhận một việc
create table public.staff_engagements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null check (kind in ('event', 'project', 'class')),
  event_id uuid references public.events(id),
  class_id uuid references public.classes(id),
  project_name_vi text,
  project_name_en text,
  position_vi text,
  position_en text,
  staff_group text not null check (staff_group in ('coach', 'volunteer', 'collaborator', 'organizer')),
  started_on date,
  ended_on date,
  hours numeric(6, 1) check (hours is null or hours >= 0),
  scale jsonb not null default '{}' check (jsonb_typeof(scale) = 'object'),
  outcome_vi text,
  outcome_en text,
  source text not null check (source in ('system', 'manager', 'self')),
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  confirmed_by uuid references public.profiles(user_id) on delete set null,
  confirmed_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind <> 'event' or event_id is not null),
  check (kind <> 'class' or class_id is not null),
  check (kind <> 'project' or btrim(coalesce(project_name_vi, '')) <> ''),
  check (source <> 'system' or kind in ('event', 'class')),
  check (status <> 'rejected' or btrim(coalesce(rejected_reason, '')) <> ''),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);
create index staff_engagements_user_idx on public.staff_engagements (user_id);
-- Mỗi người một dòng tự sinh cho mỗi sự kiện / lớp (kể cả dòng đã xoá mềm, để gán lại thì hiện lại dòng cũ)
create unique index staff_engagements_system_event_uq on public.staff_engagements (user_id, event_id)
  where source = 'system' and kind = 'event';
create unique index staff_engagements_system_class_uq on public.staff_engagements (user_id, class_id)
  where source = 'system' and kind = 'class';

-- Một kỹ năng ghi tối đa một lần cho mỗi engagement
create table public.staff_skill_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  engagement_id uuid not null references public.staff_engagements(id) on delete cascade,
  skill_code text not null references public.staff_skills(code) on update cascade,
  recorded_by uuid references public.profiles(user_id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (engagement_id, skill_code)
);
create index staff_skill_records_user_idx on public.staff_skill_records (user_id);

-- Chứng chỉ, kinh nghiệm tự khai. Đây là bảng coach_credentials dự kiến ở đợt 7 (đổi tên, mở rộng cho mọi nhân sự)
create table public.staff_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  type text not null check (type in ('certificate', 'prior_experience')),
  title_vi text not null check (btrim(title_vi) <> ''),
  title_en text,
  issuer text,
  issued_on date,
  expires_on date,
  years numeric(4, 1) check (years is null or years >= 0),
  file_path text,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status <> 'rejected' or btrim(coalesce(rejected_reason, '')) <> ''),
  check (expires_on is null or issued_on is null or expires_on >= issued_on)
);
create index staff_credentials_user_idx on public.staff_credentials (user_id);

-- CV đã xuất: snapshot, giống certificates (S-R5). Mã xác thực dùng chung bảng chữ và không trùng mã chứng nhận (S-R6)
create table public.staff_cv_exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  verify_code text not null unique default public.new_verify_code(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  cv_type text not null check (cv_type in ('coach', 'volunteer', 'organizer')),
  lang text not null check (lang in ('vi', 'en')),
  data jsonb not null,
  pdf_path text,
  exported_at timestamptz not null default now(),
  exported_by uuid references public.profiles(user_id) on delete set null,
  status text not null default 'valid' check (status in ('valid', 'revoked')),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_cv_exports_user_idx on public.staff_cv_exports (user_id);

-- Mã xác thực: sinh mã không trùng cả chứng nhận lẫn CV (S6 dùng chung /verify/{mã})
create or replace function public.new_verify_code()
returns text language plpgsql volatile set search_path = public as $$
declare c text;
begin
  loop
    c := public.random_code(10);
    exit when not exists (select 1 from public.certificates where verify_code = c)
          and not exists (select 1 from public.staff_cv_exports where verify_code = c);
  end loop;
  return c;
end $$;

-- Chặn trùng mã giữa hai bảng kể cả khi ghi mã tay
create or replace function public.guard_verify_code_unique()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verify_code is null then return new; end if;
  if (tg_table_name = 'certificates' and exists (select 1 from public.staff_cv_exports where verify_code = new.verify_code))
     or (tg_table_name = 'staff_cv_exports' and exists (select 1 from public.certificates where verify_code = new.verify_code)) then
    raise exception 'verify_code_taken' using errcode = '23505';
  end if;
  return new;
end $$;

create trigger guard_verify_code_unique before insert or update of verify_code on public.certificates
  for each row execute function public.guard_verify_code_unique();
create trigger guard_verify_code_unique before insert or update of verify_code on public.staff_cv_exports
  for each row execute function public.guard_verify_code_unique();

-- updated_at + nhật ký (S-R11) + RLS mặc định từ chối, admin toàn quyền
do $$
declare t text;
begin
  foreach t in array array['event_managers', 'staff_skills', 'staff_engagements', 'staff_skill_records',
                           'staff_credentials', 'staff_cv_exports'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Phạm vi người phụ trách (S-R10)
-------------------------------------------------------------------------------
create or replace function public.is_event_manager(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.event_managers m join public.profiles p on p.user_id = m.user_id
    where m.event_id = p_event_id and m.user_id = auth.uid() and m.deleted_at is null and p.status = 'active')
$$;

-- HLV trưởng của chính lớp đó, HLV trưởng toàn trung tâm, admin (quyết định 3)
create or replace function public.is_class_manager(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_center_staff() or exists (
    select 1 from public.class_staff cs join public.profiles p on p.user_id = cs.user_id
    where cs.class_id = p_class_id and cs.user_id = auth.uid() and cs.role = 'head_coach' and p.status = 'active')
$$;

-- Người đang đăng nhập có được ghi nhận cho dòng này không: dòng system/manager của sự kiện, lớp mình phụ trách,
-- không phải dòng của chính mình (admin thì luôn được)
create or replace function public.can_record_engagement(p_engagement_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_engagements e
    where e.id = p_engagement_id and e.deleted_at is null and e.source in ('system', 'manager')
      and (public.is_admin() or (
        e.user_id <> auth.uid()
        and ((e.event_id is not null and public.is_event_manager(e.event_id))
             or (e.class_id is not null and public.is_class_manager(e.class_id))))))
$$;

-------------------------------------------------------------------------------
-- RLS: chủ hồ sơ xem của mình; người phụ trách xem nhân sự trong sự kiện, lớp của mình. Ghi đều đi qua hàm.
-------------------------------------------------------------------------------
create policy public_read on public.staff_skills for select to authenticated using (is_active);
create policy own_read on public.event_managers for select to authenticated using (user_id = auth.uid() and deleted_at is null);

create policy own_read on public.staff_engagements for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy manager_read on public.staff_engagements for select to authenticated
  using (deleted_at is null and source in ('system', 'manager') and user_id <> auth.uid()
         and ((event_id is not null and public.is_event_manager(event_id))
              or (class_id is not null and public.is_class_manager(class_id))));

create policy own_read on public.staff_skill_records for select to authenticated using (user_id = auth.uid());
create policy manager_read on public.staff_skill_records for select to authenticated
  using (public.can_record_engagement(engagement_id));

create policy own_read on public.staff_credentials for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy own_read on public.staff_cv_exports for select to authenticated using (user_id = auth.uid());

-------------------------------------------------------------------------------
-- Tự sinh engagement từ event_staff, crew, class_staff
-------------------------------------------------------------------------------
-- Dòng tự sinh đã có ai ghi nhận chưa (quyết định 4: đã ghi nhận thì giữ khi gỡ gán)
create or replace function public.staff_engagement_recorded(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_engagements e where e.id = p_id
                 and (e.confirmed_by is not null or e.hours is not null or e.outcome_vi is not null or e.scale <> '{}'::jsonb))
      or exists (select 1 from public.staff_skill_records r where r.engagement_id = p_id)
$$;

-- Nhóm nhân sự theo nhãn thẻ đeo của ô crew: Huấn luyện viên → coach, Ban tổ chức / ô A → organizer, còn lại → volunteer
create or replace function public.staff_group_for_slot(p_role_code text, p_badge_label text)
returns text language sql stable set search_path = public as $$
  select case
    when public.normalize_name(p_badge_label) like 'huan luyen vien%' then 'coach'
    when p_role_code = 'A' or public.normalize_name(p_badge_label) like 'ban to chuc%' then 'organizer'
    else 'volunteer' end
$$;

create or replace function public.staff_sync_event(p_user_id uuid, p_event_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_group text;
  v_position text;
  e public.events;
  r public.staff_engagements;
begin
  if p_user_id is null or p_event_id is null then return; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then return; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null then return; end if;

  -- Phân công crew của hồ sơ tự chơi gắn với tài khoản này
  select public.staff_group_for_slot(s.role_code, s.badge_label),
         coalesce(nullif(btrim(a.position), ''), s.default_position, s.role_name_vi)
    into v_group, v_position
  from public.event_crew_assignments a
  join public.event_crew_slots s on s.id = a.slot_id
  where a.event_id = p_event_id and exists (
    select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = a.student_id and sg.relationship = 'self' and sg.deleted_at is null
      and g.deleted_at is null and g.user_id = p_user_id)
  order by s.sort_order limit 1;

  if v_group is null and exists (
      select 1 from public.user_roles ur
      where ur.user_id = p_user_id and ur.role = 'event_staff' and ur.class_id = e.class_id and ur.deleted_at is null) then
    v_group := 'organizer';
  end if;

  select * into r from public.staff_engagements
  where user_id = p_user_id and event_id = p_event_id and kind = 'event' and source = 'system';

  if v_group is not null then
    if r.id is null then
      insert into public.staff_engagements (user_id, kind, event_id, position_vi, staff_group, started_on, ended_on, source, status)
      values (p_user_id, 'event', p_event_id, v_position, v_group, e.event_date, e.event_date, 'system', 'approved');
    elsif r.deleted_at is not null
          or r.staff_group is distinct from v_group
          -- vị trí theo ô crew cho tới khi người phụ trách ghi nhận
          or (r.confirmed_by is null and v_position is not null and r.position_vi is distinct from v_position) then
      update public.staff_engagements set
        deleted_at = null,
        staff_group = v_group,
        position_vi = case when r.confirmed_by is null and v_position is not null then v_position else r.position_vi end
      where id = r.id;
    end if;
  elsif r.id is not null and r.deleted_at is null and not public.staff_engagement_recorded(r.id) then
    update public.staff_engagements set deleted_at = now() where id = r.id;
  end if;
end $$;

create or replace function public.staff_sync_class(p_user_id uuid, p_class_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  r public.staff_engagements;
begin
  if p_user_id is null or p_class_id is null then return; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then return; end if;
  -- Lớp của sự kiện đi theo đường sự kiện, không sinh dòng giảng dạy
  if exists (select 1 from public.events where class_id = p_class_id) then return; end if;
  select cl.id, coalesce(cl.start_date, ay.start_date) as started_on, coalesce(cl.end_date, ay.end_date) as ended_on into c
  from public.classes cl left join public.academic_years ay on ay.id = cl.academic_year_id
  where cl.id = p_class_id;
  if c.id is null then return; end if;

  select * into r from public.staff_engagements
  where user_id = p_user_id and class_id = p_class_id and kind = 'class' and source = 'system';

  if exists (select 1 from public.class_staff where class_id = p_class_id and user_id = p_user_id) then
    if r.id is null then
      insert into public.staff_engagements (user_id, kind, class_id, staff_group, started_on, ended_on, source, status)
      values (p_user_id, 'class', p_class_id, 'coach', c.started_on, c.ended_on, 'system', 'approved');
    elsif r.deleted_at is not null then
      update public.staff_engagements set deleted_at = null where id = r.id;
    end if;
  elsif r.id is not null and r.deleted_at is null and not public.staff_engagement_recorded(r.id) then
    update public.staff_engagements set deleted_at = now() where id = r.id;
  end if;
end $$;

-- Mọi tài khoản đang gắn hồ sơ tự chơi của một học viên
create or replace function public.staff_self_users(p_student_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct g.user_id from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where sg.student_id = p_student_id and sg.relationship = 'self' and g.user_id is not null
$$;

create or replace function public.staff_sync_student_events(p_student_id uuid, p_extra_user uuid default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare a record;
begin
  for a in
    select distinct ca.event_id, u.user_id
    from public.event_crew_assignments ca
    cross join lateral (select x.user_id from public.staff_self_users(p_student_id) as x(user_id)
                        union select p_extra_user where p_extra_user is not null) u
    where ca.student_id = p_student_id
  loop
    perform public.staff_sync_event(a.user_id, a.event_id);
  end loop;
end $$;

-- Trigger: vai trò event_staff
create or replace function public.staff_on_user_roles()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_event uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'event_staff' then
    select id into v_event from public.events where class_id = old.class_id;
    perform public.staff_sync_event(old.user_id, v_event);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.role = 'event_staff' then
    select id into v_event from public.events where class_id = new.class_id;
    perform public.staff_sync_event(new.user_id, v_event);
  end if;
  return null;
end $$;

create trigger staff_engagement_sync after insert or update or delete on public.user_roles
  for each row execute function public.staff_on_user_roles();

-- Trigger: phân công crew
create or replace function public.staff_on_crew_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    for u in select public.staff_self_users(old.student_id) loop
      perform public.staff_sync_event(u, old.event_id);
    end loop;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    for u in select public.staff_self_users(new.student_id) loop
      perform public.staff_sync_event(u, new.event_id);
    end loop;
  end if;
  return null;
end $$;

create trigger staff_engagement_sync after insert or update or delete on public.event_crew_assignments
  for each row execute function public.staff_on_crew_assignment();

-- Trigger: hồ sơ tự chơi gắn / gỡ tài khoản (kích hoạt sau thì sinh bù)
create or replace function public.staff_on_student_guardian()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.relationship = 'self' then
    perform public.staff_sync_student_events(old.student_id, (select user_id from public.guardians where id = old.guardian_id));
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.relationship = 'self' then
    perform public.staff_sync_student_events(new.student_id, (select user_id from public.guardians where id = new.guardian_id));
  end if;
  return null;
end $$;

create trigger staff_engagement_sync after insert or update or delete on public.student_guardians
  for each row execute function public.staff_on_student_guardian();

create or replace function public.staff_on_guardian()
returns trigger language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  for s in select sg.student_id from public.student_guardians sg where sg.guardian_id = new.id and sg.relationship = 'self' loop
    perform public.staff_sync_student_events(s, old.user_id);
    perform public.staff_sync_student_events(s, new.user_id);
  end loop;
  return null;
end $$;

create trigger staff_engagement_sync after update of user_id, deleted_at on public.guardians
  for each row execute function public.staff_on_guardian();

-- Trigger: nhân sự lớp
create or replace function public.staff_on_class_staff()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.staff_sync_class(old.user_id, old.class_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.staff_sync_class(new.user_id, new.class_id); end if;
  return null;
end $$;

create trigger staff_engagement_sync after insert or update or delete on public.class_staff
  for each row execute function public.staff_on_class_staff();

-------------------------------------------------------------------------------
-- Chủ hồ sơ: tự khai việc cũ, chứng chỉ; nhập chữ tiếng Anh (S-R3)
-------------------------------------------------------------------------------
create or replace function public.staff_text(p jsonb, k text)
returns text language sql immutable as $$ select nullif(btrim(coalesce(p ->> k, '')), '') $$;

create or replace function public.staff_save_self_engagement(p_id uuid, p_data jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  r public.staff_engagements;
  v_id uuid;
  v_changed boolean;
  v_name text := public.staff_text(p_data, 'project_name_vi');
  v_group text := coalesce(public.staff_text(p_data, 'staff_group'), 'volunteer');
  v_started date := nullif(p_data ->> 'started_on', '')::date;
  v_ended date := nullif(p_data ->> 'ended_on', '')::date;
  v_hours numeric := nullif(p_data ->> 'hours', '')::numeric;
  v_scale jsonb := coalesce(p_data -> 'scale', '{}');
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where user_id = auth.uid() and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_name is null then raise exception 'project_name_required' using errcode = '22023'; end if;
  if v_started is null then raise exception 'started_on_required' using errcode = '22023'; end if;

  if p_id is null then
    insert into public.staff_engagements (user_id, kind, project_name_vi, project_name_en, position_vi, position_en, staff_group,
                                          started_on, ended_on, hours, scale, outcome_vi, outcome_en, source, status)
    values (auth.uid(), 'project', v_name, public.staff_text(p_data, 'project_name_en'), public.staff_text(p_data, 'position_vi'),
            public.staff_text(p_data, 'position_en'), v_group, v_started, v_ended, v_hours, v_scale,
            public.staff_text(p_data, 'outcome_vi'), public.staff_text(p_data, 'outcome_en'), 'self', 'pending_review')
    returning id into v_id;
    return v_id;
  end if;

  select * into r from public.staff_engagements where id = p_id and deleted_at is null;
  -- Dòng system / manager không sửa được ở đây (S-R3), kể cả của chính mình
  if r.id is null or r.user_id <> auth.uid() or r.source <> 'self' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Sửa nội dung (ngoài chữ tiếng Anh) thì quay lại chờ duyệt
  v_changed := r.project_name_vi is distinct from v_name
            or r.position_vi is distinct from public.staff_text(p_data, 'position_vi')
            or r.staff_group is distinct from v_group
            or r.started_on is distinct from v_started or r.ended_on is distinct from v_ended
            or r.hours is distinct from v_hours or r.scale is distinct from v_scale
            or r.outcome_vi is distinct from public.staff_text(p_data, 'outcome_vi');
  update public.staff_engagements set
    project_name_vi = v_name, project_name_en = public.staff_text(p_data, 'project_name_en'),
    position_vi = public.staff_text(p_data, 'position_vi'), position_en = public.staff_text(p_data, 'position_en'),
    staff_group = v_group, started_on = v_started, ended_on = v_ended, hours = v_hours, scale = v_scale,
    outcome_vi = public.staff_text(p_data, 'outcome_vi'), outcome_en = public.staff_text(p_data, 'outcome_en'),
    status = case when v_changed then 'pending_review' else status end,
    confirmed_by = case when v_changed then null else confirmed_by end,
    confirmed_at = case when v_changed then null else confirmed_at end,
    rejected_reason = case when v_changed then null else rejected_reason end
  where id = r.id;
  return r.id;
end $$;

create or replace function public.staff_delete_self_engagement(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  update public.staff_engagements set deleted_at = now()
  where id = p_id and user_id = auth.uid() and source = 'self' and deleted_at is null;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- Chủ hồ sơ nhập chữ tiếng Anh trên mọi dòng của mình (S5 bước 1). Mỗi lần ghi audit_logs kèm lý do (S-R3)
create or replace function public.staff_set_en_text(p_entity text, p_id uuid, p_data jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform set_config('app.audit_reason', 'Chủ hồ sơ nhập chữ tiếng Anh', true);
  if p_entity = 'engagement' then
    update public.staff_engagements set
      position_en = case when p_data ? 'position_en' then public.staff_text(p_data, 'position_en') else position_en end,
      outcome_en = case when p_data ? 'outcome_en' then public.staff_text(p_data, 'outcome_en') else outcome_en end,
      project_name_en = case when p_data ? 'project_name_en' then public.staff_text(p_data, 'project_name_en') else project_name_en end
    where id = p_id and user_id = auth.uid() and deleted_at is null;
  elsif p_entity = 'credential' then
    update public.staff_credentials set
      title_en = case when p_data ? 'title_en' then public.staff_text(p_data, 'title_en') else title_en end
    where id = p_id and user_id = auth.uid() and deleted_at is null;
  else
    raise exception 'bad_entity' using errcode = '22023';
  end if;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create or replace function public.staff_save_credential(p_id uuid, p_data jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  r public.staff_credentials;
  v_id uuid;
  v_changed boolean;
  v_type text := public.staff_text(p_data, 'type');
  v_title text := public.staff_text(p_data, 'title_vi');
  v_issued date := nullif(p_data ->> 'issued_on', '')::date;
  v_expires date := nullif(p_data ->> 'expires_on', '')::date;
  v_years numeric := nullif(p_data ->> 'years', '')::numeric;
  v_file text := public.staff_text(p_data, 'file_path');
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where user_id = auth.uid() and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_type is null or v_type not in ('certificate', 'prior_experience') then raise exception 'bad_type' using errcode = '22023'; end if;
  if v_title is null then raise exception 'title_required' using errcode = '22023'; end if;
  -- File chỉ nằm trong thư mục của chính mình ở kho staff-files
  if v_file is not null and v_file not like auth.uid()::text || '/credentials/%' then
    raise exception 'bad_file_path' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.staff_credentials (user_id, type, title_vi, title_en, issuer, issued_on, expires_on, years, file_path)
    values (auth.uid(), v_type, v_title, public.staff_text(p_data, 'title_en'), public.staff_text(p_data, 'issuer'),
            v_issued, v_expires, v_years, v_file)
    returning id into v_id;
    return v_id;
  end if;

  select * into r from public.staff_credentials where id = p_id and deleted_at is null;
  if r.id is null or r.user_id <> auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_changed := r.type is distinct from v_type or r.title_vi is distinct from v_title
            or r.issuer is distinct from public.staff_text(p_data, 'issuer')
            or r.issued_on is distinct from v_issued or r.expires_on is distinct from v_expires
            or r.years is distinct from v_years or r.file_path is distinct from v_file;
  update public.staff_credentials set
    type = v_type, title_vi = v_title, title_en = public.staff_text(p_data, 'title_en'),
    issuer = public.staff_text(p_data, 'issuer'), issued_on = v_issued, expires_on = v_expires, years = v_years, file_path = v_file,
    status = case when v_changed then 'pending_review' else status end,
    reviewed_by = case when v_changed then null else reviewed_by end,
    reviewed_at = case when v_changed then null else reviewed_at end,
    rejected_reason = case when v_changed then null else rejected_reason end
  where id = r.id;
  return r.id;
end $$;

create or replace function public.staff_delete_credential(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  update public.staff_credentials set deleted_at = now() where id = p_id and user_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-------------------------------------------------------------------------------
-- S3 · Người phụ trách ghi nhận: vị trí, số giờ, kết quả, kỹ năng (S-R10). Lưu là xong, không cần duyệt
-------------------------------------------------------------------------------
create or replace function public.staff_record_engagement(p_id uuid, p_data jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  r public.staff_engagements;
  v_skills text[];
  v_bad text;
begin
  if not public.can_record_engagement(p_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.staff_engagements where id = p_id;
  perform set_config('app.audit_reason', 'Người phụ trách ghi nhận', true);

  update public.staff_engagements set
    position_vi = case when p_data ? 'position_vi' then public.staff_text(p_data, 'position_vi') else position_vi end,
    position_en = case when p_data ? 'position_en' then public.staff_text(p_data, 'position_en') else position_en end,
    hours = case when p_data ? 'hours' then nullif(p_data ->> 'hours', '')::numeric else hours end,
    outcome_vi = case when p_data ? 'outcome_vi' then public.staff_text(p_data, 'outcome_vi') else outcome_vi end,
    outcome_en = case when p_data ? 'outcome_en' then public.staff_text(p_data, 'outcome_en') else outcome_en end,
    scale = case when p_data ? 'scale' then coalesce(p_data -> 'scale', '{}') else scale end,
    confirmed_by = auth.uid(),
    confirmed_at = now()
  where id = p_id;

  if p_data ? 'skills' then
    select coalesce(array_agg(distinct t.code), '{}') into v_skills from jsonb_array_elements_text(p_data -> 'skills') as t(code);
    select t.code into v_bad from unnest(v_skills) as t(code)
    where not exists (select 1 from public.staff_skills s where s.code = t.code and s.is_active) limit 1;
    if v_bad is not null then raise exception 'bad_skill:%', v_bad using errcode = '22023'; end if;
    delete from public.staff_skill_records where engagement_id = p_id and skill_code <> all (v_skills);
    insert into public.staff_skill_records (user_id, engagement_id, skill_code, recorded_by)
    select r.user_id, p_id, t.code, auth.uid() from unnest(v_skills) as t(code)
    on conflict (engagement_id, skill_code) do nothing;
  end if;
end $$;

-- Admin bật / tắt dấu người phụ trách sự kiện cho một người (quyết định 2)
create or replace function public.admin_set_event_manager(p_event_id uuid, p_user_id uuid, p_on boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.events where id = p_event_id) then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if p_on then
    if not exists (select 1 from public.event_managers where event_id = p_event_id and user_id = p_user_id and deleted_at is null) then
      insert into public.event_managers (event_id, user_id, granted_by) values (p_event_id, p_user_id, auth.uid());
    end if;
  else
    update public.event_managers set deleted_at = now() where event_id = p_event_id and user_id = p_user_id and deleted_at is null;
  end if;
end $$;

-------------------------------------------------------------------------------
-- S4 · Hàng chờ "Hồ sơ nhân sự chờ duyệt" của admin, tách khỏi hàng chờ F12 (S-R12)
-------------------------------------------------------------------------------
create or replace function public.staff_review_queue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'engagements', coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
      select jsonb_build_object('id', e.id, 'user_id', e.user_id, 'full_name', p.full_name, 'cv_type', p.cv_type,
        'project_name_vi', e.project_name_vi, 'project_name_en', e.project_name_en, 'position_vi', e.position_vi,
        'staff_group', e.staff_group, 'started_on', e.started_on, 'ended_on', e.ended_on, 'hours', e.hours, 'scale', e.scale,
        'outcome_vi', e.outcome_vi, 'created_at', e.created_at) x
      from public.staff_engagements e join public.profiles p on p.user_id = e.user_id
      where e.source = 'self' and e.status = 'pending_review' and e.deleted_at is null limit 500) q), '[]'),
    'credentials', coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
      select jsonb_build_object('id', c.id, 'user_id', c.user_id, 'full_name', p.full_name, 'cv_type', p.cv_type,
        'type', c.type, 'title_vi', c.title_vi, 'title_en', c.title_en, 'issuer', c.issuer, 'issued_on', c.issued_on,
        'expires_on', c.expires_on, 'years', c.years, 'file_path', c.file_path, 'created_at', c.created_at) x
      from public.staff_credentials c join public.profiles p on p.user_id = c.user_id
      where c.status = 'pending_review' and c.deleted_at is null limit 500) q), '[]'));
end $$;

-- Duyệt / từ chối một mục tự khai. Từ chối bắt buộc lý do
create or replace function public.staff_review(p_entity text, p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not p_approve and v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
  perform set_config('app.audit_reason', case when p_approve then 'Duyệt hồ sơ nhân sự' else 'Từ chối: ' || v_reason end, true);
  if p_entity = 'engagement' then
    update public.staff_engagements set
      status = case when p_approve then 'approved' else 'rejected' end,
      rejected_reason = case when p_approve then null else v_reason end,
      confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_id and source = 'self' and status = 'pending_review' and deleted_at is null;
  elsif p_entity = 'credential' then
    update public.staff_credentials set
      status = case when p_approve then 'approved' else 'rejected' end,
      rejected_reason = case when p_approve then null else v_reason end,
      reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_id and status = 'pending_review' and deleted_at is null;
  else
    raise exception 'bad_entity' using errcode = '22023';
  end if;
  if not found then raise exception 'not_pending' using errcode = '22023'; end if;
end $$;

-------------------------------------------------------------------------------
-- Dữ liệu được phép in ra CV: chỉ mục approved, chưa xoá, chứng chỉ chưa hết hạn (S-R1, S-R9), kèm loại dấu (S-R2).
-- Chặng C dùng hàm này để chụp snapshot khi xuất PDF.
-------------------------------------------------------------------------------
create or replace function public.staff_cv_items(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or p_user_id = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'engagements', coalesce((select jsonb_agg(x order by x ->> 'started_on' desc nulls last) from (
      select jsonb_build_object('id', e.id, 'kind', e.kind, 'event_id', e.event_id, 'class_id', e.class_id,
        'event_name_vi', ev.name_vi, 'event_name_en', ev.name_en,
        'class_name', cl.name, 'school_name', coalesce(sc.short_name, sc.name), 'academic_year', ay.name,
        'project_name_vi', e.project_name_vi, 'project_name_en', e.project_name_en,
        'position_vi', e.position_vi, 'position_en', e.position_en, 'staff_group', e.staff_group,
        'started_on', e.started_on, 'ended_on', e.ended_on, 'hours', e.hours, 'scale', e.scale,
        'outcome_vi', e.outcome_vi, 'outcome_en', e.outcome_en, 'source', e.source,
        'badge', case when e.source in ('system', 'manager') then 'verified' else 'approved' end,
        'confirmed_by_name', case when e.source in ('system', 'manager') then cp.full_name end,
        'skills', coalesce((select jsonb_agg(sr.skill_code order by sr.skill_code) from public.staff_skill_records sr
                            where sr.engagement_id = e.id), '[]')) x
      from public.staff_engagements e
      left join public.events ev on ev.id = e.event_id
      left join public.classes cl on cl.id = e.class_id
      left join public.schools sc on sc.id = cl.school_id
      left join public.academic_years ay on ay.id = cl.academic_year_id
      left join public.profiles cp on cp.user_id = e.confirmed_by
      where e.user_id = p_user_id and e.status = 'approved' and e.deleted_at is null) q), '[]'),
    'credentials', coalesce((select jsonb_agg(x order by x ->> 'issued_on' desc nulls last) from (
      select jsonb_build_object('id', c.id, 'type', c.type, 'title_vi', c.title_vi, 'title_en', c.title_en, 'issuer', c.issuer,
        'issued_on', c.issued_on, 'expires_on', c.expires_on, 'years', c.years, 'badge', 'approved') x
      from public.staff_credentials c
      where c.user_id = p_user_id and c.status = 'approved' and c.deleted_at is null
        and (c.expires_on is null or c.expires_on >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)) q), '[]'));
end $$;

-------------------------------------------------------------------------------
-- Kho riêng tư staff-files: {user_id}/credentials/… (chủ hồ sơ tải lên), {user_id}/cv/… (máy chủ ghi PDF CV)
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-files', 'staff-files', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "staff files: chủ hồ sơ xem" on storage.objects for select to authenticated
  using (bucket_id = 'staff-files' and public.storage_first_uuid(name) = auth.uid());
create policy "staff files: chủ hồ sơ tải chứng chỉ" on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-files' and public.storage_first_uuid(name) = auth.uid()
              and split_part(name, '/', 2) = 'credentials');
create policy "staff files: chủ hồ sơ xoá chứng chỉ" on storage.objects for delete to authenticated
  using (bucket_id = 'staff-files' and public.storage_first_uuid(name) = auth.uid()
         and split_part(name, '/', 2) = 'credentials');
create policy "staff files: admin" on storage.objects for all to authenticated
  using (bucket_id = 'staff-files' and public.is_admin())
  with check (bucket_id = 'staff-files' and public.is_admin());

-------------------------------------------------------------------------------
-- Quyền gọi hàm
-------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.is_event_manager(uuid)', 'public.is_class_manager(uuid)', 'public.can_record_engagement(uuid)',
    'public.staff_save_self_engagement(uuid, jsonb)', 'public.staff_delete_self_engagement(uuid)',
    'public.staff_set_en_text(text, uuid, jsonb)', 'public.staff_save_credential(uuid, jsonb)', 'public.staff_delete_credential(uuid)',
    'public.staff_record_engagement(uuid, jsonb)', 'public.admin_set_event_manager(uuid, uuid, boolean)',
    'public.staff_review_queue()', 'public.staff_review(text, uuid, boolean, text)', 'public.staff_cv_items(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Hàm nội bộ: chỉ trigger và hàm khác gọi
  foreach f in array array[
    'public.staff_engagement_recorded(uuid)', 'public.staff_sync_event(uuid, uuid)', 'public.staff_sync_class(uuid, uuid)',
    'public.staff_self_users(uuid)', 'public.staff_sync_student_events(uuid, uuid)', 'public.guard_verify_code_unique()',
    'public.staff_on_user_roles()', 'public.staff_on_crew_assignment()', 'public.staff_on_student_guardian()',
    'public.staff_on_guardian()', 'public.staff_on_class_staff()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Sinh engagement cho dữ liệu đã có
-------------------------------------------------------------------------------
do $$
declare a record;
begin
  for a in
    select distinct ur.user_id, e.id as event_id from public.user_roles ur join public.events e on e.class_id = ur.class_id
    where ur.role = 'event_staff' and ur.deleted_at is null
    union
    select distinct u.user_id, ca.event_id from public.event_crew_assignments ca
    cross join lateral public.staff_self_users(ca.student_id) as u(user_id)
  loop
    perform public.staff_sync_event(a.user_id, a.event_id);
  end loop;
  for a in select user_id, class_id from public.class_staff loop
    perform public.staff_sync_class(a.user_id, a.class_id);
  end loop;
end $$;
