-- Bước 2 · Hàm vai trò, trigger nghiệp vụ, nhật ký hệ thống.

-------------------------------------------------------------------------------
-- Hàm kiểm tra vai trò (security definer để dùng trong RLS mà không đệ quy)
-------------------------------------------------------------------------------
create or replace function public.has_role(r text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.user_id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = r and ur.deleted_at is null and p.status = 'active'
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('admin')
$$;

create or replace function public.is_head_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('head_coach')
$$;

-- Admin hoặc HLV trưởng (quyền xem toàn trung tâm, xem mục 13 của 01-du-lieu)
create or replace function public.is_center_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_head_coach()
$$;

-------------------------------------------------------------------------------
-- Hồ sơ người dùng: tự tạo khi có tài khoản Auth, đồng bộ phone/email
-------------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, phone, full_name, preferred_language)
  values (
    new.id,
    new.email,
    case when new.phone is null or new.phone = '' then null else '+' || ltrim(new.phone, '+') end,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_user_meta_data ->> 'preferred_language' = 'en' then 'en' else 'vi' end
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.handle_auth_user_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email or new.phone is distinct from old.phone then
    update public.profiles
      set email = new.email,
          phone = case when new.phone is null or new.phone = '' then null else '+' || ltrim(new.phone, '+') end
      where user_id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_updated after update on auth.users
  for each row execute function public.handle_auth_user_updated();

-- Người dùng tự sửa được tên, ngôn ngữ, ảnh; chỉ admin đổi trạng thái (khoá tài khoản)
create or replace function public.guard_profile_update()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status
       or new.user_id is distinct from old.user_id
       or new.email is distinct from old.email
       or new.phone is distinct from old.phone
       or new.org_id is distinct from old.org_id then
      raise exception 'Không có quyền sửa trường này' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-------------------------------------------------------------------------------
-- Học viên: tên chuẩn hoá, level mặc định
-------------------------------------------------------------------------------
create or replace function public.student_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  new.full_name := regexp_replace(btrim(new.full_name), '\s+', ' ', 'g');
  new.full_name_normalized := public.normalize_name(new.full_name);
  -- R4: chưa có level nào được duyệt → đang học Level 1 của core20
  if new.current_level_id is null then
    new.current_level_id := (
      select l.id from public.levels l join public.programs p on p.id = l.program_id
      where p.code = 'core20' order by l.number limit 1);
  end if;
  -- R11: activated_at chỉ ghi lần đầu
  if tg_op = 'UPDATE' and old.activated_at is not null then
    new.activated_at := old.activated_at;
  end if;
  return new;
end $$;

create trigger student_before_write before insert or update on public.students
  for each row execute function public.student_before_write();

-- R5: current_level = level cao nhất đã completed + approved (core20) + 1, không vượt level cuối
create or replace function public.recompute_student_level(p_student_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_program uuid;
  v_max_done int;
  v_last int;
  v_level uuid;
begin
  select id into v_program from public.programs where code = 'core20';
  if v_program is null then return; end if;

  select max(l.number) into v_max_done
  from public.level_records lr join public.levels l on l.id = lr.level_id
  where lr.student_id = p_student_id and l.program_id = v_program
    and lr.status = 'completed' and lr.approval_status = 'approved';

  select max(number) into v_last from public.levels where program_id = v_program;

  select id into v_level from public.levels
  where program_id = v_program and number = least(coalesce(v_max_done, 0) + 1, v_last);

  update public.students set current_level_id = v_level
  where id = p_student_id and current_level_id is distinct from v_level;
end $$;

create or replace function public.level_records_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recompute_student_level(old.student_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.student_id <> old.student_id) then
    perform public.recompute_student_level(new.student_id);
  end if;
  return null;
end $$;

create trigger level_records_after_write after insert or update or delete on public.level_records
  for each row execute function public.level_records_after_write();

-------------------------------------------------------------------------------
-- Nhật ký hệ thống (README mục 3.5): ghi tự động, không sửa/xoá được
-------------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_after jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_actor uuid := auth.uid();
begin
  -- Bỏ qua cập nhật không đổi gì ngoài updated_at
  if tg_op = 'UPDATE' and (v_before - 'updated_at') = (v_after - 'updated_at') then
    return null;
  end if;
  if v_actor is not null and not exists (select 1 from public.profiles where user_id = v_actor) then
    v_actor := null;
  end if;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
  values (
    v_actor,
    lower(tg_op),
    tg_table_name,
    coalesce((v_after ->> 'id'), (v_before ->> 'id'))::uuid,
    v_before,
    v_after,
    nullif(current_setting('app.audit_reason', true), '')
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'schools', 'academic_years', 'programs', 'levels', 'passport_stages', 'passport_tiers',
    'class_types', 'app_settings', 'products', 'certificate_templates',
    'profiles', 'user_roles', 'guardians', 'student_guardians', 'student_accounts',
    'students', 'student_merges', 'level_records', 'course_history',
    'classes', 'class_staff', 'enrollments',
    'passport_batches', 'passports', 'certificates',
    'orders', 'invoice_requests', 'consents', 'link_requests', 'support_requests'
  ] loop
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;
