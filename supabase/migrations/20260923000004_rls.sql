-- Bước 2 · Phân quyền theo dòng (README mục 3.4): mặc định từ chối mọi bảng.
-- Bước này mở quyền cho: dữ liệu cấu hình công khai, admin, HLV trưởng (xem), người dùng với dữ liệu của chính mình.
-- Quyền HLV / quản lý trường / phụ huynh / học viên sẽ thêm ở các bước sau, đúng mục 13 của 01-du-lieu.

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    -- Không dùng FORCE: các hàm security definer (chủ sở hữu postgres) cần đọc bảng vai trò
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Nhật ký: không ai sửa/xoá qua API (chỉ trigger security definer ghi vào)
revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;

-------------------------------------------------------------------------------
-- Admin: toàn quyền mọi bảng, trừ nhật ký chỉ được xem
-------------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'audit_logs' loop
    execute format('create policy admin_all on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

create policy admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-------------------------------------------------------------------------------
-- Cấu hình công khai: trang lộ trình, danh sách trường (luồng tự khai), giá sản phẩm
-------------------------------------------------------------------------------
create policy public_read on public.organizations for select to anon, authenticated using (true);
create policy public_read on public.schools for select to anon, authenticated
  using (deleted_at is null and is_active);
create policy public_read on public.academic_years for select to anon, authenticated using (true);
create policy public_read on public.programs for select to anon, authenticated using (is_active);
create policy public_read on public.levels for select to anon, authenticated using (true);
create policy public_read on public.passport_stages for select to anon, authenticated using (true);
create policy public_read on public.passport_tiers for select to anon, authenticated using (true);
create policy public_read on public.class_types for select to anon, authenticated using (true);
create policy public_read on public.products for select to anon, authenticated using (is_active);
create policy public_read on public.app_settings for select to anon, authenticated using (is_public);

-------------------------------------------------------------------------------
-- Người dùng với dữ liệu của chính mình
-------------------------------------------------------------------------------
create policy own_read on public.profiles for select to authenticated using (user_id = auth.uid());
-- Cột bị khoá (status, email…) do trigger guard_profile_update chặn
create policy own_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy own_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-------------------------------------------------------------------------------
-- HLV trưởng: xem toàn trung tâm (phạm vi đã chốt ở kế hoạch, mục C13)
-------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'students', 'student_school_history', 'guardians', 'student_guardians',
    'level_records', 'course_history', 'classes', 'class_staff', 'enrollments',
    'passport_batches', 'passports', 'certificate_templates', 'certificates',
    'link_requests', 'support_requests', 'import_batches', 'import_rows'
  ] loop
    execute format('create policy head_coach_read on public.%I for select to authenticated
                    using (public.is_head_coach())', t);
  end loop;
end $$;
