# 14 · Giao việc: Quản trị viên và BTC xem hồ sơ VĐV trên Golf Passport

Bản 1 · 05/11/2026 · Người soạn: Minh · Chủ sản phẩm duyệt: Vũ Anh Long
Làm tiếp sau `13-giao-viec-ket-noi-snag-league.md` (đã chạy chính thức từ 05/11/2026).

## 0. Hiện trạng (đã đọc code)
- Khu `/admin` chưa có trang tìm và xem học viên (có lớp, sự kiện, sân, lô sổ, hàng chờ ghép VĐV SNAG).
- Khu `/coach` và `/school` có `students/:studentId` (`CoachStudentPage`, `SchoolStudentPage` trong `ProfilePages.tsx`).
- `LeagueAchievements` (thành tích SNAG Golf League) mới dùng ở trang công khai `/p/:passportCode` (`PassportScanPage`).
- Vai trò hiện có: `admin`, `staff`, `coach`, `teacher`.

## 1. Việc cần làm

### 1.1 Trang "Học viên" trong khu quản trị (`/admin/students`, `/admin/students/:studentId`)
- **Danh sách + tìm kiếm:** theo mã VNC, họ tên (bỏ dấu), số điện thoại phụ huynh, mã sổ Passport. Lọc: trường, hạng sổ, `verification_status`, "đã thi SNAG League". Phân trang.
- **Trang chi tiết (đầy đủ):** thông tin học viên; phụ huynh (tên, SĐT, email, quan hệ); các sổ Passport (mã, hạng, trạng thái, QR); lớp học, kết quả đánh giá, chứng nhận (dùng lại các khối đang có); đồng ý (`consents`); **mục Thành tích SNAG Golf League** (dùng lại `LeagueAchievements`, hiển thị đủ cả bảng, so với par, điểm từng chặng).
- **Nút nhanh:** mở trang công khai `/p/{mã sổ}`; sao chép mã VNC; nếu học viên đang trong `league_match_queue` thì có link sang trang ghép.
- Thêm mục "Học viên" vào thanh điều hướng khu quản trị.

### 1.2 Gắn mục Thành tích SNAG vào trang học viên của HLV và nhà trường
`CoachStudentPage`, `SchoolStudentPage`, và trang con của phụ huynh (`ParentChildPage`): thêm `LeagueAchievements` (ẩn nếu chưa thi chặng nào).

### 1.3 Vai trò "BTC giải" (`league_staff`)
- Gán cho người tổ chức giải bằng **chính mã VNC / tài khoản của họ** (quyết định M4 trong `12-module-snag-golf-league.md`), không tạo mã riêng. Gán / gỡ trong khu quản trị (trang người dùng hiện có hoặc trang chi tiết học viên/người dùng).
- **Quyền:** chỉ **xem**, và chỉ các học viên có ít nhất một dòng trong `tournament_results` hoặc có yêu cầu cấp mã từ app giải (`league_ref`). Xem được: tên, năm sinh, trường, mã VNC, mã sổ, thành tích SNAG, **tên và SĐT phụ huynh** (để liên hệ ngày thi đấu). **Không** xem: ngày sinh đầy đủ, email, ghi chú nội bộ, kết quả đánh giá lớp học, thanh toán. Không sửa gì.
- Khu riêng `/league` (hoặc mục trong `/event`): tìm VĐV SNAG theo mã VNC / tên / SĐT; trang chi tiết rút gọn như trên; quét QR thẻ để mở nhanh.
- Thực thi quyền ở **RLS / hàm SQL `security definer`**, không chỉ ẩn trên giao diện.
- Ghi nhật ký (audit) mỗi lần `league_staff` mở hồ sơ.

## 2. Tiêu chí nghiệm thu
1. Admin tìm "VNC-001915" hoặc "Lý" hoặc SĐT phụ huynh → ra đúng học viên; trang chi tiết có đủ khối, có mục Thành tích SNAG.
2. Admin tìm "VNC-002279" (Vũ Anh Minh, cấp từ app giải 05/11) → thấy học viên, sổ hạng `snag_league` hoặc sổ cũ đã ghép.
3. HLV mở học viên đã thi SNAG → thấy mục Thành tích SNAG; học viên chưa thi → không hiện mục.
4. Tài khoản `league_staff`: xem được VĐV đã thi SNAG kèm SĐT phụ huynh; **không** mở được học viên chưa từng thi SNAG (thử gọi thẳng API/RPC cũng bị chặn); không thấy email, ngày sinh đầy đủ; không có nút sửa.
5. Mỗi lần `league_staff` mở hồ sơ có dòng audit.

## 3. Thứ tự và điểm dừng
1. Migration vai trò `league_staff` + hàm/RLS → **dừng, anh Long xem**.
2. Trang `/admin/students` + gắn `LeagueAchievements` vào các trang học viên → **dừng, kiểm tiêu chí 1–3**.
3. Khu `league_staff` → **dừng, kiểm tiêu chí 4–5**.
4. Báo Minh đường dẫn trang chi tiết admin (`/admin/students/:id`) để app giải mở thẳng hồ sơ đầy đủ cho người có quyền.
