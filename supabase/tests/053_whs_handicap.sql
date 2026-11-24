-- App Handicap WHS dùng chung máy chủ Golf Passport: gắn hội viên với hồ sơ golfer, quyền xem điểm/chỉ số,
-- mức tối thiểu theo cấu hình liên đoàn, giới hạn 54.0, hàm whs_current_index cho app Tập luyện.
-- Toàn bộ dữ liệu thử bị huỷ ở cuối (khối kết thúc bằng raise 'ALL_OK' nên mọi thay đổi được hoàn tác).
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
  pa uuid := gen_random_uuid();   -- phụ huynh
  px uuid := gen_random_uuid();   -- người khác (phụ huynh nhà khác)
  ka uuid := gen_random_uuid();   -- tài khoản con 12 tuổi
  ad uuid := gen_random_uuid();   -- người lớn tự tạo hồ sơ golfer
  mk uuid := gen_random_uuid();   -- bạn chơi làm marker (tài khoản học viên người lớn)
  fa uuid := gen_random_uuid();   -- quản trị liên đoàn thử
  co uuid := gen_random_uuid();   -- HLV lớp của con
  s12 uuid; s9 uuid; sad uuid; smk uuid; g uuid; gad uuid; gx uuid; sx uuid;
  club uuid; m12 uuid; mad uuid; mmk uuid; r1 uuid; r2 uuid; sc uuid; ay uuid; prog uuid; ctype uuid; cls uuid;
  v record; n int; ok boolean; v_err text;
  gross18 int[] := array[5,5,4,5,6,4,5,5,4, 5,5,4,5,6,4,5,5,4];
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-whs-' || x || '@example.test', now()
  from unnest(array[pa, px, ka, ad, mk, fa, co]) x;
  insert into public.profiles (user_id, full_name) select x, 'Test WHS' from unnest(array[pa, px, ka, ad, mk, fa, co]) x on conflict do nothing;
  insert into public.user_roles (user_id, role) values (co, 'coach');

  insert into public.students (full_name, date_of_birth, gender) values ('Test WHS Con 12', (current_date - interval '12 years 2 months')::date, 'male') returning id into s12;
  insert into public.students (full_name, date_of_birth, gender) values ('Test WHS Con 9', (current_date - interval '9 years 1 month')::date, 'female') returning id into s9;
  insert into public.students (full_name, date_of_birth) values ('Test WHS Người lớn', '1985-05-05') returning id into sad;
  insert into public.students (full_name, date_of_birth, gender) values ('Test WHS Marker', '1980-01-01', 'male') returning id into smk;
  insert into public.students (full_name, date_of_birth, gender) values ('Test WHS Con nhà khác', (current_date - interval '11 years')::date, 'male') returning id into sx;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH WHS', '+84900005301', pa) returning id into g;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH khác WHS', '+84900005302', px) returning id into gx;
  insert into public.guardians (full_name, phone, user_id) values ('Test NL WHS', '+84900005303', ad) returning id into gad;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s12, g, 'mother', true, true, 'admin', 'active', now()), (s9, g, 'mother', true, true, 'admin', 'active', now()),
         (sx, gx, 'father', true, true, 'admin', 'active', now()), (sad, gad, 'self', true, true, 'admin', 'active', now());
  insert into public.student_accounts (student_id, user_id, username) values (s12, ka, 'test.whs.con12'), (smk, mk, 'test.whs.marker');

  -- Lớp của HLV có con 12 tuổi
  insert into public.schools (name, type) values ('TH Test WHS', 'public') returning id into sc;
  select id into ay from public.academic_years order by is_current desc limit 1;
  select id into prog from public.programs where code = 'core20';
  select id into ctype from public.class_types limit 1;
  insert into public.classes (name, school_id, academic_year_id, program_id, class_type_id) values ('Lớp WHS', sc, ay, prog, ctype) returning id into cls;
  insert into public.class_staff (class_id, user_id, role) values (cls, co, 'coach');
  insert into public.enrollments (student_id, class_id) values (s12, cls);

  -- Liên đoàn, CLB, sân thử; cấu hình liên đoàn: 18 hố và 2 điểm để có chỉ số lần đầu
  insert into public.whs_federations (id, name, short, country) values ('zt-test', 'Test Federation', 'TF', 'VN');
  insert into public.whs_clubs (federation_id, name) values ('zt-test', 'CLB Test WHS') returning id into club;
  insert into public.whs_courses (id, name, country, data) values ('zt-test-course', 'Sân Test WHS', 'VN', jsonb_build_object(
    'h', 18, 'par', to_jsonb(array_fill(4, array[18])), 'si', to_jsonb(array(select generate_series(1, 18))),
    'tees', jsonb_build_object('w', jsonb_build_object('name', 'W', 'g', 'M', 'cr', 72, 'sr', 130, 'par', 72,
      'yd', to_jsonb(array_fill(380, array[18]))))));
  insert into public.whs_fed_configs (federation_id, effective_from, values)
  values ('zt-test', current_date - 30, '{"initMinHoles": 18, "initMinScores": 2, "maxHI": 54}');
  insert into public.whs_staff (user_id, federation_id, role) values (fa, 'zt-test', 'fed_admin');

  -- 1. Tham gia theo hồ sơ golfer: phụ huynh đăng ký cho con, người khác không đăng ký được
  perform pg_temp.act_as(px);
  ok := false;
  begin perform public.whs_join('zt-test', club, s12); exception when others then ok := sqlerrm = 'not_your_golfer'; end;
  if not ok then raise exception 'FAIL người khác đăng ký được hồ sơ của con nhà khác'; end if;
  perform pg_temp.act_as(pa);
  m12 := public.whs_join('zt-test', club, s12);
  select count(*) into n from public.whs_my_golfers() x where x.student_id = s12 and x.student_code like 'VNC-%' and x.member_id = m12 and not x.is_self;
  if n <> 1 then raise exception 'FAIL whs_my_golfers không trả mã VNC của con'; end if;
  ok := false;
  begin perform public.whs_join('zt-test', club, s12); exception when others then ok := sqlerrm = 'already_member'; end;
  if not ok then raise exception 'FAIL một hồ sơ tham gia hai lần trong một liên đoàn'; end if;
  if (select gender from public.whs_members where id = m12) <> 'M' or (select is_minor from public.whs_members where id = m12) is not true
     or (select public_lookup from public.whs_members where id = m12) then
    raise exception 'FAIL hội viên trẻ em không lấy đúng giới tính / ẩn tra cứu';
  end if;
  -- Con 9 tuổi không tự đăng ký được bằng tài khoản của mình, nhưng phụ huynh đăng ký thay được (kiểm ở whs_join p_student)
  -- Người lớn tự tạo hồ sơ: không có giới tính trong hồ sơ thì phải chọn
  perform pg_temp.act_as(ad);
  ok := false;
  begin perform public.whs_join('zt-test'); exception when others then ok := sqlerrm = 'gender_required'; end;
  if not ok then raise exception 'FAIL không bắt chọn giới tính khi hồ sơ thiếu'; end if;
  mad := public.whs_join('zt-test', null, null, 'F');
  if (select student_id from public.whs_members where id = mad) <> sad then raise exception 'FAIL không gắn hồ sơ tự tạo'; end if;
  perform pg_temp.act_as(mk);
  mmk := public.whs_join('zt-test');
  if (select student_id from public.whs_members where id = mmk) <> smk then raise exception 'FAIL không gắn hồ sơ tài khoản học viên'; end if;

  -- Liên đoàn duyệt
  perform pg_temp.act_as(fa);
  perform public.whs_set_member_status(m12, 'active');
  perform public.whs_set_member_status(mad, 'active');
  perform public.whs_set_member_status(mmk, 'active');

  -- 2. Con 12 tuổi tự đăng ký và nộp vòng, marker xác nhận
  perform pg_temp.act_as(ka);
  r1 := public.whs_register_round('zt-test-course', 'w', '18');
  perform public.whs_submit_round(r1, gross18, mmk);
  perform pg_temp.act_as(pa);
  ok := false;
  begin perform public.whs_attest_round(r1, true); exception when others then ok := sqlerrm = 'not_marker'; end;
  if not ok then raise exception 'FAIL phụ huynh tự xác nhận vòng của con'; end if;
  perform pg_temp.act_as(mk);
  perform public.whs_attest_round(r1, true);

  -- Máy chủ (whs-recompute) ghi chỉ số; giả lập giá trị vượt trần để kiểm giới hạn 54.0
  perform pg_temp.act_as(null);
  insert into public.whs_hi_history (member_id, as_of, hi, n_diff) values (m12, current_date - 1, 57.3, 1);

  -- 3. Chưa đủ mức tối thiểu (2 điểm): có lịch sử nhưng chưa có chỉ số
  perform pg_temp.act_as(pa);
  select * into v from public.whs_current_index(s12);
  if v.handicap_index is not null or v.holes_posted <> 18 or v.scores_posted <> 1 or v.min_holes_required <> 18 then
    raise exception 'FAIL chưa đủ mức tối thiểu: %', row_to_json(v);
  end if;

  -- Phụ huynh nộp hộ con vòng thứ hai (p_member = con), marker xác nhận → đủ mức tối thiểu
  r2 := public.whs_register_round('zt-test-course', 'w', '18', 'stroke', 'general', null, null, m12);
  perform public.whs_submit_round(r2, gross18, mmk);
  perform pg_temp.act_as(mk);
  perform public.whs_attest_round(r2, true);
  perform pg_temp.act_as(null);
  insert into public.whs_hi_history (member_id, as_of, hi, n_diff) values (m12, current_date, 57.3, 2);

  -- 4. Đủ số hố tối thiểu: có chỉ số và không vượt 54.0
  perform pg_temp.act_as(pa);
  select * into v from public.whs_current_index(s12);
  if v.handicap_index is distinct from 54.0 or v.holes_posted <> 36 or v.scores_posted <> 2 or v.updated_at is null then
    raise exception 'FAIL đủ mức tối thiểu / giới hạn 54.0: %', row_to_json(v);
  end if;

  -- 5. whs_current_index trả đúng giá trị mới nhất cho chính golfer, phụ huynh, HLV lớp
  perform pg_temp.act_as(null);
  update public.whs_hi_history set hi = 12.4 where member_id = m12 and as_of = current_date;
  perform pg_temp.act_as(ka);
  select * into v from public.whs_current_index(s12);
  if v.handicap_index is distinct from 12.4 then raise exception 'FAIL chính golfer: %', row_to_json(v); end if;
  perform pg_temp.act_as(pa);
  select * into v from public.whs_current_index(s12);
  if v.handicap_index is distinct from 12.4 then raise exception 'FAIL phụ huynh: %', row_to_json(v); end if;
  perform pg_temp.act_as(co);
  select * into v from public.whs_current_index(s12);
  if v.handicap_index is distinct from 12.4 then raise exception 'FAIL HLV lớp: %', row_to_json(v); end if;
  -- Golfer chưa là hội viên: không có chỉ số, các số khác vẫn trả (mức tối thiểu theo cấu hình chung)
  perform pg_temp.act_as(pa);
  select * into v from public.whs_current_index(s9);
  if v is null or v.handicap_index is not null or v.holes_posted <> 0 or v.scores_posted <> 0
     or v.min_holes_required is distinct from (select (value #>> '{}')::int from public.whs_settings where key = 'initMinHoles') then
    raise exception 'FAIL golfer chưa là hội viên: %', row_to_json(v);
  end if;

  -- 6. Người khác không đọc được điểm hay chỉ số
  perform pg_temp.act_as(px);
  select count(*) into n from public.whs_current_index(s12);
  if n <> 0 then raise exception 'FAIL người khác đọc được chỉ số'; end if;
  select count(*) into n from public.whs_rounds where member_id = m12;
  if n <> 0 then raise exception 'FAIL người khác đọc được vòng đấu'; end if;
  select count(*) into n from public.whs_hi_history where member_id = m12;
  if n <> 0 then raise exception 'FAIL người khác đọc được lịch sử chỉ số'; end if;
  select count(*) into n from public.whs_members where id = m12;
  if n <> 0 then raise exception 'FAIL người khác đọc được hồ sơ hội viên'; end if;
  ok := false;
  begin perform public.whs_register_round('zt-test-course', 'w', '18', 'stroke', 'general', null, null, m12);
  exception when others then ok := sqlerrm = 'not_your_member'; end;
  if not ok then raise exception 'FAIL người khác nộp vòng cho golfer'; end if;
  -- Người lớn tự tạo hồ sơ cũng không đọc được của con nhà khác
  perform pg_temp.act_as(ad);
  select count(*) into n from public.whs_rounds where member_id = m12;
  if n <> 0 then raise exception 'FAIL hội viên khác đọc được vòng đấu'; end if;

  -- 7. Phụ huynh đọc được điểm và lịch sử của con
  perform pg_temp.act_as(pa);
  select count(*) into n from public.whs_rounds where member_id = m12;
  if n <> 2 then raise exception 'FAIL phụ huynh không thấy vòng của con (%)', n; end if;
  select count(*) into n from public.whs_hi_history where member_id = m12;
  if n <> 2 then raise exception 'FAIL phụ huynh không thấy lịch sử chỉ số của con'; end if;
  -- Không ghi thẳng được vào bảng vòng đấu
  ok := false;
  begin update public.whs_rounds set gross = gross where id = r1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL ghi thẳng được vào whs_rounds'; end if;

  -- 8. Độ dài sân tối thiểu theo cấu hình liên đoàn
  perform pg_temp.act_as(null);
  insert into public.whs_fed_configs (federation_id, effective_from, values) values ('zt-test', current_date, '{"initMinHoles": 18, "initMinScores": 2, "minLen18": 9000}');
  perform pg_temp.act_as(ad);
  ok := false;
  begin perform public.whs_register_round('zt-test-course', 'w', '18'); exception when others then ok := sqlerrm = 'course_too_short'; end;
  if not ok then raise exception 'FAIL không chặn sân ngắn hơn mức tối thiểu'; end if;

  -- 9. Người chưa đăng nhập không gọi được
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  ok := false;
  begin perform public.whs_current_index(s12); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL khách chưa đăng nhập gọi được whs_current_index'; end if;
  execute 'reset role';

  raise exception 'ALL_OK';
end $$;
