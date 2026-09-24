-- Nền chứng nhận dùng JPEG: máy chủ nhúng thẳng vào PDF, không phải giải nén ảnh PNG 3500×2475
-- (gói Free giới hạn CPU của Edge Function).
update public.certificate_templates set background_image_url = 'templates/default/background.jpg'
where background_image_url = 'templates/default/background.png';
