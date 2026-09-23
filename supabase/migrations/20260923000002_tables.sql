-- Bước 2 · Toàn bộ bảng đợt 1 theo 01-du-lieu.md.
-- Quy ước: id UUID, created_at/updated_at, org_id (sẵn cho gói Diamond), deleted_at ở bảng quan trọng.
-- Giá trị liệt kê dùng text + check để dễ thêm giá trị ở đợt sau.
-- Mọi cột "người làm" trỏ tới profiles(user_id) để hiển thị tên được.

-------------------------------------------------------------------------------
-- 3. Tổ chức, trường, năm học
-------------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_code text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bản 1 chỉ có một tổ chức; hàm này làm giá trị mặc định cho org_id
create or replace function public.default_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.organizations order by created_at limit 1
$$;

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  name text not null,
  short_name text,
  type text not null check (type in ('public', 'private', 'international', 'center', 'club', 'other')),
  city text,
  address text,
  requires_photo_consent boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  name text not null check (name ~ '^\d{4}-\d{4}$'),
  start_date date not null,
  end_date date not null check (end_date > start_date),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create unique index academic_years_one_current on public.academic_years (org_id) where is_current;

-------------------------------------------------------------------------------
-- 4. Người dùng và vai trò
-------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  full_name text,
  -- phone/email chép từ auth.users để admin tìm kiếm; nguồn gốc vẫn là auth.users
  phone text,
  email text,
  preferred_language text not null default 'vi' check (preferred_language in ('vi', 'en')),
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  user_id uuid references public.profiles(user_id) on delete set null,
  full_name text,
  phone text check (phone is null or phone ~ '^\+[1-9]\d{6,14}$'),
  email text,
  relationship_default text check (relationship_default in ('father', 'mother', 'guardian', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index guardians_phone_idx on public.guardians (phone) where deleted_at is null;
create index guardians_email_idx on public.guardians (lower(email)) where deleted_at is null;
create unique index guardians_user_idx on public.guardians (user_id) where user_id is not null and deleted_at is null;

-------------------------------------------------------------------------------
-- 6. Chương trình, level, giai đoạn, hộ chiếu
-------------------------------------------------------------------------------
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique,
  name_vi text not null,
  name_en text not null,
  description_vi text,
  description_en text,
  is_official_level_track boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.passport_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  number int not null unique check (number between 1 and 20),
  name_vi text not null,
  name_en text not null,
  color text not null default '#F9C74F' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  level_from int not null,
  level_to int not null check (level_to >= level_from),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.passport_tiers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique,
  name_vi text not null,
  name_en text not null,
  level_from int not null,
  level_to int not null check (level_to >= level_from),
  validity_months int not null default 12 check (validity_months > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  program_id uuid not null references public.programs(id),
  number int not null check (number > 0),
  name_vi text not null,
  name_en text not null,
  group_name_vi text,
  group_name_en text,
  summary_vi text,
  summary_en text,
  -- text vì có giá trị dạng "< 5"
  target_handicap text,
  passport_stage_id uuid references public.passport_stages(id),
  passport_tier_id uuid references public.passport_tiers(id),
  -- Nội dung chi tiết (phụ lục B): { "rows": [ { "key", "label_vi", "label_en", "vi", "en" } ] }
  content_detail jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, number)
);

create table public.class_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique,
  name_vi text not null,
  name_en text not null,
  session_minutes_min int,
  session_minutes_max int,
  sessions_per_level_min int,
  sessions_per_level_max int,
  default_scoring_mode text not null check (default_scoring_mode in ('pass_fail', 'scale_1_5', 'measured')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- 5. Học viên
-------------------------------------------------------------------------------
create sequence public.student_code_seq start 1;

create or replace function public.next_student_code()
returns text language sql volatile as $$
  select 'VNC-' || lpad(nextval('public.student_code_seq')::text, 6, '0')
$$;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_code text not null unique default public.next_student_code(),
  full_name text not null check (btrim(full_name) <> ''),
  full_name_normalized text not null default '',
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other')),
  nationality text,
  current_school_id uuid references public.schools(id),
  current_grade_class text,
  avatar_url text,
  golf_goals text[] not null default '{}' check (golf_goals <@ array[
    'know_how_to_play', 'health', 'family', 'life_skills', 'local_tournaments',
    'college_scholarship', 'athlete', 'golf_industry', 'other']::text[]),
  golf_goals_other text,
  current_level_id uuid references public.levels(id),
  activated_at timestamptz,
  verification_status text not null default 'verified' check (verification_status in ('verified', 'pending_review')),
  claim_code text unique,
  claim_code_used_at timestamptz,
  merged_into_student_id uuid references public.students(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index students_name_norm_idx on public.students (full_name_normalized);
create index students_school_idx on public.students (current_school_id);

create table public.student_school_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  school_id uuid not null references public.schools(id),
  academic_year_id uuid not null references public.academic_years(id),
  grade_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, school_id, academic_year_id)
);

create table public.student_merges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  from_student_id uuid not null references public.students(id),
  to_student_id uuid not null references public.students(id),
  merged_by uuid references public.profiles(user_id) on delete set null,
  merged_at timestamptz not null default now(),
  snapshot jsonb not null,
  undone_at timestamptz,
  undone_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  guardian_id uuid not null references public.guardians(id),
  relationship text check (relationship in ('father', 'mother', 'guardian', 'other')),
  is_primary boolean not null default false,
  can_manage boolean not null default false,
  share_academic_with_coaches boolean not null default false,
  linked_via text check (linked_via in ('passport', 'claim_code', 'invite', 'class_code', 'admin', 'import')),
  status text not null default 'active' check (status in ('active', 'pending_confirmation')),
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index student_guardians_pair on public.student_guardians (student_id, guardian_id) where deleted_at is null;

-- Tài khoản học viên dùng Supabase Auth (tên đăng nhập + PIN làm mật khẩu),
-- nên không lưu pin_hash ở đây; mật khẩu do Auth băm.
create table public.student_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null unique references public.students(id),
  user_id uuid unique references public.profiles(user_id) on delete set null,
  username text not null unique check (username ~ '^[a-z0-9._]{3,32}$'),
  created_by_guardian_id uuid references public.guardians(id),
  is_active boolean not null default true,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.level_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  level_id uuid not null references public.levels(id),
  status text not null default 'completed' check (status in ('in_progress', 'completed')),
  completed_at date,
  source text not null check (source in ('legacy_import', 'school_entry', 'assessment', 'admin')),
  proposed_by uuid references public.profiles(user_id) on delete set null,
  approved_by uuid references public.profiles(user_id) on delete set null,
  approved_at timestamptz,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  note text,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index level_records_student_idx on public.level_records (student_id);

-------------------------------------------------------------------------------
-- 7. Lớp, khoá học, lịch sử
-------------------------------------------------------------------------------
create or replace function public.new_class_join_code()
returns text language plpgsql volatile set search_path = public as $$
declare c text;
begin
  loop
    c := public.random_code(6);
    exit when not exists (select 1 from public.classes where class_join_code = c);
  end loop;
  return c;
end $$;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  name text not null,
  school_id uuid references public.schools(id),
  academic_year_id uuid references public.academic_years(id),
  program_id uuid not null references public.programs(id),
  class_type_id uuid references public.class_types(id),
  target_level_id uuid references public.levels(id),
  scoring_mode text check (scoring_mode in ('pass_fail', 'scale_1_5', 'measured')),
  class_join_code text unique,
  schedule_rule jsonb,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.classes alter column class_join_code set default public.new_class_join_code();

create table public.class_staff (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  class_id uuid not null references public.classes(id),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null check (role in ('coach', 'head_coach', 'assistant', 'pe_teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, user_id)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  class_id uuid not null references public.classes(id),
  status text not null default 'active' check (status in ('active', 'completed', 'dropped')),
  joined_at date not null default current_date,
  left_at date,
  result text check (result in ('completed_program', 'completed_level', 'incomplete')),
  sessions_attended int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, class_id)
);
create index enrollments_class_idx on public.enrollments (class_id);

create table public.course_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  school_id uuid references public.schools(id),
  school_name_text text,
  grade_class text,
  academic_year_text text,
  program_id uuid references public.programs(id),
  course_name text not null,
  sessions_count int,
  level_achieved_id uuid references public.levels(id),
  source text not null check (source in ('import', 'school_entry', 'admin', 'system')),
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  submitted_by uuid references public.profiles(user_id) on delete set null,
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  rejected_reason text,
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index course_history_student_idx on public.course_history (student_id);

-- Vai trò theo phạm vi trường/lớp (khai báo sau classes vì có khoá ngoại)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null check (role in ('admin', 'head_coach', 'coach', 'assistant', 'school_manager',
                                     'pe_teacher', 'partner', 'event_staff')),
  school_id uuid references public.schools(id),
  class_id uuid references public.classes(id),
  granted_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (role <> 'school_manager' or school_id is not null)
);
create unique index user_roles_unique on public.user_roles (user_id, role, school_id, class_id)
  nulls not distinct where deleted_at is null;

-------------------------------------------------------------------------------
-- 8. Sổ Passport
-------------------------------------------------------------------------------
create table public.passport_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  name text not null,
  tier_id uuid not null references public.passport_tiers(id),
  quantity int not null check (quantity > 0 and quantity <= 5000),
  print_method text not null check (print_method in ('variable_print', 'decal')),
  created_by uuid references public.profiles(user_id) on delete set null,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.new_passport_code()
returns text language plpgsql volatile set search_path = public as $$
declare c text;
begin
  loop
    c := public.random_code(8);
    exit when not exists (select 1 from public.passports where passport_code = c)
          and not exists (select 1 from public.students where claim_code = c);
  end loop;
  return c;
end $$;

create table public.passports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  passport_code text not null unique default public.new_passport_code(),
  batch_id uuid references public.passport_batches(id),
  tier_id uuid not null references public.passport_tiers(id),
  student_id uuid references public.students(id),
  status text not null default 'unassigned'
    check (status in ('unassigned', 'assigned', 'active', 'lost', 'void', 'retired')),
  issued_at timestamptz,
  expires_at timestamptz,
  activated_at timestamptz,
  activated_by_guardian_id uuid references public.guardians(id),
  replaced_passport_id uuid references public.passports(id),
  void_reason text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'unassigned' or status = 'void' or student_id is not null)
);
-- R2: mỗi học viên chỉ một sổ active
create unique index passports_one_active on public.passports (student_id) where status = 'active';
create index passports_student_idx on public.passports (student_id);

-- claim_code: 8 ký tự, không trùng với mã sổ để trang /activate nhận ra được loại mã
create or replace function public.new_claim_code()
returns text language plpgsql volatile set search_path = public as $$
declare c text;
begin
  loop
    c := public.random_code(8);
    exit when not exists (select 1 from public.students where claim_code = c)
          and not exists (select 1 from public.passports where passport_code = c);
  end loop;
  return c;
end $$;
alter table public.students alter column claim_code set default public.new_claim_code();

-------------------------------------------------------------------------------
-- 9. Chứng nhận
-------------------------------------------------------------------------------
create table public.certificate_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique,
  name_vi text not null,
  name_en text not null,
  type text not null check (type in ('summer_camp', 'course_completion', 'level_completion', 'tournament')),
  background_image_url text,
  layout jsonb,
  language text not null default 'en' check (language in ('en', 'vi', 'bilingual')),
  signer_name text,
  signer_title text,
  signature_image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.new_verify_code()
returns text language plpgsql volatile set search_path = public as $$
declare c text;
begin
  loop
    c := public.random_code(10);
    exit when not exists (select 1 from public.certificates where verify_code = c);
  end loop;
  return c;
end $$;

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  verify_code text unique,
  student_id uuid not null references public.students(id),
  template_id uuid not null references public.certificate_templates(id),
  type text not null check (type in ('summer_camp', 'course_completion', 'level_completion', 'tournament')),
  title_vi text,
  title_en text,
  language text not null default 'en' check (language in ('en', 'vi', 'bilingual')),
  -- R9: snapshot, không đổi khi hồ sơ học viên đổi
  data jsonb not null,
  issued_at date not null default current_date,
  issued_by uuid references public.profiles(user_id) on delete set null,
  class_id uuid references public.classes(id),
  level_record_id uuid references public.level_records(id),
  status text not null default 'valid' check (status in ('valid', 'revoked')),
  revoked_reason text,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(user_id) on delete set null,
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'valid' or revoked_reason is not null)
);
alter table public.certificates alter column verify_code set default public.new_verify_code();
alter table public.certificates alter column verify_code set not null;
create index certificates_student_idx on public.certificates (student_id);

-------------------------------------------------------------------------------
-- 10. Nhập dữ liệu, thông báo, đồng ý, nhật ký, cấu hình
-------------------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  type text not null check (type in ('student_list', 'course_history')),
  file_name text,
  school_id uuid references public.schools(id),
  academic_year_id uuid references public.academic_years(id),
  class_id uuid references public.classes(id),
  program_id uuid references public.programs(id),
  status text not null default 'uploaded' check (status in ('uploaded', 'validated', 'committed', 'cancelled')),
  totals jsonb,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.course_history
  add constraint course_history_import_batch_fk foreign key (import_batch_id) references public.import_batches(id);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number int not null,
  raw jsonb not null,
  normalized jsonb,
  status text not null check (status in ('ok', 'warning', 'error', 'duplicate_suspect')),
  messages jsonb not null default '[]',
  matched_student_id uuid references public.students(id),
  -- Admin chọn cho dòng nghi trùng: 'use_existing' | 'create_new' | 'skip'
  decision text check (decision in ('use_existing', 'create_new', 'skip')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  guardian_id uuid references public.guardians(id),
  student_id uuid not null references public.students(id),
  channel text not null check (channel in ('zalo', 'sms', 'email')),
  target text not null,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  purpose text not null default 'activation' check (purpose in ('activation', 'second_guardian')),
  relationship text check (relationship in ('father', 'mother', 'guardian', 'other')),
  invited_by uuid references public.profiles(user_id) on delete set null,
  sent_at timestamptz,
  opened_at timestamptz,
  used_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'used', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.link_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  requester_user_id uuid not null references public.profiles(user_id) on delete cascade,
  student_id uuid references public.students(id),
  class_id uuid references public.classes(id),
  submitted_child_name text not null,
  submitted_dob date,
  submitted_school text,
  submitted_grade_class text,
  method text not null check (method in ('class_code', 'manual_review')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.otp_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  target text not null,
  channel text not null check (channel in ('zalo', 'sms', 'email')),
  purpose text not null check (purpose in ('signup', 'reset_password', 'activation', 'invite', 'verify_email')),
  status text not null default 'sent' check (status in ('sent', 'failed', 'verified', 'expired', 'locked')),
  provider_message_id text,
  cost_vnd int not null default 0,
  ip inet,
  code_hash text,
  attempts int not null default 0,
  expires_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index otp_logs_target_idx on public.otp_logs (target, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  type text not null,
  title_vi text not null,
  title_en text not null,
  body_vi text,
  body_en text,
  link text,
  channels_sent jsonb not null default '[]',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  guardian_id uuid not null references public.guardians(id),
  student_id uuid references public.students(id),
  type text not null check (type in ('terms', 'privacy', 'leaderboard_name', 'photo')),
  version text not null,
  granted boolean not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Yêu cầu gửi vào hàng chờ admin (bổ sung, xem phụ lục D):
-- "Con đã từng học golf?" (F8), "Yêu cầu xoá dữ liệu" (F18)
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  type text not null check (type in ('history_update', 'data_deletion', 'other')),
  student_id uuid references public.students(id),
  requester_user_id uuid references public.profiles(user_id) on delete set null,
  body text,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'rejected')),
  handled_by uuid references public.profiles(user_id) on delete set null,
  handled_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  actor_user_id uuid references public.profiles(user_id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  ip inet,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  key text not null,
  value jsonb not null,
  description_vi text,
  description_en text,
  -- Được phép đọc công khai (ví dụ tuổi tối thiểu tài khoản học viên)
  is_public boolean not null default false,
  updated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

-------------------------------------------------------------------------------
-- 11. Thanh toán (đợt 1: phí cấp lại sổ)
-------------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique,
  name_vi text not null,
  name_en text not null,
  price_vnd bigint not null check (price_vnd >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.order_code_seq start 100001 maxvalue 999999999999999;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  order_code bigint not null unique default nextval('public.order_code_seq'),
  payer_user_id uuid references public.profiles(user_id) on delete set null,
  student_id uuid references public.students(id),
  product_id uuid not null references public.products(id),
  -- ví dụ sổ bị báo mất dẫn tới đơn này
  related_passport_id uuid references public.passports(id),
  amount_vnd bigint not null check (amount_vnd >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'expired', 'refunded')),
  payment_provider text not null default 'payos' check (payment_provider in ('payos')),
  provider_ref text,
  checkout_url text,
  qr_code text,
  paid_at timestamptz,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  order_id uuid references public.orders(id),
  provider text not null,
  payload jsonb not null,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  order_id uuid not null unique references public.orders(id),
  buyer_type text not null check (buyer_type in ('individual', 'company')),
  buyer_name text not null,
  tax_code text,
  address text,
  email text,
  status text not null default 'requested' check (status in ('requested', 'issued')),
  issued_invoice_no text,
  issued_by uuid references public.profiles(user_id) on delete set null,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- Trigger updated_at cho mọi bảng có cột này
-------------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
