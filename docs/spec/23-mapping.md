# 23 · Đối chiếu thiết kế Tập luyện đợt 1 với hệ thống hiện có

Bản 1 · 23/11/2026 · Người soạn: Minh · Đọc kèm: `23-module-tap-luyen-dot-1.md` (anh Long đã duyệt 23/11/2026)

**Nguồn đối chiếu:** 61 migration trong `supabase/migrations` và code `src` ở commit `6f4fe6a` (main, 10/11/2026). Em **chưa đọc trực tiếp** cơ sở dữ liệu staging vì phiên làm việc không có khoá Supabase. Trước khi chạy migration phải so lại danh sách migration đã áp dụng trên staging (`supabase migration list`) với repo; nếu staging có thay đổi ngoài repo thì dừng lại báo anh.

**Trạng thái: anh Long đã xác nhận 23/11/2026 (cách B). Migration `20261123000001_training_s1.sql` đã viết, chưa áp dụng lên staging.**

---

## 1. Dùng lại, không sửa

| Thứ có sẵn | Dùng cho | Ghi chú |
|---|---|---|
| `students` | Mỗi người tập là một dòng học viên (mã VNC) | Không thêm cột |
| `students.date_of_birth` | Kiểm tra từ 18 tuổi | Cột cho phép trống: trống thì màn Bắt đầu hỏi ngày sinh và ghi qua hàm sẵn có của hồ sơ |
| `student_guardians` với `relationship = 'self'`, `can_manage = true` | Người lớn tự quản hồ sơ của mình | Các luồng sự kiện, nhân sự đều tạo hồ sơ `self` với `can_manage = true` |
| `can_manage_student(student_id)` | Quyền đọc, ghi dữ liệu tập của chính mình | Đúng với cả phụ huynh của con; đợt 1 màn hình chỉ mở cho hồ sơ `self` từ 18 tuổi |
| `my_children()` | Lấy hồ sơ `self` của người đang đăng nhập | Hàm trả về cột `relationship` |
| `is_admin()` | Admin xem, sửa mọi thứ | |
| `default_org_id()`, cột `org_id` | Mọi bảng mới | Theo quy ước 01 mục 1 |
| `set_updated_at()` + trigger `set_updated_at` | Mọi bảng mới có `updated_at` | |
| `audit_logs` | Ghi lịch sử khi đo lại khoảng cách gậy, admin sửa giáo án | |
| `app_settings` + `useSetting()` | Toàn bộ khoá `training.*` | Chính sách đọc hiện tại: ai cũng đọc được dòng `is_public = true` |
| `notifications` (cột `type` là text tự do) | Nhắc tập trong app | Không cần sửa ràng buộc |
| pg_cron (đã dùng ở `promote-grades`) | Chạy nhắc tập mỗi sáng | Lịch `0 23 * * *` theo UTC = 6 giờ sáng giờ Việt Nam |
| Workspace `parent` ở `/app` | Đặt màn Tập luyện tại `/app/training` | Người lớn tự quản hồ sơ đang dùng workspace này |
| `supabase/tests` (đánh số 000–043) | Bài kiểm thử cơ sở dữ liệu | Thêm `044_training_s1.sql` |

## 2. Thêm mới

**Bảng (đúng như thiết kế):** `training_programs`, `training_program_sessions`, `training_program_blocks`, `training_stat_benchmarks`, `training_goals`, `training_intake_tests`, `training_session_logs`, `training_session_items`, `round_stats`, `round_stat_holes`, `club_distances`.

**Hàm:**

| Hàm | Việc |
|---|---|
| `training_enabled()` | Đúng khi là admin, hoặc `training.visibility = 'all'`, hoặc `beta` và `auth.uid()` có trong `training.beta_user_ids`. Security definer, vì danh sách người thử để `is_public = false` |
| `training_self_student()` | Trả về `student_id` của hồ sơ `self` đang hoạt động của người dùng; không có thì trả về trống |
| `training_can_manage(student_id)` | Admin, hoặc người được bật tập luyện và quản lý được hồ sơ |
| `training_create_self_profile(...)` | Tự tạo hồ sơ golfer (mục 4) |
| `training_session_for(...)`, `training_benchmark(...)` | Tìm buổi giáo án của tuần/ngày; tính chuẩn thống kê |
| `training_start_goal(...)` | Tạo mục tiêu mới, chuyển mục tiêu đang chạy (nếu có) sang `replaced`, đặt con trỏ về tuần 1 |
| `training_save_session(...)` | Ghi buổi tập, ghi từng phần, dời con trỏ, chuyển `completed` khi hết giáo án. App không được sửa con trỏ trực tiếp |
| `training_send_reminders()` | pg_cron gọi mỗi sáng, ghi vào `notifications` |

**Cấu hình `app_settings`:** 9 khoá ở mục 6 bản thiết kế. `training.beta_user_ids` để `is_public = false`; các khoá còn lại `is_public = true` để app đọc bằng `useSetting()`.

**Dữ liệu nạp:** 40 buổi, 194 phần từ `docs/spec/data/break-90-80-70.json`; bảng chuẩn thống kê. Nạp trong migration (cả staging và production), không đặt trong `seed.sql`.

**Code giao diện:** thư mục mới `src/features/training/`; thêm mục "Tập luyện" vào `PARENT_NAV`, chỉ hiện khi `training_enabled()` đúng và người dùng có hồ sơ `self` từ 18 tuổi. Admin: thêm trang `/admin/training` vào `ADMIN_NAV`.

## 3. Khác với bản thiết kế (cần anh biết)

1. **Thông báo đẩy và email chưa có.** Repo chưa có bảng `notification_types`, `notification_preferences`, `push_subscriptions` (spec 01 xếp các bảng này ở đợt 2 và chưa làm). Đợt 1 nhắc tập **chỉ trong app** (chuông thông báo). Đẩy và email làm khi hệ thống thông báo chung có.
2. **Người dùng chưa tắt riêng từng loại nhắc được** vì chưa có `notification_preferences`. Thay bằng một công tắc "Nhắc tập" trên màn Kế hoạch tuần, lưu ở cột mới `training_goals.reminders_on` (mặc định bật).
3. **Không đụng sổ điểm.** `reward_ledger` hiện chỉ cho học viên và chỉ nhận 3 lý do; đợt 1 không ghi gì vào đó, đúng thiết kế.

## 4. Đã quyết: cách B — người dùng tự tạo hồ sơ golfer (anh Long chốt 23/11/2026)

Hàm `training_create_self_profile(họ tên, ngày sinh, giới tính)`:
- Chỉ gọi được khi `training_enabled()`; phải từ `training.min_age` tuổi.
- Đã có hồ sơ `self` thì trả lại hồ sơ đó, không tạo thêm.
- **Luôn tạo hồ sơ mới** với `verification_status = 'pending_review'` và nối `self` (`linked_via = 'training'`, giá trị mới thêm vào ràng buộc). **Không tự nối** vào hồ sơ có sẵn dù trùng tên và ngày sinh, để không ai nhận nhầm hồ sơ của người khác.
- Số hồ sơ trùng tên chuẩn hoá + ngày sinh ghi vào `self_reported.match_count`. Hồ sơ này hiện ở hàng chờ duyệt hiện có của admin, kèm danh sách ứng viên trùng, để admin xác minh hoặc gộp bằng công cụ gộp sẵn có.
- Người dùng tập được ngay, không phải chờ duyệt.
- Gộp hồ sơ: trigger `training_follow_student_merge` chuyển toàn bộ dữ liệu tập sang hồ sơ giữ lại; bỏ gộp thì trả về (cùng cách `grade_history_follow_student_merge`). Nếu hồ sơ giữ lại đã có mục tiêu đang chạy, mục tiêu của hồ sơ bị gộp chuyển `replaced`.

## 4b. Chỉnh nhỏ so với bản thiết kế khi viết migration

- `club_distances` giữ **mọi lần đo** (không duy nhất theo gậy); số đang dùng là lần đo mới nhất. Bỏ ghi `audit_logs` cho việc này.
- `training_stat_benchmarks` lưu theo mốc (`hcp`, `value`) với `mode` = `step` (bậc thang) hoặc `linear` (nội suy). Hàm `training_benchmark(stat, hcp)` trả giá trị chuẩn.
- Người tập chỉ sửa trực tiếp được 5 cột lịch của mục tiêu: `schedule_mode`, `days_of_week`, `session_minutes`, `reminders_on`, `weak_area`. Đổi chương trình phải tạo mục tiêu mới.
- Thêm cột `merge_trail` cho các bảng theo học viên để bỏ gộp được.

## 5. Thứ tự làm sau khi anh xác nhận

1. Migration `20261123000001_training_s1.sql`: bảng, RLS, hàm, cấu hình, nạp giáo án. Kiểm thử `044_training_s1.sql`. Mở PR để anh xem.
2. Áp dụng trên staging sau khi anh đồng ý.
3. Màn hình người tập, rồi màn hình admin, rồi nhắc tập; mỗi phần một PR.
