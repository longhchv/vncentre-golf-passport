# Kế hoạch – Khu quản trị sân golf trong Golf Passport

Minh · 23/10/2026 · Theo `docs/spec/khu-quan-tri-san.md`, `docs/spec/goi-y-quanh-san.md` và 7 màn bản mẫu `docs/mockups/quan-tri-san/` (anh Long đã duyệt).

## 1. Hiện trạng repo (đã kiểm tra)

- Mã trên GitHub `main` khớp với cơ sở dữ liệu staging: migration mới nhất ở cả hai nơi là `20261010000002_crew_kit_cloud`.
- `tsc --noEmit` đạt, 53/53 kiểm thử đạt, `vite build` đạt (máy Minh chạy thử bằng bản thư viện xlsx thay thế vì không tải được cdn.sheetjs.com; repo giữ nguyên).
- Kiến trúc: React 19 + TS, React Router 8 (trang tải lười), TanStack Query, Tailwind 4 (màu navy, bronze, gold, cream có sẵn), i18next (vi/en có kiểm thử cùng bộ khoá), Supabase; admin = `user_roles.role='admin'` (hàm SQL `is_admin()`).
- Cơ sở dữ liệu đã có từ 23/10 (làm qua SQL Editor, chưa nằm trong repo): 5 bảng `gc_` + `gc_import_from_csr()`, `site_courses`, kho `site-photos`, bảng cộng đồng `cm_*`, chốt chặn đăng ký.

## 2. Vị trí trong app

- Thêm mục **"Sân golf"** vào menu admin (`ADMIN_NAV`), giữ kiểu đường dẫn tiếng Anh như các mục khác:
  - `/admin/courses` – Danh sách sân (màn 1)
  - `/admin/courses/new` – Thêm sân (màn 2)
  - `/admin/courses/:id/info` · `/photos` · `/review` · `/places` · `/publish` – màn 3–7, chung một khung có thanh 5 mục dưới cùng như bản mẫu.
- Chỉ không gian admin thấy. Quyền ở cơ sở dữ liệu vẫn là `gc_is_admin()` (admin Golf Passport hoặc admin CSR).

## 3. File sẽ thêm / sửa

| File | Việc |
|---|---|
| `supabase/migrations/20261023000001_course_admin.sql` | Lưu vết 5 bảng `gc_` (nội dung `gda/sql/gc-schema.sql`, chạy lại không lỗi, không xoá dữ liệu) + cho `gc_is_admin()` ghi `site_courses`, `site-photos` + thêm cột thẻ sân vào `site_courses` (mục 5) |
| `supabase/functions/goi-y-quanh-san/index.ts` | Viết lại: chỉ 2 hành động dùng Claude Haiku – `viet-cam-nhan`, `viet-mo-ta`; bỏ toàn bộ Google; dùng `_shared/cors.ts` của repo; thêm tên miền staging `vncentre-golf-passport.longhchv.workers.dev` |
| `src/lib/site-builder/` | `site-builder.mjs`, `gc-adapter.mjs` (chép từ `gda/`) + `index.d.ts` khai báo kiểu tối thiểu |
| `src/features/courses/api.ts` | Đọc/ghi 5 bảng `gc_` bằng TanStack Query; lưu địa điểm kèm `version` để phát hiện sửa trùng |
| `src/features/courses/importFormat.ts` (+ test) | Đọc khối thông tin sân và danh sách địa điểm Minh gửi; báo dòng lỗi; nhận diện nơi đã có (pid, rồi tên gần giống) |
| `src/features/courses/coords.ts` (+ test) | Tách vĩ độ/kinh độ từ link Google Maps (`@lat,lng`, `!3d…!4d…`, `?q=lat,lng`) |
| `src/features/courses/watermark.ts` | Thu nhỏ cạnh dài 1920px, đóng logo VN Centre góc dưới phải (dùng `src/lib/compressImage.ts` có sẵn) |
| `src/features/courses/CoursesPage.tsx` | Màn 1 |
| `src/features/courses/NewCoursePage.tsx` | Màn 2 |
| `src/features/courses/CourseShell.tsx` | Khung chung màn 3–7: đầu trang tên sân + thanh 5 mục |
| `src/features/courses/CourseInfoPage.tsx` · `CoursePhotosPage.tsx` · `CourseReviewPage.tsx` · `CoursePlacesPage.tsx` · `CoursePublishPage.tsx` | Màn 3–7 |
| `src/router.tsx` | Thêm mục menu và route |
| `src/i18n/vi.json`, `en.json` | Nhóm khoá mới `courses.*`; tiếng Việt đúng chữ bản mẫu |
| `src/lib/types.ts` | Kiểu `GcCourse`, `GcTee`, `GcPhoto`, `GcReview`, `GcPlace` |

## 4. Giai đoạn (dừng chờ anh Long duyệt sau mỗi giai đoạn)

1. **B1 – Nền:** migration, Edge Function, site-builder, `api.ts`, `importFormat.ts`, `coords.ts` + kiểm thử. Chưa có màn hình.
2. **B2 – Nhập sân:** màn 1–4 (Danh sách, Thêm sân, Thông tin & tee, Ảnh). Chụp màn hình khổ điện thoại để duyệt.
3. **B3 – Cảm nhận & Quanh sân:** màn 5–6.
4. **B4 – Xem trước & Đăng:** màn 7, đăng `site_courses`, website thêm tầng quốc gia, nhãn Đã đo / Trải nghiệm.

Mỗi giai đoạn: `tsc`, kiểm thử, build đạt rồi mới giao. Triển khai: anh Long đẩy mã lên GitHub → Cloudflare tự build; migration và Edge Function Minh chạy trên Supabase qua Chrome sau khi anh duyệt.

## 5. Rủi ro và cách xử lý

| Rủi ro | Xử lý |
|---|---|
| **Trang chủ website bị ghi đè lẫn nhau:** app CSR khi "Đăng lên website" đang tự dựng trang chủ (`_index`) chỉ từ sân của app CSR → sẽ làm mất thẻ các sân trải nghiệm do Golf Passport đăng | Thêm cột thẻ sân vào `site_courses` (loại, quốc gia, ảnh thẻ, tên Việt/Anh); cả hai app dựng trang chủ từ **toàn bộ** dòng `site_courses`. Phần app CSR cần sửa bên chat CSR – ghi vào việc chuyển giao |
| Sân đo (dữ liệu tee, ảnh từng hố nằm trong app CSR) | Giai đoạn đầu Golf Passport **chỉ đăng sân trải nghiệm**; sân đo vẫn đăng từ app CSR (dùng chung `gc_places` khi app CSR chuyển xong). Golf Passport chỉ sửa ảnh, cảm nhận, quanh sân của sân đo |
| Kho ảnh `site-photos`: app CSR xoá ảnh thừa trong thư mục `<mã sân CSR>/` | Golf Passport dùng thư mục riêng `gc/<id>/`, không đụng thư mục của app CSR |
| Thư viện xlsx tải từ cdn.sheetjs.com | Không đổi; Cloudflare vẫn tải được như trước |
| Bảng `gc_` chưa có cột `org_id` như các bảng khác của Golf Passport | Chấp nhận ở giai đoạn này (một tổ chức); thêm sau nếu mở nhiều tổ chức |
| Edge Function `goi-y-quanh-san` hiện trên Supabase là bản dùng Google | Ghi đè bằng bản mới ở B1; chưa có khoá Google nên bản cũ không gọi Google được |
