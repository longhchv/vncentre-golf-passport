# 29 · Sân tập & phòng 3D — GĐ1: khung dữ liệu chi tiết, phiếu khảo sát, trang chủ sân

Bản 1 · 24/11/2026 · Người làm: Minh · Anh Long giao 24/11/2026 (3 giai đoạn, xong mỗi giai đoạn dừng chờ duyệt). Đọc kèm spec 25–28.

## Trường mới trên `practice_venues`

| Cột | Kiểu | Nội dung |
|---|---|---|
| `highlight_vi`, `highlight_en` | text ≤ 160 | Điểm mạnh nhất, một câu |
| `sim_rates` | jsonb[] ≤ 20 | Giá theo loại máy: `{brand, model, bays, unit: hour_room|hour_person|round|other, weekday, weekend, note}` — giá là số đồng |
| `range_rates` | jsonb[] ≤ 30 | Giá sân tập: `{kind: balls|hour|unlimited|month|lesson|other, label, balls, weekday, weekend, note}` |
| `club_rental` | jsonb | `{available, price, note}` |
| `promos` | jsonb[] ≤ 10 | `{title, detail, until, url}` |
| `academy` | jsonb | `{has, name, note}` |
| `coaches` | jsonb[] ≤ 30 | `{name, title, src}` — `src` (link nơi tên đã công khai) bắt buộc, chặn ở cơ sở dữ liệu |
| `busy` | jsonb | `{quiet: [slot], busy: [slot], note}`; slot: early 5–8, morning 8–11, noon 11–14, afternoon 14–17, evening 17–20, late 20+ |
| `kids` | jsonb | `{junior_clubs, junior_class, min_age, note}` |
| `shop` | jsonb | `{apparel, accessories, clubs, fitting, note}` |
| `facilities` | jsonb | `{waiting_area, vip_room, surface: mat|grass|both, covered, note}` |
| `languages` | text[] | en, ko, ja, zh |
| `fit_tags` | text[] | noon (tranh thủ trưa), early (sáng sớm vắng), after_work (tối sau giờ làm), kids_mall (con tập, bố mẹ đi siêu thị), group (đi nhóm tiếp khách), foreigners (khách nước ngoài) |
| `info_sources` | jsonb | Nội bộ: nguồn từng trường `{trường: {src, url, at}}` — GĐ3 điền |
| `needs_survey` | text[] | Nội bộ: trường còn thiếu, cần khảo sát / gọi hỏi |

Có/Không/Chưa rõ: khoá vắng mặt = chưa rõ.

## Luật

- Trigger `pv_validate_details` kiểm tra mọi đường ghi (admin, khảo sát, chủ sân, đề xuất): kiểu, giới hạn số dòng, giá 0–100 triệu, slot, nhãn, ngôn ngữ, link nguồn HLV.
- `pv_edit_fields()` (đề xuất + khảo sát) và `pv_owner_fields()` (chủ sân) thêm 14 trường chi tiết; `info_sources`, `needs_survey` chỉ admin sửa.
- `pv_apply_patch`, `pv_restore` cập nhật cột mới; khôi phục bản lịch sử cũ (chưa có cột mới) giữ nguyên giá trị hiện tại của cột mới.
- `pv_public_venues`: giữ nguyên tên, thứ tự và mọi cột cũ (region, type, status… trang chủ vncentre.net đang đọc); 14 cột mới nối vào cuối; không có `info_sources`, `needs_survey`.

## Giao diện

- Bộ nhập dùng chung `src/features/venues/details.tsx` (10 nhóm gập/mở, nhóm phù hợp loại địa điểm mở sẵn; giá gõ "450k", "450.000", "1,2tr").
- Admin: tab "Chi tiết" trong `/admin/venues/:id`, kèm nhóm "Nội bộ" (Cần khảo sát).
- Khảo sát viên: mục "Thông tin chi tiết" trong phiếu; chỉ phần khác dữ liệu hiện có được gửi; admin duyệt từng trường như cũ (hàng chờ hiển thị gọn: giá, nhãn, Có/Không).
- Chủ sân: mục "Chi tiết" ở `/partner/venues`, lưu là hiện ngay.
- tapgolf.vncentre.net chưa hiển thị (GĐ2).

## Kiểm thử

Postgres 16: migration chạy 2 lần; ghi đủ 14 trường; chặn HLV không có link, nhãn lạ, giá âm, slot lạ; khảo sát gửi chi tiết → admin duyệt 2/3 trường; chủ sân sửa shop, không sửa được tên và `needs_survey`; khôi phục bản cũ giữ cột mới; view công khai giữ cột đầu id, region, name, type. App: tsc, 139 test, vite build; chạy thử admin, khảo sát, chủ sân với Supabase giả lập.
