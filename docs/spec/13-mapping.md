# 13 · Bản đối chiếu: kết nối SNAG Golf League ↔ Golf Passport

Bản 05/11/2026 · đọc từ migration trên `main` (df8998d) và `13-giao-viec-ket-noi-snag-league.md` bản 1 · anh Long **duyệt các đề xuất K1–K12** ngày 05/11/2026. Bước 1: `supabase/migrations/20261105000001_snag_league_data.sql`, kiểm thử `supabase/tests/030_snag_league_data.sql`.

**Chỗ còn hỏi, tạm theo mặc định** (anh Long duyệt chung, chưa trả lời riêng; đổi được):
- K3: chỉ ẩn trường **trong mục SNAG League**; trang sổ giữ như cũ (anh Long chốt 05/11/2026).
- K4: "trước Chặng 10" = **đến hết Chặng 9**. Là cấu hình `league.name_shown_until_stage` = 9.
- K6: 2 dòng CLB trống ở Chặng 4 coi là **học sinh**. Không nhập Chặng 3.
- K7: bạn TH Phương Mai có hồ sơ mà không có kết quả: **không tạo hồ sơ** khi nhập lịch sử.

Không đọc được schema staging trực tiếp (token CLI đang hỏng); đối chiếu theo migration trong repo.

---

## 1. Thiếu tài liệu

Spec 13 bảo đọc `12-module-snag-golf-league.md` (bản 2.2) mục 3, 4, 6, 9. **File này không có trong repo** (cả trong `C:\dev\du-lieu-snag-passport`). Số `12` trong repo đang là module Chuyến thi đấu (`12-module-chuyen-thi-dau.md`). Bản đối chiếu dưới đây chỉ dựa trên spec 13, `01-du-lieu.md` (khung đợt 3), `04-dot-3-diem-qua-bxh.md` mục 5–6 và `phu-luc-C` mục C2.

## 2. Bảng: dùng lại / thêm

Khung đợt 3 (`seasons`, `tournament_series`, `tournaments`, `tournament_entries`, `tournament_results`, `ranking_points_ledger` trong `01-du-lieu.md`) **chưa có bảng nào** trong migration. Đề xuất tạo theo tên đợt 3, chỉ những bảng spec 13 cần:

| Spec 13 | Đề xuất trong repo | Ghi chú |
|---|---|---|
| Hạng sổ `snag_league` | `passport_tiers` thêm dòng `snag_league`, `level_from/to = null`, `counts_toward_single_active = false` | Giống `event_experience` (migration 20261008000001) |
| `tournament_series` | `tournament_series` (code, name_vi/en, `ranking_coefficient` mặc định 1) | Seed `snag_league` ×1. Hệ số theo `phu-luc-C` C3 |
| mùa 2026 | `seasons` (code, name_vi/en, start_date, end_date) | Theo `01-du-lieu.md`; spec 13 chỉ nói "mùa 2026" |
| `tournaments` | `tournaments` (series_id, season_id, stage_no, played_on, venue, holes, `counts_for_ranking`, status) | Duy nhất (series_id, season_id, stage_no). Chặng 3 `counts_for_ranking = false` |
| `tournament_results` | `tournament_results` đúng các cột spec 13 + `raw_name_normalized`, `participant_kind` (`student`, `parent`, `teacher`), `rank_title_code`, `culture_award_code` | Duy nhất (tournament_id, raw_name_normalized) |
| — | `tournament_entries` | **Chưa làm** (đợt 3: đăng ký, bảng tuổi, lệ phí). App giải vẫn giữ đơn đăng ký |
| — | `ranking_points_ledger` | **Chưa làm**; điểm nằm ngay trên `tournament_results`. Đợt 3 sinh sổ cái từ đây |
| Thang điểm | `tournament_point_rules` (series_id, kind `rank`/`participation`/`culture`, code, name_vi/en, points) | README quy tắc 2: không viết cứng. Seed theo C2 |
| `league_match_queue` | `league_match_queue` | Như spec |
| — | `league_issue_requests` (league_ref duy nhất, kết quả trả lần đầu) | Để gọi lại cùng `league_ref` trả đúng kết quả cũ |
| Hạng hiện tại | view/hàm `league_standings(season)` | Tính từ `tournament_results`, đồng điểm kiểu T7, T7, 9 |
| Nhật ký | trigger `audit_row` trên bảng mới + dòng `audit_logs` cho mỗi lần `issue` / `results` | |
| Giới hạn 20 lần/phút | `code_attempts` thêm `kind = 'league_lookup'` | Dùng lại bảng đếm đang có |
| `linked_via` | thêm giá trị `league` | Spec cho chọn; `league` dễ lọc hơn `import` |

Hai tên trong spec 13 lệch với C2 (cùng giá trị điểm): "Spirit of the Game" = **Tinh thần Golfer** (+200), "The Essence of Golf Style" = **Tinh hoa Phong cách Golf** (+100). Dữ liệu lịch sử và app giải dùng tên tiếng Việt; seed lấy tên Việt làm `name_vi`, tên Anh làm `name_en`.

## 3. Khác biệt cần anh Long chốt

**K1 · Bạn ngày 10/10 không có ngày sinh.** Luồng ghi tên sự kiện (`event_do_register`) chỉ lưu họ tên, **tuổi** (`event_participations.age_at_registration`) và SĐT phụ huynh; `students.date_of_birth`, giới, trường đều trống, `verification_status = 'event_guest'`. Ghép "tên + ngày sinh" như tiêu chí 7.2 sẽ **không bao giờ khớp** với các bạn này.
→ Đề xuất: khớp chắc khi **tên chuẩn hoá trùng và** (ngày sinh trùng **hoặc** SĐT phụ huynh trùng). Tên trùng mà ngày sinh lệch, hoặc thiếu cả hai → `review`. Khi `matched` với bạn 10/10 thì điền thêm ngày sinh/giới/trường từ đơn giải vào hồ sơ (chỉ ô đang trống), giữ nguyên `event_guest`.

**K2 · Bạn 10/10 đã có sổ `event_experience`.** Spec: "dùng lại sổ đó". Nhưng `/p/{mã}` của thẻ sự kiện hiện chuyển sang luồng thẻ sự kiện, không qua trang sổ thường.
→ Đề xuất: `issue` trả `passport_code` của thẻ sự kiện; mục "Thành tích SNAG Golf League" hiện ở **cả hai** trang (sổ thường và thẻ sự kiện).

**K3 · Trang `/p/` hiện đang lộ tên trường.** `passport_lookup` trả `masked_name` + `school_name` cho người chưa đăng nhập. Spec 13 mục 6.1 / tiêu chí 7.5: không hiện trường.
→ Hỏi: chỉ ẩn trường **trong mục SNAG League** (giữ trang sổ như cũ), hay ẩn trường khỏi toàn bộ `/p/` khi chưa đăng nhập?

**K4 · Tên hiển thị khi chưa có phụ huynh.** `consents` bắt buộc `guardian_id`. 58 bạn lịch sử nhập từ file **không có phụ huynh** → không ghi được đồng ý hay "xin tắt". Quy tắc spec: hiện tên nếu đồng ý `leaderboard_name`, **hoặc** đã thi trước Chặng 10 và phụ huynh chưa xin tắt.
→ Đề xuất: thêm cờ `students.league_name_hidden` (mặc định false) để admin bật khi phụ huynh xin tắt qua điện thoại/Zalo; khi phụ huynh liên kết tài khoản thì dùng `consents` như thường. Bạn chỉ thi từ Chặng 10 trở đi mà chưa có đồng ý → "Vận động viên ẩn danh". Hỏi thêm: "trước Chặng 10" là **≤ Chặng 9** hay **≤ Chặng 10**?

**K5 · Không có năm sinh riêng.** `students` chỉ có `date_of_birth` (ngày đủ). `ho-so-vdv.csv` chỉ có năm sinh, và **34/58 bạn trống năm sinh**.
→ Đề xuất: thêm cột `students.birth_year smallint` (trống được; tự điền khi có `date_of_birth`). Không bịa ngày 01/01.

**K6 · Phụ huynh và thầy cô trong dữ liệu.** Chặng 4 có 3 dòng CLB "Parent" và 2 dòng CLB trống; `ho-so-vdv.csv` có 5 người (CLB TVD, nữ, không năm sinh, thi 1 chặng) không xuất hiện trong file kết quả — có vẻ là thầy cô Chặng 3. File kết quả **không có Chặng 3**.
→ Đề xuất: dòng "Parent" lưu `participant_kind = 'parent'`, `student_id = null`, **không tạo hồ sơ học viên**; loại khỏi hạng. 5 thầy cô: không nhập (không có kết quả). Hỏi: 2 dòng CLB trống ở Chặng 4 là học sinh hay phụ huynh? Có cần nhập Chặng 3 không, nếu có thì gửi thêm file.

**K7 · Hồ sơ và kết quả không khớp tên.** 63 tên trong file kết quả, 58 trong `ho-so-vdv.csv`: 11 bạn (Chặng 9–10, TH Phương Mai) có kết quả nhưng không có hồ sơ; 6 người có hồ sơ nhưng không có kết quả: 5 người TVD (K6) và 1 bạn TH Phương Mai có năm sinh — hỏi: bạn này có thi chặng nào không (có thể tên viết khác trong file kết quả)?
→ Đề xuất: 11 bạn này tạo hồ sơ từ dòng kết quả (tên + CLB, không năm sinh) → vì thiếu năm sinh nên **vào hàng chờ**, không tự ghép.

**K8 · Thứ tự ưu tiên khi nhập lịch sử thiếu năm sinh.** Với 34 bạn trống năm sinh, quy tắc "tên + năm sinh" không ghép chắc được với hồ sơ có sẵn trên staging.
→ Đề xuất: tên chuẩn hoá trùng **đúng một** học viên có cùng trường (sau quy đổi CLB) → ghép chắc; trùng nhiều hoặc khác trường → hàng chờ; không trùng → tạo mới.

**K9 · Hạng hiện tại tính trên tập nào.** Spec: "hạng hiện tại / tổng số VĐV", loại thầy cô/phụ huynh.
→ Đề xuất: một bảng chung cả mùa (mọi bảng tuổi), chỉ tính chặng `counts_for_ranking`, chỉ dòng `participant_kind = 'student'`, nhân hệ số chuỗi. Dòng chưa ghép (`student_id` null) vẫn tính vào tổng số VĐV theo tên chuẩn hoá. Khớp trang `league.vncentre.net/bxh` tab "Tất cả".

**K10 · Điểm lịch sử: lấy theo file hay tính lại.** File đã có cột điểm; kiểm thử thấy tổng từng dòng = tham dự + thành tích + thưởng ở cả 104 dòng, và tổng 5 bạn ở mục 5 khớp đúng (3.200 / 2.950 / 2.150 / 1.600 / 1.550).
→ Đề xuất: nhập lịch sử lấy **điểm trong file**; script đối chiếu với điểm tính lại từ `tournament_point_rules` và liệt kê dòng lệch (hiện là 0). Lệnh `results` từ Chặng 11 thì **tính từ thang điểm** (app giải chỉ gửi danh hiệu + giải văn hoá).

**K11 · Bảng tuổi thay đổi từng chặng** (23 tên bảng khác nhau qua 10 chặng). Lưu nguyên văn ở `tournament_results.group_name`, không chuẩn hoá ở bước này.

**K12 · Nhánh.** Làm trên nhánh `snag-league-ket-noi` đi từ `main`, tách khỏi `module-ho-so-nhan-su` (chưa push). Hai nhánh không đụng cùng bảng.

## 4. Không lưu

Theo spec 13 mục 3: không nhận/lưu lưu ý sức khoẻ, mã tài trợ, thông tin chuyển khoản từ app giải. `league-bridge` bỏ qua mọi trường ngoài danh sách cho phép.

## 5. Dữ liệu lịch sử

File ở `C:\dev\du-lieu-snag-passport` có tên và năm sinh các con: **không chép vào repo, không commit**. Script nhập đặt ngoài repo, đọc file theo đường dẫn truyền vào, chạy trên máy anh Long.

## 6. Bước 2 · cổng `league-bridge` và nhập lịch sử

Migration `20261105000002_snag_league_bridge.sql` (+ `20261105000003_snag_league_school_alias.sql`: tìm trường theo mọi cách viết của CLB), Edge Function `supabase/functions/league-bridge`, script `scripts/import-snag-history.mjs`, kiểm thử `supabase/tests/031_snag_league_bridge.sql`, `032_snag_league_school_alias.sql`. Mọi hàm `league_*` chỉ `service_role` gọi được.

Cách làm cụ thể (thêm vào K1–K12):
- **Ghép** (`league_find_student`): tên chuẩn hoá trùng, không mâu thuẫn ngày/năm sinh, và một trong: ngày sinh trùng · SĐT phụ huynh trùng · năm sinh trùng (trường không mâu thuẫn) · thiếu năm sinh nhưng cùng trường và chỉ một người trùng tên. Đúng một hồ sơ → `matched`; có người trùng tên mà không chắc → `review`.
- **`issue` khớp hồ sơ có sẵn:** chỉ điền ô đang trống (ngày sinh, giới, trường). **Không tự gắn phụ huynh mới** vào hồ sơ có sẵn (tránh người lạ gõ đúng tên + ngày sinh là thành phụ huynh); đồng ý ảnh/tên chỉ ghi khi SĐT trùng phụ huynh đã gắn.
- **`issue` dùng lại sổ có sẵn:** sổ thường active → sổ active khác → assigned → thẻ sự kiện; chưa có mới cấp thẻ số `snag_league` (`assigned`).
- **`results` không tự tạo hồ sơ:** dòng không mã mà không ghép chắc → hàng chờ (`no_match` / `same_name_unsure`), `student_id` trống. Điểm do Passport tính từ thang điểm; app giải chỉ gửi danh hiệu + giải văn hoá.
- **Gửi lại một chặng:** dòng cùng tên cập nhật tại chỗ (giữ ghép tay của admin và hàng chờ), dòng không còn trong danh sách bị xoá → không nhân đôi.
- **Cùng tên ở chặng khác:** lịch sử (danh sách VĐV duy nhất theo tên) → dùng lại hồ sơ đã ghép; app giải → chỉ khi cùng CLB.
- **Lịch sử:** lấy điểm trong file, đối chiếu với điểm tính lại; chạy thử (mặc định) huỷ toàn bộ sau khi in báo cáo.

Chạy thử trên máy (PGlite, CSDL trống, dữ liệu thật chỉ nằm trong bộ nhớ): 104 dòng / 9 chặng, 60 học sinh + 3 dòng phụ huynh, 0 dòng lệch thang điểm, 5 tổng điểm ở spec mục 5 **khớp**; chạy lại lần 2 không tạo thêm hồ sơ. Trên staging số "ghép hồ sơ có sẵn" sẽ khác vì đã có học viên và trường.

### Triển khai staging (anh Long)
1. Chạy 2 migration `20261105000001…`, `20261105000002…` (CLI `supabase db push` khi token chạy lại, hoặc dán vào SQL Editor của staging theo thứ tự).
2. Đặt secret `LEAGUE_API_KEY` (mục 7), rồi `supabase functions deploy league-bridge`.
3. Nhập lịch sử: đặt `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` trong cửa sổ dòng lệnh, chạy thử `node scripts/import-snag-history.mjs <thư mục dữ liệu>`, khớp thì thêm `--apply`. Xong xoá thư mục dữ liệu khỏi máy (spec mục 5).

## 7. `LEAGUE_API_KEY`

Không gửi qua chat, không ghi vào repo. Tạo một chuỗi ngẫu nhiên ≥ 32 ký tự trên máy, đặt cùng giá trị ở hai nơi: Supabase (Edge Functions → Secrets) và Cloudflare Worker của app giải (`wrangler secret put LEAGUE_API_KEY`). Hàm trả 503 `not_configured` khi chưa đặt hoặc ngắn hơn 32 ký tự.

## 8. Trạng thái staging (05/11/2026)

- Đã đẩy 3 migration `20261105000001…000003`, đã deploy `league-bridge` (`https://zrfipnqkjrhzrscaaeth.supabase.co/functions/v1/league-bridge`). Chưa đặt `LEAGUE_API_KEY` → hàm trả 503.
- Kiểm thử SQL trên staging: 030, 031, 032 qua. 020 và 023 (module Nhân sự sự kiện) hỏng vì staging đã có thêm vai/bộ phận người dùng tạo; không liên quan SNAG.
- Nhập lịch sử **đã ghi** trên staging (anh Long cho phép 05/11/2026): 9 chặng, 104 dòng (101 học sinh + 3 phụ huynh), 60 VĐV (59 hồ sơ mới có thẻ số + 1 hồ sơ có sẵn), 0 dòng chưa ghép, 6 nghi trùng trong hàng chờ, 0 lệch, 5 tổng điểm khớp. 6 nghi trùng là các bạn 10/10 (hồ sơ sự kiện chỉ có tên): admin xác nhận ở trang "Ghép VĐV SNAG League" (bước 3).

## 9. Bước 3 · giao diện (spec 13 mục 6)

- Migration `20261105000004_snag_league_screens.sql` (đã đẩy staging), kiểm thử `033_snag_league_screens.sql` (qua trên staging).
- `/p/{mã}`: mục "Thành tích SNAG Golf League" (`src/features/league/LeagueAchievements.tsx`) dưới mọi trang sổ còn hiệu lực, kể cả thẻ sự kiện (K2). Dữ liệu từ `league_public_profile`: không trả ngày sinh, năm sinh, trường, CLB, phụ huynh. Tên theo K4; phụ huynh đăng nhập thấy thêm nút tải chứng nhận giải (loại `tournament`) nếu có.
- Admin `/admin/league-queue` "Ghép VĐV SNAG League" (`LeagueQueuePage.tsx`): gộp bằng `MergeStudentsDialog` có sẵn rồi đánh dấu `merged`; gắn dòng kết quả chưa có hồ sơ (`linked`); giữ hồ sơ mới (`kept_new`); bỏ qua. Hiện tuổi lúc ghi tên sự kiện để đối chiếu năm sinh.
- Hàm admin `admin_set_league_name_hidden` cho K4 (chưa có nút trên giao diện).
- **K3 chốt 05/11/2026 (anh Long):** giữ như cũ — phần đầu trang `/p/` của sổ chưa kích hoạt vẫn hiện tên trường (`passport_lookup`, có từ trước); chỉ mục SNAG League không hiện trường. Tiêu chí 7.5 áp cho mục SNAG.
