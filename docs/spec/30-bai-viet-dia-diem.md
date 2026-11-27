# Spec 30 · Bài viết tổng quan cho từng địa điểm (tapgolf)

Bản 1 · 27/11/2026 · Minh. Yêu cầu: anh Long, 27/11/2026.

## Mục tiêu

Mỗi sân tập / phòng 3D có 1 bài tổng quan chuẩn, viết theo lợi ích người dùng, để:
- người chơi đọc thấy bổ ích, quay lại tham khảo;
- chủ địa điểm đọc thấy tự hào, sẵn sàng chia sẻ;
- VN Centre chia sẻ lên Facebook, Zalo và các kênh khác.

Chỉ dùng thông tin chính thức: do địa điểm tự công bố (web, fanpage, bảng giá) hoặc đã xác thực trong Supabase. Cuối bài ghi nguồn và ngày cập nhật. Bài review cá nhân (`kind = 'review'`) để giai đoạn sau; bảng đã chừa chỗ.

## Cấu trúc bài (giai đoạn 2 soạn mẫu)

1. Mở bài: điểm mạnh nhất của địa điểm.
2. Thiết bị & cách tận dụng: máy đo được gì, giúp luyện tập thế nào, tính năng đặc biệt.
3. Tập vui hơn: ứng dụng, chế độ chơi.
4. Thông tin thực tế: giá, giờ vắng/đông, phù hợp với ai, nên đi lúc nào.

Kiến thức máy lấy từ trang chính thức của hãng, lưu trong `sim_brands` để mọi bài cùng loại máy dùng chung:
- `feats`, `apps`, `sources` (có sẵn);
- `metrics` [[thông số, ý nghĩa với người tập]] (mới);
- `practice` [[cách tập / chế độ, mô tả]] (mới);
- `knowledge_checked_at` (mới).

## Dữ liệu — migration `20261127000010_practice_venue_articles.sql`

| Bảng / view | Nội dung |
|---|---|
| `practice_venue_articles` | `venue_id`, `kind` (overview/review), `lang`, `slug` (tự điền: `hn-4`, `hn-4-en`), `title`, `sapo`, `body` (Markdown rút gọn), ảnh bìa (`cover_photo_id` từ kho ảnh địa điểm hoặc `cover_url` https), `sources` [{label, url?, at?}], `info_date`, `needs_survey`, `status` (draft/approved/archived), người/ngày duyệt. Mỗi địa điểm tối đa 1 bài tổng quan cho mỗi ngôn ngữ. Chỉ admin đọc/ghi. |
| `pv_public_articles` | View công khai: chỉ bài `approved` của địa điểm đang hiện (active, closed_temp); không có cột người viết/duyệt. |

Quy tắc ở cơ sở dữ liệu:
- muốn duyệt phải có nội dung và ít nhất 1 nguồn;
- nguồn phải có tên, link (nếu có) bắt đầu bằng http(s);
- sửa bài đang hiển thị giữ nguyên ngày duyệt;
- xoá địa điểm thì xoá luôn bài.

`pv_public_venues` không đổi.

Kiểm thử: `supabase/tests/061_practice_venue_articles.sql` (đã chạy đạt trên Postgres 16 local).

## App quản trị (app.vncentre.net)

Trang sửa địa điểm có thêm tab **Bài viết**:
- danh sách bài tổng quan và trạng thái;
- soạn nội dung, có xem trước;
- ảnh bìa: chọn ảnh đã duyệt của địa điểm, tải ảnh lên, hoặc dán link https;
- danh sách nguồn (tên, link, ngày xem), ngày cập nhật thông tin, đánh dấu "cần khảo sát";
- các nút: Lưu nháp · Duyệt và đăng · Gỡ khỏi web · Xoá nháp;
- bài đã đăng có nút mở trang bài và chép link;
- khung "Bài review" để giai đoạn sau.

Markdown hiển thị qua React (`articles/md.tsx`), không dựng HTML thô.

## tapgolf.vncentre.net (golf-web)

- `artcore.js`: lõi dùng chung cho cả app tapgolf lẫn trang bài, gồm:
  - Markdown cùng quy tắc với app quản trị, escape trước rồi mới áp quy tắc;
  - khối nguồn;
  - nút chia sẻ: Facebook; "Chia sẻ" mở bảng chia sẻ của điện thoại (Zalo, Messenger…); chép link.
- `art_app.js`: mục **Bài viết** trong trang chi tiết.
  - Đọc `pv_public_articles` và hiện bài tổng quan: ảnh bìa, sapo, nội dung (dài thì thu gọn, có nút "Đọc toàn bài"), nguồn, nút chia sẻ, link trang bài.
  - Bài hiện ngay khi admin duyệt.
- `baipage.js`: dựng trang tĩnh `/bai/<slug>/index.html` cho từng bài đã duyệt.
  - Có đủ thẻ OG (ảnh, tiêu đề, mô tả) để Facebook/Zalo hiện bản xem trước, kèm JSON-LD Article để Google lập chỉ mục, và nút "Xem giá, giờ vắng, bản đồ" về trang địa điểm.
  - Bài chưa có ảnh bìa dùng `og-tapgolf.jpg` (1200×630).
- Link `/bai/<slug>/` chưa có trang tĩnh (bài vừa duyệt, chưa deploy): Cloudflare trả `index.html`, trang tự chuyển về `/#/<mã địa điểm>` và cuộn tới mục Bài viết.

Mỗi lần deploy tapgolf cần đủ các tệp: `index.html`, `around.json`, `_headers`, `og-tapgolf.jpg`, và `bai/<slug>/index.html` cho mọi bài đã duyệt (dựng lúc deploy từ `pv_public_articles`).
