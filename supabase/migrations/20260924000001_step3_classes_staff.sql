-- Bước 3 · Lớp, học viên, người dùng; quyền HLV.
-- Nguyên tắc R8: HLV / quản lý trường KHÔNG đọc trực tiếp bảng students, guardians, student_guardians.
-- Họ chỉ nhận dữ liệu qua các hàm dưới đây, vốn chỉ trả đúng các cột được phép
-- (không SĐT/email phụ huynh, không mã kích hoạt bí mật).

-------------------------------------------------------------------------------
-- Hàm kiểm tra phạm vi
-------------------------------------------------------------------------------
create or replace function public.is_class_staff(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_staff cs
    join public.profiles p on p.user_id = cs.user_id
    where cs.class_id = p_class_id and cs.user_id = auth.uid() and p.status = 'active'
  )
$$;

create or replace function public.is_school_manager_of(p_school_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.user_id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = 'school_manager' and ur.school_id = p_school_id
      and ur.deleted_at is null and p.status = 'active'
  )
$$;

-- Được xem danh sách lớp: admin/HLV trưởng, nhân sự của lớp, quản lý trường của lớp
create or replace function public.can_view_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_center_staff()
      or public.is_class_staff(p_class_id)
      or exists (select 1 from public.classes c where c.id = p_class_id and public.is_school_manager_of(c.school_id))
$$;

-------------------------------------------------------------------------------
-- RLS cho HLV: chỉ thấy lớp mình và nhân sự/ghi danh của lớp đó
-------------------------------------------------------------------------------
create policy class_staff_read on public.classes for select to authenticated
  using (deleted_at is null and public.is_class_staff(id));

create policy class_staff_read on public.class_staff for select to authenticated
  using (user_id = auth.uid() or public.is_class_staff(class_id));

create policy class_staff_read on public.enrollments for select to authenticated
  using (public.is_class_staff(class_id));

-- Đồng nghiệp cùng lớp xem được tên nhau (không lộ gì thêm ngoài bảng profiles)
create policy class_colleague_read on public.profiles for select to authenticated
  using (exists (
    select 1 from public.class_staff mine join public.class_staff other on other.class_id = mine.class_id
    where mine.user_id = auth.uid() and other.user_id = profiles.user_id));

-------------------------------------------------------------------------------
-- Danh sách học viên của lớp (02 mục 3.4): tên, ngày sinh, level, trạng thái kích hoạt của phụ huynh
-------------------------------------------------------------------------------
create or replace function public.class_roster(p_class_id uuid)
returns table (
  student_id uuid,
  student_code text,
  full_name text,
  date_of_birth date,
  gender text,
  current_grade_class text,
  level_number int,
  level_name_vi text,
  level_name_en text,
  verification_status text,
  guardian_activated boolean,
  enrollment_status text,
  joined_at date
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_class(p_class_id) then
    raise exception 'Không có quyền xem lớp này' using errcode = '42501';
  end if;
  return query
  select s.id, s.student_code, s.full_name, s.date_of_birth, s.gender, s.current_grade_class,
         l.number, l.name_vi, l.name_en, s.verification_status,
         exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                 where sg.student_id = s.id and sg.deleted_at is null and sg.status = 'active' and g.user_id is not null),
         e.status, e.joined_at
  from public.enrollments e
  join public.students s on s.id = e.student_id and s.deleted_at is null and s.merged_into_student_id is null
  left join public.levels l on l.id = s.current_level_id
  where e.class_id = p_class_id
    -- nhân sự lớp chỉ thấy học viên đang học (01 mục 13); admin thấy cả người đã rời lớp
    and (e.status = 'active' or public.is_center_staff())
  order by s.full_name_normalized;
end $$;

-- HLV xem và đổi mã lớp (F14)
create or replace function public.regenerate_class_code(p_class_id uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_code text;
begin
  if not (public.is_admin() or exists (
      select 1 from public.class_staff cs where cs.class_id = p_class_id and cs.user_id = auth.uid()
        and cs.role in ('coach', 'head_coach'))) then
    raise exception 'Không có quyền đổi mã lớp' using errcode = '42501';
  end if;
  v_code := public.new_class_join_code();
  update public.classes set class_join_code = v_code where id = p_class_id;
  return v_code;
end $$;

-------------------------------------------------------------------------------
-- Tìm học viên cho admin / HLV trưởng: theo tên, mã học viên, trường, SĐT phụ huynh (F16)
-------------------------------------------------------------------------------
create or replace function public.admin_search_students(
  p_query text default null,
  p_school_id uuid default null,
  p_limit int default 50
)
returns table (
  id uuid,
  student_code text,
  full_name text,
  date_of_birth date,
  gender text,
  current_school_id uuid,
  school_name text,
  current_grade_class text,
  level_number int,
  verification_status text,
  guardian_count int,
  activated boolean
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  q text := nullif(btrim(coalesce(p_query, '')), '');
  q_norm text := public.normalize_name(q);
  q_digits text := regexp_replace(coalesce(q, ''), '\D', '', 'g');
  q_phone text;
begin
  if not public.is_center_staff() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  -- 0912… → +84912…; 84912… → +84912…
  q_phone := case
    when q_digits ~ '^0\d{8,10}$' then '+84' || substr(q_digits, 2)
    when length(q_digits) >= 8 then '+' || q_digits
    else null end;

  return query
  select s.id, s.student_code, s.full_name, s.date_of_birth, s.gender, s.current_school_id,
         coalesce(sc.short_name, sc.name), s.current_grade_class, l.number, s.verification_status,
         (select count(*)::int from public.student_guardians sg where sg.student_id = s.id and sg.deleted_at is null),
         s.activated_at is not null
  from public.students s
  left join public.schools sc on sc.id = s.current_school_id
  left join public.levels l on l.id = s.current_level_id
  where s.deleted_at is null and s.merged_into_student_id is null
    and (p_school_id is null or s.current_school_id = p_school_id)
    and (q is null
         or s.full_name_normalized like '%' || q_norm || '%'
         or upper(replace(s.student_code, '-', '')) like '%' || upper(replace(q, '-', '')) || '%'
         or (q_phone is not null and exists (
               select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
               where sg.student_id = s.id and sg.deleted_at is null and g.phone like q_phone || '%')))
  order by s.full_name_normalized
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
end $$;

-------------------------------------------------------------------------------
-- Danh sách tài khoản cho trang "Người dùng và vai trò" (admin)
-------------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  phone text,
  full_name text,
  status text,
  confirmed boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  roles jsonb
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  return query
  select p.user_id, p.email, p.phone, p.full_name, p.status,
         (u.email_confirmed_at is not null or u.phone_confirmed_at is not null),
         u.last_sign_in_at, p.created_at,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', r.id, 'role', r.role, 'school_id', r.school_id, 'class_id', r.class_id)
                   order by r.created_at)
                   from public.user_roles r where r.user_id = p.user_id and r.deleted_at is null), '[]'::jsonb)
  from public.profiles p
  join auth.users u on u.id = p.user_id
  order by p.created_at desc;
end $$;

-- Chỉ người đã đăng nhập được gọi (bên trong hàm còn kiểm tra quyền chi tiết)
do $$
declare f text;
begin
  foreach f in array array[
    'public.class_roster(uuid)', 'public.regenerate_class_code(uuid)',
    'public.admin_search_students(text, uuid, int)', 'public.admin_list_users()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
