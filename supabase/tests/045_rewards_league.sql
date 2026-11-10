-- Spec 19 · bước 3 (phần A): kết quả League vào điểm thưởng. Tiêu chí 1, 2, 3, 4, 5, 10 + xoá chặng, chặng chưa bật (D60),
-- hệ số điểm thưởng (Q2), gộp / hoàn tác gộp (Q4), ví điểm. Toàn bộ bị huỷ ở cuối.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

create or replace function pg_temp.as_service() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role service_role';
end $f$;

-- Tổng điểm thưởng của một học viên từ một dòng kết quả
create or replace function pg_temp.got(p_student uuid, p_result uuid) returns int language sql as $f$
  select coalesce(sum(delta), 0)::int from public.reward_ledger
  where student_id = p_student and source_type = 'tournament_result' and source_id = p_result
$f$;

do $$
declare
  adm uuid := gen_random_uuid();
  par uuid := gen_random_uuid();
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; c1 text; c2 text; g uuid; m uuid;
  ser uuid; sea uuid; v_t uuid; t_old uuid; r1 uuid; r2 uuid; rp uuid; rt uuid; ro uuid;
  r jsonb; n int; n2 int; ok boolean; v_rank int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rwl-' || x || '@example.test', now()
  from unnest(array[adm, par]) x;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.students (full_name, birth_year) values ('Test RWL Một', 2015) returning id, student_code into s1, c1;
  insert into public.students (full_name, birth_year) values ('Test RWL Hai', 2015) returning id, student_code into s2, c2;
  insert into public.students (full_name, birth_year) values ('Test RWL Ba', 2015) returning id into s3;
  insert into public.students (full_name, birth_year) values ('Test RWL Bốn', 2015) returning id into s4;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH RWL', '+84900004501', par) returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s1, g, 'mother', true, true, 'admin', 'active', now());
  ser := public.league_series_id();

  ------------------------------------------------------------------ Tiêu chí 1: Best Gross +550 (500 + 50 tham dự); điểm xếp hạng không đổi
  perform pg_temp.as_service();
  r := public.league_results(jsonb_build_object('event', jsonb_build_object('no', 71, 'date', '2026-11-08'),
    'rows', jsonb_build_array(
      jsonb_build_object('student_code', c1, 'name', 'Test RWL Một', 'title', 'Vô địch (Best Gross)'),
      jsonb_build_object('student_code', c2, 'name', 'Test RWL Hai', 'title', 'Winner bảng'),
      jsonb_build_object('name', 'Test RWL Phụ Huynh', 'club', 'Parent', 'title', 'Winner bảng'))));
  perform pg_temp.act_as(null);
  select id into v_t from public.tournaments where series_id = ser and stage_no = 71;
  if not (select reward_enabled from public.tournaments where id = v_t) then raise exception 'FAIL chặng mới phải bật điểm thưởng'; end if;
  select id into r1 from public.tournament_results where tournament_id = v_t and student_id = s1;
  select id into r2 from public.tournament_results where tournament_id = v_t and student_id = s2;
  select id into rp from public.tournament_results where tournament_id = v_t and participant_kind = 'parent';
  if pg_temp.got(s1, r1) <> 550 then raise exception 'FAIL Best Gross phải +550, có %', pg_temp.got(s1, r1); end if;
  if (select reason from public.reward_ledger where source_id = r1) <> 'tournament_result' then raise exception 'FAIL reason dòng gốc'; end if;
  if (select note from public.reward_ledger where source_id = r1) not like '%#71%' then raise exception 'FAIL ghi chú chặng'; end if;
  if pg_temp.got(s2, r2) <> 350 then raise exception 'FAIL Winner bảng phải +350'; end if;
  select total_points into v_rank from public.league_standings where student_id = s1 and series_id = ser;
  if v_rank <> 550 then raise exception 'FAIL điểm xếp hạng bị đổi: %', v_rank; end if;

  ------------------------------------------------------------------ Tiêu chí 5: phụ huynh, thầy cô không có điểm thưởng
  if exists (select 1 from public.reward_ledger where source_id = rp) then raise exception 'FAIL phụ huynh có điểm thưởng'; end if;
  insert into public.tournament_results (tournament_id, student_id, participant_kind, raw_name, points_participation, points_rank, source)
  values (v_t, s3, 'teacher', 'Test RWL Thầy', 50, 300, 'import') returning id into rt;
  if exists (select 1 from public.reward_ledger where source_id = rt) then raise exception 'FAIL thầy cô có điểm thưởng'; end if;
  delete from public.tournament_results where id = rt;
  if exists (select 1 from public.reward_ledger where source_id = rt) then raise exception 'FAIL xoá dòng thầy cô sinh dòng sổ'; end if;

  ------------------------------------------------------------------ Tiêu chí 4: gửi lại chặng y hệt → không sinh dòng mới
  select count(*) into n from public.reward_ledger where source_type = 'tournament_result';
  perform pg_temp.as_service();
  r := public.league_results(jsonb_build_object('event', jsonb_build_object('no', 71, 'date', '2026-11-08'),
    'rows', jsonb_build_array(
      jsonb_build_object('student_code', c1, 'name', 'Test RWL Một', 'title', 'Vô địch (Best Gross)'),
      jsonb_build_object('student_code', c2, 'name', 'Test RWL Hai', 'title', 'Winner bảng'),
      jsonb_build_object('name', 'Test RWL Phụ Huynh', 'club', 'Parent', 'title', 'Winner bảng'))));
  perform pg_temp.act_as(null);
  select count(*) into n2 from public.reward_ledger where source_type = 'tournament_result';
  if n2 <> n then raise exception 'FAIL gửi lại sinh dòng trùng: % → %', n, n2; end if;

  ------------------------------------------------------------------ Tiêu chí 2: đổi Best Gross → Winner bảng: thêm dòng điều chỉnh, tổng 350
  --                                                                  + bỏ s2 khỏi danh sách (xoá cứng) → s2 về 0
  perform pg_temp.as_service();
  r := public.league_results(jsonb_build_object('event', jsonb_build_object('no', 71, 'date', '2026-11-08'),
    'rows', jsonb_build_array(
      jsonb_build_object('student_code', c1, 'name', 'Test RWL Một', 'title', 'Winner bảng'),
      jsonb_build_object('name', 'Test RWL Phụ Huynh', 'club', 'Parent', 'title', 'Winner bảng'))));
  perform pg_temp.act_as(null);
  if pg_temp.got(s1, r1) <> 350 then raise exception 'FAIL sau sửa hạng phải 350, có %', pg_temp.got(s1, r1); end if;
  if not exists (select 1 from public.reward_ledger where source_id = r1 and reason = 'tournament_result_adjust' and delta = -200) then
    raise exception 'FAIL thiếu dòng điều chỉnh -200';
  end if;
  if (select count(*) from public.reward_ledger where source_id = r1 and reason = 'tournament_result') <> 1 then raise exception 'FAIL dòng gốc bị nhân'; end if;
  if exists (select 1 from public.tournament_results where id = r2) then raise exception 'FAIL dòng s2 phải bị xoá'; end if;
  if pg_temp.got(s2, r2) <> 0 then raise exception 'FAIL dòng kết quả bị xoá: s2 phải về 0'; end if;
  if (select total_points from public.league_standings where student_id = s1 and series_id = ser) <> 350 then raise exception 'FAIL BXH sau sửa hạng'; end if;

  ------------------------------------------------------------------ Tiêu chí 3: ghép nhầm sang s3 rồi ghép lại sang s4
  perform pg_temp.act_as(adm);
  update public.tournament_results set student_id = s3 where id = r1;
  perform pg_temp.act_as(null);
  if pg_temp.got(s1, r1) <> 0 or pg_temp.got(s3, r1) <> 350 then raise exception 'FAIL ghép nhầm: s1 %, s3 %', pg_temp.got(s1, r1), pg_temp.got(s3, r1); end if;
  perform pg_temp.act_as(adm);
  update public.tournament_results set student_id = s4 where id = r1;
  perform pg_temp.act_as(null);
  if pg_temp.got(s3, r1) <> 0 or pg_temp.got(s4, r1) <> 350 or pg_temp.got(s1, r1) <> 0 then raise exception 'FAIL ghép lại'; end if;
  -- bỏ ghép (về hàng chờ) → ai cũng 0; ghép lại s1
  update public.tournament_results set student_id = null where id = r1;
  if pg_temp.got(s4, r1) <> 0 then raise exception 'FAIL bỏ ghép'; end if;
  update public.tournament_results set student_id = s1 where id = r1;
  if pg_temp.got(s1, r1) <> 350 then raise exception 'FAIL ghép lại s1'; end if;
  -- đổi loại người thi sang phụ huynh → 0; trả lại học sinh → 350
  update public.tournament_results set participant_kind = 'parent' where id = r1;
  if pg_temp.got(s1, r1) <> 0 then raise exception 'FAIL đổi sang phụ huynh'; end if;
  update public.tournament_results set participant_kind = 'student' where id = r1;
  if pg_temp.got(s1, r1) <> 350 then raise exception 'FAIL trả lại học sinh'; end if;

  ------------------------------------------------------------------ Xoá chặng (mềm) / khôi phục
  update public.tournaments set deleted_at = now() where id = v_t;
  if pg_temp.got(s1, r1) <> 0 then raise exception 'FAIL xoá chặng chưa trừ'; end if;
  update public.tournaments set deleted_at = null where id = v_t;
  if pg_temp.got(s1, r1) <> 350 then raise exception 'FAIL khôi phục chặng'; end if;
  select count(*) into n from public.reward_ledger where source_id = r1;
  update public.tournaments set venue = 'Sân khác' where id = v_t;    -- sửa không liên quan: không sinh dòng
  if (select count(*) from public.reward_ledger where source_id = r1) <> n then raise exception 'FAIL sửa tên sân sinh dòng sổ'; end if;

  ------------------------------------------------------------------ Q2: đổi hệ số điểm thưởng → tính lại; điểm xếp hạng không đổi
  perform pg_temp.act_as(adm);
  update public.tournament_series set reward_coefficient = 1.5 where id = ser;
  perform pg_temp.act_as(null);
  if pg_temp.got(s1, r1) <> 525 then raise exception 'FAIL hệ số 1,5: %', pg_temp.got(s1, r1); end if;
  if (select total_points from public.league_standings where student_id = s1 and series_id = ser) <> 350 then raise exception 'FAIL hệ số điểm thưởng làm đổi BXH'; end if;
  update public.tournament_series set reward_coefficient = 1 where id = ser;
  if pg_temp.got(s1, r1) <> 350 then raise exception 'FAIL trả hệ số 1'; end if;

  ------------------------------------------------------------------ Q1 / D60: chặng chưa bật → không cộng; cộng bù chỉ khi admin gọi
  select season_id into sea from public.tournaments where id = v_t;
  insert into public.tournaments (series_id, season_id, stage_no, played_on, reward_enabled) values (ser, sea, 72, '2026-11-09', false) returning id into t_old;
  insert into public.tournament_results (tournament_id, student_id, raw_name, points_participation, points_rank, source)
  values (t_old, s2, 'Test RWL Hai', 50, 250, 'import') returning id into ro;
  if exists (select 1 from public.reward_ledger where source_id = ro) then raise exception 'FAIL chặng chưa bật vẫn cộng'; end if;
  update public.tournament_results set points_rank = 300 where id = ro;     -- sửa dòng chặng cũ: vẫn không cộng bù ngầm
  if exists (select 1 from public.reward_ledger where source_id = ro) then raise exception 'FAIL cộng bù ngầm khi sửa dòng chặng cũ'; end if;
  perform pg_temp.act_as(par);
  ok := false;
  begin perform public.reward_backfill_league(array[t_old]); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh chạy được cộng bù'; end if;
  perform pg_temp.act_as(adm);
  r := public.reward_backfill_league(array[t_old]);
  perform pg_temp.act_as(null);
  if (r ->> 'tournaments')::int <> 1 or (r ->> 'ledger_rows')::int <> 1 or pg_temp.got(s2, ro) <> 350 then raise exception 'FAIL cộng bù: %', r; end if;
  perform pg_temp.act_as(adm);
  r := public.reward_backfill_league(array[t_old]);
  perform pg_temp.act_as(null);
  if (r ->> 'ledger_rows')::int <> 0 or pg_temp.got(s2, ro) <> 350 then raise exception 'FAIL cộng bù lần 2 sinh dòng'; end if;

  ------------------------------------------------------------------ Q4: gộp s2 (có điểm giải + đối tác) vào s3, rồi hoàn tác
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id) values (s2, 40, 'partner_visit', 'partner_visit', gen_random_uuid());
  insert into public.reward_ledger (student_id, delta, reason, source_type, is_frozen) values (s2, 15, 'admin_adjust', 'test', true);
  select coalesce(sum(delta), 0) into n from public.reward_ledger where student_id = s3;
  perform pg_temp.act_as(adm);
  m := public.merge_students(s3, s2);
  perform pg_temp.act_as(null);
  if (select coalesce(sum(delta), 0) from public.reward_ledger where student_id = s2) <> 0 then raise exception 'FAIL hồ sơ bị gộp còn điểm'; end if;
  if pg_temp.got(s3, ro) <> 350 then raise exception 'FAIL điểm giải không theo hồ sơ giữ lại'; end if;
  if (select coalesce(sum(delta), 0) from public.reward_ledger where student_id = s3 and not is_frozen) <> n + 350 + 40 then raise exception 'FAIL khả dụng sau gộp'; end if;
  if (select coalesce(sum(delta), 0) from public.reward_ledger where student_id = s3 and is_frozen) <> 15 then raise exception 'FAIL phần treo sau gộp'; end if;
  perform pg_temp.act_as(adm);
  perform public.undo_student_merge(m);
  perform pg_temp.act_as(null);
  if (select coalesce(sum(delta), 0) from public.reward_ledger where student_id = s2 and not is_frozen) <> 390
     or (select coalesce(sum(delta), 0) from public.reward_ledger where student_id = s2 and is_frozen) <> 15
     or (select coalesce(sum(delta), 0) from public.reward_ledger where student_id = s3) <> n then
    raise exception 'FAIL hoàn tác gộp';
  end if;

  ------------------------------------------------------------------ Ví điểm: phụ huynh của s1 thấy số dư và nguồn; không thấy con khác
  perform pg_temp.act_as(par);
  r := public.reward_balance(s1);
  if (r ->> 'available')::int <> 350 or (r ->> 'frozen')::int <> 0 or (r ->> 'balance')::int <> 350 then raise exception 'FAIL ví: %', r; end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'recent') x where (x #>> '{tournament,stage_no}')::int = 71) then raise exception 'FAIL ví thiếu tên chặng'; end if;
  if r::text like '%Test RWL Hai%' or r::text like '%Test RWL Ba%' then raise exception 'FAIL ví lộ tên người khác'; end if;
  ok := false;
  begin perform public.reward_balance(s2); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL xem ví con người khác'; end if;
  ok := false;
  begin perform public.reward_sync_result(r1, null); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL gọi được reward_sync_result'; end if;

  raise exception 'ALL_OK';
end $$;
