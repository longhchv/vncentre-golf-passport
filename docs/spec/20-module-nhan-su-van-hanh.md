# 20 · Module Nhân sự vận hành hằng ngày: lịch dạy, chấm công, thù lao, chứng chỉ, đánh giá

Bản 1 · 09/11/2026 · Người yêu cầu: Vũ Anh Long · Người soạn: Minh
Đọc kèm: `03-dot-2-lop-hoc.md` (khung buổi học, người tham gia), `11-module-ho-so-nhan-su.md` (hồ sơ, chứng chỉ, CV), `11-module-nhan-su-su-kien.md` (nhân sự sự kiện).

---

## 0. Vì sao có file này

Ngày 09/11/2026 anh Long chốt: mọi người lớn làm việc với VN Centre (HLV, trợ giảng, nhân viên, giáo viên thể chất của trường…) dùng **một tài khoản mã VNC**, và app quản lý cả phần vận hành hằng ngày, không chỉ sự kiện. Gồm 5 mảng, **ưu tiên mảng 1 và 2**:

1. Lịch dạy và phân lớp.
2. Chấm công theo buổi.
3. Thù lao cuối tháng.
4. Hồ sơ và chứng chỉ.
5. Đánh giá.

**Quan hệ với file 03:** đợt 2 mới có khung, chưa có bản chi tiết. File này **là bản chi tiết cho mục 2.1 (buổi học) và 2.2 (người tham gia) của file 03**, ở phần liên quan đến nhân sự. Phần điểm danh học viên, kỹ năng, lên level (03 mục 2.3 trở đi) vẫn chờ file 03 bản chi tiết; file này chỉ chừa sẵn chỗ nối.

## 1. Nguyên tắc bắt buộc

1. **Một người, một tài khoản mã VNC.** Không tạo tài khoản nhân sự riêng. Dùng các vai truy cập đang có: `admin`, `head_coach`, `coach`, `assistant`, `pe_teacher`, `school_manager`. Không thêm vai mới.
2. **Dùng lại bảng đang có:** `classes`, `class_staff`, `schools`, `enrollments`, `staff_engagements`, `staff_credentials`. Không tạo bảng trùng chức năng.
3. **Số tiền thù lao là dữ liệu riêng tư:** chỉ chủ tài khoản và admin xem. Không in ra CV, không hiện cho HLV khác, nhà trường, phụ huynh.
4. **Không phá dữ liệu cũ.** Migration chỉ thêm. Làm trên **staging** trước.
5. **Mọi thay đổi phân công, chấm công, thù lao ghi `audit_logs`.**
6. **Bảo vệ trẻ em:** đánh giá chỉ do phụ huynh, nhà trường và HLV trưởng thực hiện; không bao giờ xin các con chấm HLV.

## 2. Trước khi code: việc Claude Code phải làm

1. Đọc schema staging: `classes`, `class_staff`, `schools`, `enrollments`, `staff_engagements`, `staff_credentials`, `profiles`, `user_roles`, cơ chế pg_cron, cơ chế xuất Excel nếu đã có.
2. Viết `docs/spec/20-mapping.md`: bảng nào dùng lại, bảng/cột nào thêm, quan hệ với file 03. **Dừng lại cho anh Long xác nhận.**

## 3. Mảng 1 — Lịch dạy và phân lớp

**Dữ liệu thêm:**

| Bảng | Nội dung chính |
|---|---|
| `class_schedules` | lớp, thứ trong tuần, giờ bắt đầu, thời lượng (phút), địa điểm, từ ngày – đến ngày (theo học kỳ) |
| `sessions` | lớp, ngày, giờ bắt đầu, thời lượng, địa điểm, trạng thái (`planned` / `held` / `cancelled`), lý do huỷ (nghỉ lễ, trường bận, thời tiết, khác), ghi chú "Hôm nay học gì" |
| `session_staff` | buổi, người, vai trong buổi (`lead` / `assistant` / `pe_teacher`), trạng thái (`assigned` / `checked_in` / `absent` / `replaced`), người thay, lý do vắng |

**Quy tắc:**
- App **tự sinh buổi** từ `class_schedules` cho 4 tuần tới, chạy hằng ngày (03 mục 2.1). HLV trưởng hoặc admin sửa, huỷ từng buổi.
- `session_staff` tự lấy từ `class_staff` của lớp khi sinh buổi. Đổi người cho một buổi không đổi `class_staff`.
- **Trùng giờ:** gán một người vào hai buổi chồng giờ thì app cảnh báo, admin vẫn lưu được nếu xác nhận.
- **Lịch của tôi** (điện thoại): hôm nay trước, rồi 7 ngày tới; mỗi buổi có trường, lớp, giờ, địa điểm, vai, nút chỉ đường.
- Giáo viên thể chất (`pe_teacher`) chỉ thấy buổi của trường mình. Quản lý trường (`school_manager`) thấy lịch cả trường.

**Báo nghỉ và dạy thay:**
1. HLV bấm "Báo nghỉ" trên buổi, chọn lý do. Báo trước **dưới 24 giờ** (D62, cấu hình) thì gắn nhãn "báo gấp".
2. HLV trưởng hoặc admin nhận thông báo, chọn người thay. App gợi ý người **không trùng giờ** và **có chứng chỉ hợp lệ cho vai đó** (mảng 4).
3. Người thay nhận thông báo, bấm "Nhận dạy thay". Khi đó `session_staff` của người cũ thành `replaced`, người thay thành `assigned`.
4. Không ai nhận trước giờ dạy 2 tiếng thì báo HLV trưởng và admin.

## 4. Mảng 2 — Chấm công theo buổi

**Cách chấm:**
- Mỗi lớp có một **mã QR lớp** (in dán tại điểm dạy, hoặc hiện trên máy của giáo viên thể chất). Mã chỉ là định danh lớp, không phải chìa khoá.
- HLV đã đăng nhập, quét mã QR lớp trong khung từ 30 phút trước đến 30 phút sau giờ bắt đầu → `session_staff` thành `checked_in`, ghi giờ. Muộn quá **10 phút** (D63, cấu hình) thì gắn nhãn "muộn".
- **Vị trí GPS (D64, đã chốt dùng):** mục đích là xác nhận HLV dạy đúng lớp, đúng trường. Mỗi trường/điểm dạy có toạ độ và bán kính (mặc định 500 m, admin chỉnh). Khi quét QR, app xin quyền vị trí và lưu toạ độ **chỉ tại thời điểm chấm công**, không theo dõi liên tục. Ngoài bán kính hoặc không cho quyền vị trí: vẫn chấm được nhưng **gắn nhãn** và đưa vào danh sách cho HLV trưởng, admin xem. Lần đầu dùng, app hiện thông báo và xin đồng ý xử lý dữ liệu vị trí (Luật Bảo vệ dữ liệu cá nhân); lưu phiên bản đã đồng ý.
- Hết buổi: bấm "Kết thúc buổi", ghi 1–2 dòng "Hôm nay học gì" (03 mục 2.1, để phụ huynh xem). Buổi thành `held`.
- **Không quét được** (mất mạng, mã hỏng, quên): "Khai bù" trong 24 giờ, bắt buộc ảnh lớp hoặc lý do. HLV trưởng hoặc admin duyệt.

**Một buổi được tính công khi:** buổi ở trạng thái `held` và người đó `checked_in` (hoặc khai bù đã duyệt).

**Nối với các phần khác:**
- **Điểm danh học viên:** khi phần điểm danh của đợt 2 được build, màn hình sau khi quét QR lớp mở thẳng màn điểm danh. Một lần quét vừa chấm công vừa điểm danh. Bây giờ chưa làm.
- **CV nhân sự:** cung cấp số buổi đứng lớp cho bước 2 của file 11 (`11-module-ho-so-nhan-su.md`).
- **Báo cáo:** số buổi theo HLV, theo tháng, theo trường; số buổi muộn, vắng, dạy thay; xuất Excel (03 mục 2.2).

## 5. Mảng 3 — Thù lao cuối tháng

**Dữ liệu thêm:**

| Bảng | Nội dung chính |
|---|---|
| `pay_rates` | vai trong buổi × loại lớp (trường đông / lớp dưới 20 bạn / 1-1 / trại hè / sự kiện) × trường (tuỳ chọn) → đơn giá mỗi buổi; hiệu lực từ ngày. Áp dụng mức cụ thể nhất (có trường > không trường) |
| `pay_statements` | người, tháng, tổng số buổi, tổng tiền theo đơn giá, khoản cộng, khoản trừ, tổng, trạng thái, ghi chú |
| `pay_adjustments` | bảng công, loại (cộng / trừ), số tiền, lý do bắt buộc, người ghi |

**Luồng hằng tháng:**
1. Ngày 1 tháng sau, app tự lập bảng công **nháp**: mỗi buổi được tính công × đơn giá hiệu lực tại ngày dạy.
2. Admin thêm khoản cộng, trừ (phụ cấp đi lại, thưởng…), mỗi khoản có lý do.
3. Gửi cho từng người → người đó **Đồng ý** hoặc **Khiếu nại** (ghi lý do).
4. Admin xử lý khiếu nại → **Chốt**. Bảng đã chốt bị khoá; sai sót phát hiện sau thì ghi khoản điều chỉnh ở tháng sau.
5. Xuất Excel → admin đánh dấu **Đã chi**, ghi ngày chi. **Admin làm toàn bộ phần thù lao** (D66), không tạo vai Kế toán. Bảng đơn giá `pay_rates` do admin nhập trên màn quản trị.

**Thuế:** khấu trừ thuế thu nhập cá nhân theo cùng quy tắc ở spec 21 mục 7 (D71). Bảng công hiện tổng trước thuế, số thuế giữ lại và số thực nhận. Lưu ý: HLV ký hợp đồng lao động từ 3 tháng trở lên tính thuế theo biểu luỹ tiến, kế toán xử lý ngoài app; app chỉ áp khấu trừ 10% cho người không có hợp đồng lao động hoặc hợp đồng dưới 3 tháng (cờ trên hồ sơ, admin đặt).

## 6. Mảng 4 — Hồ sơ và chứng chỉ

Dùng `staff_credentials` của file 11, thêm:
- `role_requirements`: vai trong buổi × loại lớp → danh sách chứng chỉ bắt buộc. **Seed theo D65 (đã chốt):** HLV chính (`lead`) lớp trường cần CGI hoặc SNAG Golf Coach còn hạn. Admin bổ sung cho các vai, loại lớp khác.
- Khi phân lớp hoặc chọn người dạy thay mà người đó thiếu hoặc hết hạn chứng chỉ bắt buộc: **cảnh báo**, admin vẫn lưu được nếu xác nhận, ghi `audit_logs`.
- Nhắc hết hạn trước 60 ngày: chờ cơ chế thông báo chung (D57 hiện có), không làm riêng.

## 7. Mảng 5 — Đánh giá

| Người đánh giá | Khi nào | Nội dung |
|---|---|---|
| Phụ huynh | Tối đa 1 lần mỗi tháng mỗi lớp (D67, đã chốt), sau một buổi con có mặt | 1–5 sao, nhận xét ngắn tuỳ chọn |
| Quản lý trường | Mỗi học kỳ | Mức hài lòng, nhận xét |
| HLV trưởng | Mỗi học kỳ | Chuyên cần và đúng giờ (app tự điền từ mảng 2), giáo án, an toàn, ứng xử với các con, nhận xét |

- Chi tiết từng phiếu: chỉ admin và HLV trưởng xem. HLV được đánh giá chỉ thấy **điểm tổng hợp** và nhận xét đã ẩn tên người viết.
- Không công khai, không xếp hạng HLV (sàn HLV đợt 7 mới tính).
- Phụ huynh không bắt buộc trả lời; nhắc tối đa 1 lần.

## 8. Tiêu chí nghiệm thu (kiểm trên staging)

1. Lớp có lịch thứ 3, thứ 5 lúc 15h15: app sinh đủ buổi 4 tuần tới, đúng giờ, đúng HLV từ `class_staff`.
2. Huỷ một buổi vì nghỉ lễ: buổi không tính công, không hiện trong lịch của HLV.
3. Gán HLV A vào hai buổi chồng giờ: có cảnh báo.
4. A quét QR lớp đúng giờ: `checked_in`; quét muộn quá ngưỡng: có nhãn "muộn"; người chưa đăng nhập quét: không chấm được.
5. A báo nghỉ, HLV trưởng chọn B, B bấm nhận: buổi đó tính công cho B, không tính cho A.
6. Khai bù không có ảnh hoặc lý do: không lưu được; khai bù được duyệt: tính công.
7. Bảng công tháng: tổng tiền = số buổi tính công × đơn giá đúng vai, đúng loại lớp, đúng ngày hiệu lực.
8. HLV khác, nhà trường không xem được bảng công của A.
9. Bảng đã chốt không sửa được; điều chỉnh xuất hiện ở tháng sau.
10. Chọn người dạy thay thiếu chứng chỉ bắt buộc: có cảnh báo.
11. A chỉ thấy điểm tổng hợp đánh giá, không thấy tên phụ huynh.
12. Không bảng, cột, dữ liệu cũ nào bị xoá hoặc đổi tên.

## 9. Việc còn mở — thêm vào `phu-luc-D`

| Mã | Việc | Người chốt | Trạng thái |
|---|---|---|---|
| D62 | Báo nghỉ trước tối thiểu 24 giờ, muộn hơn gắn nhãn "báo gấp" | Anh Long | **Xong 09/11/2026** |
| D63 | Muộn quá 10 phút thì gắn nhãn "muộn" | Anh Long | **Xong 09/11/2026** |
| D64 | Có ghi GPS khi quét QR chấm công, để xác nhận dạy đúng lớp, đúng trường (mục 4) | Anh Long | **Xong 09/11/2026** |
| D65 | HLV chính lớp trường cần CGI hoặc SNAG Golf Coach còn hạn; admin bổ sung vai khác | Anh Long | **Xong 09/11/2026** |
| D66 | Admin làm toàn bộ thù lao, không tạo vai Kế toán; admin nhập bảng đơn giá trên app | Anh Long | **Xong 09/11/2026** |
| D67 | Xin đánh giá phụ huynh tối đa 1 lần/tháng/lớp | Anh Long | **Xong 09/11/2026** |

## 10. Thứ tự làm và điểm dừng

Làm từng bước, xong bước nào **chạy kiểm thử, báo cáo 3 dòng, dừng chờ anh Long xác nhận**:

1. `20-mapping.md` (mục 2). **Dừng.**
2. Lịch, buổi học, phân công, màn "Lịch của tôi" (mảng 1, chưa có báo nghỉ). **Dừng.**
3. Quét QR lớp, kết thúc buổi, khai bù, báo cáo số buổi, nối CV bước 2 (mảng 2). **Dừng.**
4. Báo nghỉ và dạy thay. **Dừng.**
5. Thù lao (mảng 3). **Dừng.**
6. Chứng chỉ bắt buộc (mảng 4). **Dừng.**
7. Đánh giá (mảng 5).
