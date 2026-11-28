# 31 · Lớp học trực tiếp cho HLV (chấm điểm trong buổi)

Bản 1 · 27/11/2026 · Người yêu cầu: Vũ Anh Long · Lớp chạy đầu tiên: CLB Golf Vinschool Harmony (5 học viên)

## Đã làm (việc 1, 2, 3, 5)

| Việc | Làm thế nào | Dùng lại |
|---|---|---|
| 1. Hồ sơ do HLV tạo | Màn lớp học → "Thêm bạn mới": họ tên (bắt buộc), ngày sinh, ảnh (không bắt buộc). Học viên vào lớp ngay | `students` (mã `VNC-xxxxxx` tự sinh, `claim_code` để phụ huynh liên kết bằng mã hoặc QR `/c/<mã>`), `enrollments` |
| 2. Màn lớp học, điểm khởi đầu | `/coach/live/:classId`: mỗi bạn một thẻ lớn (ảnh, tên, điểm hôm nay, tổng, điểm đổi quà). Tab Hồ sơ có ô "Điểm khởi đầu" | Ví `reward_ledger`; điểm khởi đầu = dòng `opening_balance` / `opening_balance_adjust`, cùng quy tắc với nhập file của admin |
| 3. Chấm điểm nhanh | +5 / +10 / +20 / +30 / +40 / +50 (cài đặt `class_live.point_steps`, admin sửa ở trang Cài đặt), nút Hoàn tác trừ đúng số điểm vừa bấm, chấm cả đội, 5 lý do một chạm, âm thanh, pháo hoa, số điểm bay lên. Nút ở cuối màn hình để bấm một tay | Mỗi lần bấm = một dòng `reward_ledger` (`reason = 'class_points'`, `source_type = 'class_session'`); nguồn điểm `class_points` trong `reward_rules` để ví phụ huynh hiện tên "Điểm trên lớp" |
| 5. Theo dõi, nhận xét | Chủ đề và số buổi; chuyên cần (có mặt / muộn / vắng, số lần rời hoạt động); 4 nhận xét mẫu, ghi chú, nói thành chữ (micro của trình duyệt, tiếng Việt); tab Lịch sử từng bạn | Bảng mới `class_sessions`, `class_session_students` |

**Quy tắc điểm:**
- Tổng tích luỹ = điểm khởi đầu + mọi điểm khác trong ví, **không trừ** phần đã đổi quà.
- Điểm đổi quà = số dư khả dụng của ví (`reward_available`), giảm khi đổi quà.
- Mức điểm (27/11/2026, anh Long): 5, 10, 20, 30, 40, 50. Máy chủ chỉ nhận các mức trong cài đặt.
- Điểm danh và trần mỗi buổi (27/11/2026, anh Long), cài đặt `class_live.class_rules`:

  | Loại lớp | Có mặt | Tối đa mỗi buổi |
  |---|---|---|
  | CLB (mọi lớp không thuộc dòng dưới) | +10 | 200 |
  | Trường công lập: trường loại `public` hoặc loại lớp `pe_core` (GDTC trường công) | +5 | 20 |

  Vào muộn vẫn tính có mặt; vắng không cộng; đổi có mặt → vắng thì trừ lại. Trần tính cả điểm danh. Điểm danh ghi vào ví với `reason = 'attendance'`, `source_type = 'class_session'`.
- Hoàn tác không làm điểm hôm nay xuống dưới 0. Sổ không sửa, không xoá: hoàn tác là một dòng âm bằng đúng mức đã bấm.

**Mạng yếu:** mỗi lần bấm có id sinh trên máy, nằm trong hàng đợi (localStorage) và gửi qua `class_live_sync`. Gửi lại nhiều lần thì máy chủ vẫn chỉ ghi một lần. Tải lại trang khi mất mạng không mất điểm. Tạo hồ sơ, sửa điểm khởi đầu và xem lịch sử cần có mạng. Muốn dùng được khi mất mạng, HLV cần mở màn lớp học một lần lúc có mạng để app lưu trang lại.

**Không logo:** màn lớp học chạy toàn màn hình, không có thanh menu và logo của app.

**Quyền:** admin, HLV trưởng, HLV lớp (`class_staff` vai `coach` / `head_coach`), giống quyền ghi điểm thưởng của spec 19 (Q6). Trợ giảng không chấm được.

## Migration và kiểm thử

- `supabase/migrations/20261127000030_class_live.sql`: chỉ thêm bảng, hàm và giá trị `reason` / `code` mới.
- `supabase/migrations/20261127000040_class_live_steps.sql`: mức điểm 5–50 (cài đặt mới, thay thân `class_live_board`, `class_live_sync`).
- `supabase/migrations/20261127000050_class_live_attendance.sql`: điểm danh có điểm, trần mỗi buổi theo loại lớp; cộng điểm danh cho các buổi đã điểm danh trước đó.
- `supabase/migrations/20261127000060_class_live_topics.sql`: giáo án 14 buổi (cài đặt `class_live.topics`); HLV chọn "Buổi N · chủ đề" một chạm, ô chủ đề tự điền theo số buổi.
- `supabase/migrations/20261127000070_class_live_quick_penalty.sql`: mức +1 (`point_steps` = 1, 5, 10, 20, 30, 40, 50); lý do trừ `penalty` – "Trừ điểm" (khác `fix` – "Sửa nhầm"); số buổi = số buổi lớn nhất + 1.

**Chấm nhanh (27/11/2026):** màn mặc định cho lớp ≤ 10 bạn. Mỗi bạn một hàng: ảnh, tên, điểm hôm nay, một hàng nút cộng và một hàng nút trừ theo `point_steps`. Bấm là gửi ngay (hàng đợi như cũ). Chạm tên để mở thẻ (điểm danh, nhận xét, hồ sơ). Ba cách chấm chuyển qua lại ở đầu màn: Chấm nhanh / Từng bạn / Cả đội; máy nhớ lựa chọn theo lớp. Ở Từng bạn và Cả đội có công tắc Cộng điểm / Trừ điểm.

**Trừ điểm:** trừ đúng một mức, chỉ trong buổi hôm nay, điểm của buổi không xuống dưới 0 (nút vượt quá thì mờ; máy chủ từ chối `below_zero` và app báo rõ). Tổng tích luỹ = cộng dồn các buổi.
- `supabase/tests/064_class_live.sql`: đạt trên PostgreSQL 16 dựng từ toàn bộ migration của repo (27/11/2026). Chưa chạy trên staging.

## Việc 4, 6, 7 (28/11/2026)

Migration `20261128000004_class_live_more.sql`, kiểm thử `supabase/tests/070_class_live_more.sql`.

| Việc | Cách làm |
|---|---|
| 4. Trình chiếu | Nút màn hình ở đầu màn lớp học → `/coach/live/<lớp>/show` (không logo): **Cá nhân** — xếp hạng theo điểm hôm nay, có nút ẩn / hiện tổng; **Hai đội** — tổng điểm hôm nay của đội A / B, nút "Chia đội" chạm tên để đổi đội (lưu theo buổi, `class_session_students.team`). Tự làm mới 4 giây một lần. Bạn vắng không hiện. Đây là màn HLV giơ cho cả lớp xem trong buổi, khác màn ví điểm của từng con (spec 19 nguyên tắc 7 vẫn giữ ở ví điểm) |
| 6. Đổi quà | Thẻ từng bạn → tab **Đổi quà**: điểm hiện có, "còn thiếu N điểm để đổi món kế tiếp", danh sách quà (quà chung + quà riêng của lớp), nút Đổi (nhận tại trường). Đổi qua `gift_order_place` sẵn có: trừ điểm hiện có, tổng tích luỹ giữ nguyên. HLV lớp được đổi hộ (`gift_can_redeem`, công tắc `rewards.coach_can_redeem`). **Thêm quà của lớp**: tên, số điểm, số lượng — quà có `gift_items.class_id`, chỉ hiện cho các bạn trong lớp đó (danh mục quà của phụ huynh cũng lọc theo lớp) |
| 7. Tóm tắt, phụ huynh xem | Nút **Gửi tóm tắt cho phụ huynh** (một lần mỗi buổi): thông báo trong app cho phụ huynh từng bạn có mặt / có điểm — chủ đề, điểm hôm nay, tổng, điểm nổi bật (lý do được cộng nhiều nhất), nhận xét, ghi chú HLV. Hồ sơ con trên app phụ huynh có mục **Buổi học trên lớp** (`class_live_student_report`) |

## Việc còn mở

| Mã | Việc | Người chốt |
|---|---|---|
| L1 | Có mặt có tự cộng điểm không | **Đã chốt 27/11/2026:** CLB +10, trường công lập +5 |
| L2 | Có trần điểm mỗi buổi không | **Đã chốt 27/11/2026:** CLB 200, trường công lập 20 |
| L3 | Ảnh học viên đang lưu thẳng trong hồ sơ (ảnh nhỏ ≤ 80 KB). Sau này chuyển sang kho ảnh | Kỹ thuật |
| L4 | Hồ sơ HLV tạo có thể trùng với hồ sơ đã có (nhập từ trường, từ giải). Admin gộp bằng công cụ gộp hồ sơ; điểm trong ví đi theo khi gộp. Chuyên cần và nhận xét chưa đi theo khi gộp | Kỹ thuật |
