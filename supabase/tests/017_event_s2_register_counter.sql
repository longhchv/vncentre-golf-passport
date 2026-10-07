-- Module sự kiện · S2: ghi tên (E2), quầy đổi quà (E4), đổi quà bằng điểm (B18), chứng nhận sự kiện.
-- Quy tắc: E-R1, E-R2, E-R4, E-R6, E-R7, E-R8, E-R10, E-R12, E-R13, E-R14, B18.
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
  outsider uuid := gen_random_uuid();
  ev uuid; ev2 uuid; batch uuid; batch2 uuid; a text; b text; c text; d text; x text; r jsonb; ok boolean; n int; users_before int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev2-adm@example.test', now()),
    (staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev2-staff@example.test', now()),
    (outsider, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev2-out@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (outsider, 'coach');
  perform pg_temp.act_as(adm);
  ev := public.admin_create_event('{"name_vi":"Sự kiện thử S2","event_date":"2026-10-10","venue":"Hồ Hoàn Kiếm"}');
  ev2 := public.admin_create_event('{"name_vi":"Đợt đổi quà tháng 11","event_date":"2026-11-15"}');
  batch := public.create_event_card_batch(ev, 6);
  batch2 := public.create_event_card_batch(ev2, 1);
  perform public.set_event_staff(ev, staff, true);
  perform public.set_event_staff(ev2, staff, true);
  perform pg_temp.act_as(null);
  select passport_code into a from public.passports where batch_id = batch order by passport_code offset 0 limit 1;
  select passport_code into b from public.passports where batch_id = batch order by passport_code offset 1 limit 1;
  select passport_code into c from public.passports where batch_id = batch order by passport_code offset 2 limit 1;
  select passport_code into d from public.passports where batch_id = batch order by passport_code offset 3 limit 1;
  select passport_code into x from public.passports where batch_id = batch2 limit 1;

  ------------------------------------------------------------------ /p: passport_lookup báo thẻ sự kiện
  execute 'set local role anon';
  if public.passport_lookup(a) ->> 'result' <> 'event' then raise exception 'FAIL: /p không nhận ra thẻ sự kiện'; end if;

  ------------------------------------------------------------------ E-R14: sự kiện chưa mở → không ghi tên
  ok := false;
  begin perform public.event_register(a, '{"player_type":"child","full_name":"Bé An","phone":"0912000111"}');
  exception when invalid_parameter_value then ok := sqlerrm = 'registration_closed'; end;
  if not ok then raise exception 'FAIL E-R14: ghi tên khi sự kiện chưa mở'; end if;
  perform pg_temp.act_as(null);
  update public.events set status = 'open', registration_opens_at = now() - interval '1 hour', registration_closes_at = now() + interval '2 hours' where id in (ev, ev2);

  ------------------------------------------------------------------ E2: tự ghi tên, không tài khoản, không OTP (E-R2)
  select count(*) into users_before from auth.users;
  execute 'set local role anon';
  ok := false;
  begin perform public.event_register(a, '{"player_type":"child","full_name":"Bé An"}');
  exception when invalid_parameter_value then ok := sqlerrm = 'phone_required'; end;
  if not ok then raise exception 'FAIL: tự ghi tên không SĐT'; end if;
  r := public.event_register(a, '{"player_type":"child","full_name":"Nguyễn  Văn   An","phone":"0912 000 111","age":"9","residence":"Hà Nội","contact_consent":true}');
  if r ->> 'masked_name' <> 'Nguyễn V. A.' then raise exception 'FAIL E2: %', r; end if;
  -- Cùng SĐT, con thứ hai → dùng chung người giám hộ
  perform public.event_register(b, '{"player_type":"child","full_name":"Nguyễn Văn Bình","phone":"+84912000111"}');
  -- Người lớn tự chơi
  perform public.event_register(c, '{"player_type":"self","full_name":"Trần Thị Cúc","phone":"0987000222"}');
  -- E-R1: không ghi tên lại
  ok := false;
  begin perform public.event_register(a, '{"player_type":"self","full_name":"Kẻ gian","phone":"0900000000"}');
  exception when invalid_parameter_value then ok := sqlerrm = 'card_already_registered'; end;
  if not ok then raise exception 'FAIL E-R1: ghi tên lại thẻ đã ghi'; end if;
  perform pg_temp.act_as(null);
  if (select count(*) from auth.users) <> users_before then raise exception 'FAIL E-R2: ghi tên tạo tài khoản đăng nhập'; end if;
  if (select status from public.passports where passport_code = a) <> 'event_registered' then raise exception 'FAIL: thẻ chưa event_registered'; end if;
  if (select count(distinct sg.guardian_id) from public.event_participations ep join public.student_guardians sg on sg.student_id = ep.student_id
      join public.passports p on p.id = ep.passport_id where p.passport_code in (a, b)) <> 1 then raise exception 'FAIL: hai con cùng SĐT không chung người giám hộ'; end if;
  if (select sg.relationship from public.event_participations ep join public.student_guardians sg on sg.student_id = ep.student_id
      join public.passports p on p.id = ep.passport_id where p.passport_code = c) <> 'self' then raise exception 'FAIL: "Tôi chơi" không ghi quan hệ self'; end if;
  if not exists (select 1 from public.consents ct join public.event_participations ep on ep.student_id = ct.student_id join public.passports p on p.id = ep.passport_id
                 where p.passport_code = a and ct.type = 'contact_by_vncentre' and ct.granted) then raise exception 'FAIL: chưa ghi đồng ý liên hệ'; end if;
  -- E-R4: hồ sơ event_guest không vào hàng chờ F12
  perform pg_temp.act_as(adm);
  if jsonb_array_length(public.review_queue() -> 'students') <> (select count(*) from public.students where verification_status = 'pending_review' and deleted_at is null and merged_into_student_id is null) then
    raise exception 'FAIL E-R4: hàng chờ học viên lẫn event_guest';
  end if;

  ------------------------------------------------------------------ Quyền quầy: người ngoài không dùng được
  perform pg_temp.act_as(outsider);
  ok := false;
  begin perform public.counter_card(ev, a); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người không phải nhân viên sự kiện mở được quầy'; end if;

  ------------------------------------------------------------------ Nhân viên ghi tên hộ: SĐT tuỳ chọn, ngoài khung giờ vẫn được khi sự kiện còn mở
  perform pg_temp.act_as(null);
  update public.events set registration_closes_at = now() - interval '1 minute' where id = ev;
  execute 'set local role anon';
  ok := false;
  begin perform public.event_register(d, '{"player_type":"self","full_name":"Muộn","phone":"0900000001"}');
  exception when invalid_parameter_value then ok := sqlerrm = 'registration_closed'; end;
  if not ok then raise exception 'FAIL E-R14: tự ghi tên sau giờ đóng'; end if;
  perform pg_temp.act_as(staff);
  perform public.event_staff_register(ev, d, '{"player_type":"self","full_name":"Lê Văn Dũng"}');

  ------------------------------------------------------------------ E4: điểm, E-R12, E-R10, E-R6
  r := public.counter_card(ev, a);
  if r::text ~ '0912000111|\+84912' or r -> 'participation' ->> 'full_name' <> 'Nguyễn Văn An' then raise exception 'FAIL E-R12: quầy lộ SĐT hoặc sai tên %', r; end if;
  ok := false;
  begin perform public.counter_save_scores(ev, a, '{"putt":"7"}'); exception when invalid_parameter_value then ok := sqlerrm = 'invalid_score:putt'; end;
  if not ok then raise exception 'FAIL E-R10: điểm không chia hết cho bước'; end if;
  ok := false;
  begin perform public.counter_save_scores(ev, a, '{"chip":"-5"}'); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL E-R10: điểm âm'; end if;
  perform public.counter_save_scores(ev, a, '{"putt":"10","chip":"0","pitch":"5","full_swing":"15"}');
  ok := false;
  begin perform public.counter_complete(ev, a); exception when invalid_parameter_value then ok := sqlerrm = 'stations_incomplete:chip'; end;
  if not ok then raise exception 'FAIL E-R6: hoàn thành khi trạm Chip 0 điểm'; end if;
  if exists (select 1 from public.certificates ct join public.event_participations ep on ep.student_id = ct.student_id join public.passports p on p.id = ep.passport_id where p.passport_code = a) then
    raise exception 'FAIL E-R7: có chứng nhận khi chưa hoàn thành';
  end if;
  r := public.counter_save_scores(ev, a, '{"chip":"5"}');
  r := public.counter_complete(ev, a);
  if r -> 'participation' ->> 'completion_status' <> 'completed' or r -> 'participation' ->> 'completed_via' <> 'counter' then raise exception 'FAIL hoàn thành: %', r; end if;
  if (r -> 'points' ->> 'balance')::int <> 35 then raise exception 'FAIL tổng điểm: %', r -> 'points'; end if;
  -- Chứng nhận ngay, không có điểm (E-R7)
  perform pg_temp.act_as(null);
  select count(*) into n from public.certificates ct join public.event_participations ep on ep.student_id = ct.student_id join public.passports p on p.id = ep.passport_id
  where p.passport_code = a and ct.type = 'event_experience' and ct.status = 'valid' and not (ct.data ?| array['score', 'scores', 'points']);
  if n <> 1 then raise exception 'FAIL E-R7: chứng nhận sự kiện %', n; end if;
  perform pg_temp.act_as(staff);
  ok := false;
  begin perform public.counter_complete(ev, a); exception when invalid_parameter_value then ok := sqlerrm = 'already_completed'; end;
  if not ok then raise exception 'FAIL: hoàn thành hai lần'; end if;
  -- E-R13: sửa điểm sau khi hoàn thành phải có lý do, ghi nhật ký
  ok := false;
  begin perform public.counter_save_scores(ev, a, '{"putt":"20"}'); exception when invalid_parameter_value then ok := sqlerrm = 'reason_required'; end;
  if not ok then raise exception 'FAIL E-R13: sửa điểm không lý do'; end if;
  perform public.counter_save_scores(ev, a, '{"putt":"20"}', 'HLV đếm nhầm');
  perform pg_temp.act_as(null);
  if not exists (select 1 from public.audit_logs where entity_type = 'event_scores' and reason = 'HLV đếm nhầm') then raise exception 'FAIL E-R13: không ghi nhật ký kèm lý do'; end if;

  ------------------------------------------------------------------ B18: đổi quà nhiều lần, không vượt điểm còn lại (45)
  perform pg_temp.act_as(staff);
  r := public.counter_redeem(ev, a, 20, 'Mũ golf');
  if (r -> 'points' ->> 'balance')::int <> 25 then raise exception 'FAIL B18 lần 1: %', r -> 'points'; end if;
  ok := false;
  begin perform public.counter_redeem(ev, a, 30); exception when invalid_parameter_value then ok := sqlerrm = 'not_enough_points:25'; end;
  if not ok then raise exception 'FAIL B18: đổi vượt điểm còn lại'; end if;
  -- Đợt đổi quà sau (sự kiện khác) vẫn đổi được thẻ của sự kiện trước, nhưng không nhập điểm được
  r := public.counter_card(ev2, a);
  if (r ->> 'same_event')::boolean then raise exception 'FAIL: nhầm sự kiện'; end if;
  ok := false;
  begin perform public.counter_save_scores(ev2, a, '{"putt":"5"}'); exception when invalid_parameter_value then ok := sqlerrm = 'card_other_event'; end;
  if not ok then raise exception 'FAIL: nhập điểm thẻ của sự kiện khác'; end if;
  r := public.counter_redeem(ev2, a, 25, 'Bóng golf');
  if (r -> 'points' ->> 'balance')::int <> 0 or jsonb_array_length(r -> 'redemptions') <> 2 then raise exception 'FAIL B18 lần 2: %', r; end if;

  ------------------------------------------------------------------ E-R8: người chơi không tự hoàn thành / đổi quà
  execute 'reset role'; execute 'set local role anon';
  ok := false;
  begin perform public.counter_complete(ev, b); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL E-R8: khách tự hoàn thành'; end if;
  r := public.event_card_status(a);
  if r::text ~ '0912000111' or r -> 'participation' ->> 'completion_status' <> 'completed' then raise exception 'FAIL trạng thái công khai: %', r; end if;

  raise exception 'ALL_OK';
end $$;
