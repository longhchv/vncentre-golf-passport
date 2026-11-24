# 28 · Sân tập & phòng 3D — đợt C: khảo sát VN Centre, đánh giá người dùng; kho riêng cho giấy phép nhận trang

Bản 1 · 24/11/2026 · Người làm: Minh · Anh Long duyệt đợt C và yêu cầu chuyển ảnh giấy phép kinh doanh sang kho riêng ngày 24/11/2026.
Đọc kèm: `25-module-san-tap-phong-3d.md` (Q3 hai lớp đánh giá tách riêng, Q7 đánh giá hiện ngay), `27-san-tap-dot-b.md`.

## Đã làm

| Phần | Nội dung |
|---|---|
| Migration `20261124000003_practice_venues_c.sql` | Kho riêng `venue-private` (ảnh giấy phép nhận trang); `practice_venue_surveys`; `practice_venue_reviews`, `practice_venue_review_reports`, `practice_venue_review_history`; hàm `pv_assign_survey`, `pv_save_survey`, `pv_approve_survey`, `pv_reject_survey`, `pv_surveyors`, `pv_save_review`, `pv_report_review`, `pv_moderate_review`, `pv_owner_reply`, `pv_recalc_rating`, `pv_short_name`; view `pv_public_surveys`, `pv_public_reviews` |
| Khảo sát viên (vai `venue_surveyor`, admin cấp ở mục Người dùng) | `/venues/survey` danh sách việc · `/venues/survey/:sid` phiếu: ngày đến, 6 tiêu chí 1–10, kiểm tra thông tin (máy, số ô, giờ, điện thoại, đỗ xe, mở muộn), điểm mạnh / cần cải thiện, lưu nháp / gửi |
| Admin | `/admin/venues/surveys` giao việc theo vùng / tìm kiếm, duyệt phiếu (tick từng trường thông tin, chọn công bố điểm), trả lại kèm lý do · `/admin/venues/reviews` đánh giá bị báo cáo / mới nhất / đã ẩn; ẩn (bắt buộc lý do), hiện lại, giữ và xoá báo cáo |
| Người dùng | `/venues/:id/review` viết / sửa đánh giá 1–5 sao, chấm chi tiết tuỳ chọn, tháng đến; xem và báo cáo đánh giá khác |
| Chủ sân | `/partner/venues` thêm mục đánh giá của khách, trả lời mỗi đánh giá một lần |
| tapgolf.vncentre.net | Mục "Đánh giá" đầu trang chi tiết: điểm VN Centre (tổng + 6 thanh + điểm mạnh / cần cải thiện + ngày), đánh giá người chơi + nút "Viết đánh giá"; nhãn "VNC 7.8" và sao người dùng trên thẻ; bộ lọc "Đã được VN Centre khảo sát" |
| Giấy phép nhận trang | Tải lên kho riêng `venue-private/<user_id>/claim-<uuid>.jpg`; chỉ người gửi và admin đọc; admin mở qua đường dẫn ký hạn 10 phút. Giấy tờ cũ ở kho công khai vẫn mở được (dự phòng) |

## Quy tắc trong cơ sở dữ liệu

- Hai lớp tách riêng: `vnc_score` chỉ đổi khi admin duyệt phiếu và chọn công bố; `user_rating`, `user_reviews` tự tính lại từ đánh giá đang hiện.
- Phiếu: đủ 6 điểm và có ngày đến mới gửi được; khảo sát viên chỉ thấy phiếu của mình; trả lại → về nháp kèm lý do. Trường thông tin chỉ nhận khoá trong `pv_edit_fields()`; duyệt áp dụng qua `pv_apply_patch`, lịch sử ghi nguồn "survey".
- Đánh giá: mỗi tài khoản một đánh giá / địa điểm (sửa lại được, bản cũ lưu ở `practice_venue_review_history`); hiện ngay; chủ sân và nhân viên không tự đánh giá; mỗi người báo cáo một lần; từ 3 báo cáo vào danh sách admin; không có điểm thưởng.
- Tên hiển thị rút gọn: "Vũ Anh Long" → "Long V.".
- Tính lại điểm người dùng không ghi lịch sử địa điểm và không đổi ngày "Cập nhật" (trigger `set_updated_at`, `pv_log_change_upd` có điều kiện).

## Kiểm thử đã chạy

Postgres 16 sạch: migration A + B + dữ liệu + C, chạy C hai lần không lỗi. Giao việc 2/3 mã (bỏ mã sai, không giao trùng); người thường bị chặn giao việc và không đọc được phiếu; gửi thiếu điểm bị chặn; trả lại → nháp; duyệt chỉ áp dụng trường được chọn (số ô = 12, tên không đổi), điểm 7.8 hiện ở view công khai. Đánh giá: sửa cùng dòng; chủ sân bị chặn tự đánh giá; trả lời một lần; báo cáo trùng không cộng; ẩn → điểm người dùng tính lại (3.0/2 → 4.0/1); view công khai chỉ hiện đánh giá đang hiện, tên "Long V.". App: `tsc`, 136 test, `vite build`; chạy thử 7 màn với Supabase giả lập, không lỗi. Web: mục Đánh giá, nhãn VNC và bộ lọc chạy với dữ liệu giả lập.

## Bổ sung 24/11/2026: huỷ / chuyển việc khảo sát

- Migration `20261124000004_practice_venues_c2.sql`: `pv_cancel_survey` (xoá việc chưa gửi), `pv_reassign_survey` (chuyển sang khảo sát viên khác, giữ phần nháp; chặn nếu người nhận đã có địa điểm đó). Phiếu đã gửi / đã duyệt không huỷ, không chuyển được.
- `/admin/venues/surveys` tab "Đang làm": lọc theo khảo sát viên; mỗi việc có "Chuyển cho…" và "Huỷ việc" (bấm hai lần).
- Hàm `admin-users`: thêm `venue_surveyor` vào danh sách vai được phép khi tạo tài khoản nhân viên.
