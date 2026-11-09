-- Spec 22 · tiêu chí 1–3: chạy SAU các migration tới 20261107000001 và TRƯỚC 20261109000001_scholarship_v2.sql.
-- Dựng dữ liệu v1 (ghi thẳng bảng với quyền chủ CSDL) để kiểm bước chuyển 17 mục cũ. Kiểm tra: scholarship_v2_after.sql.
-- Dùng được cho chạy thử trên bản sao dữ liệu thật: file này chỉ thêm học viên "Test SV2 …".
create temp table sv2_ids (k text primary key, id uuid);

do $$
declare
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid;
  p uuid[];  -- id của P1…P17 theo thứ tự seed v1
begin
  if (select count(*) from public.scholarship_checklist_items) <> 17 then raise exception 'cần danh mục v1 17 mục'; end if;
  select array_agg(id order by sort_order) into p from public.scholarship_checklist_items;
  insert into public.students (full_name, birth_year) values ('Test SV2 Một', 2014) returning id into s1;
  insert into public.students (full_name, birth_year) values ('Test SV2 Hai', 2014) returning id into s2;
  insert into public.students (full_name, birth_year) values ('Test SV2 Ba', 2012) returning id into s3;
  insert into public.students (full_name, birth_year) values ('Test SV2 Bốn', 2012) returning id into s4;
  insert into public.students (full_name, birth_year) values ('Test SV2 Năm', 2012) returning id into s5;  -- không có dữ liệu
  insert into sv2_ids values ('s1', s1), ('s2', s2), ('s3', s3), ('s4', s4), ('s5', s5);
  for i in 1..17 loop insert into sv2_ids values ('P' || i, p[i]); end loop;

  insert into public.scholarship_checklist_status (student_id, item_id, status, note) values
    -- tiêu chí 1: P4 done (giải ngoài), chưa thi giải VN Centre
    (s1, p[4], 'done', 'VGA'),
    -- tiêu chí 2: P6 in_progress + P11 done → C13 done, ghi chú nối
    (s2, p[6], 'in_progress', 'Movers'), (s2, p[11], 'done', 'IELTS 6.5'),
    -- P6 not_started + P11 in_progress → in_progress; P11 riêng → chuyển sang
    (s3, p[6], 'not_started', null), (s3, p[11], 'in_progress', null),
    (s4, p[11], 'done', null),
    -- tiêu chí 3: các mục 1–1, đủ cả 13
    (s1, p[5], 'done', 'hb'), (s1, p[7], 'in_progress', null), (s1, p[8], 'done', null), (s1, p[9], 'in_progress', null),
    (s1, p[10], 'done', null), (s1, p[12], 'in_progress', null), (s1, p[13], 'not_started', 'sat'), (s1, p[14], 'done', null),
    (s1, p[15], 'in_progress', null), (s1, p[16], 'done', null), (s1, p[17], 'in_progress', null),
    (s3, p[5], 'done', null), (s3, p[17], 'done', 'list');
end $$;

create temp table sv2_before as
select s.student_id, s.item_id, s.status, s.note, s.updated_at from public.scholarship_checklist_status s;
