# 11 · Bản đồ dữ liệu: module Nhân sự sự kiện

Bản nháp 09/10/2026 · đọc từ staging `zrfipnqkjrhzrscaaeth` · chờ anh Long xác nhận trước khi viết migration.
Phạm vi tối 9/10: 20 ô vai, 70 việc mẫu, phân công người vào ô, checklist Xong / Vướng, vai A xem tổng. Không làm: in decal, bảng điều phối đầy đủ, nút chức năng theo vai, đóng sự kiện.

## 1. Dùng lại (không đổi cấu trúc)

| Khái niệm trong spec 11 | Bảng / hàm đang có | Cột dùng |
| --- | --- | --- |
| Sự kiện | `events` | `id`, `name_vi`, `event_date`, `status`. Lễ phát động 10/10 là `f278831a-c502-40ca-83b1-4ecbbfb558e4` |
| Hồ sơ người | `students` | `id`, `full_name`, `student_code` (mã học viên `VNC-…`, cố định), `verification_status` |
| Mã Golf Passport (in trên QR, `/p/<mã>`) | `passports` | `passport_code` (8 ký tự), `student_id`, `tier_id`, `status` |
| Sinh mã | hàm `new_passport_code()`, `next_student_code()` | cơ chế đang dùng cho sổ và thẻ sự kiện |
| Hạng sổ | `passport_tiers` | đang có `first`, `player`, `elite` (tính vào "một sổ hiệu lực"), `event_experience` (không tính) |
| Người lớn tự là "người chơi" | `guardians` + `student_guardians` với `relationship = 'self'` | cách module 10 đang làm cho người lớn "Tôi chơi" |
| Phụ huynh – con | `guardians` (`phone`, `email`, `user_id`) + `student_guardians` (`relationship` father/mother/guardian/other) | dùng cho Đại sứ là trẻ em |
| Tài khoản đăng nhập | `auth.users` + `profiles` (`email`, `phone`) | tìm người đã có tài khoản (vd. HLV đang có tài khoản nhân viên) |
| Quyền admin, nhật ký | `is_admin()`, trigger `audit_row`, `set_updated_at` | gắn vào mọi bảng mới |

## 2. Thêm mới (migration chỉ thêm)

| Bảng mới | Cột chính | Nguồn seed |
| --- | --- | --- |
| `event_crew_slots` (ô vai, mẫu dùng lại) | `role_code` (A, B, C, D, E, F, G, K), `role_name_vi`, `slot_code` (A, B, C1…C4, D1…D5, E1…E3, F1, F2, G1…G3, K1; duy nhất), `default_position`, `badge_color`, `badge_label`, `note`, `sort_order` | `data/vai_tro.csv` → 20 dòng |
| `event_crew_task_templates` (việc mẫu) | `role_code`, `sort_order`, `phase_no` (1–6), `phase_label`, `time_label` (chữ, vd. "16h00–17h45", "Liên tục"), `area`, `task_text`; duy nhất (`role_code`, `sort_order`) | `data/nhiem_vu_mau.csv` → 70 dòng |
| `event_crew_assignments` (phân công) | `event_id` → `events`, `student_id` → `students`, `passport_id` → `passports` (mã in thẻ), `slot_id` → `event_crew_slots`, `position`, `badge_status` (`not_printed` / `printed` / `received`), `created_by`; duy nhất (`event_id`, `slot_id`) | nhập từ màn admin (bước 3) |
| `event_crew_tasks` (việc của người) | `assignment_id`, `template_id` (null nếu BTC thêm riêng), bản sao `phase_no`, `phase_label`, `time_label`, `area`, `task_text`, `sort_order`; `status` (`open` / `done` / `blocked`), `note` (bắt buộc khi `blocked`), `status_by`, `status_at` | sinh tự động khi phân công: ô thuộc vai nào nhận toàn bộ việc mẫu của vai đó (vd. C1…C4 mỗi ô 12 việc) |

| `event_crew_supplies` (thùng đồ mẫu) | `box`, `item`, `quantity` (trống được), `role_code` chuẩn bị, `sort_order` | `data/thung_do.csv` → 26 dòng |

Việc được **chép** từ mẫu vào từng người, nên sửa giờ / thêm việc cho một sự kiện không làm đổi mẫu.

Hàm (SECURITY DEFINER), làm ở bước 3–4:
- `crew_import(event, rows)`: tìm hoặc tạo hồ sơ + sổ, gán ô, sinh việc. Trùng nghi vấn (cùng tên, khác số) trả về danh sách chờ, không tự gộp.
- `crew_today(code)`: checklist "Hôm nay" của mã `/p/<mã>` trong sự kiện 10/10.
- `crew_set_task(task, status, note)`: Xong / Vướng (Vướng thiếu lý do thì báo lỗi).
- `crew_summary(event)`: số Xong / Vướng / còn lại theo từng ô, cho vai A và admin.

Quyền (RLS): bảng mới chỉ admin đọc/ghi trực tiếp; người làm việc đi qua các hàm trên. Vai A (ô `A` trong sự kiện) xem tổng toàn sự kiện.

Để sau: rút kinh nghiệm, lịch sử tham gia.

## 3. Cần anh xác nhận (chưa tự quyết)

1. ~~Mã nào là "mã Golf Passport"?~~ **Đã chốt 09/10/2026:** mã trọn đời của nhân sự là `students.student_code` (`VNC-…`), cấp giống học viên. Nhân sự cũng được gán một sổ (`passports.passport_code`) giống học viên; QR thẻ đeo là `https://app.vncentre.net/p/<passport_code>`. Khi đổi sổ (nâng hạng, báo mất) thì mã `VNC-…` giữ nguyên, thẻ đeo in lại theo mã sổ mới.
2. ~~Sổ của nhân sự thuộc hạng nào?~~ **Đã chốt 09/10/2026:** thêm một dòng hạng `staff` "Thẻ nhân sự" / "Staff card" vào `passport_tiers` (chỉ thêm dữ liệu, `counts_toward_single_active = false`, không gắn level), để không chiếm chỗ "một sổ hiệu lực" nếu người đó sau này đi học.
3. ~~Ghép người đã có~~ **Đã chốt 09/10/2026:** tìm theo SĐT hoặc email trong `guardians` và `profiles`. Người đã có hồ sơ "tự chơi" (`self`) thì dùng lại hồ sơ và sổ hiện có. Người chỉ có tài khoản (vd. HLV đăng nhập bằng email, hay phụ huynh) thì tạo hồ sơ mới gắn `self` vào tài khoản đó. Trùng nghi vấn (cùng tên, khác số) đưa vào danh sách chờ admin chọn, không tự gộp.
4. **Đại sứ D1–D5 (anh Long 09/10/2026):** gồm trẻ em, thanh thiếu niên 15–18 tuổi và người lớn. **Dưới 11 tuổi** có người giám hộ: SĐT/email trên danh sách là của phụ huynh, hồ sơ con gắn dưới phụ huynh (quan hệ `guardian`). **Từ 11 tuổi** có điện thoại riêng, tự quyết định: xử lý như người lớn (hồ sơ `self` gắn với SĐT/email của chính bạn đó). Quy tắc này áp dụng cho mọi ô, không riêng D.
   *Đề xuất cách nhận biết khi nhập:* thêm cột tùy chọn **năm sinh**: `Họ tên; Mã ô; SĐT hoặc email; Năm sinh`. Có năm sinh và dưới 11 tuổi (tính theo ngày sự kiện) → hồ sơ con dưới phụ huynh. Không ghi năm sinh, hoặc từ 11 tuổi → hồ sơ tự chơi. Chờ xác nhận.
5. ~~Tối nay, ai được tích checklist?~~ **Đã chốt 09/10/2026: phương án (a) cho sự kiện 10/10.** Ai mở đúng link `/p/<mã>` cũng tích được trong ngày sự kiện; mỗi lần tích ghi lại thời điểm. Sau sự kiện làm phương án (b): phải đăng nhập (kích hoạt qua email như module 10) mới tích được, người khác quét thẻ chỉ thấy tên và vai.
6. ~~Thùng đồ~~ **Đã chốt 09/10/2026:** seed luôn ở bước 2: bảng mẫu `event_crew_supplies` (`box`, `item`, `quantity` (trống được), `role_code` chuẩn bị), 26 dòng từ `data/thung_do.csv`. Trạng thái "đã đóng thùng / đã thu hồi" theo từng sự kiện làm cùng bảng điều phối (sau 10/10).

## 4. Bổ sung tối 09/10/2026 (anh Long duyệt)

- **Bộ phận thay cho mã ô khi nhập:** cột 2 là bộ phận gõ tự nhiên (Điều phối, An toàn, HLV / HLV Chipping…, Đại sứ, Check-in, Quầy quà, Truyền thông, Khách mời) hoặc mã ô cũ. Hệ thống tự xếp vào chỗ trống; bộ phận đủ người thì thêm chỗ mới vào `event_crew_slots` (vd. D6). Mã ô chỉ còn hiện nhỏ.
- **Điều phối** làm trong khu BTC sự kiện (`/event/<id>/crew`, tài khoản BTC của sự kiện hoặc admin): bảng tổng (theo bộ phận, theo giai đoạn, Vướng, quá giờ, thẻ đeo đã nhận), thêm / bớt người, thêm việc cho một người hoặc cả bộ phận, bớt việc của một người hoặc cả bộ phận. Bảng mới: `event_crew_extra_tasks`, `event_crew_task_exclusions`; cột mới `event_crew_tasks.extra_task_id`.
- **Nút chức năng theo vai** trên trang "Hôm nay": Điều phối → bảng điều phối, quầy; Check-in → ghi tên hộ; Quầy quà → quầy đổi quà (đều cần đăng nhập BTC). HLV trạm chấm điểm trên app và danh sách khách mời làm sau.
- **Kho sự kiện** (`event_inventory_items`): xuất kho dụng cụ / trang thiết bị / quà, đóng thùng, kiểm kê khi trả về (trả, hỏng, thiếu). Quầy chọn quà trong kho (`counter_redeem_gift`): trừ đúng điểm của quà, trừ số quà còn lại, hết quà thì không phát. Cột mới `event_redemptions.inventory_item_id`.
