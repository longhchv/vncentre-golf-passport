# Sao lưu và khôi phục

Dự án đang dùng Supabase **gói Free** (staging, dùng tạm cho sự kiện 10/10/2026): **không có sao lưu tự động**. Sao lưu bằng
script cho tới khi nâng lên gói Pro (Pro có sao lưu hằng ngày, giữ 7 ngày).

## Sao lưu

```powershell
node scripts/backup.mjs --out C:/dev/backups --copy-to "G:/My Drive/vncentre-golf-passport/sao-luu" --keep 30
```

Mỗi lần chạy tạo một file `<project_ref>-<YYYYMMDD-HHMM>.zip` (giờ Việt Nam) gồm:

| File | Nội dung |
|---|---|
| `db.dump` | Toàn bộ dữ liệu app (schema `public`), định dạng `pg_dump -Fc` |
| `auth.json` | Tài khoản đăng nhập (`auth.users`, `auth.identities`), giữ nguyên mật khẩu đã băm |
| `storage/<kho>/…` | Toàn bộ file: ảnh học viên, PDF chứng nhận, tài sản chứng nhận (có chữ ký) |
| `counts.json` | Số dòng từng bảng lúc sao lưu, dùng để đối chiếu khi khôi phục |
| `manifest.json` | Thời điểm, dự án, phiên bản pg_dump, số file |

- Không cần mật khẩu database: script xin tài khoản đăng nhập tạm 5 phút qua Management API (`SUPABASE_ACCESS_TOKEN`).
- Cần `pg_dump` 17 ở `C:\dev\tools\pgsql\bin` (bộ PostgreSQL 17 dạng nén, không cài dịch vụ).
- Giữ 30 bản mới nhất ở mỗi nơi (`--keep`).
- **File sao lưu chứa dữ liệu cá nhân** (tên trẻ, SĐT, email). Chỉ để ở máy này và thư mục Google Drive riêng tư, không chia sẻ.
- Lịch tự sao lưu (Windows Task Scheduler) chỉ chạy khi máy bật.

Đã kiểm tra 07/10/2026: khôi phục `db.dump` vào PostgreSQL 17 tạm trên máy → 40/40 bảng, 1.056 dòng khớp `counts.json`.

## Khôi phục

Dùng khi mất dữ liệu, hoặc chuyển sang dự án Supabase mới (ví dụ khi nâng gói Pro).

1. Dự án đích phải **đã chạy đủ migration**: `npx supabase link --project-ref <ĐÍCH>` rồi `npx supabase db push`.
2. Chạy (lệnh **xoá sạch dữ liệu app ở dự án đích** trước khi nạp):

```powershell
node scripts/restore-backup.mjs --zip C:/dev/backups/<file>.zip --ref <ĐÍCH> --yes-xoa-du-lieu-dich
# khôi phục đè lên chính dự án nguồn (sau sự cố trên staging): thêm --cung-du-an
```

3. Script tự đối chiếu số dòng từng bảng với `counts.json` và báo "XONG" hoặc danh sách bảng lệch.
4. Sau khi khôi phục: deploy lại Edge Functions và đặt lại secret nếu là dự án mới (`trien-khai-production.md` mục 4–5);
   người dùng đăng nhập lại (phiên cũ không được sao lưu).

> Phần khôi phục vào **một dự án Supabase thật** (bước nạp tài khoản đăng nhập và tải lại file kho) chưa được chạy thử,
> vì cần một dự án đích trống. Nên chạy thử một lần khi có dự án Pro, trước khi xoá staging.
