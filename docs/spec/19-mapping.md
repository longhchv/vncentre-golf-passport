# 19 · Mapping — Module điểm thưởng và đổi quà

Bản 1 · 10/11/2026 · Bước 1 của `19-module-diem-thuong-doi-qua.md` (mục 2, mục 9).
Đọc từ: migration trên `main` (6f4fe6a) và staging `zrfipnqkjrhzrscaaeth` (chỉ truy vấn đọc, 10/11/2026).
**Trạng thái (10/11/2026): anh Long duyệt Q1–Q11 theo đề xuất. Bước 2–6 xong và đã áp lên staging (migration 20261110000001–000005). Bước 7 (cộng bù) chờ D60. Code chưa commit.**

---

## 1. Schema thật hôm nay (staging = production)

| Thứ | Hiện trạng | Ghi chú |
|---|---|---|
| `reward_ledger` | Có (20261107000001). Cột: `id, org_id, student_id, delta, reason, source_type, source_id, cycle_no, is_frozen, note, created_by, created_at, updated_at`. `reason` CHECK chỉ 3 giá trị. RLS: admin đọc; ghi qua hàm | **Staging: 0 dòng.** Không có dòng trùng `(source_type, source_id, reason)` |
| Hàm ghi `reward_ledger` | `partner_visit_apply` (cộng `partner_visit`, có kiểm "chưa có"), `partner_void_visit` (trừ `partner_visit_void`). `admin_adjust` có trong CHECK nhưng **chưa hàm nào ghi** | |
| `reward_balance(student)` | Trả `sum(delta)` + 20 dòng gần nhất, chỉ nối tên đối tác. Dùng ở `CustomerOffers.tsx` | Chưa trừ phần treo |
| `tournament_series` | 1 dòng `snag_league`, `ranking_coefficient = 1`. Chưa có `reward_coefficient` | |
| `tournaments` | 10 chặng mùa 2026 (1, 2, 4–8, 10 nhập file; 9, 11 từ app giải). Có `deleted_at`, `counts_for_ranking` (tất cả `true`) | Chặng 3 (thầy cô) không có trên staging |
| `tournament_results` | 126 dòng học sinh đã ghép (41.200 điểm `points_total`), 3 dòng phụ huynh chưa ghép. `points_total` là cột sinh = tham dự + hạng + văn hoá | |
| Ai ghi `tournament_results` | `league_results_*` (app giải và nhập file): upsert theo `(tournament_id, raw_name_normalized)`, rồi **xoá cứng** các dòng không còn trong lần gửi · `admin_league_resolve('linked')` đổi `student_id` · trigger `league_follow_student_merge` chuyển `student_id` khi gộp / hoàn tác gộp · xoá giải: `on delete cascade` hoặc đặt `deleted_at` | Lần gửi lại một chặng **update cả những dòng không đổi** |
| `league_standings` (view) | Tính `points_total × ranking_coefficient` từ `tournament_results` | Module 19 không đụng |
| Điểm danh | **Không có bảng.** `enrollments.sessions_attended` có cột nhưng 0/166 dòng có số | → để sau |
| Kỹ năng học viên | **Không có bảng** (chỉ `staff_skills` của nhân sự) | → để sau |
| Level | `levels`, `level_records` (`approval_status`, `approved_by`, `approved_at`); `upsert_level_completion` duyệt; trigger `level_records_after_write` → `recompute_student_level`. Staging: 1 dòng | Có thể tự động `level_up` (xem Q5) |
| Bài kiểm tra level | Không có bảng | → ghi tay |
| `event_redemptions` | Có, trừ **điểm sự kiện của thẻ** (`event_scores`), không dính `reward_ledger`. Staging: 0 dòng | Bước 6 |
| Gói Free / Premium, chu kỳ 12 tháng | **Chưa có gì** (không bảng gói, không cột kích hoạt chu kỳ; `passports.activated_at` là ngày kích hoạt sổ). `cycle_no`, `is_frozen` chưa hàm nào đặt | Xem Q3 |
| Quyền HLV theo lớp | `class_staff` (role `coach / head_coach / assistant / pe_teacher`), `enrollments` (status `active`), `is_class_staff(class)`, `is_head_coach()`, `is_admin()` | Staging: 3 lớp, 3 dòng `class_staff` |
| Thanh toán | `products`, `orders` (payOS), `payment_events` | Dùng cho phí ship |
| Ảnh | Đã có nhiều bucket storage riêng tư (mẫu từ `partner_visits.invoice_photo_path`) | Bucket mới cho giấy khen, ảnh quà |

## 2. Giữ / Đổi / Thêm

### Giữ nguyên
- `reward_ledger` là sổ duy nhất; không bảng số dư. Không update / delete dòng sổ (trigger chặn, xem dưới).
- `partner_visit_apply`, `partner_void_visit`, `league_standings`, `ranking_coefficient`, `tournament_results` và mọi hàm nhập kết quả: **không sửa thân hàm**. Phần A bám bằng trigger.
- `event_redemptions` và điểm sự kiện: không đụng tới bước 6.

### Đổi (chỉ thêm, không xoá / đổi tên)
| Chỗ | Đổi |
|---|---|
| `reward_ledger.reason` CHECK | Bỏ CHECK cũ, tạo lại gồm 3 giá trị cũ + `tournament_result`, `tournament_result_adjust`, `manual_void`, `gift_order`, `gift_order_refund`, `merge_transfer` (Q4) + mọi `code` của `reward_rules` (`school_award`, `attendance`, `attendance_full_month`, `skill_passed`, `level_up`, `conduct`, `theory_test`, `practice_test`). Dùng CHECK cố định (không FK) cho khớp cách làm cũ; thêm `code` mới về sau = migration nhỏ |
| `reward_ledger` | Thêm `expires_at timestamptz` (để trống, D59), `rule_id uuid` → `reward_rules`, `attachment_path text` (ảnh giấy khen), `voids_id uuid` → chính bảng (dòng `manual_void` trỏ dòng bị huỷ) |
| `reward_ledger` | Unique một phần `(source_type, source_id, reason)` với `reason in ('tournament_result', 'gift_order', 'gift_order_refund', 'level_up', 'partner_visit')` — nguyên tắc 5. Staging 0 dòng nên an toàn |
| `reward_ledger` | Trigger `before update or delete` → báo lỗi (nguyên tắc 2). Ngoại lệ duy nhất: cột `is_frozen` / `cycle_no` khi có cơ chế treo (Q3) |
| `reward_balance` | Viết lại (cùng chữ ký, thêm khoá trả về): `available` = tổng dòng `is_frozen = false`, `frozen`, `balance` giữ như cũ; lịch sử nối tên giải + chặng, tên nguồn, tên quà. `CustomerOffers.tsx` vẫn chạy (khoá `balance`, `recent` giữ) |
| `tournament_series` | Thêm `reward_coefficient numeric(4,2) not null default 1 check (>= 0)` |
| `tournaments` | Thêm `reward_enabled boolean not null default true`; **migration đặt `false` cho 10 chặng đang có** (xem 3.A — lý do chống "cộng bù ngầm") |

### Thêm
| Bảng / hàm | Nội dung |
|---|---|
| `reward_rules` | `code` (unique), `name_vi`, `name_en`, `default_points`, `min_points`, `max_points`, `allowed_roles text[]` (`admin` / `head_coach` / `coach`), `note_required`, `photo_allowed`, `mode` (`manual` / `auto` / `both`), `first_pass_only`, `is_active`, `sort_order`. Seed theo bảng mục 4 spec; `culture_award` **không** seed (đã nằm trong `points_total`) |
| `gift_items` | `name_vi/en`, `kind`, `description_vi/en`, `photo_path`, `points (> 0)`, `is_active`, `per_student_limit int null`, `sort_order` |
| `gift_stock_moves` | `gift_id`, `qty` (≠ 0), `reason` (`restock` / `order` / `order_cancel` / `adjust`), `order_id null`, `note`, `created_by`, `created_at`. Tồn = `sum(qty)`, không lưu cứng |
| `gift_orders` | `student_id`, `gift_id`, `qty`, `points` (đơn giá × qty, chốt lúc đặt), `pickup` (`league` / `school` / `office` / `post`), `ship_address jsonb null`, `ship_order_id → orders null`, `status` (`placed` / `prepared` / `delivered` / `shipped` / `completed` / `cancelled`), `cancel_reason`, `created_by`, mốc thời gian từng trạng thái |
| Trigger `tournament_results_reward` | Sau insert / update / delete trên `tournament_results` → `reward_sync_result(result_id)` |
| Trigger trên `tournaments` | Đổi `deleted_at` / `reward_enabled` / `series_id` → đồng bộ mọi dòng của chặng |
| Trigger trên `tournament_series` | Đổi `reward_coefficient` → đồng bộ các chặng đang bật (Q2) |
| `reward_sync_result(id)` | Lõi phần A (mục 3.A) |
| `reward_backfill_league(p_from_stage ...)` | Viết sẵn, **không chạy** (D60): bật `reward_enabled` cho các chặng chọn rồi đồng bộ |
| `reward_record(p_student_ids uuid[], p_class_id, p_rule_code, p_points, p_note, p_attachment)` | Màn "Ghi điểm thưởng" |
| `reward_void(p_ledger_id, p_reason)` | `manual_void`, admin hoặc người ghi, ≤ 7 ngày |
| `gift_catalog()`, `gift_order_place(...)`, `gift_order_cancel(...)`, `gift_order_set_status(...)`, `gift_stock_add(...)` | Phần C |
| `reward_admin_ledger(student, rule/source, month)` | Tra cứu + xuất CSV (CSV dựng ở trình duyệt từ kết quả hàm, như các trang admin khác) |
| Màn hình | Admin: Danh mục nguồn điểm, Ghi điểm thưởng, Sổ điểm, Kho quà, Đơn quà · HLV: Ghi điểm thưởng (lớp mình) · Phụ huynh: Ví điểm (2 ô), Đổi quà, Đơn quà của con |

Mọi bảng mới: `org_id`, `created_at/updated_at`, trigger `set_updated_at` + `audit_row`, RLS bật + admin đọc, ghi qua hàm security definer, `revoke ... from anon`.

## 3. Thiết kế lõi

### 3.A League → điểm thưởng (bước 3)
`reward_sync_result(r)`: mục tiêu của dòng kết quả `r` =
`round(points_total × reward_coefficient)` cho `r.student_id` **nếu** `participant_kind = 'student'`, `student_id` không rỗng, chặng `deleted_at is null` và `reward_enabled`; mọi học viên khác = 0.
So với `sum(delta)` theo từng học viên trong sổ có `source_type = 'tournament_result' and source_id = r.id`; lệch thì ghi dòng: lần đầu cho dòng kết quả đó → `tournament_result`, các lần sau → `tournament_result_adjust`. Dòng kết quả bị xoá cứng → mục tiêu 0 cho mọi người.

Khớp tiêu chí: (1) Best Gross 500+50 → +550 · (2) đổi Winner bảng → −200, tổng 350 · (3) ghép lại → người cũ −N, người mới +N · (4) gửi lại chặng: update không đổi số → không ghi gì · (5) phụ huynh / thầy cô → mục tiêu 0 · (10)(11) không đụng `league_standings`, dòng cũ.

**Vì sao cần `reward_enabled`:** nếu chỉ dùng trigger, lần gửi lại chặng 11 (hoặc ghép một dòng cũ ở hàng chờ, hoặc gộp hồ sơ) sẽ cộng đủ điểm cho các chặng cũ — tức là cộng bù ngầm khi D60 chưa chốt. Chặng đang có đặt `false`; chặng tạo mới mặc định `true`. Hàm cộng bù chỉ việc bật cờ.

### 3.B Ghi tay (bước 4)
- Quyền: admin mọi học viên; `head_coach` (vai `user_roles`) mọi học viên; `coach` chỉ học viên `enrollments.status = 'active'` ở lớp mình là `class_staff` — kiểm cho **từng** con khi ghi cả lớp. Q6 về `assistant`, `pe_teacher`.
- Điểm phải nằm trong `[min_points, max_points]`; `note_required` → ghi chú rỗng bị từ chối (tiêu chí 6); `first_pass_only` (`theory_test`, `practice_test`) → học viên đã có dòng cùng `code` còn hiệu lực thì từ chối.
- `manual_void`: dòng âm bằng đúng `delta`, `voids_id` trỏ dòng gốc, lý do bắt buộc; mỗi dòng chỉ huỷ một lần.
- Nguồn tự động: `attendance`, `attendance_full_month`, `skill_passed` → **để sau** (chưa có bảng). `level_up` → xem Q5.

### 3.C Đổi quà (bước 5)
`gift_order_place`: kiểm người gọi là phụ huynh đang quản lý (`is_guardian_of`) hoặc tài khoản con đang hoạt động → `select ... from students where id = p for update` (khoá theo học viên) → `select ... from gift_items where id = g for update` (khoá theo quà) → kiểm `available ≥ points`, tồn ≥ qty, giới hạn mỗi người → tạo đơn, dòng sổ `gift_order` (âm), `gift_stock_moves` (−). Hai lần bấm cùng lúc xếp hàng ở khoá học viên → lần sau thấy số dư mới (tiêu chí 7, 8).
Huỷ: phụ huynh khi `placed`, admin khi chưa `delivered/shipped/completed` → `gift_order_refund` (dương) + `order_cancel` (+). Đổi trạng thái theo chiều tiến, chỉ admin.

## 4. Xung đột với code / spec hiện có

1. **Gửi lại chặng update mọi dòng, kể cả không đổi** → trigger phải so số, không dựa vào "có update". Đã xử lý ở 3.A.
2. **`league_results_*` xoá cứng dòng kết quả** → `source_id` mất nguồn; sổ vẫn giữ `source_id` (không FK), lịch sử hiện "kết quả đã xoá" + tên chặng lấy từ ghi chú lúc ghi. Dòng sổ sẽ ghi sẵn `note` = "Chặng N · mùa …" để không phụ thuộc dòng kết quả còn hay mất.
3. **Gộp hồ sơ** (`merge_students`): kết quả giải đi theo hồ sơ giữ lại → phần A tự chuyển điểm. Nhưng **các dòng sổ khác** (đối tác, ghi tay, quà) nằm lại ở hồ sơ bị gộp → số dư "mắc kẹt". Q4.
4. **Nguyên tắc 2 (không sửa dòng) va với `is_frozen` theo dòng** (spec 00 mục 7: hết chu kỳ thì điểm cũ thành treo; nâng Premium thì mở khoá). Đánh dấu treo = sửa dòng. Q3.
5. **`reward_balance` hiện trả `balance` = tổng mọi dòng.** Đổi nghĩa sẽ lệch màn đối tác → giữ `balance`, thêm `available` / `frozen`.
6. **Spec 04 mục 3 "người đổi: phụ huynh hoặc học viên"** — tài khoản con (`student_accounts`) có thể là trẻ nhỏ. Q7.
7. **Phí ship "thu qua app"** nhưng "theo bưu điện, admin nhập" (phụ lục C4) → phí chỉ biết sau khi đặt. Q8.
8. Phụ lục C1 có "1 tick Passport = 1 điểm", "bài tập ở nhà 10", "bài tự luyện", "buổi tập có dẫn dắt" — spec 19 không liệt kê. **Không seed** ở module này (chưa có bảng), ghi vào phụ lục D nếu anh muốn.

## 5. Câu hỏi cần anh Long chốt

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | 10 chặng mùa 2026 đã có trên staging (41.200 điểm, 126 dòng học sinh): khi phần A lên, để **tắt** điểm thưởng cho các chặng này tới khi chốt D60? | **Có** — `reward_enabled = false` cho chặng cũ; chặng mới mặc định bật |
| Q2 | Admin đổi `reward_coefficient` của chuỗi giải: tính lại cả các chặng đã cộng, hay chỉ áp cho chặng sau? | **Tính lại** cả chặng đang bật (đúng ý "luôn khớp số đúng hiện tại"); màn admin cảnh báo trước khi lưu |
| Q3 | Cơ chế treo gói Free chưa có (chưa có bảng gói / Premium). Module 19 làm gì? | Bước 2 chỉ chuẩn bị: `available` = tổng dòng `is_frozen = false` (hôm nay = toàn bộ). Cho phép **một ngoại lệ** với nguyên tắc 2: hàm hệ thống được đổi `is_frozen` / `cycle_no` (có `audit_logs`), không đổi `delta`. Việc chạy treo / mở khoá làm cùng module gói Premium |
| Q4 | Gộp hồ sơ: các dòng sổ không phải kết quả giải của hồ sơ bị gộp xử lý sao? | Trigger gộp ghi cặp dòng `merge_transfer` (− ở hồ sơ bị gộp, + ở hồ sơ giữ lại) theo **số dư khả dụng và phần treo riêng**; hoàn tác gộp ghi cặp ngược lại. Đơn quà cũ giữ ở hồ sơ cũ |
| Q5 | `level_up` 200 điểm: tự động khi `level_records` chuyển sang `approved` + `completed` (hàm `upsert_level_completion`, nhập lịch sử cũng tạo dòng `approved`)? | **Tự động chỉ với `source in ('assessment', 'school_entry')`** và duyệt sau ngày module lên; **không** cộng cho `legacy_import` / `admin` (dữ liệu cũ). Huỷ duyệt → dòng trừ |
| Q6 | `assistant` (trợ giảng) và `pe_teacher` (GV thể dục) có được ghi điểm thưởng cho lớp mình không? | **Không** ở bước này; chỉ admin, HLV trưởng, HLV lớp như spec |
| Q7 | Tài khoản con (`student_accounts`) tự đổi quà được không? | **Không** ở bước 5, chỉ xem ví; phụ huynh đặt. Bật sau bằng cấu hình `rewards.student_can_redeem` |
| Q8 | Gửi bưu điện: phí ship admin nhập sau khi đặt, phụ huynh trả qua payOS, trả xong mới gửi? | **Có**: đơn `post` tạo ở `placed`, admin nhập phí → tạo `orders` (sản phẩm `gift_shipping`) → phụ huynh trả → admin chuyển `shipped`. Chưa trả thì không cho `shipped`; huỷ đơn thì huỷ luôn đơn phí |
| Q9 | Ảnh giấy khen (`school_award`) có bắt buộc không? Ai xem được? | Không bắt buộc; bucket riêng tư `reward-proofs`, chỉ admin, người ghi và phụ huynh của con xem |
| Q10 | Danh mục quà và tồn kho ban đầu (spec 04 mục 7: trang 28 Passport, 50 → 30.000 điểm) | Bước 2 **không** seed quà; admin nhập trên màn Kho quà ở bước 5. Anh gửi danh sách nếu muốn seed |
| Q11 | Điểm `school_award`: khoảng min–max bao nhiêu? | Tạm `50–500`, mặc định 100 (admin chỉnh) |

## 6. Kế hoạch file theo bước (sau khi anh duyệt)

| Bước | Migration | Test SQL | Giao diện |
|---|---|---|---|
| 2 | `20261110000001_rewards_data.sql`: CHECK `reason`, cột `reward_ledger` (+ `expires_at`), unique, trigger chặn sửa / xoá, `reward_coefficient`, `reward_enabled` (chặng cũ = false), `reward_rules` + seed, `gift_items`, `gift_stock_moves`, `gift_orders` | `044_rewards_data.sql` (tiêu chí 11, chặn sửa dòng, seed) | — |
| 3 | `…02_rewards_league.sql`: `reward_sync_result`, 3 trigger, `reward_backfill_league` (không chạy), `reward_balance` mới | `045_rewards_league.sql` (tiêu chí 1–5, 10) | Ví điểm 2 ô trên trang con (chỉ xem) |
| 4 | `…03_rewards_manual.sql`: `reward_record`, `reward_void`, (`level_up` nếu Q5 có) | `046_rewards_manual.sql` (tiêu chí 6) | Admin / HLV: Ghi điểm thưởng; admin: Danh mục nguồn, Sổ điểm + CSV |
| 5 | `…04_rewards_gifts.sql` | `047_rewards_gifts.sql` (tiêu chí 7–10; tiêu chí 8 kiểm bằng hai phiên trên staging vì PGlite một kết nối) | Kho quà, Đơn quà (admin); Đổi quà, Đơn của con (phụ huynh) |
| 6 | `event_redemptions` vào sổ | — | — |
| 7 | Chạy `reward_backfill_league` (khi D60 chốt) | — | — |

Mỗi bước: PGlite (7 bài hỏng sẵn: 003, 007, 013, 020, 021, 022, 026), vitest, `tsc`, build, vi/en đủ khoá; dừng chờ anh duyệt; đẩy staging chỉ khi anh cho.

## 7. Kết quả (10/11/2026)

| Bước | Migration | Test | Giao diện |
|---|---|---|---|
| 2 | `20261110000001_rewards_data.sql` | 044 | — |
| 3 | `20261110000002_rewards_league.sql` | 045 (tiêu chí 1–5, 10) | Ví điểm 2 ô trên trang con |
| 4 | `20261110000003_rewards_manual.sql` (thêm reason `level_up_adjust`) | 046 (tiêu chí 6) | `/admin/rewards` (Ghi điểm, Sổ điểm + CSV, Nguồn điểm), `/coach/rewards` |
| 5 | `20261110000004_rewards_gifts.sql` (sửa thân `mark_order_paid`: lời thông báo theo sản phẩm) | 047 (tiêu chí 7, 8 tuần tự, 9, 10) | `/app/children/:id/gifts`; admin: Kho quà, Đơn quà |
| 6 | `20261110000005_rewards_event_redemptions.sql` | 048 | Ví hiện tên sự kiện + quà |
| 7 | Không chạy `reward_backfill_league` (D60: anh Long 11/11/2026 chọn nhập số dư thực tế). `20261111000001_rewards_opening_import.sql`: `reward_import_match`, `reward_import_opening`, reason `opening_balance(_adjust)` — **chưa áp staging** | 049 | `/admin/rewards` tab Tải lên Excel (file mẫu, đối chiếu, chọn bạn trùng tên, tải danh sách cần xử lý) |

- **Bước 6, cách làm đã chọn:** điểm sự kiện vẫn là ví riêng của thẻ; mỗi lần đổi ở quầy ghi một cặp dòng (+N `event_points`, −N `event_redemption`), tổng 0. Có lịch sử trong sổ mà không đổi số dư, không đổi quầy. Gộp hẳn hai ví là D62.
- **Staging sau khi áp:** 5 migration ghi trong `schema_migrations`; `reward_ledger` 0 dòng; 10 chặng `reward_enabled = false`; 8 nguồn điểm; sản phẩm `gift_shipping`; kho `reward-proofs`, `gift-photos`; 66 dòng `league_standings` không đổi. Test 044–048 và 012, 030, 031, 039 chạy trên staging (tự huỷ): đều ALL_OK.
- **Tiêu chí 8 trên staging:** giữ khoá `students … for update` ở phiên A, phiên B gọi đúng lệnh khoá đầu của `gift_order_place` → phải chờ (hết `lock_timeout`), tức hai lần đổi cùng lúc của một con chạy nối tiếp.
- **Đang chạy thật từ nay:** chặng League tạo mới tự cộng điểm thưởng; duyệt lên level (assessment / school_entry) cộng 200; đổi quà ở quầy sự kiện ghi cặp dòng.
