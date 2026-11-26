# tapgolf.vncentre.net — GĐ2 giao diện (spec 29)

Bản 1 · 26/11/2026 · Minh. Nguồn trang: `template2.html` + `gd2.js` + `i18n_cjk.js`, dựng bằng `build.py` (SB_URL/SB_KEY → bản chạy riêng có khung tài liệu đầy đủ).

## Đã làm

| Phần | Nội dung |
|---|---|
| Khung trang | `<!doctype html>`, `meta viewport`, `lang` → điện thoại hiển thị đúng cỡ; Cloudflare Web Analytics tự chèn được |
| Bản đồ | Leaflet 1.9.4 + nền OpenStreetMap (CARTO nay đòi khoá API); chấm màu theo loại, chạm chấm → thẻ, chạm bản đồ → đặt vị trí, vòng bán kính; bản nhúng / lỗi tải → bản đồ SVG cũ |
| Thẻ tóm tắt | Điểm mạnh nhất (trích dẫn), "từ 350k/giờ" (giá thấp nhất ngày thường), biểu tượng shop / học viện / trẻ em / thuê gậy / VIP / ngôn ngữ, nút "So sánh"; dòng "đang cập nhật" chỉ hiện khi chưa có dữ liệu chi tiết |
| Gợi ý theo nhu cầu | "Bạn cần gì?": Đi cùng con · Tranh thủ giờ trưa · Tập sáng sớm · Sau giờ làm · Đi nhóm, tiếp khách · Khách nước ngoài · Mới chơi, cần thuê gậy. Không lọc bớt, chỉ xếp nơi hợp lên đầu (chấm điểm từ nhãn "Phù hợp với", giờ vắng, trẻ em, thuê gậy, học viện, ngôn ngữ, VIP); nhãn "✓ Hợp nhu cầu" |
| So sánh | Chọn tối đa 3 nơi → khay dưới màn hình → bảng 20 dòng (loại, Google, điểm VN Centre, người chơi, khoảng cách, giá từ, máy, giá theo máy, giá sân tập, thuê gậy, giờ mở, giờ vắng, trẻ em, shop, học viện, tiện nghi, đỗ xe, ngôn ngữ, phù hợp với, ưu đãi) |
| Trang chi tiết | Bảng giá: điểm mạnh, giá theo loại máy, giá sân tập, thuê gậy, ưu đãi còn hạn; mục mới "Tiện ích & phù hợp": nhãn phù hợp, giờ vắng/đông theo 6 khung, trẻ em, shop, tiện nghi, ngôn ngữ, học viện + HLV (kèm link nguồn) |
| Quanh đây | 5 nhóm: Bé vui chơi (sân chơi, khu trò chơi, công viên, thư viện, nhà sách, rạp phim, công viên nước…), Làm đẹp & chăm sóc, Mua sắm, Cà phê chờ, Ông bà (công viên, chùa, trà). Dữ liệu OpenStreetMap trong bán kính 1,5 km, tính sẵn vào `around.json`; địa điểm mới hỏi trực tiếp Overpass. Kèm "Tìm thêm trên Google Maps". Chỗ nối web Cafe Review: hằng `CAFE_REVIEW` trong `gd2.js` |
| Ngôn ngữ | VI, EN, 한국어, 日本語, 中文 (chọn ở đầu trang, `?lang=ko|ja|zh`). Thuật ngữ theo web golf bản xứ: 골프연습장 / 스크린골프 / 타석; ゴルフ練習場・打ちっぱなし / シミュレーションゴルフ / 打席; 高尔夫练习场 / 模拟高尔夫 / 打位. Khoá thiếu dùng tiếng Anh; mô tả hãng máy hiện tiếng Anh |
| Đường link | Thêm `?nhu=<nhu cầu>`, `?ss=id,id` (danh sách so sánh), `?lang=` |

## Giới hạn

- Dữ liệu chi tiết (giá theo máy, giờ vắng…) hiện mới có ở nơi đã được nhập (GĐ3 sẽ tra cho Hà Nội); nơi chưa có vẫn hiện như cũ.
- Quanh đây phụ thuộc độ phủ OpenStreetMap ở Việt Nam (spa, nail còn thưa) → luôn kèm link Google Maps.
- Bản dịch Hàn/Nhật/Trung do Minh soạn theo thuật ngữ web golf bản xứ, chưa có người bản ngữ duyệt.
