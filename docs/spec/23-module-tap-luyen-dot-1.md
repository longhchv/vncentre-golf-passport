# 23 · Module Tập luyện — đợt 1: người lớn đặt mục tiêu, Break 90/80/70, ghi vòng đấu

Bản 1 · 23/11/2026 · Người yêu cầu: Vũ Anh Long · Người soạn: Minh
Đọc kèm: bản thử "Tập luyện – Golf Passport (bản thử)", file dữ liệu `docs/spec/data/break-90-80-70.json` (40 giáo án, đã việt hoá), `01-du-lieu.md` (quy ước chung), `19-module-diem-thuong-doi-qua.md` (sổ điểm thưởng).

**Trạng thái: anh Long duyệt 23/11/2026. Các chỉnh nhỏ khi viết migration ghi ở `23-mapping.md` mục 4, 4b.**

---

## 0. Phạm vi

Module Tập luyện ghép vào Golf Passport theo 3 đợt, mỗi đợt dùng thử vài tuần rồi mới mở rộng.

| Đợt | Nội dung | Ai thấy |
|---|---|---|
| **1 (file này)** | Người lớn từ 18 tuổi: đặt mục tiêu handicap, bài test đầu vào, giáo án Break 90/80/70, lịch tập linh hoạt, ghi buổi tập, ghi vòng đấu theo hố, khoảng cách gậy, nhắc tập | Chỉ admin và danh sách người thử |
| 2 | Trẻ em dưới 18 tuổi theo 20 level, thử thách lên level, HLV giao bài cho lớp, thư viện bài tập | Sau khi duyệt đợt 1 |
| 3 | Điểm tập luyện vào sổ điểm, đổi quà, chi tiêu golf, đối tác, kiểm tra size gậy | Sau khi chốt luật điểm và chống gian lận |

**Đợt 1 không:**
- ghi điểm thưởng hay điểm xếp hạng nào (để đợt 3, vì ví điểm người lớn tách riêng theo quyết định D58);
- tính handicap chính thức (việc của app Handicap WHS; đợt này chỉ lưu số người dùng tự khai);
- động vào bảng `students`, `levels`, `reward_ledger` hay bất kỳ bảng nào đang chạy.

## 1. Nguyên tắc bắt buộc

1. **Migration chỉ thêm** bảng, cột, dòng cấu hình. Làm trên **staging** trước.
2. **Người lớn là một hồ sơ học viên** như hiện tại: mỗi người có một dòng `students` (mã VNC), nối với tài khoản qua `student_guardians` có `relationship = 'self'`. Mọi bảng của module gắn theo `student_id`.
3. **Giáo án lưu trong cơ sở dữ liệu**, không viết cứng trong code, để admin sửa câu chữ, thêm giáo án mới mà không phải phát hành lại app.
4. **Giữ đúng giáo án gốc:** đủ bài, đủ số bóng, đơn vị feet và yard. App chỉ chia nhỏ theo thời lượng, không bớt bài. Tên chương trình là Break 90, Break 80, Break 70.
5. **Tạm ẩn:** chỉ người có tên trong danh sách thử (mục 6) và admin thấy mục Tập luyện.
6. Song ngữ theo quy ước `*_vi`, `*_en`. Đợt 1 điền tiếng Việt; tiếng Anh để trống, hiện tiếng Việt thay thế.

## 2. Nội dung giáo án (admin quản lý, mọi người thử đọc được)

### `training_programs` — chương trình

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `code` | text, duy nhất | `b90`, `b80`, `b70`. Đợt sau thêm `home21`, `fit8`, `chip_ladder`, `putt_ladder`… |
| `name_vi`, `name_en` | text | "Break 90"… |
| `kind` | text | `break` (đợt 1). Sau thêm `home`, `fitness`, `ladder` |
| `audience` | text | `adult` / `junior` / `all` |
| `target_hcp_min`, `target_hcp_max` | numeric, null được | Khoảng handicap mục tiêu để app tự chọn: Break 90 từ 18; Break 80 từ 8 đến 17; Break 70 dưới 8 |
| `weeks` | int | 12 |
| `days_per_week` | int | 3 (số ngày tập trong một tuần **giáo án**, không phải tuần lịch) |
| `summary_vi`, `summary_en` | text | Mô tả ngắn |
| `is_active` | bool | |
| `version` | int | Tăng khi sửa nội dung, để biết người tập đang theo bản nào |

### `training_program_sessions` — buổi giáo án

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `program_id` | uuid | |
| `week_no` | int 1–12 | |
| `day_no` | int 0–3 | `0` = dùng chung cho cả 3 ngày của tuần (đa số tuần). `1`, `2`, `3` = buổi riêng từng ngày (Break 70 tuần 11, 12) |
| Duy nhất | | `(program_id, week_no, day_no)` |

Dữ liệu: Break 90 có 12 buổi, Break 80 có 12, Break 70 có 16. Tổng 40.

### `training_program_blocks` — phần trong một buổi

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `session_id` | uuid | |
| `sort_order` | int | Thứ tự trong buổi |
| `area` | text | `fir`, `gir`, `scr` (up & down), `chip`, `putt` |
| `title_vi`, `title_en` | text | "Fairway (FIR)", "Putt"… |
| `est_minutes` | int | Thời gian ước tính theo bản gốc |
| `lines` | jsonb | Danh sách dòng: `{"t": loại, "vi": "...", "en": ""}`. Loại: `p` đoạn văn / hướng dẫn, `o` mục tiêu, `h` tiêu đề bài, `b` và `s` dòng bài tập, `d` bài tập đánh số |

Dữ liệu: 194 phần. Nạp từ `docs/spec/data/break-90-80-70.json`.

**Cách app chia buổi theo thời lượng** (tính trong app, không lưu):
- Mỗi phần chia thành các **khối bằng nhau**, mỗi khối khoảng 5 phút, rải đều theo các dòng bài tập (`b`, `s`, `d`).
- Buổi tập của người dùng lấy liên tiếp các khối cho đến khi đủ thời lượng đã chọn.
- Phần làm hôm nay hiện đậm, phần để buổi sau hiện mờ.
- Tiến độ lưu bằng **con trỏ** (mục 3) nên admin sửa câu chữ không làm lệch tiến độ. Nếu admin **thêm hoặc bớt dòng** của một phần đang có người tập, con trỏ giữ theo tỉ lệ đã làm của phần đó.

### `training_stat_benchmarks` — chuẩn thống kê theo handicap (admin sửa)

| Cột | Ý nghĩa |
|---|---|
| `stat` | `fir_pct`, `gir_pct`, `scramble_pct`, `putts_per_18`, `three_putts_per_18`… |
| `hcp_from`, `hcp_to` | Khoảng handicap áp dụng |
| `value` | Giá trị chuẩn |

Nạp từ bảng trong bộ tài liệu tập luyện, ví dụ: FIR 63% (HCP 0 trở xuống), 55% (đến 10), 51% (đến 20), 48% (đến 30), 40% (trên 30); putt mỗi vòng 30 / 35 / 40 / 45 ở HCP 0 / 10 / 20 / 30, nội suy ở giữa.

## 3. Dữ liệu của người tập

### `training_goals` — mục tiêu (mỗi người một mục tiêu đang chạy)

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `student_id` | uuid | |
| `hcp_start` | numeric | Handicap lúc đặt mục tiêu (tự khai hoặc ước tính từ bài test) |
| `hcp_start_source` | text | `self_declared` / `intake_test` / `whs` (sau khi nối app Handicap) |
| `hcp_target` | numeric | |
| `months` | int | 3, 6, 9, 12 |
| `start_date` | date | Ngày bắt đầu; tuần lịch tính từ thứ Hai của tuần này |
| `program_id` | uuid | Break 90/80/70 app chọn theo `hcp_target`; người dùng đổi được |
| `program_version` | int | Phiên bản giáo án lúc bắt đầu |
| `schedule_mode` | text | `fixed_12_weeks` (giữ đúng 12 tuần, app tự tính thời lượng buổi) / `flexible` (người dùng chọn thời lượng, khoá học kéo dài theo) |
| `days_of_week` | int[] | 0 = Chủ nhật … 6 = thứ Bảy; ít nhất 1 ngày |
| `session_minutes` | int | Dùng khi `flexible`: 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 210 |
| `weak_area` | text, null được | `fir`, `gir`, `scr`, `chip`, `putt`. Chỉ để **đánh dấu ưu tiên**, không tăng số bóng |
| `cursor_week`, `cursor_day`, `cursor_block`, `cursor_fraction` | int, int, int, numeric | Con trỏ: đang ở tuần nào, ngày tập nào (1–3), phần thứ mấy, đã làm bao nhiêu phần của phần đó (0–1) |
| `status` | text | `active` / `completed` / `replaced` / `cancelled` |
| `completed_at` | timestamptz | |
| Ràng buộc | | Mỗi `student_id` chỉ một dòng `active` (chỉ mục duy nhất có điều kiện) |

Đổi mục tiêu: dòng cũ chuyển `replaced`, tạo dòng mới. Không xoá lịch sử.

### `training_intake_tests` — bài test đầu vào

| Cột | Ý nghĩa |
|---|---|
| `student_id`, `goal_id` | |
| `putt_made`, `chip_close`, `tee_fairway` | Số đạt trên 5 của 3 bài |
| `est_hcp_putt`, `est_hcp_chip`, `est_hcp_long` | Handicap ước tính từng kỹ năng |
| `weak_area` | Kỹ năng yếu nhất |
| `taken_at` | |

Bảng quy đổi số đạt sang handicap ước tính đặt trong `app_settings` (`training.intake_map`) để admin chỉnh. App gợi ý làm lại bài test mỗi 4 tuần.

### `training_session_logs` — một buổi đã tập

| Cột | Ý nghĩa |
|---|---|
| `student_id`, `goal_id` | |
| `practiced_on` | Ngày tập (giờ Việt Nam) |
| `planned_minutes` | Thời lượng app đề xuất cho buổi |
| `done_minutes` | Tổng thời gian các phần đã đánh dấu xong |
| `note` | Ghi chú tự do |

### `training_session_items` — từng phần trong buổi

| Cột | Ý nghĩa |
|---|---|
| `log_id`, `block_id` | |
| `unit_from`, `unit_to`, `unit_total` | Đã làm khối nào đến khối nào trên tổng số khối của phần |
| `completed` | Người tập có đánh dấu xong không |
| `result_text` | Kết quả ghi như phiếu, ví dụ `32/50` |
| `result_made`, `result_attempts` | Tách số từ `result_text` khi đọc được, để làm thống kê |

Lưu buổi tập là **một hàm trên máy chủ** (`training_save_session`): ghi log, ghi các phần, dời con trỏ, đánh dấu mục tiêu `completed` khi hết giáo án. Không cho app tự sửa con trỏ trực tiếp.

### `round_stats` và `round_stat_holes` — vòng đấu theo hố

`round_stats`: `student_id`, `played_on`, `course_name`, `holes_played` (9 / 18), `tee_name`, `total_strokes`, `source` (`training`), `note`.

`round_stat_holes`: `round_id`, `hole_no`, `par`, `strokes`, `fairway` (`hit` / `left` / `right` / `na` cho par 3), `gir` (bool), `putts`, `penalties` (null được). Duy nhất `(round_id, hole_no)`.

Up & down, số lần 3 putt, putt mỗi GIR **tính khi đọc**, không lưu. App so 5 vòng gần nhất với `training_stat_benchmarks` theo `hcp_target`, tìm phần yếu nhất và cập nhật `training_goals.weak_area`.

> Bảng này chỉ phục vụ phân tích tập luyện, **không phải** dữ liệu nộp handicap. Khi app Handicap WHS chạy, hai bên nối qua `student_id`; vòng nhập ở app Handicap có thể tự sinh `round_stats` nếu có số liệu theo hố.

### `club_distances` — khoảng cách gậy

`student_id`, `club_code` (`dr`, `3w`, `5w`, `h4`, `4i` … `pw`, `gw`, `sw`, `lw`), `carry_yards`, `total_yards`, `measured_on`. Duy nhất `(student_id, club_code)`; đo lại thì cập nhật dòng, lịch sử ghi `audit_logs`.

## 4. Phân quyền (RLS)

| Bảng | Đọc | Ghi |
|---|---|---|
| `training_programs`, `_sessions`, `_blocks`, `training_stat_benchmarks` | Admin; người được bật tập luyện (mục 6) | Admin |
| `training_goals`, `training_intake_tests`, `training_session_logs`, `training_session_items`, `round_stats`, `round_stat_holes`, `club_distances` | Chính người tập (`can_manage_student`); admin | Chính người tập, qua hàm máy chủ với buổi tập; admin |

HLV và quản lý trường **chưa** xem được ở đợt 1. Đợt 2 thêm quyền xem cho HLV của lớp qua `can_staff_view_student`.

Hàm kiểm tra mới `training_enabled()`: trả về đúng khi người dùng là admin hoặc có `user_id` trong `training.beta_user_ids`, hoặc khi `training.visibility = 'all'`.

## 5. Nhắc tập

Dùng hệ thống thông báo sẵn có (`notification_types`, `notifications`). Thêm 3 loại:

| code | Khi nào | Kênh mặc định |
|---|---|---|
| `training_today` | Sáng ngày có lịch tập, chưa tập | Trong app, đẩy |
| `training_missed_3d` | 3 ngày có lịch liên tiếp không tập | Trong app, đẩy |
| `training_missed_7d` | 7 ngày không tập | Trong app, đẩy, email |

Chạy bằng pg_cron mỗi sáng 6 giờ giờ Việt Nam. Người dùng tắt được như các loại thông báo khác.

## 6. Cấu hình (`app_settings`, admin chỉnh)

| Khoá | Mặc định | Ý nghĩa |
|---|---|---|
| `training.visibility` | `"beta"` | `off` / `beta` / `all` |
| `training.beta_user_ids` | `[]` | Danh sách người thử |
| `training.min_age` | `18` | Dưới tuổi này đi luồng trẻ em (đợt 2) |
| `training.session_minute_options` | `[10,15,20,30,45,60,90,120,150,180,210]` | Các mức thời lượng buổi |
| `training.max_session_minutes` | `210` | Trần một buổi khi giữ 12 tuần và bị chậm lịch |
| `training.block_minutes` | `5` | Độ mịn khi chia phần |
| `training.max_hcp_drop_per_month` | `1.5` | Ngưỡng cảnh báo mục tiêu quá gắt |
| `training.retest_weeks` | `4` | Nhắc làm lại bài test |
| `training.intake_map` | Bảng quy đổi của bản thử | Số đạt → handicap ước tính |

## 7. Màn hình đợt 1 (đường dẫn dưới `/training`)

- **Bắt đầu:** kiểm tra tuổi từ ngày sinh (chưa có thì hỏi), đặt mục tiêu (handicap hiện tại hoặc "chưa có", handicap mục tiêu, thời hạn), cách xếp lịch, ngày tập, thời lượng.
- **Bài test đầu vào** 3 bài, mỗi bài 5 bóng.
- **Hôm nay:** buổi tập hôm nay, thời lượng, các phần; cảnh báo mục tiêu gắt; chậm lịch bao nhiêu tuần.
- **Buổi tập:** nội dung từng phần, đánh dấu xong, ghi kết quả.
- **Kế hoạch tuần:** 7 ngày, đổi ngày tập, thời lượng, cách xếp lịch; bảng thời lượng gợi ý theo số buổi; các mốc handicap theo tháng.
- **Vòng đấu:** ghi theo hố, tổng kết, so với chuẩn.
- **Khoảng cách gậy.**
- **Admin:** sửa chương trình, buổi, phần, câu chữ; sửa chuẩn thống kê; bật tắt người thử.

Giao diện dùng màu và tuỳ chọn "Giao diện" sẵn có của Golf Passport.

## 8. Thứ tự làm sau khi anh Long duyệt file này

1. Viết `docs/spec/23-mapping.md`: đối chiếu với schema staging (tên hàm quyền, `notification_types`, cách lấy tuổi). **Dừng cho anh xác nhận.**
2. Migration bảng + RLS + hàm `training_save_session`, `training_enabled`; nạp 40 giáo án và chuẩn thống kê. Chạy trên staging.
3. Màn hình người tập.
4. Màn hình admin.
5. Nhắc tập.
6. Anh Long và người thử dùng 2–4 tuần trên staging, rồi mới bật trên app thật cho danh sách thử.

## 9. Việc còn mở (không chặn đợt 1)

- Bản tiếng Anh của 40 giáo án.
- Nối với app Handicap WHS: lấy handicap chính thức, đồng bộ vòng đấu.
- Có cộng điểm cho buổi tập người lớn không, cộng vào ví nào (đợt 3).
- Thư viện bài tập (21 ngày tại nhà, thể lực 8 tuần, thang chip, thang putt, kiến thức): đưa vào đợt 2 cùng thư viện chung.
