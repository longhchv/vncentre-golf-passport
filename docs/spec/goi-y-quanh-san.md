# Gợi ý quanh sân tự động – tóm tắt cho lập trình (Minh, 23/10/2026)

**Cập nhật 23/10/2026:** KHÔNG dùng Google Maps Platform (Việt Nam là vùng bị cấm theo điều khoản Google). Gợi ý quanh sân làm bán tự động: Minh tra cứu theo tiêu chí dưới đây và gửi danh sách theo "Định dạng nhập"; khu quản trị nhập danh sách, admin duyệt; Claude viết mô tả Việt/Anh khi thiếu.

## 8 nhóm (tab), theo đúng thứ tự
| key | Nhãn VI | Nhãn EN | Tối đa | Sao tối thiểu | Lượt tối thiểu |
|---|---|---|---|---|---|
| lodging | Lưu trú | Stay | 12 | 4.0 | 50 |
| food | Ăn uống | Food | 20 | 4.0 | 50 |
| cafe | Cà phê | Café | 20 | 4.0 | 50 |
| kids | Khu vui chơi trẻ em | Kids & play | 12 | 3.0 | 20 |
| heritage | Di tích – Di sản | Heritage | 12 | 4.0 | 50 |
| nature | Thiên nhiên – Biển | Nature & beaches | 12 | 3.0 | 20 |
| fun | Giải trí – Spa | Leisure & spa | 12 | 4.0 | 50 |
| shop | Mua sắm – Đặc sản | Shopping & local specialties | 12 | 4.0 | 50 |

- Phạm vi: ≤ 60 phút lái xe (Minh ước tính; km là đường chim bay). Xếp: gần trước, cùng thời gian thì nhiều lượt đánh giá trước.
- Nhóm cũ trong dữ liệu app CSR: family → kids, see → heritage, spa/night → fun, move giữ riêng.
- "Gần đạt" (thiếu chút sao/lượt, hoặc 60–75 phút) trả về `pass=false` kèm `why`, admin tự chọn.
- Số sao, lượt, ngày lấy số lưu cứng, cập nhật hằng tháng (Long chấp nhận rủi ro điều khoản Google). Website ghi "Google Maps" cạnh số sao và luôn có nút mở Google Maps.
- Không tự lấy ảnh từ fanpage/website của địa điểm.

## Trường dữ liệu một địa điểm (bảng gc_places)
src (web | visited), cat, name, area, note, note_en, phone, km, drive_min, g_rating, g_count, g_at, pid (Google place_id), family, auto, hidden, data (jsonb: ảnh, điểm chấm, địa chỉ, srcUrl...), version, updated_via (csr | passport | import | auto).

## Định dạng nhập (Minh gửi, admin dán vào app)

### Thông tin sân (màn Thêm sân)
```json
{"type":"course","name":"Black Mountain Golf Club","name_en":"Black Mountain Golf Club","country":"TH","province":"Prachuap Khiri Khan","lat":12.5,"lng":99.9,"phone":"+66 ...","website":"https://...","holes":18}
```

### Danh sách địa điểm quanh sân (màn Quanh sân)
```json
{"type":"places","course":"Cửa Lò Golf Resort","at":"2026-10-23","by":"Minh",
 "places":[
  {"pid":"ChIJ...","name":"Nhà hàng Sao Biển","cat":"food","area":"Cửa Lò","km":3.0,"drive_min":null,
   "g_rating":4.8,"g_count":947,"g_at":"2026-10-23","phone":"0772 373 737",
   "note":"Hải sản trên đường Bình Minh, sát biển Cửa Lò.","note_en":"","pass":true,"why":""}
 ]}
```
- `cat` là một trong 8 key ở bảng trên. `pass=false` kèm `why` = nơi "gần đạt", app để không tích sẵn.
- `pid` có thể trống; khi đó app so trùng theo tên.
- Danh sách thật của Xuân Thành và Cửa Lò đã nằm trong bảng gc_places (chuyển từ app CSR ngày 23/10/2026).
