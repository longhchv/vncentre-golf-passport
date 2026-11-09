-- Spec 22 · bước 5: danh sách lớp theo trường (quản lý trường / admin), thống kê admin.
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

do $$
declare
  adm uuid := gen_random_uuid();
  mgr uuid := gen_random_uuid();
  par uuid := gen_random_uuid();
  sc uuid; sc2 uuid; g uuid; a uuid; b uuid; c uuid; r jsonb; v_year text; before_s jsonb; n int; due int;
  i_c8 uuid := (select id from public.scholarship_checklist_items where code = 'C8');
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ad-' || x || '@example.test', now()
  from unnest(array[adm, mgr, par]) x;
  insert into public.schools (name, type) values ('TH Test AD', 'public') returning id into sc;
  insert into public.schools (name, type) values ('TH Test AD 2', 'public') returning id into sc2;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.user_roles (user_id, role, school_id) values (mgr, 'school_manager', sc);
  insert into public.guardians (full_name, phone, user_id) values ('Test PH AD', '+84900000981', par) returning id into g;
  insert into public.students (full_name, birth_year, current_school_id, current_grade, current_grade_class) values ('Test AD A', 2013, sc, 7, '7A') returning id into a;
  insert into public.students (full_name, birth_year, current_school_id) values ('Test AD B', 2013, sc) returning id into b;
  insert into public.students (full_name, birth_year, current_school_id, current_grade) values ('Test AD C', 2013, sc2, 9) returning id into c;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (c, g, 'mother', true, true, 'league', 'active', now());

  v_year := public.next_promotion_school_year();
  if v_year !~ '^\d{4}-\d{4}$' or split_part(v_year, '-', 1)::int < extract(year from public.vn_today())::int - 1 then
    raise exception 'FAIL năm học sắp tới: %', v_year;
  end if;

  ------------------------------------------------------------------ danh sách lớp theo trường + cờ
  perform pg_temp.act_as(mgr);
  perform public.set_grade_promotion_hold(a, v_year, true, 'ở lại lớp 7');
  r := public.school_grade_roster(sc);
  if r ->> 'school_year' <> v_year or jsonb_array_length(r -> 'students') <> 2
     or r #>> '{students,0,full_name}' <> 'Test AD A' or r #>> '{students,0,hold}' <> 'true'
     or r #>> '{students,0,hold_note}' <> 'ở lại lớp 7' or r #>> '{students,1,hold}' <> 'false'
     or r #> '{students,1,current_grade}' <> 'null'::jsonb then
    raise exception 'FAIL danh sách lớp: %', r;
  end if;
  if not pg_temp.denied(format('select public.school_grade_roster(%L)', sc2)) then raise exception 'FAIL quản lý trường xem trường khác'; end if;
  if not pg_temp.denied('select public.scholarship_admin_stats()') then raise exception 'FAIL quản lý trường xem thống kê'; end if;
  perform public.set_grade_promotion_hold(a, v_year, false);
  if public.school_grade_roster(sc) #>> '{students,0,hold}' <> 'false' then raise exception 'FAIL bỏ cờ'; end if;
  perform pg_temp.act_as(par);
  if not pg_temp.denied(format('select public.school_grade_roster(%L)', sc)) then raise exception 'FAIL phụ huynh xem danh sách lớp'; end if;
  perform pg_temp.act_as(adm);
  if jsonb_array_length(public.school_grade_roster(sc2) -> 'students') <> 1 then raise exception 'FAIL admin xem danh sách lớp'; end if;

  ------------------------------------------------------------------ thống kê
  before_s := public.scholarship_admin_stats();
  perform pg_temp.act_as(par);
  perform public.set_scholarship_tracks(c, array['us', 'vn']);
  perform public.set_scholarship_item(c, i_c8, 'done', null);
  perform pg_temp.act_as(adm);
  r := public.scholarship_admin_stats();
  if (r ->> 'students_with_tracks')::int <> (before_s ->> 'students_with_tracks')::int + 1
     or (r ->> 'students_with_grade')::int <> (before_s ->> 'students_with_grade')::int
     or coalesce((select (x ->> 'students')::int from jsonb_array_elements(r -> 'by_track') x where x ->> 'track' = 'vn'), 0)
        <> coalesce((select (x ->> 'students')::int from jsonb_array_elements(before_s -> 'by_track') x where x ->> 'track' = 'vn'), 0) + 1 then
    raise exception 'FAIL thống kê theo hướng: %', r;
  end if;
  -- lớp 9: số mục đến hạn tăng đúng bằng số mục (chung + us + vn) có start_grade ≤ 9; số đã xong tăng 1 (C8)
  perform pg_temp.act_as(null);
  select count(*) into due from public.scholarship_checklist_items where is_active and track in ('common', 'us', 'vn') and start_grade <= 9;
  select count(*) into n from public.scholarship_checklist_items where is_active and track = 'common' and start_grade <= 9;
  if (select (x ->> 'due')::int from jsonb_array_elements(r -> 'by_grade') x where x ->> 'grade' = '9')
       - coalesce((select (x ->> 'due')::int from jsonb_array_elements(before_s -> 'by_grade') x where x ->> 'grade' = '9'), 0) <> due - n
     or (select (x ->> 'done')::int from jsonb_array_elements(r -> 'by_grade') x where x ->> 'grade' = '9')
       - coalesce((select (x ->> 'done')::int from jsonb_array_elements(before_s -> 'by_grade') x where x ->> 'grade' = '9'), 0) <> 1 then
    raise exception 'FAIL thống kê theo lớp: % / %', r -> 'by_grade', before_s -> 'by_grade';
  end if;

  raise exception 'ALL_OK';
end $$;
