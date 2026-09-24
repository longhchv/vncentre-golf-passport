-- Kiểm thử hàng chờ Bước 9 cho luồng B (F2): duyệt / từ chối liên kết chờ xác nhận, ghép học viên tự khai.
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
  pb uuid := gen_random_uuid();
  pc uuid := gen_random_uuid();
  school uuid; tier uuid; s_match uuid; s_target uuid; code_b text; code_c text; r jsonb; v_link uuid; v_new uuid; ids uuid[];
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s9b-' || id || '@example.test', now()
  from unnest(array[adm, pb, pc]) id;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.guardians (user_id, full_name) values (pb, 'Test PH B9'), (pc, 'Test PH C9');
  select id into school from public.schools order by created_at limit 1;
  select id into tier from public.passport_tiers where code = 'first';
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Luong B Khop', '2019-03-03', school) returning id into s_match;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Luong B Dich', '2018-04-04', school) returning id into s_target;
  insert into public.passports (tier_id, status) values (tier, 'unassigned') returning passport_code into code_b;
  insert into public.passports (tier_id, status) values (tier, 'unassigned') returning passport_code into code_c;

  -- Phụ huynh B khai trùng 1 em → chờ xác nhận; admin TỪ CHỐI → sổ chuyển sang học viên mới chờ xác minh
  perform pg_temp.act_as(pb);
  r := public.activation_complete(code_b, jsonb_build_object('relationship', 'mother', 'consents', jsonb_build_object('terms', true, 'privacy', true),
        'child', jsonb_build_object('full_name', 'Test Luong B Khop', 'date_of_birth', '2019-03-03', 'school_id', school)));
  if r ->> 'link_status' <> 'pending_confirmation' then raise exception 'FAIL chuẩn bị: %', r; end if;
  perform pg_temp.act_as(adm);
  select array_agg((x ->> 'id')::uuid) into ids from jsonb_array_elements(public.review_queue() -> 'guardian_links') x where (x ->> 'student_id')::uuid = s_match;
  if public.review_items('guardian_link', ids, 'reject', 'Không phải con của phụ huynh này') <> 1 then raise exception 'FAIL: từ chối liên kết'; end if;
  perform pg_temp.act_as(null);
  select student_id into v_new from public.passports where passport_code = code_b;
  if v_new = s_match then raise exception 'FAIL: sổ vẫn gắn học viên cũ'; end if;
  if (select verification_status from public.students where id = v_new) <> 'pending_review' then raise exception 'FAIL: học viên mới không chờ xác minh'; end if;
  if exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
             where sg.student_id = s_match and g.user_id = pb and sg.deleted_at is null) then
    raise exception 'FAIL: liên kết cũ chưa gỡ';
  end if;
  if (select passport_code from public.passports where student_id = v_new and status = 'active') <> code_b then raise exception 'FAIL: sổ không còn active'; end if;

  -- Admin GHÉP học viên tự khai vào học viên có sẵn → sổ, liên kết chuyển sang; hồ sơ tự khai đánh dấu đã gộp
  perform pg_temp.act_as(adm);
  perform public.absorb_pending_student(v_new, s_target);
  perform pg_temp.act_as(null);
  if (select student_id from public.passports where passport_code = code_b) <> s_target then raise exception 'FAIL: sổ không chuyển'; end if;
  if (select merged_into_student_id from public.students where id = v_new) <> s_target then raise exception 'FAIL: chưa đánh dấu gộp'; end if;
  perform pg_temp.act_as(pb);
  if (public.student_profile(s_target) ->> 'viewer') <> 'guardian' then raise exception 'FAIL: phụ huynh không thấy học viên sau khi ghép'; end if;

  -- Phụ huynh C khai trùng → admin DUYỆT → thấy đầy đủ hồ sơ
  perform pg_temp.act_as(pc);
  r := public.activation_complete(code_c, jsonb_build_object('relationship', 'father', 'consents', jsonb_build_object('terms', true, 'privacy', true),
        'child', jsonb_build_object('full_name', 'Test Luong B Khop', 'date_of_birth', '2019-03-03', 'school_id', school)));
  if (public.student_profile(s_match) ->> 'viewer') <> 'pending' then raise exception 'FAIL D32 trước duyệt'; end if;
  perform pg_temp.act_as(adm);
  select array_agg((x ->> 'id')::uuid) into ids from jsonb_array_elements(public.review_queue() -> 'guardian_links') x where (x ->> 'student_id')::uuid = s_match;
  perform public.review_items('guardian_link', ids, 'approve');
  perform pg_temp.act_as(pc);
  if (public.student_profile(s_match) ->> 'viewer') <> 'guardian' then raise exception 'FAIL: sau duyệt vẫn chưa thấy đầy đủ'; end if;

  perform pg_temp.act_as(null);
  raise exception 'ALL_OK';
end $$;
