# 18 · Giao việc: Golf Passport Partners – giai đoạn 1 (đối tác, ưu đãi, điểm, ghi nhận giới thiệu)

Bản 1 · 07/11/2026 · Người soạn: Minh · Chủ sản phẩm duyệt: Vũ Anh Long
Đọc kèm: `04-dot-3-diem-qua-bxh.md` (mục 3 Kho quà, mục 4 Tem đối tác), `01-du-lieu.md` (bảng `partners`, `partner_activities`, `partner_stamps`, `reward_ledger`), `17-giao-viec-ho-so-nguoi-lon.md` (khối Kinh doanh), Project: `de-xuat-ho-so-nguoi-lon-va-he-sinh-thai-doi-tac`, `khung-hop-tac-doi-tac-dao-sen`.
**Làm sau spec 17.**

## 0. Anh Long chốt (06/11/2026)
- Mô hình **một cấp**. **Không** làm đa cấp, không có tuyến trên hưởng từ tuyến dưới, không xin giấy phép đa cấp.
- Ưu đãi đối tác **10–50%** tuỳ đối tác; phí VN Centre **5–10%** trên số tiền khách thực trả.
- Đối tác thử đầu tiên: **sân tập golf Đảo Sen** (anh Long làm việc trực tiếp). Đối tác sau do nhân sự kinh doanh phụ trách.

## 1. Phạm vi giai đoạn 1
**Có:** hồ sơ đối tác và ưu đãi · tài khoản quầy đối tác quét mã QR động của khách, nhập hoá đơn · điểm tích luỹ cho khách · mã giới thiệu và **ghi nhận** ai giới thiệu ai · phần thưởng người giới thiệu và hoa hồng chốt deal **chỉ tính ở trạng thái "tạm tính", KHÔNG chi trả** · đối soát tháng với đối tác · khối Kinh doanh trong "Hồ sơ của tôi".

**Không có (chờ luật sư rà mô hình):** chi trả tiền thưởng/hoa hồng, khấu trừ thuế TNCN, thu CCCD/mã số thuế người nhận · đổi điểm lấy quà (dùng kho quà đợt 3 khi build) · thanh toán qua app.

Công tắc cấu hình `partners.payouts_enabled = false` (admin không bật được khi chưa có mục "đã duyệt pháp lý" trong cấu hình, ghi nhật ký).

## 2. Trước khi code
1. `git fetch`, nhánh mới từ `origin/main` (đã có spec 13–17), worktree riêng. Sao lưu.
2. Đọc các file ở đầu. Nếu `partners`/`reward_ledger` đã có bảng (đợt 3) thì dùng lại; chưa có thì tạo đúng tên trong `01-du-lieu.md`.
3. Khác biệt nào so với spec này → liệt kê, báo anh Long trước khi build.

## 3. Dữ liệu
| Bảng | Nội dung chính |
|---|---|
| `partners` | tên, loại (sân golf / sân tập / nhà hàng / cà phê / dịch vụ khác), địa chỉ, toạ độ, ảnh, mô tả vi/en, `status` (`draft` / `active` / `paused` / `ended`), `fee_rate` (0,05–0,10, admin đặt), ngày bắt đầu/kết thúc thử, `sales_owner_user_id` (người chốt deal), ghi chú hợp đồng |
| `partner_offers` | partner_id, tên ưu đãi vi/en, loại (`percent` / `bonus_item`), giá trị (10–50% hoặc mô tả quà tặng, ví dụ "+30 bóng"), áp dụng cho dịch vụ nào, điều kiện, hiệu lực |
| `partner_staff` | partner_id, user_id, vai (`cashier` / `manager`). Tài khoản quầy dùng tài khoản Golf Passport của nhân viên đối tác, vai `partner_staff` |
| `partner_visits` | partner_id, student_id (chủ Golf Passport được quét), offer_id, `list_amount`, `paid_amount` (đồng), số hoá đơn đối tác, ảnh hoá đơn (tuỳ chọn), cashier_user_id, created_at, `status` (`recorded` / `flagged` / `void`), lý do huỷ |
| `reward_ledger` | (theo `01-du-lieu.md`) student_id, delta, reason `partner_visit`, source_id = visit_id |
| `referral_codes` | user_id (người lớn ≥ 18), code (vô nghĩa, cố định), created_at |
| `referral_links` | referred_user_id **duy nhất**, referrer_user_id, code, created_at. Gắn **một lần** khi tài khoản được tạo qua link/mã; không đổi |
| `referral_earnings` | referrer_user_id, visit_id, rate, amount, `status` (`provisional` / `confirmed` / `void`). Giai đoạn 1 chỉ `provisional` |
| `sales_commissions` | sales_owner_user_id, partner_id, kỳ, cơ sở tính, amount, `status` (`provisional`) |
| `partner_settlements` | partner_id, tháng, số lượt, tổng `paid_amount`, `fee_rate`, phí, trạng thái (`draft` / `sent` / `confirmed` / `paid`), ngày xác nhận, người xác nhận |

**Cấu hình (admin chỉnh, không viết cứng):** điểm trên mỗi 10.000 đ khách trả (ĐX 1 điểm), tỷ lệ thưởng người giới thiệu trên `paid_amount` (ĐX 5%, lấy từ phần phí VN Centre — **không** vượt `fee_rate` của đối tác), số lượt ưu đãi tối đa/mã/ngày/đối tác (1), ngưỡng hoá đơn bất thường (ĐX > 5.000.000 đ → `flagged`).

**Quan hệ một cấp — bắt buộc trong code và test:** `referral_earnings` chỉ sinh cho `referral_links.referrer_user_id` của **chính** người được quét. Không có truy vấn, view hay màn hình nào lấy "người giới thiệu của người giới thiệu".

## 4. Luồng
1. **Admin tạo đối tác** (Đảo Sen) + ưu đãi + gán `fee_rate`, `sales_owner`, nhân viên quầy.
2. **Khách mở Golf Passport** → nút "Mã ưu đãi đối tác" → **QR động đổi mỗi 60 giây** (theo `04-dot-3` mục 4). Tài khoản con: phụ huynh mở thay.
3. **Quầy quét QR** (`/partner`) → thấy tên che bớt + hạng sổ + ưu đãi đang có → chọn ưu đãi, nhập giá niêm yết, số tiền khách trả, số hoá đơn → Lưu. App kiểm 1 lượt/ngày/đối tác; quá ngưỡng → `flagged`.
4. **Sau khi lưu:** cộng điểm (`reward_ledger`); nếu khách có người giới thiệu → tạo `referral_earnings` `provisional`.
5. **Đối soát tháng:** ngày 05, admin bấm "Lập đối soát" → `partner_settlements` `draft` → xuất PDF/Excel gửi đối tác → đánh dấu `confirmed`, `paid`. Lượt `void` không tính.
6. **Mã giới thiệu:** người lớn có tài khoản vào "Hồ sơ của tôi" → Kinh doanh → sao chép link `app.vncentre.net/r/<code>`. Người mới đăng ký qua link → `referral_links`.

## 5. Màn hình
- **Hồ sơ của tôi → Kinh doanh** (bật khối đã chừa ở spec 17): mã + link giới thiệu, **số người đã giới thiệu**, **tổng thưởng tạm tính**, danh sách đối tác đang có ưu đãi. Dòng chú thích: *"Thưởng đang ở trạng thái tạm tính, chưa chi trả."* **Không** hiện tên, hoá đơn, chi tiêu của người được giới thiệu; **không** có sơ đồ mạng lưới.
- **Khách:** mục "Ưu đãi đối tác" (danh sách đối tác, ưu đãi, bản đồ) + điểm tích luỹ.
- **Quầy đối tác `/partner`:** quét, nhập, lịch sử lượt trong ngày của quầy mình, huỷ lượt vừa nhập trong 30 phút.
- **Admin:** đối tác, ưu đãi, nhân viên quầy, lượt (lọc `flagged`), đối soát, thưởng/hoa hồng tạm tính (chỉ xem).
- Theo tông Golf Passport, đổi giao diện được; song ngữ; 360px.

## 6. Quyền và dữ liệu
- Quầy chỉ thấy tên che bớt (`Nguyễn V. A.`), hạng sổ, ưu đãi; không thấy ngày sinh, SĐT, trường, lịch sử nơi khác.
- Người giới thiệu chỉ thấy **số lượng** và **tổng tạm tính**.
- Mỗi lượt, huỷ lượt, đối soát, đổi `fee_rate`, đổi cấu hình ghi `audit_logs`.
- RLS mặc định từ chối; quầy chỉ đọc/ghi lượt của đối tác mình.

## 7. Tiêu chí nghiệm thu
1. Tạo đối tác Đảo Sen, ưu đãi "Tặng thêm 30 bóng" và "Giảm 10%"; gán 1 nhân viên quầy.
2. Khách mở QR động; quầy quét bằng điện thoại, nhập 180.000 đ → lượt lưu, khách +18 điểm (theo cấu hình 1 điểm/10.000 đ). Mã quá 60 giây → báo hết hạn.
3. Quét lần 2 trong ngày → bị chặn; hoá đơn 6.000.000 đ → `flagged`.
4. Khách A đăng ký qua link của người B → lượt của A sinh `referral_earnings` `provisional` cho B; người C đã giới thiệu B **không** nhận gì (test bắt buộc).
5. B vào Kinh doanh thấy "1 người đã giới thiệu", tổng tạm tính; không thấy hoá đơn của A.
6. Lập đối soát tháng → số lượt, tổng tiền, phí khớp với lượt đã nhập; lượt `void` không tính.
7. `partners.payouts_enabled` không bật được khi chưa có cờ duyệt pháp lý.
8. Quầy đối tác khác không đọc được lượt của Đảo Sen.
9. Toàn bộ test cũ vẫn đạt.

## 8. Thứ tự và điểm dừng
1. Migration + cấu hình + test SQL (tiêu chí 3, 4, 7, 8) → **dừng, anh Long xem**.
2. Màn quầy + QR động + khách → **dừng, thử tiêu chí 1–3 trên 2 điện thoại**.
3. Kinh doanh + đối soát + admin → **dừng, kiểm tiêu chí 4–6**.
4. Sao lưu → đẩy lên thật → báo Minh để cập nhật biểu mẫu Đảo Sen (chuyển từ ghi tay sang quét trên app).
