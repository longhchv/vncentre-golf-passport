# 17 · Giao việc: "Hồ sơ của tôi" cho người lớn (nhân sự, HLV, BTC, phụ huynh)

Bản 1 · 06/11/2026 · Người soạn: Minh · Chủ sản phẩm duyệt: Vũ Anh Long
Đọc kèm: `11-module-ho-so-nhan-su.md` (module 11b, đã build 24/10 ở nhánh `module-ho-so-nhan-su`), `13-giao-viec-ket-noi-snag-league.md`, `14-…`, đề xuất `de-xuat-ho-so-nguoi-lon-va-he-sinh-thai-doi-tac` (Project).
**Làm sau** spec 15 và 16. Không có hạn cứng.

## 0. Anh Long chốt (06/11/2026)
- Người lớn (nhân viên, HLV, BTC, CTV, TNV, phụ huynh) dùng **cùng mã VNC**; giao diện khi đăng nhập **khác học viên**: không phải lộ trình học, mà là nơi **tích luỹ việc đã làm, giải đấu đã tham gia tổ chức, chứng nhận, bằng cấp, đầu việc đã hoàn thành với VN Centre**, xuất được CV.
- Sau này thêm mục **Kinh doanh** (mã giới thiệu, đối tác, thưởng, điểm) theo **mô hình một cấp**; **không** làm đa cấp, không xin giấy phép đa cấp. Đối tác thử đầu tiên: **sân tập golf Đảo Sen**. Phần này là spec riêng, **không làm trong spec 17**.
- **App giải chạy việc, Passport giữ hồ sơ** (chốt 06/11).

## 1. Hiện trạng (đã đọc repo 06/11)
- Module 11b: `profiles.cv_type`, `staff_engagements` (kind `event` / `project` / `class`), `staff_skills`, `staff_skill_records`, `staff_credentials`, `staff_cv_exports`, kho `staff-files`, Edge Function `staff-cv`, trang `/staff` (Hồ sơ của tôi), `/staff/manage`, `/admin/staff-queue`. Commit `469068e` trên nhánh **`module-ho-so-nhan-su`**, **chưa push, chưa có trong `origin/main`**.
- `origin/main` đã có spec 13–14 (và sắp có 15–16): `tournaments`, `tournament_results`, `league-bridge`, `league_staff`, `/admin/students`.
- Thư mục repo chính đang **checkout nhánh `module-ho-so-nhan-su`**.

## 2. Bước 0 · Gộp module 11b vào main (DỪNG, báo anh Long trước khi đẩy)
1. Sao lưu (`node scripts/backup.mjs …` như `docs/van-hanh/sao-luu-khoi-phuc.md`).
2. Kiểm tra trên Supabase thật: các migration `20261024000001_staff_profile_data`, `…02_staff_profile_screens`, `…03_staff_cv_export` **đã chạy hay chưa** (`supabase migration list`). Ghi kết quả.
3. Tạo nhánh từ `origin/main`, merge (hoặc rebase) `module-ho-so-nhan-su`. Xử lý xung đột: số thứ tự file test (`027–029` của 11b có thể trùng với test của spec 13–16), `router.tsx`, `WorkspaceLayout.tsx`, `vi.json`/`en.json`, `phu-luc-D`.
4. `npm run build`, `npm test` đạt. **Dừng**: báo anh Long kết quả mục 2 và danh sách xung đột đã xử lý.
5. Khi anh Long đồng ý: nếu migration 11b **chưa** chạy → `supabase db push`; nếu **đã** chạy → chỉ đối chiếu, không chạy lại. `npm run test:db` đạt. Deploy `staff-cv`. Đưa giao diện lên. Mở PR.

## 3. Bước 1 · Một trang "Hồ sơ của tôi" cho mọi người lớn
Hiện `/staff` chỉ dành cho nhân sự. Mở rộng thành trang chung cho **mọi tài khoản người lớn**:

- **Đường dẫn:** giữ `/staff` (khỏi gãy link cũ) và thêm lối vào **"Hồ sơ của tôi"** trong thanh điều hướng của **mọi không gian người lớn**: phụ huynh `/app`, HLV `/coach`, trường `/school`, sự kiện `/event`, BTC giải `/league`, admin `/admin`. Tài khoản con (`/me`) **không** có mục này.
- **Thứ tự khối** (khối không có dữ liệu thì ẩn, trừ khối 1):
  1. **Thẻ hồ sơ:** ảnh, họ tên, mã VNC, các vai đang có, ngày tham gia VN Centre, QR định danh.
  2. **Việc đã làm với VN Centre:** dòng thời gian từ `staff_engagements` — sự kiện, **chặng giải đã tham gia tổ chức** (bước 2), lớp đã dạy, dự án. Mỗi dòng: thời gian, tên, vai/vị trí, số đầu việc đã xong / tổng (nếu có), số giờ, nhãn **Đã xác thực** / **Đã duyệt** / **Chờ duyệt**.
  3. **Chứng nhận & bằng cấp:** (a) chứng nhận do VN Centre cấp cho chính người này (bảng `certificates` gắn với hồ sơ VNC của họ, ví dụ khoá CGI); (b) `staff_credentials` đã duyệt. Nút "Thêm chứng chỉ" → hàng chờ admin như 11b.
  4. **Kỹ năng được ghi nhận** (11b).
  5. **Xuất CV** — chỉ hiện khi `profiles.cv_type` đã được admin gán (như 11b).
  6. **Con của tôi** — nếu là phụ huynh: thẻ ngắn mỗi con, bấm sang hồ sơ VĐV (spec 15).
  7. **Kinh doanh** — **chưa làm**; chừa chỗ, ẩn bằng cấu hình `profile.business_tab_enabled = false`.
- Phụ huynh chưa từng làm việc với VN Centre: chỉ thấy khối 1, 6 và lời mời "Thêm chứng chỉ, kinh nghiệm" (tuỳ chọn).
- Theo tông Golf Passport, có nút đổi giao diện; song ngữ vi/en; dùng tốt ở 360px.

## 4. Bước 2 · Nhận lịch sử công việc từ app giải
- `staff_engagements.kind` thêm giá trị **`tournament`**, cột `tournament_id` → `tournaments.id`, thêm `tasks_done`, `tasks_total` (int, null được), `hours` đã có thì dùng lại.
- `league-bridge` thêm lệnh **`staff_history`** (cùng khoá `X-League-Key`, ghi audit):
```json
→ { "action": "staff_history", "event": { "no": 11, "date": "2026-11-08" },
    "rows": [ { "student_code": "VNC-…", "role": "Hội trường & sân tập", "tasks_done": 14, "tasks_total": 15, "hours": 6 } ] }
← { "ok": true, "saved": 3, "unmatched": 0 }
```
- Tìm người theo mã VNC. Có tài khoản → ghi `staff_engagements` với `source = 'league_app'`, **`status = 'pending_review'`** cho đến khi **người phụ trách chặng** (`event_managers` / admin) bấm xác nhận → `approved`, `confirmed_by`. Chưa có tài khoản → lưu chờ, tự gắn khi người đó kích hoạt tài khoản.
- Gửi lại cùng chặng → thay dòng cũ của chặng đó, không nhân đôi.
- **Phía app giải** (Minh làm sau khi bước 2 chạy): nút "Gửi lịch sử BTC sang Golf Passport" ở trang tổng kết chặng.

## 5. Quyền và dữ liệu
- Chủ hồ sơ xem toàn bộ hồ sơ của mình; sửa phần tự khai. Admin toàn quyền. Người phụ trách sự kiện/chặng chỉ ghi nhận trong phạm vi được gán (như 11b).
- `league_staff` **không** xem hồ sơ người lớn của nhau.
- Không hiện SĐT, email của người khác. Hồ sơ người lớn **không** có trang công khai, trừ trang xác thực CV đã có (11b).
- Mọi xác nhận, duyệt, gán `cv_type` ghi `audit_logs`.

## 6. Tiêu chí nghiệm thu
1. Sau bước 0: trang `/staff`, xuất CV của 11b chạy trên app thật; test cũ và mới đều đạt; không mất dữ liệu.
2. Phụ huynh (không phải nhân sự) đăng nhập → thấy "Hồ sơ của tôi" với khối Thẻ hồ sơ + Con của tôi; không có nút xuất CV.
3. Phùng Công Thăng (HLV CGI, BTC) → thấy việc ở sự kiện 10/10, chứng nhận CGI (nếu có trên hệ thống), nút xuất CV theo `cv_type` admin gán.
4. App giải gửi `staff_history` Chặng 11 (dữ liệu thử) → dòng hiện "Chờ duyệt"; anh Long xác nhận → "Đã xác thực", có trong CV xuất ra; gửi lại → không nhân đôi.
5. Người chưa có tài khoản trong `staff_history` → sau khi kích hoạt tài khoản thấy đúng dòng của mình.
6. Tài khoản con `/me` không thấy mục này; `league_staff` không mở được hồ sơ người lớn khác.
7. Khối Kinh doanh không hiện khi cấu hình tắt.

## 7. Thứ tự và điểm dừng
1. Bước 0 (gộp 11b) → **dừng** ở mục 2.4.
2. Bước 1 (trang chung) → **dừng, anh Long thử tiêu chí 2–3** trên điện thoại.
3. Bước 2 (`staff_history`) → **dừng, kiểm tiêu chí 4–5**; báo Minh để nối phía app giải.

## 8. Không làm trong spec này
Mục Kinh doanh, mã giới thiệu, đối tác, thưởng, điểm (spec riêng "Golf Passport Partners") · đăng nhập app giải bằng tài khoản Passport (spec riêng phía app giải) · bước 2 của 11b (số buổi đứng lớp — chờ đợt 2).
