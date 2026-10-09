-- Nhân sự sự kiện: điều phối thêm bộ phận mới (tên tự đặt), thêm từng người kèm vị trí riêng, sửa vị trí.
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
  ev uuid; x jsonb; v_role text; ok boolean; n int; v_asg uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-crew6-adm@example.test', now()),
    (btc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-crew6-btc@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  perform pg_temp.act_as(adm);
  ev := public.admin_create_event('{"name_vi":"Thử bộ phận mới","event_date":"2026-10-10"}');
  perform public.set_event_staff(ev, btc, true);

  -- BTC thêm bộ phận "Bảo vệ – Hậu cần"; trùng tên thì báo; màu sai thì báo
  perform pg_temp.act_as(btc);
  x := public.crew_add_department(ev, 'Bảo vệ – Hậu cần', 'Hậu cần', '#336699');
  v_role := x ->> 'role_code';
  if v_role !~ '^[HIJLMNOPQRSTUVWXYZ]$' then raise exception 'FAIL: mã bộ phận mới %', x; end if;
  ok := false;
  begin perform public.crew_add_department(ev, 'bao ve – hau can'); exception when invalid_parameter_value then ok := sqlerrm = 'department_exists'; end;
  if not ok then raise exception 'FAIL: trùng tên bộ phận'; end if;
  ok := false;
  begin perform public.crew_add_department(ev, 'Khác', null, 'xanh'); exception when invalid_parameter_value then ok := sqlerrm = 'color_invalid'; end;
  if not ok then raise exception 'FAIL: màu sai'; end if;
  if not exists (select 1 from jsonb_array_elements(public.crew_departments()) d where d ->> 'role_code' = v_role and d ->> 'label' = 'Bảo vệ – Hậu cần') then
    raise exception 'FAIL: bộ phận mới chưa có trong danh sách chọn';
  end if;

  -- Việc cho bộ phận mới, rồi thêm từng người (gõ tên bộ phận, có vị trí riêng) → nhận đủ việc của bộ phận
  n := public.crew_add_task(ev, null, v_role, 3, '14h30', 'Cổng', 'Nhận bộ đàm, đứng cổng số 2');
  x := public.crew_import(ev, jsonb_build_array(jsonb_build_object('line', 1, 'full_name', 'Người Bảo Vệ', 'department', 'Bảo vệ – Hậu cần',
        'position', 'Cổng số 2', 'contact', '0955000001')), true);
  if x -> 0 ->> 'status' <> 'ok' then raise exception 'FAIL thêm từng người: %', x; end if;
  perform pg_temp.act_as(null);
  select a.id into v_asg from public.event_crew_assignments a join public.event_crew_slots s on s.id = a.slot_id where a.event_id = ev and s.role_code = v_role;
  if (select position from public.event_crew_assignments where id = v_asg) <> 'Cổng số 2' then raise exception 'FAIL: vị trí riêng'; end if;
  if (select count(*) from public.event_crew_tasks where assignment_id = v_asg) <> 1 then raise exception 'FAIL: việc của bộ phận mới'; end if;
  -- Người thứ hai cùng bộ phận → tự thêm chỗ
  perform pg_temp.act_as(btc);
  x := public.crew_import(ev, '[{"line":1,"full_name":"Người Bảo Vệ Hai","department":"Bảo vệ – Hậu cần","contact":"0955000002"}]', true);
  if x -> 0 ->> 'slot_code' <> v_role || '2' then raise exception 'FAIL: chỗ thứ hai %', x; end if;
  -- HLV với vị trí riêng vẫn xếp đúng trạm theo tên bộ phận
  x := public.crew_import(ev, '[{"line":1,"full_name":"HLV Pitch","department":"HLV Pitching","position":"Trạm Pitching (gần cổng)","contact":"0955000003"}]', true);
  if x -> 0 ->> 'slot_code' <> 'C3' then raise exception 'FAIL: HLV có vị trí riêng %', x; end if;

  -- Sửa vị trí
  perform public.crew_set_position(v_asg, 'Cổng số 1');
  perform pg_temp.act_as(null);
  if (select position from public.event_crew_assignments where id = v_asg) <> 'Cổng số 1' then raise exception 'FAIL: sửa vị trí'; end if;

  raise exception 'ALL_OK';
end $$;
