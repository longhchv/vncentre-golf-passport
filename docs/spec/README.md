# VN Centre Golf Passport — Bộ tài liệu mô tả yêu cầu

Phiên bản: **v0.4** · Ngày: 23/09/2026 · Người soạn: Minh (R&D đào tạo golf) · Chủ sản phẩm duyệt: Vũ Anh Long

## 1. Bộ tài liệu gồm những gì

| File | Nội dung | Mức độ |
|---|---|---|
| `00-tong-quan.md` | App là gì, người dùng, nguyên tắc, mô hình đào tạo, gói dịch vụ, lộ trình 5 đợt, thuật ngữ, nhận diện | Hoàn chỉnh |
| `01-du-lieu.md` | Toàn bộ dữ liệu cần lưu, quan hệ, định dạng mã, trạng thái, phân quyền dữ liệu | Hoàn chỉnh cho đợt 1, có khung cho đợt 2–5 |
| `02-dot-1-nen-tang.md` | Đợt 1: tài khoản, nhập danh sách, kích hoạt Passport, hồ sơ học viên, chứng nhận, quản trị | **Đủ chi tiết để build** |
| `03-dot-2-lop-hoc.md` | Đợt 2: lớp, buổi, điểm danh, kỹ năng, văn hoá, lên level, nhận xét, ảnh | Khung đã chốt — viết chi tiết sau |
| `04-dot-3-diem-qua-bxh.md` | Đợt 3: điểm thưởng, kho quà, tem đối tác, giải đấu, BXH Golf Trường học Việt Nam | Khung đã chốt — viết chi tiết sau |
| `05-dot-4-goi-thanh-toan-ho-so.md` | Đợt 4: gói Premium, thanh toán, hồ sơ học bổng | Khung đã chốt — viết chi tiết sau |
| `07-dot-5-thu-vien-tro-choi.md` | Đợt 5: kho trò chơi và hoạt động dạy golf cho HLV, gợi ý theo buổi, gói VIP/Diamond | Khung đã chốt — viết chi tiết sau |
| `06-cong-nghe-chi-phi.md` | Công nghệ, tài khoản cần đăng ký, chi phí dự kiến, môi trường | Hoàn chỉnh |
| `phu-luc-A-file-mau-nhap.md` | File Excel mẫu nhập danh sách và lịch sử khoá học | Hoàn chỉnh |
| `phu-luc-B-ky-nang-L1-L3.md` | Danh mục kỹ năng Level 1–3 (bản nháp) | **Chờ anh Long duyệt** |
| `phu-luc-C-bang-diem.md` | Bảng điểm thưởng, thang điểm giải đấu, hệ số | Tạm dùng, admin chỉnh được |
| `phu-luc-D-viec-con-mo.md` | Những việc chưa chốt | Cập nhật liên tục |
| `phu-luc-E-danh-muc-tro-choi.md` | Chỉ mục 71 trò chơi CGI R&A và SNAG Golf cho kho trò chơi đợt 5 | Hoàn chỉnh phần chỉ mục |

Điều khoản sử dụng và Chính sách bảo mật (V30) **chưa có trong bản này**, sẽ soạn ở giai đoạn sau và cần luật sư rà trước khi ra mắt.

## 2. Hướng dẫn cho anh Long: bắt đầu với Claude Code

1. Tạo một repository mới trên GitHub, đặt tên ví dụ `vncentre-golf-passport`.
2. Tạo thư mục `docs/spec/` trong repository và chép toàn bộ các file `.md` của bộ tài liệu này vào đó.
3. Mở Claude Code trong thư mục repository, gửi câu lệnh mở đầu:

```
Đọc toàn bộ thư mục docs/spec theo thứ tự trong README.md.
Chúng ta chỉ làm ĐỢT 1 (file 02-dot-1-nen-tang.md).
Trước khi viết code, hãy: (1) tóm tắt lại phạm vi đợt 1 bằng tiếng Việt,
(2) liệt kê những chỗ trong tài liệu còn mơ hồ, (3) đề xuất kế hoạch chia nhỏ
thành các bước, mỗi bước chạy thử được. Chờ tôi duyệt rồi mới làm.
```

4. Làm từng bước nhỏ. Sau mỗi bước, mở app thử trên điện thoại rồi mới sang bước tiếp.
5. Khi Claude Code hỏi điều gì không có trong tài liệu, ghi câu hỏi vào `phu-luc-D-viec-con-mo.md` và gửi lại cho Minh để cập nhật tài liệu.

## 3. Quy tắc bắt buộc cho Claude Code (đội code)

1. **Chỉ build đợt đang được giao.** Không tự thêm tính năng của đợt sau. Nhưng thiết kế cơ sở dữ liệu phải để sẵn chỗ cho đợt 2–5 theo `01-du-lieu.md`, tránh phải đập đi làm lại.
2. **Không viết cứng các con số nghiệp vụ trong code.** Điểm thưởng, ngưỡng Đạt, giá, hệ số, số tiết mỗi level, ánh xạ level ↔ giai đoạn ↔ cấp hộ chiếu đều nằm trong bảng cấu hình mà admin chỉnh được.
3. **Song ngữ ngay từ đầu.** Mọi chữ hiển thị đi qua file ngôn ngữ `vi` và `en`. Nội dung nghiệp vụ (tên level, tên chương trình, mẫu chứng nhận) có cả bản tiếng Việt và tiếng Anh.
4. **Bảo mật dữ liệu trẻ em.** Mọi bảng dữ liệu bật phân quyền theo dòng (Row Level Security). Mặc định từ chối, chỉ mở đúng quyền mô tả trong `01-du-lieu.md` mục 9.
5. **Mọi thay đổi quan trọng đều ghi nhật ký** (ai, lúc nào, sửa gì): level, gộp học viên, cấp/huỷ sổ, phát hành/thu hồi chứng nhận, đổi vai trò người dùng, thanh toán.
6. **Mobile-first.** Giao diện phụ huynh và HLV phải dùng tốt trên màn hình rộng 360px. Giao diện admin ưu tiên máy tính nhưng vẫn xem được trên điện thoại.
7. **Thay đổi cơ sở dữ liệu bằng file migration** lưu trong repository. Có file dữ liệu mẫu (seed) để chạy thử.
8. **Viết kiểm thử tự động** cho các quy tắc có tính tiền và điểm, kích hoạt mã, gộp học viên, phân quyền.
9. **Khi tài liệu mơ hồ, hỏi lại, không tự đoán.**
