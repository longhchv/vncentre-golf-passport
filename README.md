# VN Centre Golf Passport

Web app (PWA) hồ sơ golf của học viên VN Centre. Tài liệu yêu cầu nằm trong [`docs/spec/`](docs/spec/README.md).

Đang build: **Đợt 1 — Nền tảng**, theo từng bước nhỏ.

## Chạy trên máy

```powershell
npm install
copy .env.example .env.local   # rồi điền khoá Supabase staging
npm run dev                    # mở http://localhost:5173
npm test                       # chạy kiểm thử tự động
npm run build                  # kiểm tra kiểu và đóng gói vào dist/
```

Muốn mở thử trên điện thoại cùng mạng Wi-Fi thì chạy `npm run dev:phone` và mở địa chỉ `http://<IP máy tính>:5173`. Cách này chưa dùng được camera và chưa cài được app lên màn hình, vì hai việc đó cần HTTPS; hãy dùng bản staging trên Cloudflare.

## Triển khai (Cloudflare Pages)

| Mục | Giá trị |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Biến môi trường | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_ENV=staging`, `NODE_VERSION=24` |

Mỗi lần đẩy code lên GitHub, Cloudflare tự build lại. Trang `/status` cho biết phiên bản đang chạy và app đã kết nối được Supabase chưa.

## Cấu trúc

- `src/pages`, `src/layouts`, `src/components`: giao diện
- `src/i18n/{vi,en}.json`: mọi chữ hiển thị (hai file phải có cùng bộ khoá, có kiểm thử)
- `public/logo.svg`: biểu tượng tạm; sửa xong chạy `npm run icons` để sinh lại icon app
- `supabase/` (từ Bước 2): migration, seed, Edge Functions, kiểm thử phân quyền
