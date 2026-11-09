# 22 · Module Lộ trình học bổng và du học — bản 2 (nhiều hướng đi)

Bản 1 · 09/11/2026 · Người yêu cầu: Vũ Anh Long · Người soạn: Minh
Đọc kèm: migration `20261106000001_athlete_card_scholarship.sql` (checklist 17 mục đang chạy), file dữ liệu `docs/spec/data/scholarship-checklist-v2.csv` (78 mục, anh Long duyệt 09/11/2026), tài liệu "Danh sách hạng mục Lộ trình Học bổng & Du học (bản gộp)".

---

## 0. Vì sao có file này

Checklist hiện tại có 17 mục, chia 3 cấp, chỉ nhắm hướng Mỹ. Ngày 09/11/2026 anh Long duyệt bản gộp 78 mục:
- **18 mục chung** cho mọi hướng.
- **35 mục hướng Mỹ** (NCAA, NAIA, NJCAA).
- **25 mục cho các hướng khác:** Anh, Úc, châu Á, Việt Nam, cấp 3 quốc tế, nghề nghiệp trong ngành golf.

Mỗi mục có **lớp bắt đầu**. Gia đình chọn **một hoặc nhiều hướng**; app chỉ hiện mục chung cộng mục của các hướng đã chọn, nhắc theo lớp hiện tại của các con, và cho so sánh mức độ sẵn sàng giữa các hướng.

## 1. Nguyên tắc bắt buộc

1. **Không mất dữ liệu cũ.** Trạng thái các con đã đánh dấu trên 17 mục cũ phải còn nguyên sau khi nâng cấp (mục 3).
2. Migration chỉ thêm (cột, bảng, giá trị cho ràng buộc). Làm trên **staging** trước.
3. **Mục chưa xác minh vẫn hiện cho phụ huynh, kèm nhãn "Đang xác minh"** (`is_verified = false`, 12 mục sau lần rà 09/11/2026). Admin xác minh xong thì bỏ nhãn (D74).
4. App chỉ **gợi ý và nhắc**, không cam kết kết quả tuyển sinh hay học bổng. Màn hình có dòng: "Quy định thay đổi theo từng năm; kiểm tra lại với trường và cơ quan tuyển sinh trước mỗi quyết định lớn."
5. Phân quyền giữ như hiện tại: phụ huynh đã xác nhận, chính học viên, admin.

## 2. Trước khi code

Đọc schema staging (`scholarship_checklist_items`, `scholarship_checklist_status`, hàm `scholarship_checklist`, `set_scholarship_item`, cột lớp hiện tại của học viên). Viết `docs/spec/22-mapping.md`. **Dừng chờ anh Long xác nhận.**

## 3. Dữ liệu

**`scholarship_checklist_items` thêm cột:**

| Cột | Ý nghĩa |
|---|---|
| `code` | Mã mục (C1, US-A1, UK-3…), duy nhất |
| `track` | `common` / `us` / `uk` / `au` / `asia` / `vn` / `hs` / `career` |
| `start_grade` | Lớp bắt đầu, 1–12; 13 = sau tốt nghiệp |
| `start_note_vi` | Ghi chú mốc (ví dụ "Xong trước 15/6 sau lớp 10") |
| `source_ref` | Nguồn (App P…, NCAA …, Mới) — chỉ admin xem |
| `is_verified` | Đã xác minh hay chưa |

- Mở rộng ràng buộc: `item_group` thêm `admission`; `stage` thêm `post_graduation`. `stage` suy ra từ `start_grade` (1–5 tiểu học, 6–9 THCS, 10–12 THPT, 13 sau tốt nghiệp).
- Bảng mới `student_scholarship_tracks`: học viên, hướng, ngày chọn, người chọn. Một học viên chọn được nhiều hướng.

**Chuyển 17 mục cũ** (cột `replaces` trong file CSV):
- Mục thay 1–1 (P1, P3, P5, P7, P8, P9, P10, P12, P13, P14, P15, P16, P17): **cập nhật tại chỗ** dòng cũ (gán `code`, sửa tiêu đề theo CSV), giữ nguyên `id` để trạng thái đi theo.
- Mục gộp: **P2 + P4 → C4**, **P6 + P11 → C13**. Cập nhật tại chỗ dòng đầu (P2, P6); dòng sau (P4, P11) chuyển `is_active = false`. Với mỗi học viên, trạng thái của mục gộp lấy mức cao hơn (`done` > `in_progress` > `not_started`); ghi chú nối lại.
- Các mục còn lại nạp mới từ CSV.
- Học viên đang có dữ liệu trên checklist cũ được tự gán hướng `us` (vì 17 mục cũ là hướng Mỹ); phụ huynh đổi được.

## 4. Màn hình phụ huynh

**Chọn hướng:** danh sách 7 hướng có mô tả ngắn, chọn nhiều. Đổi được bất cứ lúc nào; bỏ một hướng không xoá trạng thái đã đánh dấu.

**Checklist của con:** mục chung + mục các hướng đã chọn, chia ba nhóm theo lớp hiện tại:
- **Cần làm ngay:** `start_grade` ≤ lớp hiện tại, chưa xong. Mục có hạn trong `start_note_vi` hiện nổi bật.
- **Sắp tới:** `start_grade` là 1–2 năm tới.
- **Đã xong.**

Mỗi mục: tên, mốc, hướng áp dụng (một mục chung hiện nhãn "mọi hướng"), trạng thái, ghi chú; mục ★ (`auto_source`) app tự điền như hiện tại.

**So sánh hướng:** mỗi hướng đã chọn hiện:
- % mục đã xong **trong số mục đến hạn** theo lớp hiện tại;
- số mục còn thiếu đến hạn;
- mục sắp tới quan trọng nhất (mục đầu tiên chưa xong có `start_grade` nhỏ nhất).
Không xếp hạng các hướng, không đưa ra "hướng tốt nhất".

**Tự động lên lớp (D75, anh Long chốt 09/11/2026):**
- **Ngày 05/9 hằng năm**, hệ thống tự cộng 1 lớp cho học viên đang học **từ lớp 1 đến lớp 8** (tức tự động cho đến khi các con lên lớp 9). Chạy bằng pg_cron, ghi lịch sử lớp theo năm học.
- **Ngoại lệ:** nhà trường báo trường hợp ở lại lớp hoặc lên vượt lớp. Trước 05/9, quản lý trường (`school_manager`) hoặc admin đánh dấu "không tự lên lớp" cho học viên đó; sau 05/9 sửa riêng từng em. Admin cũng sửa hàng loạt theo trường, lớp.
- **Từ lớp 9 lên lớp 10 trở đi:** không tự động. Ngày 05/9 app gửi thông báo nhắc bố mẹ xác nhận hoặc sửa lớp của con.
- **Bố mẹ sửa được lớp của con** bất cứ lúc nào; mọi lần sửa ghi `audit_logs`.
- Học viên chưa có thông tin lớp thì bỏ qua, nhắc bố mẹ bổ sung.

**Nhắc khi lên lớp:** khi lớp hiện tại đổi (tự động hay sửa tay), app gửi thông báo trong app: con đã lên lớp mấy, và danh sách các mục vừa đến hạn. Gửi qua Zalo, email chờ cơ chế thông báo chung (D57).

## 5. Màn hình admin

Sửa danh mục (tiêu đề, mốc, hướng, xác minh, bật/tắt), xem `source_ref`. Thống kê: số học viên theo từng hướng; tỉ lệ hoàn thành mục đến hạn theo lớp.

## 6. Tiêu chí nghiệm thu (staging)

1. Sau migration: học viên đã có `done` ở P2 hoặc P4 → C4 là `done`; P4 không còn hiện.
2. Học viên có P6 `in_progress`, P11 `done` → C13 `done`.
3. Không mất dòng `scholarship_checklist_status` nào của các mục thay 1–1.
4. Học viên lớp 9 chỉ chọn hướng Anh: không thấy mục `us`; thấy C1–C18 và UK-…; mục chưa xác minh hiện nhãn "Đang xác minh".
5. Admin bật `is_verified` cho UK-5 → nhãn "Đang xác minh" của UK-5 biến mất.
6. Đổi lớp từ 9 lên 10: US-A6, C10… chuyển vào "Cần làm ngay"; có thông báo trong app.
7. So sánh hướng: % = số mục xong / số mục đến hạn của (mục chung + hướng đó).
8. Bỏ chọn hướng Mỹ rồi chọn lại: trạng thái cũ còn nguyên.
9. Không bảng, cột, dữ liệu cũ nào bị xoá hoặc đổi tên.
10. Chạy thử ngày 05/9: học viên lớp 3 lên lớp 4; học viên lớp 8 lên lớp 9; học viên lớp 9 **không** đổi lớp nhưng bố mẹ nhận thông báo nhắc; học viên được trường đánh dấu "không tự lên lớp" giữ nguyên lớp.
11. Chạy lại lần hai trong cùng năm học: không cộng thêm lớp.

## 7. Việc còn mở

| Mã | Việc | Người chốt | Trạng thái |
|---|---|---|---|
| D74 | Mục chưa xác minh hiện kèm nhãn "Đang xác minh"; Minh xác minh dần | Anh Long | **Xong 09/11/2026** |
| D75 | Tự lên lớp ngày 05/9 cho học viên lớp 1–8; lớp 9 trở đi bố mẹ xác nhận; nhà trường báo ngoại lệ; bố mẹ và admin đều sửa được | Anh Long | **Xong 09/11/2026** |

## 8. Thứ tự làm và điểm dừng

Mỗi bước: kiểm thử, báo cáo 3 dòng, **dừng chờ anh Long xác nhận**.

1. `22-mapping.md`. **Dừng.**
2. Migration + chuyển 17 mục cũ + nạp CSV (tiêu chí 1–3, 9). **Dừng.**
3. Chọn hướng + checklist theo lớp (tiêu chí 4, 5, 8). **Dừng.**
4. So sánh hướng + tự lên lớp + nhắc khi lên lớp (tiêu chí 6, 7, 10, 11). **Dừng.**
5. Màn hình admin.
