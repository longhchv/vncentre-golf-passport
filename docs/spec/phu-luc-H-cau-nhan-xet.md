# Phụ lục H · Thư viện câu nhận xét sau buổi (BẢN ĐẦU — CHỜ HLV TRƯỞNG DUYỆT)

Ngày soạn: 24/10/2026 · Người soạn: Minh · Giải quyết việc **D31** trong phụ lục D.

Dùng cho **đợt 2** (nhận xét cá nhân theo buổi / tháng / cuối khoá — mục BH14 của `03-dot-2-lop-hoc.md`) và **đợt 6** (nhận xét sau buổi 1-1 — `08-dot-6-lop-1-1.md`). Một thư viện, hai nơi dùng.

---

## 1. Vì sao có thư viện này

Một HLV dạy 6 buổi một ngày, mỗi lớp 12 em. Viết nhận xét riêng cho 70 em mỗi ngày là việc không ai làm được lâu dài. Thực tế xảy ra một trong hai chuyện: HLV bỏ không viết, hoặc HLV viết những câu giống nhau cho mọi em — mà phụ huynh đọc là biết ngay.

Thư viện này để HLV **bắt đầu nhanh**, không để HLV **khỏi nghĩ**. Vì vậy quy tắc trong app là bắt buộc:

> **`coach_comments.coach_written_text` không được rỗng** (**BH-R15**, và `session_notes.coach_written_text` ở đợt 6).
>
> HLV chọn một câu từ thư viện làm khung, rồi **phải** viết thêm phần riêng của em đó — dù chỉ một câu. Câu thư viện lưu ở trường `suggested_text`, câu HLV viết lưu riêng. Phụ huynh đọc thấy cả hai, liền mạch.

---

## 2. Sáu nguyên tắc viết câu

| # | Nguyên tắc | Nên | Không nên |
|---|---|---|---|
| 1 | **Nói việc, không nói người** | "Cú chip của con còn chạm đất trước bóng" | "Con chip kém" |
| 2 | **Luôn có bước tiếp theo** | "Buổi sau mình tập giữ chữ Y lâu hơn một nhịp" | "Con cần cố gắng hơn" |
| 3 | **Không so sánh với bạn khác** | "So với tuần trước, con vào đích nhiều hơn 3 cú" | "Con chậm hơn các bạn trong lớp" |
| 4 | **Nói được điều cụ thể quan sát được** | "Con giữ thăng bằng ở tư thế finish 7 trong 10 cú" | "Động tác con đã tốt hơn" |
| 5 | **Gọi các con đúng cách** | "con", "các con", "các bạn" | "nó", "đứa này", "bọn trẻ" |
| 6 | **Ngắn, đọc trên điện thoại** | Một đến hai câu, dưới 200 ký tự | Một đoạn văn dài |

Nguyên tắc 2 là nguyên tắc quan trọng nhất với phụ huynh. Một nhận xét không có bước tiếp theo thì phụ huynh đọc xong không biết làm gì, và cảm giác duy nhất còn lại là lo.

---

## 3. Cách dùng trong app

1. HLV mở màn nhận xét của một em. App **lọc sẵn** câu gợi ý theo: mảng kỹ thuật vừa chấm trong buổi · mức đạt của em đó · level của em.
2. HLV bấm chọn một hoặc hai câu → câu rơi vào ô nháp, **sửa được tự do**.
3. HLV viết thêm phần riêng. Nút **Lưu** chỉ bật khi phần tự viết không rỗng.
4. App ghi lại câu nào hay được chọn, để sau này đưa câu hay lên trước (đợt 3).

**Mức tự động đề xuất** lấy từ lần chấm kỹ năng gần nhất của em đó:

| Lần chấm gần nhất | Mức (`band`) |
|---|---|
| Chưa đạt · thang 1–2 · số đo dưới ngưỡng | `needs_work` |
| Vừa đạt · thang 3 · số đo chạm ngưỡng | `on_track` |
| Thang 4–5 · số đo vượt ngưỡng rõ | `strong` |

**Bốn nhóm câu** (`group`): `technique` (kỹ thuật) · `attitude` (thái độ, ứng xử) · `progress` (tiến bộ) · `next_step` (việc nhà cùng làm).

Seed sẵn: `docs/spec/data/cau-nhan-xet.csv`.

---

## 4. Câu theo mảng kỹ thuật

### 4.1 Grip – Setup

| Mức | Câu |
|---|---|
| `needs_work` | Con còn cần nhắc mới nhớ thứ tự "Trái vàng – Kết nối – Phải đỏ". |
| `needs_work` | Khi vào tư thế, con hay quên trùng gối nên thân người còn thẳng đứng. |
| `needs_work` | Con đặt tay đúng, nhưng hai tay chưa kết nối sát nhau nên gậy dễ xoay. |
| `on_track` | Con tự cầm gậy đúng vạch màu, không cần nhắc. |
| `on_track` | Con làm đủ 5 bước setup, thân tạo chữ A khá rõ. |
| `on_track` | Con đã tự kiểm tra lại tay trước mỗi cú đánh. |
| `strong` | Con vào tư thế chuẩn trong cả 10 cú, và còn nhắc bạn bên cạnh làm đúng. |
| `strong` | Setup của con đủ ổn định để buổi sau bắt đầu học hướng đánh. |

### 4.2 Putting

| Mức | Câu |
|---|---|
| `needs_work` | Biên độ gậy của con còn dài hơn bên này, ngắn hơn bên kia, nên bóng đi không đều. |
| `needs_work` | Con đánh mạnh hơn mức cần, bóng thường vượt quá đích. |
| `needs_work` | Con nhìn gậy khi đánh nên đầu hơi động, đường bóng lệch. |
| `on_track` | Con giữ nhịp từ 7h đến 5h khá đều, bóng vào đích nhiều hơn trước. |
| `on_track` | Con đã vào đích 5 cú liên tiếp từ 1 m. |
| `on_track` | Con bắt đầu đọc được độ xa, ít khi đánh quá mạnh. |
| `strong` | Con qua "cổng hai cuốn sách" 15 cú liên tiếp, đường bóng rất thẳng. |
| `strong` | Con dừng bóng trong vòng 30 cm quanh đích từ 3 yard — mức này đã hơn yêu cầu của level. |

### 4.3 Chipping

| Mức | Câu |
|---|---|
| `needs_work` | Gậy của con còn chạm đất trước bóng nên bóng không bay lên được. |
| `needs_work` | Chữ Y dài của con chưa tới 8h, cú đánh còn thiếu lực. |
| `needs_work` | Con chip được nhưng bóng chưa đi về đúng hướng đích. |
| `on_track` | Con làm đúng công thức chữ Y dài và đã dùng tốt móc áo SNAG-O-Matic. |
| `on_track` | Con đưa bóng vào hộp 3 trong 10 cú từ 3 yard — đúng yêu cầu của level. |
| `on_track` | Con bắt đầu tự chọn điểm rơi trước khi đánh. |
| `strong` | Con làm đổ chai nước từ 2 yard ba lần liền, lực và hướng đều tốt. |
| `strong` | Con chip vào hộp từ 5 yard — xa hơn mức level yêu cầu. |

### 4.4 Pitching

| Mức | Câu |
|---|---|
| `needs_work` | Thanh SNAG-Azoo của con chưa kêu "zoo", nghĩa là tốc độ gậy còn chậm. |
| `needs_work` | Con lên được chữ L ở 9h nhưng kết thúc chưa tới chữ Y ở 3h. |
| `needs_work` | Con mất thăng bằng khi kết thúc nên bóng đi không ổn định. |
| `on_track` | Con giữ chữ L và chữ Y rõ ràng, thanh Azoo kêu đều. |
| `on_track` | Con đưa 3 trong 10 bóng vào giỏ trong 3 yard. |
| `on_track` | Con giữ được tư thế kết thúc trong 8 cú trên 10. |
| `strong` | Con pitch đúng hướng trong phạm vi 10 yard rất đều, lực tay đã kiểm soát tốt. |
| `strong` | Con đã làm được bài luyện hướng đánh ở mức của level trên. |

### 4.5 Full swing

| Mức | Câu |
|---|---|
| `needs_work` | Snapper của con chưa kêu "snap" ở đúng thời điểm, gậy còn chậm lại trước khi gặp bóng. |
| `needs_work` | Con lên tới 10h nhưng chưa xuống được 2h, cú đánh còn ngắn. |
| `needs_work` | Con đánh mạnh nhưng bóng ít tiếp xúc đúng giữa mặt gậy. |
| `on_track` | Con làm đúng công thức full swing và đã hoàn thành các bài tập Snapper. |
| `on_track` | Con giữ được tư thế finish 2 giây trong 7 cú trên 10. |
| `on_track` | Tiếp xúc bóng của con đã tốt hơn, khoảng một nửa số cú đi đúng ý. |
| `strong` | Con tiếp xúc bóng tốt hơn 50 cú trên 100 trong bài luyện — đã đạt mức của level. |
| `strong` | Nhịp đánh của con ổn định, buổi sau mình bắt đầu tập đánh theo mục tiêu xa. |

---

## 5. Câu về thái độ và ứng xử

| Mức | Câu |
|---|---|
| `needs_work` | Hôm nay con hơi mất tập trung, hay nói chuyện khi bạn đang đánh. |
| `needs_work` | Con đến muộn nên mất phần khởi động cùng lớp. |
| `needs_work` | Con chưa quen thu dọn dụng cụ sau buổi, nay mai sẽ thành phản xạ. |
| `needs_work` | Khi đánh lỗi, con còn dễ bỏ cuộc. Mình sẽ tập lại từng bước nhỏ. |
| `on_track` | Con nghe hướng dẫn và làm theo ngay. |
| `on_track` | Con giữ an toàn tốt, luôn đứng đúng khoảng cách khi bạn đánh. |
| `on_track` | Con chào hỏi và cảm ơn đúng lúc, đúng tinh thần văn hoá golf. |
| `on_track` | Con tự thu dọn dụng cụ mà không cần nhắc. |
| `strong` | Con chủ động giúp bạn mới vào lớp, chỉ cho bạn cách cầm gậy. |
| `strong` | Con tự khai điểm trung thực kể cả khi điểm không tốt — đây là điều đáng khen nhất của golf. |
| `strong` | Con kiên trì làm lại sau khi đánh lỗi, không bỏ giữa bài. |
| `strong` | Con nhắc bạn giữ an toàn — con đã hiểu "an toàn là số 1". |

---

## 6. Câu về tiến bộ

Dùng ở nhận xét **theo tháng** và **cuối khoá**. App điền số liệu vào các chỗ `{…}`.

| Mức | Câu |
|---|---|
| `needs_work` | Tháng này con đi học {so_buoi} buổi. Con còn cần thêm thời gian ở mảng {mang_ky_nang}. |
| `needs_work` | Con chưa đạt thêm kỹ năng mới trong tháng, nhưng động tác {mang_ky_nang} đã rõ hơn trước. |
| `on_track` | Tháng này con đạt thêm {so_ky_nang} kỹ năng, đi học {so_buoi} buổi. |
| `on_track` | Con đã xong {da_dat}/{tong} kỹ năng của Level {level}. |
| `on_track` | So với tháng trước, mảng {mang_ky_nang} của con tiến bộ rõ nhất. |
| `strong` | Con đã đạt đủ kỹ năng của Level {level} và đang chờ xét lên level. |
| `strong` | Con đi học đủ {so_buoi} buổi trong tháng và đạt thêm {so_ky_nang} kỹ năng. |
| `strong` | Con hoàn thành khoá với {da_dat}/{tong} kỹ năng và đạt mốc thành tích {ten_moc}. |

---

## 7. Câu gợi bước tiếp theo — việc nhà cùng làm

Nhóm `next_step`. Đây là phần phụ huynh đọc kỹ nhất, vì nó nói họ làm được gì.

| Mảng | Câu |
|---|---|
| Grip–Setup | Ở nhà bố mẹ cho con cầm gậy và đọc to "Trái vàng – Kết nối – Phải đỏ" 5 lần trước khi ăn tối. |
| Grip–Setup | Nhờ bố mẹ chụp một ảnh tư thế setup của con rồi so với hình trong sổ Passport. |
| Putting | Lấy hai cuốn sách làm "cổng" rộng hơn đầu gậy một chút, cho con putt qua cổng 10 lần, cách 1 m. |
| Putting | Đặt một cái cốc làm đích, cho con putt từ 1 m, đếm xem vào mấy cú trên 10. |
| Chipping | Đặt một cái hộp giấy cách 2 m, cho con chip vào hộp, mỗi ngày 10 cú. |
| Chipping | Cho con chip qua một cái gối để tập bóng bay lên, mỗi ngày 10 cú. |
| Pitching | Cho con tập vung gậy lên chữ L rồi dừng, giữ 2 giây, làm 10 lần, chưa cần đánh bóng. |
| Pitching | Nếu có thanh SNAG-Azoo, cho con tập cho thanh kêu "zoo" 10 lần mỗi ngày. |
| Full swing | Cho con tập giữ tư thế finish 2 giây sau mỗi cú vung, 10 lần, không cần bóng. |
| Full swing | Cho con vung gậy trước gương, nhìn chữ L ở 10h và ở 2h. |
| Chung | Mỗi ngày 10 phút là đủ. Đều quan trọng hơn nhiều. |
| Chung | Bố mẹ đếm giúp con và ghi vào sổ Passport trang luyện tập — con sẽ muốn làm tiếp. |
| Chung | Khi con đánh lỗi, bố mẹ nói "làm lại nhé" thay vì "sai rồi" — con sẽ thử lại nhanh hơn. |
| Chung | Buổi sau con mang đủ nước và mũ giúp cô chú nhé. |
| Văn hoá | Ở nhà bố mẹ cùng con nhắc lại 3 từ của văn hoá golf trước mỗi buổi học. |

---

## 8. Câu không được đưa vào thư viện

Danh sách này quan trọng ngang phần trên. Đưa vào app dưới dạng **hướng dẫn hiện trên màn soạn nhận xét**, và dùng khi admin rà câu HLV tự thêm.

| Không viết | Vì sao |
|---|---|
| "Con không có năng khiếu golf" · "Con không phù hợp với môn này" | Phán xét về con người, không phải về việc. Một câu như vậy có thể kết thúc việc chơi golf của một đứa trẻ |
| "Con kém nhất lớp" · "Các bạn khác đã làm được rồi" | So sánh. Vi phạm nguyên tắc 3 |
| "Con hư" · "Con cá biệt" | Gắn nhãn tính cách, không mô tả hành vi |
| "Bố mẹ nên cho con học thêm ở trung tâm" | Bán hàng trong nhận xét. Nếu cần khuyến nghị thì nói riêng, không viết vào hồ sơ của con |
| "Con cần cố gắng hơn" (đứng một mình) | Không có bước tiếp theo. Phụ huynh không biết làm gì |
| Nhận xét về ngoại hình, cân nặng, thể trạng của con | Không thuộc phạm vi đánh giá golf, và dễ gây tổn thương lâu dài |
| Nhận xét về gia đình, điều kiện kinh tế | Không thuộc phạm vi |
| "nó", "đứa", "bọn" | Trái nguyên tắc 5 |

---

## 9. Việc còn mở

| # | Việc | Ai |
|---|---|---|
| H-a | **HLV trưởng rà toàn bộ thư viện**: câu nào không giống cách HLV VN Centre nói thì sửa. Thà ít câu mà đúng giọng hơn nhiều câu nghe như máy | HLV trưởng |
| H-b | **Bản tiếng Anh** cho lớp UNIS và lớp quốc tế. Dịch sau khi bản tiếng Việt được chốt, để không phải dịch hai lần | Minh |
| H-c | Bổ sung câu cho **Level 4–10** (bunker, đánh theo mục tiêu xa, chiến thuật hố) khi viết đặc tả đợt 3 | Minh |
| H-d | Bổ sung nhóm câu riêng cho **buổi 1-1 đợt 6**: câu về bài tập giao riêng, câu về kế hoạch buổi sau | Minh, khi build đợt 6 |
| H-e | Chốt có cho HLV **tự thêm câu** vào thư viện không. Minh đề xuất: được, nhưng câu tự thêm chỉ mình HLV đó thấy; muốn vào thư viện chung thì admin duyệt | Anh Long |
