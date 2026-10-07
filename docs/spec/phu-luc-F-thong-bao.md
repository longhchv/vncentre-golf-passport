# Phụ lục F · Ma trận thông báo

Soạn 24/09/2026. Gom toàn bộ thông báo của cả 5 đợt vào một chỗ. Khi build bất kỳ đợt nào, Claude Code đọc phụ lục này cùng với file của đợt đó.

Phụ lục này **thay thế** mục F17 trong `02-dot-1-nen-tang.md` (F17 giữ nguyên để tham chiếu, nhưng bảng đầy đủ nằm ở đây).

---

## F1. Bảy nguyên tắc

1. **Mỗi thông báo phải dẫn tới một việc.** Nếu người nhận đọc xong không cần làm gì và cũng không thấy vui hơn, thì không gửi.
2. **Tin nhắn mất tiền chỉ dùng cho việc gấp.** Zalo và SMS là tin trả phí. Mọi thứ khác đi bằng thông báo đẩy (miễn phí), hộp thư trong app và email.
3. **Không bao giờ so sánh một con với con khác trong thông báo.** Thứ hạng chỉ hiện khi người dùng tự mở bảng xếp hạng.
4. **Không gửi tin xấu về một con cho ai khác ngoài gia đình em đó và HLV phụ trách.**
5. **Trẻ em được bảo vệ chặt hơn người lớn.** Xem mục F6.
6. **Người dùng tắt được gần hết.** Chỉ 4 loại không tắt được (mục F5).
7. **Gom lại thay vì bắn liên tục.** Xem mục F7.

---

## F2. Các kênh

| Kênh | Chi phí | Dùng khi | Ghi chú |
|---|---|---|---|
| **Thông báo đẩy** (Web Push) | Miễn phí | Mọi việc cần biết sớm | Kênh chính từ đợt 2. Xem mục F3 |
| **Hộp thư trong app** | Miễn phí | Mọi thông báo, kể cả đã gửi qua kênh khác | **Luôn luôn ghi**, không có ngoại lệ. Là bản lưu chính thức |
| **Email** | Gần như miễn phí | Việc có kèm file (chứng nhận, hoá đơn, hồ sơ), bản tin tuần, việc cần lưu lại | |
| **Zalo ZNS** | ~300 đ (OTP) · ~200 đ (tin khác) | OTP · lời mời kích hoạt · con vắng học ở lớp nhỏ · việc gấp trong ngày | Phải dùng mẫu tin Zalo đã duyệt trước |
| **SMS brandname** | Chưa tra giá | Chỉ khi gửi Zalo thất bại | Tự động chuyển, không hỏi lại |

**Thứ tự chọn kênh khi gửi một thông báo:**

1. Luôn ghi vào hộp thư trong app.
2. Nếu người nhận đã bật thông báo đẩy → gửi đẩy.
3. Nếu thông báo thuộc loại "gấp" mà người nhận **chưa** bật đẩy, hoặc **chưa mở app quá 7 ngày** → gửi Zalo (thất bại thì SMS).
4. Nếu thông báo có file kèm hoặc thuộc loại "cần lưu" → gửi thêm email.

Quy tắc số 3 là chỗ tiết kiệm tiền nhiều nhất: phụ huynh nào chịu bật thông báo đẩy thì VN Centre không tốn đồng nào cho họ nữa.

---

## F3. Thông báo đẩy (Web Push) — làm ở đợt 2

App là PWA nên đẩy được thông báo lên điện thoại mà không cần lên App Store.

**Cách chạy**
- Dùng Web Push chuẩn (VAPID). Khoá VAPID lưu trong biến môi trường, không để trong code.
- Service worker của PWA nhận và hiện thông báo; bấm vào thì mở đúng màn hình liên quan.
- Mỗi người có thể có nhiều thiết bị; mỗi thiết bị một bản ghi riêng.

**Giới hạn phải nói trước cho người dùng**
- **iPhone/iPad:** chỉ nhận được thông báo đẩy **sau khi đã thêm app vào màn hình chính**. Mở bằng Safari thường thì không có. App phải hiện hướng dẫn thêm vào màn hình chính trước khi xin quyền.
- **Android:** mở bằng Chrome là xin quyền được, nhưng thêm vào màn hình chính vẫn ổn định hơn.
- Người dùng từ chối quyền thì trình duyệt sẽ không hỏi lại. App **không được hỏi lại nhiều lần**; chỉ để một dòng nhỏ trong Cài đặt để họ tự bật khi muốn.

**Lúc nào xin quyền**
- **Không xin ngay khi mở app lần đầu.** Xin sau khi phụ huynh kích hoạt xong cho con, kèm một câu giải thích: "Bật thông báo để biết ngay khi con được lên level, nhận chứng nhận hoặc vắng học."
- Xin quyền tối đa 2 lần, cách nhau ít nhất 14 ngày.

---

## F4. Ma trận thông báo

Ký hiệu cột **Tắt được**: `Không` = luôn gửi · `Có` = người dùng tự bật/tắt · `Mặc định tắt` = phải tự bật mới nhận.

### F4.1 Phụ huynh / người giám hộ

| # | Sự kiện | Kênh | Tắt được | Đợt |
|---|---|---|---|---|
| P1 | Mã OTP đăng nhập, quên mật khẩu | Zalo → SMS (số VN) · email (số nước ngoài) | Không | 1 |
| P2 | Lời mời kích hoạt Passport của con | Zalo (hoặc email nếu admin chọn) | Không | 1 |
| P3 | Lời mời làm người giám hộ thứ hai | Zalo hoặc email | Không | 1 |
| P4 | Kết quả yêu cầu liên kết với con (duyệt / từ chối) | App + đẩy + email | Không | 1 |
| P5 | Chứng nhận mới của con | App + đẩy + email (kèm PDF) | Có | 1 |
| P6 | Con được duyệt lên level | App + đẩy + email | Có | 1 |
| P7 | Thanh toán thành công · sổ mới đã cấp | App + đẩy + email | Không | 1 |
| P8 | Điều khoản hoặc Chính sách bảo mật có bản mới | App (chặn màn hình lần đăng nhập kế tiếp) + email | Không | 1 |
| P9 | Hồ sơ của con sắp bị hạn chế vì chưa hoàn tất kích hoạt (nhắc sau 7 và 21 ngày) | Zalo hoặc email | Có | 1 |
| P10 | **Con vắng buổi học hôm nay** — lớp dưới 20 em | Zalo + app + đẩy | Có | 2 |
| P11 | **Con vắng buổi học hôm nay** — lớp đông | App + đẩy + email | Có | 2 |
| P12 | HLV viết nhận xét mới về con | App + đẩy | Có | 2 |
| P13 | Có ảnh mới của con trong buổi học | App + đẩy | Có | 2 |
| P14 | Con đạt bài kiểm tra lý thuyết / thực hành của level | App + đẩy | Có | 2 |
| P15 | Con **đủ điều kiện lên level**, đang chờ HLV trưởng duyệt | App + đẩy | Có | 2 |
| P16 | Con được ghi nhận điểm văn hoá – ứng xử tốt | App + đẩy | Có | 2 |
| P17 | **Bản tin tuần của con** (chuyên cần, kỹ năng mới, điểm, ảnh) — Chủ nhật 19:00 | Email + app | Có | 2 |
| P18 | Con đổi quà thành công · quà đã sẵn sàng để nhận · nơi và giờ nhận | App + đẩy + email | Có | 3 |
| P19 | Kho quà sắp mở tại trường / tại giải (báo trước 3 ngày) | App + đẩy | Có | 3 |
| P20 | Con được HLV giao bài tự luyện mới | App + đẩy | Có | 3 |
| P21 | Sắp có giải đấu con đủ điều kiện tham dự · hạn đăng ký | App + đẩy + email | Có | 3 |
| P22 | Kết quả của con sau một chặng giải | App + đẩy | Có | 3 |
| P23 | Premium sắp hết hạn (trước 14 ngày và trước 3 ngày) | App + đẩy + email | Không | 4 |
| P24 | Nhận được mã tặng Premium | App + đẩy + email | Có | 4 |
| P25 | Thanh toán Premium thành công · hoá đơn điện tử | App + email (kèm hoá đơn) | Không | 4 |
| P26 | Hồ sơ học bổng đã xuất xong, sẵn sàng tải | App + đẩy + email | Có | 4 |

### F4.2 HLV và trợ giảng

Đây là nhóm **hiện đang thiếu hẳn** trong tài liệu cũ.

| # | Sự kiện | Kênh | Tắt được | Đợt |
|---|---|---|---|---|
| H1 | Email mời vào hệ thống · được gán vai trò | Email | Không | 1 |
| H2 | Được phân công vào lớp mới · bị gỡ khỏi lớp | App + đẩy + email | Không | 1 |
| H3 | Có phụ huynh xin liên kết với học viên lớp mình, đang chờ duyệt | App + đẩy | Có | 1 |
| H4 | **Nhắc điểm danh**: hết buổi 60 phút mà chưa điểm danh | App + đẩy | Có | 2 |
| H5 | **Lịch dạy hôm nay** (danh sách lớp, giờ, địa điểm) — 07:00 sáng | App + đẩy | Có | 2 |
| H6 | Học viên mới được xếp vào lớp mình | App + đẩy | Có | 2 |
| H7 | Đề xuất lên level bị HLV trưởng **trả lại**, kèm lý do | App + đẩy + email | Không | 2 |
| H8 | Đề xuất lên level được duyệt | App + đẩy | Có | 2 |
| H9 | Có bằng chứng bài tự luyện của học viên **chờ xác nhận** (gom một lần/ngày) | App + đẩy | Có | 3 |
| H10 | Học viên tự khai lệch nhiều so với kết quả chấm — cần trao đổi với gia đình | App | Có | 3 |
| H11 | Lớp mình có em sắp đủ điều kiện lên level (còn thiếu mục nào) — gom một lần/tuần | App + email | Có | 2 |
| H12 | Có trò chơi mới trong thư viện phù hợp với lớp đang dạy | App | Mặc định tắt | 5 |
| H13 | Buổi tập thể lực mình soạn đã được duyệt / bị trả lại | App + đẩy | Không | 3 |

**Trợ giảng** nhận: H1, H2, H4, H5, H6. Không nhận các thông báo liên quan tới duyệt kỹ năng và lên level.

**Giáo viên thể chất nhà trường** nhận: H1, H2, H4, H5, H6 — giới hạn trong lớp của trường mình.

### F4.3 Học viên (từ 8 tuổi, có tài khoản riêng)

Toàn bộ nhóm này chỉ hoạt động khi **phụ huynh đã bật cho con** trong mục Tài khoản. Xem mục F6.

| # | Sự kiện | Kênh | Tắt được | Đợt |
|---|---|---|---|---|
| S1 | Chúc mừng lên level (có chú rồng linh vật) | App + đẩy | Có | 2 |
| S2 | Được HLV ghi nhận điểm văn hoá – ứng xử | App + đẩy | Có | 2 |
| S3 | Nhận huy hiệu mới (gồm huy hiệu Trung thực) | App + đẩy | Có | 3 |
| S4 | HLV giao bài tự luyện hoặc thử thách mới | App + đẩy | Có | 3 |
| S5 | **Nhắc buổi tập hôm nay** (khi con tự đặt giờ nhắc) | App + đẩy | Mặc định tắt | 3 |
| S6 | Sắp mất chuỗi ngày luyện tập (nhắc **một lần duy nhất** trong ngày cuối) | App + đẩy | Có | 3 |
| S7 | Đã đủ điểm đổi một món trong kho quà | App + đẩy | Có | 3 |
| S8 | Kết quả của mình sau một chặng giải | App + đẩy | Có | 3 |

**Không bao giờ gửi cho học viên:** thứ hạng tụt, điểm thấp, so sánh với bạn, nhắc "con đang kém hơn tuần trước", nhắc nợ học phí, bất cứ nội dung nào về tiền.

### F4.4 Quản lý trường / cơ sở

| # | Sự kiện | Kênh | Tắt được | Đợt |
|---|---|---|---|---|
| T1 | Email mời vào hệ thống | Email | Không | 1 |
| T2 | Dữ liệu lịch sử khoá học trường nhập đã được duyệt / bị trả lại | App + email | Không | 1 |
| T3 | **Báo cáo tháng của trường**: tỉ lệ kích hoạt, chuyên cần, số em lên level | Email + app | Có | 2 |
| T4 | Số học sinh của trường chưa được phụ huynh kích hoạt (nhắc hằng tháng) | Email | Có | 1 |

### F4.5 Admin và HLV trưởng

| # | Sự kiện | Kênh | Tắt được | Đợt |
|---|---|---|---|---|
| A1 | Hàng chờ duyệt có việc mới (liên kết, lịch sử khoá học, lên level) — gom 2 lần/ngày | App + email | Có | 1 |
| A2 | Đơn cấp lại sổ đã thanh toán, cần cấp sổ | App + đẩy + email | Không | 1 |
| A3 | Nghi ngờ lạm dụng: một mã kích hoạt bị thử sai nhiều lần, một IP gửi quá nhiều yêu cầu | App + email | Không | 1 |
| A4 | **Chi phí tin nhắn tháng này vượt ngưỡng cảnh báo** | App + email | Không | 1 |
| A5 | Gửi tin hàng loạt đã chạy xong: bao nhiêu thành công, bao nhiêu thất bại, hết bao nhiêu tiền | App + email | Không | 1 |
| A6 | Có yêu cầu xoá dữ liệu của một con | App + email | Không | 1 |
| A7 | Có buổi tập thể lực hoặc bài tự luyện chờ duyệt | App + email | Có | 3 |
| A8 | Thanh toán Premium thất bại hàng loạt (cổng thanh toán có vấn đề) | App + email | Không | 4 |
| A9 | Kho quà sắp hết một món đang được đổi nhiều | App + email | Có | 3 |

### F4.6 Lớp 1-1 (đợt 6)

| # | Sự kiện | Người nhận | Kênh | Tắt được |
|---|---|---|---|---|
| K1 | Yêu cầu mở chương trình 1-1 được duyệt / từ chối | Phụ huynh, HLV | App + đẩy + email | Không |
| K2 | HLV xin xem hồ sơ đầy đủ của con | Phụ huynh | App + đẩy + Zalo | Không |
| K3 | Kết quả xin xem hồ sơ (phụ huynh đồng ý, admin duyệt) | HLV | App + đẩy | Không |
| K4 | Phụ huynh rút lại quyền xem hồ sơ | HLV, admin | App | Không |
| K5 | Giáo án riêng mới hoặc được sửa | Phụ huynh | App + đẩy | Có |
| K6 | Giáo án chờ HLV trưởng duyệt | HLV trưởng | App + email | Có |
| K7 | Yêu cầu đặt lịch mới | HLV | App + đẩy | Không |
| K8 | Lịch được xác nhận | Phụ huynh, học viên | App + đẩy | Không |
| K9 | Yêu cầu đặt lịch sắp hết hạn (còn 6 giờ) | HLV | App + đẩy | Có |
| K10 | Sau 2 vòng không khớp lịch — chuyển hàng chờ admin | Admin, phụ huynh, HLV | App + email | Không |
| K11 | **Nhắc buổi học** trước 24 giờ và trước 2 giờ | Phụ huynh, HLV, học viên | App + đẩy | Có |
| K12 | Buổi bị đổi hoặc hủy | Bên còn lại | App + đẩy + Zalo | Không |
| K13 | Đề nghị chuyển HLV thay thế | HLV thay thế, phụ huynh | App + đẩy | Không |
| K14 | Buổi hủy do không đủ 3 xác nhận | Phụ huynh, cả hai HLV | App + đẩy | Không |
| K15 | **Nhận xét sau buổi** | Phụ huynh, học viên | App + đẩy + email | Không |
| K16 | Buổi chưa đóng sau 24 giờ | HLV | App + đẩy | Có |
| K17 | Buổi chưa đóng sau 72 giờ | Admin | App + email | Không |
| K18 | Bài tập mới được giao | Phụ huynh, học viên | App + đẩy | Có |
| K19 | Bài tập sắp đến hạn (còn 24 giờ) | Học viên, phụ huynh | App + đẩy | Có |
| K20 | Học viên đã nộp bài — gom **một lần mỗi ngày** | HLV | App + đẩy | Có |
| K21 | Bài đã chấm, điểm đã cộng | Phụ huynh, học viên | App + đẩy | Có |
| K22 | Xin gia hạn bài tập | HLV | App | Có |
| K23 | **Báo cáo tháng chương trình 1-1** | Phụ huynh | Email + app | Có |
| K24 | Bản tổng kết khi kết thúc chương trình | Phụ huynh, HLV | App + email | Không |
| K25 | Đánh giá buổi dưới 3 sao | HLV trưởng, admin | App + email | Không |
| K26 | Ghi nhận một lỗi hẹn | Bên bị ghi | App | Không |
| K27 | HLV chạm ngưỡng lỗi hẹn, hồ sơ tự ẩn | HLV, admin | App + email | Không |
| K28 | Học viên vắng 2 buổi liên tiếp hoặc không nộp bài 2 lần liên tiếp | HLV, phụ huynh | App + đẩy | Có |
| K29 | Bài tập HLV tự soạn chờ admin duyệt | Admin | App + email | Có |

### F4.7 Sàn kết nối HLV (đợt 7)

| # | Sự kiện | Người nhận | Kênh | Tắt được |
|---|---|---|---|---|
| M1 | Hồ sơ HLV được duyệt cho hiển thị / bị từ chối | HLV | App + đẩy + email | Không |
| M2 | Hồ sơ mới chờ duyệt | Admin | App + email | Không |
| M3 | Xác minh chuyên môn hoàn tất — nâng nhóm | HLV | App + đẩy + email | Không |
| M4 | Chứng chỉ sắp hết hạn (trước 60 ngày) | HLV | App + email | Không |
| M5 | Chứng chỉ hết hạn — nhãn rớt về "HLV tự khai" | HLV, admin | App + email | Không |
| M6 | Hồ sơ bị tạm ẩn do khiếu nại | HLV, admin | App + email | Không |
| M7 | Buổi bị ảnh hưởng vì HLV bị tạm ẩn | Phụ huynh | App + đẩy + Zalo | Không |
| M8 | Giá, combo hoặc coupon chờ VN Centre duyệt | Admin | App + email | Có |
| M9 | Giá / coupon được duyệt hoặc bị trả lại | HLV | App + đẩy | Không |
| M10 | Gói Coach sắp hết hạn (trước 30 và 7 ngày) | HLV | App + đẩy + email | Không |
| M11 | Gói Coach hết hạn — hồ sơ ẩn khỏi sàn | HLV | App + email | Không |
| M12 | Thanh toán gói Coach thành công · hoá đơn | HLV | App + email | Không |
| M13 | Phụ huynh đồng ý cho công khai một testimonial | HLV | App + đẩy | Có |
| M14 | Phụ huynh rút lại đồng ý — testimonial bị gỡ | HLV | App | Không |
| M15 | Bản nháp bài giới thiệu AI đã sẵn sàng | Bộ phận truyền thông | App + email | Có |
| M16 | Đề nghị xem và xác nhận bài giới thiệu về mình | HLV | App + đẩy | Không |
| M17 | HLV báo sai thông tin trong bài giới thiệu | Bộ phận truyền thông, admin | App + email | Không |
| M18 | Yêu cầu tạo học viên mới từ sàn chờ duyệt | Admin | App + email | Không |
| M19 | Kết quả duyệt học viên mới (có cấp mã và Passport hay không) | Phụ huynh | App + đẩy + email | Không |

**Quy tắc riêng cho hai đợt này**

- Thông báo về một buổi học **luôn gửi cho phụ huynh**, kể cả khi học viên là người thao tác.
- Học viên nhận K8, K11, K15, K18, K19, K21 — và chỉ khi phụ huynh đã bật, theo mục F6.
- Không có kênh nhắn tin riêng giữa HLV và học viên. Mọi thông báo liên quan tới một em đều có phụ huynh trong danh sách nhận.
- Thông báo cho HLV về nhiều học viên trong cùng một giờ thì **gom lại một tin**, theo mục F7.

---

## F5. Bốn loại không tắt được

Người dùng tắt được gần hết, trừ bốn nhóm sau, và app phải nói rõ lý do ngay trong trang Cài đặt:

1. **An toàn tài khoản** — OTP, đổi mật khẩu, đăng nhập từ thiết bị lạ.
2. **Pháp lý** — Điều khoản và Chính sách bảo mật có bản mới, yêu cầu xoá dữ liệu.
3. **Tiền** — thanh toán thành công/thất bại, hoá đơn, Premium sắp hết hạn.
4. **Việc bắt buộc của vai trò** — HLV bị trả lại đề xuất lên level, admin có đơn cần cấp sổ.

Mọi thứ còn lại phải tắt được, từng loại một, không phải tắt cả cụm.

---

## F6. Bảo vệ trẻ em — bắt buộc

- **Tài khoản học viên mặc định KHÔNG nhận thông báo đẩy.** Phụ huynh phải vào mục Tài khoản bật riêng cho từng con.
- Với các con **dưới 13 tuổi**, phụ huynh bật/tắt được từng loại; các con không tự bật được.
- Từ 13 tuổi trở lên, các con tự chỉnh được, nhưng phụ huynh vẫn thấy và vẫn tắt được.
- **Không gửi thông báo cho học viên sau 21:00 và trước 06:00**, kể cả nhắc luyện tập.
- Thông báo cho học viên **không bao giờ** chứa: tiền, thứ hạng tụt, so sánh với bạn khác, lời nhắc mang tính ép buộc ("con sắp mất chuỗi rồi, tập ngay đi!").
- Nhắc chuỗi ngày luyện tập chỉ gửi **một lần duy nhất** vào ngày cuối. Không nhắc lại. Không dùng đồng hồ đếm ngược.
- Không gửi thông báo cho học viên vào giờ học ở trường theo cấu hình của admin (mặc định 07:00–16:30 các ngày trong tuần).

---

## F7. Chống làm phiền

| Quy tắc | Mức đề xuất (admin chỉnh được) |
|---|---|
| Trần thông báo đẩy mỗi người mỗi ngày | **3**. Vượt quá thì dồn vào bản tin tuần |
| Giờ im lặng cho người lớn | 21:30 – 07:00. Chỉ OTP và cảnh báo hệ thống được vượt |
| Giờ im lặng cho học viên | 21:00 – 06:00, và cả giờ học ở trường |
| Gom tin cùng loại | Nhiều việc cùng loại trong 1 giờ thì gộp thành 1 tin: "3 việc mới cần duyệt" |
| Không gửi trùng | Cùng một sự kiện không gửi lại trong 24 giờ |
| Trần tin Zalo mỗi người mỗi tháng | **4 tin**, trừ OTP |

**Bản tin tuần** (P17) là chỗ chứa mọi thứ không gấp: ảnh, nhận xét, kỹ năng mới, điểm tích được, chuyên cần. Gửi Chủ nhật 19:00. Đây là tin quan trọng nhất với phụ huynh và cũng là tin rẻ nhất.

---

## F8. Dữ liệu cần thêm

Bổ sung vào `01-du-lieu.md` mục 10:

| Bảng | Đợt | Trường chính | Ghi chú |
|---|---|---|---|
| `push_subscriptions` | 2 | user_id, endpoint, keys (JSON), device_label, user_agent, created_at, last_success_at, failed_count, revoked_at | Mỗi thiết bị một dòng. Thất bại 5 lần liên tiếp thì đánh dấu thu hồi |
| `notification_preferences` | 1 | user_id, student_id (nullable — khi phụ huynh đặt riêng cho từng con), notification_code (P5, H4, S3…), channel (`push`, `email`, `zalo`, `in_app`), enabled | Thiếu dòng nào thì lấy mặc định trong `notification_types` |
| `notification_types` | 1 | code, group, name_vi/en, description_vi/en, default_channels (JSON), mandatory (bool), min_role, audience | **Danh mục từ bảng F4 này**, nạp bằng file seed. Thêm loại mới là thêm dòng, không sửa code |
| `notification_templates` | 1 | code, channel, lang, subject, body, zalo_template_id (nullable), version, approved_at | Mẫu tin Zalo phải lưu mã mẫu Zalo đã duyệt |

Bảng `notifications` đã có sẵn từ đợt 1, bổ sung thêm cột: `notification_code`, `student_id` (nullable), `grouped_count` (khi gom nhiều việc thành một tin), `sent_at` từng kênh.

---

## F9. Cấu hình admin chỉnh được

- Bật/tắt từng loại thông báo cho toàn hệ thống (khoá cứng, người dùng không bật lại được).
- Kênh mặc định của từng loại.
- Trần đẩy/ngày · trần Zalo/tháng · giờ im lặng của người lớn và của học viên · giờ học ở trường.
- Giờ gửi bản tin tuần, giờ gửi lịch dạy hằng ngày.
- Ngưỡng cảnh báo chi phí tin nhắn theo tháng.
- Nội dung mẫu tin cả tiếng Việt và tiếng Anh; với Zalo thì gắn mã mẫu đã duyệt.
- **Màn hình gửi tin hàng loạt bắt buộc hiện số tiền ước tính và yêu cầu xác nhận** trước khi chạy (quy tắc đã có ở đợt 1, nhắc lại ở đây).

---

## F10. Quy tắc bắt buộc khi code (để viết kiểm thử)

| # | Quy tắc |
|---|---|
| F-R1 | Mọi thông báo đều ghi vào `notifications`, kể cả khi gửi thất bại ở mọi kênh |
| F-R2 | Không gửi kênh trả phí (Zalo, SMS) khi loại thông báo đó không được đánh dấu là gấp |
| F-R3 | Người dùng đã tắt một loại thì không gửi loại đó qua bất kỳ kênh nào, trừ 4 nhóm ở mục F5 |
| F-R4 | Không gửi thông báo cho tài khoản học viên khi phụ huynh chưa bật |
| F-R5 | Trong giờ im lặng thì xếp hàng, gửi vào đầu giờ cho phép — không bỏ, không gửi ngay |
| F-R6 | Cùng một sự kiện cho cùng một người không gửi hai lần trong 24 giờ |
| F-R7 | Nội dung gửi theo ngôn ngữ người nhận đã chọn; thiếu bản dịch thì dùng tiếng Việt và ghi log |
| F-R8 | Thông báo về một học viên chỉ gửi cho: người giám hộ đang `active` của em đó, HLV của lớp em đó, admin. Không ai khác |
| F-R9 | Đẩy thất bại 5 lần liên tiếp thì thu hồi bản ghi thiết bị và không thử lại |
| F-R10 | Mọi lần gửi hàng loạt ghi nhật ký: ai bấm, bao nhiêu người nhận, hết bao nhiêu tiền |

---

## F11. Ước tính chi phí

Giả định 1.600 học viên, 1.400 phụ huynh đã kích hoạt, 60% bật thông báo đẩy.

| Khoản | Số lượng/tháng | Đơn giá | Thành tiền |
|---|---|---|---|
| Tin Zalo báo vắng (lớp nhỏ, ~300 em, ~1 lần/tháng) | 300 | 200 đ | 60.000 đ |
| Tin Zalo nhắc kích hoạt | ~200 | 200 đ | 40.000 đ |
| OTP (chỉ khi đăng nhập lại) | ~150 | 300 đ | 45.000 đ |
| Thông báo đẩy | ~25.000 | 0 đ | 0 đ |
| Email (bản tin tuần + giao dịch) | ~8.000 | Trong gói miễn phí hoặc ~5 USD | 0 – 130.000 đ |
| **Tổng tháng bình thường** | | | **≈ 145.000 – 275.000 đ** |

Tháng có đợt kích hoạt lớn (ví dụ 1.200 phụ huynh Phương Mai) thì cộng thêm khoảng 240.000 đ một lần.

Kết luận: nếu đẩy được tỉ lệ bật thông báo đẩy lên cao, chi phí thông báo hằng tháng nằm gọn trong ngân sách dưới 1 triệu đồng.

---

## F12. Việc còn mở (chuyển sang `phu-luc-D`)

| Mã | Việc |
|---|---|
| D24 | Anh Long duyệt ma trận F4 — đặc biệt là nhóm H (HLV) và nhóm S (học viên), vì đây là phần mới |
| D25 | Chốt giờ gửi bản tin tuần (đề xuất Chủ nhật 19:00) và giờ gửi lịch dạy cho HLV (đề xuất 07:00) |
| D26 | Soạn và gửi Zalo duyệt các mẫu tin: OTP, lời mời kích hoạt, mời giám hộ thứ hai, báo vắng, nhắc kích hoạt |
| D27 | Chốt ngưỡng cảnh báo chi phí tin nhắn theo tháng |
