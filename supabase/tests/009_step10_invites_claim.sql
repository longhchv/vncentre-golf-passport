-- Kiểm thử Bước 10: mã kích hoạt trên chứng nhận (F4) và link mời (F3).
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

do $$
declare
  adm uuid := gen_random_uuid();
  pa uuid := gen_random_uuid();   -- SĐT được mời
  pb uuid := gen_random_uuid();   -- số khác
  school uuid; s1 uuid; s2 uuid; g_imp uuid; claim text; claim_old text; tok text := 'testtoken' || md5(random()::text);
  r jsonb; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, phone, phone_confirmed_at, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s10-adm@example.test', null, null, now()),
    (pa, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '84900007777', now(), null),
    (pb, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '84900008888', now(), null);
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  select id into school from public.schools order by created_at limit 1;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Ma Chung Nhan', '2017-07-07', school) returning id, claim_code into s1, claim;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Loi Moi', '2018-08-08', school) returning id into s2;

  ------------------------------------------------------------------ F4
  perform pg_temp.act_as(null);
  execute 'set local role anon';
  if public.passport_lookup(claim) ->> 'result' <> 'claim' then raise exception 'FAIL: /activate không nhận ra mã chứng nhận'; end if;
  r := public.claim_lookup(lower(claim));
  if r ->> 'result' <> 'ok' or (r ->> 'used')::boolean or r ->> 'masked_name' <> 'Test M. C. N.' then raise exception 'FAIL claim_lookup: %', r; end if;

  -- Admin tạo lại mã → mã cũ mất hiệu lực
  perform pg_temp.act_as(adm);
  claim_old := claim;
  claim := public.regenerate_claim_code(s1);
  perform pg_temp.act_as(pb);
  ok := false;
  begin perform public.claim_start(claim_old); exception when no_data_found then ok := true; end;
  if not ok then raise exception 'FAIL: mã cũ vẫn dùng được'; end if;

  r := public.claim_start(claim);
  if r ->> 'identity' <> 'dob' then raise exception 'FAIL: mã chứng nhận không hỏi ngày sinh: %', r; end if;
  ok := false;
  begin perform public.claim_complete(claim, '{"identity_answer":"2017-01-01","relationship":"father","consents":{"terms":true,"privacy":true}}');
  exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: kích hoạt với ngày sinh sai'; end if;
  r := public.claim_complete(claim, '{"identity_answer":"2017-07-07","relationship":"father","consents":{"terms":true,"privacy":true}}');
  if r ->> 'link_status' <> 'active' then raise exception 'FAIL claim_complete: %', r; end if;
  if (public.student_profile(s1) ->> 'viewer') <> 'guardian' then raise exception 'FAIL: không thấy hồ sơ sau khi kích hoạt bằng mã'; end if;
  -- R1: dùng một lần
  perform pg_temp.act_as(pa);
  ok := false;
  begin perform public.claim_start(claim); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL R1: mã chứng nhận dùng được hai lần'; end if;
  perform pg_temp.act_as(null);
  if (select claim_code_used_at from public.students where id = s1) is null
     or (select linked_via from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where sg.student_id = s1 and g.user_id = pb) <> 'claim_code' then
    raise exception 'FAIL: chưa ghi claim_code_used_at / linked_via';
  end if;

  ------------------------------------------------------------------ F3
  insert into public.guardians (full_name, phone) values ('Test PH moi', '+84900007777') returning id into g_imp;
  insert into public.student_guardians (student_id, guardian_id, linked_via) values (s2, g_imp, 'import');
  insert into public.invitations (guardian_id, student_id, channel, target, token, status, expires_at)
  values (g_imp, s2, 'zalo', '+84900007777', tok, 'sent', now() + interval '30 days');

  execute 'set local role anon';
  r := public.invitation_lookup(tok);
  if r ->> 'result' <> 'ok' or r ->> 'masked_target' <> '+849****777' then raise exception 'FAIL invitation_lookup: %', r; end if;

  -- Số khác → "Link này dành cho số điện thoại khác"
  perform pg_temp.act_as(pb);
  ok := false;
  begin perform public.invitation_start(tok); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: số khác mở được link mời'; end if;

  -- Đúng số → không hỏi ngày sinh, hoàn tất
  perform pg_temp.act_as(pa);
  r := public.invitation_start(tok);
  if not (r ->> 'trusted')::boolean then raise exception 'FAIL: đúng số mà vẫn hỏi xác nhận'; end if;
  r := public.invitation_complete(tok, '{"relationship":"mother","consents":{"terms":true,"privacy":true},"child":{"golf_goals":["health"]}}');
  if (public.student_profile(s2) ->> 'viewer') <> 'guardian' then raise exception 'FAIL: phụ huynh được mời chưa thấy con'; end if;
  ok := false;
  begin perform public.invitation_start(tok); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL R1: link mời dùng được hai lần'; end if;
  perform pg_temp.act_as(null);
  if (select activated_at from public.students where id = s2) is null then raise exception 'FAIL: chưa ghi ngày kích hoạt'; end if;
  if (select user_id from public.guardians where id = g_imp) <> pa then raise exception 'FAIL: người giám hộ nhập sẵn chưa nối tài khoản'; end if;

  raise exception 'ALL_OK';
end $$;
