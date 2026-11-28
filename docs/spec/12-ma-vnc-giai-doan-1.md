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

## Mục 5–7, đợt A (28/11/2026)

Migration `20261128000002_vnc_wallet.sql`, kiểm thử `supabase/tests/068_vnc_wallet.sql`.

| Việc | Cách làm |
|---|---|
| Mã VNC của tôi (`/vnc`, lối vào từ trang Tài khoản) | Chọn hồ sơ (của tôi / các con đang quản lý) → mã chính, mã phụ, hạng, nhóm, giá niêm yết hiện tại (`vnc_my_codes`). Không có lời hứa đầu tư hay sinh lời |
| Đổi mã chính | `vnc_set_primary`: chỉ chọn trong các mã hồ sơ đã có; mã chính cũ thành mã phụ, vẫn tra cứu / quét QR được |
| Tìm số | `vnc_search`: lọc hạng / nhóm; nhập số → đúng số (kể cả số năm sinh chưa có trong sổ), số trong kho chứa dãy đã nhập, số khác đúng một chữ số; chỉ số còn trống, có hạng |
| Admin kho (`/admin/vnc`) | Bảng đếm theo trạng thái × hạng; lọc trạng thái / hạng / nhóm / số; khoá – mở (`reserved` ↔ `available`); tặng số (thành mã phụ của người nhận); bảng giá có lịch sử (`vnc_admin_set_price` đóng dòng cũ, thêm dòng mới); nhật ký `vnc_code_events` |

## Mục 5, đợt B: mua số (28/11/2026)

Migration `20261128000003_vnc_purchase.sql`, kiểm thử `supabase/tests/069_vnc_purchase.sql`.

- `/vnc` → Tìm số → **Mua**: chọn người nhận (chính mình, con đang quản lý, hoặc người khác bằng **mã VNC** — hiện tên đã che để xác nhận; không tìm theo tên để không lộ danh sách học viên) → `vnc_order_place` giữ số (`reserved`) và tạo đơn sản phẩm `vnc_code` theo giá niêm yết hiện tại, hạn `vnc.order_minutes` (30) phút → trang đơn hàng `/app/orders/<id>` thanh toán payOS như đơn cấp lại sổ.
- payOS báo đã trả (`mark_order_paid`) → trigger `vnc_orders_after_status` gắn số cho người nhận: mã phụ, `sold`, `acquired_by = 'mua'`; nhật ký `sell`; thông báo "Mã mới đã có trong mục Mã VNC của tôi".
- Đơn hết hạn / huỷ → số đẹp về kho, số năm sinh bỏ khỏi sổ. Trả tiền sau hạn mà số còn trống → vẫn gắn; số đã thuộc người khác → đơn ghi chú cần hoàn tiền (`failed`).
- Admin không mở khoá tay số đang chờ thanh toán. Không chuyển nhượng / bán lại giữa người dùng: chỉ mua từ kho.

## Hoàn tiền thì thu hồi số (anh Long chốt 28/11/2026)

Migration `20261128000005_vnc_refund_revoke.sql`, kiểm thử `supabase/tests/071_vnc_refund_revoke.sql`. Admin hoàn tiền (`refund_order`, trang Đơn hàng) đơn mua mã VNC → số rời khỏi hồ sơ người nhận; nếu đang là mã chính thì mã chính quay về mã khác của họ (ưu tiên mã cấp ban đầu); số về kho ở trạng thái **khoá**; nhật ký `revoke`; báo gia đình người nhận. Đơn `failed` (chưa gắn được số) hoàn tiền thì không có gì để thu hồi.

## Còn mở

| Việc | Ghi chú |
|---|---|
| Số bị thu hồi do hoàn tiền đang khoá trong kho | Admin tự quyết mở khoá để bán lại hay giữ (số có thể đã in trên QR của người cũ) |
| Chỗ khác trong app đọc thẳng `students.student_code` để hiển thị | Không cần sửa: `student_code` luôn là mã chính |
