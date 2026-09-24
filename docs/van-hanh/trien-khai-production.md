# Dựng môi trường chạy thật (production) — VN Centre Golf Passport, đợt 1

Tài liệu này liệt kê **đủ các bước** để dựng production từ repo, theo đúng cách staging đang chạy.
Các bước có ký hiệu 👤 là việc anh Long (hoặc người giữ tài khoản) phải tự làm vì cần đăng nhập, thanh toán hoặc
khoá bí mật. Các bước ⚙️ Claude Code làm được sau khi có quyền truy cập.

> Nguyên tắc: **không** chạy `supabase/seed.sql` trên production (chỉ có dữ liệu giả cho staging).
> Decal in cho lớp thật phải xuất từ production (`app.vncentre.net`), không dùng decal xuất từ staging.

## 0. Việc cần có trước (chặn chạy thật)

| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| A | Tài khoản **Zalo ZNS** + mẫu tin OTP và mẫu tin mời đã được Zalo duyệt (D7) | 👤 | Không có thì phụ huynh số VN không nhận được OTP |
| B | Nhà cung cấp **SMS brandname** (D8) | 👤 chọn, ⚙️ viết adapter | Hiện adapter SMS chỉ có chế độ thử |
| C | Tài khoản **payOS** (D9) | 👤 | Chưa có thì thanh toán vẫn ở chế độ thử |
| D | **Điều khoản sử dụng** và **Chính sách bảo mật** bản chính thức (D3) | Minh → luật sư | Trang `/terms`, `/privacy` đang là bản giữ chỗ |
| E | Tên miền `app.vncentre.net` trỏ về Cloudflare | 👤 | |

## 1. Supabase production 👤

1. Tạo dự án mới trên Supabase, **gói Pro**, khu vực **Singapore** (`ap-southeast-1`). Đặt mật khẩu database mạnh, lưu vào trình quản lý mật khẩu.
2. Gói Pro có sao lưu tự động hằng ngày, giữ 7 ngày (đạt yêu cầu mục 6 file 02). Nếu muốn khôi phục theo thời điểm, bật thêm PITR.
3. Gửi cho Claude Code **mã dự án (project ref)** và **anon key** (anon key là khoá công khai). **Không** gửi service key hay mật khẩu database.

## 2. Cơ sở dữ liệu ⚙️

```powershell
npx supabase link --project-ref <PROD_REF>        # hỏi mật khẩu database: 👤 nhập
npx supabase db push                               # chạy toàn bộ migration (không có seed)
npx supabase link --project-ref zrfipnqkjrhzrscaaeth   # nối lại staging ngay sau đó
```

Migration tạo sẵn: bảng, RLS, dữ liệu tham chiếu (tổ chức, chương trình, 20 level, giai đoạn, cấp hộ chiếu, loại lớp,
sản phẩm, mẫu chứng nhận, `app_settings`), kho file (`student-photos`, `certificate-assets`, `certificates`) và lịch
`pg_cron` hết hạn đơn hàng. `app.public_base_url` mặc định là `https://app.vncentre.net`.

Sau đó thêm trường và năm học thật trong **Admin → Trường / Năm học**. Không cần dữ liệu mẫu.

## 3. Cấu hình Auth 👤 (Dashboard → Authentication)

| Mục | Giá trị |
|---|---|
| Sign in / Providers → Email | Bật; **tắt** "Allow new users to sign up" |
| Providers → Phone | Bật (để đăng nhập SĐT + mật khẩu); OTP có sẵn bị chặn bởi hook ở bước 5 |
| URL Configuration → Site URL | `https://app.vncentre.net` |
| Redirect URLs | `https://app.vncentre.net/**` |
| SMTP | Brevo: `smtp-relay.brevo.com`, cổng 587, tài khoản SMTP Brevo, người gửi `no-reply@vncentre.net` |
| Brevo → Security | Tắt chặn "Authorised IPs" (nếu không sẽ lỗi 525) |

Nội dung email song ngữ (mời nhân viên, đặt lại mật khẩu): ⚙️ `node scripts/auth-email-templates.mjs` khi đang
link tới production.

## 4. Khoá bí mật cho Edge Functions ⚙️ / 👤

```powershell
npx supabase secrets set --project-ref <PROD_REF> `
  STAFF_EMAIL_ENABLED=true SITE_URL=https://app.vncentre.net EMAIL_FROM=no-reply@vncentre.net `
  BREVO_API_KEY=<👤> OTP_PEPPER=<ngẫu nhiên 64 hex> STUDENT_PIN_PEPPER=<ngẫu nhiên 64 hex> `
  PAYOS_MOCK_CHECKSUM_KEY=<ngẫu nhiên 64 hex>
```

- `OTP_PEPPER`, `STUDENT_PIN_PEPPER`: tạo mới cho production, **không** đổi sau khi đã có người dùng (đổi PIN pepper làm mọi PIN học viên hết hiệu lực).
- Khi có Zalo: `ZALO_MODE=live ZALO_ACCESS_TOKEN=<👤> ZALO_OTP_TEMPLATE_ID=<👤> ZALO_INVITE_TEMPLATE_ID=<👤>`.
- Khi có SMS: `SMS_MODE=live` + khoá của nhà cung cấp (sau khi viết adapter).
- Khi có payOS: `PAYOS_CLIENT_ID PAYOS_API_KEY PAYOS_CHECKSUM_KEY` (👤 lấy trong trang payOS). Có đủ 3 khoá là tự chạy thật, nút "Giả lập đã nhận tiền" tự tắt.

## 5. Edge Functions ⚙️

```powershell
foreach ($f in 'admin-users','auth-otp','send-invitations','student-accounts','certificates','payments') {
  npx supabase functions deploy $f --project-ref <PROD_REF> --use-api
}
npx supabase functions deploy sms-hook --project-ref <PROD_REF> --use-api --no-verify-jwt
npx supabase functions deploy payos-webhook --project-ref <PROD_REF> --use-api --no-verify-jwt
```

👤 Dashboard → Authentication → Hooks → **Send SMS hook** → HTTPS → `https://<PROD_REF>.supabase.co/functions/v1/sms-hook`.
👤 Trang payOS → Webhook URL: `https://<PROD_REF>.supabase.co/functions/v1/payos-webhook`.

## 6. Tài sản chứng nhận ⚙️

```powershell
node scripts/upload-cert-assets.mjs --ref <PROD_REF> --signature "<đường dẫn PNG chữ ký>"
```

Font, logo, nền mặc định nằm trong `supabase/assets/certificate/`. **Chữ ký không nằm trong repo**: truyền đường dẫn
file trên máy, hoặc tải lên sau ở **Admin → Chứng nhận → Mẫu**.

## 7. Cloudflare (web) 👤 + ⚙️

1. Tạo Worker mới (ví dụ `vncentre-golf-passport-prod`) nối cùng repo GitHub. Nên deploy từ nhánh `production`
   (⚙️ tạo nhánh; phát hành bằng cách merge `main` → `production` sau khi thử trên staging).
2. **Build variables** (không phải Runtime variables): `VITE_SUPABASE_URL=https://<PROD_REF>.supabase.co`,
   `VITE_SUPABASE_ANON_KEY=<anon key>`, `VITE_APP_ENV=production`.
3. Custom domain: `app.vncentre.net`.
4. Kiểm tra `https://app.vncentre.net/status` báo kết nối máy chủ ✅.

## 8. Tài khoản admin đầu tiên 👤 + ⚙️

1. 👤 Dashboard → Authentication → Users → **Invite user** bằng email admin.
2. ⚙️ Gán vai trò: `insert into user_roles (user_id, role) values ('<id>', 'admin');`
3. Admin đăng nhập, tạo tiếp nhân viên trong **Admin → Người dùng và vai trò**.

## 9. Kiểm tra trước khi mở cho phụ huynh ⚙️

- `npm run test:db` với project đã link là production **chỉ chạy khi chưa có dữ liệu thật** (các test tự huỷ dữ liệu bằng ROLLBACK, nhưng vẫn nên chạy trước khi mở).
- Chạy 15 kịch bản nghiệm thu: `docs/van-hanh/nghiem-thu-dot-1.md`.
- Admin → Cấu hình: kiểm tra giá sản phẩm, đơn giá tin Zalo/SMS, `legal.versions` (đổi phiên bản khi có văn bản chính thức — phụ huynh sẽ được hỏi đồng ý lại).
