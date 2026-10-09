-- Module Nhân sự sự kiện · nhập theo bộ phận, tự thêm chỗ, thêm / bớt việc và người, bảng điều phối; quyền BTC của sự kiện.
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
  btc uuid := gen_random_uuid();
  btc_other uuid := gen_random_uuid();
  ev uuid; ev2 uuid; x jsonb; b jsonb; n int; ok boolean; v_asg uuid; v_task uuid; v_slots_before int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-crew5-adm@example.test', now()),
    (btc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-crew5-btc@example.test', now()),
    (btc_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-crew5-btc2@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  perform pg_temp.act_as(adm);
  ev := public.admin_create_event('{"name_vi":"Thử bộ phận","event_date":"2026-10-10"}');
  ev2 := public.admin_create_event('{"name_vi":"Sự kiện khác","event_date":"2026-10-11"}');
  perform public.set_event_staff(ev, btc, true);
  perform public.set_event_staff(ev2, btc_other, true);
  perform pg_temp.act_as(null);
  update public.events set status = 'open' where id in (ev, ev2);
  v_slots_before := (select count(*) from public.event_crew_slots);

  -- BTC của sự kiện khác không nhập được
  perform pg_temp.act_as(btc_other);
  ok := false;
  begin perform public.crew_import(ev, '[]', false); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: BTC sự kiện khác nhập nhân sự'; end if;

  -- BTC của sự kiện nhập theo bộ phận: 6 đại sứ (5 chỗ có sẵn → thêm 1 chỗ), HLV theo trạm
  perform pg_temp.act_as(btc);
  x := '[{"line":1,"full_name":"Đại Sứ Một","department":"Đại sứ","contact":"0933000001"},
         {"line":2,"full_name":"Đại Sứ Hai","department":"dai su","contact":"0933000002"},
         {"line":3,"full_name":"Đại Sứ Ba","department":"Đại sứ","contact":"0933000003"},
         {"line":4,"full_name":"Đại Sứ Bốn","department":"Đại sứ","contact":"0933000004"},
         {"line":5,"full_name":"Đại Sứ Năm","department":"Đại sứ","contact":"0933000005"},
         {"line":6,"full_name":"Đại Sứ Sáu","department":"Đại sứ","contact":"0933000006","birth_year":"2018"},
         {"line":7,"full_name":"HLV Chip","department":"HLV Chipping","contact":"0933000007"},
         {"line":8,"full_name":"Người Quầy","department":"Quầy quà","contact":"0933000008"},
         {"line":9,"full_name":"Không Rõ","department":"Bảo vệ","contact":"0933000009"}]';
  b := public.crew_import(ev, x, false);
  if b -> 5 ->> 'status' <> 'ok' or not (b -> 5 ->> 'new_slot')::boolean or (b -> 4 ->> 'new_slot')::boolean
     or b -> 6 ->> 'slot_code' <> 'C2' or b -> 8 ->> 'error' <> 'department_not_found' then
    raise exception 'FAIL xem trước bộ phận: %', b;
  end if;
  perform pg_temp.act_as(null);
  if (select count(*) from public.event_crew_slots) <> v_slots_before then raise exception 'FAIL: xem trước đã thêm chỗ'; end if;
  perform pg_temp.act_as(btc);
  b := public.crew_import(ev, x, true);
  perform pg_temp.act_as(null);
  if (select count(*) from public.event_crew_assignments where event_id = ev) <> 8 then raise exception 'FAIL: số người %', b; end if;
  if (select count(*) from public.event_crew_slots) <> v_slots_before + 1 or b -> 5 ->> 'slot_code' <> 'D6' then raise exception 'FAIL: thêm chỗ D6 %', b -> 5; end if;
  if (select position from public.event_crew_assignments a join public.event_crew_slots s on s.id = a.slot_id where a.event_id = ev and s.slot_code = 'C2') <> 'Trạm Chipping' then
    raise exception 'FAIL: vị trí HLV';
  end if;
  -- Nhập lại: không thêm người, không thêm chỗ
  perform pg_temp.act_as(btc);
  b := public.crew_import(ev, x, true);
  perform pg_temp.act_as(null);
  if (select count(*) from public.event_crew_assignments where event_id = ev) <> 8 or (select count(*) from public.event_crew_slots) <> v_slots_before + 1 then
    raise exception 'FAIL: nhập lại sinh trùng';
  end if;

  -- Thêm việc cho cả bộ phận Đại sứ (6 người) và cho riêng một người; người nhập sau cũng nhận việc của bộ phận
  perform pg_temp.act_as(btc);
  n := public.crew_add_task(ev, null, 'D', 4, '16h30', 'Sân khấu', 'Chụp ảnh cùng khách mời');
  perform pg_temp.act_as(null);
  if n <> 6 then raise exception 'FAIL: thêm việc bộ phận = %', n; end if;
  select a.id into v_asg from public.event_crew_assignments a join public.event_crew_slots s on s.id = a.slot_id where a.event_id = ev and s.slot_code = 'C2';
  perform pg_temp.act_as(btc);
  perform public.crew_add_task(ev, v_asg, null, 3, '15h00', null, 'Mượn thêm 10 bóng');
  perform pg_temp.act_as(null);
  if (select count(*) from public.event_crew_tasks where assignment_id = v_asg) <> 13 then raise exception 'FAIL: thêm việc một người'; end if;
  perform pg_temp.act_as(btc);
  perform public.crew_import(ev, '[{"line":1,"full_name":"Đại Sứ Bảy","department":"Đại sứ","contact":"0933000010"}]', true);
  perform pg_temp.act_as(null);
  if (select count(*) from public.event_crew_tasks t join public.event_crew_assignments a on a.id = t.assignment_id join public.students s on s.id = a.student_id
      where a.event_id = ev and s.full_name = 'Đại Sứ Bảy') <> 9 then raise exception 'FAIL: người nhập sau thiếu việc bộ phận'; end if;

  -- Bớt việc mẫu khỏi cả bộ phận Đại sứ (7 người → mỗi người còn 8); người nhập sau cũng không nhận
  select t.id into v_task from public.event_crew_tasks t join public.event_crew_assignments a on a.id = t.assignment_id join public.event_crew_slots s on s.id = a.slot_id
  where a.event_id = ev and s.slot_code = 'D1' and t.template_id is not null order by t.phase_no, t.sort_order limit 1;
  perform pg_temp.act_as(btc);
  perform public.crew_remove_task(v_task, 'role');
  perform pg_temp.act_as(null);
  if exists (select 1 from public.event_crew_assignments a join public.event_crew_slots s on s.id = a.slot_id
             where a.event_id = ev and s.role_code = 'D' and (select count(*) from public.event_crew_tasks t where t.assignment_id = a.id) <> 8) then
    raise exception 'FAIL: bớt việc bộ phận';
  end if;
  perform pg_temp.act_as(btc);
  perform public.crew_import(ev, '[{"line":1,"full_name":"Đại Sứ Tám","department":"Đại sứ","contact":"0933000011"}]', true);
  perform pg_temp.act_as(null);
  if (select count(*) from public.event_crew_tasks t join public.event_crew_assignments a on a.id = t.assignment_id join public.students s on s.id = a.student_id
      where a.event_id = ev and s.full_name = 'Đại Sứ Tám') <> 8 then raise exception 'FAIL: người nhập sau vẫn nhận việc đã bớt'; end if;
  -- Bớt một việc của riêng một người
  select id into v_task from public.event_crew_tasks where assignment_id = v_asg order by created_at desc, sort_order desc limit 1;
  perform pg_temp.act_as(btc);
  perform public.crew_remove_task(v_task, 'one');
  perform pg_temp.act_as(null);
  if (select count(*) from public.event_crew_tasks where assignment_id = v_asg) <> 12 then raise exception 'FAIL: bớt việc một người'; end if;

  -- Bảng điều phối: Vướng hiện ngay; 3 bộ phận; 8 đại sứ
  update public.event_crew_tasks set status = 'blocked', note = 'Thiếu bóng' where id = (select id from public.event_crew_tasks where assignment_id = v_asg order by phase_no, sort_order limit 1 offset 2);
  perform pg_temp.act_as(btc);
  b := public.crew_board(ev);
  if jsonb_array_length(b -> 'blocked') <> 1 or (select count(*) from jsonb_array_elements(b -> 'departments')) <> 3
     or (select (d ->> 'people')::int from jsonb_array_elements(b -> 'departments') d where d ->> 'role_code' = 'D') <> 8 then
    raise exception 'FAIL bảng điều phối: %', b;
  end if;
  if public.crew_task_deadline('2026-10-10', 1, '21h00') <> '2026-10-09 14:00:00+00' then raise exception 'FAIL: hạn giai đoạn 1'; end if;
  -- BTC không thấy SĐT trong bảng nhân sự
  if public.crew_roster(ev)::text ~ '0933000' then raise exception 'FAIL: BTC thấy SĐT'; end if;
  -- Thẻ đeo đã nhận; bớt người nhập nhầm
  perform public.crew_set_badge(v_asg, 'received');
  if (public.crew_board(ev) -> 'badges' ->> 'received')::int <> 1 then raise exception 'FAIL: thẻ đeo'; end if;
  perform public.crew_remove_assignment(v_asg);
  perform pg_temp.act_as(null);
  if exists (select 1 from public.event_crew_assignments where id = v_asg) or exists (select 1 from public.event_crew_tasks where assignment_id = v_asg) then
    raise exception 'FAIL: bớt người';
  end if;

  raise exception 'ALL_OK';
end $$;
