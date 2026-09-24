-- Kiểm thử Bước 12: phát hành chứng nhận (F9), R9 snapshot, xác thực công khai, thu hồi, quyền xem/tải.
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
  coach uuid := gen_random_uuid();
  par uuid := gen_random_uuid();
  par_noemail uuid := gen_random_uuid();
  kid uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  school uuid; s1 uuid; s2 uuid; g1 uuid; g2 uuid;
  tpl_course uuid; tpl_level uuid; lv1 uuid;
  r jsonb; cid uuid; code text; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, phone, email_confirmed_at, phone_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s12-adm@example.test', null, now(), null),
    (coach, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s12-coach@example.test', null, now(), null),
    (par, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s12-par@example.test', null, now(), null),
    (par_noemail, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '84900012121', null, now()),
    (kid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s12-kid@students.example.test', null, now(), null),
    (stranger, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s12-x@example.test', null, now(), null);
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (coach, 'coach');
  select id into school from public.schools order by created_at limit 1;
  insert into public.students (full_name, date_of_birth, current_school_id, current_grade_class) values ('Test Chứng Nhận', '2016-01-01', school, '3A') returning id into s1;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Chưa Đạt Level', '2016-02-02', school) returning id into s2;
  insert into public.guardians (user_id, full_name) values (par, 'PH co email') returning id into g1;
  insert into public.guardians (user_id, full_name) values (par_noemail, 'PH chua email') returning id into g2;
  insert into public.student_guardians (student_id, guardian_id, is_primary, can_manage, status) values (s1, g1, true, true, 'active'), (s1, g2, false, false, 'active');
  insert into public.student_accounts (student_id, username, user_id) values (s1, 'test.s12kid', kid);
  select id into tpl_course from public.certificate_templates where type = 'course_completion';
  select id into tpl_level from public.certificate_templates where type = 'level_completion';
  select l.id into lv1 from public.levels l join public.programs p on p.id = l.program_id where p.code = 'core20' and l.number = 1;
  insert into public.level_records (student_id, level_id, status, completed_at, source, approval_status)
  values (s1, lv1, 'completed', '2025-05-31', 'admin', 'approved');

  ------------------------------------------------------------------ Quyền phát hành
  perform pg_temp.act_as(coach);
  ok := false;
  begin perform public.certificate_issue(tpl_course, array[s1], '{"program":"X"}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: HLV thường phát hành được chứng nhận'; end if;

  ------------------------------------------------------------------ Xem trước + "Hoàn thành level" chỉ cho em có level đã duyệt
  perform pg_temp.act_as(adm);
  r := public.certificate_issue_preview(tpl_level, array[s1, s2], jsonb_build_object('program', 'SNAG Golf @ School Basic', 'level_id', lv1));
  if r -> 0 ->> 'status' <> 'ok' or r -> 1 ->> 'status' <> 'no_level' then raise exception 'FAIL xem trước: %', r; end if;
  if r -> 0 -> 'data' ->> 'level_label' <> 'Level 1' or r -> 0 -> 'data' ->> 'class_name' <> '3A' then raise exception 'FAIL dữ liệu xem trước: %', r -> 0 -> 'data'; end if;

  r := public.certificate_issue(tpl_level, array[s1, s2], jsonb_build_object('program', 'SNAG Golf @ School Basic', 'level_id', lv1, 'issued_at', '2026-06-01'));
  if (r ->> 'issued')::int <> 1 or r -> 'skipped' -> 0 ->> 'reason' <> 'no_level' then raise exception 'FAIL phát hành: %', r; end if;
  cid := (r -> 'certificate_ids' ->> 0)::uuid;
  select verify_code into code from public.certificates where id = cid;
  if (select data ->> 'verify_url' from public.certificates where id = cid) not like '%/verify/' || code then raise exception 'FAIL: QR không trỏ tới /verify/{mã}'; end if;
  -- Không phát trùng
  r := public.certificate_issue(tpl_level, array[s1], jsonb_build_object('program', 'SNAG Golf @ School Basic', 'level_id', lv1));
  if (r ->> 'issued')::int <> 0 or r -> 'skipped' -> 0 ->> 'reason' <> 'duplicate' then raise exception 'FAIL: phát trùng %', r; end if;
  -- Phụ huynh đã kích hoạt nhận thông báo
  perform pg_temp.act_as(null);
  if (select count(*) from public.notifications where type = 'certificate_issued' and user_id in (par, par_noemail)) <> 2 then
    raise exception 'FAIL: chưa thông báo cho phụ huynh';
  end if;

  ------------------------------------------------------------------ R9: sửa hồ sơ không đổi chứng nhận
  update public.students set full_name = 'Test Tên Đã Đổi', current_grade_class = '4B' where id = s1;
  if (select data ->> 'student_name' from public.certificates where id = cid) <> 'Test Chứng Nhận' then raise exception 'FAIL R9: chứng nhận đổi theo hồ sơ'; end if;

  ------------------------------------------------------------------ Xem / tải
  perform pg_temp.act_as(par);
  r := public.certificate_view(cid);
  if not (r ->> 'can_download')::boolean then raise exception 'FAIL: phụ huynh có email không tải được'; end if;
  perform pg_temp.act_as(par_noemail);
  r := public.certificate_view(cid);
  if (r ->> 'can_download')::boolean or not (r ->> 'needs_email')::boolean then raise exception 'FAIL: phụ huynh chưa có email mà tải được'; end if;
  perform pg_temp.act_as(kid);
  r := public.certificate_view(cid);
  if r ->> 'viewer' <> 'student' or (r ->> 'can_download')::boolean then raise exception 'FAIL: học viên tải được PDF'; end if;
  perform pg_temp.act_as(stranger);
  ok := false;
  begin perform public.certificate_view(cid); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người lạ xem được chứng nhận'; end if;
  -- Không đọc thẳng bảng certificates
  if exists (select 1 from public.certificates) then raise exception 'FAIL: người lạ đọc được bảng certificates'; end if;

  ------------------------------------------------------------------ Xác thực công khai: không lộ ngày sinh, trường, phụ huynh
  perform pg_temp.act_as(null);
  execute 'set local role anon';
  r := public.certificate_verify(lower(substr(code, 1, 5) || '-' || substr(code, 6)));
  if r ->> 'result' <> 'valid' or r ->> 'student_name' <> 'Test Chứng Nhận' then raise exception 'FAIL verify: %', r; end if;
  if r ?| array['date_of_birth', 'school_name', 'class_name', 'guardians', 'phone', 'email', 'data'] or r::text like '%2016-01-01%' then raise exception 'FAIL: trang xác thực lộ thông tin %', r; end if;
  if public.certificate_verify('KHONGCOMA1') ->> 'result' <> 'not_found' then raise exception 'FAIL: mã sai'; end if;

  ------------------------------------------------------------------ Thu hồi
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.revoke_certificate(cid, 'x'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: phụ huynh thu hồi được'; end if;
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.revoke_certificate(cid, ' '); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: thu hồi không lý do'; end if;
  perform public.revoke_certificate(cid, 'Phát nhầm');
  execute 'set local role anon';
  r := public.certificate_verify(code);
  if r ->> 'result' <> 'revoked' or r ->> 'revoked_at' is null then raise exception 'FAIL: xác thực không báo thu hồi %', r; end if;
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.certificate_view(cid); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: phụ huynh vẫn xem/tải chứng nhận đã thu hồi'; end if;
  if jsonb_array_length(public.student_profile(s1) -> 'certificates') <> 0 then raise exception 'FAIL: hồ sơ vẫn hiện chứng nhận đã thu hồi'; end if;

  raise exception 'ALL_OK';
end $$;
