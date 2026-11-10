-- Spec 19 · D60: nhập số dư điểm thưởng đầu kỳ từ file Excel (đối chiếu hồ sơ + ghi sổ, tải lại không cộng trùng).
-- Toàn bộ bị huỷ ở cuối.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

create or replace function pg_temp.bal(p uuid) returns int language sql as $f$
  select coalesce(sum(delta), 0)::int from public.reward_ledger where student_id = p
$f$;

do $$
declare
  adm uuid := gen_random_uuid();
  head uuid := gen_random_uuid();
  sch uuid; k1 uuid; k2 uuid; k3 uuid; k4 uuid; c1 text; g uuid; r jsonb; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rwo-' || x || '@example.test', now()
  from unnest(array[adm, head]) x;
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (head, 'head_coach');
  insert into public.schools (name, type) values ('Trường Thử RWO', 'public') returning id into sch;
  insert into public.students (full_name, birth_year) values ('Test RWO Một', 2016) returning id, student_code into k1, c1;
  -- Hai bạn trùng tên "Test RWO Trùng": khác năm sinh / khác SĐT phụ huynh
  insert into public.students (full_name, birth_year, current_school_id) values ('Test RWO Trùng', 2015, sch) returning id into k2;
  insert into public.students (full_name, birth_year) values ('Test RWO Trùng', 2015) returning id into k3;
  insert into public.students (full_name, birth_year) values ('Test RWO Trùng', 2017) returning id into k4;
  insert into public.guardians (full_name, phone) values ('Test PH RWO', '+84900004901') returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (k3, g, 'mother', true, true, 'admin', 'active', now());

  -- Chỉ admin
  perform pg_temp.act_as(head);
  ok := false;
  begin perform public.reward_import_match('[{"row":2,"name":"Test RWO Một"}]'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL HLV trưởng đối chiếu được'; end if;

  perform pg_temp.act_as(adm);
  r := public.reward_import_match(jsonb_build_array(
    jsonb_build_object('row', 2, 'name', 'TEST RWO MOT'),                                   -- không dấu, viết hoa
    jsonb_build_object('row', 3, 'code', c1, 'name', 'Sai tên'),                            -- mã học viên thắng
    jsonb_build_object('row', 4, 'name', 'Test RWO Trùng'),                                 -- 3 hồ sơ
    jsonb_build_object('row', 5, 'name', 'Test RWO Trùng', 'year', '2015'),                 -- còn 2
    jsonb_build_object('row', 6, 'name', 'Test RWO Trùng', 'year', '2015', 'phone', '0900004901'),
    jsonb_build_object('row', 7, 'name', 'Test RWO Trùng', 'year', '2015', 'school', 'thu rwo'),
    jsonb_build_object('row', 8, 'name', 'Test RWO Trùng', 'year', '2017'),
    jsonb_build_object('row', 9, 'name', 'Không Có Ai RWO'),
    jsonb_build_object('row', 10, 'name', 'Test RWO Một', 'year', '2010')));
  if r -> 0 ->> 'status' <> 'matched' or (r -> 0 -> 'candidates' -> 0 ->> 'id')::uuid <> k1 then raise exception 'FAIL tên không dấu: %', r -> 0; end if;
  if (r -> 1 -> 'candidates' -> 0 ->> 'id')::uuid <> k1 then raise exception 'FAIL theo mã'; end if;
  if r -> 2 ->> 'status' <> 'ambiguous' or jsonb_array_length(r -> 2 -> 'candidates') <> 3 then raise exception 'FAIL trùng tên'; end if;
  if r -> 3 ->> 'status' <> 'ambiguous' or jsonb_array_length(r -> 3 -> 'candidates') <> 2 then raise exception 'FAIL lọc năm sinh'; end if;
  if (r -> 4 -> 'candidates' -> 0 ->> 'id')::uuid <> k3 or r -> 4 ->> 'status' <> 'matched' then raise exception 'FAIL lọc SĐT'; end if;
  if (r -> 5 -> 'candidates' -> 0 ->> 'id')::uuid <> k2 or r -> 5 ->> 'status' <> 'matched' then raise exception 'FAIL lọc trường'; end if;
  if (r -> 6 -> 'candidates' -> 0 ->> 'id')::uuid <> k4 then raise exception 'FAIL năm 2017'; end if;
  if r -> 7 ->> 'status' <> 'not_found' then raise exception 'FAIL không có'; end if;
  if r -> 8 ->> 'status' <> 'not_found' then raise exception 'FAIL sai năm sinh vẫn khớp'; end if;

  -- Ghi lần đầu
  r := public.reward_import_opening(jsonb_build_array(
    jsonb_build_object('student_id', k1, 'points', 350),
    jsonb_build_object('student_id', k2, 'points', 0),
    jsonb_build_object('student_id', k3, 'points', 120)), 'so-du.xlsx');
  if r <> '{"inserted":2,"adjusted":0,"unchanged":1}' then raise exception 'FAIL kết quả lần 1: %', r; end if;
  if pg_temp.bal(k1) <> 350 or pg_temp.bal(k2) <> 0 or pg_temp.bal(k3) <> 120 then raise exception 'FAIL số dư lần 1'; end if;
  if (select note from public.reward_ledger where student_id = k1) <> 'so-du.xlsx' then raise exception 'FAIL ghi chú'; end if;

  -- Tải lại file đã sửa: chỉ ghi chênh lệch, không cộng trùng
  r := public.reward_import_opening(jsonb_build_array(
    jsonb_build_object('student_id', k1, 'points', 300),
    jsonb_build_object('student_id', k3, 'points', 120),
    jsonb_build_object('student_id', k2, 'points', 50)), null);
  if r <> '{"inserted":1,"adjusted":1,"unchanged":1}' then raise exception 'FAIL kết quả lần 2: %', r; end if;
  if pg_temp.bal(k1) <> 300 or pg_temp.bal(k3) <> 120 or pg_temp.bal(k2) <> 50 then raise exception 'FAIL số dư lần 2'; end if;
  if not exists (select 1 from public.reward_ledger where student_id = k1 and reason = 'opening_balance_adjust' and delta = -50) then raise exception 'FAIL dòng chênh'; end if;

  -- Đối chiếu hiện số dư đầu kỳ đã nhập
  r := public.reward_import_match('[{"row":2,"name":"Test RWO Một"}]');
  if (r -> 0 -> 'candidates' -> 0 ->> 'opening')::int <> 300 or (r -> 0 -> 'candidates' -> 0 ->> 'available')::int <> 300 then raise exception 'FAIL hiện số đã nhập: %', r; end if;

  -- Dữ liệu sai
  ok := false;
  begin perform public.reward_import_opening(jsonb_build_array(jsonb_build_object('student_id', k1, 'points', -5))); exception when invalid_parameter_value then ok := sqlerrm = 'invalid_points'; end;
  if not ok then raise exception 'FAIL điểm âm'; end if;
  ok := false;
  begin perform public.reward_import_opening(jsonb_build_array(jsonb_build_object('student_id', k1, 'points', 1), jsonb_build_object('student_id', k1, 'points', 2))); exception when invalid_parameter_value then ok := sqlerrm = 'duplicate_student'; end;
  if not ok then raise exception 'FAIL trùng học viên'; end if;
  ok := false;
  begin perform public.reward_import_opening(jsonb_build_array(jsonb_build_object('student_id', gen_random_uuid(), 'points', 1))); exception when no_data_found then ok := true; end;
  if not ok then raise exception 'FAIL học viên không tồn tại'; end if;

  -- Gộp hồ sơ: số dư đầu kỳ đi theo
  perform pg_temp.act_as(null);
  update public.students set merged_into_student_id = k4 where id = k3;
  if pg_temp.bal(k4) <> 120 or pg_temp.bal(k3) <> 0 then raise exception 'FAIL gộp hồ sơ'; end if;

  raise exception 'ALL_OK';
end $$;
