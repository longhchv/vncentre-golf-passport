-- Chế độ thanh toán do Edge Function tự nhận biết (có đủ khoá payOS → thật, chưa có → thử); bỏ dòng cấu hình không dùng
delete from public.app_settings where key = 'payment.mode';
