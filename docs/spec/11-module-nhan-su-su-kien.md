# 11 · Module Nhân sự sự kiện: vai trò, nhiệm vụ, checklist, thẻ đeo QR

Bản 1 · 09/10/2026 · Người yêu cầu: Vũ Anh Long
Dùng cho: Lễ phát động 10/10/2026 (khu trải nghiệm Golf), sau đó dùng lại cho mọi sự kiện, giải SNAG Golf League, lớp CGI.
Đọc kèm: `10-module-trai-nghiem-su-kien.md` (check-in, chấm điểm, quầy quà, xác thực email).

---

## 0. Mục tiêu trong một câu

Mỗi người làm việc tại sự kiện (BTC, HLV CGI, Đại sứ, thầy cô check-in, tình nguyện viên, truyền thông, người đón khách mời) **dùng chính hồ sơ Golf Passport của mình**: quét QR trên thẻ đeo là mở đúng checklist và đúng chức năng của vai mình hôm đó; sau sự kiện hồ sơ vẫn còn, ghi lại lịch sử đã tham gia, và người đó **đăng nhập dùng lâu dài** bằng chính tài khoản ấy.

## 1. Nguyên tắc bắt buộc

1. **Một người, một mã định danh trọn đời, chính là mã Golf Passport.** Không tạo loại tài khoản "nhân sự" riêng, không sinh mã nhân sự riêng. Nhân sự chỉ là **một vai trò gắn vào hồ sơ người** trong một sự kiện.
2. Mã định danh là **mã vô nghĩa, cố định**, giống mã học viên hiện tại (không chứa tên, trường, vai trò). Dùng lại đúng cơ chế sinh mã đang có trong app.
3. **Vai trò gắn theo sự kiện, có thời hạn.** Một người có thể là HLV trạm ở sự kiện này, Ban tổ chức ở sự kiện khác. Quyền chấm điểm, đổi quà, check-in chỉ có hiệu lực khi người đó **đang được phân công** trong sự kiện **đang diễn ra**.
4. **QR trên thẻ đeo chỉ là định danh, không phải mật khẩu.** Ai nhặt được thẻ cũng không làm được gì nếu chưa đăng nhập.
5. **Kích hoạt một lần, đăng nhập lâu dài**: cùng cơ chế với Golf Passport (lần đầu xác thực, tự đặt mật khẩu; từ lần sau đăng nhập bình thường). Riêng đợt 10/10 xác thực qua **email** như module 10 (Zalo/SMS làm sau).
6. **Không phá dữ liệu cũ.** Mọi thay đổi cơ sở dữ liệu là migration **chỉ thêm** (bảng, cột, chính sách mới). Làm trên **staging** trước. Không xóa, không đổi tên bảng đang có.
7. **Trẻ em là Đại sứ** (dưới 18 tuổi): hồ sơ của con nằm dưới tài khoản phụ huynh theo quan hệ đã có trong app. Con xem được checklist của mình; **không có quyền ghi điểm vào hệ thống** (HLV ghi). Ảnh, số điện thoại của các con không hiển thị cho nhân sự khác.

## 2. Trước khi code: việc Claude Code phải làm

1. Đọc schema Supabase hiện có (staging `zrfipnqkjrhzrscaaeth`) và các spec trong `docs/spec/`. Xác định:
   - bảng đang giữ **hồ sơ người** và **mã Golf Passport**;
   - bảng **sự kiện** và các bảng của module 10 (check-in, thẻ sự kiện, điểm trạm, quầy quà);
   - cơ chế **kích hoạt / đăng nhập / xác thực email** đang dùng;
   - quan hệ **phụ huynh – con** đang có.
2. Viết ra `docs/spec/11-mapping.md`: bảng nào dùng lại, bảng nào thêm mới, tên cột cụ thể. **Dừng lại cho anh Long xác nhận** trước khi chạy migration.

## 3. Dữ liệu cần thêm (khái niệm, tên bảng do Claude Code đặt theo quy ước repo)

| Thực thể | Nội dung chính | Ghi chú |
| --- | --- | --- |
| Vai trò sự kiện | mã vai (A, B, C, D, E, F, G, K), tên vai, mã ô (C1…C4, D1…D5…), vị trí mặc định, màu thẻ đeo, nhãn thẻ đeo | Seed từ `data/vai_tro.csv` |
| Nhiệm vụ mẫu | mã vai, thứ tự, giai đoạn (1–6), giờ, khu vực, việc cần làm | Seed từ `data/nhiem_vu_mau.csv`. Là mẫu dùng lại nhiều sự kiện |
| Phân công | sự kiện, **hồ sơ người (mã Passport)**, mã ô, vị trí cụ thể, trạng thái thẻ đeo (chưa in / đã in / đã nhận), trạng thái kích hoạt | Một người có thể có nhiều phân công ở nhiều sự kiện |
| Việc của người | sinh từ nhiệm vụ mẫu khi phân công; trạng thái: trống / **Xong** / **Vướng**; ghi chú; ai cập nhật; lúc nào | BTC thêm, sửa, xóa việc riêng cho từng người hoặc cả vai |
| Thùng đồ | thùng, vật dụng, số lượng, mã vai chuẩn bị, đã đóng thùng, đã thu hồi | Seed từ `data/thung_do.csv` |
| Rút kinh nghiệm | loại (Chạy tốt / Cần sửa), nội dung, người ghi, đề xuất | Theo sự kiện |
| Lịch sử tham gia | hồ sơ người, sự kiện, vai, mức hoàn thành checklist | Tự sinh khi đóng sự kiện; hiện trong hồ sơ năng lực |

Phân quyền bằng RLS: người thường chỉ đọc và cập nhật **việc của chính mình** trong sự kiện đang diễn ra; vai A (điều phối) và admin xem, sửa toàn bộ sự kiện.

## 4. Luồng sử dụng

### 4.1. BTC nhập danh sách nhân sự (màn admin)
- Dán hoặc tải CSV: `Họ tên; Số điện thoại; Email; Mã ô; Vị trí`.
- Với mỗi dòng: **tìm hồ sơ có sẵn theo số điện thoại hoặc email**. Có rồi thì dùng hồ sơ đó (giữ mã Passport cũ). Chưa có thì tạo hồ sơ mới, cấp mã Passport mới theo cơ chế hiện có.
- Trùng nghi vấn (cùng tên, khác số) thì đưa vào danh sách chờ admin chọn, không tự gộp.
- Gán phân công, sinh "việc của người" từ nhiệm vụ mẫu của vai.

### 4.2. In decal QR thẻ đeo
- Nội dung QR: `https://app.vncentre.net/p/<mã Passport>` (cùng dạng đường dẫn hồ sơ đang dùng; nếu app đang dùng dạng khác thì theo dạng đang có).
- Xuất **PDF A4** lưới decal **2,5 × 2,5 cm**, dưới mỗi mã in nhỏ họ tên và mã ô (ví dụ "C2 · Nguyễn Văn A") để dán đúng thẻ.
- Đánh dấu trạng thái thẻ: đã in, đã nhận.

### 4.3. Người làm việc quét QR trên thẻ của mình
- **Chưa kích hoạt:** nhập số điện thoại đã đăng ký → xác thực email (như module 10) → đặt mật khẩu → vào trang "Hôm nay".
- **Đã kích hoạt nhưng chưa đăng nhập:** màn đăng nhập, điền sẵn định danh.
- **Đã đăng nhập:** vào thẳng trang "Hôm nay".
- Người khác quét thẻ của mình: chỉ thấy tên và vai (trang công khai tối giản), không thấy checklist, không có nút chức năng.

### 4.4. Trang "Hôm nay" theo vai
- Đầu trang: tên, vai, vị trí, giờ hiện tại, việc tiếp theo.
- Checklist nhóm theo 6 giai đoạn; mỗi việc có nút **Xong** và **Vướng** (Vướng bắt buộc ghi lý do, tự báo vai A).
- Nút chức năng theo vai, chỉ hiện khi sự kiện đang diễn ra:
  - **C (HLV trạm):** chấm điểm trạm của mình (module 10).
  - **E (Check-in):** check-in người chơi (module 10).
  - **F (Quầy quà):** quét thẻ, nhập điểm, Hoàn thành, phát quà (module 10).
  - **A (Điều phối):** bảng điều phối (4.5).
  - **D (Đại sứ):** chỉ checklist và giờ giấc.
  - **K (Khách mời):** danh sách khách và giờ đón.
- Dùng tốt trên điện thoại, chữ to, bấm một chạm, chịu được mạng yếu (lưu tạm, đồng bộ lại khi có mạng).

### 4.5. Bảng điều phối (vai A)
- % hoàn thành theo vai và theo giai đoạn, giống tab Tổng quan của bảng Google Sheet.
- Danh sách **Vướng** mới nhất lên đầu; danh sách **việc quá giờ chưa xong**.
- Ai chưa nhận thẻ, ai chưa kích hoạt tài khoản.
- Thùng đồ: đã đóng thùng, đã thu hồi.
- Nút thêm việc cho một người hoặc cả vai.

### 4.6. Sau sự kiện
- Admin bấm "Đóng sự kiện": khóa checklist, tắt quyền chức năng của mọi phân công, sinh **lịch sử tham gia** vào hồ sơ từng người.
- Hồ sơ người hiện mục "Hoạt động cộng đồng": tên sự kiện, ngày, vai, mức hoàn thành. Với HLV CGI và Đại sứ, đây là dữ liệu cho hồ sơ năng lực lâu dài.
- Tab rút kinh nghiệm mở cho mọi người đã tham gia trong 7 ngày.

## 5. Tiêu chí nghiệm thu (kiểm trên staging)

1. Nhập CSV 20 người, trong đó 1 người **đã có hồ sơ Passport**: người đó giữ nguyên mã cũ, không sinh hồ sơ trùng.
2. In PDF decal: quét bằng điện thoại ra đúng đường dẫn hồ sơ của đúng người.
3. Người chưa kích hoạt quét QR → xác thực email → đặt mật khẩu → thấy đúng checklist vai mình.
4. Người khác quét thẻ của người đó: không thấy checklist, không có nút chức năng.
5. HLV trạm C2 chỉ chấm được trạm Chipping, chỉ khi sự kiện đang diễn ra; sau "Đóng sự kiện" nút chấm điểm biến mất.
6. Bấm Vướng mà không ghi lý do thì không lưu được; vai A thấy ngay mục Vướng.
7. Bảng điều phối: % hoàn thành khớp số việc Xong / tổng việc.
8. Hồ sơ Đại sứ là trẻ em: phụ huynh đăng nhập thấy checklist của con; con không có nút chấm điểm.
9. Sau sự kiện, đăng nhập lại bằng tài khoản ấy vẫn vào được, hồ sơ có dòng "Hoạt động cộng đồng".
10. Không bảng, cột, dữ liệu cũ nào bị xóa hoặc đổi tên.

## 6. Thứ tự làm và điểm dừng

Làm theo từng bước, xong bước nào **chạy kiểm thử, báo cáo, dừng chờ xác nhận** rồi mới sang bước sau:

1. Bản đồ dữ liệu `11-mapping.md` (mục 2). **Dừng.**
2. Migration + seed vai trò, nhiệm vụ mẫu, thùng đồ. **Dừng.**
3. Nhập danh sách (4.1) + in decal QR (4.2). **Dừng.** ← tối thiểu cho 10/10
4. Quét QR, kích hoạt, trang "Hôm nay" với checklist (4.3, 4.4 phần checklist). **Dừng.** ← tối thiểu cho 10/10
5. Gắn nút chức năng theo vai vào module 10 (4.4 phần chức năng).
6. Bảng điều phối (4.5).
7. Đóng sự kiện, lịch sử tham gia (4.6).

**Phương án dự phòng cho 10/10:** nếu tối 9/10 chưa xong bước 4, ngày 10/10 dùng bảng Google Sheet "Điều phối nhân sự 10/10", decal QR thẻ đeo trỏ vào tab của vai. Các bước còn lại làm tiếp sau sự kiện, dữ liệu nhân sự nhập vào app vẫn dùng được.

## 7. Dữ liệu mẫu đi kèm

- `data/vai_tro.csv`: 20 ô thuộc 8 vai (A, B, C1–C4, D1–D5, E1–E3, F1–F2, G1–G3, K1), có màu và nhãn thẻ đeo.
- `data/nhiem_vu_mau.csv`: 70 nhiệm vụ theo 6 giai đoạn của ngày 10/10.
- `data/thung_do.csv`: 26 vật dụng chia theo thùng.

Giờ trong nhiệm vụ mẫu là giờ của ngày 10/10; khi dùng cho sự kiện khác, BTC sửa giờ trên màn admin, không sửa file mẫu.
