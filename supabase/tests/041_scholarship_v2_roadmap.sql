-- Spec 22 · bước 3: chọn hướng, checklist theo lớp (tiêu chí 4, 5, 8), sửa lớp + quyền + audit, lịch sử lớp theo gộp.
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
-- mục theo mã trong kết quả roadmap
create or replace function pg_temp.item(r jsonb, c text) returns jsonb language sql as $f$
  select x from jsonb_array_elements(r -> 'items') x where x ->> 'code' = c
$f$;

do $$
declare
  adm uuid := gen_random_uuid();
  par uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  mgr uuid := gen_random_uuid();
  kid uuid := gen_random_uuid();
  i_a3 uuid := (select id from public.scholarship_checklist_items where code = 'US-A3');
  i_a1 uuid := (select id from public.scholarship_checklist_items where code = 'US-A1');
  sc uuid; s1 uuid; s2 uuid; g uuid; go uuid; m uuid; r jsonb; n int; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rm-' || x || '@example.test', now()
  from unnest(array[adm, par, other, mgr, kid]) x;
  insert into public.schools (name, type) values ('TH Test RM', 'public') returning id into sc;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.user_roles (user_id, role, school_id) values (mgr, 'school_manager', sc);
  insert into public.students (full_name, date_of_birth, current_school_id, current_grade_class) values ('Test RM Một', '2012-03-04', sc, '9A1') returning id into s1;
  insert into public.students (full_name, birth_year) values ('Test RM Hai', 2012) returning id into s2;
  insert into public.student_accounts (student_id, user_id, username) values (s1, kid, 'test.rm.kid');
  insert into public.guardians (full_name, phone, user_id) values ('Test PH RM', '+84900000961', par) returning id into g;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH RM khác', '+84900000962', other) returning id into go;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s1, g, 'mother', true, true, 'league', 'active', now()), (s2, g, 'mother', true, true, 'league', 'active', now());

  if public.school_year_of('2026-09-04') <> '2025-2026' or public.school_year_of('2026-09-05') <> '2026-2027' then
    raise exception 'FAIL school_year_of';
  end if;

  ------------------------------------------------------------------ chưa có lớp, chưa chọn hướng
  perform pg_temp.act_as(par);
  r := public.scholarship_roadmap(s1);
  if r ->> 'current_grade' is not null or r -> 'tracks' <> '[]'::jsonb or jsonb_array_length(r -> 'items') <> 18
     or exists (select 1 from jsonb_array_elements(r -> 'items') x where x ->> 'bucket' is not null and x ->> 'bucket' <> 'done')
     or r::text like '%source_ref%' or r ->> 'can_edit' <> 'true' then
    raise exception 'FAIL chưa có lớp / hướng: %', left(r::text, 300);
  end if;

  ------------------------------------------------------------------ sửa lớp: quyền + audit
  r := public.set_student_grade(s1, 9);
  if (select current_grade from public.students where id = s1) <> 9
     or (select current_grade_class from public.students where id = s1) <> '9A1' then raise exception 'FAIL phụ huynh sửa lớp'; end if;
  perform pg_temp.act_as(mgr);
  perform public.set_student_grade(s1, 9);  -- không đổi → không ghi
  if not pg_temp.denied(format('select public.set_student_grade(%L, 4)', s2)) then raise exception 'FAIL quản lý trường sửa lớp học viên trường khác'; end if;
  foreach m in array array[other, kid] loop
    perform pg_temp.act_as(m);
    if not pg_temp.denied(format('select public.set_student_grade(%L, 4)', s1)) then raise exception 'FAIL % sửa được lớp', m; end if;
    if not pg_temp.denied(format('select public.set_scholarship_tracks(%L, array[''uk''])', s1)) then raise exception 'FAIL % chọn được hướng', m; end if;
  end loop;
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.set_student_grade(s1, 14); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL nhận lớp 14'; end if;
  perform pg_temp.act_as(null);
  if (select count(*) from public.audit_logs where action = 'student_grade_set' and entity_id = s1) <> 1
     or (select count(*) from public.student_grade_history where student_id = s1) <> 1
     or (select source from public.student_grade_history where student_id = s1) <> 'guardian' then
    raise exception 'FAIL audit / lịch sử lớp';
  end if;

  ------------------------------------------------------------------ tiêu chí 4: lớp 9, chỉ hướng Anh
  perform pg_temp.act_as(par);
  r := public.set_scholarship_tracks(s1, array['uk', 'uk']);
  r := public.scholarship_roadmap(s1);
  if r -> 'tracks' <> '["uk"]'::jsonb or (r ->> 'current_grade')::int <> 9
     or exists (select 1 from jsonb_array_elements(r -> 'items') x where x ->> 'track' not in ('common', 'uk'))
     or (select count(*) from jsonb_array_elements(r -> 'items') x where x ->> 'track' = 'common') <> 18
     or (select count(*) from jsonb_array_elements(r -> 'items') x where x ->> 'track' = 'uk') <> 5 then
    raise exception 'FAIL tiêu chí 4 lọc hướng: %', r -> 'tracks';
  end if;
  if pg_temp.item(r, 'C8') ->> 'bucket' <> 'now' or pg_temp.item(r, 'C10') ->> 'bucket' <> 'upcoming'
     or pg_temp.item(r, 'UK-3') ->> 'bucket' <> 'upcoming' or pg_temp.item(r, 'UK-5') ->> 'bucket' <> 'later'
     or pg_temp.item(r, 'UK-5') ->> 'is_verified' <> 'false' or pg_temp.item(r, 'UK-1') ->> 'is_verified' <> 'true' then
    raise exception 'FAIL tiêu chí 4 nhóm / nhãn: % %', pg_temp.item(r, 'UK-5'), pg_temp.item(r, 'C8');
  end if;

  ------------------------------------------------------------------ tiêu chí 5: admin xác minh UK-5
  perform pg_temp.act_as(adm);
  update public.scholarship_checklist_items set is_verified = true where code = 'UK-5';
  perform pg_temp.act_as(par);
  if pg_temp.item(public.scholarship_roadmap(s1), 'UK-5') ->> 'is_verified' <> 'true' then raise exception 'FAIL tiêu chí 5'; end if;
  perform pg_temp.act_as(par);
  ok := false;
  begin update public.scholarship_checklist_items set is_verified = false where code = 'UK-5'; get diagnostics n = row_count; ok := n = 0;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh sửa được danh mục'; end if;

  ------------------------------------------------------------------ tiêu chí 8: bỏ chọn Mỹ rồi chọn lại, trạng thái còn nguyên
  perform public.set_scholarship_tracks(s1, array['us', 'uk']);
  perform public.set_scholarship_item(s1, i_a3, 'in_progress', 'đủ 4 môn');
  perform public.set_scholarship_item(s1, i_a1, 'done', null);
  r := public.scholarship_roadmap(s1);
  if pg_temp.item(r, 'US-A1') ->> 'bucket' <> 'done' or pg_temp.item(r, 'US-A3') ->> 'bucket' <> 'now' then raise exception 'FAIL nhóm sau khi ghi'; end if;
  perform public.set_scholarship_tracks(s1, array['uk']);
  r := public.scholarship_roadmap(s1);
  if pg_temp.item(r, 'US-A3') is not null or r -> 'tracks' <> '["uk"]'::jsonb then raise exception 'FAIL bỏ chọn Mỹ'; end if;
  perform public.set_scholarship_tracks(s1, array['uk', 'us']);
  r := public.scholarship_roadmap(s1);
  if pg_temp.item(r, 'US-A3') ->> 'status' <> 'in_progress' or pg_temp.item(r, 'US-A3') ->> 'note' <> 'đủ 4 môn'
     or pg_temp.item(r, 'US-A1') ->> 'status' <> 'done' or r -> 'tracks' <> '["uk", "us"]'::jsonb then
    raise exception 'FAIL tiêu chí 8: %', pg_temp.item(r, 'US-A3');
  end if;
  perform pg_temp.act_as(null);
  if (select count(*) from public.student_scholarship_tracks where student_id = s1) <> 2
     or exists (select 1 from public.student_scholarship_tracks where student_id = s1 and removed_at is not null) then
    raise exception 'FAIL bảng hướng sau khi chọn lại';
  end if;
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.set_scholarship_tracks(s1, array['mars']); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL nhận hướng lạ'; end if;

  ------------------------------------------------------------------ đổi lớp 9 → 10: mục lớp 10 vào "Cần làm ngay"; con, admin đọc; người lạ không
  perform public.set_student_grade(s1, 10);
  r := public.scholarship_roadmap(s1);
  if pg_temp.item(r, 'C10') ->> 'bucket' <> 'now' or pg_temp.item(r, 'US-A6') ->> 'bucket' <> 'now' then raise exception 'FAIL lên lớp 10'; end if;
  perform pg_temp.act_as(kid);
  if public.scholarship_roadmap(s1) ->> 'can_edit' <> 'false' then raise exception 'FAIL con chỉ đọc'; end if;
  perform pg_temp.act_as(adm);
  if public.scholarship_roadmap(s1) is null then raise exception 'FAIL admin đọc'; end if;
  perform pg_temp.act_as(other);
  if not pg_temp.denied(format('select public.scholarship_roadmap(%L)', s1)) then raise exception 'FAIL người lạ đọc được lộ trình'; end if;

  ------------------------------------------------------------------ gộp học viên: lịch sử lớp đi theo, hoàn tác trả về
  perform pg_temp.act_as(par);
  perform public.set_student_grade(s2, 8);
  perform pg_temp.act_as(adm);
  m := public.merge_students(s1, s2);
  perform pg_temp.act_as(null);
  if (select count(*) from public.student_grade_history where student_id = s1) <> 3 then raise exception 'FAIL lịch sử lớp sau gộp'; end if;
  perform pg_temp.act_as(adm);
  perform public.undo_student_merge(m);
  perform pg_temp.act_as(null);
  if (select count(*) from public.student_grade_history where student_id = s1) <> 2
     or (select count(*) from public.student_grade_history where student_id = s2) <> 1 then
    raise exception 'FAIL hoàn tác gộp lịch sử lớp';
  end if;

  raise exception 'ALL_OK';
end $$;
