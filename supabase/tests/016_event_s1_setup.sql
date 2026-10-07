-- Module sự kiện · S1 (E1 chuẩn bị sự kiện) và E-R5 (hạng event_experience không tính vào R2).
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
  staff uuid := gen_random_uuid();
  coach uuid := gen_random_uuid();
  ev uuid; batch uuid; first_batch uuid; s1 uuid; p_first uuid; p_event uuid; ok boolean; r jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev1-adm@example.test', now()),
    (staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev1-staff@example.test', now()),
    (coach, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev1-coach@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (coach, 'coach');

  ------------------------------------------------------------------ Chỉ admin tạo sự kiện
  perform pg_temp.act_as(coach);
  ok := false;
  begin perform public.admin_create_event('{"name_vi":"X","event_date":"2026-10-10"}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: HLV tạo được sự kiện'; end if;

  ------------------------------------------------------------------ E1: sự kiện → lớp event_experience + 4 trạm mặc định
  perform pg_temp.act_as(adm);
  ev := public.admin_create_event('{"name_vi":"Lễ phát động thử","event_date":"2026-10-10","venue":"Hồ Hoàn Kiếm"}');
  perform pg_temp.act_as(null);
  if (select pr.code || '/' || ct.code from public.events e join public.classes c on c.id = e.class_id
      join public.programs pr on pr.id = c.program_id join public.class_types ct on ct.id = c.class_type_id where e.id = ev)
     <> 'event_experience/event_experience' then
    raise exception 'FAIL: lớp sự kiện sai chương trình/loại lớp';
  end if;
  if (select string_agg(code || ':' || score_step || ':' || min_score_to_complete || ':' || coalesce(max_score::text, '-'), ',' order by sort_order)
      from public.event_stations where event_id = ev) <> 'putt:5:5:-,chip:5:5:-,pitch:5:5:-,full_swing:5:5:-' then
    raise exception 'FAIL: 4 trạm mặc định sai';
  end if;

  ------------------------------------------------------------------ Lô thẻ sự kiện: hạng event_experience, chưa gán ai
  perform pg_temp.act_as(adm);
  batch := public.create_event_card_batch(ev, 20);
  perform pg_temp.act_as(null);
  if (select count(*) from public.passports p join public.passport_tiers t on t.id = p.tier_id
      where p.batch_id = batch and t.code = 'event_experience' and p.status = 'unassigned' and p.student_id is null and not p.counts_toward_single_active) <> 20 then
    raise exception 'FAIL: lô thẻ sự kiện';
  end if;
  if (select event_id from public.passport_batches where id = batch) <> ev then raise exception 'FAIL: lô chưa gắn sự kiện'; end if;

  ------------------------------------------------------------------ E-R5: học viên có First Passport active vẫn có thẻ sự kiện active
  insert into public.students (full_name, date_of_birth) values ('Test Hai So', '2016-01-01') returning id into s1;
  perform pg_temp.act_as(adm);
  first_batch := public.create_passport_batch('Test first', (select id from public.passport_tiers where code = 'first'), 1, 'decal');
  perform pg_temp.act_as(null);
  select id into p_first from public.passports where batch_id = first_batch;
  select id into p_event from public.passports where batch_id = batch limit 1;
  update public.passports set student_id = s1, status = 'active', issued_at = now() where id = p_first;
  update public.passports set student_id = s1, status = 'active', issued_at = now() where id = p_event;
  -- R2 vẫn giữ cho hạng thường: sổ First thứ hai active bị chặn
  ok := false;
  begin
    insert into public.passports (tier_id, student_id, status) values ((select id from public.passport_tiers where code = 'first'), s1, 'active');
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL R2: hai sổ First active'; end if;

  ------------------------------------------------------------------ Nhân viên sự kiện gán theo sự kiện
  perform pg_temp.act_as(staff);
  if public.is_event_staff(ev) then raise exception 'FAIL: chưa gán mà đã là nhân viên sự kiện'; end if;
  perform pg_temp.act_as(adm);
  perform public.set_event_staff(ev, staff, true);
  perform public.set_event_staff(ev, staff, true);
  if jsonb_array_length(public.event_staff_list(ev)) <> 1 then raise exception 'FAIL: gán trùng nhân viên'; end if;
  perform pg_temp.act_as(staff);
  if not public.is_event_staff(ev) then raise exception 'FAIL: nhân viên sự kiện không được nhận ra'; end if;
  -- Nhân viên sự kiện không đọc thẳng bảng sự kiện / người tham gia
  if exists (select 1 from public.events) or exists (select 1 from public.event_participations) then raise exception 'FAIL: đọc thẳng bảng sự kiện'; end if;
  ok := false;
  begin perform public.event_card_points(p_event); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: gọi thẳng được event_card_points'; end if;
  perform pg_temp.act_as(adm);
  perform public.set_event_staff(ev, staff, false);
  perform pg_temp.act_as(staff);
  if public.is_event_staff(ev) then raise exception 'FAIL: gỡ nhân viên không có tác dụng'; end if;

  perform pg_temp.act_as(adm);
  r := public.admin_events();
  if not (r @> jsonb_build_array(jsonb_build_object('id', ev, 'cards', 20))) then raise exception 'FAIL admin_events: %', r; end if;

  raise exception 'ALL_OK';
end $$;
