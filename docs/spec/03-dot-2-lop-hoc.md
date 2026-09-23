# 03 · Đợt 2 — Lớp học

> **Trạng thái: KHUNG ĐÃ CHỐT, CHƯA ĐỦ CHI TIẾT ĐỂ BUILD.** Các quyết định dưới đây là của anh Long, dùng làm căn cứ khi viết chi tiết. Claude Code **không** build đợt này cho đến khi file được cập nhật lên bản chi tiết.

## 1. Mục tiêu

HLV dùng app để vận hành từng buổi học. Phụ huynh thấy con đi học, tiến bộ kỹ năng và được lên level đúng quy trình 3 trụ.

## 2. Các quyết định đã chốt

### 2.1 Buổi học
- App **tự tạo buổi** theo lịch lặp của lớp. Ví dụ: thứ 3 và thứ 5 hằng tuần, 15h15.
- HLV sửa được khi nghỉ lễ hoặc đổi lịch.
- Mỗi buổi gắn với dòng nội dung trong 18 dòng của level. Phụ huynh xem tóm tắt 2–3 dòng "Hôm nay con học gì".

### 2.2 Người tham gia
- Một lớp có nhiều HLV.
- Vai trò **Trợ giảng**: điểm danh, đăng ảnh; **không** duyệt kỹ năng.
- **Giáo viên thể chất nhà trường**: xem lớp của trường mình và **được điểm danh**.
- **Quản lý trường**: xem báo cáo chuyên cần và tiến độ cả trường.
- Báo cáo số buổi dạy của từng HLV, xuất Excel (để kế toán tính công sau này).

### 2.3 Điểm danh
- **Lớp đông** (trường công, có thể hàng chục đến cả trăm em): mặc định tất cả có mặt, HLV chỉ tick em **vắng**.
- **Lớp dưới 20 em** (CLB, lớp ngoài trường): HLV tick danh sách hoặc **quét QR sổ Passport**.
- Báo phụ huynh khi con vắng:
  - Lớp dưới 20 em: gửi qua **Zalo**.
  - Lớp đông: gửi **trong app + email**, để tiết kiệm chi phí.

### 2.4 Kỹ năng — trụ 1
- 5 mảng: Grip–Setup, Putting, Chipping, Pitching, Full swing.
- Cách chấm gắn với lớp:
  - Đạt / Chưa đạt.
  - Thang 1–5, **từ 3 trở lên là Đạt**.
  - Số đo, so với ngưỡng do **Admin và HLV trưởng** cài.
- Kỹ năng đạt ở lớp nào cũng cộng vào hồ sơ chung của học viên.
- Danh mục kỹ năng L1–3: theo `phu-luc-B` sau khi anh Long duyệt.

### 2.5 Passport checklist số hoá
- Các mục tick trong First Passport: cầm gậy, setup; mỗi cú gồm "hoàn thành công cụ" và "hoàn thành cú"; 10 giá trị; 5 văn hoá; 12 mục "sẵn sàng chuyển golf truyền thống"…
- **HLV** tick mục kỹ năng.
- **Học viên hoặc phụ huynh** tự tick mục giá trị; điểm chỉ được cộng sau khi HLV xác nhận.
- Kỹ năng học ở **trại hè** được chuyển sang Passport để tích điểm.

### 2.6 Thành tích trên sân — trụ 2
- Dùng khung "Mốc thành tích": loại sân (SNAG / sân thật) + số hố + bộ tee + điểm mục tiêu so với par.
- Admin tự khai báo các mốc.
- Lộ trình: SNAG 3 → 6 → 9 hố → sân thật 6 → 9 → 18 hố → 2/3/4 vòng.
- Bảng mốc cụ thể cho L1–3: Minh đề xuất sau, anh Long duyệt.

### 2.7 Văn hoá – ứng xử — trụ 3
- Nhật ký hành vi theo buổi: **mặc định cả lớp "Tốt"**, HLV chỉ ghi ngoại lệ (khen / nhắc), khoảng 1 phút mỗi buổi.
- Kèm bài kiểm tra luật và kiến thức theo level.

### 2.8 Bài kiểm tra cuối level (bổ sung 19/09/2026)

**Bài kiểm tra lý thuyết — làm trên app**
- Ngân hàng câu hỏi theo từng level, song ngữ Việt–Anh.
- **Dạng câu hỏi hợp với các con 6–8 tuổi:** chọn hình, có nút đọc câu hỏi thành tiếng. Hạn chế câu hỏi phải đọc đoạn văn dài.
- Mỗi lần thi lấy ngẫu nhiên 10 câu từ ngân hàng của level đó.
- **Đạt từ 80%**. Chưa đạt thì làm lại sau 24 giờ.
- Lưu lịch sử từng lần làm bài; ghi rõ bài do học viên hay phụ huynh mở.
- Minh soạn nháp ngân hàng câu hỏi theo từng level, anh Long duyệt.

**Bài kiểm tra thực hành**
- Cách 1: HLV chấm trực tiếp tại lớp.
- Cách 2: phụ huynh quay video, nộp qua app bằng **link YouTube**, HLV chấm từ xa.
- Kết quả chấm theo từng mảng trong 5 mảng kỹ thuật của level.

### 2.9 Lên level
- HLV đề xuất → HLV trưởng duyệt.
- Phải đạt đủ 3 trụ.
- Số tiết/level theo loại lớp (admin chỉnh).
- **Tự động tính "đủ điều kiện lên level":** khi học viên đã đạt đủ 3 trụ, đạt bài lý thuyết và bài thực hành, và đủ số buổi tối thiểu, hệ thống tự gắn nhãn "Đủ điều kiện lên Level N". HLV trưởng chỉ bấm duyệt, duyệt được cả loạt. Hệ thống **không tự cấp level**.
- Khi duyệt: cộng điểm lên level, phát chứng nhận level (nếu chọn), gửi thông báo cho phụ huynh.

### 2.10 Nhận xét và ảnh
- Nhận xét HLV theo buổi, theo tháng hoặc cuối khoá, tuỳ khoá.
- Nhận xét chi tiết là quyền lợi **Premium**.
- Ảnh/video: nên có, nhất là lớp từ 10 em trở xuống. HLV và trợ giảng chụp, đăng.
  - **Video dán link YouTube**, không tải file lên.
  - Trường có `requires_photo_consent` thì chỉ hiển thị với học viên đã có đồng ý.
  - Ảnh/video là quyền lợi **Premium**.

### 2.11 Tự theo dõi
- Bản đầu số hoá **Skills check** (tee shot, approach, pitch, chip & run, bunker, short/mid/long putt tính trên 10) và **scorecard trên sân**.
- Các trang tự theo dõi khác của Passport (tiếp xúc bóng, hướng, thử thách 30 ngày, tốc độ đầu gậy, khoảng cách từng gậy) để bản sau.

## 3. Việc cần làm trước khi viết chi tiết
- Anh Long duyệt `phu-luc-B` (kỹ năng L1–3 và ngưỡng).
- Minh đề xuất bảng Mốc thành tích L1–3.
- Chốt mẫu tin Zalo báo vắng.
- Chốt tiêu chí nhật ký văn hoá (danh sách hành vi khen / nhắc).
- Minh soạn nháp ngân hàng câu hỏi lý thuyết L1–3 (dạng chọn hình) để anh Long duyệt.
