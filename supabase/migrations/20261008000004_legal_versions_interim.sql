-- Điều khoản / Chính sách bản tạm (D46) — trùng LEGAL_VERSION trong src/pages/legalContent.ts.
-- Người ghi tên sự kiện và phụ huynh đồng ý từ nay ghi theo phiên bản này.
update public.app_settings set value = '{"terms": "tam-2026-10-08", "privacy": "tam-2026-10-08"}' where key = 'legal.versions';
