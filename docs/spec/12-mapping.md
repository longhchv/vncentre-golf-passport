# 12 · Bản đồ dữ liệu: module Chuyến thi đấu

Bản nháp 14/10/2026 (bước 0) · đọc từ staging `zrfipnqkjrhzrscaaeth` và `12-module-chuyen-thi-dau.md` v0.9 (sửa lần 3) · **chưa chạy migration**, chờ anh Long duyệt.

Quy ước repo áp cho mọi bảng mới: `id uuid` (`gen_random_uuid()`), `org_id` (`default_org_id()`), `created_at`, `updated_at` (trigger `set_updated_at`), trigger `audit_row` (nhật ký), bật RLS mặc định từ chối, policy `admin_all` cho bảng cấu hình. Bảng nghiệp vụ có thêm `deleted_at`. Trạng thái dùng `text` + `check`. Migration chỉ thêm, không đổi tên, không xoá.

Staging hiện **không có** bảng nào trùng tên với bảng spec 12 đề xuất (`trips`, `trip_*`, `student_clubs*`, `stat_benchmarks`, `weather_rules`).

---

## 1. Hai khái niệm then chốt

### 1.1 "Phụ huynh có quyền quản lý" con (golfer)

Dùng đúng hàm đang có, không viết lại:

```
can_manage_student(student_id)  -- SECURITY DEFINER
= tồn tại student_guardians sg join guardians g
    where sg.student_id = <golfer>
      and g.user_id = auth.uid()
      and sg.status = 'active' and sg.can_manage
      and sg.deleted_at is null and g.deleted_at is null
```

- `student_guardians.relationship` nhận `father`, `mother`, `guardian`, `other`, `self`. Người lớn tự chơi (golfer ≥ 18 tuổi, như module 10/11) là dòng `self` với `can_manage = true` (staging: 37 dòng `self`, tất cả `can_manage = true`), nên **golfer người lớn có toàn quyền như phụ huynh** trên chuyến của chính mình, kể cả tài chính. Đúng tinh thần spec mục 1.8 (chỉ golfer dưới 18 bị ẩn tài chính).
- Người giám hộ thứ hai được mời với `can_manage = false` (F6): spec 12 chưa nói quyền của nhóm này → **câu hỏi Q3**.
- Phụ huynh có dòng `pending_confirmation` (chờ duyệt liên kết) **không** có quyền gì trên chuyến.

### 1.2 "Người có hồ sơ Passport" (HLV, caddie, người khác trong chuyến)

Theo nguyên tắc module 11 (`11-mapping.md` mục 3.1–3.3, đã chốt 09/10/2026):

| Thành phần | Nơi lưu |
|---|---|
| Hồ sơ người, mã trọn đời `VNC-…` | `students.id`, `students.student_code` |
| Mã Golf Passport (QR `/p/<mã>`) | `passports.passport_code` (`student_id` trỏ về hồ sơ); người không phải học viên dùng hạng `staff` "Thẻ nhân sự" (`counts_toward_single_active = false`) |
| Người lớn gắn với tài khoản của chính mình | `guardians.user_id = <tài khoản>` + `student_guardians.relationship = 'self'` |
| Trẻ dưới 11 tuổi (ít gặp trong vai HLV/caddie) | hồ sơ con gắn dưới phụ huynh như module 11 |

Vì vậy `trip_members` lưu **hai khoá**:
- `person_student_id` → `students.id`: người đó là ai (bắt buộc với HLV, caddie, other; với golfer = `trips.student_id`).
- `user_id` → `profiles.user_id`: tài khoản dùng để đăng nhập và kiểm tra quyền (RLS). Lấy từ `guardians.user_id` của dòng `self`, hoặc `student_accounts.user_id` nếu đó là tài khoản học viên. Trống khi người đó chưa có tài khoản (chưa vào được app).

Tìm / tạo người khi thêm thành viên: dùng lại cách của `crew_import` (module 11): tìm theo **mã Golf Passport / mã VNC**, hoặc theo **SĐT / email** trong `guardians` rồi `profiles`. Chỉ có tài khoản mà chưa có hồ sơ (ví dụ HLV đang có tài khoản nhân viên) thì tạo hồ sơ `self` + sổ hạng `staff` gắn vào tài khoản đó. Trùng nghi vấn (cùng tên, khác số) đưa người dùng chọn, không tự gộp. Staging hiện có 2 tài khoản HLV, mới 1 người có hồ sơ `self`.

### 1.3 Golfer đăng nhập

- Golfer trẻ em: tài khoản học viên `student_accounts` (`user_id`, `is_active`); hàm có sẵn `my_student_id()` trả `student_id` của tài khoản đang đăng nhập. Staging hiện có 0 tài khoản học viên đang dùng.
- Golfer người lớn: là "phụ huynh của chính mình" (mục 1.1).
- Tuổi để ẩn tài chính: tính từ `students.date_of_birth` theo ngày hiện tại giờ Việt Nam; **không có ngày sinh thì coi như dưới 18** (an toàn).

---

## 2. Dùng lại (không đổi cấu trúc)

| Khái niệm spec 12 | Bảng / hàm đang có | Cột dùng |
|---|---|---|
| Golfer | `students` | `id`, `full_name`, `student_code`, `date_of_birth`, `current_level_id`, `deleted_at`, `merged_into_student_id` |
| Level, cấp độ | `levels` (+ `programs`) | `id`, `number`, `name_vi/en`, `program_id`. Bảng quy đổi handicap chỉ áp cho chương trình `core20` (20 level, `is_official_level_track = true`) |
| Phụ huynh, người tự chơi | `guardians`, `student_guardians` | xem mục 1.1 |
| Tài khoản, tên hiển thị | `profiles` | `user_id`, `full_name`, `status = 'active'` |
| Tài khoản học viên | `student_accounts` | `student_id`, `user_id`, `is_active` |
| Mã Golf Passport | `passports`, `passport_tiers` | `passport_code`, `student_id`, `status`, `tier_id`; hạng `staff` đã có |
| Admin | `is_admin()` (= `has_role('admin')`, kiểm tra `profiles.status = 'active'`) | |
| Đồng ý của phụ huynh | `consents` | `guardian_id`, `student_id`, `type`, `version`, `granted`, `revoked_at` |
| Cấu hình | `app_settings` | `key` (duy nhất theo `org_id`), `value jsonb`, `description_vi/en`; đọc bằng `setting_int()` / `useSetting()` |
| Nhật ký | trigger `audit_row` → `audit_logs`; lý do qua `set_config('app.audit_reason', …)` | |
| Thông báo trong app | `notifications` | `user_id`, `type`, `title_vi/en`, `body_vi/en`, `link` |
| Kho file riêng tư | `storage.buckets` + hàm `storage_first_uuid(name)` (có từ module 10, B21) | lấy `trip_id` từ thư mục đầu của đường dẫn |
| Màn admin cấu hình | `CrudTable` (đang dùng ở `ClassTypesPage`, `ClassesPage`, `AcademicYearsPage`) | |

---

## 3. Thêm vào bảng có sẵn

| Bảng | Thêm | Bước |
|---|---|---|
| `levels` | `hcp_equivalent numeric(4,1)` trống được. Seed `quy_doi_level_hdc.csv` cho level 10–20 của `core20`: 10→38, 11→30, 12→25, 13→20, 14→18, 15→16, 16→15, 17→12, 18→10, 19→8, 20→4 (tạm dùng, CT2). Level 1–9 để trống | 1 |
| `consents` | thêm `'ai_processing'` vào `consents_type_check` (đang có: `terms`, `privacy`, `leaderboard_name`, `photo`, `contact_by_vncentre`) | 7c |
| `app_settings` | các khoá ở mục 6 | 1, 7b, 7c |

---

## 4. Bảng cấu hình mới (bước 1, seed từ `data/chuyen-thi-dau/*.csv`)

Chỉ admin ghi (`admin_all`); người dùng đã đăng nhập được **đọc** (cần để hiển thị). Cột `_en` để trống, Minh bổ sung sau (CT6).

| Bảng | Cột | CSV → cột |
|---|---|---|
| `trip_logistics_types` | `code` (duy nhất), `name_vi`, `name_en`, `sort_order` | `hau_can_loai.csv` (6): `ma`→`code`, `ten_vi`→`name_vi` |
| `trip_logistics_templates` | `type_code` → `trip_logistics_types.code`, `title_vi/en`, `anchor` (`start`, `end`, `each_play_day`), `offset_days int`, `detail_vi/en`, `scope` (`all`, `domestic`, `international`), `sort_order`, `is_active` | `hau_can_mau.csv` (12): `loai`, `noi_dung_vi`, `moc`, `lech_ngay`, `ghi_chu_vi`, `pham_vi` |
| `trip_pack_templates` | `group_name_vi/en` (`group` là từ khoá SQL nên đổi tên), `sort_order`, `name_vi/en`, `scope`, `qty_rule` (`fixed`, `days`, `play_days`, `rounds`, `half_days`), `qty_a numeric`, `qty_b numeric`, `qty_fixed numeric`, `is_active` | `hanh_ly_mau.csv` (52, 6 nhóm): `nhom`, `thu_tu`, `ten_vi`, `pham_vi`, `cong_thuc`, `he_so_a`, `cong_them_b`, `so_co_dinh` |
| `trip_check_templates` | `day_kind` (`round`, `practice`), `sort_order`, `name_vi/en`, `is_active` | `checklist_truoc_vong_mau.csv` (19) |
| `trip_consumable_templates` | `name_vi/en`, `unit_vi/en`, `qty_rule`, `qty_a`, `qty_b`, `qty_fixed`, `warn_threshold numeric`, `sort_order`, `is_active` | `kho_tieu_hao_mau.csv` (7) |
| `trip_schedule_templates` | `start_type` (`tee`, `shotgun`, `practice`), `anchor` (`wake`, `leave`, `arrive`, `assembly`, `start`), `offset_min int`, `title_vi/en`, `desc_vi/en`, `is_highlight bool`, `sort_order` | `lich_truoc_vong_mau.csv` (37): `kieu_xuat_phat`, `moc`, `lech_phut`, `ten_vi`, `mo_ta_vi`, `noi_bat`; `sort_order` theo thứ tự dòng |
| `trip_food_templates` | `anchor` (`bed`, `wake`, `start`, `every_hole`, `hole_n`, `finish`, `avoid`), `anchor_value int` (spec gọi `value`), `title_vi/en`, `desc_vi/en`, `sort_order` | `an_uong_mau.csv` (10): `moc`, `gia_tri`, `ten_vi`, `mo_ta_vi` |
| `trip_preround_notes` | `group_name_vi/en`, `sort_order`, `text_vi/en`, `is_active` | `luu_y_truoc_vong.csv` (19) |
| `trip_expense_categories` | `code` (duy nhất; seed sinh `c01`…`c11` vì CSV không có mã), `name_vi/en`, `sort_order`, `is_active` | `hang_muc_chi_phi.csv` (11) |
| `trip_expense_natures` | `code` (`fixed`, `variable`, `cuttable`), `name_vi/en` | `tinh_chat_chi_phi.csv` (3) — spec 4.1 không liệt kê nhưng có CSV; dùng làm danh sách cho `trip_expenses.nature` |
| `stat_benchmarks` | `hcp numeric` (duy nhất), `fairway_pct`, `gir_holes`, `putts`, `three_putts`, `penalties`, `up_down_pct`, `doubles_plus` (đều `numeric`) | `moc_chi_so_theo_hdc.csv` (7): `hdc`, `fairway_pct`, `gir_so_ho`, `putt`, `three_putt`, `gay_phat`, `up_down_pct`, `ho_double_tro_len` |
| `weather_rules` | `metric` (`feels`, `uv`, `rain`, `wind`, `tmin`, `aqi`, `storm`), `from_value numeric`, `below_value numeric` (trống = không chặn trên), `level` (1–4), `name_vi/en`, `tips_vi/en text[]`, `checklist_add_vi/en text[]`, `sort_order` | `thoi_tiet_quy_tac.csv` (17): danh sách trong CSV ngăn bằng ` \| ` → mảng |

Thay đổi mẫu chỉ áp cho chuyến tạo **sau** đó (nghiệm thu 7): khi tạo chuyến, dữ liệu mẫu được **chép** vào bảng của chuyến (giống `event_crew_tasks` chép từ việc mẫu ở module 11).

---

## 5. Bảng nghiệp vụ mới

Mọi bảng dưới đây có `org_id`, `created_at`, `updated_at`, `deleted_at` (trừ bảng con nhỏ ghi chú "không xoá mềm"), trigger `set_updated_at` + `audit_row`, RLS theo mục 7.

### 5.1 Chuyến và thành viên (bước 2)

**`trips`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `student_id` | uuid → `students` | golfer, bắt buộc |
| `title` | text | |
| `scope` | text `domestic` / `international` | |
| `place`, `course_name` | text | |
| `course_lat`, `course_lng` | numeric(9,6) | trống được (bước 7b) |
| `timezone` | text, mặc định `Asia/Ho_Chi_Minh` | **thêm so với spec 4.2**: spec 5.8 nói giải quốc tế dùng múi giờ nơi thi đấu nhưng chưa có cột |
| `start_date`, `end_date` | date | lưu ngày lịch, không qua UTC (nguyên tắc 10) |
| `currency` | char(3) ISO 4217 | trong nước cố định `VND` |
| `fx_rate_vnd` | numeric(14,4) | VND = 1 |
| `par` | smallint | mặc định `trip.par.default` (72) |
| `travel_min`, `arrive_before_min` | smallint | mặc định từ cấu hình |
| `level_id` | uuid → `levels` | chép từ `students.current_level_id` khi tạo, sửa được |
| `hcp_override` | numeric(4,1) | Handicap Index nhập tay |
| `share_finance_with_coach`, `share_finance_with_caddie` | bool, mặc định false | |
| `advanced` | bool, mặc định false | chế độ nâng cao |
| `status` | `planning`, `ongoing`, `done`, `cancelled` | |
| `created_by` | uuid → `profiles.user_id` | |
| `tournament_id` | uuid, **không khoá ngoại** | bảng `tournaments` chưa có (đợt 3) |
| `livescore_url` | text | |
| `result_status` | `none`, `submitted`, `verified`, `rejected` | |
| `result_submitted_by`, `result_submitted_at`, `result_checked_by`, `result_checked_at`, `result_note` | | `*_by` → `profiles.user_id` |

**`trip_members`**: `trip_id`, `person_student_id` → `students`, `user_id` → `profiles.user_id` (trống được), `role` (`guardian`, `coach`, `caddie`, `golfer`, `other`), `display_name`, `status` (`pending_guardian`, `active`, `removed`), `approved_by_guardian_id` → `guardians`, `approved_at`, `valid_from date`, `valid_to date`, `added_by` → `profiles.user_id`. Duy nhất (`trip_id`, `person_student_id`) khi chưa `removed`.
- Phụ huynh **không cần** dòng thành viên: quyền phụ huynh lấy thẳng từ `can_manage_student(trips.student_id)` (spec mục 3: "luôn luôn, kể cả chuyến do người khác tạo"). Dòng `guardian` chỉ để hiển thị danh sách đoàn khi phụ huynh đi cùng.
- Golfer: quyền lấy từ `my_student_id() = trips.student_id` hoặc mục 1.1 (người lớn).
- **Không lưu SĐT / email** trong `trip_members`; danh bạ đoàn trả qua hàm, chỉ phụ huynh thấy liên hệ (spec 1.8).

### 5.2 Hậu cần, hành lý (bước 3)

- **`trip_logistics`**: `trip_id`, `template_id`, `scope`, `type_code`, `title`, `due_date date`, `due_time time`, `detail`, `booking_ref`, `status` (`todo`, `doing`, `done`), `sort_order`. `each_play_day` sinh một dòng cho mỗi ngày ra sân.
- **`trip_pack_items`**: `trip_id`, `template_id` (trống nếu tự thêm), `scope`, `group_name`, `name`, `qty_rule`, `qty_a`, `qty_b`, `qty_fixed`, `qty_override`, `is_packed`, `packed_by`, `packed_at`, `sort_order`. Số hiển thị = `qty_override` hoặc công thức 5.1.

### 5.3 Ngày đấu (bước 4)

- **`trip_days`**: `trip_id`, `kind` (`practice`, `round`), `round_no`, `label`, `play_date date`, `start_type` (`tee`, `shotgun`), `start_time time` (giờ địa phương nơi thi đấu), `start_hole` (1–18; `tee` chỉ 1 hoặc 10), `assembly_min`, `pairing_text`, `plan_note`, `day_note`, **`play_style`** (`attack`, `safe`, `per_hole`, mặc định `per_hole`; spec 5.9, chưa có ở 4.2).
- **`trip_day_checks`**: `day_id`, `template_id`, `text`, `is_done`, `done_by`, `done_at`, `sort_order`, `source` (`template`, `weather`, `manual`) — `weather` cho việc thêm từ cảnh báo thời tiết (5.8).
- Thời gian biểu, ăn uống, lưu ý: **tính khi hiển thị** từ `trip_days` + bảng mẫu + cấu hình, không lưu thành dòng (spec chỉ yêu cầu lưu checklist).

### 5.4 Kết quả (bước 5)

- **`trip_day_results`**: `day_id` (duy nhất, chỉ `kind = round`), `score_total`, `score_front`, `score_back`, `rank_text`, `fairways_hit`, `fairways_possible`, `gir`, `putts`, `three_putts`, `penalties`, `up_down_made`, `up_down_chances`, `birdies`, `doubles_plus` (smallint), `energy_self`, `mental_self` (1–5), `went_well`, `do_differently`, `entered_by`, `status` (`draft`, `submitted`).
- Sửa điểm một vòng khi `trips.result_status = 'verified'` → trigger đưa về `submitted` và ghi nhật ký (spec 5.7.5).

### 5.5 Kho đồ, mua thêm (bước 6)

- **`trip_consumables`**: `trip_id`, `template_id`, `name`, `unit`, `carried_qty`, `warn_threshold`.
- **`trip_consumable_usage`**: `day_id`, `consumable_id`, `used_qty`; duy nhất (`day_id`, `consumable_id`).
- **`trip_purchases`**: `day_id`, `consumable_id` (trống được), `name`, `qty`, `est_amount numeric(14,2)`, `currency`, `is_bought`, `expense_id` → `trip_expenses`.

### 5.6 Tài chính (bước 7)

- **`trip_expenses`**: `trip_id`, `spent_on date`, `category_id` → `trip_expense_categories`, `description`, `amount_original numeric(14,2)`, `currency char(3)`, `fx_rate_vnd numeric(14,4)`, `amount_vnd bigint` (spec ghi `int`; dùng `bigint` vì `int` tối đa ~2,1 tỷ đồng), `nature` (`fixed`, `variable`, `cuttable`), `payer_text`, `created_by`, `source` (`manual`, `purchase`). `amount_vnd = round(amount_original × fx_rate_vnd)` tính ở máy chủ.
- **`trip_budgets`**: `trip_id`, `category_id`, `amount_vnd bigint`; duy nhất (`trip_id`, `category_id`).

### 5.7 Thời tiết (bước 7b)

**`trip_day_weather`**: `day_id` (duy nhất), `source` (`open_meteo`, `manual`), `fetched_at`, `window_start`, `window_end` (timestamptz), `feels_max`, `temp_max`, `temp_min_morning`, `uv_max`, `rain_prob_max`, `wind_gust_max`, `aqi_max`, `pm25_max` (numeric), `storm bool`, `raw jsonb`, `manual_override jsonb`, `entered_by`, `last_level smallint`, `last_manual_refresh_at` (chặn bấm Cập nhật quá 1 lần / 15 phút).

### 5.8 Chế độ nâng cao (bước 7c)

| Bảng | Cột | Ghi chú |
|---|---|---|
| `trip_scorecards` | `trip_id` (duy nhất), `selected_tee_id`, `wanted_tee_text`, `unit` (`yd`, `m`), `source` (`manual`, `ai_photo`), `source_asset_path` | |
| `trip_scorecard_holes` | `scorecard_id`, `hole_no` (1–18), `par`, `stroke_index`; duy nhất (`scorecard_id`, `hole_no`) | đủ par thì cập nhật `trips.par` |
| `trip_scorecard_tees` | `scorecard_id`, `name`, `color_key`, `sort_order` | |
| `trip_scorecard_tee_holes` | `tee_id`, `hole_no`, `distance`, `par_override`, `si_override`; duy nhất (`tee_id`, `hole_no`) | |
| `student_clubs` | `student_id`, `name`, `carry numeric`, `unit`, `sort_order`, `is_active` | thuộc VĐV, dùng lại mọi chuyến |
| `student_club_logs` | `student_id`, `logged_on date`, `kind` (`home`, `practice_day`, `pre_round_range`), `trip_day_id` (trống được), `entered_by` | |
| `student_club_log_items` | `log_id`, `club_id`, `carry` | |
| `trip_yardage_images` | `trip_id`, `storage_path`, `hole_no` (trống = cả sổ), `uploaded_by` | |
| `trip_day_pins` | `day_id`, `hole_no`, `from_front`, `side` (`L`, `C`, `R`), `green_depth`, `source`; duy nhất (`day_id`, `hole_no`) | |
| `trip_day_hole_scores` | `day_id`, `hole_no`, `strokes`; duy nhất (`day_id`, `hole_no`) | đủ 18 hố → tự điền tổng ở `trip_day_results` |
| `trip_day_hole_modes` | `day_id`, `hole_no`, `mode` (`attack`, `safe`); duy nhất (`day_id`, `hole_no`) | **có ở 5.9, chưa có ở 4.2** |
| `trip_day_ai_plans` | `day_id`, `text`, `image_count`, `provider` (`claude`, `workers_ai`), `model`, `input_tokens`, `output_tokens`, `est_cost_usd numeric(10,4)`, `created_by`, `input_hash` | không xoá mềm (lịch sử) |
| `ai_usage_logs` | `task` (`extract_scorecard`, `extract_pins`, `strategy`), `trip_id`, `provider`, `model`, `input_tokens`, `output_tokens`, `est_cost_usd`, `ok bool`, `error` | **thêm so với spec**: để tính tổng chi tháng so với trần cho cả lần đọc ảnh (spec 5.9 "theo dõi chi phí"), không chỉ bản phân tích |

---

## 6. Khoá cấu hình (`app_settings`)

Staging đang dùng tiền tố theo module (`event.*`, `otp.*`, `crew_kit.*`…); chưa có `trip`, `strategy`, `unit`, `ai`, `weather`, `hcp`.

| Nguồn | Khoá đề xuất |
|---|---|
| `tham_so_lich.csv` (13) | thêm tiền tố **`trip.`**: `trip.arrive_before_min.tee` (75), `trip.arrive_before_min.practice` (45), `trip.assembly_before_min.shotgun` (30), `trip.shotgun.min_gap_after_arrive` (55), `trip.wake.before_start_min.round` (165), `trip.wake.before_leave_min.round` (60), `trip.wake.before_start_min.practice` (150), `trip.wake.before_leave_min.practice` (50), `trip.sleep_hours` (9), `trip.minutes_per_hole` (15), `trip.travel_min.default` (20), `trip.par.default` (72), `trip.hcp.default_when_unknown` (18) |
| `chien_luoc_tham_so.csv` (15) | giữ nguyên như CSV: `strategy.*` (10 khoá), `unit.paces_to_m`, `unit.m_to_yd`, `unit.default` (`"yd"`), `ai.max_words`, `ai.max_images` |
| Spec 5.4.3 (ngưỡng cảnh báo sau vòng) | **CSV chưa có**, đề xuất: `trip.analysis.putts_over` (2), `trip.analysis.three_putts_over` (2), `trip.analysis.fairway_pct_under` (10), `trip.analysis.gir_under` (2), `trip.analysis.up_down_pct_under` (15), `trip.analysis.up_down_min_chances` (3), `trip.analysis.penalties_over` (1.5), `trip.analysis.doubles_over` (2), `trip.analysis.back9_worse_by` (3), `trip.analysis.self_rating_low` (2), `trip.analysis.max_drills` (2), `trip.analysis.max_drill_minutes` (45) |
| Spec 5.8 | `weather.base_url` (`https://api.open-meteo.com/v1`), `weather.air_base_url` (`https://air-quality-api.open-meteo.com/v1`), `weather.api_key` (trống), `weather.refresh_min_interval_min` (15), `weather.lookahead_days` (7), `weather.default_window` (`"06:00-13:00"`) |
| Spec 5.9 | `ai.provider` (`claude`), `ai.model_extract` (`claude-haiku-5-5`), `ai.model_strategy` (`claude-sonnet-5-5`), `ai.fallback_provider` (`workers_ai`), `ai.fallback_model_extract`, `ai.fallback_model_strategy` (điền ở bước 7d), `ai.monthly_cap_usd` (20), `ai.max_plans_per_day` (5), `ai.timeout_sec` (60), `ai.image_max_px` (1568) |

Khoá API Claude và Cloudflare để trong **Supabase secrets** (`ANTHROPIC_API_KEY`, `CF_ACCOUNT_ID`, `CF_AI_TOKEN`), không nằm trong `app_settings`.

---

## 7. Quyền (RLS)

Ba hàm SECURITY DEFINER dùng chung cho mọi bảng `trip_*` (bảng con lấy `trip_id` qua `day_id` / `scorecard_id`):

```
trip_role(trip_id) → 'guardian' | 'golfer' | 'coach' | 'caddie' | 'other' | 'admin' | null
  1. can_manage_student(trips.student_id)                         → 'guardian'
  2. my_student_id() = trips.student_id                           → 'golfer'
  3. trip_members: user_id = auth.uid(), status = 'active',
     ngày VN hiện tại trong [valid_from, valid_to] (trống = không giới hạn),
     caddie thì approved_by_guardian_id khác trống               → role của dòng
  4. is_admin()                                                   → 'admin'
trip_can_edit(trip_id, area)     -- theo ma trận spec mục 3; admin luôn false
trip_can_see_finance(trip_id)    -- guardian; coach/caddie khi trips.share_finance_with_*; admin (chỉ đọc);
                                 -- golfer: false (golfer người lớn đã là guardian ở bước 1)
```

| Nhóm bảng | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| Bảng cấu hình (mục 4) | mọi người đã đăng nhập | admin |
| `trips` | `trip_role` khác null | tạo: xem **Q1**; sửa: guardian hoặc người tạo; đổi `share_finance_*`: guardian |
| `trip_members` | `trip_role` khác null (không có cột liên hệ) | guardian; người tạo chuyến; duyệt caddie/HLV `pending_guardian`: chỉ guardian |
| Hậu cần, hành lý, ngày đấu, checklist, kết quả, kho đồ, nâng cao | `trip_role` khác null | `trip_can_edit` theo ma trận spec mục 3 (golfer chỉ tick hành lý, checklist, phần tự chấm) |
| `trip_expenses`, `trip_budgets` | `trip_can_see_finance`; HLV/caddie luôn thấy khoản **mình ghi** | ghi: guardian, coach, caddie; sửa/xoá: guardian hoặc người ghi; admin **không** ghi |
| `student_clubs*` | guardian của VĐV, chính VĐV, thành viên `active` của một chuyến đang chạy của VĐV, admin | như SELECT trừ admin — xem **Q5** |
| `trips.result_status` → `verified` / `rejected` | | chỉ admin, qua hàm `trip_check_result` |

Thao tác nhiều bước (tạo chuyến sinh dữ liệu mẫu, thêm thành viên tìm / tạo hồ sơ, gửi đối chiếu, tick đã mua → khoản chi) làm bằng hàm SECURITY DEFINER như các module trước, để ghi nhật ký và kiểm tra trong một giao dịch.

---

## 8. Kho file, Edge Functions, lịch chạy

- **Kho riêng tư mới `trip-files`**: `{trip_id}/yardage/…`, `{trip_id}/scorecard/…`, `{trip_id}/pins/…`; ảnh nén ≤ 2000 px ở máy người dùng. Quyền đọc/ghi qua `storage_first_uuid(name)` + `trip_role` (admin chỉ đọc).
- **Edge Function `trip-weather`** (7b): gọi Open-Meteo ở máy chủ; lịch `pg_cron` (đã dùng cho `expire-orders`) lúc 06:00, 12:00, 18:00 giờ VN.
- **Edge Function `trip-ai`** (7c): một hàm chung (loại việc, dữ liệu, ảnh) → Claude → Workers AI → không có AI; ghi `ai_usage_logs`; kiểm tra đồng ý `ai_processing`.
- Đối chiếu tham số Open-Meteo với tài liệu hiện hành và chọn model Workers AI: làm ở bước 7b / 7d, ghi kết quả vào mục 10 của file này.

---

## 9. Lệch giữa spec và schema đang có

1. **README quy tắc 10 nhắc bảng `notification_types`, staging chưa có.** Thông báo hiện ghi thẳng vào `notifications` (module 10 làm vậy với `event_card_locked`). Spec 12 cần thông báo ở 5.8 (thời tiết tăng mức), 5.9 (80% trần AI), CT7 → **Q6**.
2. CSV `tham_so_lich.csv` không có tiền tố module; đề xuất thêm `trip.` (mục 6), riêng `hcp.default_when_unknown` spec 5.4 gọi đúng tên này → thành `trip.hcp.default_when_unknown`.
3. Spec 4.2 thiếu `trips.timezone`, `trip_days.play_style`, `trip_day_hole_modes`, `trip_expense_natures` (đều nhắc ở chỗ khác trong spec) → đã thêm vào mapping.
4. `trip_expenses.amount_vnd` spec ghi `int` → đề xuất `bigint`.
5. `trip_pack_items.group`, `trip_preround_notes.group` → `group_name` (từ khoá SQL). `trip_food_templates.value` → `anchor_value`.
6. Spec mục 3 có dòng "Bật/tắt chia sẻ tài chính, duyệt caddie" nằm sau đoạn văn "Admin: …" nên bảng markdown bị tách; nội dung hiểu là một dòng của ma trận (chỉ phụ huynh).
7. `trips.tournament_id` để không khoá ngoại vì `tournaments` (đợt 3) chưa có; `external_results` (đợt 4) chưa có.

---

## 10. Cần anh xác nhận trước bước 1 (chưa tự quyết)

1. **Q1 — Ai được tạo chuyến cho một golfer?** Spec ghi "mọi vai trò". Nếu ai có tài khoản cũng tạo được cho bất kỳ học viên nào thì người lạ có thể tạo chuyến để xem thông tin trẻ. *Đề xuất:* phụ huynh `can_manage`; golfer người lớn (`self`); admin; HLV trưởng; HLV đang dạy học viên đó (`class_staff` của một lớp mà học viên có `enrollments.status = 'active'`, kiểm tra bằng `is_class_staff`). Không dùng `can_staff_view_student` vì hàm này còn cho cả quản lý trường. Caddie không tạo chuyến.
2. **Q2 — HLV / caddie chưa có tài khoản đăng nhập** (`trip_members.user_id` trống) thì vào app bằng cách nào? *Đề xuất:* dùng lại kích hoạt qua email của module 10 (nhập SĐT/email đã đăng ký → mã qua email → đặt mật khẩu); trước khi kích hoạt thì không có quyền gì.
3. **Q3 — Người giám hộ có `can_manage = false`** (phụ huynh thứ hai chỉ xem): *đề xuất* xem mọi nhóm như HLV, không sửa, **không** thấy tài chính trừ khi phụ huynh chính bật thêm cờ `share_finance_with_viewers` (cột mới). Hay coi như không liên quan?
4. **Q4 — Nhóm `other`** (spec có giá trị nhưng ma trận không có cột): *đề xuất* quyền như caddie nhưng không nhập kết quả.
5. **Q5 — Bộ gậy và nhật ký đo (`student_clubs*`)** thuộc VĐV, dùng chung mọi chuyến: HLV/caddie của **một** chuyến có được sửa bộ gậy (ảnh hưởng chuyến khác) không? *Đề xuất:* sửa được khi đang là thành viên `active` của một chuyến chưa kết thúc của VĐV; mọi sửa ghi nhật ký.
6. **Q6 — `notification_types`:** tạo bảng danh mục thông báo + lớp gửi chung (README quy tắc 10) ngay trong module này (bước 7b), hay tạm ghi thẳng `notifications` như module 10 và làm lớp chung riêng sau?
7. **Q7 — `ai.max_images = 0`** trong `chien_luoc_tham_so.csv`: 0 nghĩa là "không gửi ảnh" hay "theo giới hạn của nhà cung cấp"? Spec 5.9 và nghiệm thu 14 cần gửi ảnh yardage.
8. **Q8 — Admin xem chuyến:** chỉ `admin`, hay cả HLV trưởng (`head_coach`, đang được coi là "nhân viên trung tâm" ở các module khác)? Spec ghi chỉ admin; *đề xuất* giữ đúng spec.
9. **Q9 — Bước 1 có làm màn admin cho cả 12 bảng cấu hình** (dùng `CrudTable`) hay chỉ các bảng dùng ở bước 2–6, bảng thời tiết / mốc chỉ số làm cùng bước 7b / 5?
