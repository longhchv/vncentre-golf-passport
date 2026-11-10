# 22 · Mapping — Lộ trình học bổng v2 đối chiếu với code / schema thật

Bước 1 của spec 22 (mục 8). 09/11/2026.

> **09/11/2026 — anh Long duyệt toàn bộ theo đề xuất (Q1–Q7, cột "Đề xuất" ở mục 6).** Bước 2 làm trong worktree từ `origin/main`, chạy thử trên PGlite trước; đẩy lên staging chỉ khi anh Long đồng ý riêng.

Nguồn đối chiếu: `origin/main` @ `e6d5e06` (sau PR #11):
- `supabase/migrations/20261106000001_athlete_card_scholarship.sql` (bảng, hàm, seed 17 mục),
- `20261106000002_scholarship_follow_merge.sql` (checklist đi theo khi gộp học viên, cột `merge_trail`),
- `20261106000004_athlete_card_v1_1.sql` (bản hiện hành của `scholarship_checklist`: không quyền → lỗi 42501),
- `src/features/profile/ScholarshipChecklist.tsx`, `src/features/admin/ScholarshipItemsPage.tsx`, tests `036`, `037`,
- `docs/spec/data/scholarship-checklist.csv` (v1) và `scholarship-checklist-v2.csv` (78 mục).

> **Chưa đọc được schema staging thật** (phiên này không có token, không tự tạo). Mọi điều dưới đây là theo migration trong repo. Trước bước 2 cần một truy vấn chỉ đọc trên staging (mục 7).
>
> **Lưu ý:** theo ghi chú phiên SNAG (05/11), app.vncentre.net và staging **dùng chung một dự án Supabase** (`zrfipnqkjrhzrscaaeth`). "Làm trên staging trước" (nguyên tắc 2) vì vậy là chạy thẳng trên dữ liệu thật — xem câu hỏi Q1.

---

## 1. Tóm tắt: giữ · đổi · thêm

| | v1 hiện có | v2 |
|---|---|---|
| **Giữ** | `scholarship_checklist_items` (id, stage, item_group, title_vi/en, help_vi/en, auto_source, sort_order, is_active); `scholarship_checklist_status` (student_id, item_id, status 3 mức, note ≤ 500, updated_by, `merge_trail`); `can_view_athlete_profile` (phụ huynh đã xác nhận · chính học viên · admin); `set_scholarship_item` + audit `scholarship_item_set`; 3 nguồn tự động `courses / competitions / culture_awards`; trigger gộp học viên; RLS admin-only trên danh mục, không ai ghi thẳng bảng trạng thái | Giữ nguyên |
| **Đổi** | CHECK `stage` (3 giá trị), CHECK `item_group` (3 giá trị); 17 dòng danh mục; hình dạng JSON của `scholarship_checklist` (3 cấp); trang admin (chọn `stage` tay) | `stage` thêm `post_graduation`, `item_group` thêm `admission` (drop + add constraint cùng tên, chỉ nới); 15 dòng cập nhật tại chỗ, 2 dòng `is_active = false`; `stage` tự suy từ `start_grade` |
| **Thêm** | — | 6 cột danh mục (`code`, `track`, `start_grade`, `start_note_vi`, `source_ref`, `is_verified`); bảng `student_scholarship_tracks`; **lớp dạng số** cho học viên + lịch sử lớp theo năm học + cờ "không tự lên lớp"; job pg_cron 05/9; hàm đọc mới cho checklist theo lớp và so sánh hướng; thông báo trong app khi lên lớp |

## 2. Danh mục (`scholarship_checklist_items`)

### 2.1 Cột mới — khớp spec, kèm ghi chú

| Cột spec | Đề xuất kiểu | Ghi chú |
|---|---|---|
| `code` | `text`, `unique` (null được) | 2 dòng tắt (P4, P11) không có mã. Kiểm `^[A-Z]{1,2}(-[A-Z]?\d+)?$`? — đề xuất không ràng buộc mẫu, chỉ `btrim <> ''`. |
| `track` | `text not null default 'common'` check 8 giá trị | `common / us / uk / au / asia / vn / hs / career`. Dòng tắt P4/P11 lấy `us` (bản cũ là hướng Mỹ) hoặc `common` — không ảnh hưởng vì đã tắt. |
| `start_grade` | `smallint` check 1–13 | Null chỉ cho dòng tắt. Trigger `before insert/update` đặt `stage` theo bảng 1–5 / 6–9 / 10–12 / 13 → admin không còn chọn `stage` tay. |
| `start_note_vi` | `text` | **Thiếu bản tiếng Anh** — app có i18n vi/en. Đề xuất thêm `start_note_en text` (null → hiện bản vi). Q4. |
| `source_ref` | `text` | Bảng đã chỉ admin đọc (RLS); hàm cho phụ huynh không trả cột này. ✓ |
| `is_verified` | `boolean not null default true` | 12 mục `0` trong CSV: UK-5, AU-4, AS-2, AS-3, AS-4, HS-1…4, CR-2, CR-3, CR-5 — khớp "12 mục" ở nguyên tắc 3. ✓ |

Khác: `unique (stage, title_vi)` cũ vẫn giữ — đã kiểm 78 dòng, không trùng (stage suy ra, title_vi). Audit danh mục: trigger `audit_row` có sẵn → mọi sửa của admin (kể cả bật `is_verified`) tự ghi `audit_logs`. ✓

### 2.2 Kiểm file CSV v2

- 78 dòng, `code` không trùng, `sort_order` 1…78 liên tục.
- 18 `common` + 35 `us` + 25 khác (uk 5, au 4, asia 4, vn 3, hs 4, career 5) — khớp mục 0.
- Chia theo `stage` suy ra: primary 10 · lower_secondary 24 · upper_secondary 41 · post_graduation 3 (US-A8, US-B4, US-F7).
- `item_group`: admission 30, academic 20, golf 17, personal 11.
- `auto_source`: C3 `courses`, C4 `competitions`, C5 `culture_awards` — đúng 3 nguồn hiện có.

### 2.3 Chuyển 17 mục cũ

Mã P1…P17 = thứ tự dòng trong CSV v1 = `sort_order` 1…17 khi seed. **Migration sẽ tìm dòng cũ theo `(stage, title_vi)` gốc**, không theo `sort_order` (admin có thể đã sửa thứ tự); nếu staging có tiêu đề đã sửa thì phải chỉnh lại trước (mục 7).

| P | Dòng cũ (stage · tiêu đề) | → v2 | Stage mới | Ghi chú |
|---|---|---|---|---|
| P1 | primary · Lộ trình chương trình golf… | C3 | primary | tự động `courses`, giữ |
| P2 | primary · Thành tích giải trong hệ thống VN Centre | **C4** (dòng giữ) | primary | tự động `competitions` |
| P3 | primary · Giải văn hoá – tinh thần | C5 | primary | tự động `culture_awards` |
| P4 | primary · Thành tích giải ngoài (VGA…) | gộp vào C4 → `is_active = false` | — | **xem 2.4 — xung đột** |
| P5 | primary · Học bạ / bảng điểm từng năm | C11 | primary | |
| P6 | primary · Chứng chỉ tiếng Anh (Cambridge…) | **C13** (dòng giữ) | primary (lớp 3) | |
| P7 | primary · Hoạt động ngoại khoá… | C14 | primary | |
| P8 | lower · Handicap chính thức (WHS) | C7 | lower | |
| P9 | lower · Video swing định kỳ 6 tháng | C9 | lower | |
| P10 | lower · Giải tính điểm WAGR | **US-C2** | **upper** (lớp 10) | chuyển từ "chung" sang hướng Mỹ |
| P11 | lower · Chứng chỉ IELTS / TOEFL | gộp vào C13 → `is_active = false` | — | |
| P12 | upper · Bảng điểm dịch thuật công chứng… | C12 | **lower** (lớp 9) | |
| P13 | upper · SAT / ACT | **US-D1** | upper | hướng Mỹ |
| P14 | upper · Đăng ký NCAA Eligibility Center | **US-A1** | **lower** (lớp 9) | hướng Mỹ |
| P15 | upper · Thư giới thiệu | C16 | upper | |
| P16 | upper · Golf resume 1 trang | C10 | upper | |
| P17 | upper · Danh sách trường mục tiêu… | **US-E1** | upper | hướng Mỹ |

- 13 mục 1–1 + 2 dòng giữ của mục gộp = 15 dòng cập nhật tại chỗ, giữ `id` → mọi dòng `scholarship_checklist_status` đi theo (tiêu chí 3). 63 mục còn lại nạp mới. Sau migration: 78 mục bật + 2 tắt = 80 dòng.
- Gộp trạng thái P6 + P11 → C13: với mỗi học viên, `status` = mức cao hơn, `note` = nối hai ghi chú (`P6 · P11`, cắt ≤ 500), ghi vào dòng của **id P6** (upsert). Dòng trạng thái của P11 **để nguyên** (không xoá) — chỉ mục bị tắt. `merge_trail`: lấy của dòng P6 nếu có, không thì của P11.
- Ghi một dòng `audit_logs` tổng (action `scholarship_v2_migrate`, số dòng chuyển/gộp) — trigger trạng thái không có audit tự động.

### 2.4 ⚠ Xung đột: C4 là mục tự động, P4 là mục tay

v1: P2 có `auto_source = 'competitions'` → trạng thái **tính lúc đọc** (có `tournament_results` hay không), không lưu; `set_scholarship_item` từ chối mục tự động. P4 (giải ngoài) là mục tay, phụ huynh tự đánh dấu.

v2 gộp hai mục vào C4 vẫn `auto_source = competitions`. Hệ quả: học viên có P4 `done` (thi giải ngoài) nhưng chưa thi giải VN Centre → C4 hiện `not_started` → **trượt tiêu chí 1**, và phụ huynh mất chỗ ghi giải ngoài.

Đề xuất (Q2), chọn một:
- **A (khuyên dùng):** mục tự động trở thành "tự động **hoặc** tay": `status = done` nếu nguồn tự động có, nếu không thì lấy trạng thái đã lưu; `set_scholarship_item` cho phép ghi mục tự động (bỏ lỗi `auto_item`), ghi chú luôn sửa được. Áp chung cho C3, C4, C5 hoặc chỉ C4.
- B: C4 bỏ `auto_source` (thành mục tay); app vẫn gợi ý "đã có kết quả giải VN Centre". Mất ★ của C4.

## 3. Lớp hiện tại của học viên — **chưa có dạng dùng được**

Hiện tại: `students.current_grade_class text` (vd. `3A1`, `4B`, có thể trống) — gộp lớp và tên lớp, **không có số lớp**. `student_school_history (student, school, academic_year, grade_class)` có theo năm học nhưng gắn với trường và cũng là text. Phụ huynh **không sửa được** lớp (`update_child_info` không nhận trường này). Không có cờ "không tự lên lớp".

Đề xuất thêm (Q3):
- `students.current_grade smallint` check 1–13, null = chưa biết. Nạp ban đầu: lấy số đầu của `current_grade_class` nếu là 1–12 (`^\s*(1[0-2]|[1-9])\D`); không đọc được → null → nhắc bố mẹ bổ sung. `current_grade_class` **giữ nguyên, không tự sửa** khi lên lớp (chữ lớp "A1" đổi theo năm, không đoán được) — Q3b.
- Bảng `student_grade_history (student_id, school_year text 'YYYY-YYYY', grade, source 'auto'|'guardian'|'school'|'admin'|'backfill', changed_by, created_at)`, `unique (student_id, school_year, source='auto')` → chạy lại 05/9 lần hai không cộng thêm (tiêu chí 11). Dùng nhãn năm học dạng text thay vì bắt buộc dòng `academic_years` (bảng này cần admin tạo năm mới trước 05/9 — dễ quên). Q3c.
- Bảng `grade_promotion_holds (student_id, school_year, kind 'hold'|'skip_ahead', note, set_by)` — trường/admin đánh dấu trước 05/9. Quyền: `is_school_manager_of(students.current_school_id)` hoặc admin.
- Hàm `set_student_grade(student, grade)`: phụ huynh đã xác nhận (`is_guardian_of(id, false)`), quản lý trường của học viên, admin; ghi `student_grade_history` + `audit_logs`; nếu lớp đổi → gửi thông báo "lên lớp" (mục 5). Hàm admin sửa hàng loạt theo trường + lớp.
- Job pg_cron (extension đã bật từ `20260928000001`, đang chạy `expire-orders`): **pg_cron chạy giờ UTC** → lịch `'0 17 4 9 *'` = 00:00 ngày 05/9 giờ VN. Hàm `promote_grades()`: lớp 1–8, không có hold năm đó → +1; lớp ≥ 9 → không đổi, gửi nhắc xác nhận; lớp null → nhắc bổ sung. Có tham số ngày để chạy thử tiêu chí 10 mà không chờ 05/9.

## 4. Hướng đi — bảng `student_scholarship_tracks`

Khớp spec: `(student_id, track, chosen_at, chosen_by)`, `unique (student_id, track)`, RLS từ chối, chỉ đi qua hàm `set_scholarship_tracks(student, tracks[])`. Đề xuất thêm:
- **`removed_at`** thay vì xoá dòng khi bỏ chọn (giữ lịch sử, đúng tinh thần "không mất dữ liệu"); chọn lại → xoá `removed_at`. Trạng thái các mục nằm ở bảng khác nên không bị ảnh hưởng (tiêu chí 8). ✓
- Tự gán `us` (chosen_by null, ghi audit) cho học viên **có ít nhất một dòng `scholarship_checklist_status`** — định nghĩa "đang có dữ liệu" (mục tự động không lưu dòng nên không tính). Q5.
- **Gộp học viên:** spec chưa nói. Đề xuất thêm vào trigger kiểu `scholarship_follow_student_merge` cho cả `student_scholarship_tracks` và `student_grade_history` (cùng cách: chuyển phần chỉ hồ sơ bị gộp có, ghi `merge_trail`, hoàn tác trả về).

## 5. Hàm đọc, màn hình, thông báo

**Hàm đọc.** `scholarship_checklist` (v1) đang được PWA bản cũ gọi — đề xuất **giữ hình dạng cũ** (thêm trường mới vào từng item là phần thêm, không phá), và viết hàm mới `scholarship_roadmap(student)` trả: `current_grade`, `tracks`, các nhóm `now / upcoming / done` (+ `later`, xem dưới), mỗi mục `code, track, start_grade, start_note_vi/en, is_verified, status, source, note` (không `source_ref`), và khối `compare` theo từng hướng đã chọn (`due_count`, `done_count`, `pct`, `missing_count`, `next_item`). Quyền như v1 (42501).

**Chỗ spec chưa khép:**
- **Mục xa hơn 2 năm** không thuộc nhóm nào. Tiêu chí 4 (lớp 9, hướng Anh: "thấy UK-…" và nhãn "Đang xác minh") chỉ đạt nếu hiện cả UK-4, UK-5 (lớp 12 = 3 năm nữa) — mà UK-5 chính là mục chưa xác minh của tiêu chí 5. Đề xuất nhóm thứ tư **"Về sau"** (thu gọn mặc định). Q6.
- **Chưa có lớp:** đề xuất hiện toàn bộ theo 4 cấp như v1 + lời nhắc bổ sung lớp; khối so sánh ẩn.
- **"Mục có hạn hiện nổi bật"**: `start_note_vi` là chữ tự do, không suy ra được hạn. Đề xuất cột `has_deadline boolean` (seed đặt sẵn cho mục ghi "Hạn…", "Xong trước…", "Từ dd/mm…"; admin sửa). Q4.
- `start_grade = 13`: tính "đến hạn" khi `current_grade = 13` (đã tốt nghiệp); với lớp 12 là "Sắp tới".
- So sánh: `%` = mục `done` / mục đến hạn (chung + hướng đó), mục tự động tính theo trạng thái tự động — khớp tiêu chí 7. Hướng không có mục đến hạn → hiện "chưa có mục đến hạn", không hiện 0%.

**Giao diện phụ huynh** (`ScholarshipChecklist.tsx`, khối `scholarship` trong `StudentProfileView`): viết lại theo hàm mới; thêm chọn hướng, sửa lớp, nhãn "Đang xác minh", dòng miễn trừ (nguyên tắc 4), i18n vi/en cho 7 hướng, 4 nhóm, nhãn mới.

**Admin** (`ScholarshipItemsPage.tsx`, CRUD thẳng bảng qua RLS admin): thêm cột `code, track, start_grade, start_note, source_ref, is_verified`; bỏ ô chọn `stage` (trigger tự đặt); lọc theo hướng / xác minh. Thống kê (số học viên theo hướng, tỉ lệ hoàn thành theo lớp) cần một hàm admin mới. Màn hình đánh dấu "không tự lên lớp" cho quản lý trường — **spec chưa nói đặt ở đâu**: đề xuất trên trang học viên của trường (`SchoolStudentPage`) + trang admin.

**Thông báo:** bảng `notifications` (trong app) có sẵn, mẫu ghi đã dùng ở nhiều hàm. Người nhận = tài khoản phụ huynh đã xác nhận của học viên. Loại mới: `grade_promoted` (kèm danh sách mục vừa đến hạn), `grade_confirm_needed` (lớp ≥ 9 ngày 05/9), `grade_missing`. Zalo/email chờ D57 — đúng spec.

## 6. Câu hỏi cần anh Long chốt trước bước 2

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | Staging dùng chung CSDL với app.vncentre.net — migration bước 2 chạy thẳng trên dữ liệu thật. Chấp nhận, hay dựng dự án staging riêng / chạy thử trên bản sao (PGlite) trước? | Chạy thử đủ tiêu chí 1–3, 9 trên PGlite với bản dump dữ liệu checklist hiện tại, rồi mới đẩy. |
| Q2 | C4 tự động + P4 tay (mục 2.4) | Phương án A |
| Q3 | Lớp: thêm `current_grade` số + lịch sử + cờ giữ lớp (mục 3)? (b) không tự sửa `current_grade_class` text? (c) năm học dạng nhãn text? | Đồng ý cả ba |
| Q4 | Thêm `start_note_en` và `has_deadline`? | Có |
| Q5 | "Đang có dữ liệu" = có ít nhất một dòng trạng thái đã lưu → tự gán hướng `us` | Đồng ý |
| Q6 | Thêm nhóm "Về sau" (mục > 2 năm) để tiêu chí 4–5 kiểm được? | Có, thu gọn mặc định |
| Q7 | Bỏ chọn hướng: đánh dấu `removed_at` thay vì xoá dòng; hướng + lịch sử lớp đi theo khi gộp học viên | Đồng ý |

## 7. Việc cần làm trước bước 2 (chỉ đọc, cần token anh Long cấp)

1. Trên staging: `select stage, title_vi, sort_order, is_active, auto_source from scholarship_checklist_items order by sort_order` — xác nhận 17 dòng gốc chưa bị sửa; đếm `scholarship_checklist_status` theo item; đếm học viên có `current_grade_class` đọc được số lớp.
2. Tests `036`, `037` đang khoá "17 mục bật" và tiêu đề `Học bạ / bảng điểm từng năm` → bước 2 phải cập nhật hai bài này (sửa test, không sửa migration cũ).
3. Thư mục chính đang ở nhánh `module-ho-so-nhan-su` (đã nằm trong main) với thay đổi spec chưa commit; `git pull` không áp được (không có upstream, và `docs/spec/phu-luc-D-viec-con-mo.md` sửa ở cả hai phía). Bước 2 nên làm trong worktree mới từ `origin/main`.
