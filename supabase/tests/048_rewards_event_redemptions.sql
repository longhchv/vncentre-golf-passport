-- Spec 19 · bước 6 (B18): mỗi lần đổi quà ở quầy sự kiện thành một cặp dòng sổ (+ điểm sự kiện, − quà), tổng = 0.
-- Ví điểm sự kiện của thẻ và số dư điểm thưởng không đổi. Toàn bộ bị huỷ ở cuối.
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
  par uuid := gen_random_uuid();
  ev uuid; k1 uuid; pp uuid; pp_none uuid; gd uuid; red uuid; red2 uuid; r jsonb; n int; bal_before int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rwe-' || x || '@example.test', now()
  from unnest(array[adm, par]) x;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  perform pg_temp.act_as(adm);
  ev := public.admin_create_event('{"name_vi":"Đợt đổi quà thử","event_date":"2026-11-15"}');
  perform pg_temp.act_as(null);

  insert into public.students (full_name, birth_year) values ('Test RWE Một', 2016) returning id into k1;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH RWE', '+84900004801', par) returning id into gd;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (k1, gd, 'mother', true, true, 'admin', 'active', now());
  insert into public.passports (tier_id, student_id, status) values ((select id from public.passport_tiers where code = 'event_experience'), k1, 'active') returning id into pp;
  insert into public.passports (tier_id, status) values ((select id from public.passport_tiers where code = 'event_experience'), 'unassigned') returning id into pp_none;
  insert into public.reward_ledger (student_id, delta, reason, source_type) values (k1, 120, 'admin_adjust', 'test');
  select coalesce(sum(delta), 0) into bal_before from public.reward_ledger where student_id = k1;

  insert into public.event_redemptions (passport_id, event_id, points, gift_label) values (pp, ev, 40, 'Bóng tập') returning id into red;
  if (select count(*) from public.reward_ledger where source_type = 'event_redemption' and source_id = red) <> 2 then raise exception 'FAIL thiếu cặp dòng'; end if;
  if not exists (select 1 from public.reward_ledger where source_id = red and reason = 'event_redemption' and delta = -40 and student_id = k1) then raise exception 'FAIL dòng quà'; end if;
  if not exists (select 1 from public.reward_ledger where source_id = red and reason = 'event_points' and delta = 40) then raise exception 'FAIL dòng điểm sự kiện'; end if;
  if (select sum(delta) from public.reward_ledger where student_id = k1) <> bal_before then raise exception 'FAIL số dư điểm thưởng bị đổi'; end if;
  if (select note from public.reward_ledger where source_id = red and reason = 'event_redemption') <> 'Đợt đổi quà thử · Bóng tập' then raise exception 'FAIL ghi chú'; end if;
  if (public.event_card_points(pp) ->> 'redeemed')::int <> 40 then raise exception 'FAIL ví sự kiện bị đổi'; end if;

  -- Chạy lại không sinh trùng
  perform public.reward_record_event_redemption(red);
  if (select count(*) from public.reward_ledger where source_id = red) <> 2 then raise exception 'FAIL ghi trùng'; end if;

  -- Thẻ chưa gắn học viên: không có dòng sổ
  insert into public.event_redemptions (passport_id, event_id, points) values (pp_none, ev, 10) returning id into red2;
  if exists (select 1 from public.reward_ledger where source_id = red2) then raise exception 'FAIL thẻ không học viên vẫn ghi sổ'; end if;

  -- Ví điểm của phụ huynh hiện tên sự kiện và quà
  perform pg_temp.act_as(par);
  r := public.reward_balance(k1);
  if not exists (select 1 from jsonb_array_elements(r -> 'recent') x where x ->> 'reason' = 'event_redemption'
                   and x #>> '{event,name_vi}' = 'Đợt đổi quà thử' and x #>> '{event,gift_label}' = 'Bóng tập') then
    raise exception 'FAIL ví thiếu sự kiện: %', r -> 'recent';
  end if;
  if (r ->> 'available')::int <> bal_before then raise exception 'FAIL số dư khả dụng'; end if;
  perform pg_temp.act_as(null);
  if has_function_privilege('authenticated', 'public.reward_record_event_redemption(uuid)', 'execute') then raise exception 'FAIL hàm lộ ra ngoài'; end if;

  raise exception 'ALL_OK';
end $$;
