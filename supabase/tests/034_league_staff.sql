-- Spec 14 · bước 1: vai trò BTC giải (league_staff) — tiêu chí 4–5 ở tầng SQL.
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
  ls uuid := gen_random_uuid();
  ls_off uuid := gen_random_uuid();
  coach uuid := gen_random_uuid();
  sc uuid; s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; g1 uuid; g2 uuid; card1 text; code1 text;
  r jsonb; n int; ok boolean; v_audit int; v_role uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ls-adm@example.test', now()),
    (ls, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ls-btc@example.test', now()),
    (ls_off, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ls-off@example.test', now()),
    (coach, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ls-coach@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (ls, 'league_staff'), (coach, 'coach');
  insert into public.user_roles (user_id, role) values (ls_off, 'league_staff') returning id into v_role;
  update public.user_roles set deleted_at = now() where id = v_role;   -- đã gỡ vai trò
  insert into public.schools (name, type) values ('TH Test LS', 'public') returning id into sc;

  -- s1: đã thi SNAG, có ngày sinh, email phụ huynh → BTC xem được nhưng không thấy ngày sinh / email / mã nhận
  -- s2: chưa từng thi, không có yêu cầu cấp mã → BTC không xem được
  -- s3: chỉ có yêu cầu cấp mã đang 'review' → xem được
  -- s4: có yêu cầu cấp mã, đã gộp vào s5 (chưa thi) → s5 xem được, mở bằng id s4 ra hồ sơ s5
  insert into public.students (full_name, date_of_birth, current_school_id, claim_code)
    values ('Test Lý Bờ Tê Xê', '2016-02-03', sc, default) returning id into s1;
  insert into public.students (full_name, birth_year) values ('Test Lý Chưa Thi', 2017) returning id into s2;
  insert into public.students (full_name, birth_year) values ('Test Lý Chờ Ghép', 2015) returning id into s3;
  insert into public.students (full_name, birth_year) values ('Test LS Gộp Đi', 2014) returning id into s4;
  insert into public.students (full_name, birth_year) values ('Test LS Gộp Đến', 2014) returning id into s5;
  select student_code into code1 from public.students where id = s1;

  insert into public.guardians (full_name, phone, email) values ('Test PH LS', '+84900000601', 'ph-ls@example.test') returning id into g1;
  insert into public.guardians (full_name, phone) values ('Test PH LS Hai', '+84900000602') returning id into g2;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s1, g1, 'mother', true, true, 'league', 'active', now()),
         (s1, g2, 'father', false, false, 'league', 'active', now()),
         (s2, g2, 'father', true, true, 'league', 'active', now());
  card1 := (public.league_issue_card(s1)).passport_code;

  perform public.league_save_stage(9, '2026-10-04', 'Sân A', 3, jsonb_build_array(
    jsonb_build_object('name', 'Test Lý Bờ Tê Xê', 'student_code', code1, 'group', 'Bảng U10',
                       'to_par', -2, 'title', 'Vô địch (Best Gross)')), 'league_app', false);
  insert into public.league_issue_requests (league_ref, status, student_id) values
    ('test-ls-ref-3', 'review', s3), ('test-ls-ref-4', 'created', s4);
  update public.students set merged_into_student_id = s5 where id = s4;

  ------------------------------------------------------------------ tìm kiếm
  perform pg_temp.act_as(ls);
  select count(*) into n from public.league_staff_search('test ly');
  if n <> 2 or not exists (select 1 from public.league_staff_search('test ly') x where x.id = s1)
     or not exists (select 1 from public.league_staff_search('test ly') x where x.id = s3)
     or exists (select 1 from public.league_staff_search('test ly') x where x.id = s2) then
    raise exception 'FAIL tìm theo tên: % dòng', n;
  end if;
  if (select x.id from public.league_staff_search(code1) x) is distinct from s1 then raise exception 'FAIL tìm theo mã VNC'; end if;
  if (select x.id from public.league_staff_search('0900 000 601') x) is distinct from s1 then raise exception 'FAIL tìm theo SĐT'; end if;
  -- SĐT 602 gắn với cả s1 và s2 → chỉ ra s1
  if (select count(*) from public.league_staff_search('0900000602')) <> 1 then raise exception 'FAIL SĐT lộ học viên chưa thi'; end if;
  if (select x.id from public.league_staff_search(lower(card1)) x) is distinct from s1 then raise exception 'FAIL tìm theo mã sổ'; end if;
  if (select x.id from public.league_staff_search('https://app.vncentre.net/p/' || card1) x) is distinct from s1 then
    raise exception 'FAIL tìm theo link QR';
  end if;
  if (select x.birth_year from public.league_staff_search(code1) x) <> 2016 or (select x.stages_count from public.league_staff_search(code1) x) <> 1 then
    raise exception 'FAIL năm sinh / số chặng trong kết quả tìm';
  end if;
  if exists (select 1 from public.league_staff_search('test ls gop') x where x.id = s4)
     or not exists (select 1 from public.league_staff_search('test ls gop') x where x.id = s5) then
    raise exception 'FAIL hồ sơ đã gộp phải quy về hồ sơ đích';
  end if;

  ------------------------------------------------------------------ mở hồ sơ + audit
  perform pg_temp.act_as(null);
  select count(*) into v_audit from public.audit_logs where action = 'league_staff_view';
  perform pg_temp.act_as(ls);
  r := public.league_staff_student(s1);
  if not (r ->> 'student_code' = code1 and r ->> 'full_name' = 'Test Lý Bờ Tê Xê' and (r ->> 'birth_year')::int = 2016
          and r ->> 'school' = 'TH Test LS' and r #>> '{passports,0,passport_code}' = card1
          and jsonb_array_length(r -> 'guardians') = 2 and r #>> '{guardians,0,phone}' = '+84900000601'
          and r #>> '{guardians,0,relationship}' = 'mother' and r #>> '{guardians,1,full_name}' = 'Test PH LS Hai'
          and (r #>> '{league,stages_count}')::int = 1 and (r #>> '{league,stages,0,to_par}')::int = -2
          and r #>> '{league,stages,0,group}' = 'Bảng U10') then
    raise exception 'FAIL hồ sơ rút gọn: %', r;
  end if;
  if r::text like '%2016-02-03%' or r::text like '%ph-ls@example.test%'
     or r ? 'date_of_birth' or r ? 'claim_code' or r -> 'guardians' -> 0 ? 'email' then
    raise exception 'FAIL lộ ngày sinh / email / ghi chú: %', r;
  end if;
  perform pg_temp.act_as(null);
  if (select count(*) from public.audit_logs where action = 'league_staff_view') <> v_audit + 1
     or not exists (select 1 from public.audit_logs where action = 'league_staff_view' and actor_user_id = ls and entity_id = s1) then
    raise exception 'FAIL không ghi audit khi BTC mở hồ sơ';
  end if;

  perform pg_temp.act_as(ls);
  r := public.league_staff_student(s3);
  if r ->> 'id' <> s3::text or r -> 'league' <> 'null'::jsonb then raise exception 'FAIL hồ sơ chờ ghép: %', r; end if;
  r := public.league_staff_student(s4);
  if r ->> 'id' <> s5::text then raise exception 'FAIL mở bằng id đã gộp phải ra hồ sơ đích: %', r; end if;

  -- học viên chưa từng thi: bị chặn, không ghi audit; id bịa cũng cùng lỗi
  perform pg_temp.act_as(null);
  select count(*) into v_audit from public.audit_logs where action = 'league_staff_view';
  perform pg_temp.act_as(ls);
  ok := false;
  begin perform public.league_staff_student(s2); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL BTC mở được học viên chưa thi SNAG'; end if;
  ok := false;
  begin perform public.league_staff_student(gen_random_uuid()); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL id không tồn tại phải báo không có quyền'; end if;
  perform pg_temp.act_as(null);
  if (select count(*) from public.audit_logs where action = 'league_staff_view') <> v_audit then
    raise exception 'FAIL ghi audit cho lần mở bị chặn';
  end if;

  ------------------------------------------------------------------ đọc / ghi thẳng bảng: bị chặn bởi RLS
  perform pg_temp.act_as(ls);
  if (select count(*) from public.students) <> 0 or (select count(*) from public.guardians) <> 0
     or (select count(*) from public.student_guardians) <> 0 or (select count(*) from public.tournament_results) <> 0
     or (select count(*) from public.passports) <> 0 or (select count(*) from public.league_issue_requests) <> 0
     or (select count(*) from public.audit_logs) <> 0 then
    raise exception 'FAIL BTC đọc thẳng được bảng';
  end if;
  update public.students set full_name = 'Sua' where id = s1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL BTC sửa được học viên'; end if;
  ok := false;
  begin insert into public.students (full_name) values ('Test LS Them'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL BTC thêm được học viên'; end if;
  -- hàm nội bộ không gọi thẳng được
  ok := false;
  begin perform public.league_student_summary(s2); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL gọi thẳng được league_student_summary'; end if;
  ok := false;
  begin perform public.league_staff_can_view(s2); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL gọi thẳng được league_staff_can_view'; end if;
  if not public.is_league_staff() then raise exception 'FAIL is_league_staff'; end if;

  ------------------------------------------------------------------ người khác
  foreach v_role in array array[coach, ls_off] loop
    perform pg_temp.act_as(v_role);
    ok := false;
    begin perform public.league_staff_search('test'); exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception 'FAIL % tìm được VĐV', v_role; end if;
    ok := false;
    begin perform public.league_staff_student(s1); exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception 'FAIL % mở được hồ sơ VĐV', v_role; end if;
  end loop;
  perform pg_temp.as_anon();
  ok := false;
  begin perform public.league_staff_search('test'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL khách chưa đăng nhập gọi được league_staff_search'; end if;

  perform pg_temp.act_as(adm);
  if (select count(*) from public.league_staff_search('test ly')) <> 2 then raise exception 'FAIL admin tìm'; end if;

  perform pg_temp.act_as(null);
  raise exception 'ALL_OK';
end $$;
