# 12 · Giai đoạn 3: đăng nhập nhiều cách và tự sinh mã VNC

Bản 1 · 27/11/2026 · Theo `12-ma-vnc-so-dep-dang-nhap.md` mục 7b, 7c. Migration `20261127000090_auth_onboarding.sql`, kiểm thử `supabase/tests/066_auth_onboarding.sql`.

## 1. Đã làm

| Việc | Cách làm |
|---|---|
| Đăng nhập email OTP | Trang Đăng nhập (tab Phụ huynh, Nhân viên): "Nhận mã đăng nhập qua email" → `signInWithOtp` → nhập mã 6 số → `verifyOtp`. Chưa có tài khoản thì Supabase tự tạo. Mẫu email: `scripts/auth-email-templates.mjs` (giai đoạn 2) |
| Google, Apple, Facebook, Microsoft | Nút `signInWithOAuth`, quay về `/login`. **Ẩn mặc định**; bật từng nút trong cài đặt `auth.providers` (Admin → Cài đặt) sau khi cấu hình nhà cung cấp |
| Sinh mã VNC đúng một lần | Đăng nhập lần đầu → trang `/welcome`: họ tên, năm sinh, học viên hay phụ huynh/người lớn → `auth_onboard` tạo hồ sơ golfer (quan hệ self) → mã VNC sinh qua `next_student_code()` (giai đoạn 1). Khoá theo tài khoản; gọi lại / đăng nhập lại không sinh thêm. Tài khoản con (tên + PIN) không bị hỏi, không được tạo hồ sơ. Chỉ áp dụng tài khoản tạo từ `auth.onboarding_from` (lúc chạy migration) — tài khoản cũ không bị hỏi lại |
| Cùng email đã xác thực → một tài khoản | Supabase Auth tự gộp các cách đăng nhập có cùng email đã xác thực vào một `auth.users` → một hồ sơ, một mã |
| Liên kết thêm / gỡ | Tài khoản → "Cách đăng nhập": danh sách cách đang có, nút liên kết Google / Apple / Facebook / Microsoft (`linkIdentity`), gỡ chỉ khi đang có ít nhất hai cách. Thêm email: thẻ Email có sẵn |
| Phụ huynh cũ đăng nhập bằng SĐT | Vẫn đăng nhập như cũ; trang chủ phụ huynh nhắc liên kết thêm email hoặc Google. `profiles.phone_verified` = Supabase đã xác nhận SĐT; đăng ký qua email (spec 16) → chưa xác thực |
| Link `app.vncentre.net/r/<mã VNC>` | Dùng lại luồng giới thiệu có sẵn (giữ mã trong máy qua bước đăng nhập). `referral_claim` nhận thêm mã VNC (mã chính, mã phụ) → tài khoản giữ hồ sơ đó. Ghi một lần (`referral_links`), trigger chặn sửa / xoá |

## 2. Việc anh Long cần làm để bật

**Chung (Supabase Dashboard → Authentication):**
1. URL Configuration → Redirect URLs có `https://app.vncentre.net/**` (đã có theo `docs/van-hanh/trien-khai-production.md`).
2. Sign In / Providers → **Allow manual linking: bật** (để nút "Liên kết …" chạy).
3. Email provider: bật, **Confirm email: bật** (gộp theo email chỉ an toàn khi email đã xác thực).
4. Chạy `node scripts/auth-email-templates.mjs` (mẫu mã 6 số, giai đoạn 2).

| Cách | Cần làm | Rồi bật trong `auth.providers` |
|---|---|---|
| Email OTP | Không cần thêm (SMTP Brevo đang chạy) | `email_otp: true` (đã bật sẵn) |
| Google | Google Cloud Console → OAuth consent screen (tên app, logo, tên miền vncentre.net) → Credentials → OAuth client ID (Web), Authorized redirect URI `https://zrfipnqkjrhzrscaaeth.supabase.co/auth/v1/callback` → dán Client ID / Secret vào Supabase → Providers → Google | `google: true` |
| Microsoft (Outlook/Hotmail) | Azure Portal → App registrations → New: "Accounts in any organizational directory and personal Microsoft accounts", Redirect URI như trên → Certificates & secrets tạo secret → dán Application (client) ID / secret vào Supabase → Providers → Azure, Tenant URL để trống (`common`) | `azure: true` |
| Facebook | developers.facebook.com → tạo app "Consumer" → Facebook Login, Valid OAuth Redirect URI như trên, quyền `email` → **gửi Meta duyệt** (App Review) và xác minh doanh nghiệp → dán App ID / Secret vào Supabase. Facebook có thể không trả email → người dùng vào app sẽ thấy nhắc thêm email | `facebook: true` |
| Apple | Cần **Apple Developer Program** (99 USD/năm): tạo App ID + Services ID, Sign in with Apple, domain `zrfipnqkjrhzrscaaeth.supabase.co`, return URL như trên, tạo Key → dán vào Supabase → Providers → Apple. Bắt buộc nếu sau này có app iPhone cho đăng nhập Google/Facebook | `apple: true` |
| Zalo | **Không có sẵn trong Supabase.** Zalo OAuth v4 không phải OpenID Connect chuẩn (không có id_token), nên không gắn được như nhà cung cấp OIDC. Muốn làm: Edge Function riêng nhận mã Zalo → lấy hồ sơ Zalo → tạo / tìm người dùng bằng quyền admin → cấp phiên. Cần Zalo Official Account + ứng dụng Zalo for Developers đã duyệt. Chưa làm | — |
| Yahoo | Không có sẵn trong Supabase. Yahoo có OpenID Connect; dùng được nếu Supabase của dự án hỗ trợ nhà cung cấp OIDC tuỳ chỉnh (chưa kiểm chứng được từ máy làm việc — mạng bị chặn tới tài liệu Supabase). Trước mắt: người dùng Yahoo dùng **email OTP** (ghi ngay dưới ô email) | — |

## 3. Kiểm thử

- `supabase/tests/066_auth_onboarding.sql` (PostgreSQL 16 máy làm việc, đạt): tên từ OAuth; SĐT chưa / đã xác thực; bước Chào mừng gửi 2 lần → một hồ sơ, một mã `VNC-0xxxxx`; không tự sửa năm sinh ngoài bước Chào mừng; tài khoản con không bị hỏi, không tạo được hồ sơ; giới thiệu bằng mã VNC (viết `vnc0xxxxx` cũng nhận) ghi đúng người, lần hai báo `already_linked`, không sửa được, không tự giới thiệu.
- `src/features/auth/providers.test.ts`: chỉ gỡ khi còn ≥ 2 cách; Microsoft xin quyền email.
- **Chưa chạy được** (cần Supabase thật và nhà cung cấp đã cấu hình): "đăng nhập Google rồi email cùng địa chỉ → một tài khoản, một mã"; "đăng ký qua link giới thiệu → lưu đúng người giới thiệu" trên app thật.
