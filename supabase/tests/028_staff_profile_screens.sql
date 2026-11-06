-- Module Hồ sơ nhân sự · chặng B: S2 hồ sơ của tôi, S3 danh sách theo phạm vi, ô số liệu (một phần S-R8).
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
  coach_a uuid := gen_random_uuid();
  tnv_b uuid := gen_random_uuid();
  mgr uuid := gen_random_uuid();
  ev uuid; school uuid; program uuid; class_x uuid; class_y uuid; s1 uuid; s2 uuid; s3 uuid;
  e_b uuid; e_self uuid; x jsonb; tile jsonb; n int; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sb-adm@example.test', now()),
    (coach_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sb-a@example.test', now()),
    (tnv_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sb-b@example.test', now()),
    (mgr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sb-mgr@example.test', now());
  update public.profiles set full_name = 'Test SB ' || substr(user_id::text, 1, 4) where user_id in (adm, coach_a, tnv_b, mgr);
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  perform pg_temp.act_as(adm);
  ev := public.admin_create_event('{"name_vi":"Thử S3","event_date":"2026-10-10"}');
  update public.profiles set cv_type = 'coach' where user_id = coach_a;
  update public.profiles set cv_type = 'volunteer' where user_id = tnv_b;
  perform public.set_event_staff(ev, tnv_b, true);
  perform public.admin_set_event_manager(ev, mgr, true);
  perform pg_temp.act_as(null);

  -- Tiêu chí 1: HLV A ở 2 lớp, có 1 học viên học cả 2 lớp → Học viên đã dạy = 3
  select id into school from public.schools order by created_at limit 1;
  select id into program from public.programs where code = 'core20';
  insert into public.classes (name, school_id, program_id, start_date) values ('TEST SB X', school, program, '2024-09-01') returning id into class_x;
  insert into public.classes (name, school_id, program_id, start_date) values ('TEST SB Y', school, program, '2025-09-01') returning id into class_y;
  insert into public.students (full_name) values ('Test SB HV1') returning id into s1;
  insert into public.students (full_name) values ('Test SB HV2') returning id into s2;
  insert into public.students (full_name) values ('Test SB HV3') returning id into s3;
  insert into public.enrollments (student_id, class_id) values (s1, class_x), (s2, class_x), (s2, class_y), (s3, class_y);
  insert into public.class_staff (class_id, user_id, role) values (class_x, coach_a, 'coach'), (class_y, coach_a, 'coach');

  perform pg_temp.act_as(coach_a);
  x := public.staff_my_profile();
  select count(*) into n from jsonb_array_elements(x -> 'engagements') i where i ->> 'kind' = 'class' and i ->> 'badge' = 'verified';
  if n <> 2 then raise exception 'FAIL: hồ sơ A có % dòng giảng dạy đã xác thực (mong đợi 2)', n; end if;
  select i into tile from jsonb_array_elements(x -> 'stats' -> 'tiles') i where i ->> 'key' = 'students';
  if (tile ->> 'value')::int <> 3 then raise exception 'FAIL: Học viên đã dạy = % (mong đợi 3)', tile ->> 'value'; end if;
  -- Tiêu chí 2, S-R8: bước 2 chưa có nguồn → null (ẩn), không phải 0
  select count(*) into n from jsonb_array_elements(x -> 'stats' -> 'tiles') i
  where i ->> 'key' in ('sessions', 'level_ups') and i -> 'value' = 'null'::jsonb;
  if n <> 2 then raise exception 'FAIL S-R8: ô bước 2 không để trống'; end if;
  select i into tile from jsonb_array_elements(x -> 'stats' -> 'tiles') i where i ->> 'key' = 'years';
  if (tile ->> 'value')::numeric < 2 or tile ->> 'badge' <> 'verified' then raise exception 'FAIL: năm kinh nghiệm sai (%)', tile; end if;
  -- Chủ hồ sơ không mở hồ sơ người khác
  ok := false;
  begin perform public.staff_my_profile(tnv_b); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: HLV A mở được hồ sơ của B'; end if;

  -- Tự khai kinh nghiệm đã duyệt → ô năm kinh nghiệm mang dấu Đã duyệt
  perform public.staff_save_credential(null, '{"type":"prior_experience","title_vi":"HLV CLB","years":3}');
  perform pg_temp.act_as(adm);
  perform public.staff_review('credential', (select id from public.staff_credentials where user_id = coach_a), true);
  x := public.staff_my_profile(coach_a);
  select i into tile from jsonb_array_elements(x -> 'stats' -> 'tiles') i where i ->> 'key' = 'years';
  if (tile ->> 'value')::numeric < 5 or tile ->> 'badge' <> 'approved' then raise exception 'FAIL: năm kinh nghiệm cộng tự khai sai (%)', tile; end if;

  -- TNV B: chưa ghi giờ → ô Giờ đóng góp ẩn; người phụ trách ghi 8 giờ → hiện 8
  perform pg_temp.act_as(tnv_b);
  x := public.staff_my_profile();
  select i into tile from jsonb_array_elements(x -> 'stats' -> 'tiles') i where i ->> 'key' = 'hours';
  if tile -> 'value' <> 'null'::jsonb then raise exception 'FAIL S-R8: ô giờ hiện % khi chưa ghi', tile -> 'value'; end if;
  e_self := public.staff_save_self_engagement(null, '{"project_name_vi":"Việc cũ","started_on":"2023-01-01"}');
  x := public.staff_my_profile();
  select count(*) into n from jsonb_array_elements(x -> 'engagements') i where (i ->> 'id')::uuid = e_self and i ->> 'badge' = 'pending';
  if n <> 1 then raise exception 'FAIL: chủ hồ sơ không thấy mục Chờ duyệt'; end if;
  select (i ->> 'id')::uuid into e_b from jsonb_array_elements(x -> 'engagements') i where i ->> 'kind' = 'event';

  ---------------------------------------------------------------------------
  -- S3: người phụ trách thấy danh sách của sự kiện mình; người khác không
  ---------------------------------------------------------------------------
  perform pg_temp.act_as(mgr);
  x := public.staff_scope_list(ev, null);
  select count(*) into n from jsonb_array_elements(x -> 'items') i where (i ->> 'id')::uuid = e_b;
  if n <> 1 then raise exception 'FAIL S3: người phụ trách không thấy B trong sự kiện'; end if;
  if x::text like '%' || e_self::text || '%' then raise exception 'FAIL S3: danh sách sự kiện lộ mục tự khai'; end if;
  select count(*) into n from jsonb_array_elements(public.staff_my_scopes()) i where (i ->> 'id')::uuid = ev;
  if n <> 1 then raise exception 'FAIL S3: sự kiện không có trong phạm vi của người phụ trách'; end if;
  perform public.staff_record_engagement(e_b, '{"position_vi":"Hướng dẫn check-in","hours":8,"skills":["coordination","guest_reception"]}');
  ok := false;
  begin perform public.staff_scope_list(null, class_x); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S3: người phụ trách sự kiện xem được lớp'; end if;
  perform pg_temp.act_as(tnv_b);
  ok := false;
  begin perform public.staff_scope_list(ev, null); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S3: event_staff thường xem được danh sách ghi nhận'; end if;

  -- Tiêu chí 3: hồ sơ B hiện đủ vị trí, giờ, 2 kỹ năng
  x := public.staff_my_profile();
  select count(*) into n from jsonb_array_elements(x -> 'engagements') i
  where (i ->> 'id')::uuid = e_b and i ->> 'position_vi' = 'Hướng dẫn check-in' and (i ->> 'hours')::numeric = 8
    and jsonb_array_length(i -> 'skills') = 2;
  if n <> 1 then raise exception 'FAIL: hồ sơ B chưa hiện đủ ghi nhận'; end if;
  select i into tile from jsonb_array_elements(x -> 'stats' -> 'tiles') i where i ->> 'key' = 'hours';
  if (tile ->> 'value')::numeric <> 8 then raise exception 'FAIL: ô giờ = % (mong đợi 8)', tile -> 'value'; end if;
  if jsonb_array_length(x -> 'skills') <> 2 then raise exception 'FAIL: tổng kỹ năng sai'; end if;

  perform pg_temp.act_as(null);
  raise exception 'ALL_OK';
end $$;
