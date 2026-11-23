# 24 · Module Tập luyện — đợt 2: các bạn nhỏ theo 20 level, thử thách lên level, HLV giao bài

Bản 1 · 23/11/2026 · Người yêu cầu: Vũ Anh Long · Người soạn: Minh
Đọc kèm: `23-module-tap-luyen-dot-1.md` (đợt 1 đã chạy trên app.vncentre.net), `03-dot-2-lop-hoc.md` (khung 3 trụ lên level), Claude Doc "Khung kho bài tập" mục 5b, 9, 9.5.

**Trạng thái: bản thiết kế chờ anh Long duyệt 5 điểm ở mục 7. Chưa có migration, chưa sửa code.**

---

## 0. Phạm vi

**Đợt 2 làm:**
1. **Luồng các bạn nhỏ (dưới 18 tuổi)** trong mục Tập luyện, đi theo **20 level Golf Passport** (level hiện tại lấy từ hồ sơ học viên).
2. **Thẻ thử thách lên level:**
   - Level 10–20: các bài kiểm tra kỹ năng theo bảng mục 9 Khung kho bài tập (cú dài, bunker, chip & run, putt), mỗi bài 5 cú.
   - Level 1–9 (SNAG): công thức cú đánh và văn hoá, **HLV đánh dấu qua / không qua**.
3. **Đủ thẻ của level → hệ thống tự tạo đề xuất lên level** vào hàng chờ duyệt có sẵn; HLV trưởng bấm duyệt (mục 7, điểm 1).
4. **HLV giao bài về nhà cho cả lớp**, các con làm xong đánh dấu, HLV xem ai đã làm và xác nhận bài làm tại lớp.
5. **Thư viện bài tập**: thẻ bài tập theo mẫu ở mục 2 Khung kho bài tập; nạp sẵn khoảng 35 drill, chương trình 21 ngày tại nhà, thang chip và thang putt 10 bậc đã có ở bản thử. Mở cho cả người lớn và các bạn nhỏ.

**Đợt 2 không làm:**
- Cộng điểm vào ví (điểm thưởng, điểm xếp hạng): để đợt 3, sau khi module điểm thưởng (PR #14) vào main. Đợt 2 **ghi sẵn mức điểm** của từng thẻ và bài giao để đợt 3 cộng bù.
- Tư vấn theo nhu cầu, chuỗi "cơ hội → trình độ → lộ trình", 3 phương án tài chính: để **đợt 2b**, vì cần số tiền và mốc học bổng anh chốt.
- Điểm danh, nhật ký văn hoá theo buổi, bài kiểm tra lý thuyết: thuộc `03-dot-2-lop-hoc`, chưa chốt chi tiết.

## 1. Nguyên tắc

1. Migration chỉ thêm. Làm trên staging trước (lưu ý: **app.vncentre.net hiện dùng chung cơ sở dữ liệu staging và build từ nhánh main**, nên gộp vào main là phát hành luôn).
2. **Hệ thống không tự cấp level.** Đủ điều kiện thì tạo đề xuất; người có quyền duyệt (đúng như `03` mục 2.9 và `upsert_level_completion` hiện có).
3. Mọi mốc và chỉ tiêu do admin sửa được trong màn Tập luyện của admin.
4. Bảo vệ trẻ em: màn hình của các con không hiện tên, điểm hay thứ hạng của bạn khác. Video nộp bằng **link YouTube** (để chế độ không công khai), không tải file lên.
5. Chỉ người quản lý được hồ sơ của con (`can_manage`) mới nhập kết quả cho con.

## 2. Dữ liệu

### `training_challenges` — thẻ thử thách (admin quản lý)

| Cột | Ý nghĩa |
|---|---|
| `level_number` | 1–20 (level mà thẻ này là điều kiện để **hoàn thành**) |
| `code` | Ví dụ `L13-TEE`, `L13-CHIP-15Y`, `L5-FORMULA` |
| `kind` | `level_up` (bắt buộc để lên level) / `practice` (thử thách thường, tự bấm) |
| `area` | `tee`, `approach`, `pitch`, `bunker`, `chip`, `putt_short`, `putt_mid`, `putt_long`, `formula`, `culture` |
| `title_vi/en`, `how_vi/en` | Tên, cách làm |
| `attempts` | Số cú mỗi lượt (mặc định 5) |
| `target_made` | Số cú phải đạt (ví dụ 3) |
| `target_label_vi/en` | Điều kiện đạt ghi chữ: "đi xa từ 130 y, lệch fairway không quá 30 y" |
| `verify` | `self` (tự bấm), `video_or_adult` (video hoặc phụ huynh/HLV xác nhận), `coach` (chỉ HLV) |
| `points_rank`, `points_reward` | Mức điểm để đợt 3 cộng |
| `is_provisional` | Đánh dấu số liệu tạm, chờ anh chốt (mục 7, điểm 2) |
| `sort_order`, `is_active` | |

Nạp sẵn: level 10–20 từ bảng 9.1–9.3 (mỗi level 11 thẻ: tee shot, approach, pitch, bunker, chip 10y, 15y, 20–25y, 30y, putt ngắn, putt vừa, putt xa → **121 thẻ**); level 1–9 mỗi level 2 thẻ HLV chấm (công thức cú đánh, văn hoá) → **18 thẻ**.

### `training_challenge_results` — kết quả từng lượt

`student_id`, `challenge_id`, `made`, `attempts`, `video_url` (null được), `submitted_by` (user), `status`: `passed` (thẻ tự bấm đạt) / `pending` (chờ xác nhận) / `approved` / `rejected`, `reviewed_by`, `reviewed_at`, `review_note`. Một thẻ **tính là đạt** khi có ít nhất một lượt `passed` hoặc `approved` với `made ≥ target_made`.

Ai xác nhận thẻ `video_or_adult`:
- **Phụ huynh** quản lý hồ sơ con bấm "Tôi đã xem con làm" → `approved` ngay; hoặc
- **HLV** của lớp con đang học xem video và duyệt.
Thẻ `coach` chỉ HLV của lớp (hoặc HLV trưởng, admin) bấm được.

### `training_level_eligibility` (view) và hàm `training_check_level(student_id)`

- Khi một thẻ `level_up` chuyển sang đạt, hàm kiểm tra: đủ mọi thẻ `level_up` đang bật của level hiện tại chưa.
- Đủ thì gọi `upsert_level_completion(student, level, 'assessment', false, hôm nay, 'Đủ thẻ thử thách trên app Tập luyện')` → một dòng `level_records` **chờ duyệt**. Hiện ngay trong **Hàng chờ duyệt** có sẵn của HLV trưởng và admin (duyệt được cả loạt).
- Duyệt xong, level của các con tự tăng (trigger `recompute_student_level` có sẵn), app Tập luyện chuyển sang bộ thẻ level mới.

### `training_assignments` và `training_assignment_marks` — bài HLV giao

`training_assignments`: `class_id`, `title_vi`, `body_vi`, `challenge_id` hoặc `drill_id` (null được), `due_date`, `points` (mức điểm HLV chọn, để đợt 3 cộng), `in_class` (làm ngay tại lớp → điểm cao hơn, HLV đánh dấu), `created_by`.

`training_assignment_marks`: `assignment_id`, `student_id`, `done_at`, `note`, `marked_by`, `confirmed_by` (HLV xác nhận). Duy nhất theo `(assignment_id, student_id)`.

Quyền: HLV của lớp (`is_class_staff`) tạo, sửa, xem cả lớp, xác nhận; phụ huynh của học viên trong lớp xem và đánh dấu cho con mình.

### `training_drills` — thư viện thẻ bài tập

Theo mẫu mục 2 Khung kho bài tập: `code`, `title_vi/en`, `form` (trò chơi / drill / thử thách / kiểm tra / mô phỏng vòng), `skill`, `level_from`, `level_to`, `age_band` (5–8, 9–12, 13–17, người lớn), `equipment`, `space`, `season`, `minutes`, `goal_vi`, `steps` (jsonb), `measure`, `target_vi`, `easier_vi`, `harder_vi`, `video_url`, `safety_vi`, `is_active`.

## 3. Màn hình

**Phụ huynh** (`/app/training`, đã có từ đợt 1):
- Nếu tài khoản có các con: thanh chọn "Của tôi / tên từng con". Chọn con → luồng các bạn nhỏ.
- **Trang của con:** level hiện tại (thanh 5 giai đoạn Passport), "Bước tiếp theo" là thẻ chưa đạt đầu tiên, tiến độ X/11 thẻ (L10–20) hoặc X/2 (L1–9), bài HLV giao chưa làm.
- **Thẻ thử thách:** cách làm, điều kiện đạt, nhập số cú đạt trên 5, dán link video (không bắt buộc), nút "Tôi đã xem con làm". Lịch sử các lượt.
- **Bài về nhà:** danh sách bài HLV giao theo lớp, đánh dấu đã làm.
- **Thư viện:** lọc theo kỹ năng, độ tuổi, dụng cụ, không gian, thời lượng.

**Tài khoản của con** (`/me`): chỉ xem level, thẻ đã đạt, bài về nhà (giữ nguyên quy tắc F7: tài khoản con chỉ xem).

**HLV** (`/coach/classes/:id`, thêm 2 thẻ):
- **Bài về nhà:** tạo bài cho cả lớp (chọn thẻ thử thách, drill trong thư viện hoặc gõ tự do; đặt hạn; mức điểm; "làm tại lớp"), xem ai đã làm, xác nhận.
- **Thử thách chờ xác nhận:** video các con trong lớp nộp; thẻ level 1–9 chấm qua / không qua cho từng bạn hoặc cả lớp.

**Admin** (`/admin/training`, thêm 2 thẻ): sửa thẻ thử thách theo level (số cú, chỉ tiêu, điều kiện, cách xác nhận, mức điểm, bật/tắt); sửa thư viện drill.

## 4. Nạp dữ liệu

- 121 thẻ level 10–20 lấy đúng số trong bảng 9.1–9.3; các ô thuộc 4 câu hỏi ở mục 7 điểm 2 ghi `is_provisional = true`, admin sửa sau.
- 18 thẻ level 1–9: "Công thức cú đánh level N" và "Văn hoá level N", nội dung lấy từ ma trận 18 dòng (phụ lục B cho L1–3; L4–9 lấy từ ma trận khi anh gửi bản đầy đủ, tạm ghi theo tên dòng).
- Thư viện: các drill, 21 ngày tại nhà, thang chip, thang putt đã việt hoá ở bản thử.

## 5. Kiểm thử

- Phân quyền: phụ huynh chỉ nhập cho con mình; HLV chỉ xác nhận học viên lớp mình; tài khoản con không ghi được.
- Đủ thẻ → đúng một đề xuất `level_records` chờ duyệt, không tạo trùng; duyệt xong level tăng và bộ thẻ đổi.
- Thẻ `coach` không tự bấm được; thẻ `video_or_adult` phụ huynh xác nhận được.
- Gộp hồ sơ học viên: kết quả thử thách và đánh dấu bài về nhà đi theo.

## 6. Thứ tự làm sau khi anh duyệt

1. Migration bảng, quyền, hàm kiểm tra level, nạp thẻ và thư viện; kiểm thử; chạy staging.
2. Màn phụ huynh và tài khoản con.
3. Màn HLV.
4. Màn admin.
5. Gộp vào main (là phát hành lên app.vncentre.net).

## 7. Cần anh chốt

1. **Lên level:** Khung kho bài tập ghi "đủ thẻ thì app tự mở level tiếp theo", còn `03` mục 2.9 ghi "hệ thống không tự cấp level, HLV trưởng duyệt". **Minh đề xuất:** đủ thẻ thì tự tạo đề xuất vào hàng chờ duyệt, HLV trưởng bấm duyệt (duyệt cả loạt được).
2. **Bốn câu hỏi số liệu ở mục 9.4 Khung kho bài tập.** Minh đề xuất số tạm để chạy, admin sửa sau:
   - Level 10 tee shot, approach, pitch dùng "≥" như các level khác.
   - Chip & run level 12 từ 20–30 y: 3/5 trong 4 y (thay vì 5/5).
   - Putt xa level 10–18: vùng dừng 6 ft.
   - Putt ngắn: 5 bóng mỗi khoảng cách; level 20 giữ 2 khoảng cách như file.
3. **Ai nhập kết quả cho các con:** Minh đề xuất phụ huynh nhập trên tài khoản phụ huynh; tài khoản của con chỉ xem.
4. **Hai trụ còn lại (thành tích trên sân, văn hoá) cho level 10–20:** chưa có trên app. Minh đề xuất đợt 2 chỉ tính thẻ kỹ năng; HLV trưởng cân nhắc hai trụ kia khi bấm duyệt.
5. **Điểm cho thẻ và bài HLV giao:** đợt 2 chỉ ghi mức điểm, đợt 3 mới cộng vào ví (cộng bù cả những gì đã làm trong đợt 2). Mức mặc định Minh đề xuất: thẻ thường 10 điểm, thẻ lên level 30 điểm, bài về nhà 20 điểm, làm tại lớp 50 điểm.
