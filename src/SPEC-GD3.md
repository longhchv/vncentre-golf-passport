# tapgolf — GĐ3: dữ liệu chi tiết 66 điểm Hà Nội (26/11/2026)

Ghi thẳng vào `practice_venues` (vai admin). Mỗi trường đã điền có `info_sources.<trường>` = {src, url, at}; trường còn thiếu nằm trong `needs_survey`.

| Nhóm | Kết quả |
|---|---|
| Giờ vắng / đông | 20/66 điểm, lấy từ biểu đồ "mức độ đông" Google Maps, trung bình các ngày, quy về 6 khung. Vắng ≤ 55% đỉnh, đông ≥ 85% đỉnh. Bỏ qua nơi biểu đồ phẳng (chênh < 1,6 lần) hoặc Google không có biểu đồ (phần lớn phòng 3D nhỏ). |
| Giá — nguồn chính chủ | BRG/JNA (web KS Thắng Lợi, áp dụng từ 01/01/2025: giờ làn, thẻ giờ, short game, học phí, U.S. Kids); Phương Đông (phuongdonggolf.vn, sửa 17/04/2026: tính theo phút); Golfzon Park Lotte Tây Hồ (web L7 Lotte: 9/18 hố, tập bóng); Mipec (fanpage, chỉ giá ngày thường). |
| Không ghi | Giá từ blog bên thứ ba (Viettime, Đảo Sen, Ciputra, Hà Đông…): các nguồn vênh nhau, nhiều bài 2023–2024 → để khảo sát. |
| Tiện ích (nguồn phụ) | toplist.vn (không ghi ngày) cho Phương Đông, Đảo Sen, Ciputra, Viettime, Hà Đông — có ghi rõ "cần xác nhận" trong nguồn. |
| HLV | Chỉ BRG (Eugene Marais, Tyrone Gibb — trang jnag.vn). Tên HLV Phương Đông chỉ có ở toplist → không ghi. |
| Phù hợp với | `noon`/`early` suy từ giờ vắng; BRG `foreigners`; Golfzon Lotte `group`, `kids_mall`. |

Không đổi `pv_public_venues`, không đổi cột region/type/status.
