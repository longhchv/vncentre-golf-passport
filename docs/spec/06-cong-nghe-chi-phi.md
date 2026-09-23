# 06 · Công nghệ, tài khoản cần đăng ký, chi phí

## 1. Tiêu chí chọn công nghệ

1. **Một người build bằng Claude Code** (anh Long, chưa từng build app): càng ít thành phần tự vận hành càng tốt.
2. **Chi phí dưới 1 triệu đồng/tháng** giai đoạn đầu.
3. Web app chạy tốt trên điện thoại, cài được lên màn hình; sau này đóng gói lên store được.
4. Có sẵn đăng nhập, cơ sở dữ liệu có phân quyền theo dòng, kho file riêng tư.

## 2. Công nghệ đề xuất

| Thành phần | Chọn | Lý do |
|---|---|---|
| Giao diện | **React + TypeScript + Vite**, **Tailwind CSS**, bộ component shadcn/ui | Phổ biến, Claude Code làm tốt; build ra trang tĩnh, lưu trữ gần như miễn phí |
| Cài lên điện thoại | vite-plugin-pwa | Biểu tượng app, màn hình chờ |
| Song ngữ | i18next (file `vi.json`, `en.json`) | |
| Điều hướng, tải dữ liệu | React Router, TanStack Query | |
| Backend | **Supabase**: cơ sở dữ liệu PostgreSQL + Row Level Security, xác thực, lưu file, Edge Functions | Một dịch vụ lo gần hết backend; phân quyền ngay trong cơ sở dữ liệu |
| Việc chạy phía máy chủ | Supabase Edge Functions | Nhận webhook payOS, gửi Zalo/SMS/email, tạo mã, gửi hàng loạt, dò trùng |
| Lưu trữ web | **Cloudflare Pages** | Trang tĩnh: miễn phí, không giới hạn lượt truy cập |
| Tạo PDF | pdf-lib (+ font Be Vietnam Pro / font có chân hỗ trợ tiếng Việt) | Tạo chứng nhận đúng bố cục |
| Tạo QR | thư viện `qrcode` | Tem decal, chứng nhận |
| Quét QR bằng camera | thư viện quét QR trên trình duyệt (ví dụ `@zxing/browser`) | HLV, admin quét sổ |
| Đọc Excel | SheetJS (`xlsx`) | Nhập danh sách |
| OTP qua Zalo | Zalo Business Solutions — tin mẫu (ZNS) qua Zalo OA của VN Centre | Rẻ hơn SMS |
| SMS dự phòng | Nhà cung cấp SMS brandname tại Việt Nam (chọn khi đăng ký) | Khi phụ huynh không dùng Zalo |
| Email | Dịch vụ gửi email giao dịch có gói miễn phí (ví dụ Resend hoặc Brevo) | OTP cho số nước ngoài, thông báo |
| Thanh toán | **payOS** (chuyển khoản QR, tự xác nhận) | Xem mục 4 |
| Tên miền | `app.vncentre.net`: tạo bản ghi CNAME trong Namecheap trỏ tới Cloudflare Pages | Anh Long đang quản lý tên miền trên Namecheap |
| Mã nguồn | GitHub (anh Long đã có tài khoản) | |

**Ghi chú cho Claude Code:**
- Gửi OTP điện thoại qua Zalo trước, SMS sau, cần một hàm gửi tin tự viết. Supabase cho phép gắn hàm gửi tin riêng vào luồng xác thực số điện thoại (Auth Hook). Claude Code kiểm tra tài liệu Supabase hiện hành khi triển khai; nếu không phù hợp thì tự làm luồng OTP bằng Edge Function, miễn đạt đúng quy tắc F1.
- Không dùng Vercel gói Hobby: gói này chỉ cho dùng cá nhân, phi thương mại ([Vercel](https://vercel.com/docs/plans/hobby)).

## 3. Môi trường

| Môi trường | Dùng cho | Supabase | Web |
|---|---|---|---|
| Local | Anh Long build trên máy | Supabase chạy local hoặc dự án Free riêng | `localhost` |
| Staging | Thử trước khi đưa lên thật | Dự án Free riêng (dữ liệu giả) | `staging.app.vncentre.net` hoặc địa chỉ tạm của Cloudflare |
| Production | Dữ liệu thật | **Gói Pro** | `app.vncentre.net` |

**Không đưa dữ liệu thật của trẻ em lên gói Free.** Dự án Free bị tạm dừng sau 1 tuần không hoạt động và không có sao lưu hằng ngày như gói Pro ([Supabase Pricing](https://supabase.com/pricing)).

## 4. Tài khoản anh Long cần đăng ký

| # | Tài khoản | Ai đứng tên | Việc cần làm | Lưu ý |
|---|---|---|---|---|
| 1 | GitHub | Anh Long | Đã có. Tạo repository riêng tư | |
| 2 | Supabase | VN Centre / HCHV | Tạo 2 dự án: staging (Free), production (Pro). Chọn khu vực Singapore cho gần Việt Nam | Thanh toán bằng thẻ quốc tế |
| 3 | Cloudflare | VN Centre | Tạo Pages project, nối GitHub | Miễn phí |
| 4 | Namecheap | Anh Long | Thêm bản ghi CNAME `app` | Đã có quyền quản lý |
| 5 | Zalo Business Solutions | VN Centre (Zalo OA) | Đăng ký gửi tin mẫu; tạo và gửi duyệt mẫu tin: OTP, lời mời kích hoạt, mời người giám hộ, báo vắng (đợt 2) | Điều kiện tài khoản OA và thời gian duyệt mẫu: **chưa kiểm tra**, cần hỏi Zalo khi đăng ký |
| 6 | SMS brandname | HCHV | Chọn nhà cung cấp, đăng ký tên thương hiệu gửi tin | Thủ tục và thời gian đăng ký brandname: **chưa kiểm tra** |
| 7 | Dịch vụ email | VN Centre | Xác thực tên miền `vncentre.net` (thêm bản ghi DNS) | Hạn mức gói miễn phí: kiểm tra khi đăng ký |
| 8 | payOS | HCHV | Đăng ký doanh nghiệp, liên kết tài khoản ngân hàng của HCHV | Ngân hàng doanh nghiệp payOS đang hỗ trợ: MB, KienlongBank, OCB, BIDV, Shinhan Bank ([payOS](https://payos.vn/)). Cơ chế webhook xác nhận thanh toán: kiểm tra trong tài liệu kỹ thuật payOS khi tích hợp |

**Nên làm ngay** (các thủ tục có thể mất thời gian duyệt): #5 Zalo, #6 SMS brandname, #8 payOS.

## 5. Chi phí dự kiến hằng tháng

| Khoản | Giai đoạn thí điểm | Khi chạy thật | Nguồn / ghi chú |
|---|---|---|---|
| Supabase | 0 đ (Free, dữ liệu giả) | Pro 25 USD/tháng (khoảng 650–700 nghìn đồng, tuỳ tỷ giá) | [Supabase Pricing](https://supabase.com/pricing): Pro gồm 8 GB cơ sở dữ liệu, 100 GB lưu file, 100.000 người dùng hoạt động/tháng |
| Cloudflare Pages | 0 đ | 0 đ | Trang tĩnh miễn phí, không giới hạn ([Cloudflare](https://developers.cloudflare.com/workers/platform/pricing/)) |
| payOS | 0 đ | 0 đ | Công bố miễn phí khởi tạo, duy trì, giao dịch từ 23/01/2026 ([payOS](https://payos.vn/)) |
| Tin Zalo OTP | 300 đ/tin | 300 đ/tin | [Zalo Business Solutions](https://zalo.solutions/business-message/pricing) |
| Tin Zalo loại khác | 200 đ/tin | 200 đ/tin | Như trên |
| SMS dự phòng | Chưa tra giá | Chưa tra giá | Chỉ dùng khi Zalo thất bại |
| Email | 0 đ (trong hạn mức miễn phí) | 0 đ nếu trong hạn mức | |
| Tên miền | Đã có | Đã có | |

**Ước tính chi phí tin nhắn:**
- Kích hoạt 1.600 phụ huynh bằng OTP Zalo: khoảng 1.600 × 300 đ = **480.000 đ**, chỉ trả một lần.
- Gửi lời mời kích hoạt 1.200 phụ huynh Phương Mai qua Zalo: khoảng 1.200 × 200 đ = **240.000 đ**.
- Đăng nhập các lần sau dùng mật khẩu, không tốn tin.

**Kết luận:** chi phí nền (Supabase Pro) khoảng 650–700 nghìn đồng/tháng, vẫn trong ngân sách 1 triệu. **Những tháng gửi lời mời hoặc kích hoạt hàng loạt sẽ vượt ngân sách** vì tiền tin nhắn, nên admin phải xem ước tính chi phí trước mỗi lần gửi hàng loạt (đã có trong F3).
