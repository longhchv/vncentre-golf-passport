-- Module sự kiện · S3: kích hoạt tài khoản (E6). E-R1 (kích hoạt một lần), E-R3 (khớp đủ SĐT, SĐT chưa xác minh),
-- khoá thẻ khi sai SĐT, nối nhiều thẻ cùng SĐT, chưa hoàn thành thì chưa tạo tài khoản, hồ sơ trải nghiệm.
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
  parent uuid := gen_random_uuid();      -- tài khoản mới tạo qua email (Edge Function → event_link_to_user)
  existing uuid := gen_random_uuid();    -- email đã có tài khoản → đăng nhập rồi nối
  other uuid := gen_random_uuid();
  ev uuid; batch uuid; a text; b text; c text; e text; r jsonb; ok boolean; i int; st uuid; cert uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev3-adm@example.test', now()),
    (staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev3-staff@example.test', now()),
    (parent, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev3-parent@example.test', now()),
    (existing, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev3-existing@example.test', now()),
    (other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev3-other@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  perform pg_temp.act_as(adm);
  ev := public.admin_create_event('{"name_vi":"Sự kiện thử S3","event_date":"2026-10-10"}');
  batch := public.create_event_card_batch(ev, 5);
  perform public.set_event_staff(ev, staff, true);
  perform pg_temp.act_as(null);
  update public.events set status = 'open' where id = ev;
  select passport_code into a from public.passports where batch_id = batch order by passport_code offset 0 limit 1;
  select passport_code into b from public.passports where batch_id = batch order by passport_code offset 1 limit 1;
  select passport_code into c from public.passports where batch_id = batch order by passport_code offset 2 limit 1;
  select passport_code into e from public.passports where batch_id = batch order by passport_code offset 3 limit 1;

  -- Hai con cùng SĐT (a hoàn thành, b chưa); người lớn tự chơi (c); thẻ ghi hộ không SĐT (e)
  execute 'set local role anon';
  perform public.event_register(a, '{"player_type":"child","full_name":"Con Một","phone":"0912000777"}');
  perform public.event_register(b, '{"player_type":"child","full_name":"Con Hai","phone":"0912000777"}');
  perform public.event_register(c, '{"player_type":"self","full_name":"Người Lớn Ba","phone":"0987000333"}');
  perform pg_temp.act_as(staff);
  perform public.event_staff_register(ev, e, '{"player_type":"self","full_name":"Không Số"}');
  perform public.counter_save_scores(ev, a, '{"putt":"5","chip":"5","pitch":"5","full_swing":"5"}');
  perform public.counter_complete(ev, a);
  perform public.counter_save_scores(ev, c, '{"putt":"5","chip":"5","pitch":"5","full_swing":"5"}');
  perform public.counter_complete(ev, c);
  perform public.counter_save_scores(ev, e, '{"putt":"5","chip":"5","pitch":"5","full_swing":"5"}');
  perform public.counter_complete(ev, e);

  ------------------------------------------------------------------ E-R3: phải nhập đúng đủ SĐT; sai 5 lần → khoá 24h, báo admin
  execute 'reset role'; execute 'set local role anon';
  r := public.event_phone_check(c, '0987000334');
  if r ->> 'result' <> 'wrong' or (r ->> 'remaining')::int <> 4 then raise exception 'FAIL E-R3 sai SĐT: %', r; end if;
  for i in 2..5 loop r := public.event_phone_check(c, '0900000000'); end loop;
  if r ->> 'result' <> 'locked' then raise exception 'FAIL: sai 5 lần không khoá %', r; end if;
  if public.event_phone_check(c, '0987000333') ->> 'result' <> 'locked' then raise exception 'FAIL: đang khoá vẫn đi tiếp được'; end if;
  perform pg_temp.act_as(null);
  if not exists (select 1 from public.notifications where user_id = adm and type = 'event_card_locked') then raise exception 'FAIL: không báo admin khi khoá thẻ'; end if;

  ------------------------------------------------------------------ Khớp SĐT → thấy các thẻ cùng SĐT (tên che bớt)
  execute 'set local role anon';
  r := public.event_phone_check(a, '+84912000777');
  if r ->> 'result' <> 'ok' or jsonb_array_length(r -> 'cards') <> 2 or r::text ~ 'Con Một' then raise exception 'FAIL anh chị em: %', r; end if;
  -- Thẻ không SĐT: nhập SĐT mới, bỏ qua bước khớp
  r := public.event_phone_check(e, '0911222333');
  if r ->> 'result' <> 'ok' or not (r ->> 'new_phone')::boolean then raise exception 'FAIL thẻ không SĐT: %', r; end if;

  ------------------------------------------------------------------ Chưa hoàn thành → chưa tạo tài khoản; nối từ thẻ đã hoàn thành → nối cả hai con
  perform pg_temp.act_as(null);
  execute 'set local role service_role';
  ok := false;
  begin perform public.event_link_to_user(b, parent, '{"phone":"0912000777"}'); exception when invalid_parameter_value then ok := sqlerrm = 'not_completed'; end;
  if not ok then raise exception 'FAIL: tạo tài khoản khi chưa hoàn thành'; end if;
  r := public.event_link_to_user(a, parent, '{"full_name":"Phụ Huynh","phone":"0912000777","contact_consent":true}');
  if jsonb_array_length(r -> 'students') <> 2 then raise exception 'FAIL: không nối đủ 2 con %', r; end if;
  execute 'reset role';
  if (select count(*) from public.passports where passport_code in (a, b) and status = 'active') <> 2 then raise exception 'FAIL: thẻ chưa active'; end if;
  -- E-R3: SĐT vẫn chưa xác minh (không gắn vào auth.users.phone)
  if (select phone from auth.users where id = parent) is not null then raise exception 'FAIL E-R3: SĐT bị coi là đã xác minh'; end if;
  if (select phone from public.guardians where user_id = parent) <> '+84912000777' then raise exception 'FAIL: mất SĐT liên hệ'; end if;
  if not exists (select 1 from public.consents ct join public.guardians g on g.id = ct.guardian_id where g.user_id = parent and ct.type = 'photo' and not ct.granted) then
    raise exception 'FAIL: chưa ghi đồng ý ảnh (mặc định không)';
  end if;

  ------------------------------------------------------------------ Phụ huynh thấy 2 hồ sơ trải nghiệm + điểm; tải được chứng nhận
  select ct.id into cert from public.certificates ct join public.students s on s.id = ct.student_id
  where s.full_name = 'Con Một' and ct.type = 'event_experience';
  perform pg_temp.act_as(parent);
  if (select count(*) from public.my_children() x where x.is_event_guest) <> 2 then raise exception 'FAIL: my_children chưa đánh dấu người trải nghiệm'; end if;
  select x.student_id into st from public.my_children() x where x.full_name = 'Con Một';
  r := public.event_profile(st);
  if (r ->> 'total_points')::int <> 20 or jsonb_array_length(r -> 'events' -> 0 -> 'scores') <> 4 then raise exception 'FAIL hồ sơ trải nghiệm: %', r; end if;
  if not (public.certificate_view(cert) ->> 'can_download')::boolean then
    raise exception 'FAIL: người đã kích hoạt (có email) chưa tải được chứng nhận';
  end if;

  ------------------------------------------------------------------ E-R1: thẻ đã kích hoạt không nối vào tài khoản khác
  perform pg_temp.act_as(other);
  ok := false;
  begin perform public.event_link_card_to_me(a, '{"phone":"0912000777"}'); exception when invalid_parameter_value then ok := sqlerrm = 'card_already_activated'; end;
  if not ok then raise exception 'FAIL E-R1: thẻ kích hoạt lần hai'; end if;

  ------------------------------------------------------------------ Email đã có tài khoản: đăng nhập rồi nối (thẻ không SĐT e)
  perform pg_temp.act_as(existing);
  r := public.event_link_card_to_me(e, '{"phone":"0911222333","photo_consent":true}');
  if r ->> 'result' <> 'ok' then raise exception 'FAIL nối thẻ bằng tài khoản có sẵn: %', r; end if;
  if (select status from public.passports where passport_code = e) <> 'active' then raise exception 'FAIL: thẻ e chưa active'; end if;
  if (select count(*) from public.my_children()) <> 1 then raise exception 'FAIL: tài khoản có sẵn không thấy hồ sơ'; end if;

  raise exception 'ALL_OK';
end $$;
