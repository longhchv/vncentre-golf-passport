# Nghiệm thu đợt 1 — 15 kịch bản (02-dot-1-nen-tang.md mục 7)

Cập nhật: 25/09/2026, sau Bước 15. Cột **Staging** là kết quả anh Long đã thử trên điện thoại ở từng bước và kiểm thử tự động.
Cột **Production** điền khi chạy lại trên môi trường thật (bắt buộc để coi đợt 1 là xong).

| # | Kịch bản | Staging | Cần để chạy thật | Production |
|---|---|---|---|---|
| 1 | Nhập file CLB Tô Vĩnh Diện (6 em) → PDF decal 6 tem → gán 6 sổ | Đạt (Bước 4, 5) | — | ☐ |
| 2 | Phụ huynh A quét sổ → OTP qua **Zalo** → kích hoạt < 3 phút → thấy level và khoá đã học | Đạt ở **chế độ thử** (mã xem ở Admin → Tin nhắn) | Zalo ZNS (D7) | ☐ |
| 3 | Phụ huynh B không dùng Zalo → OTP qua **SMS** | Đạt ở chế độ thử (số đuôi 99) | SMS brandname (D8) + adapter | ☐ |
| 4 | Số nước ngoài (UNIS) → mã qua email → tiếng Anh từ đầu đến cuối | Đạt (Bước 6, email thật qua Brevo) | — | ☐ |
| 5 | Vinschool Harmony không có SĐT: quét decal chưa gán → tự khai → admin ghép | Đạt (Bước 7, 9) | — | ☐ |
| 6 | Nhập lịch sử 2 năm → duyệt hàng loạt → "Hoàn thành Level 1" + 2 khoá | Đạt (Bước 9) | — | ☐ |
| 7 | Phát hành chứng nhận cả lớp → thông báo → tải PDF đúng mẫu, đủ dấu → QR "hợp lệ" | Đạt (Bước 12) | Chữ ký tải lên production | ☐ |
| 8 | Thu hồi chứng nhận → trang xác thực báo đã thu hồi | Đạt (Bước 12) | — | ☐ |
| 9 | Báo mất sổ → trả 200.000 đ bằng QR → tự "đã thanh toán" → gán sổ mới → quét vào hồ sơ cũ | Đạt ở **chế độ thử** (giả lập webhook có chữ ký) | payOS (D9) | ☐ |
| 10 | Mời người giám hộ thứ hai → người này đăng nhập và thấy con | Đạt (Bước 11) | Zalo hoặc email | ☐ |
| 11 | Tạo tài khoản cho con 9 tuổi → đăng nhập tên + PIN → chỉ xem | Đạt (Bước 11) | — | ☐ |
| 12 | HLV chỉ thấy lớp mình → quét sổ lớp khác bị từ chối → API không trả SĐT phụ huynh | Đạt (Bước 3, 8; test SQL 001, 006) | — | ☐ |
| 13 | Trường nhập lịch sử 1 em → phụ huynh chưa thấy → HLV trưởng duyệt → phụ huynh thấy | Đạt (Bước 9) | — | ☐ |
| 14 | Gộp 2 hồ sơ trùng → toàn bộ sổ, chứng nhận, lịch sử chuyển sang hồ sơ giữ lại | Đạt (Bước 14; test SQL 013) | — | ☐ |
| 15 | Nhật ký hệ thống ghi đủ thao tác ở kịch bản 6, 8, 9, 14 (kèm người thực hiện) | Đạt (test SQL 015; xem ở Admin → Nhật ký hệ thống) | — | ☐ |

## Quy tắc R1–R14 (kiểm thử tự động)

`npm run test:db` chạy các file `supabase/tests/*.sql` trên dự án đang link; `npm test` chạy Vitest.

| Quy tắc | File kiểm thử |
|---|---|
| R1 mã dùng một lần | 005, 009 |
| R2 một sổ active | 004, 013 |
| R3 không lộ danh sách tìm kiếm | 002, 010 |
| R4, R5 level | 000, 007 |
| R6 trường không tạo level đã duyệt | 007 |
| R7 chờ duyệt không hiện | 006, 007 |
| R8 không lộ liên hệ phụ huynh | 001, 006 |
| R9 snapshot chứng nhận | 011 |
| R10 chỉ webhook có chữ ký đổi "đã thanh toán" | 012 (+ kiểm thử đầu-cuối webhook giả mạo) |
| R11 activated_at ghi lần đầu | 005, 009 |
| R12 gộp không mất bản ghi | 013 |
| R13 giới hạn lấy từ app_settings | 005, 010 |
| R14 tài khoản học viên ≥ 8 tuổi | 010 |
