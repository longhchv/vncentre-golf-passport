# Phụ lục G · Mốc thành tích Level 1–3 (BẢN ĐỀ XUẤT — CHỜ ANH LONG VÀ HLV TRƯỞNG DUYỆT)

Ngày soạn: 24/10/2026 · Người soạn: Minh · Giải quyết việc **D5** trong phụ lục D.

Đây là **trụ 2** trong ba trụ xét lên level (`00-tong-quan.md` mục 6.4): *thành tích trên sân*. Hai trụ kia đã có tài liệu: trụ 1 ở `phu-luc-B` mục 2, trụ 3 ở `phu-luc-B` mục 3.

> **Mọi con số trong file này là đề xuất của Minh, chưa ai kiểm chứng trên lớp thật.** Cách dùng đúng: cho một lớp chạy thử một tháng, xem tỉ lệ các con đạt, rồi chốt. Admin chỉnh được mọi con số trong app, không cần sửa code (việc **D76**).

---

## 1. Mốc thành tích là gì

Một mốc gồm **năm thông số**:

| Thông số | Nghĩa |
|---|---|
| Loại sân | `snag` (sân SNAG tự dựng: sân trường, nhà thể chất, bãi cỏ) hoặc `real` (sân golf thật) |
| Số hố | 3 · 6 · 9 · 18 |
| Khoảng cách hoặc bộ tee | Với SNAG: mét từ điểm phát tới đích. Với sân thật: tên bộ tee |
| Điểm mục tiêu so với par | Ví dụ "không quá +6" |
| Giới hạn số gậy mỗi hố | Đánh đủ số này thì nhặt bóng lên, tính bằng số đó |

**Giới hạn số gậy mỗi hố là thông số quan trọng nhất với các con nhỏ.** Không có nó thì một hố xấu làm cả vòng thành vô nghĩa, con mất hứng và HLV mất thời gian. Có nó thì vòng chơi luôn kết thúc đúng giờ và điểm số luôn đọc được.

---

## 2. Hai hệ tham chiếu

`00-tong-quan.md` mục 6.4 yêu cầu khung mốc **khớp được** với SNAG, Operation 36 và US Kids. Hai hệ đáng tham chiếu nhất:

**SNAG Golf** — tăng dần **số hố**: 3 → 6 → 9, khoảng cách ngắn, dụng cụ riêng (Launcher, Roller, đích Flagsticky / Snagazoo). Phù hợp Level 1–3 vì các con mới học bốn cú đánh cơ bản.

**Operation 36** — giữ nguyên **9 hố**, mục tiêu luôn là **đánh 36 gậy** (par 4 trung bình mỗi hố), và tăng dần **khoảng cách** qua từng bậc (25 → 50 → 100 yard…). Ưu điểm: một mục tiêu duy nhất, dễ hiểu, dễ kể cho phụ huynh.

**Cách Minh đề xuất cho VN Centre:** Level 1–3 đi theo **SNAG** (tăng số hố), vì các con còn nhỏ và cơ sở vật chất là sân trường. Từ Level 4 trở lên mới chuyển sang kiểu **Operation 36** (giữ 9 hố, tăng khoảng cách) và sau đó lên sân thật. Như vậy hai hệ nối được vào nhau mà không phải đập bảng mốc đi làm lại.

---

## 3. Mốc chuẩn — bắt buộc cho trụ 2

Mỗi level có **đúng một** mốc chuẩn (`kind = 'standard'`). Đạt mốc này là đạt trụ 2 của level đó.

| Mã | Level | Loại sân | Số hố | Khoảng cách | Par mỗi hố | Par vòng | **Mục tiêu** | Tối đa gậy/hố |
|---|---|---|---|---|---|---|---|---|
| `G1S` | 1 | SNAG | **3** | 10 m | 3 | 9 | **không quá +6** (15 gậy) | 6 |
| `G2S` | 2 | SNAG | **6** | 15 m | 3 | 18 | **không quá +9** (27 gậy) | 6 |
| `G3S` | 3 | SNAG | **9** | 20 m | 3 | 27 | **không quá +12** (39 gậy) | 6 |

Cách đọc: ở Level 1, con chơi 3 hố, mỗi hố dài 10 m, par 3 mỗi hố. Con được phép đánh tổng 15 gậy cho 3 hố (trung bình 5 gậy một hố). Hố nào đánh đến gậy thứ 6 thì nhặt bóng, ghi 6.

**Vì sao mục tiêu nới dần theo số hố:** +6 trên 3 hố là trung bình 5 gậy/hố; +9 trên 6 hố là 4,5 gậy/hố; +12 trên 9 hố là khoảng 4,3 gậy/hố. Tức là **chuẩn vẫn siết dần** dù con số tuyệt đối tăng lên. Con phải chơi tốt hơn ở level sau, không phải chỉ chơi nhiều hơn.

---

## 4. Mốc nâng cao — không bắt buộc

`kind = 'stretch'`. Không tính vào trụ 2. Để ghi nhận trên hồ sơ và cộng điểm ở đợt 3, và để các con khá có thứ để nhắm tới.

| Mã | Level | Loại sân | Số hố | Khoảng cách | Par vòng | Mục tiêu | Tối đa gậy/hố |
|---|---|---|---|---|---|---|---|
| `G1S+` | 1 | SNAG | 3 | 15 m | 9 | không quá +6 (15 gậy) | 6 |
| `G2S+` | 2 | SNAG | 6 | 20 m | 18 | không quá +6 (24 gậy) | 6 |
| `G3S+` | 3 | SNAG | 9 | 25 m | 27 | **đúng 36 gậy hoặc ít hơn** (+9) | 6 |
| `G3R` | 3 | **Sân thật** | 6 | Tee ngắn nhất | 21 (par 3,5 TB) | không quá +18 | 8 |

`G3S+` là bước chuyển sang tư duy Operation 36: *"đánh 9 hố trong 36 gậy"*. `G3R` là lần đầu ra sân thật — để sau Level 3, không bắt buộc, và chỉ khi có điều kiện.

---

## 5. Cách chơi và cách ghi

**Dựng sân SNAG:** 3 hoặc 6 hoặc 9 vị trí phát, mỗi vị trí một đích (Flagsticky hoặc Snagazoo) ở đúng khoảng cách của mốc. Đo bằng bước chân cũng được, nhưng HLV phải ghi khoảng cách thật vào ghi chú nếu lệch.

**Luật chơi cho các con (đề xuất, ĐX):**
1. Mỗi hố bắt đầu từ vị trí phát, kết thúc khi bóng dính đích (Flagsticky) hoặc vào vùng đích đã khoanh.
2. Đếm mọi cú đánh có chủ ý. Đánh không trúng bóng (vung trượt) **không** tính với Level 1–2; tính từ Level 3.
3. Đánh đến gậy thứ 6 mà chưa xong: nhặt bóng, ghi 6, sang hố sau. Đây là luật bắt buộc, không phải tuỳ HLV.
4. Bóng ra ngoài khu vực: đặt lại chỗ gần nhất, **không** cộng gậy phạt với Level 1–2. Từ Level 3 cộng 1 gậy (nối với Luật 18.2 OB đang học ở trụ 3).
5. Mỗi vòng phải có **người chứng kiến**: HLV, trợ giảng, hoặc một bạn cùng lớp được HLV chỉ định (`witnessed_by`).

**Ghi vào app:**
- HLV ghi tại lớp → tính ngay (`source = 'coach'`).
- Phụ huynh tự khai → vào hàng chờ HLV xác nhận, **chưa** tính trụ 2 (`source = 'guardian'`, theo **BH-R11**).
- Nhập chi tiết từng hố thì dùng **phiếu điểm vòng chơi** (`round_cards`, mục BH16 của file 03); app tự tính tổng và tự gợi ý mốc tương ứng.

**Chơi lại:** không giới hạn số lần thử. Lấy **kết quả tốt nhất**. Mọi lần chơi đều lưu, để xem tiến bộ.

---

## 6. Cách admin khai báo trong app

Màn **Admin → Mốc thành tích** dùng `CrudTable`. Mỗi dòng là một mốc.

Những con số admin sẽ muốn chỉnh nhất, theo thứ tự:

1. **Khoảng cách** — tuỳ sân trường. Sân Tiểu học Phương Mai khác nhà thể chất Vinschool Harmony.
2. **Mục tiêu so với par** — sau một tháng chạy thử sẽ biết nên siết hay nới.
3. **Tối đa gậy mỗi hố** — nếu buổi học chỉ có 35–45 phút (lớp GDTC) thì nên hạ xuống 5.

Seed sẵn: `docs/spec/data/moc-thanh-tich.csv`.

---

## 7. Dự kiến tỉ lệ đạt và việc cần kiểm chứng

Minh đặt mục tiêu thiết kế: **khoảng 70–80% các con đạt mốc chuẩn của level trong thời lượng tiết học của level đó** (`00-tong-quan.md` mục 6.5). Thấp hơn 50% là mốc quá khó — con mất hứng, HLV không duyệt được level cho ai. Cao hơn 95% là mốc quá dễ — trụ 2 thành hình thức.

**Việc cần làm để chốt (D76):**

| Việc | Ai | Khi nào |
|---|---|---|
| Cho CLB Tô Vĩnh Diện (6 em) chơi mốc `G1S` 3 lần trong 1 tháng, ghi điểm | HLV lớp | Sau khi build xong Bước 9 của đợt 2 |
| Làm tương tự ở một lớp GDTC đông (Phương Mai) để thấy chênh lệch giữa lớp CLB và lớp chính khoá | HLV, giáo viên thể chất | Cùng kỳ |
| Xem tỉ lệ đạt, điều chỉnh khoảng cách và mục tiêu | HLV trưởng + Minh | Sau 1 tháng |
| Chốt mốc Level 4–10 theo kiểu Operation 36 | Minh soạn, anh Long duyệt | Khi chốt xong L1–3 |

**Câu hỏi cho anh Long và HLV trưởng:**

1. Par 3 mỗi hố SNAG có đúng cách VN Centre đang dựng sân không, hay đang dùng par 2?
2. Khoảng cách 10 / 15 / 20 m có hợp với sân trường thực tế không?
3. Giới hạn 6 gậy/hố có hợp với tiết 35–45 phút không? Với 9 hố thì tối đa 54 gậy, mỗi gậy khoảng 20 giây cộng di chuyển — có thể vượt quá một tiết.
4. Vung trượt có nên tính từ Level 1 luôn không? Minh đề xuất chưa tính ở L1–2 để con không sợ.
