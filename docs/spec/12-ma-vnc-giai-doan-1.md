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

## Còn mở

| Việc | Ghi chú |
|---|---|
| Các hàm tra cứu đang so `students.student_code` trực tiếp (giải đấu, app Handicap `whs_*`, ví điểm, tìm học viên) chưa nhận mã phụ | Mã phụ hiện chỉ có ở hồ sơ đã gộp. Chuyển các hàm này sang `vnc_student_id()` cùng lúc làm "đổi mã chính" (mục 5), trước khi có ai đổi mã |
