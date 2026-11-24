# 27 · Sân tập & phòng 3D — đợt B: đóng góp của người dùng, ảnh, điểm, chủ sân tự cập nhật

Bản 1 · 24/11/2026 · Người làm: Minh · Anh Long duyệt mức điểm (mục 25/2.10) và quy tắc nhận trang (mục 25/2.11) ngày 24/11/2026.
Đọc kèm: `25-module-san-tap-phong-3d.md`, `26-giao-viec-san-tap-dot-a.md`.

## Đã làm

| Phần | Nội dung |
|---|---|
| Migration `20261124000002_practice_venues_b.sql` | `practice_venue_submissions`, `practice_venue_photos` (+ kho `venue-photos`), `venue_contribution_points`, cột `owner_updated_at`; hàm `pv_submit`, `pv_approve_submission` (duyệt từng trường), `pv_reject_submission`, `pv_moderate_photo`, `pv_owner_update`, `pv_my_venues`, `pv_is_owner`; view `pv_public_photos`; view `pv_public_venues` thêm `owner_updated_at`, `cover_path`, `claimed` |
| Người dùng (mọi tài khoản Golf Passport) | `/venues/:id/suggest` đề xuất sửa + báo đóng cửa + ảnh kèm · `/venues/new` thêm địa điểm · `/venues/:id/photos` gửi ảnh · `/venues/:id/claim` nhận trang · `/venues/mine` đóng góp của tôi + điểm |
| Admin | `/admin/venues/queue` so sánh hiện tại / đề xuất, tick từng trường, duyệt một phần, từ chối (bắt buộc lý do), đánh dấu trùng · `/admin/venues/photos` duyệt ảnh, đặt ảnh đại diện |
| Chủ sân | `/partner/venues` sửa giờ, điện thoại, web, fanpage, máy, số ô, đỗ xe, giá — lưu là hiện ngay, lịch sử ghi nguồn "Chủ sân sửa" |
| tapgolf.vncentre.net | Khung "Bạn biết thêm về nơi này?" (3 nút), dải ảnh đã duyệt, nhãn "Chủ sân cập nhật · ngày", link "Thêm địa điểm mới" và "Đóng góp của tôi" ở chân trang |

## Quy tắc trong cơ sở dữ liệu

- Điểm: thêm địa điểm đủ tên, loại, toạ độ, điện thoại 20 · sửa có ít nhất 1 trường được nhận 5 · thêm 10 khi xác nhận hãng máy kèm ảnh nhãn "Máy 3D" · thêm 10 khi gửi giá kèm ảnh "Bảng giá" · ảnh được duyệt 2 (tối đa 5 ảnh / người / địa điểm) · trần 300 điểm / tháng (giờ Việt Nam). Đánh giá sao không có điểm.
- Điểm ghi vào `venue_contribution_points` (cột `credited_at` trống); chuyển sang ví người lớn khi spec 21 làm ví.
- Tối đa 20 đề xuất đang chờ mỗi tài khoản.
- Nhận trang được duyệt: tạo `partners` nháp loại `driving_range` (nếu địa điểm chưa có), gán người gửi `partner_staff` vai `manager`, thêm vai `partner_staff` trong `user_roles`.
- Kho `venue-photos` công khai theo đường dẫn ngẫu nhiên `<user_id>/<uuid>.jpg`; không có quyền liệt kê. Ảnh chờ duyệt không hiện trên web; ảnh giấy phép nhận trang chỉ admin có đường dẫn.

## Kiểm thử đã chạy

Postgres 16 sạch: chạy migration A + B hai lần không lỗi; người thường bị chặn duyệt; duyệt một phần chỉ đổi trường được chọn; địa điểm mới nhận mã `hn-66`; điểm 5 + 10 + 20 + 2 đúng; ảnh đại diện hiện ở view công khai; chủ sân sửa được giờ, không sửa được tên, bị chặn ở địa điểm khác. App: `tsc`, 136 test, `vite build`; chạy thử giao diện với Supabase giả lập.
