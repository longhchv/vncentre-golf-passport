-- Đặt lại 5 màu giai đoạn về bộ màu chuẩn (quyết định B2; bộ màu đã ghi trong 00-tong-quan.md).
-- Staging có 3 màu bị sửa tay khi thử chức năng sửa màu ở trang admin. Màu nhận diện chính thức vẫn chờ D13;
-- khi có, admin đổi 5 giá trị này ở Admin → Chương trình và level.
update public.passport_stages s set color = v.color
from (values (1, '#F9C74F'), (2, '#F4A340'), (3, '#EE7B30'), (4, '#E0502B'), (5, '#C0262D')) as v(number, color)
where s.number = v.number and s.color is distinct from v.color;
