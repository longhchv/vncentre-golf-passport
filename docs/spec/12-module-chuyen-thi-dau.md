# 12 · Module Chuyến thi đấu (đưa golfer trẻ đi giải)

Phiên bản: v0.9 (sửa lần 3) · Ngày: 14/10/2026 · Người soạn: Minh (R&D đào tạo golf) · Chủ sản phẩm duyệt: Vũ Anh Long

**Sửa lần 1 (14/10/2026):** thêm loại giải **trong nước / quốc tế** (trong nước không cần visa, chỉ cần CCCD hoặc hộ chiếu; tiền tệ cố định VND); **admin VN Centre xem được tài chính chuyến**; thêm **xác thực kết quả giải bằng link Livescore, đối chiếu với kết quả VGA** trước khi đưa vào hồ sơ học bổng; module là **ngoại lệ trong đợt 1** (CT1, CT3, CT5 đã chốt).

**Sửa lần 2 (14/10/2026):** thêm **thời tiết và sức khoẻ** cho từng ngày tập/vòng đấu: tự lấy dự báo từ Open-Meteo theo toạ độ sân và khung giờ thi đấu, vẫn cho nhập tay; bộ quy tắc cảnh báo (nắng nóng, UV, mưa, dông sét, gió, lạnh, chất lượng không khí) là cấu hình; đề xuất tự thêm việc vào checklist trước vòng (mục 5.8).

**Sửa lần 3 (14/10/2026):** thêm **chế độ nâng cao** (mục 5.9): scorecard của giải, bộ gậy và nhật ký đo khoảng cách của VĐV, ảnh yardage book, pin location từng vòng, điểm từng hố, kế hoạch chiến lược từng hố tự động theo par cá nhân, và phân tích chiến lược bằng AI có xem ảnh yardage. Đọc scorecard và pin sheet từ ảnh bằng AI.

Bản thử chạy được (một file HTML, dữ liệu không dùng chung với app): `prototypes/chuyen-thi-dau.html`. Bản thử là **tham chiếu giao diện và công thức**, không phải code để chép. Giao diện thật dựng bằng React + Tailwind theo các thành phần đang có trong `src/components/ui`.

Đọc kèm: `01-du-lieu.md` (quy ước, phân quyền), `11-module-nhan-su-su-kien.md` (nguyên tắc một người một mã Golf Passport), `04-dot-3-diem-qua-bxh.md` (giải đấu), `05-dot-4-goi-thanh-toan-ho-so.md` (hồ sơ học bổng, `external_results`).

---

## 0. Vị trí trong lộ trình

Module là **ngoại lệ có chủ đích trong đợt 1**, giống module 10 và 11, chủ sản phẩm chốt ngày 14/10/2026. Giải ngày 15/10/2026 chạy bằng bản thử (`prototypes/chuyen-thi-dau.html`, link artifact dùng chung cho cả đoàn); app thật build theo mục 7.

Thuật ngữ: **ngày tập** = practice round, vòng đánh thử trên sân thi đấu trong những ngày trước vòng 1, không tính điểm. App hiển thị "Ngày tập 1", "Ngày tập 2"… rồi "Vòng 1"…"Vòng 4".

## 0b. Mục tiêu trong một câu

Gia đình, HLV và caddie được uỷ quyền cùng quản lý **một chuyến đi giải của một golfer** trên Golf Passport: từ vé, visa, khách sạn, xe, hành lý; lịch từng ngày tập và từng vòng; ăn uống, lưu ý trước vòng; nhập kết quả và phân tích sau vòng theo cấp độ của con; đến **toàn bộ chi phí** để sau nhiều chuyến biết khoản nào cắt được, khoản nào nên chi thêm.

## 1. Nguyên tắc bắt buộc

1. **Golfer là học viên Golf Passport.** Mỗi chuyến gắn với đúng một `students.id`. Kết quả thi đấu đi vào hồ sơ của con.
2. **Thành viên chuyến dùng chính hồ sơ Golf Passport của mình** (nguyên tắc module 11). Không tạo loại tài khoản "caddie" hay "trưởng đoàn" riêng; vai trò gắn theo từng chuyến, có thời hạn.
3. **Tài chính là dữ liệu riêng của gia đình.** Mặc định chỉ phụ huynh có quyền quản lý con **và admin VN Centre (chỉ xem)** thấy tổng chi, dự toán, phân tích. Tài chính **không bao giờ** đi vào hồ sơ xuất ra ngoài (học bổng, trang công khai).
4. **Không viết cứng con số nghiệp vụ** (quy tắc README số 2). Danh sách hành lý mẫu, công thức số lượng, checklist, thời gian biểu, kế hoạch ăn uống, lưu ý trước vòng, hạng mục chi phí, bảng quy đổi level → handicap, mốc chỉ số theo handicap: **tất cả là bảng cấu hình admin chỉnh được**, seed từ `data/chuyen-thi-dau/*.csv`.
5. **Migration chỉ thêm.** Không đổi tên, không xoá bảng đang có. Làm trên staging trước.
6. **Song ngữ.** Mọi bảng mẫu có `*_vi` và `*_en`. CSV hiện chỉ có tiếng Việt; cột `_en` để trống, Minh bổ sung sau (việc mở CT6).
7. **Tiền:** lưu số gốc theo ngoại tệ, tỷ giá tại thời điểm ghi, và số quy đổi VND (số nguyên). Báo cáo luôn cộng theo VND.
8. **Bảo vệ trẻ em:** golfer dưới 18 tuổi không thấy tài chính; thành viên khác trong chuyến không thấy SĐT, email của nhau trừ phụ huynh; caddie do người không phải phụ huynh thêm vào phải được **phụ huynh duyệt** mới có quyền.
9. **Mọi thay đổi quan trọng ghi nhật ký** (trigger `audit_row` đang có): thêm/bớt thành viên, đổi quyền xem tài chính, sửa/xoá khoản chi, sửa kết quả vòng đã gửi xác nhận.
10. **Ngày tháng:** nhập và hiển thị theo `dd/mm/yyyy`. Mọi phép cộng/trừ ngày (ngày tập, ngày vòng, hạn hậu cần) tính trên **ngày lịch theo giờ Việt Nam**, không chuyển qua UTC (bản thử từng bị lệch lùi 1 ngày vì lỗi này, đã sửa 14/10/2026). Có kiểm thử tự động chạy với múi giờ `Asia/Ho_Chi_Minh`.

## 2. Phạm vi bản 1

**Có:** tạo chuyến (mọi vai trò), thành viên và phân quyền, hậu cần, hành lý tự tính số lượng, ngày tập và vòng đấu (tee time / shotgun, nhóm đấu, thời gian biểu tính ngược, ăn uống theo giờ và theo hố, lưu ý trước vòng, checklist), kết quả và phân tích sau vòng theo cấp độ, kho đồ tiêu hao, danh sách mua thêm nối sang chi phí, tài chính (dự toán, thực chi, phân tích, so sánh các chuyến), xuất Excel chi phí.

**Có thêm (sửa lần 1):** loại giải trong nước / quốc tế; xác thực kết quả giải qua link Livescore (đối chiếu thủ công ở bản 1).

**Không có (để sau):** ảnh hoá đơn (cần kho file riêng tư), tỷ giá tự động, thông báo đẩy nhắc hạn, nhập điểm từng hố, **đối chiếu tự động với dữ liệu VGA** (CT9), chuyển kết quả đã xác thực sang `external_results` khi đợt 4 có bảng này, liên kết giải ở `tournaments` (đợt 3).

## 3. Người dùng và quyền

| Vai trò trong chuyến | Là ai trong Golf Passport | Có quyền khi nào |
|---|---|---|
| Phụ huynh | `student_guardians` của golfer, `can_manage = true`, `status = active` | Luôn luôn, với mọi chuyến của con, kể cả chuyến do người khác tạo |
| HLV / trưởng đoàn | Người có hồ sơ Golf Passport, được thêm vào chuyến với vai `coach` | Khi `trip_members.status = active` và trong khoảng `valid_from`–`valid_to` |
| Caddie được uỷ quyền | Người có hồ sơ Golf Passport, vai `caddie` | Như trên, **và** đã được phụ huynh duyệt (`approved_by_guardian_id` khác trống) |
| Golfer | Chính học viên, đăng nhập bằng tài khoản học viên (`student_accounts`) | Luôn luôn với chuyến của mình |
| Người tạo chuyến | Bất kỳ ai ở trên | Sửa thông tin chuyến và danh sách thành viên của chuyến mình tạo |
| Admin | `is_admin()` | Xem toàn bộ chuyến, **kể cả tài chính (chỉ xem, không ghi/sửa khoản chi)**; đối chiếu và xác nhận kết quả giải (mục 5.7) |

Ma trận chi tiết:

| Dữ liệu | Phụ huynh | HLV / trưởng đoàn | Caddie | Golfer |
|---|---|---|---|---|
| Thông tin chuyến, thành viên | Toàn quyền | Xem; sửa nếu là người tạo | Xem | Xem |
| Hậu cần | Toàn quyền | Xem, sửa | Xem | Xem |
| Hành lý | Toàn quyền | Xem, sửa danh sách, tick | Xem, tick | Xem, tick |
| Ngày đấu: xuất phát, nhóm, kế hoạch, checklist | Toàn quyền | Xem, sửa | Xem, sửa | Xem, tick checklist |
| Kết quả vòng | Toàn quyền | Xem, nhập | Xem, nhập | Xem; nhập phần tự chấm (năng lượng, tinh thần, 3 điều tốt, 1 điều làm khác) |
| Kho đồ, mua thêm | Toàn quyền | Xem, sửa | Xem, sửa | Xem |
| Ghi khoản chi | Toàn quyền | Ghi; xem và sửa khoản **mình ghi** | Như HLV | Không |
| Tổng chi, dự toán, phân tích, so sánh chuyến | Toàn quyền | Chỉ khi phụ huynh bật `share_finance_with_coach` | Chỉ khi bật `share_finance_with_caddie` | Không |
| Link Livescore, gửi đối chiếu kết quả | Có | Có | Có | Có |

Admin: xem mọi nhóm dữ liệu ở trên (kể cả tài chính), không sửa dữ liệu nghiệp vụ của gia đình; là người duy nhất đặt trạng thái **Khớp / Chưa khớp** cho kết quả giải.
| Bật/tắt chia sẻ tài chính, duyệt caddie | Có | Không | Không | Không |

## 4. Dữ liệu (bổ sung vào `01-du-lieu.md`)

Tên bảng là đề xuất; Claude Code đặt lại theo quy ước repo ở bước 0. Mọi bảng có `id`, `org_id`, `created_at`, `updated_at`; bảng nghiệp vụ có `deleted_at`.

### 4.1 Bảng cấu hình (admin chỉnh, seed từ CSV)

| Bảng | Trường chính | Seed |
|---|---|---|
| `trip_logistics_templates` | type_code, title_vi/en, anchor (`start`, `end`, `each_play_day`), offset_days, detail_vi/en, scope (`all`, `domestic`, `international`) | `hau_can_mau.csv` |
| `trip_pack_templates` | group_vi/en, sort_order, name_vi/en, scope (`all`, `domestic`, `international`), qty_rule (`fixed`, `days`, `play_days`, `rounds`, `half_days`), qty_a, qty_b, qty_fixed, is_active | `hanh_ly_mau.csv` (52 dòng, 6 nhóm) |
| `trip_check_templates` | day_kind (`round`, `practice`), sort_order, name_vi/en | `checklist_truoc_vong_mau.csv` |
| `trip_consumable_templates` | name_vi/en, unit_vi/en, qty_rule, qty_a, qty_b, qty_fixed, warn_threshold | `kho_tieu_hao_mau.csv` |
| `trip_schedule_templates` | start_type (`tee`, `shotgun`, `practice`), anchor (`wake`, `leave`, `arrive`, `assembly`, `start`), offset_min, title_vi/en, desc_vi/en, is_highlight, sort_order | `lich_truoc_vong_mau.csv` |
| `trip_food_templates` | anchor (`bed`, `wake`, `start`, `every_hole`, `hole_n`, `finish`, `avoid`), value, title_vi/en, desc_vi/en | `an_uong_mau.csv` |
| `trip_preround_notes` | group_vi/en, sort_order, text_vi/en | `luu_y_truoc_vong.csv` |
| `trip_expense_categories` | code, name_vi/en, sort_order | `hang_muc_chi_phi.csv` |
| `trip_logistics_types` | code, name_vi/en | `hau_can_loai.csv` |
| `stat_benchmarks` | hcp, fairway_pct, gir_holes, putts, three_putts, penalties, up_down_pct, doubles_plus | `moc_chi_so_theo_hdc.csv` |
| Cột mới `levels.hcp_equivalent` (numeric, trống được) | handicap tương đương của level | `quy_doi_level_hdc.csv` (Level 10–20, **tạm dùng**) |
| `weather_rules` | metric (`feels`, `uv`, `rain`, `wind`, `tmin`, `aqi`, `storm`), from_value, below_value, level (1–4), name_vi/en, tips_vi/en (danh sách), checklist_add_vi/en (danh sách) | `thoi_tiet_quy_tac.csv` |
| Khoá cấu hình chiến lược trong bảng settings | ngưỡng chọn gậy, mép green, nhắm cờ, đánh ngắn, số lần đo gần nhất, quy đổi đơn vị, giới hạn AI | `chien_luoc_tham_so.csv` |
| Khoá cấu hình trong bảng settings đang có | các tham số lịch, mặc định | `tham_so_lich.csv` |

### 4.2 Bảng nghiệp vụ

| Bảng | Trường chính | Ghi chú |
|---|---|---|
| `trips` | student_id (golfer), title, course_lat, course_lng (toạ độ sân, lấy qua Open-Meteo Geocoding hoặc chọn trên bản đồ), scope (`domestic`, `international`), place, course_name, start_date, end_date, currency (ISO 4217; trong nước cố định `VND`, tỷ giá 1), fx_rate_vnd, par, travel_min, arrive_before_min, level_id (chép từ `students.current_level_id` khi tạo, sửa được), hcp_override (trống được), share_finance_with_coach, share_finance_with_caddie, status (`planning`, `ongoing`, `done`, `cancelled`), created_by, tournament_id (trống, để sẵn cho đợt 3), livescore_url, result_status (`none`, `submitted`, `verified`, `rejected`), result_submitted_by/at, result_checked_by/at, result_note | Khi tạo chuyến: sinh hậu cần, hành lý, ngày đấu, checklist, kho theo mẫu (mục 5.1) |
| `trip_members` | trip_id, person_student_id (hồ sơ người theo mã Passport), user_id, role (`guardian`, `coach`, `caddie`, `golfer`, `other`), display_name, status (`pending_guardian`, `active`, `removed`), approved_by_guardian_id, valid_from, valid_to | Caddie/HLV do người không phải phụ huynh thêm → `pending_guardian` |
| `trip_logistics` | trip_id, template_id, scope, type_code, title, due_date, due_time, detail, booking_ref, status (`todo`, `doing`, `done`), sort_order | |
| `trip_pack_items` | trip_id, template_id (trống nếu tự thêm), scope, group, name, qty_rule…, qty_override, is_packed, packed_by, packed_at | Số lượng hiển thị = qty_override nếu có, không thì tính theo công thức |
| `trip_days` | trip_id, kind (`practice`, `round`), round_no, label, play_date, start_type (`tee`, `shotgun`), start_time, start_hole (1–18; kiểu `tee` chỉ 1 hoặc 10), assembly_min, pairing_text, plan_note, day_note | Một dòng mỗi ngày tập và mỗi vòng |
| `trip_day_results` | day_id (duy nhất), score_total, score_front, score_back, rank_text, fairways_hit, fairways_possible, gir, putts, three_putts, penalties, up_down_made, up_down_chances, birdies, doubles_plus, energy_self (1–5), mental_self (1–5), went_well, do_differently, entered_by, status (`draft`, `submitted`) | Chỉ cho `kind = round`. `submitted` để sẵn cho bước gửi Trung tâm xác nhận (đợt 4) |
| `trip_day_weather` | day_id (duy nhất), source (`open_meteo`, `manual`), fetched_at, window_start, window_end, feels_max, temp_max, temp_min_morning, uv_max, rain_prob_max, wind_gust_max, storm (bool), aqi_max, pm25_max, raw (JSON, bản rút gọn theo giờ), manual_override (JSON: các trường người dùng tự sửa), entered_by, last_level (mức cao nhất lần trước, để báo khi tăng) | Nhập tay ghi đè số tự động, không mất khi cập nhật lại |
| `trips.advanced` (cột mới, bool) | Bật chế độ nâng cao cho chuyến | |
| `trip_scorecards` | trip_id (duy nhất), selected_tee_id, wanted_tee_text (tee người dùng ghi trước khi đọc ảnh), unit (`yd` mặc định, `m`), source (`manual`, `ai_photo`), source_asset_path | Snapshot theo chuyến; thư viện sân dùng chung để sau (CT11) |
| `trip_scorecard_holes` | scorecard_id, hole_no (1–18), par, stroke_index | Par và index chung. Nhập đủ par thì cập nhật `trips.par` |
| `trip_scorecard_tees` | scorecard_id, name (đúng như in), color_key (`red`, `white`, `blue`, `black`, `gold`, `green`…), sort_order | Mọi hàng tee đọc được trên scorecard |
| `trip_scorecard_tee_holes` | tee_id, hole_no, distance, par_override, si_override | Khoảng cách theo từng tee; par/index riêng của tee nếu scorecard có (ví dụ Ladies HCP của tee đỏ) |
| `student_clubs` | student_id, name, carry, unit, sort_order, is_active | **Bộ gậy thuộc VĐV, dùng lại mọi chuyến** (bản thử lưu theo chuyến) |
| `student_club_logs` | student_id, logged_on, kind (`home`, `practice_day`, `pre_round_range`), trip_day_id (trống được), entered_by | Một lần đo |
| `student_club_log_items` | log_id, club_id, carry | |
| `trip_yardage_images` | trip_id, storage_path (kho riêng tư), hole_no (trống = cả sổ), uploaded_by | Ảnh nén ≤ 2000 px trước khi tải |
| `trip_day_pins` | day_id, hole_no, from_front, side (`L`, `C`, `R`), green_depth, source (`manual`, `ai_photo`) | Duy nhất (day_id, hole_no) |
| `trip_day_hole_scores` | day_id, hole_no, strokes | Đủ 18 hố thì tự điền tổng, 9 đầu, 9 sau ở `trip_day_results` |
| `trip_day_ai_plans` | day_id, text, image_count, provider (`claude`, `workers_ai`), model, input_tokens, output_tokens, est_cost_usd, created_by, created_at, input_hash | Giữ lịch sử; màn hình hiện bản mới nhất |
| `trip_day_checks` | day_id, template_id, text, is_done, done_by, done_at | |
| `trip_consumables` | trip_id, name, unit, carried_qty, warn_threshold | |
| `trip_consumable_usage` | day_id, consumable_id, used_qty | Duy nhất (day_id, consumable_id) |
| `trip_purchases` | day_id, consumable_id (trống được), name, qty, est_amount, currency, is_bought, expense_id | Tick "đã mua" có giá → tự tạo `trip_expenses` (hạng mục Đồ tiêu hao); bỏ tick → xoá mềm khoản đó |
| `trip_expenses` | trip_id, spent_on, category_id, description, amount_original (numeric 14,2), currency, fx_rate_vnd, amount_vnd (int), nature (`fixed`, `variable`, `cuttable`), payer_text, created_by, source (`manual`, `purchase`) | |
| `trip_budgets` | trip_id, category_id, amount_vnd | Duy nhất (trip_id, category_id) |

## 5. Công thức

### 5.1 Số lượng hành lý và đồ mang theo

`days` = số ngày từ ngày đi đến ngày về, tính cả hai đầu. `rounds` = số vòng đấu. `play_days` = vòng đấu + ngày tập.

| qty_rule | Số lượng |
|---|---|
| `fixed` | qty_fixed |
| `days` | days × a + b |
| `play_days` | play_days × a + b |
| `rounds` | rounds × a + b |
| `half_days` | làm tròn lên (days / 2) + b |

Ví dụ: chuyến 7 ngày, 3 vòng, 2 ngày tập → áo polo thi đấu (`play_days`, a=1, b=1) = 6; bóng (`play_days`, a=6, b=6) = 36.

### 5.2 Thời gian biểu trước vòng

Mốc gốc `start` = tee time hoặc giờ còi shotgun.

- Kiểu `tee`: `arrive = start − arrive_before_min` (mặc định 75).
- Kiểu `shotgun`: `assembly = start − assembly_min` (mặc định 30); `arrive = min(start − arrive_before_min, assembly − 55)`.
- Ngày tập: `arrive = start − 45`.
- `leave = arrive − travel_min`; `wake = min(start − 165, leave − 60)` (ngày tập: 150 và 50); `bed = wake − 9 giờ`.
- Mỗi dòng của `trip_schedule_templates` = mốc + `offset_min`. Ví dụ đã kiểm: tee 08:00, xe 20 phút → ngủ 20:15, dậy 05:15, có mặt sân 06:45, có mặt tee box 07:45.

### 5.3 Ăn uống theo hố

Hố thứ k của vòng = `((start_hole − 1) + k − 1) mod 18 + 1`. Giờ ước tính = `start + k × minutes_per_hole` (mặc định 15). Shotgun xuất phát hố 5 → ăn nhẹ sau hố 8, 12, 16, 1.

### 5.4 Phân tích sau vòng theo cấp độ

1. Handicap dùng để so: `hcp_override` nếu có; không thì `levels.hcp_equivalent` của level trên chuyến; không có nữa thì 18 (`hcp.default_when_unknown`).
2. Mốc = nội suy tuyến tính trong `stat_benchmarks` theo handicap.
3. Cảnh báo khi: putt > mốc + 2 hoặc 3-putt > mốc + 2 · fairway % < mốc − 10 · GIR < mốc − 2 · up & down % < mốc − 15 (khi có ≥ 3 cơ hội) · gậy phạt > mốc + 1,5 · hố double+ > mốc + 2 · 9 hố sau kém 9 hố đầu ≥ 3 gậy · tự chấm năng lượng hoặc tinh thần ≤ 2. **Các ngưỡng lệch này cũng là cấu hình.**
4. Điểm mạnh khi tốt hơn mốc cùng biên độ.
5. Hiển thị thêm: so với par; so với mức kỳ vọng (par + handicap); so với vòng trước; tối đa 2 gợi ý bài tập sau vòng (tổng ≤ 45 phút).

### 5.5 Tài chính

- `amount_vnd = round(amount_original × fx_rate_vnd)`; VND thì tỷ giá = 1.
- Chi phí/vòng = tổng ÷ số vòng; chi phí/ngày = tổng ÷ days.
- Vượt dự toán theo từng hạng mục; cơ cấu theo tính chất (cố định / biến đổi / có thể cắt); theo người trả.
- So sánh các chuyến: chỉ các chuyến của **cùng golfer** mà người xem có quyền tài chính.

### 5.0 Trong nước / quốc tế

- Khi tạo chuyến sinh **toàn bộ** dòng mẫu, mỗi dòng mang `scope`. Màn hình và thống kê chỉ tính dòng có `scope = all` hoặc trùng loại giải của chuyến. Đổi loại giải sau khi tạo không mất dữ liệu đã tick.
- Trong nước: ẩn tiền tệ và tỷ giá; nhóm hậu cần "Visa & giấy tờ" hiển thị là "Giấy tờ"; giấy tờ là CCCD hoặc hộ chiếu, con dưới 14 tuổi chưa có CCCD/hộ chiếu mang bản sao giấy khai sinh.

### 5.6 Kho đồ

`còn lại = mang theo + đã mua (tick) − tổng đã dùng các ngày`. Chạm ngưỡng → gợi ý thêm vào "Cần mua thêm". Gợi ý cho chuyến sau = làm tròn lên (trung bình dùng mỗi ngày ra sân × số ngày ra sân + ngưỡng).

### 5.7 Xác thực kết quả giải (đưa vào hồ sơ học bổng)

1. VĐV, phụ huynh, HLV hoặc caddie dán **link Livescore / trang kết quả chính thức** của giải vào chuyến, nhập điểm các vòng, bấm **Gửi đối chiếu** → `result_status = submitted`. Điều kiện: có link và có ít nhất một vòng có điểm.
2. Admin mở link, đối chiếu điểm từng vòng và thứ hạng với kết quả chính thức trên hệ thống của VGA (giải trong nước dùng vHandicap/kết quả VGA; giải quốc tế dùng trang kết quả của BTC giải), ghi chú và chọn **Khớp** (`verified`) hoặc **Chưa khớp** (`rejected`, gia đình sửa rồi gửi lại).
3. Chỉ kết quả `verified` mới được đưa vào hồ sơ học bổng; khi đợt 4 có `external_results`, mỗi vòng/giải `verified` tạo một dòng ở đó với nguồn = link Livescore và người xác nhận = admin.
4. Bản sau: đối chiếu **tự động** khi VGA cung cấp nguồn dữ liệu (API hoặc file kết quả) — việc mở CT9.
5. Sửa điểm một vòng sau khi đã `verified` → trạng thái tự về `submitted`, ghi nhật ký.

### 5.8 Thời tiết và sức khoẻ

**Nguồn dữ liệu:** Open-Meteo, gói miễn phí không cần khoá API (chốt 14/10/2026, xem CT10).
- Dự báo: `https://api.open-meteo.com/v1/forecast` với `latitude`, `longitude`, `timezone=Asia/Ho_Chi_Minh` (giải quốc tế dùng múi giờ nơi thi đấu), `hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,uv_index`, `forecast_days` đủ phủ ngày thi đấu (tối đa 16 ngày).
- Chất lượng không khí: `https://air-quality-api.open-meteo.com/v1/air-quality` với `hourly=us_aqi,pm2_5`.
- Dông sét: `weather_code` thuộc nhóm 95, 96, 99.
- Claude Code **đối chiếu tên tham số với tài liệu Open-Meteo hiện hành** trước khi code; nếu khác thì theo tài liệu và ghi lại ở `12-mapping.md`.
- **Ghi công bắt buộc** (giấy phép CC BY 4.0): dòng "Dữ liệu thời tiết: Open-Meteo.com" có link, đặt ngay dưới khối thời tiết.
- Địa chỉ máy chủ và khoá API là **cấu hình** (`weather.base_url`, `weather.air_base_url`, `weather.api_key` để trống). Khi chuyển sang gói trả phí chỉ đổi cấu hình sang `customer-api.open-meteo.com` và điền khoá, không sửa code.

**Cách lấy:**
1. Hàm máy chủ (Supabase Edge Function) `trip-weather`, **không gọi từ trình duyệt** để kiểm soát số lượt gọi.
2. Khung giờ tính: từ giờ có mặt ở sân (mục 5.2) đến `start + 18 × minutes_per_hole + 30 phút`. `temp_min_morning` lấy trong khung từ giờ thức dậy đến giờ xuất phát.
3. Tóm tắt trong khung: lấy giá trị **cao nhất** của cảm giác nhiệt, nhiệt độ, UV, khả năng mưa, gió giật, AQI, PM2.5; lấy giá trị thấp nhất cho nhiệt độ buổi sáng; `storm = true` nếu có giờ nào mang mã dông.
4. Lịch chạy: mỗi ngày lúc 06:00, 12:00 và 18:00 (giờ Việt Nam) cho mọi ngày tập/vòng đấu trong 7 ngày tới, cộng nút **Cập nhật** trên màn hình, mỗi ngày đấu tối đa 1 lần trong 15 phút. Ước tính dưới 100 lượt gọi mỗi ngày với 10 chuyến đang chạy, rất xa giới hạn 10.000 lượt/ngày của gói miễn phí.
5. Ngày chưa có tee time thì dùng khung 06:00–13:00. Sân chưa có toạ độ thì không gọi, hiện ô nhập tay như bản thử.
6. Lỗi mạng hoặc vượt giới hạn: giữ số lần trước, hiện "cập nhật lúc …", không xoá dữ liệu.

**Đánh giá và đề xuất:** so từng chỉ số với `weather_rules` (lo ≤ giá trị < hi). Mức chung = mức cao nhất. Hiện tên cảnh báo, các lời khuyên, và nút **Thêm vào checklist trước khi ra sân** (chỉ thêm việc chưa có). Thiếu cảm giác nhiệt thì dùng nhiệt độ thường và ghi rõ.

**Nhập tay:** mọi trường đều sửa tay được (ví dụ khi người ở sân thấy trời đã khác dự báo). Số nhập tay được ưu tiên và giữ nguyên qua các lần cập nhật tự động; có nút "Dùng lại số tự động".

**Thông báo (gắn CT7):** khi mức chung của một ngày đấu **tăng** so với lần trước, hoặc lần đầu xuất hiện dông sét, báo cho phụ huynh, HLV, caddie của chuyến. Không báo khi mức giảm.

**Giới hạn trách nhiệm:** dòng cố định dưới khối thời tiết ghi rõ đây là gợi ý chuẩn bị, không thay thế quyết định của BTC và nhân viên y tế giải.

### 5.9 Chế độ nâng cao: dữ liệu sân, gậy và chiến lược

**Đơn vị (chốt 14/10/2026 sau thử nghiệm):** mặc định **yard** cho scorecard, khoảng cách gậy, pin location. Người dùng đổi sang mét được; khi đổi, app **quy đổi toàn bộ số đã có** (khoảng cách mọi tee, pin, khoảng cách gậy và nhật ký đo), làm tròn số nguyên. Ảnh scorecard ghi mét thì quy đổi sang đơn vị đang dùng khi đọc.

**Tee (chốt 14/10/2026 sau thử nghiệm):**
1. Người dùng ghi tee của con **trước** khi đọc ảnh (ô chữ tự do: "Đỏ", "Tee đỏ", "Red"…).
2. Đọc ảnh lấy **tất cả các hàng tee** trên scorecard, kèm par/index chung và par/index riêng của từng tee nếu có. Ảnh một mặt (9 hố) thì đọc tiếp mặt còn lại, dữ liệu gộp theo tên tee.
3. Khớp tee bằng `color_key`: bỏ dấu, đổi tên màu tiếng Việt ↔ tiếng Anh (đỏ/red, trắng/white, xanh dương/blue, xanh lá/green, vàng/gold/yellow, đen/black, bạc/silver, cam/orange, hồng/pink); không phải màu thì so tên đã bỏ dấu, bỏ chữ "tee".
4. Khớp được thì **tự chọn tee đó** và điền khoảng cách, par, index của đúng tee; không khớp hoặc có nhiều tee mà chưa ghi thì **không tự chọn**, hiện cảnh báo "chưa chọn tee". Không bao giờ tự lấy tee giữa hay tee junior thay người dùng.
5. Màn hình hiện các tee dạng nút có chấm màu; bấm tee khác là đổi toàn bộ số liệu ngay. Sửa tay một ô khoảng cách thì sửa vào đúng tee đang chọn.
6. Thứ tự tab trong chuyến bật nâng cao: Tổng quan · Hậu cần · Hành lý · **Sân & gậy · Thi đấu** · Kho đồ · Tài chính.

**Bật/tắt:** theo từng chuyến (`trips.advanced`), khi tạo chuyến hoặc ở Tổng quan. Bật thì có thêm tab **Sân & gậy** và các khối Pin location, Chiến lược, Điểm từng hố trong tab Thi đấu. Mọi vai trò trừ admin được nhập; admin xem.

**Khoảng cách gậy dùng để tính:** với mỗi gậy, trung bình `strategy.recent_logs` (3) lần đo gần nhất trong `student_club_log_items`; chưa có lần đo thì dùng `student_clubs.carry`. Chỉ tính khoảng cách bay (carry). Đổi đơn vị theo scorecard (`unit.m_to_yd`).

**Chọn gậy cho khoảng cách X:** gậy có khoảng cách bay nhỏ nhất mà vẫn ≥ X − `club_short_tolerance`; không gậy nào tới thì lấy gậy dài nhất và ghi chú "chưa tới green".

**Par cá nhân:** `par + số gậy chấp nhận ở hố` = 1 nếu handicap ≥ index, thêm 1 nếu handicap ≥ 18 + index, thêm 1 nếu ≥ 36 + index (handicap theo mục 5.4.1). Không có index thì par cá nhân = par sân và nói rõ.

**Khoảng cách tới cờ:** `distance − green_depth/2 + from_front` (khoảng cách scorecard tính tới giữa green). Không có độ sâu thì dùng `default_green_depth`.

**Nhắm cờ hay giữa green:** nhắm cờ chỉ khi có pin, cờ không sát mép trước/sau (`pin_edge_margin`), không lệch trái/phải, và handicap ≤ `attack_pin_max_hcp`. Còn lại nhắm giữa green. Cờ đầu green: nhắc đủ gậy qua mép trước. Cờ cuối green: nhắc không vượt green. Cờ lệch: nhắm giữa green phía cờ.

**Handicap Index (chốt 14/10/2026):** ô nhập Handicap Index của con đặt ngay đầu khối Chiến lược (cùng dữ liệu với `trips.hcp_override`, sau này lấy mặc định từ hồ sơ học viên). Có số thì dùng cho par cá nhân, mốc chỉ số và chọn chế độ; chưa có thì dùng handicap tương đương của level và ghi rõ nguồn.

**Phong cách thi đấu (chốt 14/10/2026):** mỗi vòng chọn một trong ba: **Tấn công**, **An toàn**, **Tuỳ hố** (mặc định). Lưu ở `trip_days.play_style`; chế độ chỉnh tay từng hố lưu ở `trip_day_hole_modes` (day_id, hole_no, mode). Đổi phong cách vòng thì xoá các chỉnh tay.
- **Tuỳ hố** tự chọn: **an toàn** nếu hố khó (index ≤ 6), cờ sát mép hoặc lệch, hoặc các vòng trước trung bình ≥ +1 so với par cá nhân; còn lại **tấn công**. Người dùng bấm nhãn từng hố để đổi; trùng với chế độ tự chọn thì bỏ chỉnh tay.
- **Tấn công:** driver ở par 4/5 (trừ par 4 ngắn mà driver để lại dưới 40 đơn vị); nhắm cờ khi có pin (cờ sát mép thì ghi chú lỡ về phía giữa green); cú 2 par 4 đi thẳng lên green nếu còn ≤ gậy fairway dài nhất + `reach_buffer`; par 5 gợi ý lên green 2 cú nếu tới được.
- **An toàn:** par 4 dùng gậy fairway từ tee nếu vẫn còn cú 2 vừa sức (≤ gậy sắt/hybrid dài nhất + 5), hoặc vòng trước fairway/gậy phạt kém mốc; par 5 dùng gậy fairway từ tee và chia 3 cú; luôn nhắm giữa green (cờ lệch thì giữa green lệch nhẹ về phía cờ); không dùng gỗ đánh vào green; hố có par cá nhân > par thì chỉ đánh thẳng lên green khi còn ≤ gậy sắt dài nhất (không tính hybrid) + 3, ngược lại đánh ngắn để lại khoảng cách wedge yêu thích.
- Tóm tắt đầu vòng ghi phong cách và số hố tấn công/an toàn. Gửi AI kèm phong cách và chế độ từng hố; AI phải tôn trọng lựa chọn, giải thích lý do ở chế độ Tuỳ hố, và được đề xuất đổi chế độ một hố nếu có lý do.

**Kế hoạch từng hố** (theo thứ tự đánh, tính cả hố xuất phát shotgun):
- Par 3: chọn gậy theo khoảng cách (tới cờ nếu nhắm cờ, tới giữa green nếu không).
- Par 4: gậy tee mặc định là driver. Dùng gậy fairway dài nhất khi (a) hố ngắn, sau cú đó còn ≤ khoảng cách wedge yêu thích + `short_par4_buffer`, hoặc (b) vòng trước fairway kém mốc ≥ 10 điểm % hoặc gậy phạt vượt mốc (mục 5.4). Cú 2 tới green nếu còn ≤ gậy fairway dài nhất + `reach_buffer`, **trừ khi** par cá nhân > par và còn xa hơn gậy sắt/hybrid dài nhất + `layup_comfort_buffer` → đề xuất đánh ngắn để lại khoảng cách wedge yêu thích, lên green cú 3.
- Par 5: handicap ≤ `par5_two_shot_max_hcp` và cú 2 tới được → gợi ý có điều kiện; còn lại 2 cú để lại khoảng cách wedge yêu thích.
- Ghi chú thêm: hố khó (index ≤ `hard_hole_index`); các vòng trước trung bình ≥ +1 so với par cá nhân ở hố này → chơi an toàn; ≤ −0,5 → hố con chơi tốt.
- Tóm tắt đầu vòng: tổng par cá nhân; nhắc theo chỉ số vòng trước (putt, fairway, GIR, double+); nhắc theo thời tiết (gió ≥ 30 km/h, mưa ≥ 60%, cảm giác nhiệt ≥ 35°C).
- Dòng cố định: kế hoạch chưa tính địa hình và chướng ngại cụ thể; HLV xem yardage book để chỉnh.

Kiểm thử bắt buộc với bộ số ở mục 8 (kịch bản 13).

**Đọc ảnh bằng AI (scorecard, pin sheet):** ảnh nén ≤ 1568 px gửi cho AI ở **máy chủ** (Edge Function), yêu cầu trả JSON đúng dạng. Kết quả chỉ **điền sẵn** vào ô nhập, đánh dấu `source = ai_photo`, người dùng phải xem lại; không tự lưu thẳng thành dữ liệu đã xác nhận. Pin sheet ghi theo bước chân thì đổi ra mét theo `unit.paces_to_m`.

**Phân tích chiến lược bằng AI:**
- Đầu vào: toàn bộ dữ liệu chuyến liên quan (scorecard, khoảng cách gậy đang dùng, pin, thời tiết, kế hoạch tự động, kết quả và tự đánh giá các vòng trước, cấp độ và handicap), dạng JSON; **kèm ảnh yardage**, ưu tiên ảnh của các hố có index nhỏ nhất (khó nhất), rồi ảnh cả sổ, trong giới hạn số ảnh của nhà cung cấp.
- Lời dặn AI: vai HLV golf trẻ, tiếng Việt, gọi VĐV là "con"; cấu trúc 4 phần (mục tiêu cả vòng, 3–5 điểm chung, tối đa 6 hố cần chú ý, một câu nhắc tâm lý); tối đa `ai.max_words` từ; chỉ dùng dữ liệu và ảnh được gửi; thiếu thì nói thiếu; không có ảnh thì không được tự suy ra chướng ngại.
- Lưu mỗi lần phân tích vào `trip_day_ai_plans`; giới hạn 5 lần mỗi ngày đấu.
- **Gọi AI ở máy chủ**, khoá API không nằm ở trình duyệt.
- **Nhà cung cấp (chốt 14/10/2026, CT12): Claude API của Anthropic.** Đọc ảnh scorecard và pin sheet dùng **Claude Haiku 5.5** (`claude-haiku-5-5`); phân tích chiến lược dùng **Claude Sonnet 5.5** (`claude-sonnet-5-5`). Tên model là cấu hình (`ai.provider`, `ai.model_extract`, `ai.model_strategy`), khoá API để trong Supabase secrets. Tài khoản tổ chức VN Centre đặt **trần chi tiêu tháng** trên Claude Console. Việt Nam nằm trong danh sách quốc gia được dùng API thương mại; theo chính sách hiện hành, dữ liệu gửi qua API không được dùng để huấn luyện model, trừ khi chủ động gửi phản hồi — không bật tính năng gửi phản hồi trong Console.
- **Phương án miễn phí dự phòng (chốt 14/10/2026, CT13):** Cloudflare Workers AI trong hạn mức miễn phí hằng ngày, model mở có hỗ trợ ảnh; Claude Code chọn model mạnh nhất có hỗ trợ ảnh trong danh mục lúc build và ghi tên model vào `12-mapping.md`. Cấu hình: `ai.provider = claude`, `ai.fallback_provider = workers_ai`, `ai.fallback_model_extract`, `ai.fallback_model_strategy`, `ai.monthly_cap_usd` (mặc định 20).
- **Thứ tự chạy:** (1) Claude; (2) nếu Claude lỗi, hết trần chi tiêu tháng hoặc quá thời gian chờ 60 giây → Workers AI; (3) nếu cả hai không chạy được → **không có phân tích AI, vẫn hiện kế hoạch tự động theo công thức**, báo "Phân tích AI tạm hết lượt, kế hoạch tự động vẫn dùng được". Không bao giờ chặn người dùng vì AI.
- **Minh bạch:** mỗi bản phân tích và mỗi lần đọc ảnh ghi rõ nhà cung cấp và model (`trip_day_ai_plans.provider`, `model`); màn hình hiện dòng nhỏ "Phân tích bởi Claude Sonnet 5.5" hoặc "… bởi model dự phòng miễn phí — độ chính xác thấp hơn, kiểm tra kỹ".
- **Theo dõi chi phí:** ghi số token vào/ra mỗi lần gọi Claude; trang admin hiện tổng chi ước tính trong tháng so với trần; chạm 80% trần thì báo admin.
- Lớp gọi AI viết thành **một hàm chung** nhận (loại việc, dữ liệu, ảnh) và trả (văn bản hoặc JSON), để đổi nhà cung cấp chỉ là đổi cấu hình. Gửi dữ liệu và ảnh của trẻ cho nhà cung cấp AI cần **phụ huynh đồng ý** một lần (thêm loại `ai_processing` vào `consents`), có thể rút lại (CT12).

## 6. Vị trí trong app

- **Phụ huynh:** trang hồ sơ con thêm mục "Chuyến thi đấu" (danh sách chuyến, nút Tạo chuyến).
- **HLV:** mục menu "Chuyến thi đấu" liệt kê các chuyến mình là thành viên.
- **Học viên:** mục "Chuyến của con", chỉ xem và tick.
- **Admin:** "Cấu hình chuyến thi đấu" (các bảng ở mục 4.1, dùng lại `CrudTable`).
- Trong một chuyến: 6 tab như bản thử (Tổng quan · Hậu cần · Hành lý · Thi đấu · Kho đồ · Tài chính), menu dưới trên điện thoại, tab ẩn theo quyền.
- Màu, font, nút theo `src/index.css` và `components/ui` (navy `#080634`, nút chính chuyển màu đồng → vàng, nền kem `#fbf7ef`, Be Vietnam Pro).

## 7. Việc Claude Code phải làm (theo bước, mỗi bước chạy thử được)

| Bước | Nội dung | Dừng chờ duyệt |
|---|---|---|
| 0 | Đọc schema staging và spec này. Viết `docs/spec/12-mapping.md`: bảng nào dùng lại, bảng nào thêm, tên cột cụ thể, cách xác định "phụ huynh có quyền quản lý" và "người có hồ sơ Passport" | **Có** |
| 1 | Migration bảng cấu hình + cột `levels.hcp_equivalent` + seed từ CSV + màn admin | Có |
| 2 | `trips`, `trip_members` + RLS + tạo chuyến (sinh dữ liệu từ mẫu) + tab Tổng quan + thêm/duyệt thành viên | Có |
| 3 | Hậu cần, hành lý | |
| 4 | Thi đấu: xuất phát (tee/shotgun), nhóm đấu, thời gian biểu, ăn uống, lưu ý, checklist | Có |
| 5 | Kết quả vòng, phân tích theo cấp độ, bảng tổng hợp các vòng | Có |
| 6 | Kho đồ, mua thêm → chi phí | |
| 7 | Tài chính, phân tích, so sánh chuyến, xuất Excel | Có |
| 7c | Chế độ nâng cao: scorecard, bộ gậy và nhật ký đo (theo học viên), ảnh yardage (kho riêng tư), pin, điểm từng hố, kế hoạch từng hố, đọc ảnh và phân tích bằng AI ở máy chủ, đồng ý `ai_processing` | Có |
| 7d | Chạy thử so sánh Claude và Workers AI trước khi bật dự phòng: 5 ảnh scorecard và 3 ảnh pin sheet thật (anh Long cung cấp, để ở `docs/spec/data/chuyen-thi-dau/anh-thu/`), 3 bộ dữ liệu chiến lược. Ghi bảng kết quả vào `12-mapping.md`: tỷ lệ ô đọc đúng của mỗi bên, lỗi sai số liệu trong bản chiến lược. Workers AI chỉ được bật làm dự phòng đọc ảnh nếu đọc đúng ≥ 90% ô; dưới mức đó thì khi Claude không chạy được, ô ảnh chuyển sang nhập tay | Có |
| 7b | Thời tiết: toạ độ sân, hàm `trip-weather`, lịch chạy, bảng `trip_day_weather`, quy tắc cảnh báo, nhập tay ghi đè, ghi công Open-Meteo | Có |
| 8 | Kiểm thử tự động: RLS cho từng vai × từng nhóm dữ liệu trong ma trận mục 3, công thức 5.1–5.6; nghiệm thu trên điện thoại 360px | Có |

## 8. Nghiệm thu (tối thiểu)

1. HLV tạo chuyến cho học viên → phụ huynh của học viên thấy ngay chuyến đó với toàn quyền; HLV không thấy tổng chi.
2. HLV thêm caddie → caddie chưa vào được cho đến khi phụ huynh duyệt.
3. Golfer đăng nhập tài khoản học viên: không thấy tab Tài chính, không thấy SĐT của ai.
4. Tee 08:00, xe 20 phút → có mặt tee box 07:45; đổi sang shotgun hố 5, tập trung 30 phút → có mặt điểm tập trung 07:30, tại tee hố 5 lúc 07:50.
5. Level 14, vòng 80 gậy par 72 → "tốt hơn kỳ vọng 10 gậy"; đổi Level 18 → "kém kỳ vọng 2 gậy" và có cảnh báo.
6. Tick "đã mua" 1 hộp bóng giá 900 THB, tỷ giá 720 → khoản chi 648.000 đ ở hạng mục Đồ tiêu hao; bỏ tick → khoản đó biến mất.
7. Admin sửa một dòng hành lý mẫu → chuyến tạo **sau** đó dùng dòng mới; chuyến cũ giữ nguyên.
8. Tạo giải trong nước → không có việc "Nộp hồ sơ visa", không có "Visa", có "CCCD hoặc hộ chiếu"; tab Tài chính không hỏi tiền tệ. Đổi sang quốc tế → hiện lại hộ chiếu, visa, tiền tệ.
9. Admin xem được tab Tài chính của mọi chuyến nhưng không có nút ghi/xoá khoản chi.
10. Gửi đối chiếu khi chưa có link → bị chặn với thông báo rõ. Admin chọn Khớp → trạng thái "Đã khớp kết quả VGA"; sửa điểm vòng 2 sau đó → về "Đang chờ đối chiếu".
11. Ngày bay 14/10, ngày về 18/10, vòng 1 ngày 16/10, 3 vòng, 1 ngày tập → Ngày tập 1 = 15/10, Vòng 1–3 = 16, 17, 18/10, kiểm thử chạy ở múi giờ Việt Nam.
12. Sân ở Hà Nội, tee 07:00: khối thời tiết tự hiện số trong khung 05:45–12:00; nhập tay cảm giác nhiệt 41 → mức "Nắng nóng nguy hiểm", bấm thêm checklist → có "Hỏi BTC điểm nước, khu nghỉ, số y tế giải"; lần cập nhật tự động sau vẫn giữ số 41 nhập tay. Có dòng ghi công Open-Meteo.
13. Bật nâng cao; scorecard hố 6 par 4, 380 m, index 1; HDC 15 (Level 16); gậy bay: driver 210, gỗ 3 190, hybrid 170, sắt 5–9 155/145/135/125/115, PW 105; pin hố 6 cách mép trước 20 m, lệch phải, green sâu 30 m → tới cờ 385 m, par cá nhân 5, cú đầu driver, cú 2 đánh ngắn ~65 m để lại ~105 m cho PW, nhắm giữa green phía cờ. Hố 5 par 4, 310 m → không cần driver, cú đầu gỗ 3.
14. Phân tích AI khi chuyến có 3 ảnh yardage (hố 1, hố 5, cả sổ) và nhà cung cấp cho tối đa 2 ảnh: gửi ảnh của 2 hố có index nhỏ nhất, lời dặn ghi rõ ảnh nào là hố nào; bản phân tích lưu kèm "có xem 2 ảnh yardage".
15. Giả lập Claude lỗi → bản phân tích do Workers AI viết, có dòng "model dự phòng miễn phí"; giả lập cả hai lỗi → không có bản AI, kế hoạch tự động vẫn hiện đủ, có thông báo hết lượt; giả lập chi tiêu đạt 80% trần → admin nhận cảnh báo.
16. Ghi tee "đỏ", đọc scorecard có 4 tee Black/Blue/White/Red và hàng Ladies HCP → tự chọn Red, khoảng cách và index lấy đúng hàng Red/Ladies HCP; bấm White → toàn bộ khoảng cách đổi theo White; đổi đơn vị sang mét → số đổi theo 1 yd = 0,9144 m; đổi lại yard → về số cũ (sai lệch làm tròn ≤ 1).
17. Bộ số của kịch bản 13, Handicap Index 15: phong cách An toàn → hố 5 (par 4, 310 m) cú đầu gỗ 3, hố 6 (par 4, 380 m, index 1) cú 2 đánh ngắn ~65 m để lại ~105 m cho PW; phong cách Tấn công → hố 6 cú 2 gỗ 3 nhắm cờ; Tuỳ hố → hố 6 an toàn, hố 5 tấn công; bấm nhãn hố 5 → đổi sang an toàn, ghi "chỉnh tay"; đổi phong cách vòng → mất chỉnh tay.

## 9. Việc còn mở

Ghi ở `phu-luc-D-viec-con-mo.md`, nhóm CT1–CT12.
