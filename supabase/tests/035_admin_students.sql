-- Spec 14 · bước 2: admin_students_page (tiêu chí 1–2) và league_student_profile (tiêu chí 3).
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
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
  coach uuid := gen_random_uuid();
  coach2 uuid := gen_random_uuid();
  par uuid := gen_random_uuid();
  ls uuid := gen_random_uuid();
  sc uuid; cls uuid; program uuid; s1 uuid; s2 uuid; s3 uuid; s4 uuid; g1 uuid;
  code1 text; card1 text; tier1 text; r jsonb; ok boolean; u uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-asp-adm@example.test', now()),
    (coach, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-asp-coach@example.test', now()),
    (coach2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-asp-coach2@example.test', now()),
    (par, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-asp-par@example.test', now()),
    (ls, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-asp-ls@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (coach, 'coach'), (coach2, 'coach'), (ls, 'league_staff');
  insert into public.schools (name, type) values ('TH Test ASP', 'public') returning id into sc;
  select id into program from public.programs where code = 'core20';
  insert into public.classes (name, school_id, program_id) values ('TEST ASP', sc, program) returning id into cls;
  insert into public.class_staff (class_id, user_id, role) values (cls, coach, 'coach');

  -- s1: lớp của coach, đã thi SNAG, có phụ huynh par · s2: lớp của coach, chưa thi · s3: đã thi, không thuộc lớp nào
  -- s4: chờ duyệt, chưa thi
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test ASP Lý Một', '2016-05-06', sc) returning id into s1;
  insert into public.students (full_name, birth_year, current_school_id) values ('Test ASP Hai', 2017, sc) returning id into s2;
  insert into public.students (full_name, birth_year) values ('Test ASP Ba', 2015) returning id into s3;
  insert into public.students (full_name, birth_year, verification_status) values ('Test ASP Bốn', 2015, 'pending_review') returning id into s4;
  insert into public.enrollments (student_id, class_id) values (s1, cls), (s2, cls);
  select student_code into code1 from public.students where id = s1;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH ASP', '+84900000701', par) returning id into g1;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s1, g1, 'mother', true, true, 'league', 'active', now());
  card1 := (public.league_issue_card(s1)).passport_code;
  select t.code into tier1 from public.passports p join public.passport_tiers t on t.id = p.tier_id where p.passport_code = card1;

  perform public.league_save_stage(9, '2026-10-04', 'Sân A', 3, jsonb_build_array(
    jsonb_build_object('name', 'Test ASP Lý Một', 'student_code', code1, 'to_par', 3, 'title', 'Winner bảng'),
    jsonb_build_object('name', 'Test ASP Ba', 'student_code', (select student_code from public.students where id = s3), 'to_par', 5)),
    'league_app', false);

  ------------------------------------------------------------------ admin: tìm, lọc, phân trang
  perform pg_temp.act_as(adm);
  r := public.admin_students_page(code1);
  if (r ->> 'total')::int <> 1 or r #>> '{rows,0,id}' <> s1::text or (r #>> '{rows,0,league_stages}')::int <> 1
     or r #>> '{rows,0,passports,0,code}' <> card1 or (r #>> '{rows,0,birth_year}')::int <> 2016 then
    raise exception 'FAIL tìm theo mã VNC: %', r;
  end if;
  if public.admin_students_page('0900 000 701') #>> '{rows,0,id}' <> s1::text then raise exception 'FAIL tìm theo SĐT'; end if;
  if public.admin_students_page(lower(card1)) #>> '{rows,0,id}' <> s1::text then raise exception 'FAIL tìm theo mã sổ'; end if;
  if public.admin_students_page('https://app.vncentre.net/p/' || card1) #>> '{rows,0,id}' <> s1::text then raise exception 'FAIL tìm theo link QR'; end if;
  if (public.admin_students_page('test asp ly') ->> 'total')::int <> 1 then raise exception 'FAIL tìm tên bỏ dấu'; end if;
  if (public.admin_students_page('test asp') ->> 'total')::int <> 4 then raise exception 'FAIL tìm tên'; end if;
  if (public.admin_students_page('test asp', p_league => true) ->> 'total')::int <> 2
     or (public.admin_students_page('test asp', p_league => false) ->> 'total')::int <> 2 then
    raise exception 'FAIL lọc đã thi SNAG';
  end if;
  if (public.admin_students_page('test asp', p_tier_code => tier1) ->> 'total')::int <> 1 then raise exception 'FAIL lọc hạng sổ'; end if;
  if public.admin_students_page('test asp', p_verification => 'pending_review') #>> '{rows,0,id}' <> s4::text then raise exception 'FAIL lọc xác minh'; end if;
  if (public.admin_students_page('test asp', p_school_id => sc) ->> 'total')::int <> 2 then raise exception 'FAIL lọc trường'; end if;
  r := public.admin_students_page('test asp', p_limit => 1, p_offset => 1);
  if (r ->> 'total')::int <> 4 or jsonb_array_length(r -> 'rows') <> 1 or r #>> '{rows,0,full_name}' <> 'Test ASP Bốn' then
    raise exception 'FAIL phân trang: %', r;
  end if;

  ------------------------------------------------------------------ thành tích SNAG theo id
  r := public.league_student_profile(s1);
  if (r ->> 'stages_count')::int <> 1 or (r #>> '{stages,0,to_par}')::int <> 3 or r ->> 'name' <> 'Test ASP Lý Một' then
    raise exception 'FAIL admin xem thành tích: %', r;
  end if;
  if public.league_student_profile(s2) is not null then raise exception 'FAIL chưa thi phải null'; end if;

  perform pg_temp.act_as(coach);
  if (public.league_student_profile(s1) ->> 'stages_count')::int <> 1 then raise exception 'FAIL HLV xem học viên lớp mình'; end if;
  if public.league_student_profile(s2) is not null then raise exception 'FAIL HLV: chưa thi phải null'; end if;
  ok := false;
  begin perform public.league_student_profile(s3); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL HLV xem được học viên ngoài lớp'; end if;
  ok := false;
  begin perform public.admin_students_page('test'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL HLV gọi được admin_students_page'; end if;

  perform pg_temp.act_as(par);
  if (public.league_student_profile(s1) ->> 'stages_count')::int <> 1 then raise exception 'FAIL phụ huynh xem con'; end if;

  perform pg_temp.act_as(ls);
  if (public.league_student_profile(s3) ->> 'stages_count')::int <> 1 then raise exception 'FAIL BTC xem VĐV'; end if;
  ok := false;
  begin perform public.admin_students_page('test'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL BTC gọi được admin_students_page'; end if;

  foreach u in array array[coach2, par, ls] loop
    perform pg_temp.act_as(u);
    ok := false;
    begin perform public.league_student_profile(s2); exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception 'FAIL % xem được thành tích s2', u; end if;
  end loop;

  perform pg_temp.as_anon();
  ok := false;
  begin perform public.league_student_profile(s1); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL khách gọi được league_student_profile'; end if;

  perform pg_temp.act_as(null);
  raise exception 'ALL_OK';
end $$;
