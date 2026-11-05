# 13 · Hướng dẫn nối app giải (league.vncentre.net) với Golf Passport

Gửi: Minh · 05/11/2026 · Phía Passport đã chạy trên **staging**, đạt tiêu chí 7.1–7.5 của `13-giao-viec-ket-noi-snag-league.md`.

## 1. Địa chỉ và khoá

| | Staging | Chính thức |
|---|---|---|
| Địa chỉ | `https://zrfipnqkjrhzrscaaeth.supabase.co/functions/v1/league-bridge` | chưa triển khai (báo sau) |
| Khoá | `LEAGUE_API_KEY` — anh Long gửi riêng, **không qua chat nhóm, không ghi vào code** | khoá riêng, khác staging |

Đặt khoá cho Worker: `wrangler secret put LEAGUE_API_KEY`.

Mọi yêu cầu: `POST`, `Content-Type: application/json`, header `X-League-Key: <khoá>`. Chỉ gọi từ Worker (máy chủ), **không gọi từ trình duyệt**.

## 2. Ba lệnh

### lookup — phụ huynh quét QR sổ hoặc gõ mã
Thêm header `X-Client-IP: <IP của phụ huynh>`; giới hạn 20 lần/phút mỗi IP.
```json
→ { "action": "lookup", "code": "VNC-000123 hoặc mã sổ 8 ký tự (có/không gạch, hoa/thường đều được)" }
← { "found": true, "student_code": "VNC-000123", "passport_code": "AB12CD34",
    "name": "…", "name_masked": "Nguyễn V. A.", "birth_year": 2017, "dob": "2017-05-12",
    "gender": "male|female|other|null", "school": "…|null",
    "guardian": { "name": "…", "phone": "+849…", "email": "…" } | null }
← { "found": false }
```
Phụ huynh **gõ** mã → chỉ hiện `name_masked` + `birth_year`. **Quét QR sổ** → được điền sẵn đủ thông tin. Các trường có thể `null` (ví dụ các bạn 10/10 chưa có ngày sinh).

### issue — cấp mã cho bạn đăng ký giải
```json
→ { "action": "issue", "league_ref": "ev:<id>/reg:<mã đơn>",
    "child": { "name": "…", "dob": "2017-05-12", "gender": "male|female|Nam|Nữ", "school": "…" },
    "guardian": { "name": "…", "phone": "0912…", "email": "…" },
    "consents": { "photo": true, "leaderboard_name": true } }
← { "status": "matched|created|review", "student_code": "VNC-…", "passport_code": "…", "qr_url": "https://…/p/…" }
```
- `league_ref` bắt buộc, duy nhất mỗi đơn. Gọi lại cùng `league_ref` → trả đúng kết quả cũ (thêm `"repeated": true`), không tạo thêm hồ sơ. Gửi lại khi mạng lỗi là an toàn.
- `matched`: dùng lại hồ sơ có sẵn. `created`: hồ sơ mới + thẻ số. `review`: vẫn có mã dùng ngay, VN Centre sẽ kiểm tra trùng sau — **cả ba đều hiện mã + QR cho phụ huynh như nhau**.
- Cách khớp: tên + (ngày sinh **hoặc** SĐT phụ huynh). Khi quét QR sổ, gửi đúng tên và SĐT lấy từ `lookup` là khớp chắc.
- **Không gửi** lưu ý sức khoẻ, mã tài trợ, thông tin chuyển khoản. Trường lạ bị bỏ qua.

### results — gửi kết quả khi BTC chốt chặng
```json
→ { "action": "results", "event": { "no": 11, "date": "2026-11-08", "venue": "Dao Sen Golf Club", "holes": 3 },
    "rows": [ { "student_code": "VNC-… hoặc null", "name": "…", "club": "…", "group": "Bảng U10", "to_par": -1,
                "title": "Vô địch (Best Gross)", "culture": "Tinh thần Golfer", "kind": "student|parent|teacher" } ] }
← { "ok": true, "saved": 9, "unmatched": 1, "warnings": [] }
```
- Điểm do Passport tính theo thang điểm cấu hình; app giải **chỉ gửi danh hiệu và giải văn hoá**.
- `title` nhận: `Vô địch (Best Gross)` / `Best Gross`, `Winner bảng`, `1st Runner Up` … `4th Runner Up`. `culture` nhận: `Tinh thần Golfer`, `Tinh hoa Phong cách Golf`, `Điểm thưởng Phong cách` (hoặc tên tiếng Anh). Viết lạ → `warnings` có `unknown_title` / `unknown_culture`, điểm phần đó = 0.
- **Gửi lại một chặng = thay toàn bộ chặng đó** (không cộng dồn). Muốn sửa thì gửi lại đủ danh sách.
- Mỗi tên chỉ một dòng mỗi chặng. Phụ huynh: `"kind": "parent"` hoặc `club` = `Parent`, không tính hạng.
- Dòng không có `student_code` mà không ghép chắc → vào hàng chờ của admin (`unmatched` > 0), không mất dữ liệu.

## 3. Mã lỗi

| HTTP | `error` | Ý nghĩa |
|---|---|---|
| 401 | `unauthorized` | Sai hoặc thiếu `X-League-Key` |
| 429 | `rate_limited` | `lookup` quá 20 lần/phút từ một IP |
| 400 | `invalid_json`, `unknown_action`, `league_ref_required`, `name_required`, `invalid_phone`, `invalid_dob`, `invalid_event`, `row_name_required`, `duplicate_name`, `season_not_found` | Dữ liệu gửi sai |
| 413 | `body_too_large` | Quá 512 KB |
| 503 | `not_configured` | Phía Passport chưa đặt khoá |
| 500 | `server_error` | Lỗi phía Passport — thử lại sau |

## 4. Việc phía app giải (spec 13 mục 8.4)
1. Trang đăng ký: quét QR sổ / nhập mã VNC → `lookup` → điền sẵn.
2. Tự xin mã cho bạn mới bằng `issue` (mỗi đơn một `league_ref`).
3. Hiện mã VNC + QR (`qr_url`) trên phiếu xác nhận và Trang của con; in thẻ QR.
4. BTC chốt chặng → tự gửi `results`.

Thử nhanh: `scripts/league-bridge-smoke.ps1` trong repo Passport (lookup, 401, 429, issue matched/created/lặp lại).

**Lưu ý staging:** `qr_url` trên staging đang trỏ tên miền chính thức (`app.vncentre.net`), mã sổ staging không mở được ở đó — đổi tên miền sang bản staging khi thử.

## 5. Mở thẳng hồ sơ VĐV từ app giải (spec 14 bước 4)

App giải chỉ có **mã VNC** (`student_code` trả về từ `lookup` / `issue`), nên hai trang dưới đây nhận thẳng mã VNC trên đường dẫn; Passport tự tìm hồ sơ (kể cả hồ sơ đã gộp) rồi chuyển sang trang chi tiết. Không cần khoá, không cần gọi cổng kết nối: chỉ là link mở trong trình duyệt.

| Người bấm | Link | Thấy gì |
|---|---|---|
| Admin, HLV trưởng | `https://app.vncentre.net/admin/students/VNC-002279` | Hồ sơ đầy đủ: thông tin, phụ huynh (có email), sổ, lộ trình, lớp, chứng nhận, đồng ý, Thành tích SNAG; các nút sửa |
| BTC giải (vai trò `league_staff`) | `https://app.vncentre.net/league/students/VNC-002279` | Hồ sơ rút gọn: tên, năm sinh, trường, mã VNC, sổ, tên + SĐT + quan hệ phụ huynh, Thành tích SNAG. Không sửa được |

- Ghép link từ `student_code`: `…/admin/students/${student_code}` hoặc `…/league/students/${student_code}`. Viết `VNC-002279` hay `vnc002279` đều được.
- Chưa đăng nhập → Passport chuyển sang trang đăng nhập rồi quay lại đúng hồ sơ.
- Không có quyền (vd. BTC mở bạn chưa từng thi SNAG, hoặc người không phải admin mở link `/admin`) → báo không có quyền / không tìm thấy. **Quyền do Passport kiểm**, app giải không cần tự ẩn link theo vai trò, nhưng nên chỉ hiện link cho người tổ chức.
- Mỗi lần BTC giải mở hồ sơ, Passport ghi nhật ký (ai, lúc nào, hồ sơ nào).
- Gợi ý chỗ đặt link: danh sách VĐV theo chặng và trang kết quả trong khu BTC của app giải; **không** đặt trên trang công khai hay Trang của con.
- Vai trò BTC giải do admin Passport gán trên trang **Người dùng** cho tài khoản đăng nhập của chính người tổ chức. Ai chưa có tài khoản Passport thì gửi email cho anh Long để tạo.

**Lưu ý:** hai trang này có hiệu lực sau khi bản giao diện mới của Passport được deploy (anh Long sẽ báo). Phần máy chủ (quyền, nhật ký) đã chạy từ 05/11/2026.
