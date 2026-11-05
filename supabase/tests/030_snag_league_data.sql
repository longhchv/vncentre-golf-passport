-- SNAG League ↔ Passport · bước 1: hạng sổ snag_league, quyền đọc bảng mới, thang điểm, hạng hiện tại, gộp học viên.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

create or replace function pg_temp.as_anon() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $f$;

do $$
declare
  adm uuid := gen_random_uuid();
  coach uuid := gen_random_uuid();
  ser uuid; sea uuid; t1 uuid; t2 uuid; t3 uuid;
  s_a uuid; s_b uuid; s_c uuid; s_d uuid; batch uuid; p uuid; m uuid;
  n int; ok boolean; r record; rule public.tournament_point_rules;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-snag1-adm@example.test', now()),
    (coach, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-snag1-coach@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (coach, 'coach');

  ------------------------------------------------------------------ Hạng sổ snag_league: không tính vào "một sổ active"
  if not exists (select 1 from public.passport_tiers where code = 'snag_league' and not counts_toward_single_active
                 and level_from is null and level_to is null) then
    raise exception 'FAIL: thiếu hạng snag_league';
  end if;
  insert into public.students (full_name, date_of_birth) values ('Test Snag Hai So', '2016-03-04') returning id into s_a;
  perform pg_temp.act_as(adm);
  batch := public.create_passport_batch('Test first snag', (select id from public.passport_tiers where code = 'first'), 1, 'decal');
  perform pg_temp.act_as(null);
  update public.passports set status = 'active', student_id = s_a where batch_id = batch;
  insert into public.passports (passport_code, tier_id, student_id, status)
  values (public.new_passport_code(), (select id from public.passport_tiers where code = 'snag_league'), s_a, 'active') returning id into p;
  if (select counts_toward_single_active from public.passports where id = p) then raise exception 'FAIL: sổ snag_league tính vào R2'; end if;

  ------------------------------------------------------------------ K5: năm sinh tự lấy từ ngày sinh; chỉ có năm thì giữ năm
  if (select birth_year from public.students where id = s_a) <> 2016 then raise exception 'FAIL: birth_year không theo ngày sinh'; end if;
  insert into public.students (full_name, birth_year) values ('Test Snag Chi Nam', 2015) returning id into s_b;
  if (select birth_year from public.students where id = s_b) <> 2015 or (select date_of_birth from public.students where id = s_b) is not null then
    raise exception 'FAIL: birth_year riêng';
  end if;
  update public.students set date_of_birth = '2014-12-31' where id = s_b;
  if (select birth_year from public.students where id = s_b) <> 2014 then raise exception 'FAIL: đổi ngày sinh không cập nhật năm'; end if;
  ok := false;
  begin insert into public.students (full_name, birth_year) values ('Test Snag Nam Sai', 1800); exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL: birth_year ngoài khoảng'; end if;
  if (select league_name_hidden from public.students where id = s_b) then raise exception 'FAIL: league_name_hidden mặc định'; end if;

  ------------------------------------------------------------------ Giá trị mới: linked_via league, code_attempts league_lookup
  insert into public.code_attempts (kind, code, ip, success) values ('league_lookup', 'X', '1.2.3.4', true);
  insert into public.guardians (full_name, phone) values ('Test Snag PH', '+84900000301') returning id into m;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s_b, m, 'guardian', true, true, 'league', 'active', now());

  ------------------------------------------------------------------ Seed: chuỗi, mùa, thang điểm C2
  select id into ser from public.tournament_series where code = 'snag_league' and ranking_coefficient = 1;
  select id into sea from public.seasons where code = '2026';
  if ser is null or sea is null then raise exception 'FAIL: thiếu chuỗi/mùa seed'; end if;
  if (select string_agg(code || '=' || points, ',' order by sort_order) from public.tournament_point_rules where series_id = ser)
     <> 'participation=50,best_gross=500,winner=300,runner_up_1=250,runner_up_2=200,runner_up_3=150,runner_up_4=100,spirit_of_the_game=200,essence_of_golf_style=100,style_bonus=50' then
    raise exception 'FAIL: thang điểm seed';
  end if;
  -- Tra theo cách viết trong file cũ và tên tiếng Anh
  rule := public.league_point_rule(ser, 'rank', 'Vô địch (Best Gross)');   if rule.code is distinct from 'best_gross' then raise exception 'FAIL: tra Best Gross'; end if;
  rule := public.league_point_rule(ser, 'rank', '1st runner up');          if rule.code is distinct from 'runner_up_1' then raise exception 'FAIL: tra 1st Runner Up'; end if;
  rule := public.league_point_rule(ser, 'rank', 'winner BẢNG');            if rule.code is distinct from 'winner' then raise exception 'FAIL: tra Winner bảng'; end if;
  rule := public.league_point_rule(ser, 'culture', 'Tinh than golfer');    if rule.code is distinct from 'spirit_of_the_game' then raise exception 'FAIL: tra Tinh thần Golfer'; end if;
  rule := public.league_point_rule(ser, 'culture', 'Spirit of the Game');  if rule.points is distinct from 200 then raise exception 'FAIL: tra Spirit of the Game'; end if;
  rule := public.league_point_rule(ser, 'culture', 'Điểm thưởng phong cách'); if rule.points is distinct from 50 then raise exception 'FAIL: tra Điểm thưởng'; end if;
  rule := public.league_point_rule(ser, 'rank', 'Hạng 9');                 if rule.id is not null then raise exception 'FAIL: tra danh hiệu lạ'; end if;
  rule := public.league_point_rule(ser, 'rank', '');                       if rule.id is not null then raise exception 'FAIL: tra rỗng'; end if;

  ------------------------------------------------------------------ Kết quả: điểm tổng tự cộng; duy nhất theo (chặng, tên chuẩn hoá)
  insert into public.tournaments (series_id, season_id, stage_no, played_on, venue) values (ser, sea, 91, '2026-03-28', 'Sân thử') returning id into t1;
  insert into public.tournaments (series_id, season_id, stage_no, played_on) values (ser, sea, 92, '2026-04-19') returning id into t2;
  insert into public.tournaments (series_id, season_id, stage_no, played_on, counts_for_ranking) values (ser, sea, 93, '2026-05-10', false) returning id into t3;
  insert into public.students (full_name, birth_year) values ('Test Snag Ba', 2017) returning id into s_c;
  insert into public.students (full_name) values ('Test Snag Bon') returning id into s_d;

  -- Chặng 91: A 550 (Best Gross), B 300, C 300; chặng 92: A 50, B 350, C 300 + tên chưa ghép 500; phụ huynh 1000
  insert into public.tournament_results (tournament_id, student_id, raw_name, rank_title_code, points_participation, points_rank, points_bonus, source) values
    (t1, s_a, 'Test Snag Hai So', 'best_gross', 50, 500, 0, 'import'),
    (t1, s_b, 'Test Snag Chi Nam', 'runner_up_1', 50, 250, 0, 'import'),
    (t1, s_c, 'Test Snag Ba', 'runner_up_2', 50, 200, 50, 'import'),
    (t2, s_a, 'Test Snag Hai So', null, 50, 0, 0, 'league_app'),
    (t2, s_b, 'Test Snag Chi Nam', 'winner', 50, 300, 0, 'league_app'),
    (t2, s_c, 'Test Snag Ba', 'runner_up_1', 50, 250, 0, 'league_app'),
    (t2, null, '  Test   Snag  Chua Ghep ', 'best_gross', 50, 500, 0, 'league_app');
  insert into public.tournament_results (tournament_id, raw_name, participant_kind, points_participation, points_rank, source)
  values (t2, 'Test Snag Phu Huynh', 'parent', 50, 950, 'league_app');
  -- Chặng thầy cô: không tính hạng
  insert into public.tournament_results (tournament_id, student_id, raw_name, points_participation, points_rank, source)
  values (t3, s_c, 'Test Snag Ba', 50, 5000, 'import');

  if (select points_total from public.tournament_results where tournament_id = t1 and student_id = s_c) <> 300 then
    raise exception 'FAIL: points_total';
  end if;
  if (select raw_name || '|' || raw_name_normalized from public.tournament_results where tournament_id = t2 and student_id is null and participant_kind = 'student')
     <> 'Test Snag Chua Ghep|test snag chua ghep' then
    raise exception 'FAIL: chuẩn hoá tên';
  end if;
  ok := false;
  begin
    insert into public.tournament_results (tournament_id, raw_name, source) values (t1, 'TEST SNAG HAI SỐ', 'import');
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL: trùng tên trong cùng chặng'; end if;
  ok := false;
  begin
    insert into public.tournament_results (tournament_id, raw_name, source) values (t1, 'Test Snag Nguon La', 'excel');
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL: nguồn lạ'; end if;

  ------------------------------------------------------------------ Hạng hiện tại: A 600, B 650, C 600, chưa ghép 550 → B 1, A T2, C T2, chưa ghép 4
  for r in select * from public.league_standings where series_id = ser and season_id = sea and player_key in
             (s_a::text, s_b::text, s_c::text, 'name:test snag chua ghep') loop
    if r.student_id = s_a and not (r.total_points = 600 and r.rank = 2 and r.tied and r.stages_played = 2 and r.best_gross_count = 1) then
      raise exception 'FAIL hạng A: %', row_to_json(r); end if;
    if r.student_id = s_b and not (r.total_points = 650 and r.rank = 1 and not r.tied) then raise exception 'FAIL hạng B: %', row_to_json(r); end if;
    if r.student_id = s_c and not (r.total_points = 600 and r.rank = 2 and r.tied and r.stages_played = 2) then
      raise exception 'FAIL hạng C (chặng thầy cô phải bị loại): %', row_to_json(r); end if;
    if r.student_id is null and not (r.total_points = 550 and r.rank = 4 and r.best_gross_count = 1 and r.display_raw_name = 'Test Snag Chua Ghep') then
      raise exception 'FAIL hạng dòng chưa ghép: %', row_to_json(r); end if;
  end loop;
  select count(*) into n from public.league_standings where series_id = ser and season_id = sea and player_key in
    (s_a::text, s_b::text, s_c::text, 'name:test snag chua ghep');
  if n <> 4 then raise exception 'FAIL: số VĐV trong hạng %', n; end if;
  if exists (select 1 from public.league_standings where player_key = 'name:test snag phu huynh') then
    raise exception 'FAIL: phụ huynh có trong hạng';
  end if;
  -- Hệ số chuỗi nhân vào tổng điểm
  update public.tournament_series set ranking_coefficient = 2 where id = ser;
  if (select total_points from public.league_standings where student_id = s_a and season_id = sea) <> 1200 then raise exception 'FAIL: hệ số chuỗi'; end if;
  update public.tournament_series set ranking_coefficient = 1 where id = ser;

  ------------------------------------------------------------------ RLS: chỉ admin đọc thẳng; HLV và khách không thấy gì
  perform pg_temp.act_as(coach);
  if (select count(*) from public.tournament_results) <> 0 or (select count(*) from public.league_standings) <> 0
     or (select count(*) from public.league_match_queue) <> 0 or (select count(*) from public.league_issue_requests) <> 0
     or (select count(*) from public.tournaments) <> 0 or (select count(*) from public.tournament_point_rules) <> 0 then
    raise exception 'FAIL: HLV đọc được bảng giải';
  end if;
  ok := false;
  begin insert into public.tournament_results (tournament_id, raw_name, source) values (t1, 'Test Snag Gia Mao', 'league_app');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: HLV ghi được kết quả'; end if;
  ok := false;
  begin perform public.league_point_rule(ser, 'rank', 'Winner'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: HLV gọi được league_point_rule'; end if;

  perform pg_temp.as_anon();
  ok := false;
  begin perform count(*) from public.tournament_results; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: khách đọc được tournament_results'; end if;
  ok := false;
  begin perform count(*) from public.league_standings; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: khách đọc được league_standings'; end if;

  perform pg_temp.act_as(adm);
  if (select count(*) from public.tournament_results where tournament_id in (t1, t2, t3)) <> 9 then raise exception 'FAIL: admin không đọc đủ'; end if;
  if (select count(*) from public.league_standings where season_id = sea and player_key = s_a::text) <> 1 then raise exception 'FAIL: admin không đọc hạng'; end if;

  ------------------------------------------------------------------ Hàng chờ và yêu cầu cấp mã
  insert into public.league_issue_requests (league_ref, status, student_id, passport_id) values ('ev:test/reg:1', 'created', s_d, null);
  ok := false;
  begin insert into public.league_issue_requests (league_ref, status, student_id) values ('ev:test/reg:1', 'matched', s_a);
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL: league_ref trùng'; end if;
  insert into public.league_match_queue (source, issue_request_id, new_student_id, candidate_student_ids, reason)
  values ('issue', (select id from public.league_issue_requests where league_ref = 'ev:test/reg:1'), s_d, array[s_a], 'same_name_dob_mismatch');
  ok := false;
  begin insert into public.league_match_queue (source, reason) values ('import', 'x'); exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL: hàng chờ không gắn gì'; end if;
  ok := false;
  begin update public.league_match_queue set status = 'merged' where new_student_id = s_d; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL: đóng hàng chờ không có resolved_at'; end if;

  ------------------------------------------------------------------ Gộp D → A: kết quả và yêu cầu cấp mã đi theo; hoàn tác thì trả về
  perform pg_temp.act_as(null);
  insert into public.tournament_results (tournament_id, student_id, raw_name, points_participation, source)
  values (t1, s_d, 'Test Snag Bon', 50, 'league_app');
  update public.students set birth_year = 2018 where id = s_d;
  perform pg_temp.act_as(adm);
  m := public.merge_students(s_a, s_d, '{}');
  perform pg_temp.act_as(null);
  if exists (select 1 from public.tournament_results where student_id = s_d)
     or (select student_id from public.league_issue_requests where league_ref = 'ev:test/reg:1') <> s_a then
    raise exception 'FAIL: kết quả không đi theo hồ sơ gộp';
  end if;
  if (select total_points from public.league_standings where student_id = s_a and season_id = sea) <> 650 then
    raise exception 'FAIL: hạng sau gộp';
  end if;
  if (select birth_year from public.students where id = s_a) <> 2016 then raise exception 'FAIL: gộp ghi đè năm sinh có ngày sinh'; end if;
  perform pg_temp.act_as(adm);
  perform public.undo_student_merge(m);
  perform pg_temp.act_as(null);
  if (select count(*) from public.tournament_results where student_id = s_d) <> 1
     or (select student_id from public.league_issue_requests where league_ref = 'ev:test/reg:1') <> s_d
     or (select count(*) from public.tournament_results where student_id = s_a) <> 2
     or exists (select 1 from public.tournament_results where cardinality(merge_trail) > 0 and tournament_id in (t1, t2)) then
    raise exception 'FAIL: hoàn tác gộp không trả kết quả về';
  end if;

  ------------------------------------------------------------------ Nhật ký
  if not exists (select 1 from public.audit_logs where entity_type = 'tournament_results') then raise exception 'FAIL: thiếu nhật ký'; end if;

  raise exception 'ALL_OK';
end $$;
