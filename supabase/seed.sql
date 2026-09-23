-- Dữ liệu mẫu cho STAGING (02 mục 8). Tên học viên là tên giả, không dùng dữ liệu thật.
-- Không chạy file này trên production.

insert into public.schools (name, short_name, type, city, requires_photo_consent) values
  ('Trường Tiểu học Tô Vĩnh Diện', 'TH Tô Vĩnh Diện', 'public', 'Hà Nội', false),
  ('UNIS Hanoi (Community UNIS)', 'UNIS', 'international', 'Hà Nội', false),
  ('Vinschool The Harmony', 'Vinschool Harmony', 'private', 'Hà Nội', true)
on conflict do nothing;

insert into public.academic_years (name, start_date, end_date, is_current) values
  ('2024-2025', '2024-09-01', '2025-05-31', false),
  ('2025-2026', '2025-09-01', '2026-05-31', false),
  ('2026-2027', '2026-09-01', '2027-05-31', true)
on conflict do nothing;

-- 20 học viên giả: 8 Tô Vĩnh Diện, 6 UNIS, 6 Vinschool Harmony
with names(i, full_name, dob, gender) as (values
  (1, 'Nguyễn Minh An', '2018-03-14', 'male'),
  (2, 'Trần Bảo Ngọc', '2017-07-02', 'female'),
  (3, 'Lê Gia Huy', '2018-11-20', 'male'),
  (4, 'Phạm Khánh Linh', '2019-01-09', 'female'),
  (5, 'Hoàng Đức Phúc', '2017-05-27', 'male'),
  (6, 'Vũ Thảo My', '2018-09-15', 'female'),
  (7, 'Đặng Quốc Bảo', '2016-12-03', 'male'),
  (8, 'Bùi Hà Anh', null, 'female'),
  (9, 'Emma Nguyen', '2016-04-18', 'female'),
  (10, 'Lucas Tran', '2015-10-30', 'male'),
  (11, 'Kim Ji-woo', '2016-02-11', 'female'),
  (12, 'Oliver Smith', '2017-06-06', 'male'),
  (13, 'Sophie Martin', '2015-08-24', 'female'),
  (14, 'Hiroshi Tanaka', '2016-11-12', 'male'),
  (15, 'Đỗ Nhật Minh', null, 'male'),
  (16, 'Ngô Tú Anh', null, 'female'),
  (17, 'Dương Hải Đăng', '2017-03-01', 'male'),
  (18, 'Lý Phương Thảo', null, 'female'),
  (19, 'Trịnh Tuấn Kiệt', '2018-07-19', 'male'),
  (20, 'Mai Anh Thư', null, 'female')
)
insert into public.students (full_name, date_of_birth, gender, current_school_id, current_grade_class, nationality)
select n.full_name, n.dob::date, n.gender,
  (select id from public.schools where short_name =
     case when n.i <= 8 then 'TH Tô Vĩnh Diện' when n.i <= 14 then 'UNIS' else 'Vinschool Harmony' end),
  case when n.i <= 8 then (2 + (n.i % 3))::text || 'A' || (1 + n.i % 4)::text
       when n.i <= 14 then 'Grade ' || (3 + n.i % 3)::text
       else (3 + n.i % 2)::text || 'H' || (1 + n.i % 3)::text end,
  case when n.i between 9 and 14 then null else 'VN' end
from names n
where not exists (select 1 from public.students);

insert into public.student_school_history (student_id, school_id, academic_year_id, grade_class)
select s.id, s.current_school_id, (select id from public.academic_years where is_current), s.current_grade_class
from public.students s
on conflict do nothing;
