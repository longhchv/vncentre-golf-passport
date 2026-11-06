-- Spec 16: công tắc kênh gửi mã xác thực cho số điện thoại Việt Nam (anh Long chốt 06/11/2026:
-- "trước mắt mã xác thực gửi qua email, sau sẽ gửi qua số điện thoại hay Zalo").
--   'email' (mặc định) → như số nước ngoài: bắt buộc email, mã về email, SĐT lưu chưa xác minh.
--   'zalo'             → như cũ: Zalo, lỗi thì SMS (đang ở chế độ thử, D7, D8).
-- Đọc bởi Edge Function auth-otp và trang đăng ký (chưa đăng nhập) → is_public = true.
-- Đổi giá trị: Admin → Cấu hình; nhật ký qua trigger audit_row sẵn có trên app_settings.

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('auth.otp_vn_channel', '"email"',
   'Kênh gửi mã xác thực cho số điện thoại Việt Nam: "email" (dùng ngay) hoặc "zalo" (khi có Zalo ZNS)',
   'Verification code channel for Vietnamese phone numbers: "email" (now) or "zalo" (once Zalo ZNS is ready)',
   true)
on conflict do nothing;

alter table public.app_settings drop constraint if exists app_settings_otp_vn_channel_check;
alter table public.app_settings add constraint app_settings_otp_vn_channel_check
  check (key <> 'auth.otp_vn_channel' or value in ('"email"'::jsonb, '"zalo"'::jsonb));
