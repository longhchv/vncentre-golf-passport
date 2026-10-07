# 08 · Đợt 6 — Lớp 1-1 và giáo án riêng

Soạn 26/09/2026 theo các quyết định anh Long chốt ngày 24–26/09/2026 (câu Q1–Q4 và câu 5–22).

> **Trạng thái: ĐỦ CHI TIẾT ĐỂ BUILD.** Chỉ chạy sau khi đợt 2 và đợt 3 đã chạy thật, vì đợt này dùng lại level, kỹ năng, điểm danh, điểm thưởng và bài tự luyện của hai đợt đó.

## 1. Mục tiêu

Cho phép **HLV của VN Centre dạy 1-1** một học viên đã có trong hệ thống, và làm cho cả ba bên — HLV, phụ huynh, học viên — nhìn cùng một bức tranh:

- HLV thấy toàn bộ lộ trình của em đó (level, khoá đã học, kỹ năng đã đạt, điểm yếu còn lại) nên xây được giáo án riêng đúng chỗ cần.
- Phụ huynh thấy con học gì mỗi buổi, tiến bộ ra sao, và cùng HLV xử lý vấn đề thay vì chỉ đưa đón.
- Học viên nhận bài tập rõ ràng, làm xong được ghi nhận và cộng điểm.

## 2. Phạm vi

**Có trong đợt này**

| Nhóm | Nội dung |
|---|---|
| Chương trình 1-1 | Mở chương trình, gán HLV, mục tiêu, số buổi, thời hạn |
| Hồ sơ học viên cho HLV | Hai mức: rút gọn và đầy đủ |
| Giáo án riêng | HLV soạn, phụ huynh xem, admin duyệt nếu tính vào level |
| Lịch | Lịch trống của HLV, đặt lịch hai chiều, đổi, hủy, HLV thay thế |
| Buổi học | Bấm bắt đầu, bấm kết thúc, điểm danh, ghi thời lượng thật |
| Nhận xét | Thư viện câu gợi ý + bắt buộc một câu HLV tự viết |
| Bài tập | HLV giao bài, học viên bấm giờ làm, nộp, HLV chấm và thưởng điểm |
| Đánh giá | Phụ huynh đánh giá buổi học, học viên chọn biểu tượng cảm xúc |
| Theo dõi | Bảng theo dõi của HLV, báo cáo tự động gửi phụ huynh |

**KHÔNG có trong đợt này** (thuộc đợt 7, xem `09-dot-7-san-ket-noi-hlv.md`)

- Hồ sơ HLV công khai, chứng chỉ, thành tích thi đấu
- So sánh HLV, tìm HLV
- Bảng giá, combo, coupon, gói Coach
- HLV ngoài VN Centre
- Testimonial công khai, AI viết bài giới thiệu

Ranh giới này phải giữ chặt. Đợt 6 là công cụ nội bộ cho 20 HLV đang có. Đợt 7 mới là sàn.

## 3. Vai trò và quyền

| Vai trò | Quyền mới ở đợt 6 |
|---|---|
| **HLV** | Nhận chương trình 1-1; xem hồ sơ học viên của mình theo hai mức; soạn giáo án riêng; khai lịch trống; chạy buổi học; viết nhận xét; giao và chấm bài tập; xem bảng theo dõi |
| **HLV trưởng** | Như HLV, thêm: duyệt giáo án riêng có tính vào level; xem toàn bộ chương trình 1-1 của trung tâm |
| **Phụ huynh** | Yêu cầu mở chương trình 1-1; đồng ý cho HLV xem hồ sơ đầy đủ của con; xem và góp ý giáo án; đặt và đổi lịch; xem nhận xét sau buổi; đánh giá buổi học |
| **Học viên** | Xem giáo án và lịch của mình; làm bài tập được giao; chọn biểu tượng cảm xúc sau buổi. **Không đặt lịch, không đánh giá HLV** |
| **Admin** | Mở và đóng chương trình 1-1; duyệt yêu cầu xem hồ sơ đầy đủ; khớp lịch khi hai bên không tự khớp được; duyệt bài tập và điểm được tính vào ví chung; xử lý lỗi hẹn |

## 4. Các luồng chi tiết

### G1. Mở chương trình 1-1

Một **chương trình 1-1** là một quan hệ dạy–học giữa một HLV và một học viên, có thời hạn.

**Ba cách mở:**

1. **Phụ huynh yêu cầu**: chọn con → "Đăng ký học riêng 1-1" → chọn HLV trong danh sách HLV VN Centre (đợt 6 chỉ có HLV nội bộ) → ghi mục tiêu → gửi. Trạng thái `pending`.
2. **HLV đề xuất**: HLV thấy một em trong lớp mình cần kèm riêng → đề xuất → phụ huynh nhận thông báo và bấm đồng ý.
3. **Admin mở trực tiếp**: dùng khi đã thống nhất ngoài app.

**Admin duyệt** → trạng thái `active`. Khi duyệt, admin đặt: số buổi dự kiến, ngày bắt đầu, ngày kết thúc, có tính vào tiến độ level hay không.

**Một học viên được học 1-1 với nhiều HLV cùng lúc** (anh Long chốt câu 5). Mỗi quan hệ là một chương trình riêng, có giáo án riêng, lịch riêng, nhận xét riêng. Trên hồ sơ của em đó, các chương trình hiện song song.

**Trạng thái:** `pending` → `active` → `completed` / `cancelled` / `paused`.

### G2. HLV xem hồ sơ học viên — hai mức

Đây là chỗ nhạy cảm nhất của đợt 6. Quy tắc: **phụ huynh đồng ý trước, admin duyệt sau. Admin không được duyệt thay phụ huynh.**

| Mức | Gồm gì | Điều kiện xem |
|---|---|---|
| **Rút gọn** | Level hiện tại · số năm đã học · các chương trình đã qua (tên, không có tên trường) · mục tiêu phụ huynh ghi · khu vực · độ tuổi theo nhóm (6–8, 9–12, 13+). **Không có** họ tên đầy đủ, ảnh, ngày sinh, tên trường, tên lớp, liên hệ | Hiện **tự động** khi phụ huynh chủ động gửi yêu cầu mở chương trình với HLV đó. Không cần duyệt gì, vì chính gia đình mở lời trước |
| **Đầy đủ** | Toàn bộ hồ sơ: tên, ảnh, ngày sinh, trường, lớp, lịch sử khoá học, từng kỹ năng đã chấm, nhận xét cũ của HLV khác, điểm danh, thành tích giải | HLV bấm "Xin xem hồ sơ đầy đủ" → **phụ huynh nhận thông báo và bấm đồng ý** → **admin duyệt** → HLV xem được |

**Quy tắc bổ sung:**
- HLV chỉ xin được hồ sơ đầy đủ của học viên **đã có chương trình 1-1 `active`** với mình.
- Quyền xem hồ sơ đầy đủ **hết hiệu lực khi chương trình kết thúc**. Sau đó HLV chỉ còn thấy phần buổi học của chính mình.
- Phụ huynh **rút lại quyền bất cứ lúc nào** trong mục Tài khoản.
- Mỗi lần xem hồ sơ đầy đủ ghi một dòng nhật ký (ai, lúc nào, xem hồ sơ của em nào).

### G3. HLV soạn giáo án riêng

Giáo án riêng gồm:

- Tên, mục tiêu tổng (2–3 câu), số buổi dự kiến, thời hạn
- Danh sách **buổi** theo thứ tự; mỗi buổi có: tên, thời lượng dự kiến, các **mục tiêu buổi** (chọn từ danh mục kỹ năng của level em đó, hoặc HLV tự thêm), nội dung, dụng cụ cần
- Với mỗi mục tiêu buổi: đánh dấu có tính vào **trụ kỹ thuật** để lên level hay không

**HLV soạn nhanh:** app tự đề xuất khung giáo án dựa trên level hiện tại và các kỹ năng em đó **chưa đạt**. HLV sửa lại, không phải soạn từ giấy trắng.

**Duyệt:**
- Giáo án **không tính vào level** → phụ huynh xem là chạy được luôn.
- Giáo án **có tính vào level** → HLV trưởng duyệt trước (nối với quy tắc câu 13, xem mục G14).

**Phụ huynh** xem được toàn bộ giáo án, góp ý bằng ghi chú. Góp ý không sửa giáo án, chỉ gửi cho HLV.

### G4. Lịch trống của HLV

- HLV khai **khung giờ rảnh** theo tuần (lặp lại) và theo ngày cụ thể (ngoại lệ).
- Khai được: địa điểm, số buổi tối đa mỗi ngày, khoảng nghỉ giữa hai buổi.
- App tự chặn khung giờ đã có buổi, và khung giờ HLV đang dạy lớp thường (lấy từ đợt 2).

### G5. Đặt lịch — hai chiều

Anh Long chốt câu 8: cả hai chiều đều được; admin vào cuộc khi lệch.

**Chiều 1 — phụ huynh chọn từ lịch trống:** mở lịch HLV → chọn khung còn trống → gửi → HLV xác nhận trong 24 giờ. Không xác nhận thì yêu cầu tự hết hạn và báo cả hai bên.

**Chiều 2 — phụ huynh đề xuất giờ khác:** ghi 2–3 khung giờ mong muốn → HLV chọn một, hoặc đề xuất ngược lại.

**Khi không khớp:** app tự đề xuất **3 khung giờ gần nhất** khớp cả hai bên. Sau **2 vòng** vẫn không chốt được thì yêu cầu chuyển sang **hàng chờ của admin**, admin gọi hai bên và đặt lịch tay (anh Long duyệt câu 19).

Con số "2 vòng" và "24 giờ" admin chỉnh được.

### G6. Đổi lịch và hủy

Anh Long chốt câu 9 và câu 20.

- **Hạn báo trước: 48 giờ.** Admin chỉnh được.
- Báo trước đủ 48 giờ → đổi hoặc hủy tự do, không ghi lỗi hẹn.
- **Dưới 48 giờ** → app ghi một **lỗi hẹn** cho bên hủy, hiện trên hồ sơ nội bộ của bên đó.
- **HLV hủy** → bắt buộc chọn: đề xuất buổi bù, hoặc chuyển HLV thay thế (G7). Không được hủy trống.
- **App không thu và không trừ tiền phạt**, vì tiền nằm ngoài app. App chỉ **ghi nhận và hiển thị**; hai bên tự xử lý theo điều khoản.
- HLV có số lỗi hẹn vượt ngưỡng admin đặt (đề xuất 3 lần trong 90 ngày) → **tự động ẩn khỏi danh sách nhận chương trình mới**, chờ admin xem xét. Các chương trình đang chạy không bị ảnh hưởng.
- Phụ huynh vượt ngưỡng → app nhắc nhẹ, báo admin. Không ẩn, không phạt.

### G7. HLV thay thế

Anh Long chốt câu 10: cần **cả ba bên đồng ý**.

1. HLV chính đề xuất một HLV thay thế cho một buổi cụ thể.
2. HLV thay thế nhận thông báo → đồng ý hoặc từ chối.
3. Phụ huynh nhận thông báo → đồng ý hoặc từ chối.
4. **Đủ cả ba** → buổi chuyển sang HLV thay thế, kèm quyền xem **hồ sơ rút gọn** của em đó cho đúng buổi đó. Muốn xem đầy đủ thì theo đúng quy trình G2.
5. **Thiếu một bên** → buổi **hủy**, và tính là HLV chính hủy (lỗi hẹn theo G6 nếu dưới 48 giờ).

### G8. Chạy một buổi học

1. Trước giờ học, cả HLV và phụ huynh nhận nhắc (thời điểm admin đặt, đề xuất trước 24 giờ và trước 2 giờ).
2. HLV bấm **Bắt đầu buổi học**. App ghi giờ thật và vị trí (chỉ ghi có/không ở đúng địa điểm đã hẹn, **không lưu toạ độ**).
3. Trong buổi, HLV tick các mục tiêu buổi đã đạt, chấm kỹ năng nếu giáo án có, ghi nhanh ghi chú, chụp ảnh hoặc quay video ngắn.
4. HLV bấm **Kết thúc buổi học** → app ghi giờ kết thúc và **thời lượng thật**.
5. Màn hình kết thúc buổi yêu cầu HLV viết nhận xét (G9) rồi mới đóng được buổi.

**Điểm danh:** bấm Bắt đầu là em đó có mặt. HLV đổi được sang "vắng có báo" hoặc "vắng không báo" trong 24 giờ.

**Buổi chưa đóng sau 24 giờ** → app nhắc HLV; sau 72 giờ → báo admin.

### G9. Nhận xét sau buổi

Anh Long đồng ý ràng buộc này ở vòng trước.

App đưa **thư viện câu gợi ý**, lọc theo: mục tiêu buổi vừa tick, level của em đó, kết quả chấm. HLV bấm chọn 2–3 câu.

**Bắt buộc: ít nhất một câu do HLV tự viết.** Không viết thì không gửi được. Lý do: nhận xét 100% do máy sinh ra thì phụ huynh nhận ra ngay sau vài tuần, và mất hết giá trị của cả sản phẩm.

Nhận xét gồm 3 phần cố định:
- **Hôm nay con làm được gì** (bắt buộc)
- **Điểm cần luyện thêm** (bắt buộc)
- **Bố mẹ có thể hỗ trợ gì ở nhà** (không bắt buộc)

HLV bấm **Gửi** → phụ huynh và học viên nhận thông báo kèm nhận xét, ảnh, và bài tập được giao (nếu có).

**Không được viết trong nhận xét:** so sánh với bạn khác, nhận định về tính cách của em đó, bất cứ nội dung nào về tiền hoặc học phí.

### G10. Giao bài tập, thử thách, drill

Dùng lại thư viện bài tự luyện của đợt 3 (`04-dot-3` mục 2b và 2c), thêm phần giao riêng:

**HLV giao:** chọn bài từ thư viện hoặc tự soạn → đặt **hạn nộp** → chọn có cần bằng chứng không → gửi. Phụ huynh và học viên cùng nhận thông báo.

**Học viên làm:** mở bài → xem yêu cầu và video mẫu → bấm **Bắt đầu** → đồng hồ chạy → bấm **Hoàn thành** → nộp (kèm ảnh/video nếu bài yêu cầu).

**Trạng thái bài tập:** `đã giao` → `đang làm` → `đã nộp` → `đã chấm`. Ngoài ra: `quá hạn`, `được gia hạn`.

**Gia hạn:** học viên hoặc phụ huynh bấm xin gia hạn kèm lý do; HLV đồng ý hoặc không. Mỗi bài xin gia hạn tối đa 1 lần (admin chỉnh).

**HLV chấm:** xem bằng chứng → đánh giá đạt/chưa đạt → cộng điểm theo `phu-luc-C`, và cộng thêm **điểm thưởng khích lệ** do HLV tự chọn trong khung admin đặt (đề xuất 0–20 điểm).

**Lịch sử:** cả HLV, phụ huynh và học viên đều xem được danh sách bài đã hoàn thành, chưa hoàn thành, quá hạn, đang chờ chấm.

**HLV theo dõi theo thời gian thật:** bảng theo dõi hiện em nào đang làm bài, em nào đã nộp, thời gian làm thật là bao nhiêu. Thông báo gom **một lần mỗi ngày**, không bắn từng em một.

### G11. Phụ huynh và học viên đánh giá buổi học

- **Phụ huynh đánh giá**, không phải các con (chốt ở vòng trước). Thang 1–5 sao + ô nhận xét.
- **Học viên** chỉ chọn một biểu tượng cảm xúc về buổi học: vui / bình thường / hơi khó. Các con **không chấm điểm HLV**.
- Đánh giá **không hiện công khai ở đợt 6**. Chỉ HLV đó, HLV trưởng và admin xem được (nối với Q4).
- Đánh giá dưới 3 sao → báo HLV trưởng và admin trong ngày.
- Việc biến một nhận xét hay thành **testimonial công khai** thuộc đợt 7, và cần phụ huynh đồng ý riêng.

### G12. Bảng theo dõi của HLV

Một màn hình duy nhất, HLV mở ra thấy ngay:

- Buổi hôm nay và tuần này
- Từng học viên 1-1: level, tiến độ giáo án (đã xong mấy buổi / tổng), kỹ năng còn thiếu để lên level, bài tập đang chờ, lần học gần nhất
- Việc cần làm: buổi chưa đóng, nhận xét chưa viết, bài chưa chấm, yêu cầu đổi lịch chưa trả lời
- Cảnh báo: em nào vắng 2 buổi liên tiếp, em nào không nộp bài 2 lần liên tiếp

### G13. Báo cáo gửi phụ huynh

- **Sau mỗi buổi:** nhận xét (G9), tự động khi HLV bấm Gửi.
- **Hằng tháng:** báo cáo tiến độ chương trình 1-1 — số buổi đã học, mục tiêu đã đạt, kỹ năng mới, bài tập hoàn thành đúng hạn, điểm tích được. Gửi email + trong app.
- **Khi kết thúc chương trình:** bản tổng kết, tải PDF được.

### G14. Tính vào level và điểm thưởng

Anh Long chốt câu 13 và câu 14.

**Tính vào level:** buổi 1-1 tính vào tiến độ lên level, **chỉ khi HLV đó được VN Centre công nhận quyền chấm kỹ năng**. Cụ thể:
- HLV phải có cờ `co_quyen_cham_ky_nang = true` do admin bật.
- Giáo án riêng phải được HLV trưởng duyệt trước (G3).
- Kỹ năng chấm trong buổi 1-1 đi vào **cùng một hồ sơ** với kỹ năng chấm ở lớp thường. Không có hồ sơ song song.
- HLV không có quyền này vẫn dạy được, vẫn nhận xét được, nhưng kết quả chỉ ghi nhận trong chương trình 1-1, không đẩy vào tiến độ level.

**Điểm thưởng:** bài tập HLV 1-1 giao cộng vào **cùng một ví điểm** với hệ thống trường học, **nhưng chỉ khi bài đó đã được VN Centre phê duyệt**. Cụ thể:
- Bài lấy từ thư viện chung (đã duyệt sẵn) → cộng ngay.
- Bài HLV tự soạn → vào hàng chờ duyệt của admin. Duyệt xong mới cộng điểm; trước đó hiện "đang chờ duyệt".
- Trần điểm mỗi tuần dùng chung với trần của đợt 3, không cộng thêm trần riêng.

## 5. Quy tắc nghiệp vụ (để viết kiểm thử)

| # | Quy tắc |
|---|---|
| G-R1 | HLV chỉ xem được hồ sơ học viên có chương trình 1-1 `active` với mình |
| G-R2 | Hồ sơ đầy đủ cần **cả** phụ huynh đồng ý **và** admin duyệt. Thiếu một trong hai thì không mở |
| G-R3 | Quyền xem hồ sơ đầy đủ tự hết khi chương trình chuyển sang `completed` hoặc `cancelled` |
| G-R4 | Tài khoản học viên không đặt được lịch, không hủy được lịch, không đánh giá được HLV |
| G-R5 | Hủy hoặc đổi dưới 48 giờ ghi một lỗi hẹn cho bên thao tác; app không tính tiền |
| G-R6 | Buổi học không đóng được nếu chưa có ít nhất một câu nhận xét do HLV tự viết |
| G-R7 | Buổi chuyển HLV thay thế chỉ khi có đủ 3 xác nhận; thiếu một thì buổi hủy |
| G-R8 | Kỹ năng chấm trong buổi 1-1 chỉ đẩy vào tiến độ level khi HLV có quyền chấm và giáo án đã được HLV trưởng duyệt |
| G-R9 | Bài tập HLV tự soạn không cộng điểm cho đến khi admin duyệt |
| G-R10 | Điểm từ bài 1-1 chịu chung trần tuần với đợt 3 |
| G-R11 | Mọi lần mở hồ sơ đầy đủ ghi nhật ký, không xoá được |
| G-R12 | Một học viên có nhiều chương trình 1-1 song song; mỗi chương trình dữ liệu riêng, nhưng level và ví điểm dùng chung |

## 6. An toàn trẻ em — bắt buộc

Ba quy tắc này không có ngoại lệ, áp dụng cả đợt 6 và đợt 7:

1. **Phụ huynh là người đặt lịch.** Tài khoản học viên xem được lịch, không đặt được, không đổi được.
2. **Không có tin nhắn riêng giữa HLV và học viên.** Mọi trao đổi đi qua nhận xét buổi học và ghi chú giáo án, phụ huynh luôn nhìn thấy. App không có hộp thư riêng hai người.
3. **Thông báo về một buổi học luôn gửi cho phụ huynh**, kể cả khi học viên là người thao tác.

Thêm:
- Ảnh và video trong buổi 1-1 chỉ phụ huynh của em đó, HLV của chương trình đó và admin xem được. Không vào thư viện ảnh chung.
- Vị trí buổi học chỉ lưu "đúng điểm hẹn hay không", không lưu toạ độ.

## 7. Tiêu chí nghiệm thu đợt 6

1. Phụ huynh gửi yêu cầu mở chương trình 1-1 → admin duyệt → HLV thấy hồ sơ rút gọn, chưa thấy tên đầy đủ và ảnh.
2. HLV xin hồ sơ đầy đủ → phụ huynh đồng ý → admin duyệt → HLV thấy đủ. Kiểm tra nhật ký có ghi.
3. Phụ huynh rút quyền → HLV mất quyền xem ngay trong lần tải trang kế tiếp.
4. HLV soạn giáo án có tính vào level → HLV trưởng chưa duyệt thì kỹ năng chấm không đẩy vào tiến độ level.
5. Phụ huynh chọn khung giờ trống → HLV xác nhận → buổi vào lịch cả hai bên, cả hai nhận nhắc trước 24 giờ và 2 giờ.
6. Phụ huynh đề xuất giờ lệch → app đề xuất 3 khung → sau 2 vòng không chốt → yêu cầu vào hàng chờ admin.
7. Hủy trước 48 giờ → không ghi lỗi hẹn. Hủy trước 10 giờ → ghi lỗi hẹn, không trừ tiền.
8. HLV hủy và đề xuất HLV thay thế → thiếu xác nhận của phụ huynh → buổi hủy, lỗi hẹn ghi cho HLV chính.
9. HLV đủ 3 lỗi hẹn trong 90 ngày → tự ẩn khỏi danh sách nhận chương trình mới, chương trình đang chạy vẫn nguyên.
10. HLV bấm Bắt đầu và Kết thúc → thời lượng thật được ghi; thử đóng buổi mà chỉ chọn câu gợi ý, không tự viết → hệ thống chặn.
11. HLV gửi nhận xét → phụ huynh và học viên nhận thông báo; kiểm tra học viên không nhận thông báo sau 21:00.
12. HLV giao bài có hạn → học viên bấm Bắt đầu, Hoàn thành, nộp ảnh → HLV chấm đạt → điểm vào đúng ví chung, chịu trần tuần.
13. HLV tự soạn một bài mới và giao → điểm hiện "đang chờ duyệt", admin duyệt xong mới cộng.
14. Một học viên có 2 chương trình 1-1 với 2 HLV → mỗi HLV chỉ thấy buổi và nhận xét của mình, không thấy của HLV kia; level và ví điểm chung.
15. Tài khoản học viên thử đặt lịch và thử đánh giá HLV → bị chặn.
16. Chương trình chuyển sang `completed` → HLV mất quyền xem hồ sơ đầy đủ, vẫn xem được buổi học cũ của chính mình.

## 8. Dữ liệu (thêm vào mục 12 của `01-du-lieu.md`)

| Bảng | Trường chính |
|---|---|
| `coaching_programs` | student_id, coach_id, status, goal, planned_sessions, start_date, end_date, counts_toward_level (bool), created_by, approved_by |
| `profile_access_grants` | program_id, coach_id, student_id, level (`summary`, `full`), guardian_consented_at, admin_approved_at, revoked_at |
| `lesson_plans` | program_id, title, goal, status (`draft`, `submitted`, `approved`, `rejected`), approved_by, counts_toward_level |
| `lesson_plan_items` | plan_id, order, title, duration_min, content, equipment, skill_ids (JSON), counts_toward_level |
| `coach_availability` | coach_id, weekday hoặc specific_date, start_time, end_time, location, max_sessions_per_day, buffer_min |
| `bookings` | program_id, plan_item_id (nullable), requested_by, proposed_slots (JSON), status (`requested`, `confirmed`, `rescheduled`, `cancelled`, `admin_queue`), scheduled_at, location, round_count |
| `booking_substitutions` | booking_id, substitute_coach_id, main_coach_ok, substitute_ok, guardian_ok, resolved_at, outcome |
| `sessions_1to1` | booking_id, started_at, ended_at, actual_minutes, attendance (`present`, `absent_notified`, `absent`), at_agreed_location (bool), closed_at |
| `session_notes` | session_id, suggested_phrases (JSON), coach_written_text (**bắt buộc, không rỗng**), what_went_well, what_to_improve, home_support, sent_at |
| `session_media` | session_id, type, url, visible_to (JSON) |
| `assignments` | program_id, student_id, drill_id (nullable), custom_title, custom_content, due_at, requires_evidence, points_base, status, approved_by (khi HLV tự soạn) |
| `assignment_attempts` | assignment_id, started_at, completed_at, actual_seconds, evidence_url, submitted_at, graded_at, graded_by, result, bonus_points, extension_granted |
| `session_feedback` | session_id, guardian_rating (1–5), guardian_comment, student_emoji (`happy`, `ok`, `hard`), created_at |
| `reliability_events` | actor_user_id, role, booking_id, type (`late_cancel`, `no_show`), occurred_at |

**Ràng buộc quan trọng ở tầng dữ liệu:**
- `session_notes.coach_written_text` không được rỗng.
- `profile_access_grants` mức `full` phải có **cả** `guardian_consented_at` và `admin_approved_at`.
- Kỹ năng chấm trong buổi 1-1 ghi vào đúng bảng kỹ năng của đợt 2, kèm `source = '1to1'` và `session_id`. Không tạo bảng kỹ năng song song.

## 9. Hạng tài khoản HLV — trường dữ liệu phải có từ đợt này

Xem đầy đủ ở `00-tong-quan.md` mục 7b. Ở đợt 6 chỉ cần làm hai việc:

1. **Tạo trường `coach_plan`** trên hồ sơ HLV (`standard` / `coach`), kèm nguồn (`paid` / `partnership`) và ngày hết hạn. Toàn bộ HLV VN Centre và HLV Dự án đặt mặc định là `coach`.
2. **Tạo bảng `plan_features` và `plan_limits`** cùng màn hình admin bật/tắt, nhưng **chưa chặn ai cả** — mọi kiểm tra hạn mức trả về "còn hạn". Phần thu phí và phần chặn bật ở đợt 7.

Làm hai việc này ngay từ đợt 6 thì sang đợt 7 không phải viết lại phân quyền.

**Lằn ranh áp dụng ngay từ đợt 6:** nhận xét sau buổi, thông báo cho phụ huynh, tiến độ và hồ sơ của con **không bao giờ phụ thuộc vào hạng tài khoản của HLV**. Viết kiểm thử cho điều này.

## 10. Việc cần chuẩn bị trước khi build

- **Thư viện câu nhận xét** theo kỹ năng và mức độ (Minh soạn, HLV trưởng duyệt) — đây là thứ quyết định chất lượng của cả đợt.
- Bộ **mẫu giáo án 1-1** cho Level 1–5.
- Quy định nội bộ về lỗi hẹn và buổi bù, để điều khoản trong app khớp với điều khoản ngoài đời.
