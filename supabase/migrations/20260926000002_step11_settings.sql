-- Bước 11 · cấu hình: giới hạn lời mời người giám hộ thứ hai (F6)
insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('invitation.max_second_guardian_per_day', '5', 'Số lời mời người giám hộ thứ hai tối đa mỗi học viên mỗi ngày', 'Max second-guardian invitations per student per day', false)
on conflict do nothing;

-- Edge Function kiểm tra quyền mời bằng quyền của phụ huynh gọi
grant execute on function public.can_manage_student(uuid) to authenticated;
