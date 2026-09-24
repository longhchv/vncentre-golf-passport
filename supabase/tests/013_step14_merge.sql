-- Kiểm thử Bước 14: gộp học viên (R12 — không mất bản ghi nào) và hoàn tác trả đúng trạng thái cũ.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

-- Số bản ghi của một học viên ở mọi bảng liên quan (kể cả trạng thái)
create or replace function pg_temp.counts(s uuid) returns jsonb language sql as $f$
  select jsonb_build_object(
    'guardians_live', (select count(*) from public.student_guardians where student_id = s and deleted_at is null),
    'guardians_all', (select count(*) from public.student_guardians where student_id = s),
    'enrollments', (select count(*) from public.enrollments where student_id = s),
    'school_history', (select count(*) from public.student_school_history where student_id = s),
    'accounts_active', (select count(*) from public.student_accounts where student_id = s and is_active),
    'accounts', (select count(*) from public.student_accounts where student_id = s),
    'passports_active', (select count(*) from public.passports where student_id = s and status = 'active'),
    'passports', (select count(*) from public.passports where student_id = s),
    'level_records', (select count(*) from public.level_records where student_id = s),
    'courses', (select count(*) from public.course_history where student_id = s),
    'certificates', (select count(*) from public.certificates where student_id = s),
    'invitations', (select count(*) from public.invitations where student_id = s),
    'link_requests', (select count(*) from public.link_requests where student_id = s),
    'consents', (select count(*) from public.consents where student_id = s),
    'support', (select count(*) from public.support_requests where student_id = s),
    'orders', (select count(*) from public.orders where student_id = s))
$f$;

create or replace function pg_temp.total(a uuid, b uuid) returns jsonb language sql as $f$
  select jsonb_object_agg(k, (pg_temp.counts(a) ->> k)::int + (pg_temp.counts(b) ->> k)::int)
  from jsonb_object_keys(pg_temp.counts(a)) k
$f$;

do $$
declare
  adm uuid := gen_random_uuid();
  par uuid := gen_random_uuid();
  kid_a uuid := gen_random_uuid();
  kid_b uuid := gen_random_uuid();
  school uuid; year uuid; prog uuid; cls1 uuid; cls2 uuid; tier uuid; batch uuid; tpl uuid; lv1 uuid; lv2 uuid; prod uuid;
  a uuid; b uuid; g_shared uuid; g_only uuid; pa uuid; pb uuid;
  ca jsonb; cb jsonb; tot jsonb; mid uuid; r jsonb; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s14-adm@example.test', now()),
    (par, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s14-par@example.test', now()),
    (kid_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s14-ka@example.test', now()),
    (kid_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s14-kb@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  select id into school from public.schools order by created_at limit 1;
  select id into year from public.academic_years order by start_date limit 1;
  select id into prog from public.programs p where p.code = 'core20';
  select l.id into lv1 from public.levels l where l.program_id = prog and l.number = 1;
  select l.id into lv2 from public.levels l where l.program_id = prog and l.number = 2;
  select id into tpl from public.certificate_templates where type = 'course_completion';
  select id into prod from public.products where code = 'passport_replacement';
  select id into tier from public.passport_tiers order by level_from limit 1;
  insert into public.classes (name, school_id, program_id) values ('Test S14 A', school, prog) returning id into cls1;
  insert into public.classes (name, school_id, program_id) values ('Test S14 B', school, prog) returning id into cls2;

  -- A: hồ sơ giữ lại; B: hồ sơ trùng (tên khác chút, có ngày sinh đúng)
  insert into public.students (full_name, date_of_birth, current_school_id, current_grade_class) values ('Test Gop Mot', '2016-01-01', school, '3A') returning id into a;
  insert into public.students (full_name, date_of_birth, current_school_id, current_grade_class) values ('Test Gộp Một', '2016-02-02', school, '3A2') returning id into b;

  insert into public.guardians (user_id, full_name) values (par, 'PH chung') returning id into g_shared;
  insert into public.guardians (full_name, phone) values ('PH rieng B', '+84900014141') returning id into g_only;
  insert into public.student_guardians (student_id, guardian_id, is_primary, can_manage, status) values
    (a, g_shared, true, true, 'active'), (b, g_shared, true, true, 'active'), (b, g_only, false, false, 'active');
  insert into public.enrollments (student_id, class_id) values (a, cls1), (b, cls1), (b, cls2);
  insert into public.student_school_history (student_id, school_id, academic_year_id) values (a, school, year), (b, school, year);
  insert into public.student_accounts (student_id, username, user_id) values (a, 'test.s14a', kid_a), (b, 'test.s14b', kid_b);
  perform pg_temp.act_as(adm);
  batch := public.create_passport_batch('Test S14', tier, 2, 'decal');
  perform pg_temp.act_as(null);
  select id into pa from public.passports where batch_id = batch order by passport_code limit 1;
  select id into pb from public.passports where batch_id = batch and id <> pa;
  update public.passports set student_id = a, status = 'active', issued_at = now() where id = pa;
  update public.passports set student_id = b, status = 'active', issued_at = now() where id = pb;
  insert into public.level_records (student_id, level_id, status, completed_at, source, approval_status) values
    (b, lv1, 'completed', '2025-05-31', 'admin', 'approved'), (b, lv2, 'completed', '2026-05-31', 'admin', 'approved');
  insert into public.course_history (student_id, course_name, source, status) values (b, 'Khoá B 2024', 'admin', 'approved'), (a, 'Khoá A', 'admin', 'approved');
  insert into public.certificates (student_id, template_id, type, data) values (b, tpl, 'course_completion', '{"student_name":"Test Gộp Một"}');
  insert into public.invitations (student_id, channel, target) values (b, 'zalo', '+84900014141');
  insert into public.consents (guardian_id, student_id, type, version, granted) values (g_shared, b, 'leaderboard_name', 'v0', true);
  insert into public.support_requests (student_id, type, body) values (b, 'history_update', 'x');
  insert into public.orders (student_id, product_id, amount_vnd, expires_at) values (b, prod, 200000, now() + interval '7 days');
  perform public.recompute_student_level(b);

  ca := pg_temp.counts(a);
  cb := pg_temp.counts(b);
  tot := pg_temp.total(a, b);

  ------------------------------------------------------------------ Quyền
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.merge_students(a, b); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: phụ huynh gộp được học viên'; end if;

  ------------------------------------------------------------------ Xem trước
  perform pg_temp.act_as(adm);
  r := public.student_merge_preview(a, b);
  if (r ->> 'shared_guardians')::int <> 1 or not (r ->> 'both_active_passport')::boolean or not (r ->> 'both_accounts')::boolean then
    raise exception 'FAIL xem trước: %', r;
  end if;

  ------------------------------------------------------------------ Gộp B → A, lấy ngày sinh của B
  mid := public.merge_students(a, b, '{"date_of_birth":"remove"}');
  perform pg_temp.act_as(null);

  -- R12: tổng số bản ghi không đổi (không xoá dòng nào)
  if pg_temp.total(a, b) - 'guardians_live' - 'accounts_active' - 'passports_active'
     <> tot - 'guardians_live' - 'accounts_active' - 'passports_active' then
    raise exception 'FAIL R12: số bản ghi thay đổi % → %', tot, pg_temp.total(a, b);
  end if;
  -- Mọi dữ liệu còn dùng được đã sang A
  r := pg_temp.counts(b);
  if (r ->> 'guardians_live')::int <> 0 or (r ->> 'passports')::int <> 0 or (r ->> 'level_records')::int <> 0 or (r ->> 'courses')::int <> 0
     or (r ->> 'certificates')::int <> 0 or (r ->> 'orders')::int <> 0 or (r ->> 'consents')::int <> 0 or (r ->> 'support')::int <> 0
     or (r ->> 'invitations')::int <> 0 then
    raise exception 'FAIL R12: còn dữ liệu ở hồ sơ bị gộp %', r;
  end if;
  r := pg_temp.counts(a);
  if (r ->> 'guardians_live')::int <> 2 or (r ->> 'enrollments')::int <> 2 or (r ->> 'passports')::int <> 2 or (r ->> 'passports_active')::int <> 1
     or (r ->> 'level_records')::int <> 2 or (r ->> 'courses')::int <> 2 or (r ->> 'certificates')::int <> 1 or (r ->> 'orders')::int <> 1 then
    raise exception 'FAIL: hồ sơ giữ lại thiếu dữ liệu %', r;
  end if;
  if (select date_of_birth from public.students where id = a) <> '2016-02-02' then raise exception 'FAIL: không lấy giá trị đã chọn'; end if;
  if (select full_name from public.students where id = a) <> 'Test Gop Mot' then raise exception 'FAIL: đổi trường không chọn'; end if;
  if (select l.number from public.students s join public.levels l on l.id = s.current_level_id where s.id = a) <> 3 then
    raise exception 'FAIL: level chưa tính lại theo lịch sử gộp';
  end if;
  if (select merged_into_student_id from public.students where id = b) <> a then raise exception 'FAIL: chưa đánh dấu merged_into'; end if;
  if (select is_active from public.student_accounts where student_id = b) then raise exception 'FAIL: tài khoản trùng chưa khoá'; end if;
  if not exists (select 1 from public.audit_logs where action = 'student.merge' and entity_id = a) then raise exception 'FAIL: chưa ghi nhật ký'; end if;
  -- Phụ huynh vẫn xem được hồ sơ (A), không còn thấy B
  perform pg_temp.act_as(par);
  if (select count(*) from public.my_children() x where x.student_id in (a, b)) <> 1 then
    raise exception 'FAIL: phụ huynh thấy sai số hồ sơ sau khi gộp';
  end if;

  ------------------------------------------------------------------ Hoàn tác → trả đúng như trước
  perform pg_temp.act_as(adm);
  if not ((public.student_merges_list(10) -> 0 ->> 'can_undo')::boolean) then raise exception 'FAIL: không cho hoàn tác'; end if;
  perform public.undo_student_merge(mid);
  perform pg_temp.act_as(null);
  if pg_temp.counts(a) <> ca or pg_temp.counts(b) <> cb then
    raise exception 'FAIL hoàn tác: A % → %, B % → %', ca, pg_temp.counts(a), cb, pg_temp.counts(b);
  end if;
  if (select date_of_birth from public.students where id = a) <> '2016-01-01' then raise exception 'FAIL: chưa trả giá trị cũ'; end if;
  if exists (select 1 from public.students where id = b and (merged_into_student_id is not null or deleted_at is not null)) then raise exception 'FAIL: B chưa khôi phục'; end if;
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.undo_student_merge(mid); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: hoàn tác hai lần'; end if;

  ------------------------------------------------------------------ Quá 30 ngày → không hoàn tác được
  mid := public.merge_students(a, b);
  perform pg_temp.act_as(null);
  update public.student_merges set merged_at = now() - interval '31 days' where id = mid;
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.undo_student_merge(mid); exception when invalid_parameter_value then ok := sqlerrm = 'undo_expired'; end;
  if not ok then raise exception 'FAIL: hoàn tác sau 30 ngày'; end if;

  raise exception 'ALL_OK';
end $$;
