# 00 · Tổng quan sản phẩm

## 1. Thông tin chung

| Mục | Nội dung |
|---|---|
| Tên app | **VN Centre Golf Passport** |
| Địa chỉ | `https://app.vncentre.net` |
| Chủ sản phẩm | Vũ Anh Long — Giám đốc Dự án phát triển golf trẻ R&A – VGA, VN Centre |
| Đơn vị vận hành và thu tiền | Công ty Cổ phần Phát triển và Đầu tư HCHV |
| Người build | Anh Long tự build bằng Claude Code |
| Nền tảng | Web app cài được lên màn hình điện thoại (PWA). Ổn định rồi mới đưa lên App Store và CH Play |
| Ngôn ngữ | Tiếng Việt và tiếng Anh, toàn bộ giao diện |
| Ngân sách vận hành | Dưới 1 triệu đồng/tháng giai đoạn đầu, tăng dần khi mở rộng |

## 2. App để làm gì

VN Centre đang dạy golf cho hàng nghìn học sinh qua các trường học, CLB và trại hè, nhưng **không có liên hệ trực tiếp với phụ huynh**, và **tiến trình học của từng em chưa được lưu thành hồ sơ chính thức**.

VN Centre Golf Passport giải quyết 4 việc:

1. **Thu lại liên hệ phụ huynh.** Phụ huynh vào app để nhận chứng nhận và theo dõi con, qua đó để lại số điện thoại và email.
2. **Tạo hồ sơ số chính thức cho mỗi học viên**, đi theo em suốt đời dù học ở trường nào: level, khoá đã học, kỹ năng, thành tích, chứng nhận.
3. **Cho phụ huynh thấy rõ con học gì, tiến bộ ra sao**, và giữ động lực cho các em qua điểm thưởng, quà, bảng xếp hạng.
4. **Làm nền dữ liệu cho hồ sơ xin học bổng** các trường đại học ở Mỹ và các nước. Hồ sơ kết hợp golf với học bạ, GPA, chứng chỉ ngoại ngữ.

Cuốn **Golf Passport giấy** là điểm chạm cảm xúc của các em. **Bản số trong app là bản chính thức** để xuất hồ sơ. Sổ giấy và app nối với nhau bằng mã QR riêng của từng cuốn.

## 3. Quy mô và bối cảnh

- Khoảng 1.600 học viên đang học; hè 2026 có hơn 3.500 em tham gia; khoảng 20 HLV; gần 20 trường/cơ sở; hoạt động ở Hà Nội và TP.HCM.
- Sắp tới có 1.600 học sinh Trường Tiểu học Phương Mai học 35 tiết golf trong giờ GDTC tăng cường năm học 2026–2027.
- VN Centre làm việc với nhà trường, không làm việc trực tiếp với từng gia đình. Danh sách học sinh từ trường thường thiếu số điện thoại phụ huynh.

## 4. Người dùng và vai trò

| Vai trò | Là ai | Thiết bị | Việc chính | Có từ đợt |
|---|---|---|---|---|
| **Admin trung tâm** | Nhân sự VN Centre | Máy tính | Quản trị toàn bộ: trường, lớp, học viên, sổ Passport, level, chứng nhận, người dùng, cấu hình | 1 |
| **HLV trưởng / Trưởng bộ môn** | HLV chính của VN Centre | Máy tính, máy tính bảng | Duyệt lên level, cài ngưỡng kỹ năng, duyệt dữ liệu lịch sử | 1 |
| **HLV** | ~20 HLV | Điện thoại, máy tính bảng | Đợt 1: xem học viên lớp mình. Đợt 2: điểm danh, chấm kỹ năng, nhật ký văn hoá, nhận xét, đề xuất lên level | 1 |
| **Trợ giảng** | Người hỗ trợ HLV | Điện thoại | Điểm danh, đăng ảnh. Không được duyệt kỹ năng | 2 |
| **Quản lý trường/cơ sở** | Ban giám hiệu, người phụ trách phía trường | Máy tính | Xem học sinh trường mình; nhập lịch sử khoá học (chờ duyệt); xem báo cáo chuyên cần, tiến độ cả trường | 1 |
| **Giáo viên thể chất nhà trường** | GV GDTC phối hợp | Điện thoại | Xem lớp của trường mình, điểm danh | 2 |
| **Phụ huynh / người giám hộ** | Bố, mẹ, người giám hộ | Điện thoại | Kích hoạt Passport, theo dõi con, tải chứng nhận, đổi quà, nâng cấp gói | 1 |
| **Học viên** | Từ 8 tuổi | Điện thoại, máy tính bảng | Xem hồ sơ của mình, tự tick mục giá trị, chọn quà (phụ huynh duyệt) | 1 |
| **Đối tác** | Golfzon, học viện, cửa hàng… | Điện thoại | Quét mã học viên để cộng điểm tem | 3 |
| **Ban tổ chức giải** | Nhân sự Phòng Sự kiện | Máy tính, điện thoại | Nhập kết quả chặng đấu | 3 |
| Hành chính, Kế toán | Nhân sự văn phòng | Máy tính | Đối soát thu chi, thời khoá biểu, số buổi dạy | Sau bản 2 |
| Diamond (HLV/trường ngoài) | Đơn vị thuê app để vận hành lớp riêng | Máy tính | Như một trung tâm con | Bản 2 |

Một người có thể có nhiều vai trò. Ví dụ: một HLV cũng là phụ huynh của một học viên.

## 5. Nguyên tắc sản phẩm (bắt buộc tuân thủ)

1. **Passport giấy là cảm xúc, app là bản chính thức.** Mọi dữ liệu dùng để xuất hồ sơ lấy từ app.
2. **Văn hoá golf là tiêu chí bắt buộc để lên level.** Không có ngoại lệ.
3. **Dữ liệu có 2 lớp:** phần **trung tâm xác nhận** (học golf, kỹ năng, level, thành tích giải) và phần **phụ huynh tự khai** (học bạ, chứng chỉ, hoạt động ngoài golf). Phần tự khai không cần duyệt nhưng luôn gắn nhãn "Phụ huynh tự khai" ở mọi nơi hiển thị và khi xuất hồ sơ.
4. **Mã học viên theo em cả đời.** Chuyển trường, mất sổ, lên cấp hộ chiếu mới đều không làm mất dữ liệu.
5. **Mọi con số nghiệp vụ admin chỉnh được**, không viết cứng trong code.
6. **Song ngữ Việt–Anh toàn bộ.** Có học viên quốc tế (lớp Community UNIS học bằng tiếng Anh).
7. **Mobile-first.** Phụ huynh và HLV dùng chủ yếu trên điện thoại.
8. **Tiết kiệm chi phí.** Tin Zalo chỉ dùng cho mã OTP và tin quan trọng. Tin khác gửi trong app và email. Video dán link YouTube, không lưu file video.
9. **Tự giác và trung thực là một phần của sản phẩm.** Golf là môn của sự trung thực. Các con được khuyến khích tự khai kết quả tự luyện tập; điểm cho phần tự khai ở mức vừa phải, đủ để khích lệ. Phần tính vào level thì bắt buộc có bằng chứng và HLV xác nhận.
10. **Bảo vệ dữ liệu trẻ em.** Chỉ người có quyền mới xem được dữ liệu. HLV không xem học bạ/GPA/chứng chỉ, trừ HLV được Trung tâm chỉ định và phụ huynh đồng ý chia sẻ. Mọi thao tác nhạy cảm đều ghi nhật ký.

## 6. Mô hình đào tạo

### 6.1 Các chương trình

| Chương trình | Mô tả |
|---|---|
| **Chương trình chính: Lộ trình 20 level** | 12 level trường học, 5 level nghề golf, 3 level thi đấu – quản lý golf. SNAG Golf ở các level đầu, chuyển sang gậy tiêu chuẩn từ Level 10 |
| **Trại hè (Summer Camp)** | Chương trình độc lập, giống Pre-School. Mỗi hành trình 6 buổi = hoàn thành 1 level của chương trình trại hè. Chứng nhận ghi "hoàn thành trại hè", **không** phải level chính thức trong 20 level. Kỹ năng học ở trại hè được chuyển sang Passport để tích điểm |

App phải cho admin tạo thêm chương trình khác sau này.

### 6.2 Nhóm level trong chương trình 20 level

| Nhóm | Level | Mốc |
|---|---|---|
| Basic SNAG – New Starter | 1–4 | Yêu thích golf, đạt 100% văn hoá golf |
| Advance SNAG – Master SNAG Golf | 5–9 | Phong thái golfer, sẵn sàng chơi golf truyền thống |
| Golf Intermediate Basic (HDC ≤ 26) | 10–12 | Handicap mục tiêu 38 / 30 / 25; Luật Level 1 > 80% |
| Golf Intermediate Advance | 13–17 | Handicap mục tiêu 20 / 18 / 16 / 15 / 12; SNAG Coach L1, US Kids L1, Luật L2 |
| Athlete | 18–20 | Handicap mục tiêu 10 / 8 / < 5; Luật L3; HLV L1 |

Ở bản đầu, phụ huynh thấy **bức tranh tổng thể 20 level**, còn nội dung chi tiết chỉ cần đầy đủ cho **Level 1–3**.

### 6.3 Giai đoạn Passport và cấp hộ chiếu

Mặc định ban đầu. Admin chỉnh được trong phần quản trị.

| Giai đoạn Passport | Tên | Level |
|---|---|---|
| 1 | Khơi dậy đam mê | 1–4 |
| 2 | Làm chủ kỹ thuật cơ bản với SNAG Golf | 5–9 |
| 3 | Chuyển tiếp golf truyền thống | 10 |
| 4 | Làm chủ short game | 11–12 |
| 5 | Nâng cao trình độ | 13–20 |

| Cấp hộ chiếu | Level |
|---|---|
| First Golf Passport | 1–10 |
| Player Passport | 11–17 |
| Elite Passport | 18–20 |

### 6.4 Ba trụ xét lên level (phải đạt đủ cả 3)

1. **Kỹ thuật — 5 mảng:** Grip–Setup, Putting, Chipping, Pitching, Full swing. Từ Level 11, bunker nằm trong mảng Chipping/Pitching.
2. **Thành tích trên sân — theo "Mốc thành tích":** lộ trình SNAG 3 → 6 → 9 hố, lên sân thật 6 → 9 → 18 hố, rồi thi đấu 2/3/4 vòng. Mỗi mốc gồm loại sân, số hố, bộ tee và điểm mục tiêu so với par. Admin tự khai báo các mốc (khớp được SNAG, Operation 36, US Kids).
3. **Văn hoá – ứng xử – luật:** nhật ký hành vi theo buổi (mặc định "Tốt", HLV chỉ ghi ngoại lệ), cộng bài kiểm tra luật và kiến thức theo level.

### 6.5 Loại lớp, số tiết mỗi level, cách chấm

Mặc định ban đầu. Admin chỉnh được.

| Loại lớp | Thời lượng tiết | Số tiết/level | Cách chấm kỹ năng |
|---|---|---|---|
| GDTC chính khoá (trường công) | 35–45 phút | 30–40 (khoảng 2 học kỳ) | Đạt / Chưa đạt |
| Ngoại khoá tự chọn | 35–45 phút | 30–40 | Đạt / Chưa đạt hoặc 1–5 |
| CLB trong trường (đông học sinh) | 60–90 phút | 20–24 | Thang 1–5 (từ 3 trở lên là Đạt) |
| CLB ít học sinh / golf ngoài trường cuối ngày | 60–90 phút | 20–24 | Số đo cụ thể, so với ngưỡng |
| Học viện / trung tâm cuối tuần | 60–90 phút | 20–24 | Số đo cụ thể, so với ngưỡng |
| Trại hè | Theo hành trình | 6 buổi / level trại hè | Đạt / Chưa đạt |

- Cách chấm gắn với từng lớp, admin chọn khi tạo lớp.
- Ngưỡng Đạt của kỹ năng dạng số đo do Admin và HLV trưởng cài.
- Sau này việc lên level sẽ xét cả kết quả đầu ra, không chỉ số tiết đã học.

### 6.6 Level của học viên

- **Mỗi học viên có 1 level chung.** Kỹ năng đạt ở lớp nào (chính khoá, CLB, ngoài trường…) cũng cộng vào hồ sơ chung.
- **Lên level:** HLV đề xuất → HLV trưởng duyệt.
- **Nhà trường** được nhập lịch sử khoá học. **Level** phải do Admin hoặc HLV trưởng xác nhận.
- **Dữ liệu cũ:** học sinh đã học ít nhất 1 học kỳ trước khi có app (ví dụ Tô Vĩnh Diện 2024–2026) được ghi **hoàn thành Level 1**.

## 7. Gói dịch vụ

| | Miễn phí (Free) | Premium | Diamond |
|---|---|---|---|
| Đối tượng | Mọi phụ huynh | Phụ huynh tự nâng cấp | HLV đối tác, trường tư/quốc tế, trung tâm muốn dùng app để vận hành lớp |
| Chu kỳ | — | Gia hạn hằng năm | Bản 2 |
| Theo dõi lớp, buổi học, lộ trình, kỹ năng, level | Có | Có | — |
| Chứng nhận khoá học: xem và tải PDF | Có | Có | — |
| Hồ sơ học bổng | Xem online | Xem online + **tải PDF** | — |
| Điểm thưởng và đổi quà | Có, nhưng bị treo theo chu kỳ (xem dưới) | **Tích luỹ và dùng liên tục qua các năm** | — |
| Nhận xét chi tiết của HLV | — | Có | — |
| Ảnh / video buổi học | — | Có | — |
| Giữ hồ sơ qua các năm | Có | Có | — |

**Quy tắc điểm treo (gói Free):**

- Chu kỳ 12 tháng tính từ **ngày kích hoạt tài khoản học viên**.
- Hết mỗi chu kỳ, điểm thưởng chưa tiêu chuyển thành **điểm treo**: vẫn hiển thị, không bị xoá, nhưng không đổi quà được.
- Điểm mới phát sinh trong chu kỳ sau vẫn tích và đổi quà bình thường.
- Khi nâng cấp Premium, toàn bộ điểm treo được mở khoá và cộng dồn với điểm hiện có.
- Premium hết hạn mà không gia hạn thì học viên quay về quy tắc Free, bắt đầu từ chu kỳ kế tiếp.

**Điểm xếp hạng tách riêng với điểm thưởng.** Đổi quà không làm giảm điểm xếp hạng. Chi tiết ở `04-dot-3-diem-qua-bxh.md`.

Giá các gói do admin tự nhập và chỉnh.

## 8. Lộ trình build 4 đợt

| Đợt | Phạm vi | Tài liệu |
|---|---|---|
| **1 · Nền tảng** | Tài khoản và đăng nhập; nhập danh sách và lịch sử khoá học; kích hoạt Passport; hồ sơ học viên (level hiện tại, khoá đã học, lộ trình 20 level); chứng nhận online và xác thực; quản lý sổ Passport; thu phí cấp lại sổ; quản trị cơ bản | `02` — chi tiết |
| **2 · Lớp học** | Lớp, buổi tự tạo theo lịch, điểm danh, kỹ năng 5 mảng, nhật ký văn hoá, đề xuất và duyệt lên level, nhận xét, ảnh, Skills check, scorecard | `03` — khung |
| **3 · Điểm, quà, bảng xếp hạng** | Điểm thưởng, kho quà và đổi quà, tem đối tác, giải đấu và kết quả chặng, BXH Golf Trường học Việt Nam, thu lệ phí giải và phí ship | `04` — khung |
| **4 · Gói trả phí và hồ sơ** | Premium, thanh toán thẻ, mã tặng và đổi điểm lấy Premium, hồ sơ học bổng, dữ liệu phụ huynh tự khai, thành tích giải ngoài | `05` — khung |
| **5 · Thư viện trò chơi cho HLV** | Kho trò chơi và hoạt động dạy golf, gợi ý theo buổi, HLV đóng góp, mở khoá theo gói VIP/Diamond | `07` — khung |

### Thí điểm đợt 1

| Nhóm | Dữ liệu | Mục đích |
|---|---|---|
| ① Chạy thử toàn bộ quy trình | CLB Golf Tô Vĩnh Diện (6 em, có liên hệ phụ huynh) · Community UNIS sáng thứ 7 (tiếng Anh, nhiều quốc tịch, có liên hệ) · CLB Vinschool Harmony (5–6 em, **không có** liên hệ phụ huynh) | Kích hoạt, hồ sơ, chứng nhận; song ngữ; trường hợp chỉ kích hoạt bằng mã. Dùng **decal mã dán tạm** vào sổ |
| ② Nhập dữ liệu cũ | TH Tô Vĩnh Diện: danh sách 2 năm học 2024–2025 và 2025–2026 | Nhập hàng loạt, dựng level và lịch sử khoá học |
| ③ Mở rộng khi ① ổn | TH Phương Mai: ~1.200 em CLB hè (có thông tin phụ huynh), sau đó 1.600 em GDTC 2026–2027 | Chịu tải số đông, gửi lời mời kích hoạt hàng loạt |
| Để sau | Trại hè Vinschool Hành trình 1 (có tên, lớp, không có SĐT) | Kích hoạt bằng mã in trên chứng nhận |

## 9. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| Học viên | Người học golf, thường là học sinh |
| Người giám hộ | Phụ huynh hoặc người được phụ huynh uỷ quyền theo dõi học viên. Một học viên có nhiều người giám hộ; một người giám hộ có nhiều học viên |
| Golf Passport / sổ | Cuốn hộ chiếu golf giấy. 3 cấp: First, Player, Elite |
| Mã học viên | Mã định danh công khai, vĩnh viễn của học viên. Ví dụ `VNC-000123` |
| Mã sổ | Mã riêng của từng cuốn sổ, in bằng QR. Lần quét đầu tiên dùng để kích hoạt, sau đó chỉ còn là mã định danh |
| Mã kích hoạt | Mã bí mật dùng một lần để phụ huynh nối tài khoản với học viên. Có thể là mã sổ hoặc mã in trên chứng nhận giấy |
| Mã lớp | Mã 6 ký tự HLV gửi trong nhóm Zalo lớp, dùng khi phụ huynh tự tìm con |
| Level | Cấp độ trong chương trình |
| Giai đoạn | 1 trong 5 giai đoạn phát triển in trong Passport |
| Lớp | Một lớp học cụ thể trong một năm học, ví dụ "CLB Golf Tô Vĩnh Diện 2026–2027" |
| Buổi | Một tiết/buổi học của lớp |
| Lịch sử khoá học | Bản ghi một khoá học viên đã học, gồm cả khoá trước khi có app |
| Chứng nhận | Giấy chứng nhận hoàn thành khoá, level, trại hè, giải đấu |
| Mã xác thực | Mã trên chứng nhận để người ngoài kiểm tra thật hay giả |
| Điểm thưởng | Điểm dùng để đổi quà |
| Điểm treo | Điểm thưởng gói Free quá chu kỳ, bị khoá cho đến khi nâng cấp |
| Điểm xếp hạng | Điểm dùng cho bảng xếp hạng, không bị trừ khi đổi quà |
| Mùa giải, chặng | Mùa giải gồm nhiều chặng đấu |
| Tem đối tác | Điểm cộng khi học viên tham gia hoạt động tại đối tác, đối tác xác nhận bằng cách quét mã |

## 10. Nhận diện thương hiệu

| Mục | Quy định |
|---|---|
| Logo | Logo VN Centre. Logo "Dự án phát triển golf trẻ R&A – VGA" phải đi kèm **tên gọi đầy đủ**. VN Centre đã được phép dùng; dự án được 2 đơn vị duyệt và ra mắt ngày 06/02/2024 |
| Màu chính | Navy `#080634` (nền đậm, chữ chính) · Vàng đồng `#B06829` chuyển sang vàng sáng `#F9C74F` (nút chính, huy hiệu) · Nâu `#6A3A16` (chữ logo). Mã màu trích gần đúng từ logo; thay bằng mã gốc khi có file nhận diện |
| Màu giai đoạn | Vàng, Cam, Đỏ theo các phần màu của First Passport |
| Font | Be Vietnam Pro (giao diện). Chứng nhận dùng font có chân giống mẫu hiện tại |
| Linh vật | Chú rồng trong Passport. Tên chính thức chưa chốt. Dùng ở màn hình chào, trạng thái trống, huy hiệu, thông báo chúc mừng |
| Giọng văn | Ấm áp, khích lệ, rõ ràng. Với phụ huynh: lịch sự, ngắn gọn. Với các em: vui, dễ hiểu |
