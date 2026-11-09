# 19 · Module Điểm thưởng: nguồn điểm, ví điểm, kho quà và đổi quà

Bản 1 · 09/11/2026 · Người yêu cầu: Vũ Anh Long · Người soạn: Minh
Đọc kèm: `04-dot-3-diem-qua-bxh.md` (khung đã chốt), `phu-luc-C-bang-diem.md` (bảng điểm), migration `20261107000001_partners_gd1.sql` (đã có `reward_ledger`), `20261105000001_snag_league_data.sql` (kết quả giải).

---

## 0. Vì sao có file này

Khung hai loại điểm đã chốt ở spec 04 mục 1. Code hiện tại (07/11/2026) mới làm được:
- **Điểm xếp hạng:** đủ (kết quả giải, hệ số loại giải, `league_standings`).
- **Điểm thưởng:** mới có sổ `reward_ledger`, nhưng chỉ nhận 3 lý do `partner_visit`, `partner_visit_void`, `admin_adjust`.

Còn thiếu 3 phần, file này đặc tả cả 3:
- **A.** Kết quả chặng League tự cộng vào điểm thưởng.
- **B.** Các nguồn điểm thưởng khác: khen thưởng ở trường, chuyên cần, lên level, ứng xử, bài kiểm tra.
- **C.** Kho quà và đổi quà, trừ vào sổ điểm thưởng.

## 1. Nguyên tắc bắt buộc

1. **Một sổ duy nhất cho điểm thưởng: `reward_ledger`.** Không tạo bảng số dư. Số dư luôn là tổng `delta`.
2. **Không sửa, không xoá dòng sổ đã ghi.** Sai thì ghi dòng điều chỉnh. Mỗi dòng có `reason`, `source_type`, `source_id`, người ghi.
3. **Điểm xếp hạng giữ nguyên cách tính hiện tại.** Module này không đụng vào `league_standings` hay hệ số xếp hạng. Điểm xếp hạng không bao giờ bị trừ khi đổi quà.
4. **Không phá dữ liệu cũ.** Migration chỉ thêm (bảng, cột, giá trị mới cho ràng buộc `reason`). Làm trên **staging** trước.
5. **Chống ghi trùng:** mỗi nguồn tự động chỉ sinh một dòng gốc cho mỗi `(source_type, source_id, reason)`.
6. **Điểm thưởng học viên không quy ra tiền** và tách hẳn khỏi ví tích điểm người lớn (D58). Module này chỉ làm phần học viên.
7. **Bảo vệ trẻ em:** màn hình ví điểm của các con không hiện tên người khác, không so sánh số điểm giữa các con.

## 2. Trước khi code: việc Claude Code phải làm

1. Đọc schema staging, xác định: `reward_ledger` và các hàm đang ghi vào nó; `tournament_results`, `tournament_series`; bảng điểm danh, kỹ năng, level (nếu đã có); `event_redemptions`; cơ chế `cycle_no` / `is_frozen` của gói Free.
2. Viết `docs/spec/19-mapping.md`: bảng nào dùng lại, bảng/cột nào thêm, hàm nào sửa. **Dừng lại cho anh Long xác nhận** trước khi chạy migration.

## 3. Phần A — Kết quả League vào điểm thưởng

**Quy tắc:** một chặng League cộng cả hai loại điểm (spec 04 mục 1; phụ lục C1 "Tham gia giải: 50 + điểm theo thứ hạng").

- Điểm thưởng của một dòng kết quả = `points_total` × `tournament_series.reward_coefficient`.
  - Cột mới `reward_coefficient numeric not null default 1`, admin chỉnh. SNAG Golf League = 1.
  - Không dùng `ranking_coefficient` cho điểm thưởng.
- Chỉ cộng khi: `participant_kind = 'student'`, đã ghép `student_id`, giải chưa bị xoá.
- `reason = 'tournament_result'`, `source_type = 'tournament_result'`, `source_id = tournament_results.id`.
- **Kết quả thay đổi sau khi đã cộng** (sửa điểm, đổi hạng, ghép lại học viên, gộp hồ sơ, xoá giải): ghi dòng `tournament_result_adjust` bằng phần chênh lệch, sao cho tổng điểm thưởng của dòng kết quả đó luôn khớp số đúng hiện tại. Đổi học viên thì trừ người cũ, cộng người mới.
- Phụ huynh và thầy cô (`participant_kind` khác `student`) **chưa** cộng điểm thưởng ở bước này, xem D61.
- **Cộng bù các chặng đã đấu trước khi có module:** viết sẵn hàm chạy một lần, **không tự chạy**, chờ D60.

## 4. Phần B — Các nguồn điểm thưởng khác

**Danh mục nguồn điểm** (bảng mới `reward_rules`, seed từ phụ lục C1, admin chỉnh):
`code`, tên VI/EN, điểm mặc định, điểm tối thiểu – tối đa (với mục cho chọn mức), vai được ghi (admin / HLV trưởng / HLV lớp), bắt buộc ghi chú hay không, đang dùng hay không.

| code | Nguồn | Điểm (phụ lục C1) | Cách ghi |
|---|---|---|---|
| `school_award` | Khen thưởng ở trường | Admin đặt, có khoảng min–max | Tay; **bắt buộc ghi chú** tên khen thưởng; có thể đính ảnh giấy khen |
| `attendance` | Có mặt 1 buổi | 10 | Tự động từ điểm danh nếu bảng điểm danh đã có; không thì để bước sau |
| `attendance_full_month` | Đi đủ buổi trong tháng | +50 | Tự động cuối tháng (cùng điều kiện trên) |
| `skill_passed` | 1 kỹ năng đạt | 20 | Tự động khi HLV xác nhận kỹ năng (nếu đã có) |
| `level_up` | Lên level | 200 | Tự động khi HLV trưởng duyệt (nếu đã có) |
| `conduct` | Ứng xử tốt | 10–30 | Tay, HLV chọn mức |
| `theory_test` / `practice_test` | Đạt bài kiểm tra level | 50 / 100 | Tay hoặc tự động; chỉ lần đạt đầu |
| `culture_award` | Giải văn hoá / phong cách | 100 | Đã nằm trong `points_total` của kết quả giải → **không** ghi thêm ở đây |

**Màn "Ghi điểm thưởng"** (admin, HLV):
- Chọn một học viên hoặc cả lớp → chọn nguồn từ danh mục → điểm điền sẵn (đổi được trong khoảng min–max) → ghi chú → lưu.
- `reason` = `code` của nguồn; `source_type = 'reward_rule'`.
- HLV lớp chỉ ghi được cho học viên lớp mình. Ghi cho cả lớp thì sinh một dòng cho mỗi con.
- Huỷ một lần ghi sai: dòng `manual_void` trừ lại, bắt buộc lý do; chỉ admin hoặc người đã ghi, trong 7 ngày.

Mục nào cần bảng chưa có (điểm danh, kỹ năng, level) thì ghi rõ trong `19-mapping.md` là "để sau", không tự tạo bảng mới cho chúng.

## 5. Phần C — Kho quà và đổi quà

Theo spec 04 mục 3, chi tiết dữ liệu:

| Bảng | Nội dung chính |
|---|---|
| `gift_items` | tên VI/EN, loại, mô tả, ảnh, số điểm, đang bán hay không, giới hạn mỗi người (tuỳ chọn) |
| `gift_stock_moves` | quà, số lượng (+ nhập / − xuất), lý do, người ghi, thời điểm |
| `gift_orders` | học viên, quà, số lượng, số điểm, cách nhận (giải League / tại trường / trụ sở / bưu điện), địa chỉ nếu gửi, trạng thái, người tạo |

**Luồng đổi quà:**
1. Phụ huynh (hoặc học viên khi dùng app) chọn quà → app hiện số dư khả dụng và số điểm sẽ trừ.
2. Bấm đổi: trong **một giao dịch**, khoá theo học viên, kiểm tra số dư khả dụng ≥ số điểm và còn hàng → tạo đơn → ghi dòng sổ `gift_order` (âm) → ghi `gift_stock_moves` (−).
3. Trạng thái: đã đặt → đã chuẩn bị → đã giao / đã gửi → hoàn tất; hoặc huỷ.
4. Huỷ trước khi giao: dòng `gift_order_refund` (dương) và nhập lại kho. Chỉ phụ huynh (khi đơn còn "đã đặt") hoặc admin.
5. Gửi bưu điện: phí ship thu qua thanh toán đang có (đơn hàng, payOS), không trừ bằng điểm.

**Số dư khả dụng** = tổng `delta` các dòng chưa bị treo (`is_frozen = false`). Theo quy tắc gói Free ở `00-tong-quan.md` mục 7. Không bao giờ cho số dư khả dụng âm.

**Quầy đổi quà ở sự kiện** (B18): các lần đổi trong `event_redemptions` chuyển thành giao dịch trong sổ ở **bước 6**, sau khi phần C chạy ổn. Không gộp ở bước này.

## 6. Ví điểm trên app phụ huynh

- Hai ô tách riêng: **Điểm thưởng** (đổi quà) và **Điểm xếp hạng** (đã có, chỉ để xem).
- Điểm thưởng: số dư khả dụng, phần đang treo (gói Free), nút **Đổi quà**.
- Lịch sử: mỗi dòng sổ hiện ngày, nguồn (tên giải và chặng / tên khen thưởng / tên quà), số điểm cộng hay trừ, ghi chú.
- Admin: tra cứu sổ theo học viên, theo nguồn, theo tháng; xuất CSV.

## 7. Việc còn mở — thêm vào `phu-luc-D`

| Mã | Việc | Người chốt | Trạng thái |
|---|---|---|---|
| D58 | **Giá trị điểm.** **Đã chốt 09/11/2026: tách riêng hai hệ.** Điểm thưởng của học viên giữ nguyên thang sổ Passport (phụ lục C, quà 50–30.000 điểm, Premium 3.000 điểm = 1 tháng), **không quy ra tiền**. Người **trên 16 tuổi** có **ví tích điểm người lớn riêng**, 1 điểm = 1.000 đ, dùng cho hệ đối tác và Thành viên phát triển dự án. Hai ví không chuyển đổi qua lại | Anh Long | **Xong** |
| D59 | **Hạn sử dụng điểm 24 tháng** (chốt 09/11/2026) áp dụng thế nào với Premium "tích luỹ và dùng liên tục qua các năm" và Free "treo theo chu kỳ". Bước này chỉ thêm cột `expires_at` (để trống), **chưa trừ điểm hết hạn** | Anh Long | Chờ |
| D60 | Có cộng bù điểm thưởng cho các chặng League đã đấu trước khi có module không, từ chặng nào | Anh Long | Chờ |
| D61 | **Ví tích điểm người lớn** (trên 16 tuổi, mã VNC, 1 điểm = 1.000 đ) là **sổ riêng**, không dùng `reward_ledger` của học viên. Đặc tả cùng bản chính sách Thành viên phát triển dự án. **Chốt 09/11/2026 — học viên đủ 16 tuổi:** được chọn giữ ví học viên hoặc chuyển sang ví người lớn. Khi chuyển: **phải có bố mẹ hoặc người giám hộ xác nhận trên app**; tỉ lệ **10 điểm học viên = 1 điểm người lớn** (admin chỉnh được); chuyển một chiều, một lần, toàn bộ số dư khả dụng (phần đang treo của gói Free không chuyển; đơn quà đang chờ phải xong hoặc huỷ trước); sau khi chuyển, ví học viên đóng, điểm thưởng mới từ giải và khen thưởng tự quy đổi theo cùng tỉ lệ vào ví người lớn; điểm xếp hạng không đổi; điểm chuyển sang tính hạn 24 tháng từ ngày chuyển. Từ 16 tuổi được nhận hoa hồng bằng tiền. Việc chuyển ví làm cùng ví người lớn, **không** thuộc bước nào của module 19 | Anh Long | Đã chốt quy tắc, chờ làm |

## 8. Tiêu chí nghiệm thu (kiểm trên staging)

1. Nhập kết quả một chặng League: học viên Vô địch Best Gross có +550 điểm thưởng (500 + 50 tham dự) và điểm xếp hạng không đổi so với trước module.
2. Sửa hạng của học viên đó thành Winner bảng: sổ có thêm dòng điều chỉnh, tổng điểm thưởng từ dòng kết quả đó còn 350.
3. Ghép nhầm rồi ghép lại sang học viên khác: người cũ về 0 cho dòng kết quả đó, người mới nhận đủ điểm.
4. Chạy lại việc nhập kết quả hai lần: không sinh dòng trùng.
5. Phụ huynh, thầy cô có kết quả giải: không phát sinh dòng điểm thưởng.
6. HLV ghi `school_award` không có ghi chú: không lưu được. HLV ghi cho học viên ngoài lớp mình: bị từ chối.
7. Đổi quà 300 điểm khi số dư khả dụng 250: bị từ chối, sổ và kho không đổi.
8. Hai lần bấm đổi cùng lúc với số dư chỉ đủ một lần: chỉ một đơn thành công.
9. Huỷ đơn "đã đặt": điểm hoàn lại đúng, kho nhập lại đúng.
10. Đổi quà xong, BXH và điểm xếp hạng của học viên không đổi.
11. Không bảng, cột, dữ liệu cũ nào bị xoá hoặc đổi tên; các dòng `partner_visit` cũ vẫn tính đúng số dư.

## 9. Thứ tự làm và điểm dừng

Làm từng bước, xong bước nào **chạy kiểm thử, báo cáo 3 dòng, dừng chờ anh Long xác nhận** rồi mới sang bước sau:

1. `19-mapping.md` (mục 2). **Dừng.**
2. Migration: mở rộng `reason`, thêm `reward_coefficient`, `reward_rules` (+ seed), `gift_items`, `gift_stock_moves`, `gift_orders`, cột `expires_at`. **Dừng.**
3. Phần A: League vào điểm thưởng (chưa cộng bù). **Dừng.**
4. Phần B: màn "Ghi điểm thưởng" và các nguồn tay; nguồn tự động chỉ làm những gì bảng đã có. **Dừng.**
5. Phần C: kho quà, đổi quà, ví điểm trên app phụ huynh. **Dừng.**
6. Chuyển `event_redemptions` vào sổ (B18). **Dừng.**
7. Cộng bù các chặng cũ — chỉ khi D60 đã chốt.
