# 16 · Giao việc: Tạm gửi mã xác thực qua email cho số điện thoại Việt Nam

Bản 1 · 06/11/2026 · Người soạn: Minh · Chủ sản phẩm duyệt: Vũ Anh Long (chốt 06/11: "trước mắt mã xác thực gửi qua email, sau sẽ gửi qua số điện thoại hay Zalo")
**Mốc:** chạy chính thức trước **sáng Chủ nhật 08/11/2026** (Chặng 11 SNAG, phụ huynh kích hoạt Golf Passport tại bàn check-in).
**Làm trước spec 15.** Không kịp thì Chặng 11 bỏ phần kích hoạt tại bàn; không làm vội.

## 0. Vì sao
Đã đọc code (06/11):
- `auth-otp`: số Việt Nam → `sendZaloOtp`, lỗi thì `sendSmsOtp`; số nước ngoài → `sendEmailOtp` (Brevo).
- `_shared/messaging.ts`: `ZALO_MODE`, `SMS_MODE` mặc định `mock` (chưa có ZNS, chưa có nhà cung cấp SMS — phụ lục D, D7, D8). Ở chế độ `mock`, **phụ huynh số Việt Nam không nhận được mã nào** (mã chỉ nằm ở `otp_logs.debug_code`), nên hiện tại **không đăng ký được**.
- Email qua Brevo đã chạy thật (module 10, sự kiện 10/10).

## 1. Mục tiêu
Một **công tắc cấu hình** quyết định kênh gửi mã cho số Việt Nam: `email` (dùng ngay) hoặc `zalo` (khi có ZNS). Khi bật `email`, số Việt Nam đi **đúng luồng của số nước ngoài đang có**: bắt buộc nhập email, mã gửi về email, email được xác minh; số điện thoại vẫn lưu nhưng **chưa xác minh**.

Không viết cứng (README quy tắc 2): công tắc nằm trong bảng cấu hình đang dùng (`settings`, xem `20260926000002_step11_settings.sql` và `src/lib/settings.ts`), khoá đề xuất `auth.otp_vn_channel`, giá trị mặc định **`email`**. Nếu repo đang có quy ước khác cho cấu hình mà giao diện chưa đăng nhập cũng đọc được thì theo quy ước đó.

## 2. Trước khi code
1. `git fetch`; làm trên **nhánh mới từ `origin/main`** (worktree riêng), **không** làm ở thư mục repo chính (đang ở nhánh `module-ho-so-nhan-su`).
2. Chạy sao lưu: `node scripts/backup.mjs --out C:/dev/backups --copy-to "G:/My Drive/vncentre-golf-passport/sao-luu" --keep 120`.
3. Đọc `supabase/functions/auth-otp/index.ts`, `_shared/messaging.ts`, `src/pages/auth/SignupPage.tsx`, `ForgotPasswordPage.tsx`, `LoginPage.tsx`, `src/features/auth/phone.ts`. Có điểm nào khác mô tả ở mục 0 thì báo anh Long trước.

## 3. Việc cần làm

### 3.1 Edge Function `auth-otp`
- Đọc `auth.otp_vn_channel`. Khi = `email`, xử lý số Việt Nam **như số nước ngoài** ở mọi nhánh đang có:
  - `signup`: bắt buộc `email` (lỗi `email_required`), kiểm tra email chưa có chủ (`email_exists`), **vẫn kiểm tra số điện thoại chưa có chủ** (`phone_exists`), gửi mã qua `sendEmailOtp`.
  - `complete` (signup): tạo người dùng với `email_confirm = true`, lưu `phone` **không xác minh**; trả `login: { email }`.
  - `reset_password`: số Việt Nam chưa xác minh SĐT → gửi về email đã xác minh (nhánh đang có ở dòng ~158); nhập email thì như cũ.
  - `add_phone`: khi kênh = `email` thì báo `channel_unavailable` (thêm SĐT để sau khi có Zalo).
- `attachGuardian`: **không** tự nối với dòng người giám hộ nhập từ trường theo **số điện thoại chưa xác minh** (tránh chiếm hồ sơ bằng số của người khác). Chỉ nối theo email đã xác minh như hiện tại; nối với con đi qua kích hoạt bằng mã sổ như bình thường.
- `otp_logs`: giữ nguyên, kênh ghi `email`.
- Khi = `zalo`: chạy như hiện tại, không đổi gì.

### 3.2 Giao diện
- `SignupPage`: khi kênh = `email`, **luôn hiện ô email bắt buộc** ở bước 1 với số Việt Nam; dòng gợi ý: *"Mã xác thực sẽ được gửi tới email này. Hãy dùng email bạn mở được ngay trên điện thoại."* (thêm vào `vi.json` và `en.json`).
- Bước 3: email đã xác minh hiện dạng "Email … đã được xác minh" như số nước ngoài; gợi ý mật khẩu đổi thành: *"Các lần sau đăng nhập bằng email + mật khẩu."*
- Màn nhập mã (`OtpStep`): hiện rõ "Mã đã gửi tới email …"; thêm dòng *"Không thấy thư? Kiểm tra mục Thư rác / Quảng cáo."*
- `LoginPage` (phụ huynh): đăng nhập bằng email + mật khẩu đã có — giữ nguyên. **Kiểm tra** đăng nhập bằng SĐT + mật khẩu với tài khoản có SĐT chưa xác minh: nếu Supabase không cho, hiện thông báo *"Vui lòng đăng nhập bằng email"* thay vì lỗi chung.
- Admin → Cấu hình: thêm công tắc `auth.otp_vn_channel` (email / zalo), ghi nhật ký khi đổi.

### 3.3 Không làm
Không bật Zalo/SMS thật, không sửa module 10 (kích hoạt sự kiện), không đổi luồng kích hoạt sổ sau khi đã đăng nhập.

## 4. Tiêu chí nghiệm thu (trên app thật, với email và số thật)
1. Số Việt Nam chưa đăng ký + email thật → nhận mã trong email (≤ 1 phút) → đặt mật khẩu → đăng nhập được bằng **email + mật khẩu**.
2. Thiếu email → báo cần email, không gửi gì.
3. Email hoặc số đã có tài khoản → báo đúng lỗi, không tạo tài khoản thứ hai.
4. Quên mật khẩu với tài khoản ở tiêu chí 1 → mã về email → đặt lại được.
5. Quét QR sổ của một VĐV SNAG → **"Đăng ký và kích hoạt"** → hết luồng → "Vào hồ sơ của con" thấy đúng con, có mục Thành tích SNAG.
6. Đổi công tắc sang `zalo` → số Việt Nam quay về hành vi cũ (`mock`); đổi lại `email` → chạy như tiêu chí 1. Có dòng nhật ký.
7. Số nước ngoài: không thay đổi.
8. Toàn bộ test cũ vẫn đạt; thêm test cho `phone_exists`, `email_required`, và không tự nối người giám hộ theo SĐT chưa xác minh.

## 5. Thứ tự và điểm dừng
1. Sửa `auth-otp` + công tắc cấu hình + test → **dừng, anh Long xem**.
2. Sửa giao diện + bản dịch → **dừng, anh Long thử tiêu chí 1–5 trên điện thoại** (dùng số và email của chính anh hoặc Phương Anh).
3. Sao lưu → deploy Edge Function + giao diện lên `app.vncentre.net`.
4. Báo Minh để cập nhật hướng dẫn bàn check-in cho Phương Anh.
