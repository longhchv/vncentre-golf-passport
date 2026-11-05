# Đặc tả Khu quản trị sân golf trong Golf Passport

Oct 23, 2026 · @Long Vu Anh

## Mục tiêu và quyết định đã chốt

Khu quản trị sân trong Golf Passport cho admin VN Centre đưa lên courses.vncentre.net cả sân đo độ khó lẫn sân Long chỉ đến chơi, ở Việt Nam và nước ngoài, mỗi sân mới mất khoảng 15–20 phút.

| Quyết định | Ngày chốt |
| --- | --- |
| Nền tảng sân và chuyến đi là một khu trong Golf Passport, không làm app riêng; có tiếng Anh từ đầu | 21/10/2026 |
| Công cụ nhập sân trải nghiệm và gợi ý quanh sân đặt trong Golf Passport | 23/10/2026 |
| Không dùng Google Maps Platform (Việt Nam là vùng bị cấm theo điều khoản Google); gợi ý quanh sân làm bán tự động: Minh tra cứu và xuất danh sách, khu quản trị nhập; Claude viết mô tả song ngữ; số sao lưu cứng, Minh cập nhật khi cần | 23/10/2026 |
| Tiêu chí gợi ý: \~60 phút lái xe, 4.0★/50 lượt (trẻ em, thiên nhiên 3.0★/20), ăn uống và cà phê tối đa 20 | 23/10/2026 |
| Ảnh Long tự chụp đưa ra ngoài đều đóng logo; không tự lấy ảnh từ fanpage, website địa điểm | 22–23/10/2026 |

**Ngoài phạm vi giai đoạn này:** đặt sân, hoa hồng khách sạn, tích điểm check-in. App CSR giữ nguyên việc đo độ khó, không thêm màn hình mới.

## Hai loại sân

Cả hai loại dùng chung một mẫu trang trên website; khác nhau ở nguồn số liệu và nhãn ghi rõ cho người xem.

|  | Sân đo độ khó | Sân trải nghiệm |
| --- | --- | --- |
| Nhãn trên website | "Đoàn đo độ khó sân đo trực tiếp" | "VN Centre trải nghiệm" |
| Tee, chiều dài từng hố | Số đo của đoàn, lấy từ app CSR | Theo scorecard của sân: Long gửi ảnh vào chat, Minh đọc ra bảng, admin dán vào app |
| Course Rating / Slope | Ô chờ kết quả WHS chính thức | Không hiện |
| Ảnh | Ảnh đoàn đo theo từng hố | Ảnh Long chụp, không bắt buộc đủ từng hố |
| Cảm nhận, điểm chấm, mẹo chơi | Không có | Có: điểm sân, độ khó cảm nhận, dịch vụ, đáng tiền, mẹo từng hố nếu có |
| Ngày | Ngày đo | Ngày chơi |
| Gợi ý quanh sân, địa điểm đã ghé, phần cộng đồng | Có | Có |

Một sân trải nghiệm sau này được đo thì chuyển thành sân đo, giữ lại ảnh, cảm nhận và gợi ý đã có.

## Các màn hình

Khu quản trị sân gồm 6 màn, chỉ hiện với tài khoản có vai trò admin VN Centre; giao diện song ngữ theo chuẩn Golf Passport, dùng tốt trên điện thoại để nhập ngay tại sân.

| Màn | Dùng để | Thành phần chính |
| --- | --- | --- |
| Danh sách sân | Xem mọi sân, lọc theo quốc gia, loại, trạng thái | Bộ lọc Việt Nam / Quốc tế, nhãn Đo / Trải nghiệm, trạng thái Nháp / Đã đăng, nút Thêm sân |
| Thêm sân | Tạo sân mới trong 1 phút | Nhập tên sân, quốc gia, tỉnh, toạ độ (dán từ link Google Maps hoặc chấm trên bản đồ), điện thoại, website; hoặc dán khối thông tin Minh gửi; chọn loại sân |
| Thông tin sân | Số hố, par, tee, tiện ích, đặt sân | Bảng tee nhập tay hoặc dán bảng Minh đọc từ ảnh scorecard; danh sách tiện ích như website hiện tại; ô đặt sân |
| Ảnh và cảm nhận | Ảnh Long chụp và bài trải nghiệm | Tải nhiều ảnh, tự đóng logo, gắn nhãn (hố, club house, hoàng hôn…); ô gõ vài ý, máy viết thành bản Việt và Anh; điểm chấm |
| Quanh sân | Gợi ý tự động và địa điểm đã ghé | Nút Nhập danh sách Minh gửi, màn duyệt 8 tab, nút viết mô tả Việt/Anh cho nơi còn thiếu, thêm nơi đã ghé kèm ảnh và điểm |
| Xem trước và đăng | Kiểm tra rồi đưa lên website | Xem trước trang sân đúng như website, kiểm tra thiếu gì, nút Đăng lên website |

Với sân đo, các màn này chỉ cho sửa ảnh, cảm nhận và quanh sân; số đo tee vẫn do app CSR quản lý.

## Luồng thêm một sân trải nghiệm

Ví dụ Long vừa chơi một sân ở Thái Lan: có thể làm ngay trên điện thoại tại sân, phần viết cảm nhận làm sau.

1. **Thêm sân:** nhập tên sân và quốc gia, dán link Google Maps của sân để lấy toạ độ (hoặc dán khối thông tin Minh gửi).
2. **Scorecard:** gửi ảnh scorecard vào chat với Minh; Minh đọc ra bảng par và chiều dài từng tee; Long dán vào app, kiểm tra rồi lưu. Đơn vị giữ đúng scorecard (yard hoặc mét), website tự đổi.
3. **Ảnh:** chọn ảnh từ thư viện điện thoại; app đóng logo, nén nhỏ, gợi ý nhãn.
4. **Cảm nhận:** gõ hoặc nói vài ý ("fairway hẹp, gió mạnh chiều, caddie giỏi"), chấm điểm; máy viết đoạn giới thiệu và cảm nhận bằng tiếng Việt và tiếng Anh theo giọng của Long; Long sửa.
5. **Quanh sân:** nhắn Minh tên sân, Minh tra cứu và gửi danh sách; bấm Nhập danh sách Minh gửi, duyệt, Lưu; thêm nhà hàng, khách sạn đã ghé kèm ảnh và điểm.
6. **Xem trước:** app báo còn thiếu gì (ví dụ chưa có ảnh đại diện, thiếu bản tiếng Anh).
7. **Đăng lên website:** trang sân và trang chủ cập nhật ngay, không cần Cloudflare.

Thời gian ước: bước 1–3 khoảng 5 phút tại sân; bước 4–7 khoảng 10–15 phút.

## Dữ liệu

Dùng chung Supabase hiện tại (dự án zrfipnqkjrhzrscaaeth), thêm 5 bảng `gc_` cho khu quản trị sân; trang đã đăng vẫn ghi vào bảng `site_courses` và kho ảnh `site-photos` đã tạo hôm 23/10.

| Bảng | Giữ gì |
| --- | --- |
| `gc_courses` | Mỗi sân một dòng: loại (đo / trải nghiệm), mã sân bên app CSR nếu là sân đo, tên Việt và Anh, quốc gia, tỉnh, toạ độ, mã Google, điện thoại, website, số hố, par, đơn vị, giới thiệu, tiện ích, đặt sân, ngày chơi, trạng thái |
| `gc_tees` | Bộ tee của sân trải nghiệm: tên, màu, giới tính, par và chiều dài từng hố, nguồn (scorecard) |
| `gc_photos` | Ảnh đã đóng logo: đường dẫn trong kho, loại, hố, chú thích Việt và Anh |
| `gc_reviews` | Cảm nhận của VN Centre: điểm từng mục, bài Việt và Anh, mẹo từng hố |
| `gc_places` | Địa điểm quanh sân (gợi ý và đã ghé), đúng các trường website đang dùng |

- **Quyền:** chỉ admin Golf Passport hoặc admin CSR đọc và ghi các bảng `gc_`; người xem website chỉ đọc trang đã đăng.
- **Sân đo:** số đo tee và ảnh từng hố vẫn nằm bên app CSR; khu quản trị chỉ đọc chúng khi dựng trang.
- **Địa điểm quanh sân:** một kho chung là bảng `gc_places`, hai nơi cùng sửa: app CSR (cho sân đo) và Golf Passport (mọi sân), team tiện app nào dùng app đó (Long chốt 23/10/2026). Dữ liệu đang nằm trong app CSR (như 94 nơi của Xuân Thành) chuyển một lần sang `gc_places`; sau đó app CSR đọc và ghi thẳng vào bảng này thay vì lưu riêng, để hai app luôn thấy cùng một danh sách. Mỗi dòng ghi ai sửa, lúc nào, từ app nào; hai người sửa cùng một nơi thì bản lưu sau được báo trước khi ghi đè. Phần sửa app CSR làm bên chat CSR.

## Website

courses.vncentre.net giữ đường dẫn hiện tại cho sân Việt Nam và thêm tầng quốc gia cho sân nước ngoài, để khách Việt và khách quốc tế đều tìm được nhanh.

- **Đường dẫn:** sân Việt Nam giữ `/san/<tên-sân>/` như bây giờ; sân nước ngoài là `/san/<mã-quốc-gia>/<tên-sân>/`, ví dụ `/san/th/black-mountain/`.
- **Trang chủ:** bộ lọc Việt Nam / Quốc tế và theo quốc gia; mỗi thẻ sân có nhãn Đã đo hoặc Trải nghiệm.
- **Ngôn ngữ:** sân nước ngoài mở sẵn bằng tiếng Anh, người xem vẫn đổi được sang tiếng Việt.
- **Đơn vị:** chiều dài hiện theo yard (như hiện tại), kèm mét khi scorecard của sân dùng mét; khoảng cách quanh sân hiện km.
- **Trang sân trải nghiệm:** thêm mục "Cảm nhận của VN Centre" với điểm chấm; không có ô Course Rating / Slope; ghi "Số liệu tee theo scorecard của sân".
- **SEO cho khách quốc tế:** tiêu đề và mô tả trang có bản tiếng Anh, có dữ liệu cấu trúc GolfCourse như trang sân hiện tại.

## Giai đoạn triển khai

Làm 4 giai đoạn, xong mỗi giai đoạn dừng chờ Long duyệt; phần trong Golf Passport làm bằng Claude Code trên kho mã GitHub của Golf Passport, theo cách Long đang dựng app.

1. **GĐA – nền chung (Minh, chat website):** tách bộ tạo trang sân (đang nằm trong app CSR) thành một gói dùng chung cho cả app CSR và Golf Passport; viết Edge Function (chỉ còn phần Claude viết mô tả); tạo 5 bảng `gc_`.
2. **GĐB – nhập sân (Claude Code):** các màn Danh sách sân, Thêm sân, Thông tin sân, Ảnh; thử bằng một sân Long đã chơi.
3. **GĐC – cảm nhận và quanh sân (Claude Code):** màn Cảm nhận có máy viết song ngữ; màn Quanh sân nhập danh sách Minh gửi.
4. **GĐD – đăng và quốc tế:** Xem trước và Đăng lên website; website thêm tầng quốc gia, bộ lọc, nhãn Đã đo / Trải nghiệm; đưa sân nước ngoài đầu tiên lên.

**Cách làm với Claude Code:** xuất tài liệu này ra Markdown, đặt vào thư mục `docs/spec/` của kho Golf Passport cùng đặc tả Gợi ý quanh sân; mỗi giai đoạn Long giao một câu lệnh, Minh soạn sẵn câu lệnh và duyệt kết quả.

Long đã quyết (23/10/2026):

- [x] Địa điểm quanh sân của sân đo sửa được ở cả app CSR và Golf Passport, cùng một kho dữ liệu chung.
- [ ] Không làm máy đọc scorecard trong app; Long gửi ảnh scorecard trực tiếp vào chat cho Minh đọc.
- [x] Nhãn trên website cho sân trải nghiệm: "VN Centre trải nghiệm".
