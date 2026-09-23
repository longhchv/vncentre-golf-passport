# 02 · Đợt 1 — Nền tảng

## 1. Mục tiêu đợt 1

Kết thúc đợt 1, VN Centre làm được những việc sau:

1. Nhập danh sách học sinh từ trường và nhập lịch sử các khoá đã học từ 2024.
2. In mã cho sổ Passport (in trực tiếp hoặc decal dán) và gán sổ cho học viên.
3. Phụ huynh quét mã, đăng ký tài khoản, nối với con, và **thấy ngay con đang ở level nào, đã học những khoá nào**.
4. Phụ huynh xem và tải chứng nhận; bất kỳ ai cũng kiểm tra được chứng nhận thật hay giả.
5. Trung tâm thu lại được **số điện thoại và email** của phụ huynh.
6. Thu phí cấp lại sổ qua app.

## 2. Phạm vi

**Có trong đợt 1:**
- Đăng ký, đăng nhập, quên mật khẩu (phụ huynh, nhân viên, học viên)
- 4 cách nối phụ huynh với học viên: mã sổ, link mời, mã kích hoạt trên chứng nhận, tự tìm con
- Mời người giám hộ thứ hai; tạo tài khoản học viên
- Hồ sơ học viên: thông tin, mục tiêu golf, level hiện tại, lộ trình 20 level, các khoá đã học, sổ Passport, chứng nhận
- Chứng nhận: phát hành hàng loạt, xem, tải PDF, trang xác thực công khai
- Quản trị: trường, năm học, chương trình và level (xem, chỉnh cấu hình), lớp (cơ bản), học viên, gộp trùng, nhập Excel, sổ Passport, duyệt level và lịch sử khoá học, người dùng và vai trò, cấu hình giá
- Cổng quản lý trường: xem học sinh trường mình, nhập lịch sử khoá học
- HLV: xem danh sách học viên lớp mình, quét mã sổ để mở hồ sơ học viên
- Thanh toán phí cấp lại sổ bằng chuyển khoản QR (payOS), yêu cầu xuất hoá đơn
- Thông báo: OTP, lời mời kích hoạt, chứng nhận mới, thanh toán thành công
- Đồng ý điều khoản, chính sách, hiện tên trên bảng xếp hạng, ảnh
- Song ngữ Việt–Anh; cài được lên màn hình điện thoại (PWA)

**Không có trong đợt 1** (để đợt sau):
- Buổi học, điểm danh, chấm kỹ năng, nhật ký văn hoá, nhận xét, ảnh (đợt 2)
- Điểm thưởng, quà, tem đối tác, giải đấu, bảng xếp hạng (đợt 3)
- Gói Premium, thanh toán thẻ, hồ sơ học bổng (đợt 4)

Trên giao diện đợt 1, các mục chưa có hiển thị thẻ "Sắp ra mắt" kèm linh vật rồng, **không** để link chết.

## 3. Sơ đồ màn hình

### 3.1 Trang công khai (không cần đăng nhập)

| Đường dẫn | Màn hình |
|---|---|
| `/` | Giới thiệu ngắn, nút Đăng nhập, nút "Kích hoạt Golf Passport" |
| `/p/{passport_code}` | Quét mã sổ (luồng F2) |
| `/c/{claim_code}` | Quét mã kích hoạt trên chứng nhận giấy (luồng F4) |
| `/i/{invite_token}` | Mở link mời kích hoạt (luồng F3) |
| `/activate` | Nhập mã bằng tay (sổ hoặc chứng nhận) |
| `/verify/{verify_code}` và `/verify` | Xác thực chứng nhận |
| `/login`, `/signup`, `/forgot-password` | Tài khoản |
| `/terms`, `/privacy` | Điều khoản, chính sách (nội dung soạn sau) |

### 3.2 Phụ huynh (`/app`)

| Màn hình | Nội dung |
|---|---|
| Trang chủ | Thẻ từng con (ảnh, tên, level hiện tại, giai đoạn Passport, cấp hộ chiếu). Thông báo mới. Nút "Thêm con" |
| Hồ sơ con → Tổng quan | Level hiện tại, thanh tiến trình giai đoạn, cấp hộ chiếu, trường/lớp hiện tại, mục tiêu golf |
| Hồ sơ con → Lộ trình | Sơ đồ 20 level theo 5 nhóm; đánh dấu level đã hoàn thành / đang học; bấm vào Level 1–3 xem nội dung chi tiết; level khác xem mô tả tóm tắt |
| Hồ sơ con → Các khoá đã học | Danh sách theo thời gian: năm học, trường, lớp/khoá, số tiết, kết quả, level đạt |
| Hồ sơ con → Chứng nhận | Danh sách chứng nhận, xem, tải PDF |
| Hồ sơ con → Passport | Sổ đang dùng (mã, cấp, ngày cấp, hạn), lịch sử sổ, nút "Báo mất sổ" |
| Hồ sơ con → Người giám hộ | Danh sách người giám hộ, mời thêm, tạo/đổi tài khoản cho con |
| Hồ sơ con → Thông tin | Sửa ngày sinh, giới tính, ảnh, mục tiêu golf |
| Thông báo | Hộp thông báo |
| Tài khoản | Họ tên, SĐT, email, ngôn ngữ, đổi mật khẩu, quản lý đồng ý, đơn hàng và hoá đơn, đăng xuất |

### 3.3 Học viên (`/me`)

Xem Tổng quan, Lộ trình, Các khoá đã học, Chứng nhận (không tải PDF), Passport. Không sửa được gì trong đợt 1.

### 3.4 HLV (`/coach`)

| Màn hình | Nội dung |
|---|---|
| Lớp của tôi | Danh sách lớp được gán |
| Chi tiết lớp | Danh sách học viên (tên, ngày sinh, level, trạng thái kích hoạt của phụ huynh), mã lớp |
| Quét mã | Mở camera quét QR sổ → mở hồ sơ học viên (nếu học viên thuộc lớp mình) |
| Hồ sơ học viên | Xem Tổng quan, Lộ trình, Các khoá đã học, Chứng nhận. **Không** thấy SĐT/email phụ huynh |

HLV trưởng có thêm hàng chờ duyệt level và lịch sử khoá học (xem F12).

### 3.5 Quản lý trường (`/school`)

| Màn hình | Nội dung |
|---|---|
| Tổng quan trường | Số học sinh, số đã kích hoạt, phân bổ level |
| Học sinh | Danh sách, lọc theo lớp; xem hồ sơ (không có liên hệ phụ huynh) |
| Nhập lịch sử khoá học | Tải file hoặc nhập tay; trạng thái chờ duyệt |

### 3.6 Admin (`/admin`)

Bảng điều khiển · Trường · Năm học · Chương trình và level · Loại lớp · Lớp · Học viên · Nhập dữ liệu · Hàng chờ duyệt · Sổ Passport · Chứng nhận và mẫu · Người dùng và vai trò · Đơn hàng và hoá đơn · Tin nhắn đã gửi và chi phí · Cấu hình · Nhật ký hệ thống

## 4. Các luồng chi tiết

### F1. Đăng ký, đăng nhập, quên mật khẩu

**Phụ huynh:**

1. Nhập số điện thoại (mặc định +84; chọn được mã nước khác).
2. Hệ thống gửi mã OTP 6 số:
   - **Số Việt Nam:** gửi qua **Zalo** trước. Nếu gửi Zalo thất bại (số không dùng Zalo, lỗi dịch vụ) thì tự động gửi **SMS**.
   - **Số nước ngoài:** gửi mã qua **email** (miễn phí). Phụ huynh nhập email trước; số điện thoại vẫn được lưu nhưng đánh dấu chưa xác minh.
3. Nhập OTP đúng → đặt mật khẩu (tối thiểu 8 ký tự) → nhập họ tên, email.
   - Email bắt buộc trước khi tải file PDF đầu tiên. Có thể bỏ qua lúc đăng ký, nhưng app nhắc lại.
4. **Đăng nhập các lần sau:** số điện thoại (hoặc email) + mật khẩu. Không gửi OTP mỗi lần đăng nhập, để tiết kiệm chi phí.
5. **Quên mật khẩu:** gửi OTP theo đúng quy tắc bước 2, rồi đặt lại mật khẩu.

**Giới hạn OTP** (admin chỉnh trong `app_settings`):
- Mã hết hạn sau 5 phút.
- Nhập sai tối đa 5 lần mỗi mã.
- Gửi lại sau 60 giây.
- Tối đa 5 mã/số điện thoại/ngày, 20 mã/địa chỉ IP/ngày.

Mỗi lần gửi ghi vào `otp_logs` kèm chi phí ước tính.

**Nhân viên** (admin, HLV, quản lý trường): admin tạo tài khoản bằng email → hệ thống gửi email mời đặt mật khẩu → đăng nhập bằng email + mật khẩu.

**Học viên:** tên đăng nhập + mã PIN 6 số do phụ huynh tạo (F7).

Sau khi đăng nhập, người có nhiều vai trò chọn không gian làm việc: Phụ huynh / HLV / Trường / Admin.

### F2. Kích hoạt bằng mã sổ Passport (quét QR hoặc nhập mã)

Mở `/p/{passport_code}`:

| Trạng thái sổ | Người mở | Kết quả |
|---|---|---|
| Mã không tồn tại | Bất kỳ | "Mã không đúng". Đếm lần thử sai theo IP: quá 10 lần/giờ thì khoá 1 giờ |
| `assigned` | Chưa đăng nhập hoặc phụ huynh | Luồng kích hoạt A (dưới đây) |
| `unassigned` | Chưa đăng nhập hoặc phụ huynh | Luồng kích hoạt B (dưới đây) |
| `active` | Phụ huynh đã nối với học viên này | Mở hồ sơ con |
| `active` | Nhân viên có quyền với học viên | Mở hồ sơ học viên (giao diện nhân viên) |
| `active` | Người khác | "Sổ đã được kích hoạt." Nút Đăng nhập; gợi ý "Nếu bạn là người giám hộ khác, hãy nhờ người đã kích hoạt mời bạn" |
| `lost` / `void` | Nhân viên | Cảnh báo "Sổ đã báo mất/huỷ", link tới học viên và sổ đang dùng |
| `lost` / `void` | Người khác | "Sổ này không còn hiệu lực. Liên hệ VN Centre." |
| `retired` | Bất kỳ | Như `active`, kèm dòng "Sổ cấp trước, sổ hiện tại là …" (chỉ hiện cho người có quyền) |

**Luồng A — sổ đã gán học viên:**

1. Màn hình chào (linh vật rồng): "Golf Passport của **Nguyễn Đ. A.** — Trường Tiểu học Tô Vĩnh Diện". Tên hiển thị che bớt.
2. **Xác nhận là phụ huynh:** nếu học viên có ngày sinh trong hệ thống, yêu cầu nhập ngày sinh của con, phải khớp. Nếu không có ngày sinh, yêu cầu nhập họ tên đầy đủ của con, khớp theo `full_name_normalized`. Sai quá 5 lần thì khoá mã 24 giờ và báo admin.
3. Đăng ký hoặc đăng nhập (F1). Nếu số điện thoại vừa xác thực **trùng** số phụ huynh có sẵn trong danh sách trường của học viên này → bỏ qua bước 2 (đã tin cậy).
4. Chọn quan hệ với con (bố, mẹ, người giám hộ, khác).
5. Đồng ý:
   - Điều khoản sử dụng và Chính sách bảo mật (bắt buộc).
   - Cho phép hiện tên đầy đủ của con trên bảng xếp hạng (tuỳ chọn, **mặc định không tick**).
   - Cho phép dùng ảnh/video của con cho truyền thông (tuỳ chọn; **chỉ hỏi** nếu trường của học viên có `requires_photo_consent = true`).
6. Bổ sung thông tin con: ngày sinh (nếu chưa có), giới tính, mục tiêu golf (chọn nhiều, theo mục 5.1 `01-du-lieu.md`), ảnh (tuỳ chọn).
7. Hoàn tất:
   - Sổ chuyển `active`, ghi `activated_at`, `activated_by_guardian_id`.
   - Nếu đây là lần kích hoạt đầu tiên của học viên, ghi `students.activated_at`.
   - Tạo `student_guardians` với `linked_via = passport`, `is_primary = true`, `can_manage = true`.
   - Màn hình chúc mừng: "Chào mừng bạn đến với hành trình golf của con" → vào hồ sơ con.

**Luồng B — sổ chưa gán học viên** (ví dụ decal dán cho lớp không có danh sách):

1–5. Như luồng A, bỏ bước xác nhận ngày sinh.
6. Phụ huynh nhập thông tin con: họ tên, ngày sinh, trường (chọn từ danh sách hoặc gõ), lớp.
7. Hệ thống dò học viên có sẵn theo tên chuẩn hoá + ngày sinh + trường:
   - **Khớp đúng 1 học viên chưa có sổ `active`:** gán sổ cho học viên đó; liên kết phụ huynh–học viên ở trạng thái `pending_confirmation` để admin/HLV xác nhận (mục tiêu xử lý trong 48 giờ). Trong lúc chờ, phụ huynh đã xem được hồ sơ. Nếu bị từ chối, liên kết bị gỡ và sổ chuyển sang học viên mới `pending_review`.
   - **Không khớp hoặc khớp nhiều:** tạo học viên mới `verification_status = pending_review`, gán sổ. Admin/HLV xử lý trong hàng chờ (ghép với học viên có sẵn, hoặc xác nhận là học viên mới).
8. Hoàn tất như luồng A.

**Một phụ huynh có nhiều con:** sau khi kích hoạt xong, nút "Kích hoạt sổ cho con khác" mở lại luồng quét mã; đã đăng nhập nên bỏ qua F1.

### F3. Kích hoạt bằng link mời (danh sách trường có số điện thoại)

1. Sau khi nhập danh sách (F10), admin chọn học viên → "Gửi lời mời kích hoạt". Chọn kênh: Zalo (mặc định cho số Việt Nam) hoặc email.
2. Hệ thống tạo `invitations` với token ngẫu nhiên, hạn 30 ngày, và gửi tin theo mẫu: "VN Centre Golf Passport: Chứng nhận và hồ sơ golf của con [Tên] đã sẵn sàng. Kích hoạt tại: app.vncentre.net/i/…"
3. Phụ huynh mở link → xác thực OTP **đúng số điện thoại được mời** (hoặc email được mời).
4. Khớp → nối với học viên, **không cần** xác nhận ngày sinh → tiếp tục bước 4–7 luồng A. Sổ Passport (nếu có) vẫn giữ trạng thái `assigned` cho đến khi quét mã sổ; khi quét, sổ chuyển `active` mà không hỏi lại gì.
5. Số khác với số được mời → báo "Link này dành cho số điện thoại khác" và gợi ý dùng F2/F5.
6. **Gửi hàng loạt:** admin chọn cả lớp. Hiển thị ước tính chi phí (số tin × đơn giá trong `app_settings`) và yêu cầu xác nhận trước khi gửi. Tốc độ gửi giới hạn theo quy định nhà cung cấp.

### F4. Kích hoạt bằng mã trên chứng nhận giấy

- Mỗi học viên có `claim_code`. Mẫu chứng nhận giấy và phiếu kết quả in thêm QR `/c/{claim_code}` và dòng "Kích hoạt hồ sơ golf của con tại app.vncentre.net".
- Mở `/c/{claim_code}` → giống luồng A của F2 (xác nhận ngày sinh hoặc họ tên → F1 → đồng ý → bổ sung → hoàn tất). `linked_via = claim_code`, ghi `claim_code_used_at`.
- Mã đã dùng → "Hồ sơ đã được kích hoạt" + gợi ý đăng nhập hoặc nhờ mời.
- Admin tạo lại được `claim_code` (mã cũ mất hiệu lực).

### F5. Tự tìm và yêu cầu liên kết con

Dùng khi phụ huynh không có sổ, không có link, không có mã.

1. Đăng nhập → "Thêm con" → "Tôi không có mã".
2. Nhập họ tên con, ngày sinh, trường, lớp.
3. Hai lựa chọn:
   - **Có mã lớp** (HLV gửi trong nhóm Zalo lớp): nhập mã lớp. Nếu có đúng 1 học viên trong lớp đó khớp tên và ngày sinh (hoặc tên, khi học viên chưa có ngày sinh) → nối ngay, `linked_via = class_code`.
   - **Không có mã lớp:** tạo `link_requests` trạng thái `pending`. Admin hoặc HLV lớp đó duyệt/từ chối trong hàng chờ. Phụ huynh nhận thông báo kết quả.
4. **Không bao giờ** hiển thị danh sách kết quả tìm kiếm cho phụ huynh, để tránh người lạ dò thông tin trẻ.
5. Giới hạn: tối đa 5 lần nhập mã lớp sai/ngày/tài khoản.

### F6. Mời người giám hộ thứ hai

1. Người giám hộ có `can_manage = true` → "Mời người giám hộ" → nhập số điện thoại hoặc email, chọn quan hệ.
2. Hệ thống gửi link mời (F3). Người được mời xác thực OTP rồi được nối vào học viên với `can_manage = false` (mặc định). Người mời bật `can_manage` được.
3. Người giám hộ `can_manage` gỡ được người giám hộ khác, nhưng không tự gỡ người giám hộ chính cuối cùng.

### F7. Tài khoản học viên

- Phụ huynh (`can_manage`) tạo cho con từ 8 tuổi trở lên: tên đăng nhập (duy nhất toàn hệ thống, gợi ý tự động từ tên + số) + PIN 6 số.
- Học viên đăng nhập ở `/login` → tab "Học viên".
- Sai PIN 5 lần → khoá 15 phút.
- Phụ huynh đổi PIN, khoá/mở tài khoản con được.
- Con dưới 8 tuổi: nút tạo tài khoản bị ẩn. Tuổi tính theo ngày sinh; nếu chưa có ngày sinh thì yêu cầu nhập trước.

### F8. Hồ sơ học viên (phần phụ huynh xem)

**Tổng quan:**
- Ảnh (hoặc hình linh vật mặc định), họ tên, mã học viên, trường và lớp hiện tại.
- Thẻ lớn "Level hiện tại": số level, tên level, nhóm level.
- Thanh 5 giai đoạn Passport, tô màu giai đoạn hiện tại. Tên cấp hộ chiếu.
- Mục tiêu golf.
- Nếu chưa có lịch sử nào: "Con đang bắt đầu Level 1" và nút "Con đã từng học golf? Báo cho Trung tâm". Nút này tạo một yêu cầu cập nhật lịch sử (ô chữ tự do) vào hàng chờ admin.

**Lộ trình:**
- Sơ đồ 20 level chia 5 nhóm, cuộn dọc trên điện thoại.
- Level đã hoàn thành: dấu tích và ngày. Level đang học: nổi bật. Level sau: mờ.
- Bấm level → trang chi tiết: mục tiêu nhóm, handicap mục tiêu (nếu có). Riêng Level 1–3 hiện đầy đủ nội dung theo 5 mảng kỹ thuật, văn hoá, luật, kiến thức (dữ liệu `phu-luc-B`).

**Các khoá đã học:**
- Lấy từ `course_history` có `status = approved`, sắp theo thời gian mới nhất lên đầu.
- Mỗi dòng: năm học, trường, lớp/khoá, chương trình (20 level / trại hè), số tiết (nếu có), level đạt (nếu có).
- Bản ghi đang chờ duyệt **không** hiện cho phụ huynh.

**Chứng nhận:** thẻ từng chứng nhận (tiêu đề, ngày cấp). Bấm vào → xem ảnh chứng nhận + nút "Tải PDF" + nút "Chia sẻ link xác thực".

**Passport:** thông tin sổ đang dùng; lịch sử các sổ; nút "Báo mất sổ" (F15).

### F9. Chứng nhận

**Phát hành** (admin, HLV trưởng):
1. Chọn lớp, hoặc chọn danh sách học viên → chọn mẫu (Trại hè / Hoàn thành khoá / Hoàn thành level) → điền dữ liệu chung: tên chương trình (VD "SNAG Golf @ School Summer Camp 2026"), level (VD "Level 1" hoặc "Journey 1"), ngày cấp.
2. Xem trước 3 chứng nhận đầu → xác nhận → tạo `certificates` (lưu snapshot dữ liệu) → gửi thông báo cho phụ huynh đã kích hoạt.
3. Mẫu "Hoàn thành level" chỉ phát hành được cho học viên có `level_records` tương ứng đã duyệt.

**Nội dung chứng nhận** (theo mẫu hiện tại của VN Centre, khổ A4 ngang):
- Logo VN Centre (trái), logo và tên đầy đủ Dự án phát triển golf trẻ R&A – VGA (phải).
- Tiêu đề "CERTIFICATE OF COMPLETION".
- Tên học viên, Class, School.
- Dòng "In recognition of their achievement in completing the [chương trình] – [level]".
- Chữ ký, tên và chức danh người ký.
- **QR xác thực** trỏ tới `/verify/{verify_code}`, dòng mã xác thực bên dưới.
- `junior.vncentre.net` ở chân.
- Mẫu có bản tiếng Anh (mặc định) và bản song ngữ. Admin chọn khi phát hành.

**Tải PDF:**
- Phụ huynh đã có email mới tải được; nếu chưa có thì yêu cầu nhập email trước.
- File tạo đúng bố cục mẫu, font hiển thị đầy đủ dấu tiếng Việt, kích thước dưới 2 MB.
- Học viên xem được nhưng không tải.

**Trang xác thực `/verify/{verify_code}`:**
- Hiện: "Chứng nhận hợp lệ" (hoặc "Đã bị thu hồi" kèm ngày), tên học viên, loại chứng nhận, chương trình/level, ngày cấp, đơn vị cấp (VN Centre – Dự án phát triển golf trẻ R&A – VGA).
- **Không** hiện ngày sinh, trường, thông tin phụ huynh.
- Trang `/verify` có ô nhập mã bằng tay.

**Thu hồi:** admin nhập lý do → trạng thái `revoked` → trang xác thực báo đã thu hồi; phụ huynh không tải được nữa.

### F10. Nhập danh sách học sinh (admin)

1. Admin chọn: trường, năm học, chương trình, lớp (chọn lớp có sẵn hoặc tạo lớp mới ngay tại đây).
2. Tải file Excel theo mẫu `phu-luc-A` (7 cột). Có nút tải file mẫu.
3. Hệ thống đọc file và chuẩn hoá:
   - Họ tên: bỏ khoảng trắng thừa, viết hoa chữ cái đầu mỗi từ.
   - Ngày sinh: nhận `dd/mm/yyyy`, `d/m/yyyy`, ô kiểu ngày của Excel; sai thì báo lỗi dòng.
   - SĐT: bỏ dấu cách, dấu chấm; đổi `0xxx` thành `+84xxx`; kiểm tra độ dài.
   - Email: kiểm tra định dạng.
4. **Màn hình xem trước:** mỗi dòng có trạng thái:
   - `ok` — hợp lệ.
   - `warning` — thiếu ngày sinh, thiếu SĐT (vẫn nhập được).
   - `error` — thiếu họ tên, ngày sinh sai định dạng (không nhập).
   - `duplicate_suspect` — nghi trùng học viên có sẵn: cùng tên chuẩn hoá và cùng ngày sinh; hoặc cùng tên + cùng trường khi thiếu ngày sinh. Admin chọn cho từng dòng: "Là cùng một em (dùng hồ sơ có sẵn)" hoặc "Là em khác (tạo mới)".
5. Admin bấm "Nhập":
   - Tạo/cập nhật `students`, `student_school_history`, `enrollments` vào lớp.
   - Tạo `guardians` (chưa có tài khoản) và `student_guardians` nếu có tên/SĐT/email người liên hệ.
   - Mỗi học viên mới được sinh `student_code` và `claim_code`.
6. Kết quả: số dòng đã nhập / bỏ qua / lỗi; tải file báo lỗi.
7. Sau khi nhập, gợi ý bước tiếp: "Gán sổ Passport" (F11) · "Gửi lời mời kích hoạt" (F3) · "Phát hành chứng nhận" (F9).

**Gộp học viên trùng** (admin): chọn 2 hồ sơ → xem so sánh cạnh nhau → chọn hồ sơ giữ lại và giá trị từng trường → gộp. Mọi bản ghi liên quan (người giám hộ, lớp, lịch sử, sổ, chứng nhận, level) chuyển sang hồ sơ giữ lại. Hồ sơ còn lại được đánh dấu `merged_into_student_id`. Ghi `student_merges` và `audit_logs`. Có thể hoàn tác trong 30 ngày.

### F11. Quản lý sổ Passport (admin)

**Tạo lô mã:**
1. Nhập tên lô, cấp hộ chiếu (First/Player/Elite), số lượng, cách in (in trực tiếp / decal).
2. Hệ thống sinh mã ngẫu nhiên không trùng → `passports` trạng thái `unassigned`.
3. **Xuất file:**
   - **CSV** cho nhà in (cột: STT, mã, URL QR).
   - **PDF tờ decal:** lưới tem, mỗi tem có QR + mã dạng `XXXX-XXXX` + dòng `app.vncentre.net`. Kích thước tem mặc định 35 × 45 mm, admin chỉnh được số cột, số hàng, lề để khớp khổ giấy decal.
   - Ghi `exported_at`.

**Gán sổ cho học viên:**
- Cách 1: trong chi tiết lớp, bấm "Gán sổ" cạnh học viên → quét QR sổ bằng camera hoặc gõ mã → sổ `assigned`.
- Cách 2: gán hàng loạt: chọn lớp + lô → hệ thống gán lần lượt theo thứ tự danh sách → xuất danh sách đối chiếu "tên học viên ↔ mã sổ" để dán đúng sổ.
- Không gán được sổ cho học viên đang có sổ `active` cùng cấp, trừ khi đi qua quy trình báo mất (F15).
- Ghi `issued_at`; `expires_at` = `issued_at` + `validity_months` của cấp hộ chiếu.

**Chi tiết sổ:** trạng thái, học viên, lịch sử thay đổi, nút huỷ sổ (`void`, bắt buộc nhập lý do).

### F12. Level và lịch sử khoá học (duyệt)

**Hàng chờ duyệt** (admin, HLV trưởng) gồm 4 loại:
1. Bản ghi `course_history` từ nhà trường hoặc từ file nhập.
2. `level_records` cần duyệt.
3. Học viên `pending_review` (phụ huynh tự khai).
4. `link_requests` không có mã lớp.

**Nhập lịch sử khoá học hàng loạt:** tải file mẫu lịch sử (`phu-luc-A`, 7 cột) → xem trước và dò khớp học viên như F10 → nhập vào `course_history` (`source = import`).
- Nếu cột "Level đạt" có giá trị → tạo `level_records` `approval_status = pending`.
- Người nhập là admin/HLV trưởng thì được chọn "Duyệt luôn khi nhập".

**Quy tắc dữ liệu cũ (chốt với anh Long):** học sinh đã học ít nhất 1 học kỳ golf trước khi có app được ghi **hoàn thành Level 1** (`source = legacy_import`). Ví dụ học sinh Tô Vĩnh Diện năm học 2024–2025 (17–18 tiết) và 2025–2026 (18–25 tiết).

**Duyệt:** chọn nhiều dòng → Duyệt / Từ chối (bắt buộc lý do khi từ chối). Duyệt level → cập nhật `students.current_level_id`, gửi thông báo cho phụ huynh.

**Admin sửa level trực tiếp:** bắt buộc nhập lý do, ghi nhật ký.

### F13. Cổng quản lý trường

- Chỉ thấy học sinh thuộc trường mình.
- Xem hồ sơ (Tổng quan, Lộ trình, Các khoá đã học, Chứng nhận), **không** thấy liên hệ phụ huynh.
- Nhập lịch sử khoá học: tải file mẫu hoặc nhập tay từng học sinh → trạng thái `pending_review` → chờ admin/HLV trưởng duyệt.
- Không sửa được level.
- Báo cáo đợt 1: số học sinh theo lớp, số đã kích hoạt, phân bổ level. Có nút xuất Excel.

### F14. HLV

- Xem lớp được gán và học viên trong lớp (mục 3.4).
- Quét QR sổ để mở hồ sơ học viên thuộc lớp mình. Quét sổ của học viên không thuộc lớp mình → "Bạn không có quyền xem học viên này".
- Xem và đổi mã lớp.
- HLV trưởng: có hàng chờ duyệt (F12), phát hành chứng nhận (F9).

### F15. Báo mất sổ và thu phí cấp lại

1. Phụ huynh bấm "Báo mất sổ" (hoặc admin thao tác thay).
2. Xác nhận → sổ chuyển `lost` ngay (mã cũ mất hiệu lực); tạo `orders` với sản phẩm `passport_replacement`, số tiền lấy từ `products` (mặc định 200.000 đ), hạn thanh toán 7 ngày.
3. Màn hình thanh toán: mã QR chuyển khoản do payOS tạo, số tiền, nội dung chuyển khoản, đếm ngược hạn. Có ô tick "Xuất hoá đơn" → nhập thông tin (`invoice_requests`).
4. payOS gửi webhook báo đã nhận tiền → kiểm tra chữ ký → `orders.status = paid`. Không tin trạng thái do trình duyệt gửi lên.
5. Thông báo "Thanh toán thành công" cho phụ huynh (trong app + email). Đơn vào danh sách "Cần cấp sổ" của admin.
6. Admin gán sổ mới cho học viên (F11) → sổ mới `assigned` với `replaced_passport_id` trỏ sổ cũ. Phụ huynh quét sổ mới → `active` ngay, không hỏi lại gì.
7. Hết hạn chưa thanh toán → đơn `expired`. Sổ cũ vẫn `lost`; phụ huynh tạo lại đơn được.
8. Admin xem được danh sách đơn, lọc theo trạng thái, xuất Excel; đánh dấu hoàn tiền thủ công (`refunded`, bắt buộc ghi chú).

**Hoá đơn:** kế toán xem danh sách `invoice_requests`, xuất hoá đơn trên phần mềm MISA, rồi nhập số hoá đơn và đánh dấu "Đã xuất". Phụ huynh thấy trạng thái hoá đơn trong mục Đơn hàng.

### F16. Quản trị chung (admin)

| Mục | Chức năng |
|---|---|
| Trường | Thêm/sửa/ngừng hoạt động; loại trường; thành phố; bật "Yêu cầu đồng ý ảnh" |
| Năm học | Thêm; đặt năm hiện tại |
| Chương trình và level | Sửa tên, mô tả song ngữ; sửa ánh xạ level ↔ giai đoạn ↔ cấp hộ chiếu; sửa nội dung chi tiết level (JSON form đơn giản) |
| Loại lớp | Sửa số tiết/level, thời lượng, cách chấm mặc định |
| Lớp | Tạo/sửa; gán HLV (nhiều người); thêm/bớt học viên; mã lớp |
| Học viên | Tìm theo tên/mã/trường/SĐT phụ huynh; xem toàn bộ hồ sơ; sửa; gộp; tạo lại mã kích hoạt; xem người giám hộ; gỡ liên kết người giám hộ (bắt buộc lý do) |
| Người dùng và vai trò | Tạo tài khoản nhân viên; gán/gỡ vai trò theo trường/lớp; khoá tài khoản |
| Tin nhắn | Danh sách tin OTP/mời đã gửi, kênh, trạng thái, tổng chi phí theo tháng |
| Cấu hình | Giá sản phẩm; đơn giá tin Zalo/SMS để ước tính; giới hạn OTP; nội dung mẫu tin mời |
| Nhật ký hệ thống | Lọc theo người, loại thao tác, đối tượng, thời gian |

**Bảng điều khiển admin:** tổng học viên, số phụ huynh đã kích hoạt (theo trường, theo lớp), tỉ lệ kích hoạt, số liên hệ thu được (SĐT, email), hàng chờ duyệt, đơn cần cấp sổ, chi phí tin nhắn tháng này.

### F17. Thông báo đợt 1

| Sự kiện | Người nhận | Kênh |
|---|---|---|
| OTP đăng ký/quên mật khẩu | Người đăng ký | Zalo → SMS (số VN); email (số nước ngoài) |
| Lời mời kích hoạt | Phụ huynh trong danh sách | Zalo (hoặc email nếu admin chọn) |
| Mời người giám hộ thứ hai | Người được mời | Zalo hoặc email |
| Chứng nhận mới | Phụ huynh đã kích hoạt | Trong app + email |
| Level được duyệt | Phụ huynh đã kích hoạt | Trong app + email |
| Kết quả yêu cầu liên kết | Phụ huynh gửi yêu cầu | Trong app + email |
| Thanh toán thành công, sổ mới đã cấp | Phụ huynh | Trong app + email |
| Email mời nhân viên | Nhân viên | Email |

Nội dung thông báo gửi theo ngôn ngữ người nhận đã chọn. Tin Zalo phải dùng mẫu đã được Zalo duyệt trước.

### F18. Đồng ý và quyền riêng tư

- Lưu mọi lần đồng ý/rút đồng ý trong `consents`, kèm phiên bản văn bản.
- Phụ huynh xem và thay đổi các đồng ý tuỳ chọn trong mục Tài khoản.
- Khi Điều khoản hoặc Chính sách có phiên bản mới, lần đăng nhập kế tiếp phải đồng ý lại mới dùng tiếp.
- Nút "Yêu cầu xoá dữ liệu của con": tạo yêu cầu vào hàng chờ admin (xử lý thủ công, ghi nhật ký).

## 5. Quy tắc nghiệp vụ tổng hợp (để viết kiểm thử)

| # | Quy tắc |
|---|---|
| R1 | Mã sổ và mã kích hoạt chỉ kích hoạt được **một lần** |
| R2 | Một học viên chỉ có **một sổ `active`** tại một thời điểm |
| R3 | Không hiển thị danh sách kết quả tìm học viên cho phụ huynh |
| R4 | Học viên chưa có `level_records` được duyệt → đang học Level 1 của chương trình `core20` |
| R5 | `current_level_id` = level cao nhất `completed` và `approved` + 1; không vượt quá Level 20 |
| R6 | Nhà trường không tạo được `level_records` đã duyệt |
| R7 | Bản ghi đang chờ duyệt không hiện cho phụ huynh và học viên |
| R8 | HLV, quản lý trường không bao giờ nhận được SĐT/email phụ huynh qua API |
| R9 | Chứng nhận lưu snapshot; sửa hồ sơ học viên không làm đổi chứng nhận đã phát |
| R10 | Trạng thái đơn chỉ thành `paid` qua webhook payOS có chữ ký hợp lệ |
| R11 | `students.activated_at` chỉ ghi lần đầu tiên, không ghi đè |
| R12 | Gộp học viên chuyển toàn bộ dữ liệu liên quan, không mất bản ghi nào |
| R13 | Mọi giới hạn số lần (OTP, nhập mã sai) lấy từ `app_settings` |
| R14 | Tuổi tạo tài khoản học viên ≥ 8, tính theo ngày sinh |

## 6. Yêu cầu phi chức năng

| Mục | Yêu cầu |
|---|---|
| Thiết bị | Dùng tốt trên iPhone và Android đời 3–4 năm gần đây, trình duyệt Safari và Chrome; màn hình từ 360px |
| Tốc độ | Trang hồ sơ phụ huynh hiện nội dung chính dưới 3 giây trên 4G |
| Cài lên màn hình | Có manifest, biểu tượng app (linh vật hoặc logo), màn hình chờ |
| Ngôn ngữ | Nút đổi Việt/Anh ở mọi trang; nhớ lựa chọn theo tài khoản |
| Bảo mật | HTTPS; phân quyền theo dòng dữ liệu; mật khẩu và PIN băm; giới hạn tần suất các điểm nhập mã/OTP; file PDF và ảnh học viên ở kho riêng tư, tải qua link có hạn |
| Sao lưu | Sao lưu cơ sở dữ liệu tự động hằng ngày, giữ tối thiểu 7 ngày |
| Nhật ký | Như mục 3 README |
| Khả năng tiếp cận | Cỡ chữ tối thiểu 16px cho nội dung chính; tương phản đủ đọc ngoài trời |

## 7. Tiêu chí nghiệm thu đợt 1

Đợt 1 được coi là xong khi làm được **toàn bộ** các kịch bản sau trên môi trường thật, bằng điện thoại:

1. Admin nhập file danh sách CLB Tô Vĩnh Diện (6 em, có SĐT) → không lỗi → xuất PDF decal 6 tem → gán 6 sổ.
2. Phụ huynh A quét sổ → nhận OTP qua Zalo → kích hoạt xong dưới 3 phút → thấy level và các khoá đã học của con.
3. Phụ huynh B không dùng Zalo → nhận OTP qua SMS → kích hoạt thành công.
4. Phụ huynh lớp UNIS có số điện thoại nước ngoài → nhận mã qua email → dùng giao diện tiếng Anh từ đầu đến cuối.
5. Lớp Vinschool Harmony không có danh sách SĐT: phụ huynh quét decal chưa gán học viên → tự khai → admin ghép đúng học viên trong hàng chờ.
6. Admin nhập file lịch sử Tô Vĩnh Diện 2 năm học → duyệt hàng loạt → phụ huynh thấy "Hoàn thành Level 1" và 2 khoá đã học.
7. Admin phát hành chứng nhận cho cả lớp → phụ huynh nhận thông báo → tải PDF đúng mẫu, đủ dấu tiếng Việt → quét QR trên PDF ra trang xác thực "hợp lệ".
8. Thu hồi một chứng nhận → trang xác thực báo đã thu hồi.
9. Phụ huynh báo mất sổ → thanh toán 200.000 đ bằng QR → đơn tự chuyển "đã thanh toán" → admin gán sổ mới → phụ huynh quét sổ mới vào thẳng hồ sơ cũ, dữ liệu còn nguyên.
10. Phụ huynh mời người giám hộ thứ hai → người này đăng nhập và thấy con.
11. Phụ huynh tạo tài khoản cho con 9 tuổi → con đăng nhập bằng tên + PIN → chỉ xem, không sửa được.
12. HLV đăng nhập → chỉ thấy lớp mình → quét sổ của học viên lớp khác bị từ chối → API không trả SĐT phụ huynh.
13. Quản lý trường nhập lịch sử 1 học sinh → phụ huynh chưa thấy → HLV trưởng duyệt → phụ huynh thấy.
14. Gộp 2 hồ sơ trùng → toàn bộ sổ, chứng nhận, lịch sử chuyển sang hồ sơ giữ lại.
15. Nhật ký hệ thống ghi đủ các thao tác ở kịch bản 6, 8, 9, 14.

## 8. Dữ liệu mẫu (seed)

- 1 tổ chức; 3 trường (Tô Vĩnh Diện – công lập, UNIS – quốc tế, Vinschool Harmony – tư thục có `requires_photo_consent`); năm học 2024–2025, 2025–2026, 2026–2027.
- Chương trình `core20` đủ 20 level (tên, nhóm, handicap mục tiêu); nội dung chi tiết L1–3 theo `phu-luc-B`.
- Chương trình `summer_camp` với "Journey 1".
- 5 giai đoạn, 3 cấp hộ chiếu, 7 loại lớp theo mặc định.
- 3 mẫu chứng nhận (dùng ảnh nền mẫu VN Centre đã có).
- Tài khoản mẫu cho từng vai trò; 20 học viên giả (tên giả, không dùng dữ liệu thật).
