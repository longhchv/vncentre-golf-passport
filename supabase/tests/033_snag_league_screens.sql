-- SNAG League · bước 3: league_public_profile (/p/, tiêu chí 7.4–7.5) và hàng chờ admin (spec 13 mục 6).
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
  par uuid := gen_random_uuid();
  coach uuid := gen_random_uuid();
  sc uuid; s1 uuid; s2 uuid; s3 uuid; g1 uuid; card1 text; card2 text; card3 text;
  r jsonb; q jsonb; qid uuid; ok boolean; v_t uuid; m uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-snag3-adm@example.test', now()),
    (par, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-snag3-par@example.test', now()),
    (coach, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-snag3-coach@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (coach, 'coach');
  insert into public.schools (name, type) values ('TH Bi Mat Snag3', 'public') returning id into sc;

  -- s1: thi chặng 9 (sớm), có trường, ngày sinh, phụ huynh → hiện tên; s2: chỉ thi chặng 11, chưa đồng ý → ẩn danh
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Snag Ba Mot', '2016-02-03', sc) returning id into s1;
  insert into public.students (full_name, birth_year) values ('Test Snag Ba Hai', 2017) returning id into s2;
  insert into public.guardians (full_name, phone, email, user_id) values ('Test PH Ba', '+84900000501', 'ph3@example.test', par) returning id into g1;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s1, g1, 'guardian', true, true, 'league', 'active', now());
  card1 := (public.league_issue_card(s1)).passport_code;
  card2 := (public.league_issue_card(s2)).passport_code;

  perform public.league_save_stage(9, '2026-10-04', 'Sân A', 3, jsonb_build_array(
    jsonb_build_object('name', 'Test Snag Ba Mot', 'student_code', (select student_code from public.students where id = s1), 'group', 'Bảng U10',
                       'to_par', -2, 'title', 'Vô địch (Best Gross)', 'culture', 'Tinh thần Golfer')), 'league_app', false);
  perform public.league_save_stage(11, '2026-11-08', 'Sân B', 3, jsonb_build_array(
    jsonb_build_object('name', 'Test Snag Ba Mot', 'student_code', (select student_code from public.students where id = s1), 'title', 'Winner bảng'),
    jsonb_build_object('name', 'Test Snag Ba Hai', 'student_code', (select student_code from public.students where id = s2), 'title', 'Vô địch (Best Gross)', 'to_par', 1)),
    'league_app', false);

  ------------------------------------------------------------------ 6.1 khách chưa đăng nhập
  perform pg_temp.as_anon();
  r := public.league_public_profile(lower(card1));
  if not (r ->> 'name' = 'Test Snag Ba Mot' and r ->> 'anonymous' = 'false' and (r ->> 'stages_count')::int = 2
          and (r ->> 'best_gross_count')::int = 1 and r ->> 'graduated' = 'false' and (r ->> 'total_points')::int >= 1100
          and r ->> 'certificates' is null) then
    raise exception 'FAIL hồ sơ công khai s1: %', r;
  end if;
  if (r #>> '{stages,0,stage_no}')::int <> 11 or r #>> '{stages,1,culture_vi}' <> 'Tinh thần Golfer' or (r #>> '{stages,1,to_par}')::int <> -2
     or r #>> '{stages,1,title_en}' <> 'Champion (Best Gross)' then
    raise exception 'FAIL danh sách chặng: %', r -> 'stages';
  end if;
  -- 7.5: không lộ ngày sinh, năm sinh, trường, phụ huynh
  if r::text ~* '2016-02-03|"birth|dob|school|TH Bi Mat|guardian|\+8490|ph3@' then raise exception 'FAIL: lộ dữ liệu riêng: %', r; end if;
  r := public.league_public_profile(card2);
  if not (r ->> 'anonymous' = 'true' and r ->> 'name' is null) then raise exception 'FAIL: s2 phải ẩn danh: %', r; end if;
  if r::text ~ 'Test Snag Ba Hai' then raise exception 'FAIL: lộ tên s2'; end if;
  if public.league_public_profile('KHONGCO1') is not null then raise exception 'FAIL: mã lạ'; end if;

  -- Đồng ý leaderboard_name → s2 hiện tên; phụ huynh xin tắt (đồng ý = false) → s1 ẩn; admin bật league_name_hidden → ẩn
  perform pg_temp.act_as(null);
  insert into public.consents (guardian_id, student_id, type, version, granted) values (g1, s2, 'leaderboard_name', 'v0', true);
  perform pg_temp.as_anon();
  if public.league_public_profile(card2) ->> 'name' <> 'Test Snag Ba Hai' then raise exception 'FAIL: đồng ý không hiện tên'; end if;
  perform pg_temp.act_as(null);
  insert into public.consents (guardian_id, student_id, type, version, granted, granted_at) values (g1, s1, 'leaderboard_name', 'v0', false, now() + interval '1 second');
  perform pg_temp.as_anon();
  if public.league_public_profile(card1) ->> 'anonymous' <> 'true' then raise exception 'FAIL: xin tắt vẫn hiện tên'; end if;
  perform pg_temp.act_as(null);
  delete from public.consents where student_id = s1 and type = 'leaderboard_name';
  perform pg_temp.act_as(adm);
  perform public.admin_set_league_name_hidden(s1, true);
  perform pg_temp.as_anon();
  if public.league_public_profile(card1) ->> 'anonymous' <> 'true' then raise exception 'FAIL: league_name_hidden'; end if;
  perform pg_temp.act_as(adm);
  perform public.admin_set_league_name_hidden(s1, false);

  ------------------------------------------------------------------ 6.2 phụ huynh đăng nhập: thêm chứng nhận giải
  perform pg_temp.act_as(null);
  insert into public.certificates (student_id, template_id, type, title_vi, title_en, verify_code, status, data)
  values (s1, (select id from public.certificate_templates order by created_at limit 1), 'tournament', 'Vô địch Chặng 9', 'Stage 9 champion',
          'SNAG3TEST', 'valid', '{"student_name":"Test Snag Ba Mot"}');
  perform pg_temp.act_as(par);
  r := public.league_public_profile(card1);
  if r #>> '{certificates,0,verify_code}' is distinct from 'SNAG3TEST' then raise exception 'FAIL: phụ huynh không thấy chứng nhận: %', r; end if;
  perform pg_temp.act_as(coach);
  if public.league_public_profile(card1) ->> 'certificates' is not null then raise exception 'FAIL: người khác thấy chứng nhận'; end if;

  ------------------------------------------------------------------ 7.4 gửi lại chặng 11 → điểm và hạng cập nhật, không nhân đôi
  perform pg_temp.act_as(null);
  perform public.league_save_stage(11, '2026-11-08', null, null, jsonb_build_array(
    jsonb_build_object('name', 'Test Snag Ba Mot', 'student_code', (select student_code from public.students where id = s1), 'title', '1st Runner Up')),
    'league_app', false);
  perform pg_temp.as_anon();
  r := public.league_public_profile(card1);
  if (r ->> 'stages_count')::int <> 2 or (r #>> '{stages,0,points}')::int <> 300 then raise exception 'FAIL gửi lại: %', r; end if;
  if public.league_public_profile(card2) is not null then raise exception 'FAIL: s2 không còn trong chặng 11 mà vẫn có thành tích'; end if;

  ------------------------------------------------------------------ Tốt nghiệp: ≥ 3 Best Gross
  perform pg_temp.act_as(null);
  perform public.league_save_stage(12, '2026-11-15', null, null, jsonb_build_array(jsonb_build_object('name', 'Test Snag Ba Mot',
    'student_code', (select student_code from public.students where id = s1), 'title', 'Best Gross')), 'league_app', false);
  perform public.league_save_stage(13, '2026-11-22', null, null, jsonb_build_array(jsonb_build_object('name', 'Test Snag Ba Mot',
    'student_code', (select student_code from public.students where id = s1), 'title', 'Best Gross')), 'league_app', false);
  perform pg_temp.as_anon();
  r := public.league_public_profile(card1);
  if not ((r ->> 'best_gross_count')::int = 3 and r ->> 'graduated' = 'true') then raise exception 'FAIL tốt nghiệp: %', r; end if;

  ------------------------------------------------------------------ 6.3 hàng chờ admin
  perform pg_temp.act_as(coach);
  ok := false;
  begin perform public.admin_league_queue('pending'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: HLV xem được hàng chờ'; end if;
  perform pg_temp.as_anon();
  ok := false;
  begin perform public.admin_league_queue('pending'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: khách xem được hàng chờ'; end if;

  -- a) dòng kết quả không mã → admin gắn vào hồ sơ có sẵn
  perform pg_temp.act_as(null);
  perform public.league_save_stage(14, '2026-11-29', null, null, jsonb_build_array(jsonb_build_object('name', 'Test Snag Ba Mot', 'club', 'CLB La')), 'league_app', false);
  perform pg_temp.act_as(adm);
  q := public.admin_league_queue('pending');
  select (e ->> 'id')::uuid into qid from jsonb_array_elements(q) e where e #>> '{result,raw_name}' = 'Test Snag Ba Mot' and (e #>> '{result,stage_no}')::int = 14;
  if qid is null then raise exception 'FAIL: hàng chờ không có dòng chặng 14: %', q; end if;
  if not exists (select 1 from jsonb_array_elements(q) e, jsonb_array_elements(e -> 'candidates') c
                 where (e ->> 'id')::uuid = qid and (c ->> 'id')::uuid = s1 and c ->> 'school' = 'TH Bi Mat Snag3') then
    raise exception 'FAIL: thiếu ứng viên trong hàng chờ';
  end if;
  ok := false; begin perform public.admin_league_resolve(qid, 'linked', null); exception when others then ok := sqlerrm = 'student_required'; end;
  if not ok then raise exception 'FAIL: link thiếu học viên'; end if;
  perform public.admin_league_resolve(qid, 'linked', s1, 'Cùng người');
  if (select student_id from public.tournament_results r join public.tournaments t on t.id = r.tournament_id where t.stage_no = 14 and r.raw_name = 'Test Snag Ba Mot'
      and t.series_id = (select id from public.tournament_series where code = 'snag_league')) <> s1 then
    raise exception 'FAIL: chưa gắn dòng kết quả';
  end if;
  ok := false; begin perform public.admin_league_resolve(qid, 'dismissed'); exception when others then ok := sqlerrm = 'already_resolved'; end;
  if not ok then raise exception 'FAIL: xử lý lại dòng đã xong'; end if;

  -- b) issue nghi trùng → admin gộp bằng công cụ gộp → đánh dấu merged; chưa gộp thì không cho
  perform pg_temp.act_as(null);
  r := public.league_issue(jsonb_build_object('league_ref', 'snag3:dup', 'child', jsonb_build_object('name', 'Test Snag Ba Mot', 'dob', '2016-12-12')));
  select id, new_student_id into qid, s3 from public.league_match_queue where issue_request_id = (select id from public.league_issue_requests where league_ref = 'snag3:dup');
  perform pg_temp.act_as(adm);
  ok := false; begin perform public.admin_league_resolve(qid, 'merged'); exception when others then ok := sqlerrm = 'not_merged'; end;
  if not ok then raise exception 'FAIL: merged khi chưa gộp'; end if;
  ok := false; begin perform public.admin_league_resolve(qid, 'linked', s1); exception when others then ok := sqlerrm = 'use_merge'; end;
  if not ok then raise exception 'FAIL: link cho dòng có hồ sơ mới'; end if;
  m := public.merge_students(s1, s3, '{}');
  perform public.admin_league_resolve(qid, 'merged');
  if (select status from public.league_match_queue where id = qid) <> 'merged' then raise exception 'FAIL: chưa đánh dấu merged'; end if;
  -- Mã của hồ sơ đã gộp vẫn mở được thành tích của hồ sơ giữ lại
  card3 := (select passport_code from public.passports where student_id = s1 and passport_code <> card1 limit 1);
  perform pg_temp.as_anon();
  if card3 is null or public.league_public_profile(card3) ->> 'stages_count' is null then raise exception 'FAIL: thẻ của hồ sơ đã gộp'; end if;

  raise exception 'ALL_OK';
end $$;
