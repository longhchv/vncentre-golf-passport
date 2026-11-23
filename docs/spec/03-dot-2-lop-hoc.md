# 03 · Đợt 2 — Lớp học và buổi học

Phiên bản: **v1.0** · Ngày: 24/10/2026 · Người soạn: Minh · Chủ sản phẩm duyệt: Vũ Anh Long

> **Trạng thái: ĐỦ CHI TIẾT ĐỂ BUILD.** Bản này nâng khung đã chốt ngày 19/09/2026 lên mức chi tiết, theo đúng cách trình bày của `02-dot-1-nen-tang.md`.
>
> **Quy ước đánh số của file này:** luồng đánh **BH1, BH2…** (BH = buổi học), quy tắc nghiệp vụ đánh **BH-R1, BH-R2…**. Hai dãy này không trộn với: `F` (đợt 1), `E` (module sự kiện), `G` (đợt 6), `CT` (module chuyến thi đấu), `D` / `B` (phụ lục D), và các nhóm thông báo `P` / `H` / `S` / `T` / `A` / `K` / `M` ở phụ lục F. **Không đổi số đã phát** — code và kiểm thử trỏ tới các mã này.
>
> Chỗ nào ghi **(ĐX)** là Minh đề xuất, chưa được anh Long duyệt. Chỗ nào ghi **(D5x)** là việc còn mở, xem phụ lục D.

---

## 1. Mục tiêu đợt 2

Đợt 1 làm được việc **ghi nhận** học viên. Đợt 2 làm được việc **dạy và theo dõi**.

1. HLV vận hành từng buổi học trên điện thoại, ngay tại sân, trong vài phút: buổi đã có sẵn theo lịch, điểm danh một chạm, ghi nhận kỹ năng và ứng xử.
2. Phụ huynh thấy ba thứ mà hôm nay app chưa trả lời được: **con có đi học không · hôm nay con học gì · con tiến bộ đến đâu**.
3. Việc lên level chạy đúng quy trình ba trụ, có bằng chứng, không ai tự cấp level cho ai.
4. Nhà trường thấy chuyên cần và tiến độ của trường mình.

**Thước đo đợt 2 thành công:** một HLV dạy lớp GDTC 100 em chốt xong điểm danh và nhật ký ứng xử trong **dưới 2 phút**; một HLV lớp CLB 12 em chốt xong cả điểm danh, kỹ năng và nhận xét trong **dưới 6 phút**.

---

## 2. Phạm vi

### Có trong đợt 2

| Nhóm | Nội dung |
|---|---|
| Buổi học | Lịch lặp của lớp, sinh buổi tự động, ngày nghỉ, sửa và huỷ buổi, buổi bù, chốt buổi |
| Điểm danh | Hai chế độ (lớp đông / lớp nhỏ), quét QR sổ Passport, phụ huynh báo nghỉ trước, chạy được khi mất mạng |
| Nội dung buổi | 18 dòng nội dung của level, "Hôm nay con học gì" cho phụ huynh |
| Kỹ năng (trụ 1) | 5 mảng kỹ thuật, 3 cách chấm, hồ sơ kỹ năng chung của học viên qua mọi lớp |
| Passport checklist | Số hoá các mục tick trong First Passport; HLV tick mục kỹ năng, con và phụ huynh tick mục giá trị, HLV xác nhận |
| Mốc thành tích (trụ 2) | Admin khai báo mốc, HLV ghi kết quả vòng chơi |
| Văn hoá – ứng xử (trụ 3) | Nhật ký hành vi theo buổi (mặc định "Tốt", chỉ ghi ngoại lệ), danh mục tiêu chí admin chỉnh |
| Hai bài kiểm tra | Lý thuyết trên app (chọn hình, đọc thành tiếng), thực hành (HLV chấm tại lớp hoặc qua video YouTube) |
| Lên level | Tự tính "đủ điều kiện", HLV đề xuất, HLV trưởng duyệt cả loạt, phát chứng nhận level |
| Nhận xét | Nhận xét lớp theo buổi, nhận xét cá nhân theo buổi / tháng / cuối khoá, thư viện câu gợi ý (phụ lục H) |
| Ảnh, video | Ảnh buổi học (nén ở máy), video dán link YouTube, tôn trọng đồng ý chụp ảnh |
| Tự theo dõi | Skills check (9 mục trên 10) và phiếu điểm vòng chơi bản gọn |
| Báo cáo | Chuyên cần theo lớp và theo trường, tiến độ level, số buổi dạy của từng HLV (xuất Excel) |
| Thông báo | **Lớp gửi tin chung và bảng `notification_types`** (trả nợ quy tắc 10 của README), thông báo đẩy Web Push, nhóm P10–P17, H4–H8, H11, S1, S2, T3 |

### Không có trong đợt 2

- Điểm thưởng, kho quà, bảng xếp hạng, giải đấu — **đợt 3**. Đợt 2 **ghi lại đủ sự kiện** để đợt 3 tính bù về sau (xem BH-R18).
- Gói Premium và thanh toán Premium — **đợt 4**. Đợt 2 chỉ đọc cờ Premium để quyết định hiện hay ẩn, chưa bán.
- Bài tập tự luyện, buổi tập thể lực — **đợt 3**.
- Thư viện trò chơi — **đợt 5**.
- Lớp 1-1 và giáo án riêng — **đợt 6**.
- Các trang tự theo dõi còn lại của Passport (tiếp xúc bóng, hướng đánh, thử thách 30 ngày, tốc độ đầu gậy, khoảng cách từng gậy) — bản sau.
- Vai trò Kế toán (xem **B16**). Báo cáo buổi dạy xuất Excel để admin dùng tay.

---

## 3. Sơ đồ màn hình

Chỉ ghi phần **thêm vào** so với đợt 1. Màn hình đợt 1 giữ nguyên.

### 3.1 HLV (`/coach`)

| Đường dẫn | Màn hình |
|---|---|
| `/coach` | Thêm khối **Lịch dạy hôm nay**: danh sách buổi hôm nay (giờ, lớp, địa điểm, trạng thái điểm danh), nút vào thẳng điểm danh |
| `/coach/classes/:classId` | Thêm tab **Buổi học** (danh sách buổi, trạng thái), tab **Kỹ năng** (ma trận học viên × kỹ năng của level lớp), tab **Nhận xét**, tab **Ảnh** |
| `/coach/sessions/:sessionId` | **Màn chạy buổi** — màn quan trọng nhất của đợt 2. Xem mục BH2, BH3 |
| `/coach/sessions/:sessionId/skills` | Chấm kỹ năng cho buổi |
| `/coach/sessions/:sessionId/behavior` | Nhật ký ứng xử của buổi |
| `/coach/sessions/:sessionId/media` | Thêm ảnh, dán link YouTube |
| `/coach/students/:studentId` | Thêm tab **Kỹ năng** (đã đạt / chưa đạt theo 5 mảng), **Mốc thành tích**, **Hai bài kiểm tra**, **Nhận xét** |
| `/coach/eligibility` | **Hàng chờ lên level** — HLV trưởng: danh sách em đủ điều kiện, duyệt cả loạt hoặc trả lại kèm lý do |
| `/coach/reports` | Chuyên cần lớp mình, tiến độ level; HLV trưởng thấy cả trung tâm |

### 3.2 Trợ giảng (`/coach`, vai trò `assistant`)

Thấy đúng những màn trên nhưng: **điểm danh được, đăng ảnh được, ghi nhật ký ứng xử được**; **không** chấm kỹ năng, **không** ghi mốc thành tích, **không** chấm bài thi, **không** đề xuất lên level, **không** viết nhận xét cá nhân.

### 3.3 Giáo viên thể chất nhà trường (`/coach`, vai trò `pe_teacher`)

Như HLV nhưng chỉ trong lớp của trường mình, và **không** duyệt lên level (level luôn do HLV trưởng hoặc admin duyệt — `00-tong-quan.md` mục 6.6). **Chấm kỹ năng thì được** — anh Long chốt 24/10/2026 (D70); ở Tiểu học Phương Mai chính giáo viên nhà trường là người dạy theo giáo án.

### 3.4 Phụ huynh (`/app`)

| Đường dẫn | Màn hình |
|---|---|
| `/app` | Thẻ **Buổi gần nhất của con**: ngày, có mặt hay vắng, "Hôm nay con học gì" (2–3 dòng) |
| `/app/children/:studentId/sessions` | Lịch sử buổi học: ngày, có mặt / vắng / có phép, nội dung buổi. **Luôn miễn phí** |
| `/app/children/:studentId/skills` | Tiến độ 5 mảng kỹ thuật của level đang học: đã đạt mấy / tổng. **Luôn miễn phí** |
| `/app/children/:studentId/passport` | Passport checklist: mục con tự tick, mục chờ HLV xác nhận |
| `/app/children/:studentId/tests` | Bài kiểm tra lý thuyết (mở bài, xem lịch sử) và bài thực hành (nộp link YouTube) |
| `/app/children/:studentId/comments` | Nhận xét. Nhận xét lớp theo buổi và nhận xét cá nhân cuối khoá **luôn miễn phí**; theo buổi và theo tháng là Premium (chốt 24/10/2026, D71) |
| `/app/children/:studentId/media` | Ảnh, video buổi học — Premium |
| `/app/children/:studentId/self` | Skills check và phiếu điểm vòng chơi do con hoặc phụ huynh tự nhập |
| Nút **Báo con nghỉ buổi tới** | Trên thẻ buổi sắp tới, chọn buổi và lý do ngắn |

### 3.5 Học viên (`/me`)

Thêm: buổi học của mình, tiến độ kỹ năng, Passport checklist (tick được mục `student`), làm bài kiểm tra lý thuyết, Skills check. Vẫn **không có trang Tài khoản** (**B13**).

### 3.6 Quản lý trường (`/school`)

Thêm `/school/attendance` (chuyên cần toàn trường theo lớp, theo tuần, theo tháng) và `/school/progress` (số em theo level, số em lên level trong kỳ). Không thấy liên hệ phụ huynh (**R8**), không thấy nhận xét cá nhân, không thấy ảnh.

### 3.7 Admin (`/admin`)

Thêm vào menu: **Buổi học** (tra cứu, sửa buổi bất kỳ), **Kỹ năng** (danh mục `skills` theo level), **Mốc thành tích**, **Tiêu chí ứng xử**, **Ngân hàng câu hỏi**, **Bài thực hành**, **Ngày nghỉ**, **Thư viện câu nhận xét**, **Báo cáo buổi dạy**. Tất cả dùng `CrudTable` đang có.

---

## 4. Các luồng chi tiết

### BH1. Lịch lặp của lớp và sinh buổi tự động

**Lịch lặp** lưu ở `classes.schedule_rule` (JSON):

```json
{
  "weekdays": [2, 4],
  "start_time": "15:15",
  "duration_min": 45,
  "location": "Sân sau nhà thể chất",
  "exceptions": [
    { "date": "2026-11-20", "action": "skip", "reason": "Nghỉ 20/11" },
    { "date": "2026-11-25", "action": "move", "new_date": "2026-11-27", "new_time": "16:00" }
  ]
}
```

- `weekdays` theo cách gọi Việt Nam: 2 = thứ Hai … 7 = thứ Bảy, 8 = Chủ nhật. **Không** dùng 0–6 để tránh nhầm khi đọc dữ liệu.
- Một lớp có **một** lịch lặp. Lớp học hai khung giờ khác nhau trong tuần vẫn mô tả được bằng `weekdays` nhiều ngày cùng `start_time`; khung giờ khác nhau theo ngày thì tách thành hai lớp (ĐX).

**Sinh buổi:** một việc chạy theo lịch `pg_cron` mỗi ngày **00:30 giờ Việt Nam** sinh buổi cho `session.generate_weeks_ahead` tuần tới (mặc định 8, admin chỉnh).

Quy tắc sinh:
1. Chỉ sinh trong khoảng `[classes.start_date, classes.end_date]` và khi `classes.status = 'active'`.
2. Không sinh vào ngày có trong bảng `holidays` áp cho trường đó, trừ khi lịch lặp ghi `action: "force"` cho đúng ngày ấy.
3. Không sinh trùng: khoá duy nhất `(class_id, session_date, start_time)` khi `deleted_at` trống.
4. Buổi sinh ra ở trạng thái `planned`, `content_row_id` trống.
5. Khi đổi `schedule_rule`, chỉ **buổi tương lai chưa có điểm danh** được sinh lại; buổi đã qua và buổi đã có điểm danh giữ nguyên (BH-R2).

**Trạng thái buổi** (`sessions.status`):

| Trạng thái | Nghĩa | Chuyển sang |
|---|---|---|
| `planned` | Đã sinh, chưa đến giờ | `open`, `cancelled` |
| `open` | Trong ngày diễn ra buổi (từ 00:00 giờ VN của ngày đó) | `completed`, `cancelled` |
| `completed` | HLV đã **chốt** buổi | — (sửa trong cửa sổ BH-R6) |
| `cancelled` | Huỷ, **bắt buộc có lý do** | — |
| `missed` | Quá `session.auto_missed_days` ngày (mặc định 7) vẫn chưa chốt; cron đánh dấu | `completed` (admin mở lại) |

**Sửa buổi (HLV của lớp):** đổi giờ, đổi ngày, đổi địa điểm, đổi dòng nội dung, huỷ buổi kèm lý do, **thêm buổi bù** (`is_makeup = true`, trỏ `makeup_for_session_id`).

**Không xoá buổi.** Buổi đã có điểm danh chỉ huỷ được, và bản ghi điểm danh giữ nguyên để tra cứu, nhưng **không** tính vào chuyên cần (BH-R3).

### BH2. Điểm danh — lớp nhỏ (`tick_list`)

Áp dụng khi `classes.attendance_mode = 'tick_list'`. Mặc định cho lớp có số học viên **dưới** `attendance.large_class_threshold` (mặc định 20, admin chỉnh); admin và HLV trưởng đổi được cho từng lớp.

Màn chạy buổi:
1. Đầu màn: tên lớp, ngày, giờ, **dòng nội dung hôm nay** (app gợi ý dòng kế tiếp chưa dạy, HLV đổi được).
2. Danh sách học viên, mỗi em một dòng: ảnh nhỏ, tên, level. Mỗi dòng ba nút lớn: **Có mặt · Vắng · Có phép**.
3. Mặc định mọi em ở trạng thái `unmarked` — màu xám, không tính là gì cả.
4. Em nào phụ huynh đã **báo nghỉ trước** thì hiện sẵn **Có phép** kèm lý do phụ huynh ghi; HLV đổi được.
5. Nút **Chốt điểm danh** chỉ bật khi **không còn em nào `unmarked`**. Đây là chốt chặn để không ai điểm danh hú hoạ cả lớp.
6. Chốt xong: buổi thành `completed`, ghi `closed_at`, `closed_by`; mới gửi thông báo vắng (BH5) và mới tính chuyên cần.

### BH3. Điểm danh — lớp đông (`absent_only`)

Áp dụng cho lớp GDTC trường công, có thể vài chục đến hơn trăm em. Màn hình phải mở được danh sách 150 em dưới 2 giây trên 4G.

1. Hiện **ô tìm theo tên** ở trên cùng (bỏ dấu, không phân biệt chữ hoa) và **lọc theo lớp văn hoá** (`enrollments` → `students.grade_class`).
2. Danh sách em, **mặc định coi như có mặt**. HLV chỉ tick em **vắng** (một chạm) hoặc **có phép**.
3. Đầu màn luôn hiện bộ đếm: **Vắng: 3 · Có phép: 1 · Còn lại có mặt: 96**.
4. Nút **Chốt điểm danh** bật ngay (không cần tick hết), nhưng:
   - Nếu HLV chốt mà **không tick em nào vắng**, app hỏi lại một lần: *"Chốt cả lớp 100 em đều có mặt?"* — tránh bấm nhầm (ĐX).
   - Chốt xong, hệ thống ghi một dòng `attendance` cho **từng** em (`present` cho em không bị tick), không để trống — để báo cáo và đợt 3 tính điểm được.
5. `attendance.marked_by` = HLV chốt; `method` = `list`.

### BH4. Điểm danh bằng quét QR sổ Passport

Dùng cho lớp CLB và lớp ngoài trường, nhất là khi các con tự xếp hàng vào sân.

1. HLV mở màn quét từ buổi đang `open`. Dùng lại `QrScanner.tsx` của đợt 1.
2. Quét mã sổ → hệ thống tra `passports.passport_code`:
   - Em **thuộc lớp này** (`enrollments.status = 'active'`): hiện **tên + ảnh** to, đánh `present`, phát một tiếng "tách". HLV nhìn mặt xác nhận. `method = 'qr'`.
   - Em **không thuộc lớp này**: báo *"Em này không có trong lớp"*, **không** hiện thêm thông tin gì (giữ **R8** — HLV không được xem dữ liệu học viên lớp khác).
   - Mã chưa gán học viên: báo và mời dùng luồng **F2** của đợt 1.
3. Quét lại cùng một em: báo *"Đã điểm danh 15:17"*, không tạo bản ghi mới (BH-R5).
4. Quét xong vẫn phải bấm **Chốt điểm danh**; em chưa quét được xử lý theo chế độ của lớp.

**Mất mạng:** màn điểm danh và màn quét chạy được khi không có mạng. Thao tác xếp vào hàng chờ trong máy (IndexedDB), hiện băng vàng *"Đang chờ gửi: 12 thao tác"*, tự gửi khi có mạng. Khi gửi, nếu cùng một em đã có bản ghi từ thiết bị khác thì **bản ghi có `marked_at` sớm hơn thắng**, bản sau ghi vào nhật ký, không báo lỗi cho HLV (BH-R7).

### BH5. Báo vắng cho phụ huynh

- Chỉ gửi khi buổi đã `completed` **và** em ở trạng thái `absent`. **Không** gửi cho `excused` (phụ huynh đã biết).
- Kênh theo phụ lục F: **P10** lớp nhỏ (Zalo + app + đẩy) · **P11** lớp đông (app + đẩy + email). Cách chọn kênh theo `classes.attendance_mode`, không theo số em tại thời điểm gửi.
- Một phụ huynh có nhiều con cùng vắng trong ngày: **gom một tin**.
- Nội dung chỉ gồm: tên con, tên lớp, ngày, giờ buổi, và câu mời xem chi tiết trong app. **Không** kèm ghi chú của HLV — ghi chú là để nội bộ, gửi thẳng cho phụ huynh dễ thành lời phán xét.
- Trần số tin và giờ im lặng theo phụ lục F mục 7.

### BH6. Nội dung buổi học — "Hôm nay con học gì"

- Mỗi level có **18 dòng nội dung** (phụ lục B mục 1) → bảng `level_content_rows`.
- `sessions.content_row_id` trỏ tới dòng đang dạy. App gợi ý dòng kế tiếp chưa dạy của lớp đó; HLV đổi, hoặc chọn **Ôn tập** (dòng đã dạy lại).
- **Bắt buộc có `content_row_id` mới chốt được buổi** (BH-R4). Đây là một chạm, nhưng là thứ duy nhất giúp phụ huynh biết con học gì.
- Phụ huynh thấy: tên dòng nội dung + `summary_vi` 2–3 dòng. **Luôn miễn phí** — đây là "tiến độ học của con" trong lằn ranh mục 7b của `00-tong-quan.md`.
- HLV viết thêm **nhận xét lớp** 1–2 dòng cho buổi (`sessions.class_note`) — không bắt buộc, phụ huynh thấy miễn phí.

### BH7. Chấm kỹ năng — trụ 1

**Danh mục.** `skill_areas` gồm 7 mảng: 5 mảng kỹ thuật (`grip_setup`, `putting`, `chipping`, `pitching`, `full_swing`) cộng `culture` và `rules` dùng cho trụ 3. `skills` là từng kỹ năng của một level trong một mảng, seed từ **phụ lục B mục 2** cho Level 1–3.

**Cách chấm lấy theo lớp, không theo kỹ năng.** `classes.scoring_mode` (`pass_fail` / `scale_1_5` / `measured`) quyết định HLV nhập gì. Cùng một kỹ năng "Cầm gậy Trái vàng – Kết nối – Phải đỏ" được chấm Đạt/Chưa đạt ở lớp GDTC và chấm số đo ở lớp học viện — đó là chủ ý, vì điều kiện lớp khác nhau.

| Cách chấm | HLV nhập | Coi là Đạt khi |
|---|---|---|
| `pass_fail` | Đạt / Chưa đạt | chọn Đạt |
| `scale_1_5` | 1 · 2 · 3 · 4 · 5 | ≥ `skill.pass_scale_min` (mặc định 3, lấy từ `app_settings`) |
| `measured` | một số (kèm đơn vị của kỹ năng) | so với `skill.threshold_value` theo `skill.threshold_direction` (`gte` hoặc `lte`) |

`threshold_direction` phải có, vì có kỹ năng càng ít càng tốt (số cú putt), có kỹ năng càng nhiều càng tốt (số cú vào đích).

**Màn chấm.** Vào từ buổi học hoặc từ tab Kỹ năng của lớp. Hiện **ma trận học viên × kỹ năng của level lớp**, cuộn ngang. Mỗi ô một chạm. HLV chấm được cho nhiều em cùng một kỹ năng (chấm theo cột, nhanh hơn khi cả nhóm vừa tập một bài).

**Giữ toàn bộ lịch sử.** `skill_assessments` **không ghi đè**: mỗi lần chấm là một dòng mới. Nhờ vậy xem được tiến bộ theo thời gian và không mất bằng chứng. Trang hồ sơ hiện lần chấm mới nhất; biểu đồ tiến bộ hiện cả chuỗi.

**Hồ sơ kỹ năng chung của học viên.** Một kỹ năng coi là **đã đạt** khi có **ít nhất một** lần chấm `is_passed = true` ở **bất kỳ lớp nào** — kể cả lớp trại hè, lớp của trường khác (`00-tong-quan.md` mục 6.6). Bảng tổng hợp `student_skill_status` lưu `first_passed_at`, `first_passed_class_id`, `first_passed_by` để tra lại. Không bao giờ hạ một kỹ năng đã đạt xuống chưa đạt bằng một lần chấm thấp hơn sau đó (BH-R9) — kỹ năng đã làm được là đã làm được; HLV thấy cả chuỗi và tự hiểu.

**Ai chấm được:** HLV (`coach`), HLV trưởng (`head_coach`), và **giáo viên thể chất (`pe_teacher`) trong lớp của trường mình** (anh Long chốt 24/10/2026, D70). Giáo viên thể chất chấm kỹ năng được nhưng **không** duyệt lên level — level luôn do HLV trưởng hoặc admin duyệt. **Trợ giảng không chấm kỹ năng** — đây là quyết định đã chốt của anh Long.

### BH8. Passport checklist số hoá

Số hoá các mục tick in trong sổ First Golf Passport, để điểm và bằng chứng không nằm riêng trên giấy.

`passport_items` chia nhóm theo `group`:

| `group` | Nội dung | `who_ticks` |
|---|---|---|
| `skill` | Cầm gậy, setup; mỗi cú đánh gồm "hoàn thành công cụ" và "hoàn thành cú" | `coach` |
| `value` | 10 giá trị | `student` |
| `culture` | 5 văn hoá | `student` |
| `ready_transition` | 12 mục "sẵn sàng chuyển sang golf truyền thống" (trang 30) | `coach` |

**Luồng:**
- Mục `who_ticks = 'coach'`: HLV tick → `status = 'confirmed'` ngay, `confirmed_by` = chính HLV đó.
- Mục `who_ticks = 'student'`: con hoặc phụ huynh tick → `status = 'pending_confirm'`. HLV thấy hàng chờ gọn theo lớp (một danh sách, tick cả loạt). Khi HLV xác nhận → `confirmed`. Từ chối → `rejected` kèm ghi chú ngắn.
- **Điểm chỉ tính sau khi `confirmed`** — nhưng đợt 2 **không** cộng điểm. `confirmed_at` được ghi lại để đợt 3 tính bù (BH-R18).
- Một mục chỉ tick một lần cho mỗi học viên: khoá duy nhất `(student_id, item_id)`.

**Kỹ năng học ở trại hè:** không cần cơ chế riêng. Lớp trại hè là một `classes` bình thường; `skill_assessments` và `passport_item_ticks` ở lớp đó đã cộng vào hồ sơ chung theo BH7.

### BH9. Nhật ký văn hoá – ứng xử — trụ 3

**Nguyên tắc: mặc định cả lớp "Tốt".** Không có dòng nào trong `behavior_logs` nghĩa là em đó ứng xử tốt buổi ấy. HLV chỉ ghi ngoại lệ. Mục tiêu: **khoảng 1 phút mỗi buổi** cho cả lớp.

`behavior_criteria` — danh mục admin chỉnh. **Anh Long duyệt danh mục này ngày 24/10/2026 (D75).** Seed:

| Mã | Loại | Tiêu chí | Mức |
|---|---|---|---|
| `safety_first` | Khen | Nhắc bạn giữ an toàn, giữ khoảng cách khi bạn đánh | — |
| `help_friend` | Khen | Giúp bạn, hướng dẫn bạn | — |
| `tidy_up` | Khen | Chủ động thu dọn dụng cụ, sửa vết trên green | — |
| `greet_thanks` | Khen | Chào hỏi, nói cảm ơn, xin lỗi đúng lúc | — |
| `honest_score` | Khen | Tự khai điểm trung thực, kể cả khi điểm xấu | — |
| `persist` | Khen | Kiên trì làm lại sau khi đánh lỗi | — |
| `focus` | Khen | Tập trung, nghe hướng dẫn, không làm ồn khi bạn đánh | — |
| `dress_right` | Khen | Trang phục đúng, gọn gàng | — |
| `late` | Nhắc | Đến muộn, vào sân khi lớp đã bắt đầu | 1 |
| `forget_gear` | Nhắc | Quên dụng cụ, quên nước | 1 |
| `noisy` | Nhắc | Nói chuyện khi bạn đang đánh | 1 |
| `leave_mess` | Nhắc | Không thu dọn, bỏ rác lại | 2 |
| `unsafe` | Nhắc | Vung gậy khi có bạn ở gần, không giữ khoảng cách an toàn | 3 |
| `unkind` | Nhắc | Trêu, nói lời làm bạn buồn | 3 |
| `dishonest_score` | Nhắc | Khai điểm không đúng | 3 |

Bỏ dần hay thêm tiêu chí là việc của admin. **Mức (severity)** chỉ có ở loại Nhắc: 1 = nhắc nhẹ · 2 = cần lưu ý · 3 = nghiêm trọng.

**Màn ghi:** danh sách em, nút **Khen** và **Nhắc** mỗi dòng; bấm vào mở danh sách tiêu chí (chọn một), ô ghi chú ngắn không bắt buộc.

**Phụ huynh thấy gì:**
- **Khen** → thấy ngay, có thông báo **P16**, và con nhận **S2**.
- **Nhắc mức 1** → **không** thông báo, **không** hiện riêng; chỉ vào thống kê nội bộ của HLV.
- **Nhắc mức 2–3** → hiện trong **bản tin tuần P17** bằng câu chữ trung tính, kèm gợi ý nhà cùng làm gì; **không** gửi thông báo đẩy. Anh Long chốt 24/10/2026 (D72).

Lý do cách làm này: một lỗi nhỏ của con mà bắn thông báo ngay về điện thoại bố mẹ thì dễ thành một buổi tối nặng nề ở nhà, và HLV sẽ ngừng ghi để tránh phiền. Gom vào bản tin tuần giữ được dữ liệu mà không biến app thành công cụ tố giác.

**Điều kiện đạt trụ 3** (phụ lục B mục 3): **không có ghi nhận Nhắc mức 3** trong `behavior.pillar3_lookback_sessions` buổi gần nhất (mặc định 4) **và** bài kiểm tra lý thuyết của level đạt từ `quiz.pass_percent` (mặc định 80%).

### BH10. Mốc thành tích trên sân — trụ 2

`milestones` do **admin khai báo**, không viết cứng. Mỗi mốc gồm: level, loại sân (`snag` / `real`), số hố, bộ tee, điểm mục tiêu so với par, và giới hạn số gậy tối đa mỗi hố (nếu có).

Lộ trình đã chốt: SNAG 3 → 6 → 9 hố · sân thật 6 → 9 → 18 hố · rồi 2 / 3 / 4 vòng. Bảng mốc cụ thể cho Level 1–3: **phụ lục G** (Minh soạn 24/10/2026, chờ anh Long duyệt).

`milestone_results`: student_id, milestone_id, played_on, course_name, strokes_total, vs_par, is_passed, recorded_by, source (`coach` / `tournament` / `guardian`), evidence_note, witnessed_by.
- `source = 'coach'`: HLV ghi tại lớp → tính ngay.
- `source = 'guardian'`: phụ huynh tự khai → `is_passed` để trống, vào hàng chờ HLV xác nhận. **Không tính vào trụ 2 khi chưa xác nhận** (BH-R11).
- `source = 'tournament'`: đợt 3 tự ghi từ kết quả giải. Đợt 2 để sẵn giá trị, chưa dùng.

**Đạt trụ 2 của một level** = có ít nhất một `milestone_results.is_passed = true` ứng với một mốc **`kind = 'standard'`** của level đó.

Mỗi level có **một mốc chuẩn** (`standard`) — bắt buộc cho trụ 2 — và có thể có thêm **mốc nâng cao** (`stretch`): không bắt buộc, chỉ để ghi nhận và cộng điểm ở đợt 3. Bảng cụ thể cho Level 1–3 ở **phụ lục G**.

### BH11. Bài kiểm tra lý thuyết — làm trên app

Dành cho các con từ 6 tuổi, nên hình thức quan trọng hơn nội dung.

**Ngân hàng câu hỏi** `question_banks` (theo level) + `questions`:
- `kind`: `image_choice` (chọn 1 trong 2–4 **hình**) hoặc `text_choice` (chọn 1 trong 2–4 câu ngắn). **Ưu tiên `image_choice`**; không có câu nào buộc đọc đoạn văn dài.
- Song ngữ: `stem_vi` / `stem_en`, mỗi đáp án có `label_vi` / `label_en` và `image_path` (kho công khai `question-images`).
- `explain_vi` / `explain_en`: giải thích hiện sau khi làm xong.

**Nút đọc câu hỏi thành tiếng:** dùng **Web Speech API có sẵn trong trình duyệt** (`speechSynthesis`), không cần dịch vụ ngoài, không tốn tiền. Máy nào không có giọng tiếng Việt thì ẩn nút. Đây là lựa chọn có chủ ý để không phát sinh chi phí hằng tháng.

**Làm bài:**
1. Mỗi lần lấy **ngẫu nhiên 10 câu** từ ngân hàng của level (`quiz.questions_per_attempt`). Ngân hàng dưới 15 câu thì chưa cho mở bài, báo admin.
2. Đạt từ **80%** (`quiz.pass_percent`). Chưa đạt thì làm lại sau **24 giờ** (`quiz.retry_cooldown_hours`).
3. `quiz_attempts` ghi: danh sách `question_ids` đã lấy, từng câu trả lời (`quiz_answers`), điểm, đạt hay chưa, **`opened_by_user_id` và `opened_by_role`** (`student` hay `guardian`) — đã chốt trong khung.
4. Chỉ **lần đạt đầu tiên** tính vào điều kiện lên level; các lần sau lưu để xem lại.
5. Có thông báo **P14** cho phụ huynh.

**Nếu ngân hàng câu hỏi chưa có** (việc **D20** chưa xong): app vẫn build và chạy được — nút làm bài ẩn, và điều kiện `quiz_ok` của level đó tính là **chưa đạt**; HLV trưởng có quyền **miễn** điều kiện này cho một học viên kèm lý do, ghi nhật ký (BH-R13). Không được để một việc nội dung chặn cả đợt build.

### BH12. Bài kiểm tra thực hành

`practical_exams`: level_id, area_id (một trong 5 mảng kỹ thuật), name_vi/en, criteria_vi/en, max_score, pass_score.

Hai cách:
- **Chấm tại lớp:** HLV mở màn chấm, nhập điểm theo từng mảng. `exam_submissions.mode = 'in_class'`.
- **Qua video:** phụ huynh dán **link YouTube** (`mode = 'video'`). Không tải file lên — tiết kiệm dung lượng và tránh lưu video trẻ em trên hệ thống.
  - Chỉ nhận link dạng `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…`.
  - Màn nộp hiện **lời nhắc rõ ràng**: *"Hãy đặt video ở chế độ **Không công khai (Unlisted)** trong YouTube. Đừng đặt Công khai."* Đây là bảo vệ các con, không phải việc tuỳ chọn.
  - HLV chấm từ xa, nhập điểm theo mảng, viết nhận xét.

`exam_results`: submission_id, score_by_area (JSON), total_score, is_passed, graded_by, graded_at, comment. Có thông báo **P14**.

Nếu chưa có bài thực hành nào cho level: xử lý như BH11 — `practical_ok` chưa đạt, HLV trưởng miễn được kèm lý do.

### BH13. Đủ điều kiện lên level và duyệt

**Hệ thống tính, con người quyết.** Hệ thống **không bao giờ tự cấp level** — đã chốt.

`level_eligibility` (một dòng cho mỗi học viên × level đang học):

| Cột | Nghĩa |
|---|---|
| `pillar1_ok` | Đạt **tất cả** kỹ năng của 5 mảng ở level đó (theo `student_skill_status`) |
| `pillar2_ok` | Có một `milestone_results.is_passed` của một mốc `standard` của level đó |
| `pillar3_ok` | Không có Nhắc mức 3 trong 4 buổi gần nhất **và** `quiz_ok` |
| `quiz_ok` | Đạt bài lý thuyết của level (hoặc được miễn) |
| `practical_ok` | Đạt bài thực hành của level (hoặc được miễn) |
| `sessions_counted` / `sessions_required` | Số buổi **có mặt** đã tích / số buổi tối thiểu theo loại lớp |
| `missing` (JSON) | Danh sách mục còn thiếu, để hiện cho HLV và phụ huynh |
| `status` | `not_eligible` · `eligible` · `proposed` · `approved` · `rejected` |

**`sessions_required`** lấy từ `class_types.sessions_per_level` (`00-tong-quan.md` mục 6.5). Học viên học **nhiều lớp cùng hướng tới một level** thì **cộng dồn** số buổi có mặt của mọi lớp có `target_level_id` bằng level đó — anh Long chốt 24/10/2026 (D73). Nếu không cộng dồn thì em học cả GDTC chính khoá và CLB sẽ bị tính thiếu.

**Tính lại khi nào:** ngay sau mỗi lần chấm kỹ năng, ghi mốc, chốt buổi, chấm bài thi; cộng thêm một lần chạy lại toàn bộ hằng đêm (bắt lỗi lệch).

**Luồng duyệt:**
1. Đủ cả 6 điều kiện → `status = 'eligible'`, hiện nhãn **"Đủ điều kiện lên Level N"** trên hồ sơ. Phụ huynh nhận **P15**. HLV của lớp nhận thông báo gom tuần **H11** cho các em *sắp* đủ (còn thiếu 1 mục).
2. HLV của lớp bấm **Đề xuất** → `proposed`. (HLV trưởng duyệt được thẳng từ `eligible`, không cần chờ đề xuất.)
3. HLV trưởng vào `/coach/eligibility`: chọn nhiều em, bấm **Duyệt cả loạt**. Trả lại thì **bắt buộc có lý do**, mỗi em một dòng — không trả lại cả loạt bằng một lý do chung (học từ **B11**).
4. Khi duyệt:
   - Tạo `level_records` (bảng của đợt 1): `completed` + `approved` → `students.current_level_id` tự lên theo **R5**.
   - Tạo một dòng `course_history` nguồn `system` nếu lớp đã kết thúc.
   - Phát **chứng nhận hoàn thành level** nếu HLV trưởng chọn (dùng lại **F9** của đợt 1).
   - Thông báo: phụ huynh (nhóm P, loại "con lên level"), con nhận **S1** có hình chú rồng linh vật, HLV đề xuất nhận **H8**.
   - Ghi sự kiện `level_up` để đợt 3 cộng 200 điểm (BH-R18).
5. Trả lại → `rejected`, HLV nhận **H7** kèm lý do. Em đó tính lại từ đầu khi có dữ liệu mới.

### BH14. Nhận xét của HLV

Có **hai loại nhận xét khác nhau**. Anh Long chốt cách tách ngày **24/10/2026** (việc **D71**); `00-tong-quan.md` mục 7 đã được sửa cho khớp.

**1. Nhận xét lớp theo buổi — luôn miễn phí**

`sessions.class_note`, 1–2 dòng cho cả lớp. Không bắt buộc. Phụ huynh nào cũng thấy. Cùng với dòng nội dung ở BH6, đây là câu trả lời cho *"hôm nay con học gì"*.

**2. Nhận xét cá nhân** — `coach_comments`

| Cột | Ghi chú |
|---|---|
| `student_id`, `class_id` | |
| `period` | `session` · `month` · `course` (cuối khoá) |
| `session_id` | chỉ khi `period = 'session'` |
| `suggested_text` | câu HLV chọn từ thư viện (phụ lục H), có thể sửa |
| `coach_written_text` | **bắt buộc không rỗng** |
| `by_area` (JSON) | nhận xét theo từng mảng kỹ thuật, tuỳ chọn |
| `visibility` | `all` · `premium` |
| `status` | `draft` · `published` |
| `author_user_id`, `published_at` | |

**Quy tắc `coach_written_text` bắt buộc không rỗng** là quy tắc giống đợt 6 (`session_notes.coach_written_text`). Thư viện câu gợi ý để HLV **nhanh hơn**, không để HLV **khỏi nghĩ**. Một nhận xét gồm toàn câu máy chọn thì phụ huynh đọc là biết, và giá trị của app mất ngay từ đó.

**Ai thấy gì:**

| Loại | Phụ huynh Free | Phụ huynh Premium |
|---|---|---|
| Nhận xét lớp theo buổi | Có | Có |
| Nhận xét cá nhân **cuối khoá** | **Có** | Có |
| Nhận xét cá nhân theo buổi, theo tháng | Không (thấy có, không mở được) | Có |

Nhận xét cuối khoá luôn miễn phí vì nó là một phần hồ sơ của con: nó đi vào chứng nhận hoàn thành level và sau này vào hồ sơ học bổng ở đợt 4. Khoá nó sau paywall là chạm vào lằn ranh ở `00-tong-quan.md` mục 7b. **Anh Long chốt 24/10/2026 (D71)** — bảng gói dịch vụ ở mục 7 của file 00 đã tách thành ba dòng cho khớp.

**Thư viện câu gợi ý:** `comment_phrases` — mảng kỹ năng, mức độ (`needs_work` / `on_track` / `strong`), level áp dụng, `text_vi` / `text_en`, nhóm (`technique` / `attitude` / `progress` / `next_step`), admin chỉnh. Nội dung seed: **phụ lục H**.

### BH15. Ảnh và video buổi học

`media`: class_id, session_id, kind (`photo` / `youtube`), storage_path hoặc youtube_url, caption, uploaded_by, created_at, status (`active` / `hidden`), và `media_subjects` (media_id, student_id) — danh sách em có trong ảnh.

- **Ảnh:** nén ở máy người dùng xuống ≤ 1600px cạnh dài (dùng lại `lib/compressImage.ts` của đợt 1), lưu kho **riêng tư** `session-media`, tải qua link có hạn.
- **Video:** chỉ dán **link YouTube**, không tải file. Cùng lời nhắc đặt chế độ Không công khai như BH12.
- HLV và **trợ giảng** đều đăng được.

**Đồng ý chụp ảnh — quy tắc chặt:** với trường có `requires_photo_consent = true`, một ảnh chỉ hiển thị khi **mọi** em được gắn trong `media_subjects` đều có `consents` loại `photo` đang hiệu lực. Thiếu một em thôi thì ảnh ở trạng thái `hidden`, không ai trong phụ huynh thấy (BH-R14).

Cách làm ngược lại — hiện ảnh cho gia đình các em đã đồng ý — nghe tiết kiệm hơn nhưng vẫn là phát tán hình một em chưa được phép, cho người ngoài gia đình em đó. Không làm.

Màn đăng ảnh nhắc HLV gắn tên các em trong ảnh, và cảnh báo ngay nếu có em chưa đồng ý.

**Dung lượng:** đợt 2 **đo và hiện** mức dùng của từng HLV (`plan_usage`); **chưa chặn**. Chặn theo hạn mức là việc của đợt 7.

### BH16. Tự theo dõi — Skills check và phiếu điểm vòng chơi

Bản số hoá hai trang của Passport. Con hoặc phụ huynh tự nhập; HLV nhập được khi chấm tại lớp.

**`skills_checks`:** student_id, checked_on, 9 mục tính trên 10 — `tee_shot`, `approach`, `pitch`, `chip_run`, `bunker`, `short_putt`, `mid_putt`, `long_putt`, `overall`; `entered_by_user_id`, `entered_by_role` (`student` / `guardian` / `coach`). Hiện biểu đồ nhện so với lần trước.

**`round_cards`** (phiếu điểm một vòng tự chơi) + **`round_card_holes`**: round_card_id, hole_no, par, strokes, putts (tuỳ chọn).
- `round_cards`: student_id, played_on, course_type (`snag` / `real`), course_name, holes (3/6/9/18), tee_name, par_total, strokes_total, entered_by_user_id, entered_by_role, `milestone_result_id` (trống được).
- Khi phiếu điểm khớp một mốc thành tích của level đang học, app **gợi ý** tạo `milestone_results` nguồn `guardian` → vào hàng chờ HLV xác nhận theo BH10.

**Lưu ý tránh làm lại:** module 12 (chuyến thi đấu) có nhóm bảng `trip_scorecards` riêng cho scorecard của sân thi đấu, chi tiết hơn (bộ tee, stroke index, pin location). Hai thứ **không** trùng nhau: `round_cards` là phiếu điểm tự theo dõi của học viên, `trip_*` là dữ liệu của một chuyến đi giải. Khi build module 12, `trip_days` nên trỏ tới `round_cards` cho phần điểm tổng thay vì tạo bảng điểm thứ hai — ghi vào câu hỏi mở của module 12.

### BH17. Báo cáo

| Báo cáo | Ai xem | Nội dung |
|---|---|---|
| Chuyên cần lớp | HLV của lớp, HLV trưởng, admin, quản lý trường (lớp của trường mình) | Tỉ lệ có mặt theo buổi, theo tuần, theo tháng; danh sách em vắng nhiều hơn `report.absence_alert_count` buổi (mặc định 3) trong tháng |
| Tiến độ level | như trên | Số em theo level, số em đủ điều kiện, số em đã lên level trong kỳ |
| Chuyên cần toàn trường | Quản lý trường, admin | Theo lớp, theo khối |
| **Số buổi dạy của HLV** | Admin, HLV trưởng, và **chính HLV đó** | HLV × tháng: số buổi đã chốt, số lớp, tổng số lượt học viên có mặt. **Xuất Excel** |

Báo cáo buổi dạy chỉ tính buổi `completed`, không tính `cancelled` và `missed`. Vai trò Kế toán chưa có (**B16**), nên admin lấy file Excel dùng tay.

### BH18. Thông báo đợt 2 và thông báo đẩy

Đợt 2 là lúc **trả nợ quy tắc 10 của README**, vì đây là đợt phát sinh nhiều loại thông báo nhất. Hiện tại bảng `notification_types` **chưa tồn tại** và module sự kiện ghi thẳng vào `notifications` — nếu để thêm vài module nữa thì sẽ không gom lại được.

**Phải làm trong đợt 2, trước các luồng khác:**

1. **Bảng `notification_types`** — danh mục lấy từ phụ lục F mục 4: code (`P10`, `H4`…), name_vi/en, channels (JSON), can_disable, phase, default_on, group.
2. **`notification_preferences`** (user_id, type_code, is_on) và **`notification_templates`** (type_code, channel, lang, subject, body) — đã có khung ở `01-du-lieu.md` mục 10.
3. **Lớp gửi tin chung**: một hàm duy nhất, mọi code nghiệp vụ gọi qua nó. Hàm kiểm tra trước khi gửi: người dùng có tắt loại này không · có đang trong giờ im lặng không · có vượt trần trong ngày không · có phải tài khoản học viên chưa được phụ huynh bật không.
4. **Chuyển những chỗ đang ghi thẳng `notifications`** (module sự kiện: `event_card_locked`…) sang đi qua lớp chung, và thêm dòng tương ứng vào `notification_types`.
5. **Thông báo đẩy Web Push (VAPID)** theo phụ lục F mục 3; bảng `push_subscriptions` đã có khung. iOS cần thêm app vào màn hình chính mới nhận được đẩy — màn hình bật thông báo phải nói rõ câu này.

**Danh mục đợt 2 cần bật:** P10, P11, P12, P13, P14, P15, P16, P17 · H4, H5, H6, H7, H8, H11 · S1, S2 · T3.

**Giờ gửi:** bản tin tuần **P17** Chủ nhật 19:00; lịch dạy **H5** 07:00 — hai giờ này đang chờ anh Long chốt (**D25**), tạm dùng theo đề xuất. Để trong `app_settings`, đổi được không cần sửa code.

**Thông báo mới thêm vào phụ lục F (D74, Minh làm 24/10/2026).** Số lấy tiếp theo số cao nhất đang có trong phụ lục F — nhóm P đang dùng tới **P26**, nhóm H tới **H13**:


| Mã đề xuất | Nội dung | Kênh | Tắt được | Đợt |
|---|---|---|---|---|
| P27 | Có mục Passport con tự tick **được HLV xác nhận** | App | Có | 2 |
| H14 | Phụ huynh **báo con nghỉ** buổi tới của lớp mình | App + đẩy | Có | 2 |
| H15 | Có **mốc thành tích phụ huynh tự khai** chờ xác nhận (gom một lần/ngày) | App | Có | 2 |
| H16 | Có **bài thực hành nộp qua video** chờ chấm | App + đẩy | Có | 2 |

---

## 5. Quy tắc nghiệp vụ tổng hợp (để viết kiểm thử)

| # | Quy tắc |
|---|---|
| BH-R1 | Không sinh trùng buổi: duy nhất `(class_id, session_date, start_time)` khi `deleted_at` trống |
| BH-R2 | Đổi `schedule_rule` chỉ sinh lại **buổi tương lai chưa có điểm danh**; buổi đã qua và buổi đã có điểm danh không đổi |
| BH-R3 | Buổi `cancelled` và `missed` **không** tính vào chuyên cần, **không** tính vào `sessions_counted`, **không** vào báo cáo buổi dạy |
| BH-R4 | Không chốt được buổi khi `content_row_id` trống |
| BH-R5 | Quét QR lần thứ hai cùng một học viên trong một buổi **không** tạo bản ghi điểm danh mới |
| BH-R6 | Sửa điểm danh sau khi chốt: HLV của lớp trong `attendance.edit_window_hours` giờ (mặc định 48) kèm lý do; sau đó chỉ HLV trưởng và admin. Mọi lần sửa ghi `audit_logs` |
| BH-R7 | Hai thiết bị cùng điểm danh một em: bản ghi có `marked_at` **sớm hơn** thắng; bản sau ghi nhật ký, không báo lỗi cho người dùng |
| BH-R8 | Lớp `tick_list` không chốt được khi còn học viên `unmarked` |
| BH-R9 | Một kỹ năng **đã đạt** thì không bị hạ xuống chưa đạt bởi lần chấm thấp hơn sau đó |
| BH-R10 | Trợ giảng (`assistant`) **không** chấm kỹ năng, **không** ghi mốc, **không** chấm bài thi, **không** đề xuất lên level, **không** viết nhận xét cá nhân |
| BH-R11 | `milestone_results` và mục Passport do phụ huynh hoặc học viên khai **không** tính vào ba trụ khi chưa có người có quyền xác nhận |
| BH-R12 | Hệ thống **không bao giờ** tự tạo `level_records`. Chỉ HLV trưởng hoặc admin duyệt mới tạo |
| BH-R13 | Miễn điều kiện `quiz_ok` hoặc `practical_ok` chỉ HLV trưởng và admin làm được, **bắt buộc có lý do**, ghi nhật ký |
| BH-R14 | Trường có `requires_photo_consent`: ảnh chỉ hiển thị khi **mọi** em trong `media_subjects` đều có đồng ý `photo` hiệu lực |
| BH-R15 | `coach_comments.coach_written_text` **không được rỗng** |
| BH-R16 | Nhận xét cá nhân **cuối khoá** (`period = 'course'`) luôn `visibility = 'all'`, không khoá sau Premium |
| BH-R17 | Mọi thông báo đi qua lớp gửi tin chung; mỗi loại có một dòng trong `notification_types`. **Không** ghi thẳng vào `notifications` từ code nghiệp vụ |
| BH-R18 | Đợt 2 **không** cộng điểm thưởng. Mọi sự kiện có điểm (có mặt, kỹ năng đạt, mục Passport được xác nhận, ứng xử tốt, đạt bài thi, lên level) phải có dấu thời gian để đợt 3 tính bù về sau |
| BH-R19 | Giới hạn và ngưỡng (ngưỡng lớp đông, cửa sổ sửa, số câu mỗi lần thi, % đạt, số buổi nhìn lại của trụ 3, số buổi tối thiểu mỗi level) **đều** lấy từ `app_settings` hoặc `class_types` |
| BH-R20 | HLV, trợ giảng, giáo viên thể chất, quản lý trường **không bao giờ** nhận SĐT hoặc email phụ huynh qua API — mở rộng **R8** của đợt 1 cho mọi API mới của đợt 2 |
| BH-R21 | Học viên không sửa được bất cứ thứ gì do HLV ghi; chỉ tick mục Passport nhóm `student`, làm bài lý thuyết, nhập Skills check và phiếu điểm của mình |
| BH-R22 | Buổi học chỉ đếm vào `sessions_counted` khi học viên ở trạng thái `present` — `excused` và `absent` không đếm |

---

## 6. Yêu cầu phi chức năng riêng của đợt 2

| Mục | Yêu cầu |
|---|---|
| Lớp đông | Màn điểm danh mở được danh sách **150 học viên dưới 2 giây** trên 4G. Chỉ tải tên, lớp văn hoá và ảnh thu nhỏ; ảnh tải dần khi cuộn |
| Mất mạng | Điểm danh, quét QR và nhật ký ứng xử **chạy được khi không có mạng**; hàng chờ lưu trong máy, tự gửi khi có mạng, hiện rõ số thao tác đang chờ |
| Một tay | Màn chạy buổi dùng được bằng **một tay ngoài sân**: nút cao tối thiểu 44px, không có thao tác kéo thả, không cần phóng to |
| Nắng | Tương phản đủ đọc ngoài trời; không dùng chữ xám nhạt trên nền trắng cho nội dung chính |
| HLV nhiều lớp | Một HLV dạy tới 8 buổi một ngày: màn **Lịch dạy hôm nay** phải xong trong một lần tải |
| Số lượng | Chịu được 1.600 học viên một trường (Tiểu học Phương Mai, GDTC 2026–2027), 40 lớp một trường, 3 buổi một tuần một lớp |
| Nhật ký | Ghi `audit_logs` cho: sửa điểm danh sau chốt, huỷ buổi, miễn điều kiện lên level, duyệt và trả lại lên level, ẩn ảnh, sửa nhận xét đã công bố |

---

## 7. Tiêu chí nghiệm thu đợt 2

Đợt 2 xong khi làm được **toàn bộ** các kịch bản sau trên môi trường thật, bằng điện thoại:

1. Admin đặt lịch lặp cho lớp CLB Tô Vĩnh Diện (thứ 3 và thứ 5, 15:15) → hệ thống sinh đủ buổi 8 tuần tới, **không** sinh vào ngày nghỉ 20/11 đã khai trong Ngày nghỉ.
2. HLV mở lớp 12 em, chọn dòng nội dung, tick 1 em vắng và 1 em có phép, chốt buổi → **dưới 6 phút** đã xong cả kỹ năng và nhận xét lớp.
3. Phụ huynh của em vắng nhận tin Zalo (**P10**) trong vòng 2 phút sau khi chốt; phụ huynh của em có phép **không** nhận tin.
4. Lớp GDTC 100 em: HLV tick 3 em vắng, chốt → **dưới 2 phút**; hệ thống ghi đủ 100 dòng `attendance`; phụ huynh nhận tin trong app và email (**P11**), không tốn tin Zalo.
5. HLV bật chế độ máy bay, quét QR 10 em, tắt chế độ máy bay → 10 bản ghi tự gửi lên, không mất, không trùng.
6. Phụ huynh bấm **Báo con nghỉ buổi tới** → HLV nhận **H14** → buổi đó em hiện sẵn **Có phép**.
7. HLV chấm kỹ năng "Công thức putt + SNAG-Brush" cho 12 em bằng thang 1–5 → em được 3 điểm hiện **Đạt**, em được 2 điểm hiện **Chưa đạt**; chấm lại lần sau 2 điểm thì kỹ năng **vẫn Đạt** (BH-R9).
8. Một em đạt kỹ năng ở lớp trại hè → mở hồ sơ em đó từ lớp CLB thấy kỹ năng đó **đã đạt**, ghi rõ đạt ở lớp nào, ngày nào.
9. Con tick 3 mục giá trị trong Passport → HLV thấy hàng chờ, xác nhận cả loạt → con và phụ huynh thấy **đã xác nhận** (**P27**); **chưa** có điểm nào được cộng.
10. HLV ghi một Khen và một Nhắc mức 1 → phụ huynh em được khen nhận **P16**; phụ huynh em bị nhắc mức 1 **không** nhận thông báo nào.
11. HLV ghi Nhắc mức 3 → em đó **mất** `pillar3_ok`; sau 4 buổi không có ghi nhận mới thì `pillar3_ok` trở lại.
12. Phụ huynh tự khai một vòng SNAG 6 hố đạt mốc → vào hàng chờ, **chưa** tính trụ 2 → HLV xác nhận → `pillar2_ok` bật.
13. Con 8 tuổi làm bài lý thuyết Level 1 trên app: 10 câu chọn hình, bấm nút đọc thành tiếng được, đạt 8/10 → **Đạt**; làm lại ngay bị chặn, báo còn 24 giờ; `quiz_attempts` ghi `opened_by_role = 'student'`.
14. Phụ huynh nộp video thực hành qua link YouTube → HLV chấm từ xa theo 5 mảng → phụ huynh nhận **P14**.
15. Một em đủ cả 6 điều kiện → hiện nhãn **Đủ điều kiện lên Level 2**, phụ huynh nhận **P15** → HLV trưởng duyệt cả loạt 5 em → `current_level_id` của cả 5 em lên Level 2, chứng nhận phát ra đúng mẫu, con nhận **S1**.
16. HLV trưởng trả lại một đề xuất kèm lý do → HLV nhận **H7** đúng lý do; em đó quay về `not_eligible`.
17. Lớp trường có `requires_photo_consent`: đăng ảnh có 4 em, trong đó 1 em chưa đồng ý → ảnh ở trạng thái ẩn, **không** phụ huynh nào thấy; sau khi em đó đồng ý thì ảnh hiện.
18. Phụ huynh gói Free mở nhận xét **cuối khoá** → **đọc được**; mở nhận xét theo tháng → thấy có nhưng khoá, mời nâng cấp.
19. Admin xuất Excel báo cáo buổi dạy tháng → đúng số buổi `completed` của từng HLV, không gồm buổi `cancelled`.
20. Nhật ký hệ thống ghi đủ: sửa điểm danh sau chốt, huỷ buổi, miễn `quiz_ok`, duyệt và trả lại lên level, ẩn ảnh.
21. Tắt thông báo **P13** trong phần cài đặt → đăng ảnh mới thì **không** nhận tin; **P15** (đủ điều kiện lên level) **không** tắt được, theo phụ lục F mục 5.
22. Kiểm tra quyền: HLV lớp A gọi API lấy buổi học của lớp B → bị từ chối; API nào cũng không trả SĐT phụ huynh (BH-R20).

---

## 8. Dữ liệu

Quy ước chung giữ nguyên theo `01-du-lieu.md` mục 1: mọi bảng có `id uuid`, `org_id`, `created_at`, `updated_at` (trigger `set_updated_at`), trigger `audit_row`, RLS **mặc định từ chối**; bảng nghiệp vụ thêm `deleted_at`; trạng thái dùng `text` + `check`; migration chỉ thêm, không đổi tên, không xoá.

Bảng này là bản chi tiết của dòng "đợt 2" trong `01-du-lieu.md` mục 12. **Mục 12 của file 01 sẽ được cập nhật sau** — hiện Claude Code đang ghi vào file đó cho module 11b.

### 8.1 Thêm cột vào bảng đã có

| Bảng | Thêm | Ghi chú |
|---|---|---|
| `classes` | `schedule_rule jsonb`, `attendance_mode text` (`tick_list` / `absent_only`), `location text` | `schedule_rule` đã có chỗ sẵn từ đợt 1 |
| `enrollments` | `sessions_attended int default 0` | đã có chỗ sẵn; đợt 2 bắt đầu tính |
| `class_types` | `sessions_per_level int` | lấy từ `00-tong-quan.md` mục 6.5 |
| `levels` | — | không đổi |
| `consents` | — | không đổi |
| `schools` | `requires_photo_consent bool default false` | nếu đợt 1 chưa có |

### 8.2 Buổi học và điểm danh

| Bảng | Cột |
|---|---|
| `holidays` | `school_id` (trống = áp cho mọi trường), `holiday_date`, `name_vi/en`, `created_by` |
| `sessions` | `class_id`, `session_date date`, `start_time time`, `duration_min`, `location`, `content_row_id` → `level_content_rows`, `class_note text`, `status` (`planned`/`open`/`completed`/`cancelled`/`missed`), `cancel_reason`, `is_makeup bool`, `makeup_for_session_id`, `closed_at`, `closed_by` → `profiles.user_id`, `generated_by` (`system`/`manual`). Duy nhất `(class_id, session_date, start_time)` khi `deleted_at` trống |
| `attendance` | `session_id`, `student_id`, `status` (`unmarked`/`present`/`absent`/`excused`), `method` (`list`/`qr`), `marked_by` → `profiles.user_id`, `marked_at`, `edited_by`, `edited_at`, `edit_reason`, `client_marked_at` (giờ trên máy khi mất mạng). Duy nhất `(session_id, student_id)` |
| `absence_notices` | Phụ huynh báo nghỉ trước: `student_id`, `session_id`, `reason text`, `notified_by` → `guardians.id`, `created_at`. Duy nhất `(student_id, session_id)` |
| `level_content_rows` | `level_id`, `row_no` (1–18), `name_vi/en`, `summary_vi/en`, `sort_order`. Seed từ **phụ lục B mục 1** cho Level 1–3 |

### 8.3 Kỹ năng

| Bảng | Cột |
|---|---|
| `skill_areas` | `code` (`grip_setup`/`putting`/`chipping`/`pitching`/`full_swing`/`culture`/`rules`), `name_vi/en`, `sort_order`, `is_technique bool` |
| `skills` | `level_id`, `area_id`, `code`, `name_vi/en`, `observe_text_vi/en` (mô tả để quan sát), `measured_unit_vi/en`, `threshold_value numeric`, `threshold_direction` (`gte`/`lte`), `threshold_text_vi/en`, `pass_scale_min smallint` (trống = lấy từ `app_settings`), `sort_order`, `is_active`. Seed từ **phụ lục B mục 2** |
| `skill_assessments` | `student_id`, `skill_id`, `class_id`, `session_id` (trống được), `mode` (`pass_fail`/`scale_1_5`/`measured`), `value_bool`, `value_scale smallint`, `value_number numeric`, `is_passed bool`, `note`, `assessed_by` → `profiles.user_id`, `assessed_at`. **Không ghi đè — mỗi lần chấm một dòng** |
| `student_skill_status` | Tổng hợp: `student_id`, `skill_id`, `is_passed`, `first_passed_at`, `first_passed_class_id`, `first_passed_by`, `last_assessment_id`, `last_value_text`. Cập nhật bằng trigger trên `skill_assessments` |

### 8.4 Passport checklist

| Bảng | Cột |
|---|---|
| `passport_items` | `tier_id` → `passport_tiers`, `page smallint`, `group` (`skill`/`value`/`culture`/`ready_transition`), `code`, `name_vi/en`, `who_ticks` (`coach`/`student`), `points smallint` (dùng ở đợt 3), `sort_order`, `is_active` |
| `passport_item_ticks` | `student_id`, `item_id`, `ticked_by` → `profiles.user_id`, `ticked_by_role` (`coach`/`student`/`guardian`), `ticked_at`, `status` (`pending_confirm`/`confirmed`/`rejected`), `confirmed_by`, `confirmed_at`, `reject_note`, `class_id` (trống được). Duy nhất `(student_id, item_id)` |

### 8.5 Văn hoá – ứng xử

| Bảng | Cột |
|---|---|
| `behavior_criteria` | `code`, `type` (`praise`/`reminder`), `name_vi/en`, `severity smallint` (1–3, chỉ cho `reminder`), `points_min`, `points_max` (đợt 3), `sort_order`, `is_active`. Seed theo bảng ở **BH9** |
| `behavior_logs` | `session_id`, `student_id`, `criteria_code`, `type`, `severity`, `note`, `logged_by` → `profiles.user_id`, `logged_at` |

### 8.6 Mốc thành tích

| Bảng | Cột |
|---|---|
| `milestones` | `level_id`, `code` (duy nhất), `kind` (`standard`/`stretch`), `course_type` (`snag`/`real`), `holes smallint`, `tee_name`, `distance_m smallint` (trống được), `par_total smallint`, `target_vs_par smallint`, `max_strokes_per_hole smallint` (trống được), `name_vi/en`, `note_vi/en`, `sort_order`, `is_active`. Seed: **phụ lục G** và `data/moc-thanh-tich.csv` |
| `milestone_results` | `student_id`, `milestone_id`, `played_on date`, `course_name`, `strokes_total smallint`, `vs_par smallint`, `is_passed bool` (trống khi chờ xác nhận), `source` (`coach`/`guardian`/`tournament`), `recorded_by`, `witnessed_by` (trống được), `confirmed_by`, `confirmed_at`, `evidence_note`, `round_card_id` (trống được) |

### 8.7 Hai bài kiểm tra

| Bảng | Cột |
|---|---|
| `question_banks` | `level_id`, `name_vi/en`, `is_active`. Duy nhất `(level_id)` khi `is_active` |
| `questions` | `bank_id`, `kind` (`image_choice`/`text_choice`), `stem_vi/en`, `options jsonb` (mỗi phần tử: `label_vi`, `label_en`, `image_path`, `is_correct`), `explain_vi/en`, `sort_order`, `is_active` |
| `quiz_attempts` | `student_id`, `level_id`, `question_ids jsonb`, `started_at`, `submitted_at`, `score smallint`, `total smallint`, `is_passed bool`, `opened_by_user_id`, `opened_by_role` (`student`/`guardian`), `lang` (`vi`/`en`) |
| `quiz_answers` | `attempt_id`, `question_id`, `chosen_index smallint`, `is_correct bool` |
| `practical_exams` | `level_id`, `area_id`, `name_vi/en`, `criteria_vi/en`, `max_score smallint`, `pass_score smallint`, `sort_order`, `is_active` |
| `exam_submissions` | `student_id`, `exam_id`, `mode` (`in_class`/`video`), `youtube_url`, `submitted_by`, `submitted_at`, `status` (`pending_grade`/`graded`/`rejected`) |
| `exam_results` | `submission_id`, `score_by_area jsonb`, `total_score smallint`, `is_passed bool`, `graded_by`, `graded_at`, `comment` |

### 8.8 Lên level

| Bảng | Cột |
|---|---|
| `level_eligibility` | `student_id`, `level_id`, `pillar1_ok`, `pillar2_ok`, `pillar3_ok`, `quiz_ok`, `practical_ok`, `sessions_ok` (bool), `sessions_counted smallint`, `sessions_required smallint`, `missing jsonb`, `status` (`not_eligible`/`eligible`/`proposed`/`approved`/`rejected`), `computed_at`, `proposed_by`, `proposed_at`, `decided_by`, `decided_at`, `reject_reason`. Duy nhất `(student_id, level_id)` |
| `requirement_waivers` | Miễn điều kiện: `student_id`, `level_id`, `requirement` (`quiz`/`practical`), `reason text` **bắt buộc**, `granted_by`, `granted_at` |

### 8.9 Nhận xét, ảnh, tự theo dõi

| Bảng | Cột |
|---|---|
| `coach_comments` | `student_id`, `class_id`, `session_id` (trống được), `period` (`session`/`month`/`course`), `period_month date` (ngày đầu tháng, khi `period = 'month'`), `suggested_text`, `coach_written_text` **not null, không rỗng**, `by_area jsonb`, `visibility` (`all`/`premium`), `status` (`draft`/`published`), `author_user_id`, `published_at` |
| `comment_phrases` | `area_id` (trống = chung), `band` (`needs_work`/`on_track`/`strong`; **trống = áp cho mọi mức**, dùng cho nhóm `next_step`), `level_from`, `level_to`, `group` (`technique`/`attitude`/`progress`/`next_step`), `text_vi/en`, `has_placeholders bool`, `sort_order`, `is_active`. Seed: **phụ lục H** và `data/cau-nhan-xet.csv` |
| `media` | `class_id`, `session_id`, `kind` (`photo`/`youtube`), `storage_path`, `youtube_url`, `caption_vi/en`, `uploaded_by`, `status` (`active`/`hidden`), `bytes bigint`, `hidden_reason` |
| `media_subjects` | `media_id`, `student_id`. Duy nhất `(media_id, student_id)` |
| `skills_checks` | `student_id`, `checked_on date`, `tee_shot`, `approach`, `pitch`, `chip_run`, `bunker`, `short_putt`, `mid_putt`, `long_putt`, `overall` (smallint 0–10), `entered_by_user_id`, `entered_by_role` |
| `round_cards` | `student_id`, `played_on date`, `course_type` (`snag`/`real`), `course_name`, `holes smallint`, `tee_name`, `par_total smallint`, `strokes_total smallint`, `entered_by_user_id`, `entered_by_role`, `milestone_result_id` (trống được) |
| `round_card_holes` | `round_card_id`, `hole_no smallint`, `par smallint`, `strokes smallint`, `putts smallint` (trống được). Duy nhất `(round_card_id, hole_no)` |

### 8.10 Thông báo (trả nợ quy tắc 10)

| Bảng | Cột |
|---|---|
| `notification_types` | `code` (`P10`, `H4`…, duy nhất), `group` (`parent`/`coach`/`student`/`school`/`admin`), `name_vi/en`, `channels jsonb` (`["app","push","zalo","email","sms"]`), `can_disable bool`, `default_on bool`, `phase smallint` (đợt), `is_active`. Seed từ **phụ lục F mục 4** |
| `notification_preferences` | `user_id`, `type_code`, `is_on`. Duy nhất `(user_id, type_code)` |
| `notification_templates` | `type_code`, `channel`, `lang`, `subject`, `body`. Duy nhất `(type_code, channel, lang)` |
| `push_subscriptions` | `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `created_at`, `last_ok_at`, `fail_count` |

### 8.11 Phân quyền (bổ sung `01-du-lieu.md` mục 13)

| Bảng | Đọc | Ghi |
|---|---|---|
| `sessions`, `attendance`, `behavior_logs`, `media` | Nhân sự của lớp (`class_staff`), HLV trưởng, admin, quản lý trường (lớp của trường mình), phụ huynh và học viên (**chỉ dòng của con mình**) | Nhân sự của lớp theo vai trò ở BH-R10; sửa sau chốt theo BH-R6 |
| `skill_assessments`, `student_skill_status` | như trên | `coach`, `head_coach`, `pe_teacher` của lớp; admin |
| `milestone_results` | như trên | ghi: nhân sự lớp và phụ huynh (nguồn `guardian`); xác nhận: `coach`, `head_coach`, admin |
| `passport_item_ticks` | phụ huynh, học viên, nhân sự lớp, admin | tick: theo `who_ticks`; xác nhận: `coach`, `head_coach` |
| `quiz_attempts`, `quiz_answers` | phụ huynh, học viên, nhân sự lớp, admin | học viên hoặc phụ huynh của chính em đó |
| `exam_submissions`, `exam_results` | như trên | nộp: phụ huynh, học viên, HLV; chấm: `coach`, `head_coach` |
| `level_eligibility` | phụ huynh, học viên, nhân sự lớp, admin | hệ thống tính; `proposed` do `coach`; `approved` / `rejected` chỉ `head_coach` và admin |
| `coach_comments` | tác giả, HLV trưởng, admin; phụ huynh và học viên theo `visibility` và gói | tác giả; HLV trưởng và admin sửa được, ghi nhật ký |
| `media` | theo BH-R14 | nhân sự lớp; ẩn: HLV trưởng, admin |
| Bảng danh mục (`skills`, `milestones`, `behavior_criteria`, `questions`, `practical_exams`, `comment_phrases`, `holidays`, `level_content_rows`, `passport_items`, `notification_types`) | mọi người đã đăng nhập | admin; `skills` và `milestones` thêm `head_coach` |

Mọi API của đợt 2 phải đi qua kiểm tra của **BH-R20**: không trả SĐT, email phụ huynh cho HLV, trợ giảng, giáo viên thể chất, quản lý trường.

---

## 9. Cấu hình mới trong `app_settings`

| Khoá | Mặc định | Nghĩa |
|---|---|---|
| `session.generate_weeks_ahead` | 8 | Sinh buổi trước mấy tuần |
| `session.auto_missed_days` | 7 | Quá bao nhiêu ngày chưa chốt thì đánh `missed` |
| `attendance.large_class_threshold` | 20 | Ngưỡng số học viên để mặc định chế độ lớp đông |
| `attendance.edit_window_hours` | 48 | HLV sửa điểm danh sau chốt trong bao lâu |
| `skill.pass_scale_min` | 3 | Thang 1–5: từ mấy trở lên là Đạt |
| `behavior.pillar3_lookback_sessions` | 4 | Số buổi nhìn lại khi xét trụ 3 |
| `behavior.pillar3_block_severity` | 3 | Mức Nhắc làm mất trụ 3 |
| `quiz.questions_per_attempt` | 10 | Số câu mỗi lần thi |
| `quiz.pass_percent` | 80 | Ngưỡng đạt |
| `quiz.retry_cooldown_hours` | 24 | Chờ bao lâu mới làm lại |
| `quiz.min_bank_size` | 15 | Ngân hàng dưới mức này thì chưa cho mở bài |
| `report.absence_alert_count` | 3 | Vắng mấy buổi một tháng thì vào danh sách cần lưu ý |
| `media.max_long_edge_px` | 1600 | Nén ảnh ở máy người dùng |
| `notify.weekly_digest_time` | `"19:00"` (CN) | Giờ gửi bản tin tuần P17 (**D25**) |
| `notify.coach_daily_time` | `"07:00"` | Giờ gửi lịch dạy H5 (**D25**) |

---

## 10. Việc còn mở riêng của đợt 2

Thêm vào phụ lục D. Số tiếp theo số cao nhất hiện có (D57).

### Đã chốt 24/10/2026 — anh Long duyệt theo đề xuất của Minh

| # | Quyết định |
|---|---|
| **D70** | **Giáo viên thể chất nhà trường được chấm kỹ năng** trong lớp của trường mình. Level vẫn do HLV trưởng hoặc admin duyệt. Lý do: ở Tiểu học Phương Mai chính giáo viên nhà trường là người dạy theo giáo án |
| **D71** | **Tách ba loại nhận xét.** Nhận xét lớp theo buổi và nhận xét cá nhân **cuối khoá**: luôn miễn phí. Nhận xét cá nhân theo buổi và theo tháng: Premium. `00-tong-quan.md` mục 7 và 7b đã sửa cho khớp |
| **D72** | **Nhắc mức 1 không gửi thông báo.** Mức 2–3 chỉ gom vào bản tin tuần **P17** bằng câu chữ trung tính, không gửi thông báo đẩy |
| **D73** | **Cộng dồn số buổi** có mặt của mọi lớp cùng hướng tới một level khi xét `sessions_ok` |
| **D74** | Đã thêm **P27, H14, H15, H16** vào `phu-luc-F` mục F4.1 và F4.2 (Minh làm 24/10/2026). Bản nháp đầu đánh số **P18** — trùng P18 đã có từ đợt 3, đã sửa thành **P27** |
| **D75** | **Danh mục 15 tiêu chí ứng xử** ở mục BH9 được duyệt nguyên bản (8 Khen, 7 Nhắc) |
| **D77** | Chốt soạn **mẫu tin Zalo** báo vắng và gửi Zalo duyệt. Mẫu tin ở `phu-luc-F` mục **F13** |

### Còn mở


| # | Việc | Ai quyết |
|---|---|---|
| D76 | **Ngưỡng Đạt dạng số đo** trong `phu-luc-B` và mốc thành tích trong `phu-luc-G` chưa ai kiểm chứng trên lớp thật. **Anh Long sẽ cho chạy thử sau** (xác nhận 24/10/2026). Trong lúc chờ app dùng số hiện có; admin chỉnh được, không cần sửa code | Anh Long, HLV trưởng |
| D26 | Gửi Zalo duyệt 5 mẫu tin ở `phu-luc-F` mục F13. Thời gian Zalo duyệt chưa biết, nên gửi càng sớm càng tốt | Anh Long gửi duyệt |

**Việc đã có số, nay được bản này gỡ chặn:**

| # | Trạng thái mới |
|---|---|
| D5 | **Xong 24/10/2026** — bảng Mốc thành tích L1–3 ở `phu-luc-G-moc-thanh-tich.md`, chờ anh Long duyệt |
| D31 | **Bản đầu xong 24/10/2026** — thư viện câu nhận xét ở `phu-luc-H-cau-nhan-xet.md`, dùng cho cả đợt 2 và đợt 6 |
| D6 | Phần "viết chi tiết đợt 2" **xong**; còn đợt 3 và 4 |
| D20 | Vẫn chờ — nhưng không còn chặn build, xem BH11 |

---

## 11. Thứ tự build đề xuất

Mỗi bước chạy thử được, dừng lại cho anh Long xem trên điện thoại rồi mới sang bước sau.

| Bước | Nội dung | Vì sao đặt ở đây |
|---|---|---|
| 1 | `notification_types` + lớp gửi tin chung + chuyển module sự kiện sang dùng lớp chung | Trả nợ trước khi sinh thêm thông báo mới. Làm sau thì phải sửa hai lần |
| 2 | `holidays`, `level_content_rows` (seed L1–3), lịch lặp, sinh buổi tự động, màn Lịch dạy hôm nay | Không có buổi thì không có gì để làm tiếp |
| 3 | Điểm danh hai chế độ, chốt buổi, sửa trong cửa sổ 48h, báo nghỉ trước | Phần dùng nhiều nhất, cần chạy thật sớm nhất |
| 4 | Quét QR điểm danh + chạy được khi mất mạng | Tách riêng vì phần mất mạng dễ sinh lỗi |
| 5 | Web Push (VAPID) + P10, P11, H4, H5, H6, H14 | Có điểm danh rồi mới có tin để gửi |
| 6 | `skill_areas`, `skills` (seed phụ lục B), chấm kỹ năng, `student_skill_status` | Trụ 1 |
| 7 | Passport checklist + hàng chờ xác nhận + P27 | |
| 8 | Nhật ký ứng xử + `behavior_criteria` + P16, S2 | Trụ 3 phần nhật ký |
| 9 | Mốc thành tích (seed phụ lục G) + `round_cards` + Skills check + H15 | Trụ 2 |
| 10 | Hai bài kiểm tra + P14 + H16 | Chạy được cả khi ngân hàng câu hỏi rỗng |
| 11 | `level_eligibility` + hàng chờ lên level + duyệt cả loạt + P15, H7, H8, H11, S1 | Cần mọi thứ trên đã xong |
| 12 | Nhận xét (hai loại) + thư viện câu (seed phụ lục H) + P12 | |
| 13 | Ảnh, video + quy tắc đồng ý + P13 | |
| 14 | Báo cáo chuyên cần, tiến độ, buổi dạy (xuất Excel) + T3 + bản tin tuần P17 | Gom cuối |
| 15 | Chạy 22 kịch bản nghiệm thu mục 7 | |
