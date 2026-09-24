-- Sửa quy tắc tải ảnh học viên: câu kiểm tra chạy với quyền của phụ huynh nên không đọc được
-- bảng student_guardians (phụ huynh không có quyền đọc trực tiếp) → luôn bị chặn.
-- Dùng hàm security definer kiểm tra "người giám hộ có quyền quản lý".

create or replace function public.can_manage_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student_id and g.user_id = auth.uid()
      and sg.status = 'active' and sg.can_manage and sg.deleted_at is null and g.deleted_at is null)
$$;

drop policy if exists "student photos: phụ huynh tải lên" on storage.objects;
create policy "student photos: phụ huynh tải lên" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and public.can_manage_student(public.storage_student_id(name)));
