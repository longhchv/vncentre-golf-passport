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

### Bảng tee (màn Thông tin sân, thêm ngày 24/10/2026)
Long gửi ảnh scorecard vào chat, Minh đọc ra một trong hai dạng sau; admin dán vào ô "Dán bảng tee Minh gửi" rồi bấm "Điền vào bảng" (bảng cũ được thay).

Dạng JSON:
```json
{"type":"tees","units":"m","holes":18,
 "par":[4,4,3,5,4,4,3,4,5,4,3,4,5,4,4,3,4,5],
 "si":[7,3,15,1,9,11,17,5,13,8,18,2,10,4,12,16,6,14],
 "tees":[{"name":"Black","color":"#111111","gender":"M","len":[395,412,178,548,401,367,203,430,562,418,168,389,541,377,426,192,404,571]},
         {"name":"Red","gender":"F","len":[300,317,83,453,306,272,108,335,467,323,73,294,446,282,331,97,309,476]}]}
```
Dạng bảng (cột cách nhau bằng Tab, dấu | hoặc dấu cách; chép thẳng từ bảng tính được):
```
Đơn vị: m
Hố	1	2	3	4	5	6	7	8	9	Out	10	…	18	In	Tot
Par	4	4	3	5	4	4	3	4	5	36	4	…	5	36	72
SI	7	3	15	1	9	11	17	5	13		8	…	14
Black	395	412	178	548	401	367	203	430	562	3496	418	…	571	3486	6982
Red (Nữ)	300	…
```
- Cột Out/In/Tot tự bỏ (theo dòng "Hố"; không có dòng "Hố" thì app nhận ra cột tổng bằng cách cộng thử).
- Màu và giới tính đoán theo tên tee (Đen/Black, Xanh/Blue, Trắng/White, Vàng/Yellow, Đỏ/Red/Ladies…); "(Nữ)", "Ladies" → nữ. Sửa lại được trong mục "Các bộ tee".
- Par và SI dùng chung cho mọi tee. Đơn vị giữ đúng scorecard (yd hoặc m), website tự đổi sang yard.
