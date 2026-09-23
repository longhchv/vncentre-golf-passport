# Phụ lục A · File mẫu nhập dữ liệu

App cho tải 2 file mẫu này (`.xlsx`) ngay trên màn hình nhập. Dòng 1 là tiêu đề cột, dữ liệu bắt đầu từ dòng 2. Mỗi file mẫu có sheet thứ hai "Hướng dẫn" ghi lại nội dung phụ lục này.

## A1. Danh sách học sinh — `mau-danh-sach-hoc-sinh.xlsx`

Chọn **trường, năm học, chương trình, lớp** trên màn hình trước khi tải file lên. Không nhập lại các thông tin này trong file.

| Cột | Tiêu đề | Bắt buộc | Định dạng | Ví dụ |
|---|---|---|---|---|
| A | Họ và tên học sinh | Có | Chữ | Nguyễn Minh An |
| B | Ngày sinh | Nên có | `dd/mm/yyyy` | 13/07/2019 |
| C | Trường | Có | Chữ; nếu trống thì lấy trường đã chọn trên màn hình | TH Tô Vĩnh Diện |
| D | Lớp (năm học hiện tại) | Nên có | Chữ | 2A3 |
| E | Họ tên người liên hệ | Nên có | Chữ | Trần Thu Hà |
| F | Số điện thoại người liên hệ | Nên có | Số VN `09xxxxxxxx` hoặc số quốc tế có `+` | 0912345678 |
| G | Email người liên hệ | Không | Email | ha.tran@gmail.com |

**Quy tắc kiểm tra khi nhập:**
- **Thiếu cột A:** dòng lỗi, không nhập.
- **Ngày sinh sai định dạng:** dòng lỗi.
- **Thiếu ngày sinh hoặc số điện thoại:** cảnh báo, vẫn nhập được.
  - Thiếu ngày sinh thì dò trùng kém chính xác hơn.
  - Thiếu số điện thoại thì không gửi được lời mời kích hoạt.
- **Nhiều học sinh cùng người liên hệ** (anh chị em): nhập nhiều dòng cùng số điện thoại. App tạo **một** người giám hộ nối với nhiều học viên.
- **Tên có ký tự viết hoa toàn bộ** (ví dụ `NGÔ TÚ ANH`): app tự chuẩn hoá thành `Ngô Tú Anh`.

## A2. Lịch sử khoá học — `mau-lich-su-khoa-hoc.xlsx`

Dùng để nhập các khoá học viên **đã học trước khi có app** (ví dụ Tô Vĩnh Diện 2024–2025, 2025–2026), hoặc nhà trường bổ sung.

| Cột | Tiêu đề | Bắt buộc | Định dạng | Ví dụ |
|---|---|---|---|---|
| A | Họ và tên học sinh | Có | Chữ | Nguyễn Minh An |
| B | Ngày sinh | Nên có | `dd/mm/yyyy` | 13/07/2019 |
| C | Trường | Có | Chữ | TH Tô Vĩnh Diện |
| D | Lớp | Nên có | Chữ | 1A3 |
| E | Năm học | Có | `yyyy-yyyy` | 2024-2025 |
| F | Khoá học | Có | Chữ | Golf GDTC học kỳ 2 (18 tiết) |
| G | Level đạt | Không | Số 1–20, hoặc để trống | 1 |

**Quy tắc:**
- App dò học viên có sẵn theo tên + ngày sinh + trường như khi nhập danh sách. Không tìm thấy thì hỏi admin: tạo học viên mới, hoặc bỏ dòng.
- Cột G có giá trị → tạo bản ghi level chờ duyệt. Người nhập là Admin/HLV trưởng thì có thể chọn "duyệt luôn".
- **Quy tắc dữ liệu cũ:** học sinh đã học ít nhất 1 học kỳ thì điền `1` ở cột G.
- Nhà trường nhập thì mọi dòng ở trạng thái chờ duyệt.

## A3. Ghi chú về dữ liệu mẫu hiện có

File "Danh sách các lớp các trường Trại hè golf" (Vinschool, Hành trình 1) có các điểm cần xử lý trước khi nhập:
- Tên lớp nằm ở dòng tiêu đề nhóm, tên GV nằm ở dòng tiêu đề → phải tách ra theo mẫu A1.
- Ngày sinh lẫn định dạng chữ và ngày → đưa về `dd/mm/yyyy`.
- Cột Day 1–6 (điểm tích, "Vắng") **không** nhập ở đợt 1. Giữ lại để nhập điểm thưởng ở đợt 3 nếu cần.
