-- Kịch bản nghiệm thu 15: nhật ký hệ thống ghi đủ thao tác của kịch bản 6 (duyệt lịch sử), 8 (thu hồi chứng nhận),
-- 9 (báo mất sổ, thanh toán, gán sổ mới), 14 (gộp hồ sơ) — kèm người thực hiện.
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
  par uuid := gen_random_uuid();
  school uuid; tier uuid; batch uuid; tpl uuid; s1 uuid; s2 uuid; g1 uuid; ch uuid; cid uuid; p_old uuid; p_new uuid; code_new text; oid uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s15b-adm@example.test', now()),
    (par, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s15b-par@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  select id into school from public.schools order by created_at limit 1;
  select id into tier from public.passport_tiers order by level_from limit 1;
  select id into tpl from public.certificate_templates where type = 'course_completion';
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Nhat Ky', '2016-01-01', school) returning id into s1;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Nhật Ký', '2016-01-01', school) returning id into s2;
  insert into public.guardians (user_id, full_name) values (par, 'PH') returning id into g1;
  insert into public.student_guardians (student_id, guardian_id, is_primary, can_manage, status) values (s1, g1, true, true, 'active');
  insert into public.course_history (student_id, course_name, source, status) values (s1, 'Khoá chờ duyệt', 'admin', 'pending_review') returning id into ch;

  perform pg_temp.act_as(adm);
  -- 6: duyệt lịch sử
  perform public.review_items('course_history', array[ch], 'approve');
  -- 8: phát hành rồi thu hồi chứng nhận
  cid := (public.certificate_issue(tpl, array[s1], '{"program":"Test"}') -> 'certificate_ids' ->> 0)::uuid;
  perform public.revoke_certificate(cid, 'Kiểm thử nhật ký');
  -- 9: báo mất (phụ huynh), thanh toán (webhook), gán sổ mới (admin)
  batch := public.create_passport_batch('Test S15', tier, 2, 'decal');
  perform pg_temp.act_as(null);
  select id into p_old from public.passports where batch_id = batch order by passport_code limit 1;
  select id, passport_code into p_new, code_new from public.passports where batch_id = batch and id <> p_old;
  update public.passports set student_id = s1, status = 'active', issued_at = now() where id = p_old;
  perform pg_temp.act_as(par);
  oid := public.report_lost_passport(p_old);
  perform pg_temp.act_as(null);
  execute 'set local role service_role';
  perform public.mark_order_paid((select order_code from public.orders where id = oid), 200000, 'AUDIT');
  perform pg_temp.act_as(adm);
  perform public.assign_passport(code_new, s1);
  -- 14: gộp
  perform public.merge_students(s1, s2);
  perform pg_temp.act_as(null);

  if not exists (select 1 from public.audit_logs where entity_type = 'course_history' and entity_id = ch and actor_user_id = adm and after ->> 'status' = 'approved') then
    raise exception 'FAIL 15/6: không có nhật ký duyệt lịch sử';
  end if;
  if not exists (select 1 from public.audit_logs where entity_type = 'certificates' and entity_id = cid and actor_user_id = adm and after ->> 'status' = 'revoked') then
    raise exception 'FAIL 15/8: không có nhật ký thu hồi chứng nhận';
  end if;
  if not exists (select 1 from public.audit_logs where entity_type = 'passports' and entity_id = p_old and actor_user_id = par and after ->> 'status' = 'lost') then
    raise exception 'FAIL 15/9: không có nhật ký báo mất sổ';
  end if;
  if not exists (select 1 from public.audit_logs where entity_type = 'orders' and entity_id = oid and after ->> 'status' = 'paid') then
    raise exception 'FAIL 15/9: không có nhật ký thanh toán';
  end if;
  if not exists (select 1 from public.audit_logs where entity_type = 'passports' and entity_id = p_new and actor_user_id = adm and after ->> 'status' = 'assigned') then
    raise exception 'FAIL 15/9: không có nhật ký gán sổ mới';
  end if;
  if not exists (select 1 from public.audit_logs where action = 'student.merge' and entity_id = s1 and actor_user_id = adm) then
    raise exception 'FAIL 15/14: không có nhật ký gộp hồ sơ';
  end if;
  raise exception 'ALL_OK';
end $$;
