-- Kiểm thử sổ Passport (Bước 5, F11): tạo lô, mã đúng định dạng/không trùng, gán lẻ, gán hàng loạt,
-- chặn gán thêm sổ cùng cấp, huỷ sổ bắt buộc lý do, R2 (một sổ active).
do $$
declare
  admin_u uuid := gen_random_uuid();
  coach_u uuid := gen_random_uuid();
  tier_first uuid;
  tier_player uuid;
  school uuid;
  program uuid;
  cls uuid;
  batch uuid;
  batch2 uuid;
  s1 uuid;
  s2 uuid;
  s3 uuid;
  code1 text;
  n int;
  ok boolean;
  r jsonb;
  v_months int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (admin_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-pp-admin@example.test', now()),
    (coach_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-pp-coach@example.test', now());
  insert into public.user_roles (user_id, role) values (admin_u, 'admin'), (coach_u, 'coach');
  select id into tier_first from public.passport_tiers where code = 'first';
  select id into tier_player from public.passport_tiers where code = 'player';
  select validity_months into v_months from public.passport_tiers where code = 'first';
  select id into school from public.schools order by created_at limit 1;
  select id into program from public.programs where code = 'core20';

  insert into public.classes (name, school_id, program_id) values ('TEST pp', school, program) returning id into cls;
  insert into public.students (full_name, current_school_id) values ('Test Pp A', school) returning id into s1;
  insert into public.students (full_name, current_school_id) values ('Test Pp B', school) returning id into s2;
  insert into public.students (full_name, current_school_id) values ('Test Pp C', school) returning id into s3;
  insert into public.enrollments (student_id, class_id) values (s1, cls), (s2, cls), (s3, cls);

  -- HLV không tạo được lô
  perform set_config('request.jwt.claims', json_build_object('sub', coach_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', coach_u::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin
    perform public.create_passport_batch('hack', tier_first, 5, 'decal');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: HLV tạo được lô mã'; end if;
  execute 'reset role';

  -- Admin
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  execute 'set local role authenticated';

  batch := public.create_passport_batch('TEST lô decal', tier_first, 50, 'decal');
  select count(*) into n from public.passports where batch_id = batch and status = 'unassigned';
  if n <> 50 then raise exception 'FAIL: lô có % sổ (mong đợi 50)', n; end if;
  select count(*) into n from public.passports where batch_id = batch and passport_code !~ '^[23456789A-HJ-NP-Z]{8}$';
  if n <> 0 then raise exception 'FAIL: % mã sai bảng chữ', n; end if;
  select count(distinct passport_code) into n from public.passports where batch_id = batch;
  if n <> 50 then raise exception 'FAIL: mã bị trùng'; end if;

  -- Gán lẻ (gõ mã có gạch, chữ thường)
  select passport_code into code1 from public.passports where batch_id = batch order by passport_code limit 1;
  r := public.assign_passport(lower(substr(code1, 1, 4) || '-' || substr(code1, 5)), s1);
  if (select status from public.passports where passport_code = code1) <> 'assigned' then raise exception 'FAIL: gán lẻ'; end if;
  if (select expires_at::date - issued_at::date from public.passports where passport_code = code1)
       not between v_months * 28 and v_months * 31 + 1 then
    raise exception 'FAIL: expires_at không bằng issued_at + % tháng', v_months;
  end if;

  -- Gán lại cùng em → không lỗi (đã gán); gán sổ khác cùng cấp cho em đó → bị chặn
  r := public.assign_passport(code1, s1);
  if not (r ->> 'already')::boolean then raise exception 'FAIL: gán lại cùng em không trả already'; end if;
  ok := false;
  begin
    perform public.assign_passport((select passport_code from public.passports where batch_id = batch and status = 'unassigned' limit 1), s1);
  exception when invalid_parameter_value then ok := true;
  end;
  if not ok then raise exception 'FAIL: gán được 2 sổ First cho một em'; end if;

  -- Sổ đã gán cho em A không gán được cho em B
  ok := false;
  begin
    perform public.assign_passport(code1, s2);
  exception when invalid_parameter_value then ok := true;
  end;
  if not ok then raise exception 'FAIL: sổ đã gán lại gán được cho em khác'; end if;

  -- Mã không tồn tại
  ok := false;
  begin
    perform public.assign_passport('ZZZZZZZZ', s2);
  exception when no_data_found then ok := true;
  end;
  if not ok then raise exception 'FAIL: mã không tồn tại không báo lỗi'; end if;

  -- Gán hàng loạt: A đã có sổ → already_has; B, C được gán
  select count(*) into n from public.assign_passports_bulk(cls, batch) where result = 'assigned';
  if n <> 2 then raise exception 'FAIL: gán hàng loạt % em (mong đợi 2)', n; end if;
  select count(*) into n from public.assign_passports_bulk(cls, batch) where result = 'already_has';
  if n <> 3 then raise exception 'FAIL: chạy lại gán hàng loạt không nhận ra em đã có sổ'; end if;

  -- Lô hết sổ
  batch2 := public.create_passport_batch('TEST lô nhỏ', tier_player, 1, 'variable_print');
  select count(*) into n from public.assign_passports_bulk(cls, batch2) where result = 'batch_empty';
  if n <> 2 then raise exception 'FAIL: lô 1 sổ cho 3 em phải báo hết sổ 2 em (được %)', n; end if;

  -- Huỷ sổ: bắt buộc lý do; sổ active không huỷ được
  ok := false;
  begin
    perform public.void_passport((select id from public.passports where passport_code = code1), '  ');
  exception when invalid_parameter_value then ok := true;
  end;
  if not ok then raise exception 'FAIL: huỷ sổ không cần lý do'; end if;
  perform public.void_passport((select id from public.passports where passport_code = code1), 'In lỗi');
  if (select status || '|' || void_reason from public.passports where passport_code = code1) <> 'void|In lỗi' then
    raise exception 'FAIL: huỷ sổ';
  end if;
  if not exists (select 1 from public.audit_logs where entity_type = 'passports' and reason = 'In lỗi') then
    raise exception 'FAIL: nhật ký không ghi lý do huỷ sổ';
  end if;
  execute 'reset role';

  -- R2: hai sổ active cho cùng một em bị chặn ở CSDL
  update public.passports set status = 'active' where student_id = s2 and tier_id = tier_first;
  ok := false;
  begin
    update public.passports set status = 'active', student_id = s2
    where id = (select id from public.passports where batch_id = batch and status = 'unassigned' limit 1);
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL R2: một em có 2 sổ active'; end if;

  raise exception 'ALL_OK';
end $$;
