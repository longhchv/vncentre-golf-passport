-- Module sự kiện · S4: tự xác nhận bằng ảnh (E5), E-R4 (không vào hàng chờ F12), E-R6/E-R7/E-R8 khi duyệt ảnh,
-- E-R14 (không gửi ảnh sau hạn), tối đa yêu cầu mở, bảng theo dõi, bảng điều khiển không tính event_guest.
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
  ev uuid; batch uuid; a text; b text; r jsonb; ok boolean; cl uuid; i int; n_students bigint; n_guests bigint;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev4-adm@example.test', now()),
    (staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ev4-staff@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  perform pg_temp.act_as(adm);
  r := public.admin_dashboard();
  n_students := (r ->> 'students')::bigint; n_guests := (r ->> 'event_guests')::bigint;
  ev := public.admin_create_event('{"name_vi":"Sự kiện thử S4","event_date":"2026-10-10"}');
  batch := public.create_event_card_batch(ev, 3);
  perform public.set_event_staff(ev, staff, true);
  perform pg_temp.act_as(null);
  update public.events set status = 'open' where id = ev;
  select passport_code into a from public.passports where batch_id = batch order by passport_code offset 0 limit 1;
  select passport_code into b from public.passports where batch_id = batch order by passport_code offset 1 limit 1;
  execute 'set local role anon';
  perform public.event_register(a, '{"player_type":"child","full_name":"Con Ảnh","phone":"0912000888"}');
  perform public.event_register(b, '{"player_type":"self","full_name":"Người Ảnh","phone":"0912000999"}');

  ------------------------------------------------------------------ Người chơi không tự gọi được hàm gửi ảnh (chỉ qua Edge Function)
  ok := false;
  begin perform public.event_submit_claim(a, ev || '/' || a || '/x.jpg'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: anon gọi thẳng event_submit_claim'; end if;

  ------------------------------------------------------------------ Gửi ảnh → pending_review; đang chờ thì không gửi tiếp
  perform pg_temp.act_as(null);
  execute 'set local role service_role';
  perform public.event_submit_claim(a, ev || '/' || a || '/1.jpg');
  if (select completion_status from public.event_participations ep join public.passports p on p.id = ep.passport_id where p.passport_code = a) <> 'pending_review' then
    raise exception 'FAIL: chưa chuyển pending_review';
  end if;
  ok := false;
  begin perform public.event_claim_check(a); exception when invalid_parameter_value then ok := sqlerrm = 'claim_not_allowed'; end;
  if not ok then raise exception 'FAIL: gửi ảnh khi đang chờ duyệt'; end if;
  ok := false;
  begin perform public.event_submit_claim(b, ev || '/' || a || '/2.jpg'); exception when invalid_parameter_value then ok := sqlerrm = 'invalid_path'; end;
  if not ok then raise exception 'FAIL: đường dẫn ảnh của thẻ khác'; end if;

  ------------------------------------------------------------------ E-R4: không vào hàng chờ F12; bảng điều khiển không tính event_guest
  perform pg_temp.act_as(adm);
  r := public.admin_dashboard();
  if (r ->> 'students')::bigint <> n_students or (r ->> 'event_guests')::bigint <> n_guests + 2 then raise exception 'FAIL quyết định 13: %', r; end if;
  if (r -> 'queue' ->> 'students')::bigint <> (select count(*) from public.students where verification_status = 'pending_review' and deleted_at is null and merged_into_student_id is null) then
    raise exception 'FAIL E-R4';
  end if;

  ------------------------------------------------------------------ Hàng chờ: nhân viên sự kiện không xem được; admin thấy 1 yêu cầu
  perform pg_temp.act_as(staff);
  ok := false;
  begin perform public.event_claims_queue(ev); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: event_staff xem hàng chờ ảnh'; end if;
  perform pg_temp.act_as(adm);
  r := public.event_claims_queue(ev);
  if jsonb_array_length(r) <> 1 or r -> 0 ->> 'full_name' <> 'Con Ảnh' then raise exception 'FAIL hàng chờ: %', r; end if;
  cl := (r -> 0 ->> 'id')::uuid;

  ------------------------------------------------------------------ Từ chối cần lý do → rejected, người chơi thấy lý do, gửi lại được
  ok := false;
  begin perform public.event_review_claim(cl, false, '{}', ' '); exception when invalid_parameter_value then ok := sqlerrm = 'reason_required'; end;
  if not ok then raise exception 'FAIL: từ chối không lý do'; end if;
  perform public.event_review_claim(cl, false, '{}', 'Ảnh mờ');
  execute 'reset role'; execute 'set local role anon';
  r := public.event_card_status(a);
  if r -> 'participation' ->> 'completion_status' <> 'rejected' or r -> 'participation' ->> 'reject_reason' <> 'Ảnh mờ' then raise exception 'FAIL từ chối: %', r; end if;

  ------------------------------------------------------------------ Tối đa 3 yêu cầu đang chờ hoặc bị từ chối
  perform pg_temp.act_as(null);
  execute 'set local role service_role';
  perform public.event_submit_claim(a, ev || '/' || a || '/2.jpg');
  perform pg_temp.act_as(adm);
  perform public.event_review_claim((public.event_claims_queue(ev) -> 0 ->> 'id')::uuid, false, '{}', 'Thiếu dấu');
  perform pg_temp.act_as(null);
  execute 'set local role service_role';
  perform public.event_submit_claim(a, ev || '/' || a || '/3.jpg');
  perform pg_temp.act_as(adm);
  cl := (public.event_claims_queue(ev) -> 0 ->> 'id')::uuid;
  perform pg_temp.act_as(null);
  ok := false;
  begin perform public.event_claim_check(a); exception when invalid_parameter_value then ok := sqlerrm in ('too_many_claims', 'claim_not_allowed'); end;
  if not ok then raise exception 'FAIL: quá số yêu cầu'; end if;

  ------------------------------------------------------------------ E-R6: duyệt khi thiếu trạm bị chặn; đủ 4 trạm → completed (self_claim) + chứng nhận
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.event_review_claim(cl, true, '{"putt":"5","chip":"5","pitch":"0"}'); exception when invalid_parameter_value then ok := sqlerrm like 'stations_incomplete:%'; end;
  if not ok then raise exception 'FAIL E-R6 khi duyệt ảnh'; end if;
  perform public.event_review_claim(cl, true, '{"putt":"5","chip":"10","pitch":"5","full_swing":"5"}');
  perform pg_temp.act_as(null);
  if (select ep.completed_via from public.event_participations ep join public.passports p on p.id = ep.passport_id where p.passport_code = a) <> 'self_claim' then
    raise exception 'FAIL: completed_via';
  end if;
  if not exists (select 1 from public.certificates ct join public.event_participations ep on ep.student_id = ct.student_id
                 join public.passports p on p.id = ep.passport_id where p.passport_code = a and ct.type = 'event_experience') then
    raise exception 'FAIL E-R7: chưa có chứng nhận sau khi duyệt';
  end if;
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.event_review_claim(cl, true, '{}'); exception when invalid_parameter_value then ok := sqlerrm = 'claim_not_pending'; end;
  if not ok then raise exception 'FAIL: duyệt hai lần'; end if;

  ------------------------------------------------------------------ E-R14: hết hạn gửi ảnh
  perform pg_temp.act_as(null);
  update public.events set self_claim_closes_at = now() - interval '1 minute' where id = ev;
  ok := false;
  begin perform public.event_claim_check(b); exception when invalid_parameter_value then ok := sqlerrm = 'claim_closed'; end;
  if not ok then raise exception 'FAIL E-R14: gửi ảnh sau hạn'; end if;

  ------------------------------------------------------------------ Bảng theo dõi: nhân viên sự kiện xem được, số đếm đúng
  perform pg_temp.act_as(staff);
  perform public.counter_redeem(ev, a, 10);
  r := public.event_live_stats(ev);
  if (r ->> 'cards')::int <> 3 or (r ->> 'registered')::int <> 2 or (r ->> 'completed_self_claim')::int <> 1 or (r ->> 'gift_cards')::int <> 1
     or (r ->> 'gift_points')::int <> 10 or (r ->> 'players_child')::int <> 1 then
    raise exception 'FAIL bảng theo dõi: %', r;
  end if;

  raise exception 'ALL_OK';
end $$;
