# 21 · Module Thành viên phát triển dự án và Ví tích điểm người lớn

Bản 1 · 09/11/2026 · Người yêu cầu: Vũ Anh Long · Người soạn: Minh
Đọc kèm: spec 18 (Golf Passport Partners giai đoạn 1, migration `20261107000001_partners_gd1.sql`), `19-module-diem-thuong-doi-qua.md` (D58, D61), bản "Chính sách Thành viên phát triển dự án" (văn bản công bố cho thành viên).

---

## 0. Vì sao có file này

Ngày 06/11 và 09/11/2026 anh Long chốt:
- Vị trí **Thành viên phát triển dự án** (bản chất là kinh doanh, nhưng không gọi là sale): mang về tài trợ, mở đối tác, tuyển sinh, nhận hoa hồng theo công thức công bố trước. **Mô hình một cấp**, không đa cấp.
- **Ví tích điểm người lớn** riêng cho người **từ 16 tuổi**, 1 điểm = 1.000 đ, hạn dùng 24 tháng, tách hẳn khỏi điểm thưởng học viên (D58).
- **Giai đoạn 1:** admin nhập tay khoản đã về → app tự tính → cộng vào ví. Thử với sân tập Đảo Sen.

Spec 18 đã có: đối tác, ưu đãi, quầy quét QR, mã giới thiệu một cấp, thưởng giới thiệu và hoa hồng sale **tạm tính**, đối soát tháng, khoá chi trả cho đến khi pháp lý duyệt. File này **nối tiếp spec 18**, không làm lại.

## 1. Nguyên tắc bắt buộc

1. **Một cấp.** Hoa hồng chỉ cho người trực tiếp mang về. Không có hàm, màn hình nào đi lên "tuyến trên".
2. **Công thức công bố trước.** Mọi tỉ lệ, hệ số nằm trong cấu hình admin, hiện công khai trong app cho thành viên, có ngày hiệu lực. Đổi tỉ lệ chỉ áp dụng cho cơ hội đăng ký sau ngày đổi.
3. **Chỉ tính trên tiền và hàng đã thực nhận.** Hợp đồng ký nhưng chưa nhận thì hoa hồng ở trạng thái "dự kiến", chưa vào ví.
4. **Điểm phát ra luôn có tiền đứng sau.** Điểm cho khách tại đối tác chỉ lấy từ phần đối tác trả cho VN Centre.
5. **Chi trả tiền vẫn khoá** bởi cơ chế `partners.legal_review` / `partners.payouts_enabled` của spec 18 cho đến khi pháp lý duyệt.
6. **Không phá dữ liệu cũ.** Migration chỉ thêm. Làm trên **staging** trước.

## 2. Trước khi code: việc Claude Code phải làm

1. Đọc schema staging: các bảng của spec 18, `profiles` (ngày sinh), `user_roles`, `orders`, `products`, cơ chế lưu phiên bản điều khoản đã đồng ý, quan hệ phụ huynh – con.
2. Viết `docs/spec/21-mapping.md`. **Dừng lại cho anh Long xác nhận.**

## 3. Ví tích điểm người lớn

**Ai có ví:** tài khoản người lớn mã VNC, **đủ 16 tuổi** theo ngày sinh trong hồ sơ. Chưa có ngày sinh thì chưa mở ví.

**Dữ liệu:** bảng `adult_ledger` — sổ duy nhất, không bảng số dư:
`user_id`, `unit` (`point` / `vnd`), `delta`, `reason`, `source_type`, `source_id`, `status` (`expected` / `available` / `void`), `expires_at` (chỉ với điểm), người ghi, ghi chú.

| Ô trong ví | Nội dung |
|---|---|
| Điểm khả dụng | Tổng điểm `available` chưa hết hạn. Giá trị hiển thị kèm = điểm × 1.000 đ |
| Hoa hồng chờ chi | Tổng `vnd` `available` chưa chi |
| Dự kiến | Tổng `expected` (hợp đồng đã ký, tiền/hàng chưa về). Chỉ để xem |
| Sắp hết hạn | Điểm hết hạn trong 60 ngày tới |

**Hạn 24 tháng:** mỗi lần cộng điểm là một lô, hết hạn sau 24 tháng. Khi trừ điểm, trừ **lô sắp hết hạn trước**. Hằng ngày app ghi dòng `expire` cho phần còn lại của các lô đã hết hạn.

**Chuyển từ ví học viên khi đủ 16 tuổi** (D61, đã chốt): tự chọn; **bắt buộc bố mẹ hoặc người giám hộ xác nhận trên app**; 10 điểm học viên = 1 điểm người lớn (cấu hình); một chiều, một lần, toàn bộ số dư khả dụng; đơn quà đang chờ phải xong hoặc huỷ trước; sau khi chuyển, điểm thưởng học viên mới tự quy đổi cùng tỉ lệ vào ví người lớn; điểm xếp hạng không đổi. Làm ở giai đoạn 3.

## 4. Thành viên phát triển dự án

**Trở thành thành viên:**
- Admin gán vai `project_developer` (thêm vào ràng buộc `user_roles`).
- Điều kiện: đủ 16 tuổi; đã đồng ý phiên bản hiện hành của Chính sách (lưu phiên bản và thời điểm). Dưới 18 tuổi: thêm xác nhận của bố mẹ hoặc người giám hộ.
- Spec 18 đang dùng `partners.sales_owner_user_id` cho người chốt đối tác. Thành viên phát triển dự án dùng chính trường này cho đối tác ưu đãi.

**Quyền ưu tiên (D68):** cơ hội do thành viên đăng ký được giữ **90 ngày**; mỗi lần thành viên cập nhật (ghi chú, đổi trạng thái, tải file) thì tính lại từ đầu. Quá 90 ngày không có bất kỳ cập nhật nào thì app tự mở cơ hội cho người khác và báo thành viên cũ.

**Cơ hội (`deals`):** đơn vị, loại (`sponsor_cash` / `sponsor_inkind` / `media_patron` / `partner` / `enrollment`), thành viên phụ trách, người liên hệ, giá trị dự kiến, trạng thái (`registered` → `in_progress` → `signed` → `received` → `closed`, hoặc `lost`), file hợp đồng (kho riêng tư), ghi chú. Ở giai đoạn 1 chỉ admin tạo và cập nhật.

**Khoản đã nhận (`deal_receipts`):** cơ hội, ngày, loại (`cash` / `goods` / `media`), giá trị ghi trên chứng từ, hệ số quy đổi, giá trị tính hoa hồng, người nhập, file chứng từ. Tiền về nhiều đợt thì nhập nhiều dòng; mỗi dòng sinh hoa hồng tương ứng.

## 5. Công thức hoa hồng (cấu hình, công bố trước)

| Loại cơ hội | Cơ sở tính | Tỉ lệ | Trả bằng |
|---|---|---|---|
| Tài trợ tiền | Số tiền thực nhận | 10% | Tiền (`vnd`) |
| Tài trợ hiện vật | Giá thị trường × hệ số 70–100% (admin chọn từng khoản) | 10% | Điểm (giá trị ÷ 1.000) |
| Bảo trợ truyền thông | Giá trị hợp đồng × 20% | 10% | Điểm |
| Đối tác ưu đãi | Phí VN Centre thu hằng tháng từ đối tác | 10% | Tiền — **đã có** (`sales_commissions`, spec 18) |
| Tuyển sinh | Học phí thực thu của khoá | 10–30%, đặt riêng **từng khoá** | Tiền |

**Ví dụ (đưa vào màn hình trợ giúp):** hợp đồng bảo trợ truyền thông ghi 1 tỷ đồng → cơ sở 200 triệu → hoa hồng 20 triệu → **20.000 điểm**.

- Hoàn tiền, huỷ hợp đồng, trả lại hàng → dòng điều chỉnh âm tương ứng.
- **Tuyển sinh (D69, đã chốt):**
  - Thêm cột `commission_rate` cho sản phẩm khoá học. Ghi nhận khi đơn hàng đã thanh toán.
  - **Khoá đầu tiên** của học viên mới: hoa hồng cho thành viên đã tuyển (học viên đăng ký bằng mã của thành viên).
  - **Các khoá gia hạn sau đó:** hoa hồng theo mức của khoá gia hạn, trả cho **người chăm sóc** học viên đó:
    - HLV chăm sóc, theo dõi → tính cho HLV.
    - Thành viên phát triển dự án chăm sóc → tính cho thành viên.
    - Cả hai cùng làm → mặc định **chia đôi**; hai bên có thể tự thống nhất tỉ lệ khác và **cả hai cùng bấm xác nhận** trên app.
  - Thêm bảng `student_caretakers`: học viên, người chăm sóc (một hoặc hai người), tỉ lệ chia, ngày hiệu lực, trạng thái xác nhận. Admin gán; đơn gia hạn lấy người chăm sóc đang hiệu lực tại ngày thanh toán.
  - HLV nhận hoa hồng gia hạn **không cần** vai `project_developer`; vẫn phải đủ 16 tuổi và có ví người lớn.

## 6. Điểm cho khách tại đối tác — công thức 4 phần

Trên mỗi hoá đơn, phần đối tác cam kết dành cho hệ sinh thái chia thành 4 phần:

1. Giảm trực tiếp tại quầy cho khách.
2. Điểm cho khách (vào ví người lớn).
3. Hoa hồng cho người giới thiệu (spec 18, `referral_earnings`).
4. VN Centre giữ, **tối thiểu 2–3%** (cấu hình `partners.vnc_floor_rate`).

Ràng buộc: phần 2 + 3 + 4 ≤ phí đối tác trả cho VN Centre (`partners.fee_rate`). Các tỉ lệ đặt riêng **theo từng đối tác hoặc từng ưu đãi**; app không cho lưu cấu hình vi phạm ràng buộc.

**Ví dụ:** hoá đơn 300.000 đ, đối tác dành 20%: giảm 10% tại quầy (khách trả 270.000 đ); 10% còn lại về VN Centre = 5% điểm cho khách (15 điểm) + 2% người giới thiệu + 3% VN Centre.

**Chỗ phải chỉnh so với spec 18:** hiện `partners.referral_rate` = 5% và chỉ bị chặn bởi `fee_rate`, nên VN Centre có thể không còn gì. Thêm ràng buộc sàn ở trên. **D70 (đã chốt):** khách quét **sổ của các con** thì giữ cách tính hiện tại của spec 18 (điểm vào `reward_ledger` của học viên, thang Passport); khách quét **thẻ người lớn** thì điểm vào `adult_ledger` theo công thức 4 phần.

## 7. Báo cáo cho admin

- Tổng điểm người lớn đang lưu hành và quy ra tiền (khoản VN Centre có thể phải chi).
- Hoa hồng: dự kiến, chờ chi, đã chi — theo tháng, theo thành viên, theo loại cơ hội.
- Danh sách chi tháng, xuất Excel.

**Thuế và chi trả (D71, đã chốt):**
- App **tự giữ lại 10% thuế thu nhập cá nhân** trước khi chi, để VN Centre nộp thay. Màn hình chi hiện: tổng hoa hồng, thuế giữ lại, thực nhận.
- **Áp dụng cho mọi khoản chi hoa hồng, không xét ngưỡng** (D73, anh Long chốt 09/11/2026). Cấu hình `tax.withholding_threshold_vnd` = 0. Lưu ý: theo Nghị định 253/2026/NĐ-CP, khoản dưới 5 triệu đồng/lần không bắt buộc khấu trừ; vì VN Centre vẫn giữ lại, kế toán phải nộp đủ số đã giữ và cấp chứng từ khấu trừ để thành viên quyết toán lấy lại nếu thuộc diện được hoàn.
- Người đã nộp cam kết tạm không khấu trừ (mẫu do cơ quan thuế quy định) thì admin đánh dấu trên hồ sơ, app không giữ lại.
- Xuất danh sách chứng từ khấu trừ theo tháng cho kế toán.
- **Thành viên 16–17 tuổi** có tài khoản ngân hàng đứng tên mình thì chuyển vào tài khoản đó. Chưa có thì giữ trong ví ở trạng thái chờ chi đến khi khai tài khoản.

## 8. Giai đoạn

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Vai `project_developer`; ví người lớn (sổ, hạn 24 tháng, lịch sử); admin nhập cơ hội và khoản đã nhận; app tự tính hoa hồng theo mục 5; thành viên xem ví. Thử với Đảo Sen | **Đã chốt 09/11/2026** |
| 2 | Thành viên tự đăng ký cơ hội, giữ quyền ưu tiên (D68); tuyển sinh tự động qua mã giới thiệu; công thức 4 phần ở mục 6 | Sau khi giai đoạn 1 chạy ổn |
| 3 | Đổi điểm người lớn tại VN Centre và tại đối tác (đối tác quét, trừ điểm, đưa vào đối soát tháng); chuyển ví từ học viên | Sau giai đoạn 2 |

## 9. Tiêu chí nghiệm thu giai đoạn 1 (kiểm trên staging)

1. Người 15 tuổi không được gán `project_developer`; người 17 tuổi chỉ được gán khi đã có xác nhận của phụ huynh.
2. Chưa đồng ý Chính sách thì chưa được gán vai.
3. Nhập khoản tài trợ tiền 50 triệu đã nhận: ví thành viên có 5 triệu hoa hồng chờ chi.
4. Nhập hợp đồng bảo trợ truyền thông 1 tỷ: ví có 20.000 điểm, hết hạn sau đúng 24 tháng.
5. Hợp đồng đã ký, chưa nhận: chỉ hiện ở ô Dự kiến, không vào khả dụng.
6. Hoàn tiền một phần: hoa hồng giảm đúng tỉ lệ bằng dòng điều chỉnh.
7. Đổi tỉ lệ trong cấu hình: cơ hội đăng ký trước ngày đổi vẫn tính theo tỉ lệ cũ.
8. Một lô điểm quá 24 tháng: dòng `expire` được ghi đúng phần chưa dùng.
9. Thành viên A không xem được ví, cơ hội của thành viên B.
10. Chi trả vẫn bị khoá khi `partners.payouts_enabled` chưa bật.
11. Không có màn hình hay hàm nào hiện "tuyến trên".
12. Không bảng, cột, dữ liệu cũ nào bị xoá hoặc đổi tên.

## 10. Việc còn mở — thêm vào `phu-luc-D`

| Mã | Việc | Người chốt | Trạng thái |
|---|---|---|---|
| D68 | Giữ quyền ưu tiên 90 ngày; trong 90 ngày không có bất kỳ cập nhật nào thì cơ hội tự mở cho người khác | Anh Long | **Xong 09/11/2026** |
| D69 | Khoá đầu → người tuyển; khoá gia hạn → người chăm sóc (HLV / thành viên / chia đôi hoặc tự thống nhất) — mục 5 | Anh Long | **Xong 09/11/2026** |
| D70 | Quét sổ của các con → ví học viên; quét thẻ người lớn → ví người lớn theo công thức 4 phần | Anh Long | **Xong 09/11/2026** |
| D71 | Giữ lại 10% thuế TNCN trước khi chi; 16–17 tuổi chuyển vào tài khoản ngân hàng của chính bạn — mục 7 | Anh Long | **Xong 09/11/2026** |
| D72 | Anh Long chốt 09/11/2026: coi là chia hoa hồng bán hàng thông thường, triển khai không chờ luật sư. Minh đã rà sơ bộ (xem bản Chính sách). Admin bật `partners.legal_review` / `partners.payouts_enabled` khi sẵn sàng chi tiền thật | Anh Long | **Xong** |
| D73 | Giữ lại 10% thuế trên mọi khoản chi hoa hồng, không xét ngưỡng | Anh Long | **Xong 09/11/2026** |

## 11. Thứ tự làm và điểm dừng

Làm từng bước, xong bước nào **chạy kiểm thử, báo cáo 3 dòng, dừng chờ anh Long xác nhận**:

1. `21-mapping.md`. **Dừng.**
2. Migration giai đoạn 1: vai, `adult_ledger`, `deals`, `deal_receipts`, cấu hình tỉ lệ. **Dừng.**
3. Màn admin nhập cơ hội, khoản đã nhận; tự tính hoa hồng. **Dừng.**
4. Ví người lớn trên app (xem, lịch sử, hạn). **Dừng.**
5. Thử với Đảo Sen, báo cáo. **Dừng.** Giai đoạn 2, 3 viết chi tiết sau.
