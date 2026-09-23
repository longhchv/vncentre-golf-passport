# 07 · Đợt 5 — Thư viện trò chơi và hoạt động cho HLV

> **Trạng thái: KHUNG ĐÃ CHỐT, CHƯA ĐỦ CHI TIẾT ĐỂ BUILD.** Bổ sung ngày 19/09/2026 theo ý tưởng của anh Long.

## 1. Vì sao có đợt này

Bốn đợt đầu phục vụ phụ huynh và việc quản lý học viên. Đợt 5 phục vụ **người dạy**. Đây là phần biến app từ "sổ theo dõi học viên" thành **công cụ dạy học**, và là lý do rõ ràng nhất để một trường tư, một học viện hay một HLV bên ngoài trả tiền gói VIP/Diamond.

Anh Long đã có sẵn nhiều trò chơi từ chương trình **CGI của R&A** và **SNAG Golf**, sẽ tiếp tục bổ sung, sáng tạo thêm, và cùng Minh soạn tiếp để bổ sung liên tục vào kho.

## 2. Mỗi trò chơi gồm những gì

| Trường | Nội dung |
|---|---|
| Tên | Song ngữ Việt – Anh |
| Mục tiêu | Mảng kỹ thuật (Grip–Setup, Putting, Chipping, Pitching, Full swing) · văn hoá golf · kỹ năng sống · luật · thể lực |
| Level phù hợp | Một hoặc nhiều level trong 20 level |
| Số học sinh | Ví dụ 6–12, 20–40, trên 40 |
| Không gian | Sân xi măng, sân cỏ, phòng học, hành lang, phòng golf 3D, sân tập |
| Dụng cụ tối thiểu | Ví dụ 4 gậy gạt + 4 gậy phóng + bóng SNAG; hoặc chỉ dụng cụ thể chất sẵn có của trường |
| Thời lượng | Số phút |
| Cách chơi | Các bước, sơ đồ sân, cách chia đội, cách tính điểm |
| Biến thể | Dễ hơn / khó hơn |
| Học liệu | Ảnh, sơ đồ, video (link YouTube) |
| Nguồn | CGI R&A · SNAG Golf · VN Centre tự soạn · HLV đóng góp (ghi tên người đóng góp) |
| Ghi chú an toàn | Khoảng cách an toàn, điều cấm |

## 3. Chức năng

1. **Tìm kiếm và lọc** theo đúng điều kiện thực tế của buổi dạy: level, số học sinh, không gian, dụng cụ đang có, thời lượng còn lại, mục tiêu.
2. **Gợi ý cho buổi hôm nay:** app đọc thông tin lớp (level, sĩ số, loại lớp, nội dung buổi theo giáo án) rồi đề xuất 3–5 trò phù hợp. HLV chọn và gắn vào buổi.
3. **Ghi nhận sau buổi:** HLV đánh dấu đã dùng, chấm sao, ghi chú "lớp thích/không thích chỗ nào". Dữ liệu này dùng để xếp hạng trò chơi và cải tiến.
4. **HLV đóng góp trò chơi mới:** điền theo biểu mẫu ở mục 2, admin duyệt rồi mới vào kho, ghi tên người đóng góp. Đây là cách kho lớn dần theo cộng đồng HLV.
5. **Bộ sưu tập:** HLV lưu trò yêu thích; VN Centre tạo bộ theo chủ đề, ví dụ "10 trò cho tiết đầu tiên ở trường công", "trò chơi ngày mưa trong phòng học".
6. **Tải về:** in phiếu trò chơi một trang để mang ra sân.

## 4. Mở khoá theo gói (anh Long chốt 21/09/2026)

Kho chia làm 2 phần theo nguồn gốc trò chơi:

| Phần | Gồm | Ai dùng được |
|---|---|---|
| **Miễn phí** | Trò chơi của **CGI R&A** và **SNAG Golf** (71 trò, xem `phu-luc-E`) | Mọi tài khoản HLV, không mất phí |
| **Mất phí (VIP/Diamond)** | Trò do **VN Centre tự nghĩ ra, sáng tạo hoặc tổng hợp từ nguồn khác**; kèm gợi ý trò cho buổi dạy, bộ sưu tập theo chủ đề, tải phiếu trò chơi, đóng góp trò mới | HLV đối tác, trường tư, trường quốc tế, trung tâm, học viện trả phí |

- HLV của VN Centre dùng toàn bộ kho, miễn phí.
- Mỗi trò trong kho đều ghi rõ nguồn. Trò VN Centre soạn có nhãn riêng.
- Giá gói do admin nhập.

## 5. Nguồn dữ liệu ban đầu

Anh Long đã gửi 2 tài liệu gốc ngày 21/09/2026, Minh đã lập chỉ mục **71 trò chơi** trong `phu-luc-E`:
- **CGI Support Pack** (R&A): 6 trò khởi động, 15 trò putting, 21 trò chip và đánh bóng, 6 giáo án tuần.
- **SNAG Games Manual** (2-2014): 5 thể thức thi đấu, 3 trò vận động, 11 trò rèn kỹ năng, 10 trò tích hợp môn học.

Nhóm trò tích hợp môn học của SNAG (toán, ngôn ngữ, địa lý) hợp với hướng Golf – AI – STEM và với giờ GDTC tăng cường ở trường công.

## 6. Việc cần làm trước khi viết chi tiết

- **Bản quyền:** dù chỉ phát miễn phí, việc dịch và số hoá tài liệu của CGI R&A và SNAG Golf lên app vẫn nên được hai bên xác nhận bằng văn bản. Trò do VN Centre tự soạn thì không vướng.
- Chốt các nhóm không gian cần phủ (sân xi măng, phòng học, sân cỏ, phòng golf 3D).
- Quy trình duyệt trò chơi do HLV đóng góp.
- Minh soạn mẫu phiếu trò chơi và 10 trò mẫu để anh Long xem chất lượng trước khi làm cả kho.
