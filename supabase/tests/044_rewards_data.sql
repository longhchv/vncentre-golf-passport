-- Spec 19 · bước 2 (dữ liệu): reason mới, sổ không sửa / xoá được, chống ghi trùng dòng gốc, hệ số điểm thưởng,
-- cờ reward_enabled, danh mục nguồn điểm, kho quà. Tiêu chí 11 ở tầng dữ liệu. Toàn bộ bị huỷ ở cuối.
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
  ua uuid := gen_random_uuid();     -- phụ huynh
  kid uuid; ga uuid; ser uuid; sea uuid; t1 uuid; g uuid; o uuid; l1 uuid; l2 uuid; vid uuid := gen_random_uuid();
  ok boolean; n int; r jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rw-' || x || '@example.test', now()
  from unnest(array[adm, ua]) x;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.students (full_name, birth_year) values ('Test Điểm Thưởng', 2016) returning id into kid;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH Điểm', '+84900004401', ua) returning id into ga;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (kid, ga, 'mother', true, true, 'admin', 'active', now());

  ------------------------------------------------------------------ Tiêu chí 11: dòng partner_visit cũ vẫn ghi / tính số dư đúng
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id) values (kid, 30, 'partner_visit', 'partner_visit', vid) returning id into l1;
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, note) values (kid, -30, 'partner_visit_void', 'partner_visit', vid, 'sai') ;
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id) values (kid, 25, 'partner_visit', 'partner_visit', gen_random_uuid());
  insert into public.reward_ledger (student_id, delta, reason, note) values (kid, 5, 'admin_adjust', 'chỉnh tay');
  perform pg_temp.act_as(ua);
  r := public.reward_balance(kid);
  if (r ->> 'balance')::int <> 30 then raise exception 'FAIL số dư partner_visit cũ: %', r; end if;
  perform pg_temp.act_as(null);

  -- Mọi reason mới đều ghi được
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id)
  select kid, 1, x, 'test', gen_random_uuid()
  from unnest(array['tournament_result', 'tournament_result_adjust', 'school_award', 'attendance', 'attendance_full_month', 'skill_passed',
                    'level_up', 'conduct', 'theory_test', 'practice_test', 'manual_void', 'gift_order', 'gift_order_refund', 'merge_transfer']) x;
  ok := false;
  begin insert into public.reward_ledger (student_id, delta, reason) values (kid, 1, 'culture_award'); exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL reason lạ vẫn ghi được'; end if;

  -- Cột mới; expires_at để trống
  if exists (select 1 from public.reward_ledger where student_id = kid and expires_at is not null) then raise exception 'FAIL expires_at phải để trống'; end if;

  ------------------------------------------------------------------ Nguyên tắc 2: không sửa, không xoá dòng sổ (kể cả admin / service)
  ok := false;
  begin update public.reward_ledger set delta = 999 where id = l1; exception when check_violation then ok := sqlerrm = 'ledger_immutable'; end;
  if not ok then raise exception 'FAIL sửa được delta'; end if;
  ok := false;
  begin update public.reward_ledger set student_id = gen_random_uuid() where id = l1; exception when check_violation then ok := true; when foreign_key_violation then ok := false; end;
  if not ok then raise exception 'FAIL sửa được student_id'; end if;
  ok := false;
  begin delete from public.reward_ledger where id = l1; exception when check_violation then ok := sqlerrm = 'ledger_immutable'; end;
  if not ok then raise exception 'FAIL xoá được dòng sổ'; end if;
  -- Q3: riêng is_frozen / cycle_no đổi được
  update public.reward_ledger set is_frozen = true, cycle_no = 1 where id = l1;
  if not (select is_frozen from public.reward_ledger where id = l1) then raise exception 'FAIL không đổi được is_frozen'; end if;

  ------------------------------------------------------------------ Nguyên tắc 5: một dòng gốc mỗi (source_type, source_id, reason)
  ok := false;
  begin insert into public.reward_ledger (student_id, delta, reason, source_type, source_id) values (kid, 30, 'partner_visit', 'partner_visit', vid);
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL ghi trùng dòng gốc partner_visit'; end if;
  o := gen_random_uuid();
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id) values (kid, 550, 'tournament_result', 'tournament_result', o);
  ok := false;
  begin insert into public.reward_ledger (student_id, delta, reason, source_type, source_id) values (kid, 550, 'tournament_result', 'tournament_result', o);
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL ghi trùng dòng gốc tournament_result'; end if;
  -- Dòng điều chỉnh thì nhiều lần được
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id) values (kid, -200, 'tournament_result_adjust', 'tournament_result', o), (kid, 50, 'tournament_result_adjust', 'tournament_result', o);
  -- Một dòng chỉ bị huỷ một lần
  insert into public.reward_ledger (student_id, delta, reason, source_type) values (kid, 20, 'conduct', 'reward_rule') returning id into l2;
  insert into public.reward_ledger (student_id, delta, reason, voids_id, note) values (kid, -20, 'manual_void', l2, 'nhầm');
  ok := false;
  begin insert into public.reward_ledger (student_id, delta, reason, voids_id, note) values (kid, -20, 'manual_void', l2, 'lần 2'); exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL huỷ một dòng hai lần'; end if;

  ------------------------------------------------------------------ Giải: hệ số điểm thưởng, cờ reward_enabled
  select id into ser from public.tournament_series where code = 'snag_league';
  if (select reward_coefficient from public.tournament_series where id = ser) <> 1 then raise exception 'FAIL SNAG League reward_coefficient phải = 1'; end if;
  if (select ranking_coefficient from public.tournament_series where id = ser) <> 1 then raise exception 'FAIL ranking_coefficient bị đổi'; end if;
  ok := false;
  begin update public.tournament_series set reward_coefficient = -1 where id = ser; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL hệ số âm'; end if;
  insert into public.seasons (code, name_vi, name_en, start_date, end_date) values ('test-rw', 'Mùa thử', 'Test', '2099-01-01', '2099-12-31') returning id into sea;
  insert into public.tournaments (series_id, season_id, stage_no, played_on) values (ser, sea, 91, '2099-03-28') returning id into t1;
  if not (select reward_enabled from public.tournaments where id = t1) then raise exception 'FAIL chặng mới phải reward_enabled = true'; end if;
  if (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'tournaments' and column_name = 'reward_enabled') <> 'true' then
    raise exception 'FAIL default reward_enabled';
  end if;

  ------------------------------------------------------------------ Danh mục nguồn điểm (phụ lục C1)
  select count(*) into n from public.reward_rules where code in ('school_award', 'attendance', 'attendance_full_month', 'skill_passed', 'level_up', 'conduct', 'theory_test', 'practice_test');
  if n <> 8 then raise exception 'FAIL seed reward_rules: %', n; end if;
  if exists (select 1 from public.reward_rules where code = 'culture_award') then raise exception 'FAIL culture_award không được seed'; end if;
  if not (select note_required from public.reward_rules where code = 'school_award') then raise exception 'FAIL school_award phải bắt buộc ghi chú'; end if;
  if (select (min_points, max_points) from public.reward_rules where code = 'conduct') is distinct from (10, 30) then raise exception 'FAIL khoảng conduct'; end if;
  if (select default_points from public.reward_rules where code = 'level_up') <> 200 then raise exception 'FAIL level_up 200'; end if;
  if not (select first_pass_only from public.reward_rules where code = 'theory_test') then raise exception 'FAIL theory_test chỉ lần đầu'; end if;
  ok := false;
  begin insert into public.reward_rules (code, name_vi, name_en, default_points, min_points, max_points) values ('khac', 'x', 'x', 1, 1, 1); exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL code nguồn lạ'; end if;
  ok := false;
  begin update public.reward_rules set default_points = 40 where code = 'conduct'; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL điểm mặc định ngoài khoảng'; end if;

  ------------------------------------------------------------------ Kho quà, đơn quà
  insert into public.gift_items (name_vi, name_en, kind, points) values ('Mũ VN Centre', 'VN Centre cap', 'apparel', 300) returning id into g;
  insert into public.gift_stock_moves (gift_id, qty, reason) values (g, 10, 'restock');
  ok := false;
  begin insert into public.gift_stock_moves (gift_id, qty, reason) values (g, -1, 'order'); exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL xuất kho đơn không có order_id'; end if;
  ok := false;
  begin insert into public.gift_orders (student_id, gift_id, points, pickup) values (kid, g, 300, 'post'); exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL gửi bưu điện không có địa chỉ'; end if;
  insert into public.gift_orders (student_id, gift_id, points, pickup) values (kid, g, 300, 'league') returning id into o;
  if (select status from public.gift_orders where id = o) <> 'placed' then raise exception 'FAIL trạng thái đầu phải placed'; end if;
  ok := false;
  begin update public.gift_orders set status = 'cancelled' where id = o; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL huỷ không có cancelled_at'; end if;

  ------------------------------------------------------------------ RLS: phụ huynh không đọc / ghi thẳng; admin đọc
  perform pg_temp.act_as(ua);
  select count(*) into n from public.reward_ledger; if n <> 0 then raise exception 'FAIL phụ huynh đọc thẳng reward_ledger'; end if;
  select count(*) into n from public.gift_orders; if n <> 0 then raise exception 'FAIL phụ huynh đọc thẳng gift_orders'; end if;
  select count(*) into n from public.reward_rules; if n <> 0 then raise exception 'FAIL phụ huynh đọc thẳng reward_rules'; end if;
  ok := false;
  begin insert into public.gift_items (name_vi, points) values ('Hack', 1); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh tạo được quà'; end if;
  perform pg_temp.act_as(adm);
  select count(*) into n from public.gift_orders where id = o; if n <> 1 then raise exception 'FAIL admin không đọc được đơn'; end if;
  update public.gift_items set points = 350 where id = g;
  ok := false;
  begin insert into public.gift_orders (student_id, gift_id, points, pickup) values (kid, g, 1, 'league'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL admin ghi thẳng đơn quà (phải qua hàm)'; end if;
  perform pg_temp.act_as(null);
  if has_function_privilege('authenticated', 'public.reward_ledger_immutable()', 'execute') then raise exception 'FAIL hàm trigger lộ ra ngoài'; end if;

  raise exception 'ALL_OK';
end $$;
