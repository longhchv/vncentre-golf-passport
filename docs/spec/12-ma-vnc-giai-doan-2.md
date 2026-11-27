# 12 · Giai đoạn 2: Brevo và OTP qua email

Bản 1 · 27/11/2026 · Theo `12-ma-vnc-so-dep-dang-nhap.md` mục 7c.

## 1. Hai đường gửi email đang có

| Đường | Dùng cho | Gửi qua | Cấu hình |
|---|---|---|---|
| Edge Function `auth-otp`, `event-activate` → `sendEmailOtp` (`_shared/messaging.ts`) | Mã OTP 6 số khi đăng ký, quên mật khẩu, kích hoạt ở sự kiện | **API Brevo** `api.brevo.com/v3/smtp/email` | Secret `BREVO_API_KEY`, `EMAIL_FROM` (`no-reply@vncentre.net`) |
| Supabase Auth | Mời nhân viên, đặt lại mật khẩu bằng link; sau này đăng nhập bằng email OTP (giai đoạn 3) | **SMTP Brevo** | Dashboard → Authentication → Emails → SMTP Settings |

## 2. Kết quả kiểm tra (từ email thật trong hộp thư anh Long, gửi 24/09/2026 03:01:30 UTC)

Email "Đặt lại mật khẩu" do Supabase Auth gửi (header `X-Pm-Metadata-Project-Ref: zrfipnqkjrhzrscaaeth`, `Message-Id …@smtp-relay.sendinblue.com`):

| Mục | Kết quả |
|---|---|
| SMTP Supabase Auth → Brevo | **Đang chạy** (gửi qua `smtp-relay` của Brevo) |
| DKIM | **pass**, `d=vncentre.net`, selector `brevo2` |
| SPF | **pass** cho tên miền trả thư của Brevo (`…@gw.d.sender-sib.com`), không phải `vncentre.net` — bình thường với Brevo; DMARC dựa vào DKIM |
| DMARC | **pass**, chính sách `p=none` (chỉ theo dõi) |
| Thời gian nhận | Gửi 03:01:30, Gmail nhận 03:01:32 (**2 giây**) |
| Thư rác | **Không** — Hộp thư đến, mục Cập nhật (`INBOX`, `CATEGORY_UPDATES`, `IMPORTANT`) |
| Tên người gửi | `VN Centre - Vietnam Golf Promotion and Development Centre` (đặt trong SMTP Settings) |

Không đọc được trực tiếp: bản ghi DNS (máy làm việc bị chặn mạng tới DNS), cấu hình SMTP trong Dashboard (không có khoá Supabase), và chưa có email OTP nào của đường API Brevo trong hộp thư anh Long.

## 3. Việc anh Long cần làm

1. **Kiểm tra SMTP** (Supabase Dashboard → Authentication → Emails → SMTP Settings), đúng các giá trị:
   - Host `smtp-relay.brevo.com`, Port `587`
   - Username: đăng nhập SMTP Brevo (Brevo → SMTP & API → tab SMTP, dạng `…@smtp-brevo.com`)
   - Password: **SMTP key** của Brevo (cùng trang; không phải API key)
   - Sender email `no-reply@vncentre.net`; Sender name: đề xuất đổi thành `VN Centre Golf Passport` cho khớp email OTP
2. **Brevo → Senders, Domains & Dedicated IPs → Domains → vncentre.net**: phải thấy đủ dấu xanh (Brevo code, DKIM, DMARC). Thiếu dòng nào thì Brevo hiện đúng bản ghi cần thêm; thêm ở Namecheap → Domain List → vncentre.net → Advanced DNS:
   - DKIM: 2 bản ghi CNAME `brevo1._domainkey` và `brevo2._domainkey` (giá trị Brevo cho). `brevo2` đã chạy.
   - DMARC: TXT `_dmarc` — đã có (`p=none`). Đề xuất thêm nơi nhận báo cáo, ví dụ `v=DMARC1; p=none; rua=mailto:<email nhận báo cáo>`; sau 2–4 tuần không thấy lỗi thì nâng `p=quarantine`.
   - SPF: TXT gốc `@` `v=spf1 include:spf.brevo.com ~all` (gộp với các `include:` đang có nếu đã có bản ghi SPF; mỗi tên miền chỉ được **một** bản ghi SPF).
3. **Đưa mẫu email mới lên:**
   - `node scripts/auth-email-templates.mjs` — mẫu Supabase Auth: đăng nhập / xác nhận đăng ký / đổi email / xác thực lại = mã 6 số (hạn 10 phút), mời nhân viên và đặt lại mật khẩu giữ link; có logo.
   - `npx supabase functions deploy auth-otp event-activate --project-ref zrfipnqkjrhzrscaaeth` — email OTP của Edge Function có logo + bản chữ thuần.
4. **Gửi thử:** mở app.vncentre.net → Quên mật khẩu → nhập `longhchv@gmail.com` → báo lại giờ bấm. Claude đọc hộp thư (Gmail) để đo thời gian nhận và kiểm tra thư rác.
