-- Ưu tiên 1 + 2 của app Handicap: thông báo, chấm chéo, tra cứu, thống kê nâng cao, dữ liệu tiến bộ, nhập điểm hàng loạt.
-- Toàn bộ dữ liệu thử bị huỷ ở cuối (khối kết thúc bằng raise 'ALL_OK' nên mọi thay đổi được hoàn tác).
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

create or replace function pg_temp.as_anon() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $f$;

create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin
  execute q;
  return null;
exception when others then
  return sqlerrm;
end $f$;

do $$
declare
  ug uuid := gen_random_uuid();   -- golfer người lớn A
  ug2 uuid := gen_random_uuid();  -- golfer người lớn B (bạn chơi)
  up uuid := gen_random_uuid();   -- phụ huynh bạn nhỏ 1
  up2 uuid := gen_random_uuid();  -- phụ huynh bạn nhỏ 2
  ux uuid := gen_random_uuid();   -- người khác
  us uuid := gen_random_uuid();   -- nhân sự liên đoàn (ban tổ chức)
  sg uuid; sg2 uuid; sk uuid; sk2 uuid; gp uuid; gp2 uuid;
  mg uuid; mg2 uuid; mk uuid; mk2 uuid;
  tee text; lay text; r uuid; r2 uuid; rs uuid; crs uuid;
  v_brand text := 'Test Plus Brand ' || substr(md5(random()::text), 1, 6);
  v1 text := 'hn-990101';
  sc9 jsonb := '[5,6,4,5,6,5,4,6,5]';
  all5 int[] := array_fill(5, array[18]);
  x record; n int; e text; j jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-plus-' || u || '@example.test', now()
  from unnest(array[ug, ug2, up, up2, ux, us]) u;

  insert into public.students (full_name, date_of_birth, gender, student_code) values ('Nguyễn Văn Người Lớn', '1985-05-05', 'male', 'TPL-0001') returning id into sg;
  insert into public.students (full_name, date_of_birth, gender, student_code) values ('Trần Bạn Chơi', '1987-01-01', 'male', 'TPL-0002') returning id into sg2;
  insert into public.students (full_name, date_of_birth, gender, student_code) values ('Vũ Anh Bạn Nhỏ', (current_date - interval '10 years')::date, 'male', 'TPL-0003') returning id into sk;
  insert into public.students (full_name, date_of_birth, gender, student_code) values ('Lê Bạn Nhỏ Hai', (current_date - interval '10 years')::date, 'female', 'TPL-0004') returning id into sk2;
  insert into public.student_accounts (student_id, user_id, username) values (sg, ug, 'tpl.a'), (sg2, ug2, 'tpl.b');
  insert into public.guardians (full_name, phone, user_id) values ('PH 1', '+84900007001', up) returning id into gp;
  insert into public.guardians (full_name, phone, user_id) values ('PH 2', '+84900007002', up2) returning id into gp2;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (sk, gp, 'father', true, true, 'admin', 'active', now()), (sk2, gp2, 'mother', true, true, 'admin', 'active', now());

  insert into public.whs_federations (id, name, short, country) values ('zp-test', 'Test Plus Federation', 'TP', 'VN');
  insert into public.whs_clubs (federation_id, name) values ('zp-test', 'CLB Test Plus');
  insert into public.whs_members (student_id, federation_id, full_name, gender, status, home_club_id)
    values (sg, 'zp-test', 'Nguyễn Văn Người Lớn', 'M', 'active', (select id from public.whs_clubs where name = 'CLB Test Plus')) returning id into mg;
  insert into public.whs_members (student_id, federation_id, full_name, gender, status) values (sg2, 'zp-test', 'Trần Bạn Chơi', 'M', 'active') returning id into mg2;
  insert into public.whs_members (student_id, federation_id, full_name, gender, is_minor, status) values (sk, 'zp-test', 'Vũ Anh Bạn Nhỏ', 'M', true, 'pending') returning id into mk;
  insert into public.whs_members (student_id, federation_id, full_name, gender, is_minor, status) values (sk2, 'zp-test', 'Lê Bạn Nhỏ Hai', 'F', true, 'pending') returning id into mk2;
  insert into public.whs_staff (user_id, federation_id, role) values (us, 'zp-test', 'fed_admin');

  insert into public.whs_youth_tees (federation_id, name, age_group, yd, par, si)
    values ('zp-test', 'Tee U11 Test', 'U11', array_fill(300, array[9]), array[4,4,3,5,4,4,3,5,4], array[1,2,3,4,5,6,7,8,9]) returning id into tee;
  insert into public.whs_youth_layouts (federation_id, name, holes)
    values ('zp-test', 'SNAG 3 hố Test', '[{"par":3},{"par":2},{"par":3}]') returning id into lay;

  ----------------------------------------------------------------- Chấm chéo Junior
  perform pg_temp.act_as(up);
  r := public.whs_youth_submit('junior', tee, current_date - 3, sc9, 'event', null, null, mk);
  e := pg_temp.err(format('select public.whs_peer_request(%L, %L, %L)', 'youth', r, mk));
  assert e like '%peer_cannot_be_self%', 'không tự xác nhận vòng của con: ' || coalesce(e, 'null');
  select member_id into x from public.whs_find_peer('zp-test', ' tpl-0004 ');
  assert x.member_id = mk2, 'tìm bạn chơi theo mã VNC (kể cả hội viên đang chờ duyệt)';
  perform public.whs_peer_request('youth', r, mk2);

  perform pg_temp.act_as(ux);
  e := pg_temp.err(format('select public.whs_peer_attest(%L, %L, true)', 'youth', r));
  assert e like '%not_peer%', 'người ngoài không xác nhận được: ' || coalesce(e, 'null');
  select count(*) into n from public.whs_peer_queue();
  assert n = 0, 'người ngoài không thấy hàng chờ';

  perform pg_temp.act_as(up2);
  select count(*) into n from public.whs_notifications where kind = 'peer_request' and data ->> 'round' = r::text;
  assert n = 1, 'phụ huynh bạn chơi nhận thông báo nhờ xác nhận';
  select * into x from public.whs_peer_queue() q where q.round_id = r;
  assert x.golfer = 'Vũ Anh Bạn Nhỏ' and x.ref_name = 'Tee U11 Test' and jsonb_array_length(x.par) = 9, 'hàng chờ có tên, tee, par';
  select count(*) into n from public.whs_youth_rounds where id = r;
  assert n = 1, 'bạn chơi xem được vòng mình được nhờ';
  perform public.whs_peer_attest('youth', r, true);
  perform pg_temp.act_as(up);
  select status, attest_status, decided_by into x from public.whs_youth_rounds where id = r;
  assert x.status = 'confirmed' and x.attest_status = 'accepted' and x.decided_by = up2, 'bạn chơi xác nhận → điểm được tính luôn';
  select count(*) into n from public.whs_notifications where kind = 'youth_confirmed' and user_id = up;
  assert n = 1, 'phụ huynh được báo vòng đã xác nhận';

  -- Không đồng ý: bắt buộc lý do, vòng vẫn chờ để admin xem
  r2 := public.whs_youth_submit('junior', tee, current_date - 2, sc9, 'event', null, null, mk);
  perform public.whs_peer_request('youth', r2, mk2);
  perform pg_temp.act_as(up2);
  e := pg_temp.err(format('select public.whs_peer_attest(%L, %L, false)', 'youth', r2));
  assert e like '%dispute_needs_reason%', 'không đồng ý phải ghi lý do: ' || coalesce(e, 'null');
  perform public.whs_peer_attest('youth', r2, false, 'Hố 2 con đánh 7');
  perform pg_temp.act_as(up);
  select status, attest_status into x from public.whs_youth_rounds where id = r2;
  assert x.status = 'pending' and x.attest_status = 'disputed', 'tranh chấp → vẫn chờ admin';
  select count(*) into n from public.whs_notifications where kind = 'peer_disputed' and user_id = up;
  assert n = 1, 'phụ huynh được báo có tranh chấp';
  e := pg_temp.err(format('select public.whs_peer_attest(%L, %L, true)', 'youth', r2));
  assert e is not null, 'không xác nhận lại vòng đang tranh chấp';

  ----------------------------------------------------------------- Chấm chéo Golf 3D (điểm tính và chỉ số cập nhật ngay)
  execute 'reset role';
  insert into public.sim_brands (key, "group") values (v_brand, 'screen');
  insert into public.practice_venues (id, region, name, type, machine) values (v1, 'hn', 'Phòng 3D Test Plus', '3d', v_brand);
  insert into public.whs_sim_courses (brand, name, tee_name, holes, par, si, cr, slope)
    values (v_brand, 'Sân ảo Plus', 'Trắng', 18, array_fill(4, array[18]), array(select generate_series(1, 18)), 72.0, 113) returning id into crs;
  perform pg_temp.act_as(ug);
  rs := public.whs_sim_submit(v1, crs, '18', current_date - 1, all5, false, false, 'AAAA', 'image/jpeg');
  perform public.whs_peer_request('sim', rs, mg2);
  perform pg_temp.act_as(ug2);
  select count(*) into n from public.whs_peer_queue() q where q.round_id = rs and q.kind = 'sim' and jsonb_array_length(q.par) = 18;
  assert n = 1, 'bạn chơi thấy vòng 3D cần xác nhận';
  perform public.whs_peer_attest('sim', rs, true, 'Đúng');
  perform pg_temp.act_as(ug);
  select status into x from public.whs_sim_rounds where id = rs;
  assert x.status = 'confirmed', 'vòng 3D được xác nhận bởi bạn chơi';
  select n_scores into x from public.whs_sim_index where member_id = mg and brand = v_brand;
  assert x.n_scores = 1, 'chỉ số 3D được tính lại ngay';
  select count(*) into n from public.whs_notifications where user_id = ug and kind = 'sim_confirmed';
  assert n = 1, 'golfer được báo vòng 3D đã xác nhận';

  execute 'reset role';
  update public.whs_settings set value = 'false' where key = 'peerAttestSim';
  perform pg_temp.act_as(ug);
  r := public.whs_sim_submit(v1, crs, '18', current_date, all5, false, false, 'AAAA', 'image/jpeg');
  e := pg_temp.err(format('select public.whs_peer_request(%L, %L, %L)', 'sim', r, mg2));
  assert e like '%peer_disabled%', 'liên đoàn tắt chấm chéo 3D: ' || coalesce(e, 'null');
  execute 'reset role';
  update public.whs_settings set value = 'true' where key = 'peerAttestSim';

  ----------------------------------------------------------------- Thống kê nâng cao
  perform pg_temp.act_as(ug);
  e := pg_temp.err(format('select public.whs_set_round_stats(%L, %L, %L::jsonb)', 'sim', rs, '[{"putts":2}]'));
  assert e like '%stats_length%', 'sai số hố: ' || coalesce(e, 'null');
  j := (select jsonb_agg(case when i = 1 then '{"fw":"left","gir":false,"on":4,"putts":2,"pen":1,"ob":1,"bunker":2}'::jsonb
                              when i <= 10 then '{"fw":"hit","gir":true,"putts":2}'::jsonb
                              when i = 11 then '{"fw":"short","putts":3}'::jsonb else 'null'::jsonb end order by i)
        from generate_series(1, 18) i);
  e := pg_temp.err(format('select public.whs_set_round_stats(%L, %L, %L::jsonb)', 'sim', rs, replace(j::text, '"ob"', '"xx"')));
  assert e like '%stats_bad_key%', 'chặn khoá lạ: ' || coalesce(e, 'null');
  e := pg_temp.err(format('select public.whs_set_round_stats(%L, %L, %L::jsonb)', 'sim', rs, replace(j::text, '"left"', '"up"')));
  assert e like '%stats_bad_value%', 'chặn giá trị lạ: ' || coalesce(e, 'null');
  j := public.whs_set_round_stats('sim', rs, j);
  assert (j ->> 'holes')::int = 11 and (j ->> 'fw_att')::int = 11 and (j ->> 'fw_hit')::int = 9 and (j ->> 'fw_left')::int = 1
     and (j ->> 'fw_short')::int = 1 and (j ->> 'gir_att')::int = 10 and (j ->> 'gir')::int = 9 and (j ->> 'putts')::int = 23
     and (j ->> 'pen')::int = 1 and (j ->> 'ob')::int = 1 and (j ->> 'bunker')::int = 2 and (j ->> 'on_sum')::int = 4
     and (j ->> 'on_holes')::int = 1, 'tóm tắt thống kê: ' || j::text;
  e := pg_temp.err(format('select public.whs_set_round_stats(%L, %L, %L::jsonb)', 'sim', rs,
    (select jsonb_agg(case when i = 1 then '{"on":0}'::jsonb else 'null'::jsonb end) from generate_series(1, 18) i)));
  assert e like '%stats_bad_value%', 'số gậy on phải từ 1: ' || coalesce(e, 'null');
  perform pg_temp.act_as(ux);
  e := pg_temp.err(format('select public.whs_set_round_stats(%L, %L, null)', 'sim', rs));
  assert e like '%not_your_round%', 'người khác không sửa được thống kê: ' || coalesce(e, 'null');
  select count(*) into n from public.whs_round_stats;
  assert n = 0, 'người khác không đọc được thống kê';

  -- Junior: hố par 3 không tính fairway
  perform pg_temp.act_as(up);
  j := public.whs_set_round_stats('junior', (select id from public.whs_youth_rounds where member_id = mk and status = 'confirmed' limit 1),
    '[{"fw":"hit"},{"fw":"right"},{"fw":"hit","gir":true},null,null,null,null,null,null]'::jsonb);
  assert (j ->> 'fw_att')::int = 2 and (j ->> 'fw_right')::int = 1 and (j ->> 'gir')::int = 1, 'par 3 không tính fairway: ' || j::text;

  ----------------------------------------------------------------- Dữ liệu tiến bộ
  j := public.whs_progress(mk);
  assert jsonb_array_length(j -> 'stats') = 1 and (j -> 'stats' -> 0 ->> 'fw_att')::int = 2, 'phụ huynh xem tiến bộ của con: ' || j::text;
  perform pg_temp.act_as(ux);
  e := pg_temp.err(format('select public.whs_progress(%L)', mk));
  assert e like '%forbidden%', 'người ngoài không xem tiến bộ: ' || coalesce(e, 'null');

  ----------------------------------------------------------------- Thông báo khi chỉ số đổi (không báo trùng khi tính lại)
  execute 'reset role';
  insert into public.whs_youth_index (member_id, kind, idx, n_rounds, holes, as_of) values (mk, 'junior', 24.0, 3, 27, current_date);
  update public.whs_youth_index set computed_at = now() where member_id = mk and kind = 'junior';
  update public.whs_youth_index set idx = 22.5 where member_id = mk and kind = 'junior';
  select count(*) into n from public.whs_notifications where user_id = up and data ->> 'key' = 'junior' and kind = 'index_first';
  assert n = 1, 'báo lần đầu có Junior Handicap';
  select count(*) into n from public.whs_notifications where user_id = up and data ->> 'key' = 'junior';
  assert n = 2, 'tổng 2 thông báo Junior (lần đầu + đổi), thực tế ' || n;
  select count(*) into n from public.whs_notifications where user_id = up and kind = 'index_change' and (data ->> 'new')::numeric = 22.5;
  assert n = 1, 'báo khi chỉ số đổi 24.0 → 22.5, không báo khi giá trị không đổi';
  insert into public.whs_hi_history (member_id, as_of, hi) values (mg, current_date - 20, 18.0), (mg, current_date - 10, 17.2), (mg, current_date - 1, 16.4);
  delete from public.whs_hi_history where member_id = mg;
  insert into public.whs_hi_history (member_id, as_of, hi) values (mg, current_date - 20, 18.0), (mg, current_date - 10, 17.2), (mg, current_date - 1, 16.4);
  select count(*) into n from public.whs_notifications where user_id = ug and data ->> 'key' = 'whs';
  assert n = 1, 'tính lại cả lịch sử chỉ báo một lần, thực tế ' || n;

  ----------------------------------------------------------------- Tra cứu
  perform pg_temp.as_anon();
  select count(*) into n from public.whs_lookup_plus('người lớn');
  assert n = 1, 'khách tra được người lớn theo tên';
  select * into x from public.whs_lookup_plus('TPL-0001');
  assert x.hi = 16.4 and x.club = 'CLB Test Plus' and not x.is_minor, 'người lớn: HI, CLB';
  select count(*) into n from public.whs_lookup_plus('TPL-0003');
  assert n = 0, 'khách chưa đăng nhập không tra được trẻ em';
  perform pg_temp.act_as(ux);
  select count(*) into n from public.whs_lookup_plus('Bạn Nhỏ');
  assert n = 0, 'trẻ em không tìm được theo tên';
  select * into x from public.whs_lookup_plus('tpl-0003');
  assert x.full_name = 'V. A. B. Nhỏ' and x.club is null and x.junior = 22.5 and x.recent = '[]'::jsonb, 'trẻ em: tên viết tắt, chỉ chỉ số: ' || coalesce(x.full_name, 'null');
  select sims into x from public.whs_lookup_plus('TPL-0001');
  assert jsonb_array_length(x.sims) = 0 or (x.sims -> 0 ->> 'brand') = v_brand, 'chỉ số 3D theo hãng';

  ----------------------------------------------------------------- Nhập điểm hàng loạt
  perform pg_temp.act_as(ux);
  e := pg_temp.err(format('select public.whs_bulk_import(%L, %L, %L, current_date, %L, null, %L::jsonb)', 'zp-test', 'junior', 'Giải Test', tee, '[{"code":"TPL-0003","scores":[4,4,3,5,4,4,3,5,4]}]'));
  assert e like '%forbidden%', 'người thường không nhập hàng loạt: ' || coalesce(e, 'null');
  perform pg_temp.act_as(us);
  j := public.whs_bulk_import('zp-test', 'junior', 'Giải Test', current_date, tee, null,
    '[{"line":2,"code":"tpl-0003","scores":[4,4,3,5,4,4,3,5,4]},{"line":3,"code":"KHONG-CO","scores":[4,4,3,5,4,4,3,5,4]},{"line":4,"code":"TPL-0004","scores":[4,4,3]},{"line":5,"code":"TPL-0003","scores":[4,4,3,5,4,4,3,5,4]}]'::jsonb);
  assert (j ->> 'ok')::int = 1 and (j ->> 'err')::int = 3 and not (j ->> 'committed')::boolean, 'kiểm tra trước: 1 dòng đúng, 3 lỗi: ' || j::text;
  assert j -> 'rows' -> 1 ->> 'error' like '%member_not_found%' and j -> 'rows' -> 2 ->> 'error' like '%scores_length%'
     and j -> 'rows' -> 3 ->> 'error' like '%duplicate_in_file%', 'báo lỗi từng dòng: ' || j::text;
  select count(*) into n from public.whs_youth_rounds where member_id = mk;
  assert n = 2, 'kiểm tra trước không ghi gì';
  j := public.whs_bulk_import('zp-test', 'junior', 'Giải Test', current_date, tee, null,
    '[{"code":"TPL-0003","scores":[4,4,3,5,4,4,3,5,4]},{"code":"TPL-0004","date":"","scores":[5,5,4,6,5,5,4,6,5]}]'::jsonb, true);
  assert (j ->> 'ok')::int = 2 and (j ->> 'import') is not null, 'ghi 2 dòng: ' || j::text;
  select count(*) into n from public.whs_youth_rounds where import_id = (j ->> 'import')::uuid and status = 'confirmed' and via = 'admin';
  assert n = 2, 'vòng nhập hàng loạt được xác nhận luôn';
  j := public.whs_bulk_import('zp-test', 'junior', 'Giải Test', current_date, tee, null, '[{"code":"TPL-0003","scores":[4,4,3,5,4,4,3,5,4]}]'::jsonb);
  assert j -> 'rows' -> 0 ->> 'error' like '%duplicate_round%', 'chặn nhập trùng: ' || j::text;
  j := public.whs_bulk_import('zp-test', 'snag', 'Chặng SNAG Test', current_date, lay, null, '[{"code":"TPL-0004","scores":[3,2,4]}]'::jsonb, true);
  assert (j ->> 'ok')::int = 1, 'nhập SNAG: ' || j::text;

  -- Sân thật: vòng thi đấu, ban tổ chức huỷ → golfer được báo
  execute 'reset role';
  insert into public.whs_courses (id, name, country, data) values ('zp-course', 'Sân Test Plus', 'VN',
    jsonb_build_object('par', array_fill(4, array[18]), 'si', array(select generate_series(1, 18)), 'h', 18,
      'tees', jsonb_build_object('W', jsonb_build_object('name', 'Trắng', 'g', 'M', 'cr', 72.0, 'sr', 113, 'par', 72))));
  perform pg_temp.act_as(us);
  j := public.whs_bulk_import('zp-test', 'whs', 'Giải CLB Test', current_date - 1, 'zp-course|W', '18', '[{"code":"TPL-0001","scores":[5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5]}]'::jsonb, true);
  assert (j ->> 'ok')::int = 1, 'nhập vòng sân thật: ' || j::text;
  r := (j -> 'rows' -> 0 ->> 'round')::uuid;
  perform public.whs_committee_decide(r, 'reject', 'Nhập nhầm giải');
  perform pg_temp.act_as(ug);
  select count(*) into n from public.whs_notifications where user_id = ug and kind = 'round_rejected';
  assert n = 1, 'golfer được báo vòng sân thật bị từ chối';
  j := public.whs_set_round_stats('whs', r, (select jsonb_agg('{"putts":2}'::jsonb) from generate_series(1, 18)));
  assert (j ->> 'putts')::int = 36, 'thống kê vòng sân thật';

  ----------------------------------------------------------------- Đọc / đánh dấu thông báo, đăng ký thông báo đẩy
  perform pg_temp.act_as(up);
  select count(*) into n from public.whs_notif_list(100) where read_at is null;
  assert n >= 3, 'phụ huynh có thông báo chưa đọc';
  select count(*) into n from public.whs_notifications where user_id <> up;
  assert n = 0, 'chỉ thấy thông báo của mình';
  n := public.whs_notif_read(null);
  select count(*) into n from public.whs_notif_list(100) where read_at is null;
  assert n = 0, 'đánh dấu đã đọc hết';
  e := pg_temp.err('select public.whs_push_subscribe(''http://x'', ''a'', ''b'')');
  assert e like '%bad_endpoint%', 'endpoint phải https: ' || coalesce(e, 'null');
  perform public.whs_push_subscribe('https://push.example.test/abc', 'p256', 'authkey', 'test');
  select count(*) into n from public.whs_push_subs;
  assert n = 1, 'đăng ký thông báo đẩy';
  perform public.whs_push_unsubscribe('https://push.example.test/abc');

  perform pg_temp.as_anon();
  e := pg_temp.err('select public.whs_notif_list(10)');
  assert e is not null, 'khách không gọi được danh sách thông báo';

  ----------------------------------------------------------------- Khoá thông báo đẩy: chỉ máy chủ đọc được
  perform pg_temp.act_as(us);
  e := pg_temp.err('select count(*) from public.whs_push_keys');
  assert e is not null, 'người dùng không đọc được khoá thông báo đẩy';
  e := pg_temp.err('select public.whs_push_vapid()');
  assert e is not null, 'người dùng không gọi được hàm lấy khoá VAPID';
  execute 'reset role';
  select cron_key into e from public.whs_push_keys where id = 1;
  assert length(e) = 64 and public.whs_push_check(e) and not public.whs_push_check('sai') and not public.whs_push_check(null), 'kiểm tra khoá cron';
  assert public.whs_push_set_vapid('PUB1', 'PRIV1') = 'PUB1' and public.whs_push_set_vapid('PUB2', 'PRIV2') = 'PUB1', 'VAPID chỉ ghi một lần';
  assert (select value #>> '{}' from public.whs_settings where key = 'vapidPublicKey') = 'PUB1', 'khoá công khai chép sang cấu hình app';
  e := pg_temp.err('select public.whs_push_schedule(''https://x.supabase.co/functions/v1/whs-push'')');
  assert e like '%need_pg_cron_and_pg_net%', 'cần pg_cron + pg_net: ' || coalesce(e, 'null');

  raise exception 'ALL_OK';
end $$;
