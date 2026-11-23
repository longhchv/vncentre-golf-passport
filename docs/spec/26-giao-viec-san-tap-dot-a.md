# 26 · Giao việc: Sân tập & phòng 3D — đợt A (nền dữ liệu + khu admin)

Bản 1 · 24/11/2026 · Người soạn: Minh · Chủ sản phẩm duyệt: Vũ Anh Long
Đọc kèm: `25-module-san-tap-phong-3d.md` (đặc tả đã duyệt 24/11/2026), `01-du-lieu.md` mục 13, `khu-quan-tri-san.md` (mẫu khu admin), bản thử giao diện "Quản trị sân tập – Golf Passport (bản thử)" (artboard Admin).

**Trạng thái 24/11/2026 (anh Long giao Minh tự làm):** Minh đã code xong khu admin A1, A2, A3, A8, A9 trên nhánh `minh/san-tap-dot-a` (`src/features/venues/`, route `/admin/venues…`, i18n vi/en); `tsc`, 136 test, `vite build` đều qua; đã chạy thử giao diện với Supabase giả lập. Trang web tapgolf đã đọc được dữ liệu sống (thử với dữ liệu giả lập; không kết nối được thì dùng bản nhúng). **Còn lại cho anh Long:** chạy migration + nạp dữ liệu trên staging rồi production, phát hành app, gửi Minh khoá `anon` để bật dữ liệu sống trên web, tạo dự án Cloudflare Pages `tapgolf.vncentre.net`.

## 0. Kết quả của đợt A

Admin đăng nhập Golf Passport → mục **Sân tập & phòng 3D** → sửa một địa điểm → trang **tapgolf.vncentre.net** hiện thông tin mới ngay khi tải lại; mọi lần sửa có lịch sử và khôi phục được.

**Không làm ở đợt này:** đề xuất của người dùng, ảnh, điểm thưởng, chủ sân tự sửa (đợt B); khảo sát, đánh giá (đợt C).

## 1. Trước khi code

1. `git fetch`, nhánh mới từ `origin/main`, worktree riêng. Sao lưu DB (`scripts/backup.mjs`).
2. Rà bản nháp migration `supabase/migrations/20261124000001_practice_venues_a.sql` theo quy ước repo. Bản nháp đã chạy thử trên Postgres 16 sạch (với bảng giả `user_roles`, `profiles`, `partners`): tạo bảng, chạy lại lần 2 không lỗi, nạp đủ 16 hãng + 261 điểm, ghi lịch sử, khôi phục đúng.
3. Khác biệt nào so với đặc tả 25 hoặc quy ước đang dùng (tên trigger `audit` hay `audit_row`, `is_admin` hay `gc_is_admin`, cách đặt quyền) → liệt kê, báo anh Long trước khi build.

## 2. Dữ liệu (migration nháp đã có)

| Thành phần | Nội dung |
|---|---|
| `sim_brands` | 16 hãng máy, thay `brands.js`. Người xem đọc được. |
| `practice_venues` | 261 địa điểm, giữ mã `hn-0`… |
| `practice_venue_history` | Trước/sau mỗi lần sửa, trigger `pv_log_change`; nguồn lấy từ `set_config('pv.source', …)` |
| Vai trò `venue_surveyor`, hàm `is_venue_surveyor()` | Dùng ở đợt C; tạo sẵn để không phải nới ràng buộc lần nữa |
| View `pv_public_venues` | Cột hiển thị, chỉ `active` và `closed_temp`, cấp cho `anon` |
| `pv_next_id(region)`, `pv_restore(history_id)`, `pv_import(brands, venues)` | Cấp mã, khôi phục, nạp dữ liệu |

**Nạp dữ liệu:** `docs/spec/data/sim-brands.json` và `docs/spec/data/practice-venues.json` (Minh xuất từ bản web 23/11/2026, đã có 70 điểm biết hãng máy). Nạp qua màn A9 hoặc SQL Editor: `select * from public.pv_import('<sim-brands.json>'::jsonb, '<practice-venues.json>'::jsonb);` → kết quả phải là `16 | 261`.

## 3. Màn hình admin (`/admin/venues`, thêm vào `ADMIN_NAV`)

Giao diện theo artboard Admin trong bản thử, song ngữ theo i18n hiện có, dùng tốt trên điện thoại.

| Màn | Việc cần có |
|---|---|
| A1 · Tổng quan | Số địa điểm theo vùng và loại; độ phủ: % có hãng máy, có giá, có điện thoại, có fanpage. (Ô "chờ duyệt" để trống tới đợt B.) |
| A2 · Danh sách | Bảng: mã, tên, vùng, loại, hãng máy, trạng thái, cập nhật lần cuối. Lọc vùng / loại / trạng thái / hãng / **thiếu dữ liệu** (chưa có máy, giá, điện thoại). Tìm theo tên. Nút **Thêm địa điểm** (mã cấp bằng `pv_next_id`), **Xuất Excel** (thư viện `xlsx` sẵn có). |
| A3 · Sửa địa điểm | Tab **Thông tin** (tên, loại, vùng, quận, địa chỉ, toạ độ: dán link Google Maps để tách lat/lng như khu quản trị sân, điện thoại, email, web, fanpage, video ≤4) · **Máy & dịch vụ** (hãng máy chọn từ `sim_brands`, dòng máy, phần mềm, số ô/phòng, tiện ích, đỗ xe, giờ, mở muộn, chỉ cư dân) · **Giá** (bảng thêm/xoá dòng: hạng mục, giá, đơn vị, ghi chú, ngày xác minh) · **Trạng thái** (nháp / đang hiện / tạm đóng / đóng hẳn) · **Lịch sử** (danh sách lần sửa: ai, lúc nào, nguồn, các trường đổi; nút Khôi phục bản trước gọi `pv_restore`). |
| A8 · Hãng máy | Danh sách 16 hãng; sửa từng hãng (nhóm, xuất xứ, nhãn, tóm tắt, công nghệ, dòng máy, điểm nổi bật, phần mềm, phù hợp với, nguồn); thêm hãng mới; ẩn hãng. |
| A9 · Nhập dữ liệu | Chọn 2 file JSON → gọi `pv_import`, hiện số dòng đã nạp. Chỉ admin. |

## 4. Trang web tapgolf.vncentre.net

**Minh làm phần này** trên mã trang sân tập hiện có, sau khi migration chạy trên staging:

- Mở trang → đọc `pv_public_venues` và `sim_brands` qua REST của Supabase bằng khoá `anon`; không đọc được trong 5 giây thì dùng bản JSON nhúng sẵn.
- Giữ nguyên giao diện, bộ lọc, đường dẫn `#/hn-0`, chế độ nhúng Facebook khi chạy trên tên miền riêng.
- Đưa lên Cloudflare Pages (tài khoản anh Long), trỏ `tapgolf.vncentre.net`.

**Anh Long gửi Minh:** địa chỉ dự án Supabase và khoá `anon` (khoá công khai, không phải khoá `service_role`), và mở quyền Cloudflare Pages cho dự án mới.

## 5. Kiểm thử bắt buộc trước khi báo xong

1. Gọi REST bằng khoá `anon`: đọc được `pv_public_venues`, `sim_brands`; **không** đọc được `practice_venues`, `practice_venue_history`; không ghi được bảng nào.
2. Tài khoản thường (không admin) không mở được `/admin/venues`, không sửa được qua REST.
3. Admin sửa điện thoại một địa điểm → lịch sử có 1 dòng đúng trước/sau → Khôi phục → giá trị cũ trở lại, lịch sử thêm dòng `restore`.
4. Đổi trạng thái sang `closed` → địa điểm biến khỏi `pv_public_venues`.
5. Thêm địa điểm mới ở Hà Nội → mã `hn-66`.
6. Chạy migration lần 2 không lỗi; chạy `pv_import` lần 2 không tạo dòng trùng.

## 6. Báo cáo khi xong

Báo anh Long 3 dòng: đã làm gì · nhánh/PR và link staging · còn kẹt gì. Dừng lại, chờ anh duyệt trước khi sang đợt B.
