# 11 · Module Hồ sơ nhân sự và xuất CV

Phiên bản: v0.9 (sửa lần 1) · Ngày: 09/10/2026 · Người soạn: Minh · Chủ sản phẩm duyệt: Vũ Anh Long

**Sửa lần 1:** chốt 4 việc còn mở: bước 2 in **số buổi** đứng lớp; mỗi người **một** `cv_type`; chữ tiếng Anh trên CV do **chủ hồ sơ tự nhập**; link tải CV hết hạn sau **24 giờ**.

## 0. Vì sao có file này

Ngày 09/10/2026 chủ sản phẩm chốt: **mỗi nhân sự có một tài khoản Golf Passport**, tài khoản vừa để đăng nhập làm việc, vừa là **hồ sơ nghề nghiệp tích luỹ dần**, xuất ra CV được bất cứ lúc nào. Trước đó app chỉ tính hồ sơ cho học viên (để xin học bổng). Nhân sự gồm: thầy cô, HLV, admin, ban tổ chức (BTC), tình nguyện viên (TNV), cộng tác viên (CTV).

- Module chia **2 bước**. Bước 1 build được ngay trên nền đợt 1 và module sự kiện. Bước 2 tự bật khi đợt 2 (buổi học, điểm danh) đã build.
- Không có hạn cứng. **Không build trước khi sự kiện 10/10/2026 xong và ổn định.**
- Module dựa trên F1, F9 (xác thực công khai), cơ chế PDF của chứng nhận (`supabase/functions/certificates`), và vai trò `event_staff` của file 10. Ở đâu file này không nói gì thì làm theo các file đó.
- **Không đổi phân quyền hiện có.** Phân loại TNV/CTV/BTC trong file này chỉ dùng để ghi hồ sơ và chọn mẫu CV, không phải vai trò truy cập mới.

## 1. Mục tiêu

1. Mỗi nhân sự có trang **Hồ sơ của tôi** gồm thông tin chung và quá trình tích luỹ theo vai trò.
2. Dữ liệu chia 2 loại, phân biệt rõ trên màn hình và trên CV:
   - **Đã xác thực**: app tự ghi (phân công lớp, phân công sự kiện, điểm danh) hoặc người phụ trách xác nhận trên app.
   - **Đã duyệt**: nhân sự tự khai (chứng chỉ ngoài, kinh nghiệm trước khi tham gia), admin đã xem và duyệt.
   - Mục tự khai **chưa duyệt không hiện trên CV**.
3. Bấm một nút xuất **CV PDF khổ A4**, theo 3 mẫu đã duyệt: Huấn luyện viên · TNV, CTV · Ban tổ chức.
4. Mỗi CV xuất ra có mã QR riêng. Quét QR mở trang xác thực công khai, xem được CV đó có thật, xuất ngày nào.

## 2. Phạm vi

**Có (bước 1):** trang Hồ sơ của tôi · ghi nhận vị trí của nhân sự trong từng sự kiện, dự án · danh mục kỹ năng và lượt ghi nhận kỹ năng · bảng chứng chỉ và kinh nghiệm tự khai kèm hàng chờ duyệt · xuất CV PDF 3 mẫu · trang xác thực CV · quét QR thẻ nhân sự.

**Có (bước 2, sau đợt 2):** số buổi đứng lớp, số học viên đã dạy, lượt các bạn lên cấp theo giai đoạn Passport, lấy tự động từ `sessions`, `attendance`, `level_records`.

**Không có:** sàn kết nối HLV, xếp hạng HLV, điểm sao (đợt 7) · thu phí xuất CV · CV tiếng Anh tự dịch (bản EN chỉ dùng chữ đã nhập song ngữ) · gửi CV qua email từ app.

## 3. Dữ liệu (bổ sung vào 01-du-lieu.md)

| Thay đổi | Nội dung |
| :---- | :---- |
| `profiles` thêm cột | `cv_type` (`coach` / `volunteer` / `organizer`, null = chưa phải nhân sự): mẫu CV mặc định của người này. Mỗi người **một** loại; admin gán và đổi được, người dùng không tự đổi. `joined_vncentre_on` (date). `show_contact_on_cv` (bool, mặc định false) |
| Bảng mới `staff_engagements` | Một dòng = một lần nhân sự đảm nhận một việc. id, user_id, kind (`event` / `project` / `class`), event_id (nullable), class_id (nullable), project_name_vi/en (khi không gắn sự kiện, lớp), position_vi/en (ví dụ "HLV trạm Putt", "Trưởng ban hậu cần"; bản EN do chủ hồ sơ nhập, xem S5), staff_group (`coach` / `volunteer` / `collaborator` / `organizer`), started_on, ended_on, hours (nullable), scale (JSON: participants, schools, partners, teams), outcome_vi/en (kết quả chính), source (`system` / `manager` / `self`), status (`pending_review` / `approved` / `rejected`), confirmed_by, confirmed_at, rejected_reason, timestamps, deleted_at |
| Bảng mới `staff_skills` | Danh mục kỹ năng admin chỉnh: code, name_vi/en, sort_order, is_active. Seed: điều phối, hướng dẫn trẻ em, truyền thông, tiếp đón khách, hậu cần sự kiện, điều phối giải đấu |
| Bảng mới `staff_skill_records` | user_id, engagement_id, skill_code, recorded_by, recorded_at. Một kỹ năng ghi tối đa một lần cho mỗi engagement |
| Bảng mới `staff_credentials` | Chứng chỉ và kinh nghiệm tự khai: user_id, type (`certificate` / `prior_experience`), title_vi/en, issuer, issued_on, expires_on, years (cho kinh nghiệm), file_path (kho riêng tư), status (`pending_review` / `approved` / `rejected`), reviewed_by, reviewed_at, rejected_reason. **Đây chính là bảng `coach_credentials` dự kiến ở đợt 7, đổi tên và mở rộng cho mọi nhân sự.** Đợt 7 dùng lại bảng này, không tạo bảng mới |
| Bảng mới `staff_cv_exports` | verify_code, user_id, cv_type, lang (`vi` / `en`), data (JSON snapshot toàn bộ nội dung đã in), pdf_path, exported_at, status (`valid` / `revoked`). Giống `certificates`: CV đã xuất không đổi nội dung khi hồ sơ thay đổi |
| Kho riêng tư mới `staff-files` | File chứng chỉ tải lên và PDF CV. Chỉ chủ hồ sơ và admin tải, qua link có hạn |

**Engagement nào tự sinh, engagement nào phải nhập:**

| Nguồn | Cách sinh | source | status khi tạo |
| :---- | :---- | :---- | :---- |
| Gán `event_staff` cho sự kiện | Tự sinh một dòng kind = event. position để trống cho người phụ trách điền | system | approved |
| Gán `class_staff` cho lớp | Tự sinh một dòng kind = class, gắn trường và năm học | system | approved |
| Admin hoặc trưởng ban nhập dự án | Nhập tay, điền position, scale, outcome | manager | approved |
| Nhân sự tự khai việc cũ | Nhập tay | self | pending_review |

Người được ghi `confirmed_by` trên dòng là người in ra dòng "Xác nhận bởi …" trên CV BTC.

**Phân quyền:** nhân sự xem và sửa phần tự khai của mình; xem (không sửa) phần system và manager. Admin toàn quyền. HLV trưởng và người được gán phụ trách sự kiện được điền position, outcome, ghi kỹ năng cho nhân sự **trong sự kiện, lớp của mình**. Không ai khác xem hồ sơ nhân sự. Trang xác thực công khai chỉ hiện: tên, vai trò, ngày xuất, trạng thái hợp lệ. Không hiện SĐT, email, nội dung chi tiết.

## 4. Các luồng

### S1. Quét QR thẻ nhân sự

Theo quyết định 09/10/2026: nhân sự dùng chính mã Golf Passport của mình làm mã định danh.

1. Quét QR khi **chưa đăng nhập**: hiện thẻ tóm tắt (ảnh, tên, vai trò hiện tại, đơn vị) và nút Đăng nhập. Không hiện thêm gì.
2. Đăng nhập bằng SĐT hoặc email kèm mật khẩu (F1) thì mới vào Hồ sơ của tôi, checklist công việc, tải chứng nhận, xuất CV.
3. QR **không bao giờ** là chìa khoá đăng nhập. Mất thẻ không làm lộ dữ liệu.

### S2. Hồ sơ của tôi

- Đầu trang: ảnh, tên, vai trò, mã định danh, ngày tham gia.
- 4 ô số liệu theo `cv_type` (mục 5). Ô nào chưa có nguồn dữ liệu thì **ẩn**, không hiện số 0.
- Danh sách engagement theo thời gian, mới nhất trước, mỗi dòng có dấu Đã xác thực / Đã duyệt. Dòng `pending_review` hiện cho chủ hồ sơ với nhãn "Chờ duyệt", không bao giờ in ra CV.
- Mục Chứng chỉ, kinh nghiệm: nút Thêm, tải ảnh hoặc PDF, theo dõi trạng thái duyệt, xem lý do bị từ chối.

### S3. Người phụ trách ghi nhận

Trong màn hình sự kiện, lớp, người phụ trách thấy danh sách nhân sự, với mỗi người: điền position, số giờ, tick kỹ năng (từ `staff_skills`), điền kết quả chính (cho BTC). Lưu là xong, không cần duyệt thêm. Mọi thay đổi ghi `audit_logs`.

### S4. Admin duyệt mục tự khai

Hàng chờ riêng "Hồ sơ nhân sự chờ duyệt" (**không** trộn vào hàng chờ F12 của học viên). Xem file đính kèm → Duyệt hoặc Từ chối kèm lý do. Chứng chỉ có `expires_on`: hết hạn thì tự chuyển về không hiện trên CV, báo chủ hồ sơ trước 60 ngày (khớp quy tắc đợt 7).

### S5. Xuất CV

1. Bấm "Xuất CV" → chọn tiếng Việt hoặc tiếng Anh. Chọn tiếng Anh mà còn dòng thiếu chữ EN (position, outcome, tên dự án, chứng chỉ) thì app liệt kê các dòng đó để **chủ hồ sơ tự nhập** rồi mới xuất được. App không tự dịch → chọn có in liên hệ hay không (theo `show_contact_on_cv`, đổi được lúc xuất).
2. App chụp snapshot dữ liệu đã xác thực và đã duyệt, sinh PDF A4 bằng pdf-lib, font Be Vietnam Pro, lưu `staff_cv_exports`.
3. Tải về qua link có hạn **24 giờ**. Mỗi lần xuất là một bản mới, một mã xác thực mới.
4. Chủ hồ sơ hoặc admin thu hồi được một bản CV đã xuất. Trang xác thực khi đó báo "Đã thu hồi".

### S6. Trang xác thực CV

Dùng chung đường dẫn với chứng nhận: `/verify/{verify_code}`. Mã của CV và của chứng nhận không được trùng. Kết quả hiện: tên, vai trò, ngày xuất, "Hợp lệ" hoặc "Đã thu hồi".

## 5. Ba mẫu CV

Bám đúng 3 mẫu chủ sản phẩm đã duyệt ngày 09/10/2026 (canvas "Mẫu CV hồ sơ nhân sự Golf Passport"). Màu, font lấy từ `src/index.css`: navy `#080634`, gold `#f9c74f`, đồng `#b06829`, nâu `#6a3a16`, kem `#fbf7ef`, dải 5 màu giai đoạn Passport ở mép trên. **Không có logo VN Centre.** Khổ A4 dọc, một trang. Nếu nội dung dài hơn một trang thì in các mục mới nhất, cuối danh sách ghi "và N mục khác, xem bản đầy đủ khi quét QR".

Bố cục chung: đầu trang navy (ảnh, tên, vai trò, mã định danh, ngày tham gia, QR xác thực) → 4 ô số liệu → nội dung chính bên trái, cột phụ bên phải (liên hệ, phân nhóm, chứng chỉ, chú thích 2 loại dấu) → chân trang ghi ngày xuất và app.vncentre.net.

| Mẫu | 4 ô số liệu | Nội dung chính | Cột phụ |
| :---- | :---- | :---- | :---- |
| Huấn luyện viên | Năm kinh nghiệm · Số buổi đứng lớp (bước 2) · Học viên đã dạy · Lượt các bạn lên cấp (bước 2) | Quá trình giảng dạy theo năm học · Các bạn lên cấp chia theo 5 giai đoạn Passport (bước 2) · Sự kiện đã tham gia | Liên hệ · Phân nhóm HLV và hạng tài khoản · Chứng chỉ |
| TNV, CTV | Sự kiện đã tham gia · Giờ đóng góp · Vai trò đã đảm nhận · Chứng nhận tham gia | Hành trình tham gia (sự kiện, việc đã làm, số giờ) · Kỹ năng được ghi nhận kèm số lần | Liên hệ · Đang học, công tác (tự khai) · Chứng nhận tiêu biểu |
| Ban tổ chức | Dự án, sự kiện đã làm · Lượt người tham dự · Trường và đối tác · Năm kinh nghiệm | Dự án, sự kiện: vị trí, quy mô, kết quả chính, "Xác nhận bởi …" | Liên hệ · Vị trí hiện tại · Chuyên môn |

Hai loại dấu phải khác nhau **cả hình lẫn màu**, in đen trắng vẫn phân biệt: chấm tròn navy đặc có dấu tích gold = Đã xác thực; vòng tròn viền đồng có dấu tích = Đã duyệt.

**Cách tính số liệu** (tính lúc xuất, không lưu cột cứng):

- Năm kinh nghiệm = từ engagement sớm nhất (approved) đến hiện tại, cộng `years` của kinh nghiệm tự khai đã duyệt. Có phần tự khai thì ô này mang dấu Đã duyệt.
- Học viên đã dạy (bước 1) = số học viên khác nhau trong `enrollments` của các lớp người này có trong `class_staff`.
- Số buổi đứng lớp, lượt lên cấp (bước 2) = từ `sessions`, `attendance`, `level_records` của các lớp đó.
- Lượt người tham dự = tổng `scale.participants` các engagement của BTC; với sự kiện trong app thì lấy số thẻ đã ghi tên từ `event_participations`.

## 5b. Quy tắc nghiệp vụ (để viết kiểm thử)

| \# | Quy tắc |
| :---- | :---- |
| S-R1 | Mục `pending_review` hoặc `rejected` không bao giờ có trong CV xuất ra |
| S-R2 | Chỉ engagement có source = system hoặc manager mới mang dấu Đã xác thực. Mục self đã duyệt mang dấu Đã duyệt |
| S-R3 | Nhân sự không tự sửa được dòng source = system hoặc manager, trừ các trường chữ EN; không tự đổi `cv_type`. Mọi lần sửa chữ EN ghi `audit_logs` |
| S-R4 | Quét QR khi chưa đăng nhập chỉ trả về thẻ tóm tắt, không trả SĐT, email, danh sách engagement |
| S-R5 | CV đã xuất không đổi nội dung khi hồ sơ thay đổi (đọc từ snapshot) |
| S-R6 | Mã xác thực CV không trùng mã chứng nhận; CV bị thu hồi thì trang xác thực báo đã thu hồi |
| S-R7 | Trang xác thực công khai không hiện liên hệ và nội dung chi tiết |
| S-R8 | Ô số liệu thiếu nguồn dữ liệu thì ẩn, không hiện 0 |
| S-R9 | Chứng chỉ quá `expires_on` không in ra CV |
| S-R10 | Người phụ trách chỉ ghi nhận được cho nhân sự trong sự kiện, lớp của mình |
| S-R11 | Mọi thay đổi engagement, duyệt, từ chối, xuất và thu hồi CV ghi `audit_logs` |
| S-R12 | Hồ sơ nhân sự không vào hàng chờ F12 của học viên |

## 6. Tiêu chí nghiệm thu (bước 1)

Làm trên app.vncentre.net bằng điện thoại thật:

1. Admin gán `cv_type = coach` cho HLV A và gán A vào 2 lớp → hồ sơ A tự có 2 dòng giảng dạy, dấu Đã xác thực, ô Học viên đã dạy đúng tổng số học viên khác nhau của 2 lớp.
2. Ô Số buổi đứng lớp và Lượt lên cấp **không hiện** (đợt 2 chưa có).
3. Gán TNV B làm `event_staff` sự kiện 10/10 → hồ sơ B tự có một dòng sự kiện. Người phụ trách điền "Hướng dẫn check-in", 8 giờ, tick 2 kỹ năng → hồ sơ B hiện đủ.
4. A tự khai chứng chỉ CGI, tải ảnh → thấy "Chờ duyệt"; xuất CV → chứng chỉ chưa có trên CV. Admin duyệt → xuất lại → chứng chỉ có, dấu Đã duyệt.
5. B tự khai một việc cũ → admin từ chối kèm lý do → B thấy lý do.
6. B cố sửa dòng sự kiện 10/10 → không sửa được.
7. Xuất CV cho A (mẫu HLV), B (mẫu TNV), C (mẫu BTC): PDF đúng mẫu, đủ dấu tiếng Việt, một trang A4, không có logo VN Centre.
8. Tắt "in liên hệ" → PDF không có SĐT, email.
9. Quét QR trên PDF → trang xác thực "Hợp lệ", chỉ có tên, vai trò, ngày xuất. Thu hồi bản đó → quét lại báo "Đã thu hồi".
10. Sửa hồ sơ A sau khi xuất → mở lại bản đã xuất qua QR vẫn đúng nội dung cũ.
11. Người lạ quét QR thẻ của A khi chưa đăng nhập → chỉ thấy ảnh, tên, vai trò và nút Đăng nhập.
12. In thử 3 PDF đen trắng → vẫn phân biệt được hai loại dấu.

## 7. Thứ tự ưu tiên

| Mức | Phần | Điều kiện |
| :---- | :---- | :---- |
| Làm trước | Dữ liệu mục 3, tự sinh engagement từ `event_staff` và `class_staff`, S2, S4 | Sau khi sự kiện 10/10 xong và ổn định |
| Tiếp theo | S3, S5, S6, 3 mẫu PDF | Sau phần trên |
| Sau cùng | S1 thẻ tóm tắt khi quét QR | Khi in thẻ nhân sự đợt mới |
| Bước 2 | Số buổi đứng lớp, lượt lên cấp | Khi đợt 2 (`sessions`, `attendance`) đã build |

## 8. Cập nhật kèm theo (Claude Code thực hiện cùng lúc)

1. **README docs/spec:** thêm dòng "Mới ở v0.9: thêm 11-module-ho-so-nhan-su.md, hồ sơ nhân sự và xuất CV" và một dòng vào bảng mục 1.
2. **01-du-lieu.md:** thêm cột, bảng, kho ở mục 3 file này; ở dòng "Hồ sơ HLV" (đợt 7) thay `coach_credentials` bằng `staff_credentials`.
3. **09-dot-7-san-ket-noi-hlv.md:** ghi chú hồ sơ HLV dùng lại `staff_credentials` và `staff_engagements`; nhãn "VN Centre đã xem bản gốc" tương ứng trạng thái approved.
4. **phu-luc-D-viec-con-mo.md:** thêm các dòng dưới đây, đánh số tiếp theo dãy hiện có, trạng thái **Đã chốt**:
   - Bước 2 in **số buổi** đứng lớp, không in số giờ (`sessions` không lưu giờ kết thúc).
   - Mỗi người **một** `cv_type`; admin đổi được.
   - Chữ EN trên CV do **chủ hồ sơ tự nhập**; app không tự dịch.
   - Link tải CV hết hạn sau **24 giờ**, như chứng nhận.
