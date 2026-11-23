# 15 · Giao việc: Hồ sơ VĐV đầy đủ cho phụ huynh (Thẻ VĐV · Giải thưởng · Hành trang học bổng)

Bản 1.1 · 05/11/2026 (tối, sau khi đối chiếu code spec 14) · Người soạn: Minh · Chủ sản phẩm duyệt: Vũ Anh Long
Làm **sau khi** `14-giao-viec-ho-so-vdv-quan-tri.md` xong và đã gộp vào nhánh chính. Dùng lại toàn bộ dữ liệu của spec 13–14, **không tạo bảng giải đấu mới**.
**Mốc:** lên chính thức trước **Chặng 11 (Chủ nhật 08/11/2026)** nếu kịp. Không kịp thì Chặng 11 vẫn chạy với mục Thành tích SNAG của spec 13–14 — **không vội làm ẩu**.

## 0. Mục tiêu
Anh Long chốt: **Hồ sơ Golf Passport của mỗi con chính là Profile Vận động viên suốt đời.** Phụ huynh đăng nhập, mở trang con, thấy trên một trang:

1. **Thẻ VĐV**: tóm tắt con là ai, đang ở đâu trên lộ trình, thành tích nổi bật.
2. **Thành tích SNAG Golf League**: đã có (`LeagueAchievements`, spec 13–14).
3. **Giải thưởng & danh hiệu**: gom riêng, giải văn hoá **ngang hàng** danh hiệu thi đấu.
4. **Khoá học & Level**: đã có (đợt 1).
5. **Chứng nhận**: đã có (đợt 1, kể cả chứng nhận giải).
6. **Hành trang học bổng**: danh mục việc cần chuẩn bị theo 3 cấp học.

Việc mới trong spec này chỉ có khối **1, 3, 6** và **sắp lại thứ tự** các khối.

## 1. Hiện trạng cần biết (đã đọc code 05/11)
- `tournament_results` (`student_id`, `participant_kind`, `rank_title_code`, `culture_award_code`, `points_total`…), `tournaments` (`stage_no`, `played_on`, `venue`, `counts_for_ranking`), `seasons`, `tournament_point_rules` (tên VI/EN của danh hiệu), view `league_standings` (`total_points`, `rank`, `tied`, `players`, `stages_played`, `best_gross_count`).
- `league_public_profile(p_code)` trả mục thành tích cho trang `/p/{mã}`; **không sửa hàm này**.
- `public.is_guardian_of(student_id, p_include_pending)` — **tham số thứ hai là "tính cả phụ huynh đang chờ xác nhận"**, phụ huynh đang gắn = `is_guardian_of(id, false)`. `consents`, `audit_logs`, `setting_int(...)`, `CrudTable`, `i18n/vi.json` + `en.json`.
- Trang con của phụ huynh: `ParentChildPage` (spec 14 đã gắn `LeagueAchievements`), khối hồ sơ dùng chung `StudentProfileView` / `useStudentProfile`.

## 1b. Kết quả đối chiếu code (Minh, 05/11 tối) — đã sửa vào bản 1.1
- `is_guardian_of(..., true)` ở bản 1 là **sai**: `true` tính cả phụ huynh đang chờ xác nhận. Đã đổi thành `false` ở mọi chỗ.
- Ảnh học viên: cột `students.avatar_url` (bản 1 ghi `photo_url`).
- Khoá học đã duyệt: `course_history.status = 'approved'`.
- Phần điểm/hạng SNAG của Thẻ VĐV: gọi lại `league_student_summary` (spec 14), không viết truy vấn thứ hai.
- Không có quyền: báo lỗi 42501 như `league_student_profile`, không trả `null`.
- **Nhánh git:** làm trên nhánh mới tách từ `origin/main` (sau khi đã có spec 14), ví dụ `git worktree add .claude/worktrees/ho-so-vdv-phu-huynh -b ho-so-vdv-phu-huynh origin/main`. **Không** làm trên thư mục repo chính: thư mục đó đang ở nhánh `module-ho-so-nhan-su` (module hồ sơ nhân sự 11b, commit 24/10, **chưa đẩy lên GitHub, chưa có trong main**).
- Kiểm thử SQL (`npm run test:db`) chạy thẳng trên dự án Supabase đang dùng thật → chỉ chạy **sau** khi anh Long duyệt migration và đã sao lưu.

## 2. Trước khi code
1. Xác nhận spec 14 đã gộp, `git status` sạch, **chạy sao lưu** theo `docs/van-hanh/sao-luu-khoi-phuc.md`.
2. Đọc file này + `13-giao-viec-ket-noi-snag-league.md` mục 3, 6 + `14-…` mục 1.2.
3. Đối chiếu tên cột ở mục 1 với code thật; khác thì liệt kê, gửi anh Long trước khi build.

## 3. Dữ liệu

### 3.1 Thẻ VĐV và Giải thưởng — hàm đọc, không bảng mới
`student_athlete_card(p_student_id uuid) returns jsonb` · `security definer` · chỉ trả khi người gọi là **phụ huynh đang gắn** (`is_guardian_of(p_student_id, false)`), **chính học viên** (`student_accounts.user_id = auth.uid() and is_active`), hoặc **admin** (`is_admin()`); ngược lại `raise exception 'forbidden' using errcode = '42501'` (theo quy ước của `league_student_profile`).

Trả về:
| Khoá | Nguồn |
|---|---|
| `student_code`, `full_name`, `avatar_url`, `birth_year` | `students` (không trả ngày sinh đầy đủ) |
| `school` | trường hiện tại |
| `level`, `stage` (giai đoạn 1–5), `passport_tier` | như trang hồ sơ đợt 1 đang hiển thị |
| `league` | **dùng lại** `league_student_summary(league_current_student(p_student_id))` của spec 14, không tính lại |
| `counts`: `best_gross`, `winner`, `runner_up`, `culture_awards` | đếm từ `tournament_results` của chuỗi `snag_league`, chỉ `participant_kind = 'student'` |
| `graduated` | `best_gross >= setting_int('league.graduation_best_gross', 3)` |
| `awards[]`: `played_on`, `stage_no`, `kind` (`rank` / `culture`), `code`, `name_vi`, `name_en` | mỗi danh hiệu (`rank_title_code` khác `null`, **bỏ** mã chỉ là tham dự) và mỗi giải văn hoá thành **một dòng riêng**; mới nhất trước |

Chưa thi chặng nào → `league` = `null`, `awards` = `[]` (giao diện ẩn phần tương ứng).

### 3.2 Hành trang học bổng — 2 bảng mới
```
scholarship_checklist_items
  id uuid pk, org_id (mặc định như các bảng khác),
  stage text check in ('primary','lower_secondary','upper_secondary'),
  item_group text check in ('golf','academic','personal'),
  title_vi text, title_en text,
  help_vi text null, help_en text null,          -- V1 để trống
  auto_source text null check in ('courses','competitions','culture_awards'),
  sort_order int, is_active boolean default true,
  created_at, updated_at

scholarship_checklist_status
  id uuid pk, student_id → students, item_id → scholarship_checklist_items,
  status text check in ('not_started','in_progress','done') default 'not_started',
  note text null (≤ 500 ký tự),
  updated_by uuid → auth.users, updated_at
  unique (student_id, item_id)
```
- **RLS mặc định từ chối.** Admin đọc/ghi `items` (màn `CrudTable`). `status`: không có policy ghi thẳng; mọi thao tác qua hàm.
- `scholarship_checklist(p_student_id) returns jsonb`: cùng điều kiện quyền như 3.1. Trả 3 cấp, mỗi cấp: danh sách mục (`id`, `group`, `title_vi/en`, `status`, `source` = `auto` / `guardian`, `note`, `updated_at`) và `done_count` / `total_count`.
  - Mục có `auto_source`: `status` **tính lúc đọc**, không lưu — `courses`: có ít nhất một dòng `course_history` với `status = 'approved'` và `deleted_at is null`; `competitions`: có ít nhất một dòng `tournament_results` đã ghép; `culture_awards`: có ít nhất một `culture_award_code`. Có → `done`, không → `not_started`.
- `set_scholarship_item(p_student_id, p_item_id, p_status, p_note)`: chỉ **phụ huynh đang gắn** (`is_guardian_of(id, false)`); từ chối mục có `auto_source`; ghi `audit_logs` (`action = 'scholarship_item_set'`). Học viên (tài khoản con) chỉ đọc. HLV, nhà trường, `league_staff` **không** đọc được checklist.
- **Không** có cột tải file (học bạ, chứng chỉ) ở V1.

### 3.3 Dữ liệu seed — `docs/spec/data/scholarship-checklist.csv`
Không có dữ liệu cá nhân, được phép commit.

| stage | item_group | title_vi | title_en | auto_source |
|---|---|---|---|---|
| primary | golf | Lộ trình chương trình golf đã học, level | Golf programmes completed and level | courses |
| primary | golf | Thành tích giải trong hệ thống VN Centre | Results in VN Centre events | competitions |
| primary | golf | Giải văn hoá – tinh thần | Spirit and etiquette awards | culture_awards |
| primary | golf | Thành tích giải ngoài (VGA Junior Tour…) | Results in external events (VGA Junior Tour…) | |
| primary | academic | Học bạ / bảng điểm từng năm | School reports for each year | |
| primary | academic | Chứng chỉ tiếng Anh (Cambridge…) | English certificates (Cambridge…) | |
| primary | personal | Hoạt động ngoại khoá, thiện nguyện | Extracurricular and volunteer activities | |
| lower_secondary | golf | Handicap chính thức (WHS) | Official handicap (WHS) | |
| lower_secondary | golf | Video swing định kỳ 6 tháng (link YouTube) | Swing video every 6 months (YouTube link) | |
| lower_secondary | golf | Giải tính điểm WAGR | WAGR-counting events | |
| lower_secondary | academic | Chứng chỉ IELTS / TOEFL | IELTS / TOEFL certificate | |
| upper_secondary | academic | Bảng điểm dịch thuật công chứng từ lớp 9 | Certified translated transcripts from Grade 9 | |
| upper_secondary | academic | SAT / ACT (nếu trường yêu cầu) | SAT / ACT (if required) | |
| upper_secondary | academic | Đăng ký NCAA Eligibility Center | NCAA Eligibility Center registration | |
| upper_secondary | personal | Thư giới thiệu (HLV, giáo viên) | Recommendation letters (coach, teacher) | |
| upper_secondary | personal | Golf resume 1 trang | One-page golf resume | |
| upper_secondary | personal | Danh sách trường mục tiêu, liên hệ HLV đại học | Target colleges and college coach contacts | |

`sort_order` theo thứ tự dòng. Mục NCAA **chỉ hiện tên**; nội dung hướng dẫn (`help_*`) Minh bổ sung sau khi kiểm chứng quy định hiện hành.

## 4. Giao diện

**Nơi hiển thị:** `ParentChildPage` (phụ huynh) và trang hồ sơ của tài khoản con (`/me`, chỉ đọc). Theo tông Golf Passport, có nút đổi giao diện như các trang khác. Mọi chữ mới thêm vào **cả** `vi.json` và `en.json`.

**Thứ tự khối (cuộn dọc, ưu tiên điện thoại):**
1. **Thẻ VĐV** — hàng 1: ảnh, họ tên, mã VNC (bấm để sao chép); hàng 2: Level + thanh 5 giai đoạn, hạng sổ; hàng 3 (chỉ khi đã thi): **tổng điểm · hạng `T`n/tổng VĐV · số chặng**, huy hiệu nhỏ "×n Best Gross", "×n Winner", "×n Giải văn hoá", nhãn "Tốt nghiệp" nếu `graduated`.
2. **Thành tích SNAG Golf League** — `LeagueAchievements` hiện có, giữ nguyên.
3. **Giải thưởng & danh hiệu** — danh sách `awards`, mỗi dòng: ngày · Chặng n · tên danh hiệu. Biểu tượng cúp cho danh hiệu thi đấu, biểu tượng trái tim/huy hiệu cho giải văn hoá; **cùng cỡ chữ, cùng màu nhấn** (không làm giải văn hoá nhỏ hơn). Ẩn khối nếu rỗng.
4. **Khoá học & Level** — thành phần hiện có.
5. **Chứng nhận** — thành phần hiện có.
6. **Hành trang học bổng**
   - Tiêu đề khối + dòng giải thích ngắn: "Những việc cần chuẩn bị dần để sau này xin học bổng golf. Mục có nhãn *Tự động* do VN Centre cập nhật; các mục còn lại bố mẹ tự đánh dấu."
   - 3 nhóm: **Tiểu học · THCS · THPT**. **Mặc định thu gọn cả 3.** Tiêu đề nhóm hiện "Đã có x/y" và mũi tên; bấm để mở/thu từng nhóm. Nút **"Thu gọn tất cả"** ở đầu khối.
   - Mỗi mục: tên, nhãn nguồn (*Tự động* / *Bố mẹ tự khai*), trạng thái. Mục tự động: chỉ hiện trạng thái. Mục khác: phụ huynh bấm đổi 3 trạng thái (Chưa bắt đầu / Đang làm / Đã có), ghi chú tuỳ chọn. Tài khoản con: chỉ xem.
   - Trạng thái mở/thu chỉ nhớ trong phiên, không lưu máy chủ.

**Không hiện:** ngày sinh đầy đủ, SĐT/email phụ huynh, ghi chú nội bộ.
**Gói:** V1 mọi phụ huynh xem đủ 6 khối (xuất PDF hồ sơ học bổng là việc đợt 4, gói Premium).

## 5. Tiêu chí nghiệm thu (staging trước, rồi chính thức)
1. Phụ huynh có con đã thi SNAG: trang con hiện đủ 6 khối đúng thứ tự; tổng điểm và hạng ở Thẻ VĐV **khớp** mục Thành tích SNAG và `league.vncentre.net/bxh`.
2. Phụ huynh có con chưa thi: Thẻ VĐV không có hàng 3; khối Giải thưởng ẩn; checklist mục "Thành tích giải trong hệ thống VN Centre" = Chưa bắt đầu.
3. Một VĐV có giải văn hoá (ví dụ Tinh thần Golfer) → hiện thành dòng riêng trong Giải thưởng, mục checklist "Giải văn hoá – tinh thần" tự **Đã có**.
4. Checklist: 3 nhóm thu gọn mặc định; mở/thu từng nhóm; "Thu gọn tất cả" chạy; đổi trạng thái một mục → tải lại trang vẫn giữ; không đổi được mục *Tự động*.
5. **Quyền:** phụ huynh A gọi thẳng `student_athlete_card` / `scholarship_checklist` / `set_scholarship_item` với `student_id` con phụ huynh B → lỗi 42501. Phụ huynh **đang chờ xác nhận** (`pending_confirmation`) cũng bị chặn. HLV và `league_staff` không đọc được checklist. Tài khoản con không ghi được.
6. Mỗi lần `set_scholarship_item` có dòng `audit_logs`.
7. Chuyển English: không còn chữ Việt (trừ tên riêng). Điện thoại màn nhỏ: không tràn ngang.
8. Toàn bộ test cũ vẫn đạt.

## 6. Thứ tự và điểm dừng
1. Migration 2 bảng + seed + 3 hàm + test SQL (tiêu chí 5–6) → **dừng, anh Long xem migration**.
2. Khối Thẻ VĐV + Giải thưởng + sắp lại thứ tự khối → **dừng, kiểm tiêu chí 1–3, 7**.
3. Khối Hành trang học bổng + màn admin danh mục → **dừng, kiểm tiêu chí 4, 8**.
4. Sao lưu → đẩy migration lên Supabase thật → đưa giao diện lên `app.vncentre.net` → anh Long tự bấm lại tiêu chí 1, 4, 5 trên điện thoại.
5. Báo Minh: ảnh chụp trang con của một VĐV thật (che mã VNC) để Minh rà câu chữ.

## 7. Không làm trong spec này
Xuất PDF hồ sơ học bổng · tải lên học bạ/chứng chỉ · giải ngoài VGA · handicap · nội dung hướng dẫn NCAA · gói Premium · sửa `league_public_profile` hay trang `/p/{mã}`.
