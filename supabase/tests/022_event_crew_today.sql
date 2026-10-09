-- Module Nhân sự sự kiện · bước 4: /p/<mã> hiện checklist "Hôm nay"; Xong / Vướng (Vướng bắt buộc lý do, nghiệm thu 6);
-- chỉ tích việc của chính mã đó; vai A thấy tổng từng ô và mục Vướng; sự kiện đóng thì không còn trang nhân sự.
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
  ev uuid; x jsonb; code_a text; code_c text; task_c uuid; task_a uuid; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-crew4-adm@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.events (class_id, name_vi, name_en, event_date, status)
  values ((select id from public.classes limit 1), 'Thử hôm nay', 'Crew today test', current_date, 'open') returning id into ev;
  perform pg_temp.act_as(adm);
  x := public.crew_import(ev, '[{"line":1,"full_name":"Điều Phối Thử","slot_code":"A","contact":"0922000111"},
                                {"line":2,"full_name":"HLV Trạm Thử","slot_code":"C2","contact":"0922000222"}]', true);
  code_a := x -> 0 ->> 'passport_code';
  code_c := x -> 1 ->> 'passport_code';

  -- Người không đăng nhập mở /p/<mã> (phương án a)
  execute 'reset role'; execute 'set local role anon';
  if public.crew_today('ZZZZZZZZ') ->> 'result' <> 'none' then raise exception 'FAIL: mã lạ'; end if;
  x := public.crew_today(lower(code_c));
  if x ->> 'result' <> 'crew' or x -> 'slot' ->> 'slot_code' <> 'C2' or jsonb_array_length(x -> 'tasks') <> 12 or x ? 'summary' and x -> 'summary' <> 'null' then
    raise exception 'FAIL crew_today C2: %', x;
  end if;
  if x::text ~ '0922000222|\+84' then raise exception 'FAIL: lộ SĐT'; end if;
  task_c := (x -> 'tasks' -> 0 ->> 'id')::uuid;

  -- Vướng không lý do bị chặn; có lý do thì lưu
  ok := false;
  begin perform public.crew_set_task(code_c, task_c, 'blocked', '  '); exception when invalid_parameter_value then ok := sqlerrm = 'note_required'; end;
  if not ok then raise exception 'FAIL: Vướng không lý do'; end if;
  perform public.crew_set_task(code_c, task_c, 'blocked', 'Thiếu dấu 5 điểm');
  perform public.crew_set_task(code_c, (x -> 'tasks' -> 1 ->> 'id')::uuid, 'done');

  -- Không tích được việc của người khác bằng mã của mình
  task_a := (public.crew_today(code_a) -> 'tasks' -> 0 ->> 'id')::uuid;
  ok := false;
  begin perform public.crew_set_task(code_c, task_a, 'done'); exception when no_data_found then ok := sqlerrm = 'task_not_found'; end;
  if not ok then raise exception 'FAIL: tích việc người khác'; end if;

  -- Vai A thấy tổng từng ô và mục Vướng
  x := public.crew_today(code_a);
  if jsonb_array_length(x -> 'summary') <> 2 or (x -> 'summary' -> 1 ->> 'done')::int <> 1 or (x -> 'summary' -> 1 ->> 'blocked')::int <> 1
     or x -> 'blocked' -> 0 ->> 'note' <> 'Thiếu dấu 5 điểm' then
    raise exception 'FAIL vai A: %', x;
  end if;

  -- Sự kiện đóng: không còn trang nhân sự, không tích được
  execute 'reset role';
  update public.events set status = 'closed' where id = ev;
  execute 'set local role anon';
  if public.crew_today(code_c) ->> 'result' <> 'none' then raise exception 'FAIL: sự kiện đã đóng vẫn hiện'; end if;
  ok := false;
  begin perform public.crew_set_task(code_c, task_c, 'done'); exception when no_data_found then ok := true; end;
  if not ok then raise exception 'FAIL: sự kiện đóng vẫn tích được'; end if;

  raise exception 'ALL_OK';
end $$;
