-- Spec 15 bản 1.1 · không có quyền → lỗi 42501 (mục 1b).
-- Spec 15 · bước 1: student_athlete_card, scholarship_checklist, set_scholarship_item (tiêu chí 2, 3, 5, 6 ở tầng SQL).
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;
-- true nếu gọi hàm bị chặn bằng lỗi 42501
create or replace function pg_temp.denied(sql text) returns boolean language plpgsql as $f$
begin
  execute sql;
  return false;
exception when insufficient_privilege then return true;
end $f$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $f$;

do $$
declare
  adm uuid := gen_random_uuid();
  par_a uuid := gen_random_uuid();
  par_b uuid := gen_random_uuid();
  pend uuid := gen_random_uuid();
  kid uuid := gen_random_uuid();
  coach uuid := gen_random_uuid();
  ls uuid := gen_random_uuid();
  sc uuid; cls uuid; program uuid; s1 uuid; s2 uuid; s3 uuid; ga uuid; gb uuid; gp uuid;
  code1 text; r jsonb; ok boolean; u uuid; n int;
  it_manual uuid; it_comp uuid; it_culture uuid; it_courses uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ath-' || x || '@example.test', now()
  from unnest(array[adm, par_a, par_b, pend, kid, coach, ls]) x;
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (coach, 'coach'), (ls, 'league_staff');
  insert into public.schools (name, type) values ('TH Test ATH', 'public') returning id into sc;
  select id into program from public.programs where code = 'core20';
  insert into public.classes (name, school_id, program_id) values ('TEST ATH', sc, program) returning id into cls;
  insert into public.class_staff (class_id, user_id, role) values (cls, coach, 'coach');

  -- s1: đã thi (Best Gross + Tinh thần Golfer chặng 9, 1st Runner-up chặng 11), con của A, có tài khoản con, học lớp của coach
  -- s2: chưa thi, có một khoá học đã duyệt, con của B
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test ATH Một', '2016-04-05', sc) returning id into s1;
  insert into public.students (full_name, birth_year) values ('Test ATH Hai', 2017) returning id into s2;
  insert into public.students (full_name, birth_year) values ('Test ATH Ba', 2016) returning id into s3;
  select student_code into code1 from public.students where id = s1;
  insert into public.enrollments (student_id, class_id) values (s1, cls);
  insert into public.student_accounts (student_id, user_id, username) values (s1, kid, 'test.ath.kid');
  insert into public.guardians (full_name, phone, email, user_id) values ('Test PH A', '+84900000801', 'pha@example.test', par_a) returning id into ga;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH B', '+84900000802', par_b) returning id into gb;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH Chờ', '+84900000803', pend) returning id into gp;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s1, ga, 'mother', true, true, 'league', 'active', now()),
         (s2, gb, 'father', true, true, 'league', 'active', now()),
         (s1, gp, 'father', false, false, 'league', 'pending_confirmation', null),
         (s3, gb, 'father', true, true, 'league', 'active', now());
  insert into public.course_history (student_id, course_name, source, status) values (s2, 'Test ATH khoá', 'admin', 'approved');

  perform public.league_save_stage(9, '2026-10-04', 'Sân A', 3, jsonb_build_array(
    jsonb_build_object('name', 'Test ATH Một', 'student_code', code1, 'to_par', -1, 'title', 'Vô địch (Best Gross)', 'culture', 'Tinh thần Golfer')),
    'league_app', false);
  perform public.league_save_stage(11, '2026-11-08', 'Sân B', 3, jsonb_build_array(
    jsonb_build_object('name', 'Test ATH Một', 'student_code', code1, 'to_par', 2, 'title', '1st Runner-up'),
    -- s3: chỉ có "Điểm thưởng Phong cách" → không phải giải (counts_as_award = false)
    jsonb_build_object('name', 'Test ATH Ba', 'student_code', (select student_code from public.students where id = s3), 'to_par', 4,
                       'culture', 'Điểm thưởng Phong cách')),
    'league_app', false);

  select id into it_manual from public.scholarship_checklist_items where code = 'C11';  -- v2 (spec 22): P5 → C11
  select id into it_comp from public.scholarship_checklist_items where auto_source = 'competitions';
  select id into it_culture from public.scholarship_checklist_items where auto_source = 'culture_awards';
  select id into it_courses from public.scholarship_checklist_items where auto_source = 'courses';
  if (select count(*) from public.scholarship_checklist_items where is_active) <> 78 or it_manual is null then
    raise exception 'FAIL danh mục v2 phải có 78 mục';
  end if;

  ------------------------------------------------------------------ Thẻ VĐV
  perform pg_temp.act_as(par_a);
  r := public.student_athlete_card(s1);
  if not (r ->> 'student_code' = code1 and (r ->> 'birth_year')::int = 2016 and r ->> 'school' = 'TH Test ATH'
          and (r #>> '{counts,best_gross}')::int = 1 and (r #>> '{counts,runner_up}')::int = 1
          and (r #>> '{counts,winner}')::int = 0 and (r #>> '{counts,culture_awards}')::int = 1
          and r ->> 'graduated' = 'false' and r -> 'league' <> 'null'::jsonb
          and (r #>> '{league,stages_played}')::int = 2 and r #>> '{league,season}' is not null) then
    raise exception 'FAIL thẻ VĐV s1: %', r;
  end if;
  if jsonb_array_length(r -> 'awards') <> 3 or r #>> '{awards,0,code}' <> 'runner_up_1'
     or r #>> '{awards,1,kind}' <> 'rank' or r #>> '{awards,2,kind}' <> 'culture'
     or r #>> '{awards,2,name_vi}' <> 'Tinh thần Golfer' or r #>> '{awards,2,name_en}' <> 'Spirit of the Game' then
    raise exception 'FAIL danh sách giải thưởng: %', r -> 'awards';
  end if;
  if r ? 'date_of_birth' or r::text like '%2016-04-05%' or r::text like '%pha@example.test%' or r::text like '%+84900000801%' then
    raise exception 'FAIL thẻ VĐV lộ ngày sinh / liên hệ phụ huynh: %', r;
  end if;
  -- tiêu chí 5: phụ huynh A không xem được con phụ huynh B
  if not pg_temp.denied(format('select public.student_athlete_card(%L)', s2))
     or not pg_temp.denied(format('select public.scholarship_checklist(%L)', s2)) then
    raise exception 'FAIL phụ huynh A xem được con phụ huynh B';
  end if;

  perform pg_temp.act_as(par_b);
  r := public.student_athlete_card(s2);
  if r is null or r -> 'league' <> 'null'::jsonb or jsonb_array_length(r -> 'awards') <> 0
     or (r #>> '{counts,best_gross}')::int <> 0 then
    raise exception 'FAIL thẻ VĐV chưa thi: %', r;
  end if;

  -- "Điểm thưởng Phong cách" không phải giải: không đếm, không thành dòng, không bật mục checklist văn hoá
  r := public.student_athlete_card(s3);
  if (r #>> '{counts,culture_awards}')::int <> 0 or jsonb_array_length(r -> 'awards') <> 0 or r -> 'league' = 'null'::jsonb then
    raise exception 'FAIL điểm thưởng phong cách bị tính là giải: %', r;
  end if;
  if (select x ->> 'status' from jsonb_array_elements(public.scholarship_checklist(s3) #> '{stages,0,items}') x
      where x ->> 'title_vi' = 'Giải văn hoá – tinh thần') <> 'not_started' then
    raise exception 'FAIL điểm thưởng phong cách bật mục checklist văn hoá';
  end if;

  perform pg_temp.act_as(kid);
  if public.student_athlete_card(s1) ->> 'student_code' <> code1 then raise exception 'FAIL tài khoản con xem thẻ'; end if;
  perform pg_temp.act_as(adm);
  if public.student_athlete_card(s1) is null then raise exception 'FAIL admin xem thẻ'; end if;

  foreach u in array array[pend, coach, ls] loop
    perform pg_temp.act_as(u);
    if not pg_temp.denied(format('select public.student_athlete_card(%L)', s1)) then raise exception 'FAIL % xem được thẻ VĐV', u; end if;
    if not pg_temp.denied(format('select public.scholarship_checklist(%L)', s1)) then raise exception 'FAIL % đọc được checklist', u; end if;
  end loop;
  perform pg_temp.as_anon();
  ok := false;
  begin perform public.student_athlete_card(s1); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL khách gọi được student_athlete_card'; end if;

  ------------------------------------------------------------------ Checklist: trạng thái tự động
  perform pg_temp.act_as(par_a);
  r := public.scholarship_checklist(s1);
  -- v2: 4 cấp; chưa chọn hướng → mục chung + hướng Mỹ; tiểu học = C1, C3, C4, C5, C6, C11, C13, C14, C17, US-Q1
  if jsonb_array_length(r -> 'stages') <> 4 or r #>> '{stages,0,stage}' <> 'primary' or r #>> '{stages,3,stage}' <> 'post_graduation'
     or (r #>> '{stages,0,total_count}')::int <> 10 or (r #>> '{stages,0,done_count}')::int <> 2 or r ->> 'can_edit' <> 'true' then
    raise exception 'FAIL checklist s1: %', r;
  end if;
  if (select x ->> 'status' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = it_comp::text) <> 'done'
     or (select x ->> 'status' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = it_culture::text) <> 'done'
     or (select x ->> 'status' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = it_courses::text) <> 'not_started'
     or (select x ->> 'source' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = it_comp::text) <> 'auto'
     or (select x ->> 'source' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = it_manual::text) <> 'guardian' then
    raise exception 'FAIL trạng thái tự động s1: %', r #> '{stages,0,items}';
  end if;
  perform pg_temp.act_as(par_b);
  r := public.scholarship_checklist(s2);
  if (select x ->> 'status' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = it_comp::text) <> 'not_started'
     or (select x ->> 'status' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = it_courses::text) <> 'done' then
    raise exception 'FAIL trạng thái tự động s2: %', r #> '{stages,0,items}';
  end if;

  ------------------------------------------------------------------ Checklist: ghi
  perform pg_temp.act_as(par_a);
  r := public.set_scholarship_item(s1, it_manual, 'in_progress', '  lớp 3, lớp 4  ');
  if r ->> 'status' <> 'in_progress' or r ->> 'note' <> 'lớp 3, lớp 4' then raise exception 'FAIL ghi mục: %', r; end if;
  perform public.set_scholarship_item(s1, it_manual, 'done', null);
  r := public.scholarship_checklist(s1);
  if (select x ->> 'status' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = it_manual::text) <> 'done'
     or (r #>> '{stages,0,done_count}')::int <> 3 then
    raise exception 'FAIL đọc lại trạng thái đã ghi: %', r #> '{stages,0}';
  end if;
  ok := false;
  begin perform public.set_scholarship_item(s1, it_manual, 'xong', null); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL nhận trạng thái lạ'; end if;
  ok := false;
  begin perform public.set_scholarship_item(s1, it_manual, 'done', repeat('a', 501)); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL nhận ghi chú quá 500 ký tự'; end if;
  ok := false;
  begin perform public.set_scholarship_item(s2, it_manual, 'done', null); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh A ghi được checklist con phụ huynh B'; end if;
  -- ghi thẳng bảng bị RLS chặn
  ok := false;
  begin
    insert into public.scholarship_checklist_status (student_id, item_id, status) values (s1, it_manual, 'done');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL phụ huynh ghi thẳng được bảng trạng thái'; end if;
  if (select count(*) from public.scholarship_checklist_status) <> 0 then raise exception 'FAIL phụ huynh đọc thẳng được bảng trạng thái'; end if;

  foreach u in array array[kid, pend, coach, ls, adm] loop
    perform pg_temp.act_as(u);
    ok := false;
    begin perform public.set_scholarship_item(s1, it_manual, 'not_started', null); exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception 'FAIL % ghi được checklist', u; end if;
  end loop;
  perform pg_temp.act_as(kid);
  if public.scholarship_checklist(s1) ->> 'can_edit' <> 'false' then raise exception 'FAIL tài khoản con phải chỉ đọc'; end if;

  -- spec 22 Q2-A: mục tự động ghi tay được (C4 gồm cả giải ngoài): s2 chưa thi giải VN Centre, phụ huynh đánh dấu done
  perform pg_temp.act_as(par_b);
  perform public.set_scholarship_item(s2, it_comp, 'done', 'VGA Junior Tour');
  r := public.scholarship_checklist(s2);
  if (select x ->> 'status' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = it_comp::text) <> 'done'
     or (select x ->> 'note' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = it_comp::text) <> 'VGA Junior Tour' then
    raise exception 'FAIL mục tự động ghi tay: %', r #> '{stages,0,items}';
  end if;

  ------------------------------------------------------------------ tiêu chí 6: audit
  perform pg_temp.act_as(null);
  select count(*) into n from public.audit_logs
  where action = 'scholarship_item_set' and actor_user_id = par_a and after ->> 'student_id' = s1::text;
  if n <> 2 then raise exception 'FAIL audit set_scholarship_item: % dòng (mong đợi 2)', n; end if;
  if not exists (select 1 from public.audit_logs where action = 'scholarship_item_set' and actor_user_id = par_a
                 and before ->> 'status' = 'in_progress' and after ->> 'status' = 'done') then
    raise exception 'FAIL audit thiếu trạng thái trước / sau';
  end if;

  raise exception 'ALL_OK';
end $$;
