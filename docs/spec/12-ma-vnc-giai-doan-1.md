# 12 · Mã VNC — giai đoạn 1: khoá số đẹp

Bản 1 · 27/11/2026 · Theo `12-ma-vnc-so-dep-dang-nhap.md` mục 1–4.

## Hiện trạng trước giai đoạn 1 (đọc từ migration trên `main`)

| Mục | Hiện trạng |
|---|---|
| Nơi lưu | `public.students.student_code` (text, unique). Mọi người — học viên, phụ huynh/người lớn có hồ sơ golfer, nhân sự, BTC — đều là một dòng `students` |
| Định dạng | `'VNC-'` + 6 chữ số, ví dụ `VNC-002279` |
| Cách sinh | Giá trị mặc định `next_student_code()` = `'VNC-' \|\| lpad(nextval('student_code_seq'), 6, '0')`: **tuần tự từ 000001**, gồm cả số đẹp |
| Nơi dùng | Tra cứu, QR, nhập điểm giải, app Handicap (`whs_*`), ví điểm, hồ sơ nhân sự… so sánh trực tiếp với `students.student_code` |

## Giai đoạn 1 làm gì (migration `20261127000080_vnc_codes.sql`)

- Bảng `vnc_codes` (sổ mọi mã, `owner_id` = `students.id`) và `vnc_price_table` (bảng giá có hiệu lực theo ngày).
- `classify_vnc(code)` → `{code, categories, tier}`; các hàm con `vnc_categories`, `vnc_tier_of`.
- Mã đã cấp → `vnc_codes` (assigned, mã chính, giữ chủ). Hồ sơ đã gộp → mã phụ (`retired_alias`) của hồ sơ đích. Đếm số đẹp đã cấp trong NOTICE của migration.
- Kho số đẹp: mọi số hạng Đồng trở lên trong 000000–999999 chưa cấp → `available` (năm sinh không khoá).
- `next_student_code()` mới: ngẫu nhiên trong dải đang mở (`app_settings` `vnc.open_prefixes`, hiện `["0"]`), bỏ mã đã có và mã từ Đồng trở lên, tối đa 20 lần rồi báo lỗi `vnc_code_exhausted`.
- Trigger: ghi mã vào sổ khi tạo hồ sơ; chặn đổi tay `student_code`; gộp / hoàn tác gộp chuyển mã theo.
- `vnc_student_id(code)`: tra bằng mã bất kỳ của một người → hồ sơ đang dùng. `admin_vnc_lookup(code)` cho trang admin.

`students.student_code` vẫn là mã chính để hiển thị: không đổi mã của ai, mọi chỗ đang dùng `student_code` vẫn chạy.

## Kiểm thử

`supabase/tests/065_vnc_codes.sql`: từng nhóm số đẹp, nhiều nhóm, năm sinh (tương lai, 31/02, 29/02), tạo 1.000 hồ sơ mới (đúng dải 0, không trúng số đẹp, đúng một mã chính), tra bằng mã của hồ sơ đã gộp, hoàn tác gộp, không đổi tay mã, không cấp lại mã có chủ.

## Tra cứu bằng mã phụ (bổ sung 28/11/2026)

Migration `20261128000001_vnc_alias_lookup.sql`: hàm `vnc_same_person(mã trên hồ sơ, mã nhập vào)` — khớp như cũ (cùng mã) hoặc mã nhập vào (đủ 6 chữ số) là mã phụ của chính người giữ mã chính đó. 15 hàm chuyển sang so bằng hàm này (chép nguyên bản mới nhất, chỉ thay phép so mã):

- Tra đúng một mã: `league_lookup`, `league_save_stage` (nhập điểm giải), `league_staff_history`, `reward_import_match`, `whs_lookup`, `whs_lookup_plus`, `whs_find_marker`, `whs_find_peer`, `whs_bulk_import`, `whs_sim_ingest` (app Handicap).
- Tìm kiếm: `admin_search_students`, `admin_students_page`, `admin_certificates`, `league_staff_search`, `reward_find_students`.

Kiểm thử `supabase/tests/067_vnc_alias_lookup.sql`. Toàn bộ kiểm thử SQL: 62/69 đạt, 7 còn lại cần dữ liệu staging (hỏng giống hệt trước khi có mã VNC).

## Còn mở

| Việc | Ghi chú |
|---|---|
| Đổi mã chính, mua / tặng số, trang "Mã VNC của tôi", trang admin kho số (spec 12 mục 5–7) | Chưa làm — chờ anh Long chốt thứ tự |
| Chỗ khác trong app đọc thẳng `students.student_code` để hiển thị | Không cần sửa: `student_code` luôn là mã chính |
