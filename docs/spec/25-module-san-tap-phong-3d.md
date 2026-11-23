# 25 · Module Sân tập & phòng golf 3D: quản trị, đóng góp của người dùng, khảo sát và đánh giá

Bản 1 · 23/11/2026 · Người yêu cầu: Vũ Anh Long · Người soạn: Minh
Đọc kèm: `01-du-lieu.md` (quy ước chung, mục 13 phân quyền), `khu-quan-tri-san.md` (mẫu khu quản trị sân golf, bảng `site_courses`), `18-giao-viec-golf-passport-partners-gd1.md` (bảng `partners`), bản thử giao diện "Quản trị sân tập – Golf Passport (bản thử)", trang tổng hợp sân tập hiện tại (`golf-practice-hanoi.html`, dữ liệu `all.json` 261 điểm, `brands.js` 16 hãng máy), phiếu khảo sát hiện tại (`survey.html`).

**Trạng thái: anh Long duyệt 24/11/2026 (kèm Q4–Q7). Giao việc đợt A: `26-giao-viec-san-tap-dot-a.md`.**

---

## 0. Quyết định đã chốt (23/11/2026)

| # | Quyết định |
|---|---|
| Q1 | Dùng chung Supabase của Golf Passport. Đăng nhập bằng đúng tài khoản Golf Passport (mã VNC). Không lập hệ tài khoản riêng. |
| Q2 | Người dùng đã đăng nhập **gửi đề xuất** (thêm địa điểm, sửa thông tin, ảnh, báo đóng cửa); **admin duyệt** mới hiện lên web. |
| Q3 | Đánh giá chia **hai lớp riêng**: điểm khảo sát VN Centre (chuyên môn, có huy hiệu) và đánh giá sao của người dùng. Không gộp thành một điểm. |
| Q4 (24/11) | **Có** cộng điểm vào ví người lớn cho đóng góp được duyệt. Mức điểm: đề xuất ở mục 2.10, anh Long chốt trước đợt B. |
| Q5 (24/11) | **Có** cho chủ sân tập / phòng 3D nhận trang và tự cập nhật (đợt B, mục 2.11). |
| Q6 (24/11) | Trang web sân tập chính thức đặt ở **tapgolf.vncentre.net**. |
| Q7 (24/11) | Đánh giá người dùng **hiện ngay**; admin ẩn sau nếu cần, để giữ khách quan. |

**Ngoài phạm vi:** đặt chỗ, thanh toán, voucher.

## 1. Nguyên tắc bắt buộc

1. **Migration chỉ thêm** bảng, cột, vai trò. Không sửa bảng đang chạy, trừ việc nới ràng buộc `user_roles_role_check` để thêm vai trò mới (mục 2.8). Làm trên **staging** trước.
2. **Nguồn sự thật duy nhất** là cơ sở dữ liệu. Trang web sân tập đọc từ Supabase thay cho JSON nhúng cứng. Bản JSON nhúng giữ lại làm dự phòng khi không kết nối được.
3. **Không ai ngoài admin (và chủ sân với các trường ở mục 2.11, từ đợt B) ghi thẳng** vào bảng địa điểm. Người dùng và khảo sát viên chỉ ghi vào bảng đề xuất / phiếu khảo sát / đánh giá. Admin duyệt qua hàm RPC, hàm này ghi lịch sử.
4. **Mọi thay đổi có lịch sử**: ai sửa, sửa gì (trước/sau), lúc nào, từ đề xuất nào. Khôi phục được về bản trước.
5. **Ảnh:** người gửi phải tick "Ảnh do tôi chụp, tôi đồng ý cho VN Centre dùng trên web". Không lấy ảnh từ fanpage hay website địa điểm. App tự nén ≤ 1600 px, JPEG; ảnh lên web đóng logo như khu quản trị sân.
6. Song ngữ theo quy ước `*_vi`, `*_en`. Ô trống tiếng Anh thì hiện tiếng Việt.
7. Không lưu email hay số điện thoại cá nhân của người đóng góp ra trang công khai; trên web chỉ hiện tên hiển thị đã rút gọn (ví dụ "Long V.").

## 2. Dữ liệu

### 2.1 `practice_venues` — địa điểm

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | text, khoá chính | Giữ mã hiện tại (`hn-0`, `hcm-23`, `north-21`…) để không vỡ đường dẫn web `#/hn-0`. Điểm mới: `<vùng>-<số tiếp theo>`, hàm cấp mã. |
| `region` | text | `hn`, `hcm`, `dn`, `north`, `central`, `south` (đúng 6 vùng web đang dùng) |
| `name` | text | |
| `type` | text | `range` (sân tập ngoài trời), `3d`, `academy`, `course` (trong sân golf), `mini` |
| `district`, `address` | text | |
| `lat`, `lng` | numeric(9,6) | |
| `phone`, `email`, `web` | text | |
| `fb_url`, `fb_chain_url`, `fb_chain_name` | text | Fanpage riêng / fanpage chuỗi |
| `videos` | text[] | Tối đa 4 link video Facebook |
| `hours` | text | Ví dụ `06:00–22:00`, `24h` |
| `late` | bool | Mở sau 22h |
| `machine` | text, FK `sim_brands.key` | Hãng máy; null = chưa rõ |
| `machine_detail` | jsonb | `{model, software, bays, note}` — dòng máy, phần mềm, số phòng/số ô |
| `bays` | int | Số ô tập / số phòng |
| `svc` | text[] | Tiện ích: `food`, `cafe`, `class`, `parking_free`, `kids`, `card`, `vip`… (đúng mã web đang dùng) |
| `parking` | text | `free`, `paid`, `none`, `unknown` |
| `parking_note` | text | |
| `residents_only` | bool | Chỉ dành cho cư dân |
| `prices` | jsonb | Mảng `{item_vi, item_en, price, unit, note, verified_at}` |
| `google_rating`, `google_reviews`, `google_at` | numeric, int, date | Lưu cứng, cập nhật thủ công |
| `status` | text | `draft`, `active`, `closed_temp`, `closed` — web chỉ hiện `active` và `closed_temp` (kèm nhãn) |
| `partner_id` | uuid, FK `partners.id`, null | Nối với đối tác Golf Passport Partners nếu sân tập là đối tác |
| `cover_photo_id` | uuid, FK `practice_venue_photos.id` | Ảnh đại diện |
| `vnc_score`, `vnc_scored_at` | numeric(3,1), date | Điểm khảo sát VN Centre đã công bố (mục 2.5) |
| `user_rating`, `user_reviews` | numeric(2,1), int | Tự tính từ đánh giá đã duyệt (trigger) |
| `created_by`, `created_at`, `updated_by`, `updated_at` | | |

### 2.2 `sim_brands` — hồ sơ hãng máy

Chuyển nguyên `brands.js` (16 hãng) vào bảng để admin sửa không cần phát hành lại web.

| Cột | Ý nghĩa |
|---|---|
| `key` (khoá chính) | `Trackman`, `Golfzon`, `Garmin R50`… đúng tên đang dùng |
| `group` | `tour`, `screen`, `home` |
| `origin_vi`, `origin_en`, `badges text[]` | |
| `sum_vi`, `sum_en`, `tech_vi`, `fit_vi` | |
| `models`, `feats`, `apps` | jsonb, cấu trúc như `brands.js` |
| `sources` | text[] link nguồn |
| `sort`, `active` | |

### 2.3 `practice_venue_submissions` — đề xuất của người dùng

| Cột | Ý nghĩa |
|---|---|
| `id` uuid | |
| `kind` | `new_venue`, `edit`, `report_closed`, `photo_batch` |
| `venue_id` | null khi `new_venue` |
| `payload` jsonb | Chỉ các trường thay đổi, ví dụ `{"phone":"0912…","machine":"Trackman"}`. `new_venue` thì đủ trường tối thiểu (tên, loại, vùng, địa chỉ, toạ độ hoặc link Google Maps). |
| `evidence` | text — link/ghi chú nguồn ("tôi đến ngày…", link fanpage) |
| `submitted_by`, `submitted_at` | |
| `status` | `pending`, `approved`, `partly_approved`, `rejected`, `duplicate` |
| `reviewed_by`, `reviewed_at`, `review_note` | Lý do từ chối hiện cho người gửi |
| `applied_fields` text[] | Các trường admin đã chấp nhận (duyệt từng trường) |

Giới hạn chống spam: tối đa 20 đề xuất đang chờ mỗi tài khoản; 1 đề xuất `new_venue` cùng tên trong 150 m sẽ bị cảnh báo trùng.

### 2.4 `practice_venue_photos`

`id`, `venue_id`, `submission_id` (null nếu admin tải), `path` (bucket `venue-photos`, public đọc sau khi duyệt), `caption_vi/en`, `tag` (`facade`, `bay`, `simulator`, `range`, `cafe`, `parking`, `price_board`, `other`), `consent` bool bắt buộc true, `uploaded_by`, `status` (`pending`, `approved`, `rejected`), `sort`.

Ảnh `pending` nằm trong thư mục riêng, chỉ admin và người tải thấy.

### 2.5 `practice_venue_surveys` — khảo sát VN Centre (lớp 1)

Chuyển phiếu khảo sát hiện tại (`survey.html`) vào app; các ô giữ nguyên (giá, máy, tiện ích, đỗ xe, giờ tốt, ưu/nhược).

| Cột | Ý nghĩa |
|---|---|
| `venue_id`, `surveyor_id`, `visit_date` | |
| `answers` jsonb | Toàn bộ câu trả lời phiếu |
| `scores` jsonb | 6 tiêu chí chấm 1–10: `facility` (cơ sở vật chất), `tech` (máy & công nghệ), `service` (dịch vụ, nhân viên), `clean` (vệ sinh), `value` (đáng tiền), `family` (thân thiện gia đình & trẻ em) |
| `overall` | numeric(3,1) — trung bình 6 tiêu chí, tự tính |
| `pros_vi`, `cons_vi`, `pros_en`, `cons_en` | |
| `status` | `draft`, `submitted`, `approved`, `rejected` |
| `assigned_by`, `assigned_at` | Admin giao địa điểm cho khảo sát viên |

Khi admin duyệt phiếu: các trường thông tin (giá, máy, tiện ích…) đi qua bước so sánh như đề xuất (mục 4, A4); điểm `overall` ghi vào `practice_venues.vnc_score`. Trên web hiện huy hiệu **"VN Centre đã khảo sát · tháng/năm"** và 6 tiêu chí.

### 2.6 `practice_venue_reviews` — đánh giá người dùng (lớp 2)

`venue_id`, `user_id`, `stars` 1–5, `sub` jsonb (tuỳ chọn: `tech`, `service`, `value`, `family` 1–5), `text`, `visit_month`, `status` (`published`, `hidden`; mặc định `published` theo Q7), `hidden_reason`, `hidden_by`, `report_count`, `created_at`, `updated_at`. Mỗi tài khoản một đánh giá mỗi địa điểm; gửi lại là sửa bản cũ (vẫn hiện ngay, ghi lịch sử sửa). Người xem có nút **Báo cáo đánh giá**; đủ 3 báo cáo thì đánh giá vào hàng chờ A6 (vẫn hiện cho tới khi admin quyết định). Chủ sân (vai `partner_staff` của địa điểm) **không** ẩn được đánh giá, chỉ trả lời công khai một lần. Trigger cập nhật `user_rating`, `user_reviews` khi trạng thái đổi.

### 2.10 Điểm thưởng cho người đóng góp (Q4 — mức đề xuất, chốt trước đợt B)

Ghi vào ví người lớn (`reward_ledger`, quy ước spec 19 và D58: 1 điểm = 1.000 đồng), chỉ khi admin duyệt; người dưới 16 tuổi không nhận vào ví người lớn.

| Đóng góp được duyệt | Điểm đề xuất |
|---|---|
| Thêm địa điểm mới (đủ tên, loại, toạ độ, điện thoại) | 20 |
| Sửa thông tin, mỗi đề xuất có ít nhất 1 trường được nhận | 5 |
| Xác nhận hãng máy kèm ảnh máy | 10 |
| Ảnh được duyệt (tối đa 5 ảnh mỗi địa điểm mỗi người) | 2 / ảnh |
| Bảng giá kèm ảnh bảng giá | 10 |
| Phiếu khảo sát của khảo sát viên | theo thoả thuận công việc, không qua ví |
| Đánh giá sao | 0 (không thưởng, để giữ khách quan) |

Trần mỗi tài khoản: 300 điểm / tháng. Đề xuất bị phát hiện sai sau khi duyệt: admin thu hồi điểm bằng dòng ghi âm trong sổ.

### 2.11 Chủ sân tự cập nhật (Q5 — đợt B)

- Địa điểm có `partner_id`; nhân viên đối tác (`partner_staff`, vai `manager`) thấy mục **Trang của tôi** trong không gian `/partner` sẵn có.
- Chủ sân **sửa thẳng, không qua duyệt**: giờ mở cửa, điện thoại, giá, khuyến mãi, ảnh, số ô/phòng, hãng máy & phần mềm. Mọi lần sửa ghi lịch sử, admin khôi phục được.
- Chủ sân **không** sửa: tên, toạ độ, loại, trạng thái hiện/ẩn, điểm VN Centre, đánh giá người dùng.
- Địa điểm chưa là đối tác: chủ sân gửi yêu cầu **Nhận trang** (kèm ảnh giấy phép kinh doanh hoặc xác nhận qua fanpage), admin duyệt thì tạo dòng `partners` trạng thái `draft` và gán `partner_staff`.
- Trên web hiện nhãn "Thông tin do chủ sân cập nhật · ngày" cạnh các trường chủ sân sửa.

### 2.7 `practice_venue_history`

`venue_id`, `changed_by`, `changed_at`, `source` (`admin`, `submission`, `survey`, `import`, `restore`), `source_id`, `before` jsonb, `after` jsonb. Ghi bằng trigger trên `practice_venues`.

### 2.8 Vai trò

Thêm vai trò `venue_surveyor` (khảo sát viên) vào `user_roles`. Admin gán ở màn Người dùng sẵn có.

| Ai | Xem | Ghi |
|---|---|---|
| Khách chưa đăng nhập | Địa điểm `active`/`closed_temp`, ảnh và đánh giá đã duyệt, hãng máy | Không |
| Tài khoản Golf Passport | Như trên + đề xuất, ảnh, đánh giá của chính mình | Đề xuất, ảnh, đánh giá |
| `venue_surveyor` | Như trên + địa điểm được giao | Phiếu khảo sát của mình |
| `admin` | Tất cả | Tất cả, qua RPC duyệt |

Viết hàm `is_venue_surveyor()` theo mẫu `is_partner_staff()`.

### 2.9 Hàm (RPC)

- `pv_approve_submission(id, fields text[], note)` — áp dụng các trường được chọn, đặt trạng thái, ghi lịch sử. `new_venue` thì cấp mã mới.
- `pv_reject_submission(id, note)`.
- `pv_approve_survey(id, fields text[], publish_score bool)`.
- `pv_moderate_review(id, status)`, `pv_moderate_photo(id, status, is_cover)`.
- `pv_restore(venue_id, history_id)`.
- `pv_import(json)` — nạp 261 điểm từ `all.json` và 16 hãng từ `brands.js` (chạy một lần, admin).
- View công khai `pv_public_venues` (chỉ cột hiển thị + ảnh đại diện + `vnc_score` + `user_rating`) cấp quyền `anon`.

## 3. Giao diện người dùng (đã đăng nhập)

Vào từ hai nơi: nút trên trang web sân tập, hoặc mục **"Sân tập & phòng 3D"** trong Golf Passport (mọi không gian làm việc, kể cả người lớn tự học).

| Màn | Nội dung |
|---|---|
| U1 · Nút trên web | Trang chi tiết mỗi địa điểm thêm 3 nút: **Đề xuất sửa thông tin**, **Gửi ảnh**, **Viết đánh giá**. Danh sách thêm nút **Thêm địa điểm mới**. Chưa đăng nhập → chuyển sang app.vncentre.net đăng nhập rồi quay lại đúng địa điểm. |
| U2 · Thêm địa điểm mới | Tên, loại, vùng, dán link Google Maps (tự lấy toạ độ) hoặc chấm trên bản đồ, địa chỉ, điện thoại, fanpage, hãng máy (chọn từ danh sách hoặc "Không rõ"), ảnh, nguồn thông tin. Cảnh báo nếu có địa điểm trùng tên trong 150 m. |
| U3 · Đề xuất sửa | Form đã điền sẵn dữ liệu hiện tại; ô nào đổi tô vàng; chỉ gửi ô thay đổi. Có lựa chọn "Địa điểm đã đóng cửa / tạm đóng". |
| U4 · Gửi ảnh | Chọn tối đa 10 ảnh, gắn nhãn, tick đồng ý bắt buộc. |
| U5 · Viết đánh giá | Sao 1–5, 4 tiêu chí con (tuỳ chọn), lời nhận xét, tháng đến. Đăng là hiện ngay (Q7). |
| U6 · Đóng góp của tôi | Danh sách đề xuất, ảnh, đánh giá kèm trạng thái (Chờ duyệt / Đã duyệt / Duyệt một phần / Từ chối + lý do). |

Khảo sát viên có thêm:

| Màn | Nội dung |
|---|---|
| K1 · Việc được giao | Danh sách địa điểm admin giao, sắp theo khoảng cách, nút chỉ đường. |
| K2 · Phiếu khảo sát | Phiếu hiện tại chuyển vào app + 6 tiêu chí chấm điểm + chụp ảnh tại chỗ. Lưu nháp khi mất mạng, gửi khi có mạng. |

## 4. Giao diện admin (`/admin/venues`)

| Màn | Nội dung |
|---|---|
| A1 · Tổng quan | Số việc chờ duyệt theo loại (đề xuất, ảnh, đánh giá, phiếu khảo sát); độ phủ dữ liệu: % địa điểm có hãng máy, giá, ảnh, khảo sát; theo vùng. |
| A2 · Danh sách | Bảng địa điểm, lọc vùng / loại / trạng thái / hãng / **thiếu dữ liệu** (chưa có máy, chưa có giá, chưa có ảnh, chưa khảo sát). Nút Thêm địa điểm, Xuất Excel. |
| A3 · Sửa địa điểm | Đủ mọi trường mục 2.1, chia tab: Thông tin · Máy & dịch vụ · Giá · Ảnh · Khảo sát & đánh giá · Lịch sử (khôi phục). Admin sửa thẳng. |
| A4 · Hàng chờ duyệt | Mỗi đề xuất hiện bảng so sánh **Hiện tại / Đề xuất** theo từng trường, tick chọn trường nhận; nút Duyệt, Duyệt phần đã chọn, Từ chối (bắt buộc lý do), Đánh dấu trùng. Đề xuất `new_venue` hiện bản đồ và các địa điểm gần. |
| A5 · Duyệt ảnh | Lưới ảnh chờ, duyệt/từ chối, chọn ảnh đại diện. |
| A6 · Đánh giá | Mọi đánh giá mới nhất và đánh giá bị báo cáo; ẩn (bắt buộc lý do) / hiện lại. |
| A7 · Khảo sát | Giao địa điểm cho khảo sát viên; danh sách phiếu đã gửi; duyệt phiếu (so sánh như A4) và bật/tắt công bố điểm VN Centre. |
| A8 · Hãng máy | Sửa hồ sơ 16 hãng (bảng `sim_brands`), thêm hãng mới. |

## 5. Trang web công khai

- Địa chỉ chính thức: **tapgolf.vncentre.net** (Cloudflare Pages, cùng tài khoản với web chính). Đọc `pv_public_venues` và `sim_brands` qua khoá `anon` khi mở trang; lỗi mạng thì dùng bản JSON nhúng sẵn (cập nhật mỗi lần phát hành).
- Thẻ địa điểm và trang chi tiết hiện hai lớp đánh giá tách bạch:
  - **Điểm VN Centre** (ví dụ 8,4/10, huy hiệu "VN Centre đã khảo sát · 11/2026", 6 tiêu chí).
  - **Người dùng đánh giá** (ví dụ ★ 4,6 · 12 đánh giá) và **Google** (★ giữ như hiện tại, ghi rõ nguồn Google).
- Bộ lọc thêm "Đã được VN Centre khảo sát".
- Ảnh đã duyệt hiện thành dải ảnh ở đầu trang chi tiết.

## 6. Thứ tự làm (mỗi đợt xong dừng, anh Long duyệt)

| Đợt | Nội dung | Kết quả kiểm được |
|---|---|---|
| **A · Nền** | Bảng 2.1, 2.2, 2.7; vai trò; nạp 261 điểm + 16 hãng; màn A1, A2, A3, A8; trang web đọc từ Supabase | Admin sửa một địa điểm → web đổi ngay; có lịch sử, khôi phục được |
| **B · Đóng góp** | Bảng 2.3, 2.4; màn U1–U4, U6, A4, A5; điểm thưởng 2.10; chủ sân tự cập nhật 2.11 | Một tài khoản thử gửi đề xuất + ảnh → admin duyệt từng trường → web đổi, ví người lớn cộng điểm; tài khoản chủ sân sửa giờ → web đổi ngay |
| **C · Đánh giá** | Bảng 2.5, 2.6; màn U5, K1, K2, A6, A7; hiển thị hai lớp điểm trên web | Khảo sát viên gửi phiếu, admin duyệt, điểm VN Centre hiện trên web; đánh giá người dùng hiện ngay, admin ẩn được |

## 7. Kiểm thử bắt buộc

1. Khách chưa đăng nhập không ghi được bảng nào (thử bằng khoá `anon`).
2. Tài khoản thường không sửa được `practice_venues`, không thấy đề xuất của người khác.
3. Duyệt một phần: chỉ trường được chọn thay đổi, lịch sử ghi đúng trước/sau.
4. Khôi phục về bản trước hoạt động.
5. `user_rating` tính lại đúng khi ẩn/hiện đánh giá; đánh giá mới hiện ngay.
6. Web vẫn hiện đủ 261 điểm khi tắt mạng tới Supabase (dùng bản dự phòng).
7. Đường dẫn cũ `#/hn-0`… vẫn mở đúng địa điểm.

## 8. Khác biệt cần báo lại trước khi build

Đội code đọc `01-du-lieu.md` mục 13 và migration `20261023000001_course_admin.sql`, `20261107000001_partners_gd1.sql`. Nếu tên bảng, cách đặt quyền hay bucket ảnh khác quy ước đang dùng thì liệt kê và báo anh Long trước khi build.

## 9. Việc còn mở

1. Mức điểm thưởng mục 2.10 — anh Long chốt trước đợt B.
2. Giấy tờ chứng minh khi chủ sân nhận trang (mục 2.11) — anh Long chốt trước đợt B.
