# 31 · Lớp học trực tiếp cho HLV (chấm điểm trong buổi)

Bản 1 · 27/11/2026 · Người yêu cầu: Vũ Anh Long · Lớp chạy đầu tiên: CLB Golf Vinschool Harmony (5 học viên)

## Đã làm (việc 1, 2, 3, 5)

| Việc | Làm thế nào | Dùng lại |
|---|---|---|
| 1. Hồ sơ do HLV tạo | Màn lớp học → "Thêm bạn mới": họ tên (bắt buộc), ngày sinh, ảnh (không bắt buộc). Học viên vào lớp ngay | `students` (mã `VNC-xxxxxx` tự sinh, `claim_code` để phụ huynh liên kết bằng mã hoặc QR `/c/<mã>`), `enrollments` |
| 2. Màn lớp học, điểm khởi đầu | `/coach/live/:classId`: mỗi bạn một thẻ lớn (ảnh, tên, điểm hôm nay, tổng, điểm đổi quà). Tab Hồ sơ có ô "Điểm khởi đầu" | Ví `reward_ledger`; điểm khởi đầu = dòng `opening_balance` / `opening_balance_adjust`, cùng quy tắc với nhập file của admin |
| 3. Chấm điểm nhanh | +1 / +2 / +3 / −1 (sửa nhầm), chấm cả đội, 5 lý do một chạm, âm thanh, pháo hoa, số điểm bay lên. Nút ở cuối màn hình để bấm một tay | Mỗi lần bấm = một dòng `reward_ledger` (`reason = 'class_points'`, `source_type = 'class_session'`); nguồn điểm `class_points` trong `reward_rules` để ví phụ huynh hiện tên "Điểm trên lớp" |
| 5. Theo dõi, nhận xét | Chủ đề và số buổi; chuyên cần (có mặt / muộn / vắng, số lần rời hoạt động); 4 nhận xét mẫu, ghi chú, nói thành chữ (micro của trình duyệt, tiếng Việt); tab Lịch sử từng bạn | Bảng mới `class_sessions`, `class_session_students` |

**Quy tắc điểm:**
- Tổng tích luỹ = điểm khởi đầu + mọi điểm khác trong ví, **không trừ** phần đã đổi quà.
- Điểm đổi quà = số dư khả dụng của ví (`reward_available`), giảm khi đổi quà.
- Sửa nhầm không làm điểm hôm nay xuống dưới 0. Sổ không sửa, không xoá: sửa nhầm là một dòng −1.

**Mạng yếu:** mỗi lần bấm có id sinh trên máy, nằm trong hàng đợi (localStorage) và gửi qua `class_live_sync`. Gửi lại nhiều lần thì máy chủ vẫn chỉ ghi một lần. Tải lại trang khi mất mạng không mất điểm. Tạo hồ sơ, sửa điểm khởi đầu và xem lịch sử cần có mạng. Muốn dùng được khi mất mạng, HLV cần mở màn lớp học một lần lúc có mạng để app lưu trang lại.

**Không logo:** màn lớp học chạy toàn màn hình, không có thanh menu và logo của app.

**Quyền:** admin, HLV trưởng, HLV lớp (`class_staff` vai `coach` / `head_coach`), giống quyền ghi điểm thưởng của spec 19 (Q6). Trợ giảng không chấm được.

## Migration và kiểm thử

- `supabase/migrations/20261127000030_class_live.sql`: chỉ thêm bảng, hàm và giá trị `reason` / `code` mới.
- `supabase/tests/064_class_live.sql`: đạt trên PostgreSQL 16 dựng từ toàn bộ migration của repo (27/11/2026). Chưa chạy trên staging.

## Chưa làm

- **4.** Chế độ trình chiếu: bảng điểm và xếp hạng cho các con xem, chia 2 đội hoặc theo cá nhân. Cần anh Long chốt cách hiện xếp hạng, vì nguyên tắc 7 của spec 19 không cho màn ví điểm của các con so sánh điểm giữa các con.
- **6.** Đổi quà: kho quà và đổi quà đã có (spec 19 phần C, admin quản lý). Còn thiếu quyền cho HLV tạo danh mục quà và màn "còn thiếu bao nhiêu điểm để đổi món tiếp theo".
- **7.** Tóm tắt cuối buổi gửi phụ huynh; phụ huynh xem nhận xét trong hồ sơ. Phụ huynh đã xem được điểm trong ví (dòng "Điểm trên lớp").

## Việc còn mở

| Mã | Việc | Người chốt |
|---|---|---|
| L1 | Có mặt có tự cộng 10 điểm `attendance` (phụ lục C1) không, hay chỉ ghi chuyên cần | Anh Long |
| L2 | Có trần điểm trên lớp mỗi buổi không | Anh Long |
| L3 | Ảnh học viên đang lưu thẳng trong hồ sơ (ảnh nhỏ ≤ 80 KB). Sau này chuyển sang kho ảnh | Kỹ thuật |
| L4 | Hồ sơ HLV tạo có thể trùng với hồ sơ đã có (nhập từ trường, từ giải). Admin gộp bằng công cụ gộp hồ sơ; điểm trong ví đi theo khi gộp. Chuyên cần và nhận xét chưa đi theo khi gộp | Kỹ thuật |
