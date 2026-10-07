-- Hạn mức email/ngày của nhà cung cấp (Brevo gói miễn phí: 300) — hiện ở Admin · Tin nhắn (module sự kiện, quyết định 2)
insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('messaging.email_daily_limit', '300', 'Hạn mức email mỗi ngày của nhà cung cấp email (Brevo)', 'Email provider daily sending limit (Brevo)', false);
