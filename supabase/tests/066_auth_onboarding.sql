-- Kiểm thử giai đoạn 3 (migration 20261127000090): bước Chào mừng sinh mã VNC đúng một lần; tài khoản con không bị sinh
-- hồ sơ; SĐT chưa xác thực; link giới thiệu bằng mã VNC ghi đúng người giới thiệu, một lần, không sửa được.
-- Quy ước: chạy trong một khối DO; thành công thì raise 'ALL_OK' để toàn bộ dữ liệu thử bị huỷ.

do $$
declare
  ua uuid := gen_random_uuid();   -- người giới thiệu (đăng nhập Google, có tên từ Google)
  ub uuid := gen_random_uuid();   -- người mới qua link giới thiệu
  uc uuid := gen_random_uuid();   -- tài khoản con (tên + PIN)
  ud uuid := gen_random_uuid();   -- phụ huynh đăng ký bằng SĐT, chưa xác thực SĐT
  child uuid;
  j jsonb; r1 jsonb; r2 jsonb;
  code_a text;
  n int;
  ok boolean;
begin
  update public.app_settings set value = to_jsonb((now() - interval '1 minute')::text) where key = 'auth.onboarding_from';

  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-onb-a@example.test', now(),
          '{"name": "Test Google Name"}'),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-onb-b@example.test', now(), '{}'),
         (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-onb-c@example.test', now(), '{}');
  insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_user_meta_data)
  values (ud, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '84900000123', null, '{}');

  -- Hồ sơ tự tạo, tên lấy từ OAuth (name); SĐT chưa xác thực
  if (select full_name from public.profiles where user_id = ua) <> 'Test Google Name' then raise exception 'FAIL: tên từ OAuth'; end if;
  if (select phone_verified from public.profiles where user_id = ud) or (select phone from public.profiles where user_id = ud) <> '+84900000123' then
    raise exception 'FAIL: SĐT chưa xác thực';
  end if;
  update auth.users set phone_confirmed_at = now() where id = ud;
  if not (select phone_verified from public.profiles where user_id = ud) then raise exception 'FAIL: SĐT đã xác thực'; end if;

  -- Tài khoản con
  insert into public.students (full_name, date_of_birth) values ('Test Onb Child', date '2015-05-01') returning id into child;
  insert into public.student_accounts (student_id, user_id, username) values (child, uc, 'test.onb.child');

  ---------------------------------------------------------------------------
  -- Người A: cần bước Chào mừng → gửi 2 lần → một hồ sơ, một mã
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  execute 'set local role authenticated';

  j := public.auth_my_identity();
  if not (j ->> 'needs_onboarding')::boolean or j ->> 'student_code' is not null then raise exception 'FAIL: A phải qua bước Chào mừng %', j; end if;
  ok := false;
  begin perform public.auth_onboard('A', 2010, 'adult'); exception when others then ok := sqlerrm = 'name_required'; end;
  if not ok then raise exception 'FAIL: tên quá ngắn'; end if;
  ok := false;
  begin perform public.auth_onboard('Test Onb A', 1800, 'adult'); exception when others then ok := sqlerrm = 'birth_year_invalid'; end;
  if not ok then raise exception 'FAIL: năm sinh sai'; end if;

  r1 := public.auth_onboard('Test Onb A', 1985, 'adult');
  r2 := public.auth_onboard('Test Onb A Sửa', 1986, 'adult');   -- đăng nhập lại / bấm lại
  if not (r1 ->> 'created')::boolean or (r2 ->> 'created')::boolean or r1 ->> 'student_code' <> r2 ->> 'student_code'
     or r1 ->> 'student_code' !~ '^VNC-0\d{5}$' then
    raise exception 'FAIL: một tài khoản một mã % %', r1, r2;
  end if;
  code_a := r1 ->> 'student_code';
  j := public.auth_my_identity();
  if (j ->> 'needs_onboarding')::boolean or j ->> 'student_code' <> code_a or j ->> 'account_kind' <> 'adult' then
    raise exception 'FAIL: sau Chào mừng %', j;
  end if;
  -- Không tự sửa năm sinh / loại tài khoản ngoài bước Chào mừng
  ok := false;
  begin update public.profiles set birth_year = 2000 where user_id = ua;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: tự sửa năm sinh'; end if;
  execute 'reset role';
  select count(*) into n from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where g.user_id = ua and sg.relationship = 'self' and sg.deleted_at is null;
  if n <> 1 then raise exception 'FAIL: A có % hồ sơ self', n; end if;

  ---------------------------------------------------------------------------
  -- Tài khoản con: không cần Chào mừng, không được tạo hồ sơ
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uc::text, true);
  execute 'set local role authenticated';
  if (public.auth_my_identity() ->> 'needs_onboarding')::boolean then raise exception 'FAIL: tài khoản con bị hỏi Chào mừng'; end if;
  ok := false;
  begin perform public.auth_onboard('Test Onb Child', 2015, 'student'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: tài khoản con tạo được hồ sơ'; end if;
  execute 'reset role';

  ---------------------------------------------------------------------------
  -- Người B qua link /r/<mã VNC của A>: ghi đúng A, một lần, không sửa được
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ub::text, true);
  execute 'set local role authenticated';
  j := public.referral_claim(lower(replace(code_a, '-', '')));      -- 'vnc0xxxxx' cũng nhận
  if not (j ->> 'ok')::boolean then raise exception 'FAIL: giới thiệu bằng mã VNC %', j; end if;
  j := public.referral_claim(code_a);
  if j ->> 'reason' <> 'already_linked' then raise exception 'FAIL: ghi giới thiệu lần hai %', j; end if;
  j := public.referral_claim('VNC-999999');
  execute 'reset role';
  if (select referrer_user_id from public.referral_links where referred_user_id = ub) <> ua
     or (select code from public.referral_links where referred_user_id = ub) <> code_a then
    raise exception 'FAIL: lưu sai người giới thiệu';
  end if;
  perform set_config('request.jwt.claim.sub', ub::text, true);
  ok := false;
  begin update public.referral_links set referrer_user_id = ud where referred_user_id = ub;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: sửa được người giới thiệu'; end if;
  -- Tự giới thiệu chính mình
  perform set_config('request.jwt.claim.sub', ua::text, true);
  if public.referral_claim(code_a) ->> 'reason' <> 'own_code' then raise exception 'FAIL: tự giới thiệu'; end if;

  raise exception 'ALL_OK';
end $$;
