# Đặc tả kỹ thuật: mã VNC và kho số đẹp

Áp dụng cho Golf Passport (Supabase, app.vncentre.net), dùng chung cho app Handicap (hdcp.vncentre.net).

## 1. Nguyên tắc
- Mỗi người có một tài khoản và một mã nội bộ (UUID) cố định trọn đời; mọi dữ liệu (handicap, hồ sơ, điểm danh, ví điểm) gắn vào mã nội bộ, không gắn vào mã VNC.
- Mã VNC là mã hiển thị 6 chữ số, lưu dạng chuỗi để giữ số 0 ở đầu. Một người có thể có nhiều mã VNC, đúng một mã là mã chính.
- Mã VNC đã gắn với một người thì không bao giờ cấp lại cho người khác, kể cả khi người đó đổi sang số đẹp (mã cũ thành mã phụ).
- Không chuyển nhượng, không bán lại mã giữa người dùng.
- Hiện chỉ cấp dải mã bắt đầu bằng 0; dải đang mở để ở cấu hình, sau này mở thêm dải 1–9.

## 2. Dữ liệu
Bảng vnc_codes: code (char 6, khoá chính); owner_id (uuid, trống khi còn trong kho); is_primary (boolean, unique có điều kiện theo owner); status (available, reserved, gifted, sold, assigned, retired_alias); category (mảng nhóm); tier (kim_cuong, vang, bac, dong, nam_sinh, thuong); list_price (đồng); acquired_at, acquired_by (cấp/tặng/mua); gifted_by (uuid).
Bảng vnc_price_table: tier, giá từ, giá đến, hiệu lực từ ngày, đến ngày. Đổi giá = thêm dòng mới, giữ lịch sử.

Khung giá khởi điểm (đồng): nam_sinh 300.000–500.000; dong 500.000–1.000.000; bac 1.000.000–3.000.000; vang 3.000.000–10.000.000; kim_cuong từ 10.000.000.

## 3. Hàm classify_vnc(code)
Trả về danh sách nhóm và hạng cao nhất. Dùng cho sinh mã, quét kho, tìm kiếm.
- Lục quý (6 số giống nhau) → kim_cuong
- Ngũ quý (5 số giống nhau liên tiếp) → kim_cuong
- Sảnh 6 tiến/lùi → kim_cuong; sảnh 4 cuối → bac
- Số tròn (một số khác 0 rồi 5 số 0) → kim_cuong
- Tứ quý 4 số cuối → vang
- Taxi ABABAB hoặc ABCABC → vang
- Đảo gánh đối xứng 6 số → vang; đối xứng 4 số cuối → dong
- Số golf 727272, 181818, 545454, 000072, 000018 → vang; đuôi 7272, 1818 → bac
- Lộc phát/thần tài đuôi 6868, 8686, 3939, 7979 → bac
- Tam hoa 3 số cuối → dong
- Năm sinh: 4 số cuối 1940–năm hiện tại, hoặc DDMMYY hợp lệ → nam_sinh (không khoá trước)
- Khớp nhiều nhóm → giữ mọi nhóm, lấy hạng cao nhất

## 4. Sinh mã cho người mới
1. Chọn ngẫu nhiên một số trong dải đang mở.
2. Bỏ qua nếu đã có trong vnc_codes.
3. Bỏ qua nếu classify_vnc trả hạng từ dong trở lên (nam_sinh không bỏ qua).
4. Ghi status assigned, is_primary true. Thử tối đa 20 lần, quá thì báo lỗi admin.
Đợt khởi tạo: ghi mọi số đẹp chưa cấp (toàn dải 000000–999999) vào vnc_codes với status available. Số đẹp đã cấp trước đây giữ nguyên chủ, chỉ cập nhật category, tier.

## 5. Mua, tặng, đổi mã chính
- Tìm số: lọc theo nhóm, hạng/khung giá; ô nhập số gần đúng trả về mã khớp hoặc gần giống còn trống.
- Mua cho mình hoặc mua tặng (nhập tên hoặc mã VNC người nhận).
- Admin tặng số (học viên xuất sắc, giải thưởng).
- Đổi mã chính: chọn một mã trong kho của mình; mã chính cũ thành mã phụ.
- Tra cứu, quét QR, nhập điểm bằng bất kỳ mã nào của một người đều ra cùng hồ sơ; QR cũ trên Golf Passport, chứng nhận, thẻ điểm vẫn dùng được.

## 6. Hiển thị
- Hồ sơ hiện mã chính; mục "Mã VNC của tôi" liệt kê các mã kèm hạng, nhóm, giá niêm yết hiện tại. Không dùng lời hứa đầu tư hay sinh lời.

## 7. Quản trị
- Trang admin: xem kho theo hạng/trạng thái, khoá hoặc mở số, tặng số, sửa bảng giá. Nhật ký mọi thao tác cấp, tặng, bán, đổi mã chính.

## 7b. Đăng nhập và tự sinh mã VNC
- Đăng nhập ngay lần đầu bằng email OTP, Google, Apple ID, Facebook, Microsoft (Outlook/Hotmail), Zalo nếu làm được; hệ thống tự tạo tài khoản và sinh mã VNC đúng một lần.
- Cùng email đã xác thực thì gộp vào một tài khoản, không sinh mã thứ hai.
- Link giới thiệu app.vncentre.net/r/<mã VNC>: giữ mã người giới thiệu qua bước đăng nhập, ghi vào hồ sơ người mới, không sửa được về sau.
- Hồ sơ tối thiểu sau đăng nhập: họ tên, năm sinh, học viên hay phụ huynh/người lớn; mỗi con có mã VNC riêng.
- Apple: cần Apple Developer; có app iPhone mà cho đăng nhập Google/Facebook thì bắt buộc có Sign in with Apple. Facebook: cần Meta duyệt; email có thể trống thì hỏi thêm.

## 7c. OTP qua email và nhiều cách đăng nhập
- Chưa nối Zalo/SMS: xác thực bằng OTP 6 số qua email, gửi qua SMTP Brevo.
- Số điện thoại lưu vào hồ sơ, đánh dấu chưa xác thực cho đến khi nối Zalo/SMS.
- Bật manual linking; người dùng liên kết thêm các cách đăng nhập trong cài đặt; chỉ cho gỡ khi còn ít nhất hai cách.
