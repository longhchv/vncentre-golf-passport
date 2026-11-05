-- SNAG League ↔ Passport · bước 2: league_lookup / league_issue / league_results / league_import_history (spec 13 mục 4–5, tiêu chí 7.1–7.4).
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

do $$
declare
  adm uuid := gen_random_uuid();
  s_ev uuid; g_ev uuid; p_ev uuid; ev_card text; ev_code text;
  r jsonb; r2 jsonb; ok boolean; n int; v_t uuid; s_new uuid; s_x uuid;
  i int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-snag2-adm@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');

  -- Bạn ngày 10/10: chỉ có tên, SĐT phụ huynh, thẻ event_experience đã ghi tên (như event_do_register)
  insert into public.students (full_name, verification_status) values ('Test Snag Su Kien', 'event_guest') returning id, student_code into s_ev, ev_code;
  insert into public.guardians (full_name, phone, email) values ('Test PH Su Kien', '+84900000401', 'ph-sk@example.test') returning id into g_ev;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s_ev, g_ev, 'guardian', true, true, 'event_card', 'active', now());
  insert into public.passports (tier_id, student_id, status, issued_at)
  values ((select id from public.passport_tiers where code = 'event_experience'), s_ev, 'event_registered', now())
  returning id, passport_code into p_ev, ev_card;

  ------------------------------------------------------------------ Quyền: chỉ service_role
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.league_lookup(ev_code, '1.1.1.1'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: admin (JWT) gọi thẳng được league_lookup'; end if;
  ok := false;
  begin perform public.league_issue('{"league_ref":"x"}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: gọi thẳng được league_issue'; end if;
  ok := false;
  begin perform public.league_import_history('[]', true); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: gọi thẳng được league_import_history'; end if;

  perform pg_temp.as_service();

  ------------------------------------------------------------------ 7.1 lookup bằng mã VNC (gõ có gạch hoặc không) và bằng mã sổ
  r := public.league_lookup(lower(replace(ev_code, '-', ' ')), '10.0.0.1');
  if not (r ->> 'found' = 'true' and r ->> 'student_code' = ev_code and r ->> 'passport_code' = ev_card
          and r ->> 'name' = 'Test Snag Su Kien' and r ->> 'name_masked' = public.mask_name('Test Snag Su Kien')
          and r #>> '{guardian,phone}' = '+84900000401' and r #>> '{guardian,email}' = 'ph-sk@example.test') then
    raise exception 'FAIL lookup VNC: %', r;
  end if;
  r := public.league_lookup(ev_card, '10.0.0.1');
  if r ->> 'student_code' <> ev_code then raise exception 'FAIL lookup mã sổ: %', r; end if;
  r := public.league_lookup('VNC-999999', '10.0.0.1');
  if r <> '{"found": false}'::jsonb then raise exception 'FAIL lookup mã sai: %', r; end if;
  -- Quá 20 lần/phút mỗi IP → chặn; IP khác vẫn được
  for i in 1..17 loop perform public.league_lookup(ev_code, '10.0.0.1'); end loop;
  r := public.league_lookup(ev_code, '10.0.0.1');
  if r ->> 'error' is distinct from 'rate_limited' then raise exception 'FAIL: lần 21 không bị chặn: %', r; end if;
  r := public.league_lookup(ev_code, '10.0.0.2');
  if r ->> 'found' <> 'true' then raise exception 'FAIL: IP khác bị chặn'; end if;

  ------------------------------------------------------------------ 7.2 issue: bạn 10/10 (cùng tên + SĐT, K1) → matched, không tạo hồ sơ
  select count(*) into n from public.students;
  r := public.league_issue(jsonb_build_object('action', 'issue', 'league_ref', 'ev:11/reg:A1',
    'child', jsonb_build_object('name', 'test snag  su kiên', 'dob', '2017-05-12', 'gender', 'Nam', 'school', 'Trường Không Có'),
    'guardian', jsonb_build_object('name', 'Test PH Su Kien', 'phone', '0900 000 401', 'email', 'ph-sk@example.test'),
    'consents', jsonb_build_object('photo', true, 'leaderboard_name', true),
    'health_note', 'không được lưu', 'sponsor_code', 'X', 'bank_transfer', 'Y'));
  if not (r ->> 'status' = 'matched' and r ->> 'student_code' = ev_code and r ->> 'passport_code' = ev_card
          and r ->> 'qr_url' like '%/p/' || ev_card) then
    raise exception 'FAIL issue matched: %', r;
  end if;
  if (select count(*) from public.students) <> n then raise exception 'FAIL: matched mà vẫn tạo hồ sơ'; end if;
  if (select date_of_birth::text || '|' || gender || '|' || birth_year || '|' || verification_status from public.students where id = s_ev)
     <> '2017-05-12|male|2017|event_guest' then
    raise exception 'FAIL: không điền thêm thông tin còn trống';
  end if;
  if (select count(*) from public.consents where guardian_id = g_ev and student_id = s_ev and type in ('photo', 'leaderboard_name') and granted) <> 2 then
    raise exception 'FAIL: chưa ghi đồng ý';
  end if;
  if exists (select 1 from public.passports where student_id = s_ev and tier_id = (select id from public.passport_tiers where code = 'snag_league')) then
    raise exception 'FAIL: cấp thêm thẻ số cho bạn đã có thẻ sự kiện';
  end if;
  if exists (select 1 from public.audit_logs where after::text ilike '%không được lưu%' or after::text ilike '%sponsor%') then
    raise exception 'FAIL: lưu trường bị cấm';
  end if;
  -- Gọi lại cùng league_ref → cùng kết quả
  r2 := public.league_issue(jsonb_build_object('league_ref', 'ev:11/reg:A1', 'child', jsonb_build_object('name', 'Ai Khac')));
  if not (r2 ->> 'status' = 'matched' and r2 ->> 'student_code' = ev_code and r2 ->> 'passport_code' = ev_card) then
    raise exception 'FAIL issue lặp lại: %', r2;
  end if;

  -- Bạn mới hoàn toàn → created: mã VNC, sổ snag_league assigned, phụ huynh +84, liên kết league
  r := public.league_issue(jsonb_build_object('league_ref', 'ev:11/reg:B2',
    'child', jsonb_build_object('name', 'Test Snag Ban Moi', 'dob', '2018-01-02', 'gender', 'female'),
    'guardian', jsonb_build_object('name', 'Test PH Moi', 'phone', '0912000402'),
    'consents', jsonb_build_object('photo', false, 'leaderboard_name', true)));
  if r ->> 'status' <> 'created' or r ->> 'student_code' !~ '^VNC-\d{6}$' then raise exception 'FAIL issue created: %', r; end if;
  select id into s_new from public.students where student_code = r ->> 'student_code';
  if (select verification_status from public.students where id = s_new) <> 'pending_review' then raise exception 'FAIL: hồ sơ mới không pending_review'; end if;
  if not exists (select 1 from public.passports p join public.passport_tiers t on t.id = p.tier_id
                 where p.passport_code = r ->> 'passport_code' and p.student_id = s_new and t.code = 'snag_league' and p.status = 'assigned') then
    raise exception 'FAIL: thẻ số snag_league';
  end if;
  if r ->> 'qr_url' <> public.league_qr_url(r ->> 'passport_code') then raise exception 'FAIL qr_url'; end if;
  if not exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                 where sg.student_id = s_new and sg.linked_via = 'league' and g.phone = '+84912000402') then
    raise exception 'FAIL: phụ huynh / liên kết league';
  end if;
  if (select string_agg(type || '=' || granted, ',' order by type) from public.consents where student_id = s_new) <> 'leaderboard_name=true,photo=false' then
    raise exception 'FAIL: đồng ý bạn mới';
  end if;
  -- /p/ mở được thẻ số (passport_lookup trả ok)
  perform pg_temp.act_as(null);
  r2 := public.passport_lookup(r ->> 'passport_code');
  if r2 ->> 'result' <> 'ok' then raise exception 'FAIL: /p/ thẻ số: %', r2; end if;
  perform pg_temp.as_service();
  r2 := public.league_issue(jsonb_build_object('league_ref', 'ev:11/reg:B2', 'child', jsonb_build_object('name', 'Test Snag Ban Moi')));
  if r2 ->> 'passport_code' <> r ->> 'passport_code' or r2 ->> 'status' <> 'created' then raise exception 'FAIL: lặp lại created: %', r2; end if;
  if (select count(*) from public.students where full_name = 'Test Snag Ban Moi') <> 1 then raise exception 'FAIL: lặp lại tạo thêm hồ sơ'; end if;

  -- Nghi trùng: cùng tên, khác ngày sinh → vẫn tạo, vào hàng chờ, trả review
  r := public.league_issue(jsonb_build_object('league_ref', 'ev:11/reg:C3',
    'child', jsonb_build_object('name', 'Test Snag Ban Moi', 'dob', '2016-09-09'), 'guardian', jsonb_build_object('phone', '0912000999')));
  if r ->> 'status' <> 'review' then raise exception 'FAIL issue review: %', r; end if;
  select id into s_x from public.students where student_code = r ->> 'student_code';
  if not exists (select 1 from public.league_match_queue where new_student_id = s_x and source = 'issue' and status = 'pending'
                 and s_new = any(candidate_student_ids)) then
    raise exception 'FAIL: hàng chờ nghi trùng';
  end if;
  -- Cùng tên, cùng ngày sinh → matched dù khác SĐT
  r := public.league_issue(jsonb_build_object('league_ref', 'ev:11/reg:D4',
    'child', jsonb_build_object('name', 'Test Snag Ban Moi', 'dob', '2018-01-02'), 'guardian', jsonb_build_object('phone', '0988000111')));
  if r ->> 'status' <> 'matched' or r ->> 'student_code' <> (select student_code from public.students where id = s_new) then
    raise exception 'FAIL: tên + ngày sinh không matched: %', r;
  end if;
  if exists (select 1 from public.guardians where phone = '+84988000111') then raise exception 'FAIL: matched mà gắn phụ huynh lạ'; end if;
  -- Lỗi đầu vào
  ok := false; begin perform public.league_issue('{"child":{"name":"X"}}'); exception when others then ok := sqlerrm = 'league_ref_required'; end;
  if not ok then raise exception 'FAIL: thiếu league_ref'; end if;
  ok := false; begin perform public.league_issue('{"league_ref":"z1","child":{"name":"X"},"guardian":{"phone":"12"}}'); exception when others then ok := sqlerrm = 'invalid_phone'; end;
  if not ok then raise exception 'FAIL: SĐT sai'; end if;
  ok := false; begin perform public.league_issue('{"league_ref":"z2","child":{"name":"X","dob":"31/02/2018"}}'); exception when others then ok := sqlerrm = 'invalid_dob'; end;
  if not ok then raise exception 'FAIL: ngày sinh sai'; end if;

  ------------------------------------------------------------------ 7.4 results: điểm theo thang; gửi lại thay thế, không nhân đôi
  r := public.league_results(jsonb_build_object('action', 'results',
    'event', jsonb_build_object('no', 61, 'date', '2026-11-08', 'venue', 'Sân thử Đầm Sen', 'holes', 3),
    'rows', jsonb_build_array(
      jsonb_build_object('student_code', ev_code, 'name', 'Test Snag Su Kien', 'club', 'X', 'group', 'Bảng U10', 'to_par', -1,
                         'title', 'Vô địch (Best Gross)', 'culture', 'Tinh thần Golfer', 'health_note', 'bỏ'),
      jsonb_build_object('student_code', null, 'name', 'Test Snag Khong Ma', 'club', 'Y', 'title', '1st Runner Up'),
      jsonb_build_object('name', 'Test Snag Phu Huynh 2', 'club', 'Parent', 'title', 'Winner bảng'))));
  if not (r ->> 'ok' = 'true' and (r ->> 'saved')::int = 3 and (r ->> 'unmatched')::int = 1) then raise exception 'FAIL results: %', r; end if;
  select id into v_t from public.tournaments where stage_no = 61 and series_id = public.league_series_id();
  if (select points_total || '|' || rank_title_code || '|' || culture_award_code || '|' || to_par from public.tournament_results where tournament_id = v_t and student_id = s_ev)
     <> '750|best_gross|spirit_of_the_game|-1' then
    raise exception 'FAIL: điểm chặng 61';
  end if;
  if (select participant_kind from public.tournament_results where tournament_id = v_t and raw_name = 'Test Snag Phu Huynh 2') <> 'parent' then
    raise exception 'FAIL: phụ huynh';
  end if;
  if not exists (select 1 from public.league_match_queue q join public.tournament_results t on t.id = q.tournament_result_id
                 where t.tournament_id = v_t and t.raw_name = 'Test Snag Khong Ma' and q.reason = 'no_match' and q.source = 'results') then
    raise exception 'FAIL: dòng không mã chưa vào hàng chờ';
  end if;
  if (select total_points from public.league_standings where student_id = s_ev) <> 750 then raise exception 'FAIL: hạng sau results'; end if;

  -- Admin ghép tay dòng không mã → gửi lại chặng (bạn có mã đổi danh hiệu, bỏ phụ huynh) → giữ ghép tay, thay điểm, không nhân đôi
  update public.tournament_results set student_id = s_new where tournament_id = v_t and raw_name = 'Test Snag Khong Ma';
  r := public.league_results(jsonb_build_object(
    'event', jsonb_build_object('no', 61, 'date', '2026-11-08'),
    'rows', jsonb_build_array(
      jsonb_build_object('student_code', ev_code, 'name', 'Test Snag Su Kien', 'title', 'Winner bảng'),
      jsonb_build_object('name', 'Test Snag Khong Ma', 'title', '1st Runner Up'))));
  if (r ->> 'saved')::int <> 2 or (r ->> 'unmatched')::int <> 0 then raise exception 'FAIL gửi lại: %', r; end if;
  if (select count(*) from public.tournament_results where tournament_id = v_t) <> 2 then raise exception 'FAIL: gửi lại nhân đôi / không xoá dòng cũ'; end if;
  if (select total_points from public.league_standings where student_id = s_ev) <> 350 then raise exception 'FAIL: điểm sau gửi lại'; end if;
  if (select student_id from public.tournament_results where tournament_id = v_t and raw_name = 'Test Snag Khong Ma') <> s_new then
    raise exception 'FAIL: mất ghép tay của admin';
  end if;
  if (select venue from public.tournaments where id = v_t) <> 'Sân thử Đầm Sen' then raise exception 'FAIL: mất tên sân khi gửi lại'; end if;
  if (select count(*) from public.audit_logs where action = 'league.results' and entity_id = v_t) <> 2 then raise exception 'FAIL: nhật ký results'; end if;
  ok := false; begin perform public.league_results('{"event":{"no":"x"},"rows":[]}'); exception when others then ok := sqlerrm = 'invalid_event'; end;
  if not ok then raise exception 'FAIL: event sai'; end if;
  ok := false;
  begin perform public.league_results('{"event":{"no":62,"date":"2026-11-08"},"rows":[{"name":"A b"},{"name":"a  B"}]}');
  exception when others then ok := sqlerrm like 'duplicate_name%'; end;
  if not ok then raise exception 'FAIL: trùng tên trong một lần gửi'; end if;

  ------------------------------------------------------------------ Nhập lịch sử: chạy thử không ghi; ghi thật; chạy lại không tạo trùng
  r := public.league_import_history(jsonb_build_array(jsonb_build_object('no', 71, 'date', '2026-03-28', 'rows', jsonb_build_array(
    jsonb_build_object('name', 'Test Snag Lich Su', 'club', 'TVD', 'title', 'Vô địch (Best Gross)', 'birth_year', 2015, 'gender', 'Nữ',
                       'points_participation', 50, 'points_rank', 500, 'points_bonus', 0),
    jsonb_build_object('name', 'Test Snag Su Kien', 'club', 'TVD', 'title', 'Winner bảng',
                       'points_participation', 50, 'points_rank', 250, 'points_bonus', 0),
    jsonb_build_object('name', 'Test Snag Phu Huynh 3', 'club', 'Parent', 'title', '1st Runner Up',
                       'points_participation', 50, 'points_rank', 250, 'points_bonus', 0)))), true);
  if not (r ->> 'dry_run' = 'true' and jsonb_array_length(r #> '{stages,0,mismatches}') = 1
          and (r #>> '{stages,0,created}')::int = 2 and (r #>> '{stages,0,review}')::int = 1 and (r #>> '{stages,0,matched_by_name}')::int = 0) then
    raise exception 'FAIL chạy thử: %', r;
  end if;
  if exists (select 1 from public.students where full_name = 'Test Snag Lich Su')
     or exists (select 1 from public.tournaments where stage_no = 71) then
    raise exception 'FAIL: chạy thử vẫn ghi';
  end if;
  -- "Test Snag Su Kien" có 1 hồ sơ trùng tên nhưng file không có năm sinh và không cùng trường → nghi trùng (tạo mới + hàng chờ)
  r := public.league_import_history(jsonb_build_array(jsonb_build_object('no', 71, 'date', '2026-03-28', 'rows', jsonb_build_array(
    jsonb_build_object('name', 'Test Snag Lich Su', 'club', 'TVD', 'title', 'Vô địch (Best Gross)', 'birth_year', 2015, 'gender', 'Nữ',
                       'points_participation', 50, 'points_rank', 500, 'points_bonus', 0),
    jsonb_build_object('name', 'Test Snag Su Kien', 'club', 'TVD', 'title', 'Winner bảng',
                       'points_participation', 50, 'points_rank', 300, 'points_bonus', 0)))), false);
  if not ((r #>> '{stages,0,created}')::int = 2 and (r #>> '{stages,0,review}')::int = 1 and jsonb_array_length(r #> '{stages,0,mismatches}') = 0) then
    raise exception 'FAIL ghi thật: %', r;
  end if;
  if (select birth_year || '|' || gender || '|' || verification_status from public.students where full_name = 'Test Snag Lich Su') <> '2015|female|pending_review' then
    raise exception 'FAIL: hồ sơ lịch sử';
  end if;
  if not exists (select 1 from public.passports p join public.students s on s.id = p.student_id
                 where s.full_name = 'Test Snag Lich Su' and p.tier_id = (select id from public.passport_tiers where code = 'snag_league')) then
    raise exception 'FAIL: hồ sơ lịch sử chưa có thẻ số';
  end if;
  if (select count(*) from public.league_match_queue where source = 'import' and status = 'pending' and s_ev = any(candidate_student_ids)) <> 1 then
    raise exception 'FAIL: hàng chờ nhập lịch sử';
  end if;
  select count(*) into n from public.students;
  r := public.league_import_history(jsonb_build_array(jsonb_build_object('no', 71, 'date', '2026-03-28', 'rows', jsonb_build_array(
    jsonb_build_object('name', 'Test Snag Lich Su', 'club', 'TVD', 'title', 'Vô địch (Best Gross)', 'birth_year', 2015,
                       'points_participation', 50, 'points_rank', 500, 'points_bonus', 0),
    jsonb_build_object('name', 'Test Snag Su Kien', 'club', 'TVD', 'title', 'Winner bảng',
                       'points_participation', 50, 'points_rank', 300, 'points_bonus', 0)))), false);
  if (select count(*) from public.students) <> n or (r #>> '{stages,0,created}')::int <> 0 then raise exception 'FAIL: chạy lại tạo hồ sơ trùng: %', r; end if;
  if (select count(*) from public.league_match_queue where source = 'import' and status = 'pending' and s_ev = any(candidate_student_ids)) <> 1 then
    raise exception 'FAIL: chạy lại nhân đôi hàng chờ';
  end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'standings') e where e ->> 'name' = 'Test Snag Lich Su' and (e ->> 'total')::int = 550) then
    raise exception 'FAIL: báo cáo tổng điểm: %', r -> 'standings';
  end if;

  raise exception 'ALL_OK';
end $$;
