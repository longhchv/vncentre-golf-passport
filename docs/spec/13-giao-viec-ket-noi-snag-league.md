# 13 · Giao việc: Kết nối SNAG Golf League ↔ Golf Passport (phát mã VNC + QR, lưu thành tích, trang hồ sơ VĐV)

Bản 1 · 05/11/2026 · Người soạn: Minh · Chủ sản phẩm duyệt: Vũ Anh Long
Phạm vi: phần lõi giai đoạn G1–G2 của `12-module-snag-golf-league.md`, làm **trước** khi chuyển hẳn app giải vào Passport.
**Mốc:** chạy thử trên staging trước tối **thứ Sáu 06/11**; lên chính thức trước **Chặng 11 (Chủ nhật 08/11/2026)** nếu kịp. Không kịp thì Chặng 11 chạy như hiện tại, mã VNC và QR phát bù cho các bạn Chặng 11 ngay sau khi phần này chạy — **không vội làm ẩu**.

## 0. Mục tiêu
1. **Golf Passport là nơi duy nhất phát mã VNC và QR.** App giải (`league.vncentre.net`, Cloudflare Worker) xin mã qua cổng kết nối máy chủ với máy chủ.
2. Mỗi VĐV quét QR → trang `/p/{mã sổ}` hiện mục **"Thành tích SNAG Golf League"**: số chặng, từng chặng, tổng điểm, hạng hiện tại.
3. Kết quả mọi chặng (Chặng 1–10 có sẵn, từ Chặng 11 tự gửi sang) lưu theo học viên.

## 1. Hiện trạng cần biết (đã đọc code)
- `students.student_code` = `VNC-` + 6 số (`next_student_code()`); `full_name_normalized`, `date_of_birth`, `gender`, `current_school_id`, `verification_status` (`verified` / `pending_review`), `merged_into_student_id`.
- `passports.passport_code` 8 ký tự (`new_passport_code()`), `tier_id` → `passport_tiers` (`first`, `player`, `elite`, `event_experience`, `staff`), `status`.
- Trang `/p/{mã}` gọi `passport_lookup(p_code)` khi chưa đăng nhập.
- `consents.type` đã có `leaderboard_name`, `photo`.
- Các bạn tham dự ngày 10/10 (Hồ Gươm) đã có hồ sơ và thẻ hạng `event_experience`. **Một số bạn có thể đăng ký Chặng 11** → phải nhận ra và dùng lại hồ sơ, không tạo hồ sơ thứ hai.

## 2. Trước khi code
1. Đọc `12-module-snag-golf-league.md` (bản 2.2) mục 3, 4, 6, 9 và file này.
2. Đối chiếu tên bảng ở mục 3 với quy ước repo; dùng lại `tournament_*` nếu khung đợt 3 đã tạo.
3. Gửi anh Long danh sách khác biệt nếu có, rồi mới build.

## 3. Dữ liệu cần thêm
| Bảng / thành phần | Nội dung | Ghi chú |
|---|---|---|
| Hạng sổ `snag_league` | `passport_tiers`: "SNAG Golf League – thẻ số", `counts_toward_single_active = false` | Cấp cho bạn **chưa có** sổ nào. Bạn đã có sổ (kể cả `event_experience`) dùng lại sổ đó |
| `tournament_series`, `tournaments` | chuỗi "SNAG Golf League", mùa 2026; mỗi chặng: số chặng, ngày, sân, `counts_for_ranking` (Chặng 3 = false) | Theo khung đợt 3 |
| `tournament_results` | `tournament_id`, `student_id` (null nếu chưa ghép), `raw_name`, `raw_club`, bảng, điểm so với par (null được), danh hiệu, giải văn hoá, `points_participation` (50), `points_rank`, `points_bonus`, `points_total`, `source` (`import` / `league_app`) | Duy nhất theo (`tournament_id`, `raw_name` chuẩn hoá). Gửi lại thì **thay thế** cả chặng, không cộng dồn |
| `league_match_queue` | dòng kết quả hoặc yêu cầu cấp mã **nghi trùng / không chắc**, chờ admin ghép | Không tự gộp hồ sơ |
| Thang điểm | Best Gross 500 · Winner 300 · 1st 250 · 2nd 200 · 3rd 150 · 4th 100 · tham dự 50 · Spirit of the Game +200 · The Essence of Golf Style +100 · Điểm thưởng phong cách +50 | Khớp trang `league.vncentre.net/bxh` |
| Bí mật `LEAGUE_API_KEY` | Edge Function secret; Cloudflare Worker giữ cùng giá trị | Anh Long tự đặt, **không** gửi qua chat |

**Không lưu** lưu ý sức khoẻ, mã tài trợ, thông tin chuyển khoản của app giải.

## 4. Cổng kết nối cho app giải (Edge Function `league-bridge`)
Mọi yêu cầu: `POST`, header `X-League-Key: <LEAGUE_API_KEY>` (so sánh an toàn thời gian), JSON. Sai khoá → 401. Ghi nhật ký (audit) mọi lần cấp mã và gửi kết quả.

**4.1 `lookup`** – tra cứu khi phụ huynh quét QR sổ hoặc gõ mã VNC
```json
→ { "action": "lookup", "code": "VNC-000123 | mã sổ 8 ký tự" }
← { "found": true, "student_code": "VNC-000123", "passport_code": "AB12CD34",
    "name": "Nguyễn Văn An", "name_masked": "Nguyễn V. A.", "birth_year": 2017, "dob": "2017-05-12",
    "gender": "male", "school": "TH Phương Mai", "guardian": { "name": "…", "phone": "+849…", "email": "…" } }
```
App giải chỉ hiện `name_masked` + `birth_year` khi phụ huynh **gõ** mã; hiện đủ để điền sẵn khi **quét QR sổ**. Giới hạn 20 lần/phút mỗi IP (app giải chuyển IP qua header `X-Client-IP`).

**4.2 `issue`** – cấp mã cho bạn mới đăng ký giải
```json
→ { "action": "issue", "child": { "name": "…", "dob": "2017-05-12", "gender": "male", "school": "…" },
    "guardian": { "name": "…", "phone": "0912…", "email": "…" }, "consents": { "photo": true, "leaderboard_name": true },
    "league_ref": "ev:<id>/reg:<mã đơn>" }
← { "status": "matched | created | review", "student_code": "VNC-…", "passport_code": "…", "qr_url": "https://app.vncentre.net/p/…" }
```
Ghép theo `full_name_normalized` + `date_of_birth` (+ trường nếu có):
- **Khớp chắc 1 hồ sơ** → `matched`, trả mã có sẵn.
- **Không khớp** → tạo học viên (`verification_status = pending_review`), phụ huynh (số điện thoại chuẩn `+84…`), liên kết `linked_via = 'import'` (hoặc thêm giá trị `league`), sổ hạng `snag_league` trạng thái `assigned` → `created`.
- **Nghi trùng** (cùng tên, khác hoặc thiếu ngày sinh…) → vẫn tạo nhưng đưa vào `league_match_queue` → `review`.

Gọi lại với cùng `league_ref` → trả đúng kết quả cũ, không tạo thêm.

**4.3 `results`** – gửi kết quả sau khi BTC chốt chặng
```json
→ { "action": "results", "event": { "no": 11, "date": "2026-11-08", "venue": "Dao Sen Golf Club", "holes": 3 },
    "rows": [ { "student_code": "VNC-… | null", "name": "…", "club": "…", "group": "Bảng U10", "to_par": -1,
                "title": "Vô địch (Best Gross)", "culture": "Tinh thần Golfer" } ] }
← { "ok": true, "saved": 9, "unmatched": 1 }
```
Dòng có `student_code` → ghép thẳng; không có → ghép như 4.2, không chắc thì vào hàng chờ. Gửi lại chặng đó → thay toàn bộ dòng cũ của chặng.

## 5. Nhập lịch sử Chặng 1–10
File đi kèm (thư mục `du-lieu-snag-passport`): `ket-qua-chang-1-10.csv` (104 dòng, đã có cột điểm), `clb-quy-doi.csv`, `ho-so-vdv.csv` (58 bạn: họ tên, năm sinh, giới, CLB, số chặng đã thi).
- Quy đổi tên CLB theo `clb-quy-doi.csv`, ghép theo tên chuẩn hoá + năm sinh (+ trường).
- Ghép chắc → nối thẳng; nghi ngờ → hàng chờ; không có → tạo hồ sơ + sổ `snag_league` như 4.2.
- **Kiểm:** tổng điểm từng VĐV sau nhập phải khớp `league.vncentre.net/bxh` (Thiện Giác 3.200, Lê Minh Hoàng 2.950, Thiên Phúc 2.150, Mai Nguyễn Minh Hoàng 1.600, Trúc Mai 1.550). Lệch dòng nào phải liệt kê.
- **Bảo mật:** các file có tên và năm sinh các con. **Không commit vào repo** (repo đang công khai). Để ngoài thư mục repo, chạy script nhập trên máy, xong thì xoá.

## 6. Giao diện
1. **Trang `/p/{mã}` (chưa đăng nhập):** mục "Thành tích SNAG Golf League": số chặng đã thi, tổng điểm, **hạng hiện tại / tổng số VĐV**, số lần Best Gross, nhãn "Tốt nghiệp" (≥ 3 Best Gross), danh sách chặng (ngày, bảng, so với par, danh hiệu, giải văn hoá, điểm). Không hiện ngày sinh, trường, phụ huynh. Tên hiện theo quy tắc BXH: có đồng ý `leaderboard_name`, hoặc đã thi trước Chặng 10 và phụ huynh chưa xin tắt.
2. **Phụ huynh đăng nhập:** như trên, thêm nút tải chứng nhận nếu có.
3. **Admin:** trang "Ghép VĐV SNAG League" xử lý `league_match_queue` (ghép vào hồ sơ có sẵn / giữ hồ sơ mới), dùng công cụ gộp học viên hiện có.
4. **Hạng hiện tại:** tính bằng view từ `tournament_results` (tổng điểm mùa, đồng điểm đồng hạng, hạng kế tiếp bỏ qua — T7, T7, 9), loại thầy cô/phụ huynh.

## 7. Tiêu chí nghiệm thu (staging)
1. `lookup` bằng mã VNC của một bạn 10/10 → trả đúng hồ sơ; gõ sai khoá → 401; quá 20 lần/phút → chặn.
2. `issue` cho bạn 10/10 (cùng tên + ngày sinh) → `matched`, **không** tạo hồ sơ mới; bạn mới hoàn toàn → `created`, có mã VNC + mã sổ + QR mở được `/p/…`; gọi lại cùng `league_ref` → cùng kết quả.
3. Nhập lịch sử → tổng điểm khớp 5 bạn ở mục 5.
4. `results` Chặng 11 thử → `/p/` của bạn đó hiện chặng mới, tổng điểm và hạng cập nhật; gửi lại → không nhân đôi.
5. Trang `/p/` không lộ ngày sinh, trường, phụ huynh.

## 8. Thứ tự và điểm dừng
1. Migration + hạng sổ + view hạng → **dừng, anh Long xem migration**.
2. `league-bridge` (3 lệnh) + nhập lịch sử → **dừng, anh Long kiểm tiêu chí 1–3**.
3. Giao diện mục 6 → **dừng, kiểm tiêu chí 4–5**.
4. Báo Minh địa chỉ Edge Function để nối phía app giải (Minh làm: quét QR / nhập mã VNC trên trang đăng ký, tự xin mã cho bạn mới, hiện mã + QR trên phiếu xác nhận và Trang của con, in thẻ QR, tự gửi kết quả khi chốt).
