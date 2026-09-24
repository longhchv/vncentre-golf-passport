-- Kiểm thử kích hoạt bằng mã sổ (Bước 7, F2): luồng A (tin cậy / xác nhận ngày sinh), luồng B (khớp / tạo mới),
-- R1 (một lần), R11, D31 (đã có người giám hộ khác), khoá khi sai ngày sinh, khoá IP khi dò mã, D32.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  else
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
  end if;
end $f$;

do $$
declare
  pa uuid := gen_random_uuid();   -- phụ huynh có SĐT trùng danh sách trường
  pb uuid := gen_random_uuid();   -- phụ huynh không có trong danh sách
  pc uuid := gen_random_uuid();   -- người khác
  adm uuid := gen_random_uuid();
  school uuid; tier_first uuid; tier_player uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid;
  g_imp uuid;
  c1 text; c2 text; c3 text; c4 text; c5 text; c6 text;
  r jsonb; n int; ok boolean; t0 timestamptz;
begin
  insert into auth.users (id, instance_id, aud, role, email, phone, phone_confirmed_at, email_confirmed_at) values
    (pa, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '84900001111', now(), null),
    (pb, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '84900002222', now(), null),
    (pc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '84900003333', now(), null),
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-act-admin@example.test', null, null, now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.guardians (user_id, full_name, phone) values
    (pa, 'Test PH A', '+84900001111'), (pb, 'Test PH B', '+84900002222'), (pc, 'Test PH C', '+84900003333');

  select id into school from public.schools order by created_at limit 1;
  select id into tier_first from public.passport_tiers where code = 'first';
  select id into tier_player from public.passport_tiers where code = 'player';

  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Kich Hoat Mot', '2018-02-03', school) returning id into s1;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Kich Hoat Hai', '2017-04-05', school) returning id into s2;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Kich Hoat Ba', '2016-06-07', school) returning id into s3;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Kich Hoat Bon', '2019-08-09', school) returning id into s4;
  -- Người giám hộ nhập từ danh sách trường (chưa có tài khoản), cùng SĐT với phụ huynh A
  insert into public.guardians (full_name, phone) values ('Test PH nhap', '+84900001111') returning id into g_imp;
  insert into public.student_guardians (student_id, guardian_id, linked_via) values (s1, g_imp, 'import');

  insert into public.passports (tier_id, status, student_id, issued_at) values (tier_first, 'assigned', s1, now()) returning passport_code into c1;
  insert into public.passports (tier_id, status, student_id, issued_at) values (tier_first, 'assigned', s2, now()) returning passport_code into c2;
  insert into public.passports (tier_id, status) values (tier_first, 'unassigned') returning passport_code into c3;
  insert into public.passports (tier_id, status) values (tier_first, 'unassigned') returning passport_code into c4;
  insert into public.passports (tier_id, status, student_id, issued_at) values (tier_player, 'assigned', s1, now()) returning passport_code into c5;
  insert into public.passports (tier_id, status, student_id, issued_at) values (tier_first, 'assigned', s3, now()) returning passport_code into c6;

  -- 1. Chưa đăng nhập: tra mã → tên che bớt, không lộ mã học viên
  perform pg_temp.act_as(null);
  execute 'set local role anon';
  r := public.passport_lookup(lower(c1));
  if r ->> 'masked_name' <> 'Test K. H. M.' or r ->> 'student_id' is not null or r ->> 'status' <> 'assigned' then
    raise exception 'FAIL tra mã công khai: %', r;
  end if;
  if public.passport_lookup('ZZZZZZZZ') ->> 'result' <> 'not_found' then raise exception 'FAIL mã sai'; end if;
  ok := false;
  begin perform public.activation_start(c1); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: khách gọi được activation_start'; end if;

  -- 2. Luồng A, phụ huynh A: SĐT trùng danh sách trường → tin cậy, không hỏi ngày sinh (D30, D33)
  perform pg_temp.act_as(pa);
  r := public.activation_start(c1);
  if (r ->> 'trusted')::boolean is not true then raise exception 'FAIL D33: phụ huynh A không được tin cậy: %', r; end if;
  ok := false;
  begin
    perform public.activation_complete(c1, '{"relationship":"mother","consents":{"terms":false,"privacy":true}}');
  exception when invalid_parameter_value then ok := true;
  end;
  if not ok then raise exception 'FAIL: kích hoạt không cần đồng ý điều khoản'; end if;
  r := public.activation_complete(c1, '{"relationship":"mother","consents":{"terms":true,"privacy":true,"leaderboard_name":false},"child":{"gender":"female","golf_goals":["health","family"]}}');
  if r ->> 'link_status' <> 'active' then raise exception 'FAIL luồng A: %', r; end if;
  perform pg_temp.act_as(null);
  if (select status from public.passports where passport_code = c1) <> 'active' then raise exception 'FAIL: sổ chưa active'; end if;
  select activated_at into t0 from public.students where id = s1;
  if t0 is null then raise exception 'FAIL: students.activated_at chưa ghi'; end if;
  if (select golf_goals from public.students where id = s1) <> array['health', 'family'] then raise exception 'FAIL: mục tiêu golf'; end if;
  if (select count(*) from public.consents where guardian_id = (select id from public.guardians where user_id = pa)) <> 3 then
    raise exception 'FAIL: chưa lưu đồng ý';
  end if;

  -- 3. R1: sổ đã kích hoạt không kích hoạt lại được
  perform pg_temp.act_as(pb);
  ok := false;
  begin perform public.activation_complete(c1, '{"relationship":"father","consents":{"terms":true,"privacy":true}}');
  exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL R1: kích hoạt lại sổ đã active'; end if;
  r := public.passport_lookup(c1);
  if r ->> 'relation' <> 'none' or r ->> 'status' <> 'active' then raise exception 'FAIL: người khác thấy quan hệ %', r; end if;

  -- 4. D31: học viên đã có người giám hộ khác → người lạ không tự nối qua sổ thứ hai
  r := public.activation_start(c5);
  if r ->> 'blocked' <> 'other_guardian' then raise exception 'FAIL D31: %', r; end if;

  -- 5. Luồng A, phụ huynh B: phải xác nhận ngày sinh
  r := public.activation_start(c2);
  if r ->> 'identity' <> 'dob' then raise exception 'FAIL: không hỏi ngày sinh: %', r; end if;
  r := public.activation_verify_identity(c2, '2017-01-01');
  if (r ->> 'ok')::boolean or (r ->> 'attempts_left')::int <> 4 then raise exception 'FAIL: sai ngày sinh %', r; end if;
  ok := false;
  begin perform public.activation_complete(c2, '{"identity_answer":"2017-01-02","relationship":"father","consents":{"terms":true,"privacy":true}}');
  exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: kích hoạt được với ngày sinh sai'; end if;
  r := public.activation_complete(c2, '{"identity_answer":"2017-04-05","relationship":"father","consents":{"terms":true,"privacy":true}}');
  if r ->> 'link_status' <> 'active' then raise exception 'FAIL luồng A có ngày sinh: %', r; end if;

  -- 6. Sai ngày sinh 5 lần → khoá mã, báo admin
  perform pg_temp.act_as(pc);
  for i in 1..5 loop perform public.activation_verify_identity(c6, '2000-01-01'); end loop;
  r := public.activation_start(c6);
  if r ->> 'blocked' <> 'identity_locked' then raise exception 'FAIL: không khoá sau 5 lần sai: %', r; end if;
  ok := false;
  begin perform public.activation_complete(c6, '{"identity_answer":"2016-06-07","relationship":"other","consents":{"terms":true,"privacy":true}}');
  exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: mã đã khoá vẫn kích hoạt được'; end if;
  perform pg_temp.act_as(null);
  if not exists (select 1 from public.notifications where user_id = adm and type = 'activation_locked') then
    raise exception 'FAIL: chưa báo admin khi khoá mã';
  end if;

  -- 7. Luồng B khớp đúng 1 em → liên kết chờ xác nhận; thẻ con chỉ có tên + level (D32)
  perform pg_temp.act_as(pb);
  r := public.activation_complete(c3, jsonb_build_object('relationship', 'father',
        'consents', jsonb_build_object('terms', true, 'privacy', true),
        'child', jsonb_build_object('full_name', 'TEST KÍCH HOẠT BỐN', 'date_of_birth', '2019-08-09', 'school_id', school, 'grade_class', '1A1')));
  if r ->> 'link_status' <> 'pending_confirmation' or not (r ->> 'matched')::boolean or (r ->> 'student_id')::uuid <> s4 then
    raise exception 'FAIL luồng B khớp: %', r;
  end if;
  select count(*) into n from public.my_children() c where c.student_id = s4 and c.student_code is null and c.level_number = 1 and c.school_name is null;
  if n <> 1 then raise exception 'FAIL D32: thẻ con chờ duyệt lộ thông tin'; end if;
  select count(*) into n from public.my_children();
  if n <> 2 then raise exception 'FAIL: phụ huynh B có % con (mong đợi 2)', n; end if;

  -- 8. Luồng B không khớp → tạo học viên mới chờ xác minh
  perform pg_temp.act_as(pc);
  r := public.activation_complete(c4, jsonb_build_object('relationship', 'guardian',
        'consents', jsonb_build_object('terms', true, 'privacy', true),
        'child', jsonb_build_object('full_name', 'Test Em Moi Tu Khai', 'date_of_birth', '2018-12-12', 'school_text', 'Trường ngoài hệ thống')));
  perform pg_temp.act_as(null);
  if (select verification_status || '|' || (self_reported ->> 'school_text') from public.students where id = (r ->> 'student_id')::uuid)
       <> 'pending_review|Trường ngoài hệ thống' then
    raise exception 'FAIL luồng B tạo mới: %', r;
  end if;

  -- 9. Lên cấp hộ chiếu: phụ huynh A kích hoạt sổ Player → sổ First thành "cấp trước"; R11 giữ ngày kích hoạt đầu
  perform pg_temp.act_as(pa);
  perform public.activation_complete(c5, '{"relationship":"mother","consents":{"terms":true,"privacy":true}}');
  perform pg_temp.act_as(null);
  if (select status from public.passports where passport_code = c1) <> 'retired' then raise exception 'FAIL: sổ cũ không chuyển retired'; end if;
  if (select activated_at from public.students where id = s1) <> t0 then raise exception 'FAIL R11'; end if;
  select count(*) into n from public.passports where student_id = s1 and status = 'active';
  if n <> 1 then raise exception 'FAIL R2: % sổ active', n; end if;

  -- 10. Dò mã: quá 10 lần sai/giờ cùng IP → khoá
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.77"}', true);
  execute 'set local role anon';
  for i in 1..10 loop perform public.passport_lookup('WRONG' || i); end loop;
  if public.passport_lookup(c2) ->> 'result' <> 'locked' then raise exception 'FAIL: không khoá IP sau 10 lần sai'; end if;
  execute 'reset role';

  raise exception 'ALL_OK';
end $$;
