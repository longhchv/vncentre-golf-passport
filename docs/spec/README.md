# VN Centre Golf Passport — Bộ tài liệu mô tả yêu cầu

Phiên bản: **v1.0** (sửa lần 2) · Ngày: 24/10/2026 · Người soạn: Minh (R&D đào tạo golf) · Chủ sản phẩm duyệt: Vũ Anh Long

**Sửa lần 2 (24/10/2026):** anh Long chốt thêm **D73** (cộng dồn số buổi qua nhiều lớp cùng level), **D75** (duyệt 15 tiêu chí ứng xử), **D77** (mẫu tin Zalo báo vắng); **D76** anh sẽ cho chạy thử sau. Minh làm xong **D74** (thêm P27, H14–H16 vào `phu-luc-F`) và **D26** (soạn 5 mẫu tin Zalo ZNS, mục **F13** của `phu-luc-F`, kèm giới hạn kỹ thuật và hai rủi ro khi gửi duyệt).

**Sửa lần 1 (24/10/2026):** anh Long chốt ba việc **D70, D71, D72**. Giáo viên thể chất nhà trường **được chấm kỹ năng** trong lớp của trường mình (level vẫn do HLV trưởng duyệt). Nhận xét tách thành **ba dòng**: nhận xét lớp theo buổi và nhận xét cá nhân **cuối khoá** luôn miễn phí, nhận xét theo buổi và theo tháng là Premium — `00-tong-quan.md` mục 7 và 7b đã sửa cho khớp. Nhắc mức 1 **không** gửi thông báo; mức 2–3 chỉ gom vào bản tin tuần P17.

**Mới ở v1.0:** `03-dot-2-lop-hoc.md` được nâng từ khung lên **đủ chi tiết để build** (18 luồng BH1–BH18, 22 quy tắc BH-R1–BH-R22, 22 kịch bản nghiệm thu, bảng dữ liệu đầy đủ, thứ tự build 15 bước). Kèm hai phụ lục mới giải quyết hai việc còn mở lâu nhất: **`phu-luc-G-moc-thanh-tich.md`** (việc D5 — trụ 2 của Level 1–3) và **`phu-luc-H-cau-nhan-xet.md`** (việc D31 — 75 câu nhận xét, dùng cho cả đợt 2 và đợt 6), cùng hai file seed trong `data/`. Thêm 8 việc còn mở D70–D77. Sửa các chỗ còn ghi "5 đợt" và "đợt 2–5". Khôi phục quy tắc 11 (không đánh số đè dãy của người khác).

**Mới ở v0.9:** thêm `12-module-chuyen-thi-dau.md` — quản lý chuyến đi giải của golfer (hậu cần, hành lý, thời gian biểu trước vòng tee time/shotgun, ăn uống, kết quả và phân tích theo cấp độ, tài chính chuyến đi, giải trong nước/quốc tế, xác thực kết quả qua Livescore đối chiếu VGA, thời tiết và sức khoẻ từ Open-Meteo, chế độ nâng cao: scorecard, gậy, yardage, pin location, chiến lược từng hố và phân tích AI), kèm seed `data/chuyen-thi-dau/` và bản thử `prototypes/chuyen-thi-dau.html`. Thêm `11-module-ho-so-nhan-su.md`, hồ sơ nhân sự và xuất CV.

**Mới ở v0.8:** thêm `10-module-trai-nghiem-su-kien.md`, module ngoại lệ trong đợt 1 cho Lễ phát động 10/10/2026.

**Mới ở v0.7:** thêm mục **7b — hạng tài khoản HLV (Standard / Coach)** và mục **7c — ba mini app sẽ nhập về sau** trong `00-tong-quan.md`. Standard miễn phí với hạn mức 50 học viên · 5 lớp · 100 MB. Kèm nguyên tắc phân loại tính năng, lằn ranh không khoá paywall quyền của phụ huynh, và trường `coach_plan` phải có ngay từ đợt 6.

**Mới ở v0.6:** thêm **đợt 6 — lớp 1-1 và giáo án riêng** (`08`, đủ chi tiết để build) và **đợt 7 — sàn kết nối HLV** (`09`, khung đã chốt). Kèm theo: bảng dữ liệu của hai đợt mới trong `01`, hai nhóm thông báo K và M trong `phu-luc-F`, và 8 việc còn mở D28–D35.

**Mới ở v0.5:** thêm `phu-luc-F-thong-bao.md` — ma trận thông báo đầy đủ, gồm thông báo đẩy lên điện thoại (Web Push), nhóm thông báo cho HLV và cho học viên, quy tắc bảo vệ trẻ em và quy tắc chống làm phiền.

## 1. Bộ tài liệu gồm những gì

### Tài liệu nền

| File | Nội dung | Mức độ |
|---|---|---|
| `00-tong-quan.md` | App là gì, người dùng, nguyên tắc, mô hình đào tạo, ba trụ xét lên level, gói dịch vụ, hạng tài khoản HLV, lộ trình **7 đợt**, thuật ngữ, nhận diện | Hoàn chỉnh — mục 7 và 7b sửa 24/10/2026 (D71) |
| `01-du-lieu.md` | Toàn bộ dữ liệu cần lưu, quan hệ, định dạng mã, trạng thái, phân quyền dữ liệu | Hoàn chỉnh cho đợt 1 và các module đã build; có khung cho **đợt 2–7** |
| `06-cong-nghe-chi-phi.md` | Công nghệ, tài khoản cần đăng ký, chi phí dự kiến, môi trường | Hoàn chỉnh |

### Bảy đợt

| File | Nội dung | Mức độ |
|---|---|---|
| `02-dot-1-nen-tang.md` | Đợt 1: tài khoản, nhập danh sách, kích hoạt Passport, hồ sơ học viên, chứng nhận, quản trị | **Đủ chi tiết để build** — đã build xong phần xây dựng |
| `03-dot-2-lop-hoc.md` | Đợt 2: buổi học tự sinh theo lịch, điểm danh hai chế độ, quét QR, kỹ năng 5 mảng, Passport checklist, nhật ký văn hoá, mốc thành tích, hai bài kiểm tra, lên level, nhận xét, ảnh, Skills check, báo cáo, Web Push | **Đủ chi tiết để build** (v1.0, 24/10/2026) |
| `04-dot-3-diem-qua-bxh.md` | Đợt 3: điểm thưởng, kho quà, tem đối tác, giải đấu, BXH Golf Trường học Việt Nam, bài tự luyện, buổi tập thể lực | Khung đã chốt — viết chi tiết sau |
| `05-dot-4-goi-thanh-toan-ho-so.md` | Đợt 4: gói Premium, thanh toán, mã tặng, hồ sơ học bổng | Khung đã chốt — viết chi tiết sau |
| `07-dot-5-thu-vien-tro-choi.md` | Đợt 5: kho trò chơi và hoạt động dạy golf cho HLV, gợi ý theo buổi, gói VIP/Diamond | Khung đã chốt — viết chi tiết sau |
| `08-dot-6-lop-1-1.md` | Đợt 6: chương trình 1-1, hồ sơ học viên hai mức, giáo án riêng, lịch và đặt buổi, chạy buổi học, nhận xét, bài tập, đánh giá | **Đủ chi tiết để build** |
| `09-dot-7-san-ket-noi-hlv.md` | Đợt 7: 5 nhóm HLV, xác minh, hồ sơ công khai, tìm và so sánh, giá/combo/coupon, gói Coach, testimonial, AI soạn bài giới thiệu | Khung đã chốt — viết chi tiết sau |

### Module ngoại lệ (nằm ngoài lộ trình 7 đợt)

| File | Nội dung | Mức độ |
|---|---|---|
| `10-module-trai-nghiem-su-kien.md` | Thẻ hạng "Trải nghiệm sự kiện", ghi tên tại chỗ, quầy đổi quà (nhập điểm 4 trạm, hoàn thành, đổi quà), tự xác nhận bằng ảnh, chứng nhận theo người, kích hoạt qua email | **Đã build và chạy thật** 10/10/2026 |
| `11-module-nhan-su-su-kien.md` | Nhân sự sự kiện (crew): bảng điều phối, việc hôm nay, nhập danh sách, phân ban, vai trò tự đặt, kho đồ, QR điểm danh nhân sự | **Đã build** 09–10/10/2026 |
| `11-mapping.md` | Bản đồ dữ liệu của module nhân sự sự kiện | Chốt 09/10/2026 |
| `11-module-ho-so-nhan-su.md` | Mỗi nhân sự (thầy cô, HLV, admin, BTC, TNV, CTV) có trang Hồ sơ của tôi, quá trình tích luỹ (đã xác thực / đã duyệt), chứng chỉ tự khai kèm hàng chờ duyệt riêng, xuất CV PDF 3 mẫu có QR xác thực | **Đủ chi tiết để build** — bước 1 đang build; bước 2 sau đợt 2 |
| `12-module-chuyen-thi-dau.md` | Chuyến thi đấu: thành viên và phân quyền theo chuyến, hậu cần, hành lý tự tính, ngày tập/vòng đấu (tee time, shotgun), thời gian biểu tính ngược, ăn uống theo hố, lưu ý trước vòng, kết quả và phân tích theo cấp độ, kho đồ, tài chính, thời tiết, chế độ nâng cao có AI | **Đủ chi tiết để build** — chốt 14/10/2026 |
| `12-mapping.md` | Bản đồ dữ liệu của module chuyến thi đấu | **Chờ anh Long trả lời Q1–Q9** trước khi chạy migration |

### Phụ lục

| File | Nội dung | Mức độ |
|---|---|---|
| `phu-luc-A-file-mau-nhap.md` | File Excel mẫu nhập danh sách và lịch sử khoá học | Hoàn chỉnh |
| `phu-luc-B-ky-nang-L1-L3.md` | Nội dung 18 dòng và danh mục kỹ năng Level 1–3, tiêu chí Đạt theo 5 mảng (trụ 1), văn hoá và luật (trụ 3) | **Chờ anh Long duyệt** (D4); ngưỡng số đo chờ kiểm chứng (D76) |
| `phu-luc-C-bang-diem.md` | Bảng điểm thưởng, thang điểm giải đấu, hệ số, phí, hạng tài khoản HLV | Tạm dùng, admin chỉnh được |
| `phu-luc-D-viec-con-mo.md` | Những việc chưa chốt (dãy **D**) và quyết định chốt khi build (dãy **B**) | Cập nhật liên tục |
| `phu-luc-E-danh-muc-tro-choi.md` | Chỉ mục 71 trò chơi CGI R&A và SNAG Golf cho kho trò chơi đợt 5 | Hoàn chỉnh phần chỉ mục |
| `phu-luc-F-thong-bao.md` | **Ma trận thông báo cả 7 đợt**: kênh, Web Push, ai nhận gì ở đợt nào, bật/tắt, bảo vệ trẻ em, chống làm phiền, dữ liệu, chi phí, **5 mẫu tin Zalo ZNS (mục F13)** | **Đủ chi tiết để build** — chờ anh Long duyệt mục 4 (D24) và gửi Zalo duyệt mẫu tin (D26) |
| `phu-luc-G-moc-thanh-tich.md` | **Mốc thành tích Level 1–3** — trụ 2 xét lên level: mốc chuẩn và mốc nâng cao, luật chơi cho các con, cách admin khai báo | **Chờ anh Long và HLV trưởng duyệt** (D5, D76) |
| `phu-luc-H-cau-nhan-xet.md` | **Thư viện 75 câu nhận xét sau buổi** theo mảng kỹ thuật và mức độ, sáu nguyên tắc viết câu, danh sách câu không được dùng. Dùng cho đợt 2 và đợt 6 | **Chờ HLV trưởng duyệt** (D31) |

### Thư mục kèm theo

| Thư mục | Nội dung |
|---|---|
| `data/` | File seed dạng CSV: `moc-thanh-tich.csv`, `cau-nhan-xet.csv`, `vai_tro.csv`, `nhiem_vu_mau.csv`, `thung_do.csv`, và `chuyen-thi-dau/` (15 file của module 12) |
| `prototypes/` | Bản thử bấm được: `chuyen-thi-dau.html` |

Điều khoản sử dụng và Chính sách bảo mật (V30) **chưa có bản chính thức**. Trang `/terms` và `/privacy` đang dùng bản tạm (D46), cần luật sư rà trước khi chạy thật (D3).

## 2. Hướng dẫn giao việc cho Claude Code

**Trạng thái hiện tại (24/10/2026):** đợt 1 xong phần xây dựng (Bước 1–15), module 10 và 11 đã build, module 11b đang build, module 12 chờ anh Long trả lời. **Môi trường chạy thật (production) chưa dựng** — xem `docs/van-hanh/trien-khai-production.md`.

Mở Claude Code trong thư mục repository. Với một đợt hoặc module mới, gửi câu lệnh mở đầu theo mẫu:

```
Đọc toàn bộ thư mục docs/spec theo thứ tự trong README.md.
Chúng ta chỉ làm <TÊN ĐỢT / MODULE> (file <tên file>).
Trước khi viết code, hãy: (1) tóm tắt lại phạm vi bằng tiếng Việt,
(2) liệt kê những chỗ trong tài liệu còn mơ hồ, (3) đề xuất kế hoạch chia nhỏ
thành các bước, mỗi bước chạy thử được. Chờ tôi duyệt rồi mới làm.
```

Với **đợt 2**, file `03-dot-2-lop-hoc.md` đã có **thứ tự build 15 bước ở mục 11** — dùng luôn thứ tự đó, đừng đề xuất lại. Bước 1 bắt buộc là `notification_types` và lớp gửi tin chung; làm sau thì phải sửa hai lần.

Quy trình làm việc:

1. Làm từng bước nhỏ. Sau mỗi bước, mở app thử trên điện thoại rồi mới sang bước tiếp.
2. Khi Claude Code hỏi điều gì không có trong tài liệu, ghi vào `phu-luc-D-viec-con-mo.md` theo dãy **B** và gửi lại cho Minh để cập nhật tài liệu.
3. Mỗi đợt xong thì chạy đủ bộ kịch bản nghiệm thu ở mục cuối của file đợt đó, trên môi trường thật.

## 3. Quy tắc bắt buộc cho Claude Code (đội code)

1. **Chỉ build đợt đang được giao.** Không tự thêm tính năng của đợt sau. Nhưng thiết kế cơ sở dữ liệu phải để sẵn chỗ cho **đợt 2–7** theo `01-du-lieu.md`, tránh phải đập đi làm lại.
2. **Không viết cứng các con số nghiệp vụ trong code.** Điểm thưởng, ngưỡng Đạt, giá, hệ số, số tiết mỗi level, ánh xạ level ↔ giai đoạn ↔ cấp hộ chiếu đều nằm trong bảng cấu hình mà admin chỉnh được.
3. **Song ngữ ngay từ đầu.** Mọi chữ hiển thị đi qua file ngôn ngữ `vi` và `en`. Nội dung nghiệp vụ (tên level, tên chương trình, mẫu chứng nhận) có cả bản tiếng Việt và tiếng Anh.
4. **Bảo mật dữ liệu trẻ em.** Mọi bảng dữ liệu bật phân quyền theo dòng (Row Level Security). Mặc định từ chối, chỉ mở đúng quyền mô tả trong `01-du-lieu.md` mục 13.
5. **Mọi thay đổi quan trọng đều ghi nhật ký** (ai, lúc nào, sửa gì): level, gộp học viên, cấp/huỷ sổ, phát hành/thu hồi chứng nhận, đổi vai trò người dùng, thanh toán, sửa điểm danh sau khi chốt, miễn điều kiện lên level.
6. **Mobile-first.** Giao diện phụ huynh và HLV phải dùng tốt trên màn hình rộng 360px. Giao diện admin ưu tiên máy tính nhưng vẫn xem được trên điện thoại.
7. **Thay đổi cơ sở dữ liệu bằng file migration** lưu trong repository. Có file dữ liệu mẫu (seed) để chạy thử. Migration chỉ thêm, không đổi tên, không xoá.
8. **Viết kiểm thử tự động** cho các quy tắc có tính tiền và điểm, kích hoạt mã, gộp học viên, phân quyền, và mọi quy tắc R / BH-R / G-R / E-R trong các file đợt.
9. **Khi tài liệu mơ hồ, hỏi lại, không tự đoán.**
10. **Mọi thông báo đi qua một cơ chế duy nhất.** Không gửi tin trực tiếp từ trong code nghiệp vụ. Mỗi loại thông báo phải có một dòng trong `notification_types` (danh mục lấy từ `phu-luc-F` mục 4), và phải đi qua lớp gửi tin chung để được kiểm tra: người dùng có tắt loại này không, có đang trong giờ im lặng không, có vượt trần trong ngày không, có phải tài khoản học viên chưa được phụ huynh bật không.
    **Hiện quy tắc này chưa được thực hiện** — bảng `notification_types` chưa tồn tại và module 10 ghi thẳng vào `notifications`. Trả nợ ở **Bước 1 của đợt 2** (`03-dot-2-lop-hoc.md` mục BH18).
11. **Không đổi số các mã đã phát, và không đánh số đè lên dãy của người khác.** Phụ lục D dùng hai dãy tách biệt: **D** là việc còn mở do Minh soạn trong đặc tả, **B** là quyết định chốt và câu hỏi phát sinh khi build do Claude Code ghi. Mỗi file đợt có dãy mã luồng riêng, không trộn với file khác: **F** (đợt 1) · **BH** (đợt 2) · **E** (module 10) · **G** (đợt 6) · **CT** (module 12) · **S** (module 11b). Code và kiểm thử trỏ tới các mã này, nên đổi số là làm hỏng ghi chú ở nơi khác.
    Lý do có quy tắc: ngày 27/09/2026 một bản đặc tả đã đánh số D24–D37 chồng lên 16 mục Claude Code ghi trong lúc build đợt 1, suýt làm mất 5 quyết định anh Long chốt ngày 24/09.
12. **Tài liệu đi theo code đang chạy, không ngược lại.** Khi đặc tả và bảng đang chạy lệch nhau mà bản đã build đúng hơn (ví dụ `student_accounts` không có `pin_hash` — quyết định **B4**), thì sửa đặc tả cho khớp code, và ghi lý do vào phụ lục D.
