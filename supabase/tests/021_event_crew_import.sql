-- Module Nhân sự sự kiện · bước 3: nhập danh sách (spec 11 mục 4.1, nghiệm thu 1).
-- Người đã có hồ sơ giữ nguyên mã; dưới 11 tuổi → hồ sơ con dưới phụ huynh; trùng tên khác liên hệ → chờ chọn;
-- xem trước không ghi gì; mỗi ô một người; việc của người sinh đủ theo vai; chỉ admin.
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
  other uuid := gen_random_uuid();
  ev uuid; g_old uuid; s_old uuid; s_same uuid; r jsonb; x jsonb; n int; ok boolean; v_code text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-crew-adm@example.test', now()),
    (other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-crew-other@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.events (class_id, name_vi, name_en, event_date, status)
  values ((select id from public.classes limit 1), 'Thử nhập nhân sự', 'Crew import test', '2026-10-10', 'open') returning id into ev;

  -- Người đã có hồ sơ tự chơi (SĐT 0911000111) và một người khác trùng tên "Trần Trùng Tên"
  insert into public.guardians (full_name, phone) values ('Lê Có Sẵn', '+84911000111') returning id into g_old;
  insert into public.students (full_name, verification_status) values ('Lê Có Sẵn', 'verified') returning id into s_old;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s_old, g_old, 'self', true, true, 'admin', 'active', now());
  insert into public.students (full_name, verification_status) values ('Trần Trùng Tên', 'verified') returning id into s_same;

  -- Chỉ admin
  perform pg_temp.act_as(other);
  ok := false;
  begin perform public.crew_import(ev, '[]', false); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người thường nhập được nhân sự'; end if;

  perform pg_temp.act_as(adm);
  r := '[
    {"line":1,"full_name":"Lê Có Sẵn","slot_code":"A","contact":"0911 000 111"},
    {"line":2,"full_name":"Nguyễn Mới","slot_code":"c2","contact":"moi.crew@example.test"},
    {"line":3,"full_name":"Bé Đại Sứ","slot_code":"D1","contact":"0911000222","birth_year":"2018"},
    {"line":4,"full_name":"Anh Đại Sứ","slot_code":"D2","contact":"0911000333","birth_year":"2010"},
    {"line":5,"full_name":"Trần Trùng Tên","slot_code":"E1","contact":"0911000444"},
    {"line":6,"full_name":"Sai Ô","slot_code":"Z9","contact":"0911000555"},
    {"line":7,"full_name":"Trùng Ô","slot_code":"C2","contact":"0911000666"},
    {"line":8,"full_name":"Sai Số","slot_code":"F1","contact":"12ab"}
  ]';

  -- Xem trước: không ghi gì
  x := public.crew_import(ev, r, false);
  if (select count(*) from public.event_crew_assignments where event_id = ev) <> 0 then raise exception 'FAIL: xem trước đã ghi'; end if;
  if x -> 0 ->> 'action' <> 'reuse' or x -> 1 ->> 'action' <> 'new_self' or x -> 2 ->> 'action' <> 'new_child'
     or x -> 3 ->> 'action' <> 'new_self' or x -> 4 ->> 'status' <> 'suspect' or x -> 5 ->> 'error' <> 'slot_not_found'
     or x -> 6 ->> 'error' <> 'slot_duplicated' or x -> 7 ->> 'error' <> 'contact_invalid' then
    raise exception 'FAIL xem trước: %', x;
  end if;

  -- Ghi
  x := public.crew_import(ev, r, true);
  if (select count(*) from public.event_crew_assignments where event_id = ev) <> 4 then raise exception 'FAIL: số phân công %', x; end if;
  -- Nghiệm thu 1: người đã có hồ sơ giữ nguyên hồ sơ (mã VNC cũ), không sinh trùng
  if (select student_id from public.event_crew_assignments a join public.event_crew_slots s on s.id = a.slot_id where a.event_id = ev and s.slot_code = 'A') <> s_old then
    raise exception 'FAIL: người có sẵn bị tạo hồ sơ mới';
  end if;
  if (select count(*) from public.students where full_name = 'Lê Có Sẵn') <> 1 then raise exception 'FAIL: hồ sơ trùng'; end if;
  -- Có sổ hạng Thẻ nhân sự, mã VNC
  if exists (select 1 from public.event_crew_assignments a left join public.passports p on p.id = a.passport_id
             left join public.passport_tiers t on t.id = p.tier_id where a.event_id = ev and (t.code is distinct from 'staff' or p.status <> 'assigned')) then
    raise exception 'FAIL: sổ nhân sự';
  end if;
  if (x -> 1 ->> 'student_code') !~ '^VNC' or length(x -> 1 ->> 'passport_code') <> 8 then raise exception 'FAIL: mã %', x -> 1; end if;
  -- Dưới 11 tuổi: con dưới phụ huynh (quan hệ guardian); 2010 → 16 tuổi: tự chơi
  if not exists (select 1 from public.student_guardians sg join public.students s on s.id = sg.student_id
                 join public.guardians g on g.id = sg.guardian_id where s.full_name = 'Bé Đại Sứ' and sg.relationship = 'guardian' and g.phone = '+84911000222') then
    raise exception 'FAIL: hồ sơ con dưới phụ huynh';
  end if;
  if not exists (select 1 from public.student_guardians sg join public.students s on s.id = sg.student_id
                 where s.full_name = 'Anh Đại Sứ' and sg.relationship = 'self') then raise exception 'FAIL: 16 tuổi tự chơi'; end if;
  -- Việc của người sinh đủ theo vai: A 15, C2 12 (vai C), D1 8
  select count(*) into n from public.event_crew_tasks t join public.event_crew_assignments a on a.id = t.assignment_id
  join public.event_crew_slots s on s.id = a.slot_id where a.event_id = ev and s.slot_code = 'C2';
  if n <> 12 then raise exception 'FAIL: việc C2 = %', n; end if;
  if (select count(*) from public.event_crew_tasks t join public.event_crew_assignments a on a.id = t.assignment_id where a.event_id = ev) <> 15 + 12 + 8 + 8 then
    raise exception 'FAIL: tổng việc';
  end if;

  -- Trùng tên: admin chọn dùng hồ sơ có sẵn
  x := public.crew_import(ev, jsonb_build_array(jsonb_build_object('line', 5, 'full_name', 'Trần Trùng Tên', 'slot_code', 'E1',
        'contact', '0911000444', 'decision', s_same)), true);
  if (select student_id from public.event_crew_assignments a join public.event_crew_slots s on s.id = a.slot_id where a.event_id = ev and s.slot_code = 'E1') <> s_same then
    raise exception 'FAIL: chọn hồ sơ có sẵn %', x;
  end if;

  -- Nhập lại cùng danh sách: không sinh trùng, không nhân đôi việc
  x := public.crew_import(ev, r, true);
  if (select count(*) from public.event_crew_assignments where event_id = ev) <> 5 then raise exception 'FAIL: nhập lại sinh trùng'; end if;
  if (select count(*) from public.students where full_name in ('Nguyễn Mới', 'Bé Đại Sứ', 'Anh Đại Sứ')) <> 3 then raise exception 'FAIL: nhập lại tạo hồ sơ trùng'; end if;
  if (select count(*) from public.event_crew_tasks t join public.event_crew_assignments a on a.id = t.assignment_id where a.event_id = ev) <> 15 + 12 + 8 + 8 + 8 then
    raise exception 'FAIL: nhập lại nhân đôi việc';
  end if;

  -- Ô đã có người khác
  x := public.crew_import(ev, '[{"line":1,"full_name":"Người Khác","slot_code":"A","contact":"0911000999"}]', false);
  if x -> 0 ->> 'error' <> 'slot_taken' then raise exception 'FAIL: ô đã có người %', x; end if;

  -- Bảng nhân sự
  r := public.crew_roster(ev);
  if jsonb_array_length(r) <> 5 or r -> 0 ->> 'slot_code' <> 'A' or (r -> 0 ->> 'tasks')::int <> 15 then raise exception 'FAIL roster: %', r; end if;

  raise exception 'ALL_OK';
end $$;
