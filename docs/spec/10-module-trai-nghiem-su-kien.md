# 10 · Module Trải nghiệm sự kiện (ngoại lệ trong đợt 1\)

Phiên bản: v0.8 (sửa lần 3\) · Ngày: 07/10/2026 · Người soạn: Minh · Chủ sản phẩm duyệt: Vũ Anh Long

**Sửa lần 2:** chốt tên miền app.vncentre.net; điểm do HLV nhập **tại quầy đổi quà** và bấm hoàn thành cho từng người; thêm luồng **tự xác nhận bằng ảnh thẻ điểm** cho người không qua quầy, admin duyệt; chứng nhận cấp **theo từng người đã hoàn thành**, không cấp cho người chưa hoàn thành.

**Sửa lần 3:** cho sự kiện 10/10, **mã xác thực gửi qua email**, không qua Zalo/SMS (chưa kịp cấu hình). Khi Zalo/SMS sẵn sàng sẽ bổ sung bước xác thực SĐT (mục E6b).

## 0\. Vì sao có file này

Quy tắc số 1 của README là "chỉ build đợt đang được giao". Module này là **ngoại lệ có chủ đích**, chủ sản phẩm duyệt ngày 07/10/2026, vì có hạn dùng thật: **Lễ phát động "Mỗi người dân lựa chọn ít nhất một môn thể thao phù hợp để tập luyện thường xuyên", 16h00–18h00 ngày 10/10/2026, phố Đinh Tiên Hoàng, quanh hồ Hoàn Kiếm, Hà Nội.**

- Chỉ build đúng phần mô tả trong file này. Không kéo theo tính năng đợt 2–7.  
- Module **dựa trên** F1, F2, F9, F10, F11, F18 của 02-dot-1-nen-tang.md. Ở đâu file này không nói gì thì làm theo file 02\.  
- Ở đâu file này nói khác file 02, **file này thắng**, nhưng chỉ cho thẻ thuộc hạng event\_experience.

## 1\. Mục tiêu

1. Người đến khu golf nhận một thẻ có QR, quét và ghi tên \+ SĐT trong **dưới 30 giây**, không cần tài khoản, không OTP.  
2. Tại 4 trạm, HLV đóng dấu điểm lên thẻ giấy, không dùng app.  
3. Người chơi đủ điểm cả 4 trạm mang thẻ tới **quầy đổi quà**: HLV quét thẻ, nhập điểm, bấm **Hoàn thành**, phát quà.  
4. Người không qua quầy tự quét thẻ, **chụp ảnh thẻ điểm** gửi lên; admin duyệt thì mới hoàn thành.  
5. Chỉ người đã hoàn thành mới có chứng nhận. Muốn tải, người chơi tạo tài khoản và xác thực bằng mã gửi qua **email**.  
6. VN Centre thu được danh sách liên hệ, có đánh dấu ai đồng ý được liên hệ. Hồ sơ nằm sẵn trong Golf Passport để sau nâng thành học viên.

Quy mô dự kiến: 100 đến khoảng 1.000 người. Thiết kế không được giả định con số cố định.

## 2\. Phạm vi

**Có:** hạng hộ chiếu event\_experience và lô thẻ sự kiện (F11) · đối tượng sự kiện gắn với một lớp loại "Trải nghiệm sự kiện" · ghi tên tại chỗ (tự quét hoặc đăng ký hộ) · màn hình quầy đổi quà · luồng tự xác nhận bằng ảnh và hàng chờ duyệt của sự kiện · chứng nhận theo từng người · kích hoạt tài khoản (F1) · trang hồ sơ rút gọn · xuất Excel · nâng thành học viên.

**Không có:** chấm điểm trên app tại 4 trạm; kho quà và đổi điểm lấy quà (đợt 3); bảng xếp hạng; thanh toán; gửi Zalo/SMS hàng loạt cho người trải nghiệm.

## 3\. Dữ liệu (bổ sung vào 01-du-lieu.md)

| Thay đổi | Nội dung |
| :---- | :---- |
| passport\_tiers thêm 1 dòng | code \= event\_experience, tên VI "Trải nghiệm sự kiện", EN "Event Experience". Thêm cột cấu hình counts\_toward\_single\_active (boolean); hạng này đặt false. validity\_months admin chỉnh |
| passports.status thêm giá trị | event\_registered: thẻ đã ghi tên \+ SĐT, chưa có tài khoản. Vòng đời thẻ sự kiện: unassigned → event\_registered → active → (khi nâng hạng) retired |
| students.verification\_status thêm giá trị | event\_guest: hồ sơ người trải nghiệm. **Không** vào hàng chờ duyệt F12 |
| student\_guardians.relationship thêm giá trị | self: người đăng ký chính là người chơi |
| student\_guardians.linked\_via thêm giá trị | event\_card |
| consents thêm loại | contact\_by\_vncentre: đồng ý để VN Centre liên hệ. Tuỳ chọn, **mặc định không tick** |
| class\_types thêm 1 dòng | event\_experience |
| Bảng mới events | id, org\_id, class\_id, name\_vi, name\_en, event\_date, venue, registration\_opens\_at, registration\_closes\_at, self\_claim\_closes\_at (hạn gửi ảnh tự xác nhận), status (draft / open / closed / archived), zalo\_oa\_url, timestamps |
| Bảng mới event\_stations | id, event\_id, code (putt, chip, pitch, full\_swing), name\_vi, name\_en, sort\_order, max\_score, score\_step, min\_score\_to\_complete. Admin chỉnh được. **Mặc định cả 4 trạm (anh Long chốt 07/10): score\_step \= 5, min\_score\_to\_complete \= 5**, tức là trạm nào có ít nhất một dấu 5 điểm là đã qua trạm |
| Bảng mới event\_scores | id, event\_id, passport\_id, station\_id, score (số nguyên), entered\_by, entered\_at, updated\_by, updated\_at. Duy nhất theo (passport\_id, station\_id). **Gắn theo thẻ, không theo học viên** |
| Bảng mới event\_participations | Một dòng mỗi thẻ đã ghi tên: id, event\_id, passport\_id, student\_id, completion\_status (registered / pending\_review / completed / rejected), completed\_via (counter / self\_claim), completed\_at, completed\_by, gift\_given\_at, gift\_given\_by |
| Bảng mới event\_completion\_claims | Yêu cầu tự xác nhận: id, participation\_id, photo\_path (kho riêng tư), submitted\_at, status (pending / approved / rejected), reviewed\_by, reviewed\_at, reject\_reason |
| certificate\_templates thêm 1 mẫu | event\_experience (mục 5\) |
| Tổng điểm tích lũy | Tính từ event\_scores (view hoặc hàm), hiện trên hồ sơ. **Không** tạo cột lưu cứng. Khi build đợt 3, điểm sự kiện được chuyển thành giao dịch trong sổ điểm thưởng; hệ số quy đổi trong phu-luc-C, admin chỉnh |

Thông tin tuỳ chọn khi ghi tên: tuổi lưu dạng age\_at\_registration (số), nơi ở dạng chữ tự do. Không bắt ngày sinh tại chỗ.

**Vai trò mới event\_staff** (gán theo sự kiện): HLV ở quầy đổi quà và BTC. Được ghi tên hộ, nhập điểm, bấm hoàn thành, đánh dấu đã phát quà. **Không** thấy SĐT, email của người chơi (như R8). Admin duyệt ảnh tự xác nhận và xem toàn bộ.

Phân quyền dữ liệu theo 01-du-lieu.md mục 9\. Ảnh thẻ điểm nằm ở kho riêng tư, chỉ admin xem, tải qua link có hạn.

## 4\. Các luồng

### E1. Chuẩn bị sự kiện (admin)

1. Tạo sự kiện: tên, ngày, địa điểm, khung giờ ghi tên, hạn tự xác nhận, link Zalo OA. Hệ thống tự tạo lớp loại event\_experience và 4 trạm mặc định.  
2. Tạo lô thẻ theo F11, chọn hạng event\_experience, gắn lô với sự kiện. Thẻ **không gán trước** cho ai.  
3. Xuất PDF tờ decal. QR trỏ tới **https\://app.vncentre.net/p/{passport\_code}**. **Bổ sung cho F11:** admin chỉnh được **kích thước tem** (rộng, cao) để vừa ô dán QR trên thẻ danh thiếp 90 × 55 mm.  
4. Tạo tài khoản nhân viên (F1) cho HLV quầy và BTC, gán vai trò event\_staff cho sự kiện.

### E2. Ghi tên tại chỗ

Mở /p/{passport\_code}, thẻ thuộc hạng event\_experience, trạng thái unassigned, sự kiện đang open, trong khung giờ ghi tên:

1. Màn hình chào (linh vật rồng): tên sự kiện, ngày, "Ghi tên để nhận chứng nhận trải nghiệm golf".  
2. Form một màn hình:  
   - **Ai chơi?** "Tôi chơi" / "Con tôi chơi" (bắt buộc).  
   - **Họ tên người chơi** (bắt buộc).  
   - **Số điện thoại liên hệ** của người lớn (bắt buộc, chuẩn hoá như F10, mặc định \+84).  
   - Tuổi người chơi, nơi ở (tuỳ chọn).  
   - Ô "Tôi đồng ý để VN Centre liên hệ, gửi thông tin các lớp golf" (tuỳ chọn, mặc định không tick).  
   - Dòng nhỏ: "Bằng việc ghi tên, bạn đồng ý với Điều khoản và Chính sách bảo mật", có link.  
3. Bấm "Ghi tên" → **không gửi OTP, không tạo tài khoản đăng nhập**. Hệ thống tạo: students (event\_guest); guardians chưa có tài khoản, SĐT chưa xác minh; student\_guardians (self hoặc parent, linked\_via \= event\_card); enrollments vào lớp sự kiện; consents; event\_participations (registered). Thẻ chuyển event\_registered.  
4. Màn hình xong: "Đã ghi tên **Nguyễn V. A.**, thẻ số **XXXX-XXXX**. Chơi đủ 4 trạm, rồi mang thẻ tới **quầy đổi quà** để hoàn thành và nhận quà." Nút "Theo dõi Zalo OA VN Centre".  
5. Mục tiêu thời gian: dưới 30 giây trên 4G.

**Đăng ký hộ** (event\_staff, trên máy tính bảng hoặc điện thoại): màn hình sự kiện → "Đăng ký hộ" → quét QR hoặc gõ mã thẻ → cùng form bước 2\.

Thẻ đã ghi tên thì **không ghi tên lại được**. Sai thông tin → admin sửa (ghi nhật ký). Dùng lại giới hạn nhập mã sai theo IP của F2; không giới hạn số lần ghi tên thành công theo IP (nhiều người dùng chung mạng).

### E3. Tại 4 trạm

Không dùng app. HLV đóng dấu 10 điểm và 5 điểm lên thẻ giấy, mỗi trạm lấy cú tốt nhất. Ghi ở đây để đội code hiểu dữ liệu đầu vào của E4.

### E4. Quầy đổi quà: nhập điểm và hoàn thành (HLV, ngay tại sự kiện)

1. HLV mở màn hình "Quầy đổi quà" của sự kiện → quét QR thẻ (camera) hoặc gõ mã.  
2. Hiện **tên người chơi** (không hiện SĐT). Nếu thẻ chưa ghi tên: hiện nút "Ghi tên hộ" (form E2) trước khi nhập điểm.  
3. 4 ô điểm theo thứ tự trạm, bàn phím số. Mỗi ô là **một số tổng của trạm** (HLV đếm dấu trên thẻ). Kiểm tra: số nguyên, từ 0 đến max\_score, chia hết cho score\_step.  
4. Nút **Hoàn thành** chỉ bấm được khi **cả 4 trạm đạt min\_score\_to\_complete**. Chưa đủ → báo trạm nào còn thiếu, chỉ lưu điểm.  
5. Bấm Hoàn thành → completion\_status \= completed, completed\_via \= counter, ghi completed\_at, completed\_by → **phát hành chứng nhận ngay cho người này** (F9, mẫu mục 5\) → ghi gift\_given\_at, gift\_given\_by.  
6. Thẻ đã completed quét lại ở quầy → báo "**Đã hoàn thành và đã nhận quà lúc …**", chặn phát quà lần hai.  
7. Cả quy trình mỗi thẻ mục tiêu **dưới 20 giây**, dùng được một tay trên điện thoại.

### E5. Tự xác nhận hoàn thành bằng ảnh (người không qua quầy)

Mở /p/{passport\_code}, thẻ đã ghi tên, completion\_status \= registered hoặc rejected, trước self\_claim\_closes\_at:

1. Màn hình: tên che bớt, dòng "Bạn chưa xác nhận hoàn thành tại quầy". Nút **"Tự xác nhận hoàn thành"**.  
2. Yêu cầu chụp ảnh **cả mặt thẻ có 4 ô điểm**, rõ các dấu. Nén ảnh trên máy trước khi tải lên (dưới 1 MB). Không cần tài khoản ở bước này.  
3. Gửi → tạo event\_completion\_claims (pending), completion\_status \= pending\_review → màn hình "Đã gửi, BTC sẽ kiểm tra. Quét lại thẻ này để xem kết quả."  
4. **Admin duyệt** trong "Hàng chờ xác nhận" của sự kiện (tách khỏi F12): xem ảnh cạnh 4 ô điểm → nhập điểm từ ảnh → nếu cả 4 trạm đạt min\_score\_to\_complete thì **Duyệt** → completed, completed\_via \= self\_claim → phát hành chứng nhận.  
5. **Từ chối** (ảnh mờ, thiếu dấu, không phải thẻ này): bắt buộc lý do → rejected → người chơi quét lại thấy lý do và gửi ảnh mới được.  
6. Mỗi thẻ có tối đa **3** yêu cầu đang chờ hoặc bị từ chối; quá số này phải liên hệ BTC (con số trong app\_settings).  
7. **Chưa được duyệt thì không có chứng nhận.**

### E6. Kích hoạt tài khoản và tải chứng nhận

Mở /p/{passport\_code}, thẻ event\_registered:

1. Màn hình theo trạng thái:  
   - registered: "Bạn chưa hoàn thành" \+ nút tự xác nhận (E5).  
   - pending\_review: "Đang chờ BTC xác nhận".  
   - rejected: lý do \+ nút gửi lại ảnh.  
   - completed: "**Chúc mừng, bạn đã hoàn thành\!**" \+ nút "Tạo tài khoản để nhận chứng nhận".  
2. Tạo tài khoản chỉ mở khi completed. **Xác thực qua email, không dùng F1 gửi OTP Zalo/SMS** (ngoại lệ tạm thời cho module này):  
   - **Kiểm tra SĐT trước:** người dùng nhập lại **đầy đủ SĐT** đã ghi khi nhận thẻ. Khớp mới đi tiếp. Sai quá 5 lần → khoá thẻ 24 giờ, báo admin. Người nhặt được thẻ không biết SĐT nên không đi tiếp được. Thẻ chưa có SĐT (do HLV ghi tên hộ không có số) → nhập SĐT mới, bỏ qua bước khớp.  
   - Nhập **email** → gửi mã 6 số qua email. Giới hạn mã (hạn 5 phút, sai tối đa 5 lần, gửi lại sau 60 giây, trần mỗi ngày) lấy từ app\_settings như F1.  
   - Màn hình nhắc: "Không thấy mã? Kiểm tra thư mục Spam/Quảng cáo."  
   - Email đã có tài khoản → yêu cầu đăng nhập rồi nối thẻ vào tài khoản đó.  
3. Đặt mật khẩu (tối thiểu 8 ký tự). Đăng nhập các lần sau bằng **email \+ mật khẩu**. SĐT lưu trong tài khoản, đánh dấu **chưa xác minh**.  
4. Đồng ý: Điều khoản và Chính sách (bắt buộc); đồng ý liên hệ (hiện lại lựa chọn đã tick, sửa được); dùng ảnh/video cho truyền thông (tuỳ chọn, mặc định không tick).  
5. Hoàn tất: thẻ active, ghi activated\_at, activated\_by\_guardian\_id; guardian có tài khoản; email đã xác minh; SĐT chưa xác minh.  
6. **Nhiều người chơi cùng SĐT trong cùng sự kiện** (một phụ huynh nhiều con): sau khi khớp SĐT ở bước 2, hiện danh sách tên che bớt → "Nối luôn các hồ sơ này vào tài khoản?" → kích hoạt tất cả, không gửi thêm mã. Hồ sơ nào chưa completed vẫn nối được, chỉ chưa có chứng nhận.

**Trang hồ sơ trải nghiệm** (relationship \= self thì tiêu đề "Hồ sơ của tôi"):

- Tên, sự kiện đã tham gia, ngày, trạng thái hoàn thành.  
- Điểm từng trạm và **Tổng điểm tích lũy**, kèm dòng "Điểm được tích lũy cho cả hành trình chơi golf sau này".  
- Chứng nhận (nếu đã hoàn thành): xem, tải PDF, chia sẻ link xác thực.  
- Thẻ "Muốn học golf tiếp?" và nút "Theo dõi Zalo OA".  
- **Ẩn** Lộ trình 20 level, Các khoá đã học, Level hiện tại, Báo mất sổ với hồ sơ event\_guest. R4 không áp dụng cho event\_guest.

### E6b. Bổ sung xác thực SĐT (khi Zalo/SMS đã cấu hình)

Chưa build trong lần này. Khi OTP Zalo/SMS chạy được: tài khoản có SĐT chưa xác minh, ở lần đăng nhập kế tiếp (hoặc khi dùng tính năng cần SĐT đã xác minh) được yêu cầu xác thực SĐT bằng OTP theo F1. Thiết kế dữ liệu phải để sẵn trạng thái xác minh riêng cho SĐT và email.

### E7. Nâng người trải nghiệm thành học viên

- Admin gán sổ First Passport mới (F11) với replaced\_passport\_id trỏ thẻ sự kiện → thẻ sự kiện retired. Điểm và chứng nhận giữ nguyên.  
- Nếu người này đã là học viên có sẵn: gộp hai hồ sơ theo F10. event\_scores, event\_participations và chứng nhận chuyển sang hồ sơ giữ lại.  
- Học viên đang có sổ active vẫn nhận được thẻ sự kiện (hạng này không tính vào R2).

### E8. Theo dõi và xuất danh sách (admin)

- **Bảng theo dõi trực tiếp** trong lúc sự kiện: số thẻ đã ghi tên, đã hoàn thành tại quầy, đã phát quà, đang chờ duyệt ảnh.  
- **Xuất Excel**: mã thẻ, họ tên, ai chơi, tuổi, nơi ở, SĐT, email (nếu đã kích hoạt), đồng ý liên hệ, đồng ý ảnh, điểm 4 trạm, tổng, trạng thái hoàn thành, cách hoàn thành (quầy / ảnh), đã nhận quà, đã kích hoạt tài khoản. Chỉ admin xuất. Màn hình nhắc: chỉ dùng SĐT để tư vấn, chăm sóc khi "đồng ý liên hệ" là Có.

## 5\. Mẫu chứng nhận event\_experience

- Khổ A4 ngang. **Chỉ** logo Hiệp hội Golf Việt Nam (VGA) và logo Dự án phát triển golf trẻ R\&A – VGA. Không logo VN Centre.  
- Tên người chơi.  
- Dòng xác nhận (VI, mặc định): "Đã hoàn thành trải nghiệm môn Golf tại Lễ phát động 'Mỗi người dân lựa chọn ít nhất một môn thể thao phù hợp để tập luyện thường xuyên', Hồ Hoàn Kiếm, Hà Nội, ngày 10/10/2026". Có bản EN. Tên và ngày lấy từ events, không viết cứng.  
- **Không ghi điểm.** Không có Class, School.  
- Giữ QR xác thực /verify/{verify\_code} như mọi chứng nhận (F9).  
- Chỉ phát hành cho người có completion\_status \= completed.

## 5b. Quy tắc nghiệp vụ (để viết kiểm thử)

| \# | Quy tắc |
| :---- | :---- |
| E-R1 | Thẻ sự kiện chỉ ghi tên một lần và chỉ kích hoạt tài khoản một lần |
| E-R2 | Ghi tên không gửi OTP, không tạo tài khoản đăng nhập |
| E-R3 | Kích hoạt chỉ đi tiếp khi người dùng nhập đúng đầy đủ SĐT đã ghi khi nhận thẻ; mã xác thực gửi qua email; SĐT giữ trạng thái chưa xác minh |
| E-R4 | Hồ sơ event\_guest và yêu cầu tự xác nhận không vào hàng chờ F12 |
| E-R5 | Hạng có counts\_toward\_single\_active \= false không tính vào R2 |
| E-R6 | Chỉ hoàn thành được khi cả 4 trạm đạt min\_score\_to\_complete |
| E-R7 | Chứng nhận chỉ phát hành khi completed; không chứa điểm; không completed thì không có chứng nhận |
| E-R8 | Chỉ hoàn thành qua 2 đường: event\_staff bấm tại quầy, hoặc admin duyệt ảnh. Người chơi không tự chuyển được sang completed |
| E-R9 | Một thẻ chỉ được ghi nhận phát quà một lần |
| E-R10 | Điểm trạm là số nguyên trong \[0, max\_score\], chia hết cho score\_step |
| E-R11 | Nâng hạng hoặc gộp hồ sơ giữ nguyên điểm, trạng thái hoàn thành và chứng nhận |
| E-R12 | event\_staff, HLV, quản lý trường không nhận được SĐT/email người trải nghiệm |
| E-R13 | Sửa điểm hoặc thu hồi hoàn thành sau khi completed: bắt buộc lý do, ghi audit\_logs |
| E-R14 | Không ghi tên ngoài khung giờ; không gửi ảnh tự xác nhận sau self\_claim\_closes\_at |

## 6\. Tiêu chí nghiệm thu

Làm trên app.vncentre.net bằng điện thoại thật:

1. Admin tạo sự kiện, lô 20 thẻ hạng event\_experience, xuất PDF decal với tem vừa ô trên thẻ; QR mở đúng app.vncentre.net/p/….  
2. Người A quét thẻ, chọn "Con tôi chơi", ghi tên \+ SĐT **dưới 30 giây**, không nhận OTP.  
3. HLV ở quầy quét thẻ A, nhập đủ 4 điểm, bấm Hoàn thành **dưới 20 giây**; màn hình không hiện SĐT.  
4. HLV quét lại thẻ A → báo đã nhận quà, không phát lần hai.  
5. Thẻ B trạm Chip điểm 0 (không có dấu nào) → nút Hoàn thành không bấm được, báo thiếu trạm Chip. Thẻ có đúng một dấu 5 ở mỗi trạm → Hoàn thành được.  
6. Người C không qua quầy, tối về quét thẻ, chụp ảnh thẻ điểm gửi lên → admin duyệt → C thấy "Đã hoàn thành".  
7. Người D gửi ảnh mờ → admin từ chối kèm lý do → D thấy lý do, gửi lại ảnh.  
8. Người E chưa hoàn thành, chưa gửi ảnh → không tạo được tài khoản, không có chứng nhận.  
9. A tối về quét thẻ → nhập đúng SĐT đã ghi → nhập email → nhận mã trong hộp thư (không vào Spam với Gmail) → đặt mật khẩu → tải PDF đúng mẫu, đủ dấu tiếng Việt, không có điểm → QR trên PDF ra trang xác thực "hợp lệ".  
10. Người nhặt được thẻ của A nhập sai SĐT → không đi tiếp; sai 5 lần → thẻ bị khoá 24 giờ, admin nhận báo.  
11. Một phụ huynh ghi 2 thẻ cho 2 con cùng SĐT → kích hoạt một lần, nối cả hai.  
12. Người lớn chọn "Tôi chơi" → hồ sơ hiện "Hồ sơ của tôi".  
13. Hàng chờ F12 không có thêm dòng nào.  
14. Admin gán First Passport cho hồ sơ trải nghiệm → thẻ sự kiện retired, điểm và chứng nhận còn nguyên.  
15. Admin xem bảng theo dõi trực tiếp và xuất Excel đủ cột E8.

## 7\. Thứ tự ưu tiên

| Mức | Phần | Hạn |
| :---- | :---- | :---- |
| Bắt buộc trước khi in thẻ | Tên miền app.vncentre.net chạy thật; E1 | Trước khi in, chậm nhất sáng 9/10 |
| Bắt buộc trước 16h00 10/10 | E2, E4, vai trò event\_staff, mẫu chứng nhận | Ngày sự kiện |
| Bắt buộc trước tối 10/10 | E6 (kích hoạt qua email và tải chứng nhận); dịch vụ gửi email đã cấu hình và thử với Gmail, Yahoo, Outlook | Tối sự kiện |
| Ngay sau sự kiện | E5 (tự xác nhận bằng ảnh), bảng theo dõi | 11/10 |
| Làm sau được | E7, xuất Excel đầy đủ | Sau 10/10 |

**Phương án dự phòng nếu quầy không dùng được app** (mất mạng, lỗi): HLV vẫn phát quà, đóng một dấu "ĐÃ ĐỔI QUÀ" lên thẻ. Người chơi dùng luồng E5 gửi ảnh thẻ; admin thấy dấu này thì duyệt. Thẻ giấy luôn là xương sống.

## 8\. Cập nhật kèm theo (Claude Code thực hiện cùng lúc)

1. **README docs/spec**: thêm dòng "Mới ở v0.8: thêm 10-module-trai-nghiem-su-kien.md, module ngoại lệ trong đợt 1 cho Lễ phát động 10/10/2026" và một dòng vào bảng mục 1\.  
2. **01-du-lieu.md**: thêm bảng, cột, giá trị trạng thái và vai trò ở mục 3 file này.  
3. **02-dot-1-nen-tang.md F11**: thêm chỉnh kích thước tem.  
4. **Tên miền (đã chốt):** app.vncentre.net. Gắn tên miền riêng cho Worker trên Cloudflare, bật HTTPS, kiểm tra /status chạy trên tên miền này **trước khi in thẻ**.  
5. **phu-luc-D-viec-con-mo.md**: thêm các việc dưới đây, đánh số tiếp theo dãy D hiện có:  
   - max\_score của từng trạm (đã chốt min\_score\_to\_complete \= 5, score\_step \= 5).  
   - self\_claim\_closes\_at: hạn gửi ảnh tự xác nhận (đề xuất 7 ngày sau sự kiện).  
   - Số HLV đứng quầy đổi quà, điện thoại dùng ở quầy, mạng dự phòng.  
   - File logo VGA và logo Dự án (nền trong, độ phân giải cao).  
   - Link Zalo OA VN Centre.  
   - **Gửi email:** dịch vụ gửi nào đang dùng; gửi từ tên miền vncentre.net đã cấu hình SPF, DKIM chưa (thiếu thì mã dễ rơi vào Spam).  
   - **Cấu hình OTP Zalo (mẫu tin được duyệt) và SMS**, sau đó build E6b.  
   - validity\_months của hạng event\_experience (đề xuất 12 tháng).  
   - Nội dung Điều khoản và Chính sách tối thiểu để dùng cho sự kiện (V30 chưa có).