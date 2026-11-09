-- Spec 22 · bước 4: lên lớp + thông báo (tiêu chí 6), so sánh hướng (7), tự lên lớp 05/9 (10), chạy lại không cộng thêm (11),
-- cờ "không tự lên lớp", sửa hàng loạt của admin.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;
create or replace function pg_temp.denied(sql text) returns boolean language plpgsql as $f$
begin
  execute sql;
  return false;
exception when insufficient_privilege then return true;
end $f$;
create or replace function pg_temp.item(r jsonb, c text) returns jsonb language sql as $f$
  select x from jsonb_array_elements(r -> 'items') x where x ->> 'code' = c
$f$;
create or replace function pg_temp.cmp(r jsonb, t text) returns jsonb language sql as $f$
  select x from jsonb_array_elements(r -> 'compare') x where x ->> 'track' = t
$f$;

do $$
declare
  adm uuid := gen_random_uuid();
  par uuid := gen_random_uuid();
  mgr uuid := gen_random_uuid();
  sc uuid; g uuid;
  s9 uuid; s3 uuid; s8 uuid; s9b uuid; sh uuid; snull uuid; s12 uuid;
  r jsonb; n int; due int; done_n int;
  i_c8 uuid := (select id from public.scholarship_checklist_items where code = 'C8');
  i_usa2 uuid := (select id from public.scholarship_checklist_items where code = 'US-A2');
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-pg-' || x || '@example.test', now()
  from unnest(array[adm, par, mgr]) x;
  insert into public.schools (name, type) values ('TH Test PG', 'public') returning id into sc;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.user_roles (user_id, role, school_id) values (mgr, 'school_manager', sc);
  insert into public.guardians (full_name, phone, user_id) values ('Test PH PG', '+84900000971', par) returning id into g;
  insert into public.students (full_name, birth_year, current_school_id) values ('Test PG Chín', 2012, sc) returning id into s9;
  insert into public.students (full_name, birth_year, current_school_id, current_grade) values ('Test PG Ba', 2018, sc, 3) returning id into s3;
  insert into public.students (full_name, birth_year, current_school_id, current_grade) values ('Test PG Tám', 2013, sc, 8) returning id into s8;
  insert into public.students (full_name, birth_year, current_school_id, current_grade) values ('Test PG Chín B', 2012, sc, 9) returning id into s9b;
  insert into public.students (full_name, birth_year, current_school_id, current_grade) values ('Test PG Giữ', 2015, sc, 6) returning id into sh;
  insert into public.students (full_name, birth_year) values ('Test PG Trống', 2015) returning id into snull;
  insert into public.students (full_name, birth_year, current_grade) values ('Test PG Mười Hai', 2009, 12) returning id into s12;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  select x, g, 'mother', true, true, 'league', 'active', now() from unnest(array[s9, s3, s8, s9b, sh, snull, s12]) x;

  ------------------------------------------------------------------ tiêu chí 7: so sánh hướng
  perform pg_temp.act_as(par);
  perform public.set_scholarship_tracks(s9, array['us', 'uk']);
  r := public.scholarship_roadmap(s9);
  if r -> 'compare' <> '[]'::jsonb then raise exception 'FAIL chưa có lớp thì không so sánh'; end if;
  perform public.set_student_grade(s9, 9);
  perform public.set_scholarship_item(s9, i_c8, 'done', null);
  perform public.set_scholarship_item(s9, i_usa2, 'done', null);
  r := public.scholarship_roadmap(s9);
  perform pg_temp.act_as(null);
  -- mong đợi tính độc lập: mục bật, (chung hoặc hướng), start_grade ≤ 9
  select count(*), count(*) filter (where code in ('C8', 'US-A2')) into due, done_n
  from public.scholarship_checklist_items where is_active and track in ('common', 'us') and start_grade <= 9;
  if (pg_temp.cmp(r, 'us') ->> 'due_count')::int <> due or (pg_temp.cmp(r, 'us') ->> 'done_count')::int <> done_n
     or (pg_temp.cmp(r, 'us') ->> 'missing_count')::int <> due - done_n
     or (pg_temp.cmp(r, 'us') ->> 'pct')::int <> round(100.0 * done_n / due)::int then
    raise exception 'FAIL tiêu chí 7 hướng Mỹ: % (mong đợi %/%)', pg_temp.cmp(r, 'us'), done_n, due;
  end if;
  select count(*) into due from public.scholarship_checklist_items where is_active and track in ('common', 'uk') and start_grade <= 9;
  if (pg_temp.cmp(r, 'uk') ->> 'due_count')::int <> due or (pg_temp.cmp(r, 'uk') ->> 'done_count')::int <> 1
     or pg_temp.cmp(r, 'uk') #>> '{next,code}' is null or jsonb_array_length(r -> 'compare') <> 2 then
    raise exception 'FAIL tiêu chí 7 hướng Anh: %', pg_temp.cmp(r, 'uk');
  end if;

  ------------------------------------------------------------------ tiêu chí 6: 9 → 10, mục lớp 10 vào "Cần làm ngay", có thông báo
  perform pg_temp.act_as(par);
  if pg_temp.item(r, 'C10') ->> 'bucket' <> 'upcoming' then raise exception 'FAIL C10 trước khi lên lớp'; end if;
  perform public.set_student_grade(s9, 10);
  r := public.scholarship_roadmap(s9);
  if pg_temp.item(r, 'C10') ->> 'bucket' <> 'now' or pg_temp.item(r, 'US-A6') ->> 'bucket' <> 'now' then
    raise exception 'FAIL tiêu chí 6 nhóm';
  end if;
  perform pg_temp.act_as(null);
  if not exists (select 1 from public.notifications where user_id = par and type = 'grade_changed'
                 and title_vi = 'Test PG Chín đã lên lớp 10' and body_vi like '%Golf resume 1 trang%'
                 and body_vi like '%Nộp học bạ lần 1%' and body_vi not like '%Thứ hạng Junior Golf Scoreboard%'
                 and link = '/app/children/' || s9 || '#athlete-scholarship') then
    raise exception 'FAIL tiêu chí 6 thông báo: %', (select body_vi from public.notifications where user_id = par and type = 'grade_changed'
                                                    order by created_at desc limit 1);
  end if;
  if (select count(*) from public.notifications where user_id = par and type = 'grade_changed') <> 2 then  -- null→9 và 9→10
    raise exception 'FAIL số thông báo lên lớp';
  end if;

  ------------------------------------------------------------------ cờ "không tự lên lớp": trường của học viên / admin
  perform pg_temp.act_as(mgr);
  perform public.set_grade_promotion_hold(sh, '2027-2028', true, 'ở lại lớp');
  if not pg_temp.denied(format('select public.set_grade_promotion_hold(%L, ''2027-2028'', true)', snull)) then
    raise exception 'FAIL quản lý trường đánh dấu học viên trường khác';
  end if;
  perform pg_temp.act_as(par);
  if not pg_temp.denied(format('select public.set_grade_promotion_hold(%L, ''2027-2028'', true)', s3)) then
    raise exception 'FAIL phụ huynh đánh dấu không tự lên lớp';
  end if;
  if not pg_temp.denied(format('select public.admin_bulk_set_grade(%L, 3, 4)', sc)) then raise exception 'FAIL phụ huynh sửa hàng loạt'; end if;
  if not pg_temp.denied('select public.promote_grades(''2027-09-05'')') then raise exception 'FAIL phụ huynh gọi được promote_grades'; end if;

  ------------------------------------------------------------------ tiêu chí 10: chạy ngày 05/9/2027
  perform pg_temp.act_as(null);
  delete from public.notifications where user_id = par;
  r := public.promote_grades('2027-09-04');
  if r ->> 'skipped' <> 'not_promotion_window' then raise exception 'FAIL chạy trước 05/9'; end if;
  r := public.promote_grades('2027-09-05');
  if (select current_grade from public.students where id = s3) <> 4
     or (select current_grade from public.students where id = s8) <> 9
     or (select current_grade from public.students where id = s9b) <> 9
     or (select current_grade from public.students where id = s9) <> 10
     or (select current_grade from public.students where id = sh) <> 6
     or (select current_grade from public.students where id = snull) is not null
     or (select current_grade from public.students where id = s12) <> 12 then
    raise exception 'FAIL tiêu chí 10 lớp sau khi chạy: %', r;
  end if;
  if not exists (select 1 from public.notifications where user_id = par and type = 'grade_confirm' and link like '%' || s9b || '%')
     or not exists (select 1 from public.notifications where user_id = par and type = 'grade_confirm' and link like '%' || s12 || '%')
     or not exists (select 1 from public.notifications where user_id = par and type = 'grade_missing' and link like '%' || snull || '%')
     or not exists (select 1 from public.notifications where user_id = par and type = 'grade_changed' and title_vi = 'Test PG Ba đã lên lớp 4')
     or exists (select 1 from public.notifications where user_id = par and link like '%' || sh || '%') then
    raise exception 'FAIL tiêu chí 10 thông báo';
  end if;
  if (select count(*) from public.student_grade_history where student_id in (s3, s8) and source = 'auto' and school_year = '2027-2028') <> 2 then
    raise exception 'FAIL lịch sử lớp auto';
  end if;

  ------------------------------------------------------------------ tiêu chí 11: chạy lại cùng năm học
  select count(*) into n from public.notifications where user_id = par;
  r := public.promote_grades('2027-09-06');
  if r ->> 'skipped' <> 'already_ran' or (select current_grade from public.students where id = s3) <> 4
     or (select count(*) from public.notifications where user_id = par) <> n then
    raise exception 'FAIL tiêu chí 11: %', r;
  end if;
  -- kể cả khi xoá nhật ký chạy, chỉ mục 'auto' theo năm học vẫn chặn cộng lần hai
  delete from public.grade_promotion_runs where school_year = '2027-2028';
  perform public.promote_grades('2027-09-07');
  if (select current_grade from public.students where id = s3) <> 4 then raise exception 'FAIL tiêu chí 11 lớp phòng hai'; end if;

  ------------------------------------------------------------------ admin sửa hàng loạt theo trường + lớp
  perform pg_temp.act_as(adm);
  if public.admin_bulk_set_grade(sc, 9, 10) <> 2 then raise exception 'FAIL sửa hàng loạt'; end if;  -- s8 (nay lớp 9) và s9b
  perform pg_temp.act_as(null);
  if (select count(*) from public.audit_logs where action = 'student_grade_set' and entity_id in (s8, s9b) and after ->> 'source' = 'admin') <> 2 then
    raise exception 'FAIL audit sửa hàng loạt';
  end if;

  raise exception 'ALL_OK';
end $$;
