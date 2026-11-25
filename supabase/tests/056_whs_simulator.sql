-- Module Simulator (golf 3D): gửi điểm, xác nhận, bộ tính VNC Simulator Index, phân quyền, hàng chờ, cờ chính thức.
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

-- Gọi một câu lệnh, trả thông báo lỗi (null nếu chạy được)
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin
  execute q;
  return null;
exception when others then
  return sqlerrm;
end $f$;

do $$
declare
  ug uuid := gen_random_uuid();   -- golfer người lớn (tài khoản học viên)
  up uuid := gen_random_uuid();   -- phụ huynh của bạn nhỏ
  ura uuid := gen_random_uuid();  -- admin phòng 3D
  ux uuid := gen_random_uuid();   -- người khác
  ua uuid := gen_random_uuid();   -- admin nền tảng VN Centre
  sg uuid; sk uuid; gp uuid; mg uuid; mk uuid; crs uuid; r uuid; r2 uuid; rk uuid; rq uuid;
  v_brand text := 'Test Sim Brand ' || substr(md5(random()::text), 1, 6);
  v1 text := 'hn-990001'; v2 text := 'hn-990002';
  par18 int[] := array_fill(4, array[18]);
  si18 int[] := array(select generate_series(1, 18));
  all5 int[] := array_fill(5, array[18]);
  g3 int[]; g4 int[];
  x record; n int; e text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sim-' || u || '@example.test', now()
  from unnest(array[ug, up, ura, ux, ua]) u;
  insert into public.user_roles (user_id, role) values (ua, 'admin');

  insert into public.students (full_name, date_of_birth, gender) values ('Test Sim Golfer', '1985-05-05', 'male') returning id into sg;
  insert into public.students (full_name, date_of_birth, gender) values ('Test Sim Bạn nhỏ', (current_date - interval '11 years')::date, 'female') returning id into sk;
  insert into public.student_accounts (student_id, user_id, username) values (sg, ug, 'test.sim.golfer');
  insert into public.guardians (full_name, phone, user_id) values ('Test PH Sim', '+84900005601', up) returning id into gp;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (sk, gp, 'mother', true, true, 'admin', 'active', now());

  insert into public.whs_federations (id, name, short, country) values ('zs-test', 'Test Sim Federation', 'TS', 'VN');
  insert into public.whs_members (student_id, federation_id, full_name, gender, status) values (sg, 'zs-test', 'Test Sim Golfer', 'M', 'active') returning id into mg;
  insert into public.whs_members (student_id, federation_id, full_name, gender, is_minor, status) values (sk, 'zs-test', 'Test Sim Bạn nhỏ', 'F', true, 'active') returning id into mk;

  insert into public.sim_brands (key, "group") values (v_brand, 'screen');
  insert into public.practice_venues (id, region, name, type, machine) values (v1, 'hn', 'Phòng 3D Test có admin', '3d', v_brand), (v2, 'hn', 'Phòng 3D Test chưa có admin', '3d', v_brand);

  ----------------------------------------------------------------- Quản trị
  perform pg_temp.act_as(ux);
  e := pg_temp.err(format('select public.whs_sim_save_course(null, %L, %L, %L, %L::int[], %L::int[], 72.0, 113)', v_brand, 'Sân ảo Test', 'Trắng', par18, si18));
  assert e like '%forbidden%', 'người thường không được khai báo sân ảo: ' || coalesce(e, 'null');
  e := pg_temp.err(format('insert into public.whs_sim_rounds (member_id, federation_id, venue_id, brand, course_id, holes, played_on, gross) values (%L, %L, %L, %L, gen_random_uuid(), %L, current_date, %L::int[])', mg, 'zs-test', v1, v_brand, '18', all5));
  assert e is not null, 'không được ghi thẳng vào bảng vòng chơi';

  perform pg_temp.act_as(ua);
  crs := public.whs_sim_save_course(null, v_brand, 'Sân ảo Test', 'Trắng', par18, si18, 72.0, 113);
  e := pg_temp.err(format('select public.whs_sim_set_room_admin_by_login(%L, %L)', v1, 'khong-co@example.test'));
  assert e like '%user_not_found%', 'không tìm thấy tài khoản: ' || coalesce(e, 'null');
  perform public.whs_sim_set_room_admin_by_login(v1, upper('test-sim-' || ura || '@example.test'), true);
  select count(*) into n from public.whs_sim_room_admin_list() l where l.venue_id = v1 and l.user_id = ura;
  assert n = 1, 'giao admin phòng bằng email đăng nhập';
  perform public.whs_sim_set_brand_status(v_brand, false, null, null, true, 'chưa có giấy phép');

  ----------------------------------------------------------------- Gửi điểm: các trường hợp bị chặn
  perform pg_temp.act_as(ug);
  e := pg_temp.err(format('select public.whs_sim_submit(%L, %L, %L, current_date, %L::int[])', v1, crs, '18', all5));
  assert e like '%photo_required%', 'phải kèm ảnh: ' || coalesce(e, 'null');
  e := pg_temp.err(format('select public.whs_sim_submit(%L, %L, %L, current_date, %L::int[], false, true, %L, %L)', v1, crs, '18', all5, 'AAAA', 'image/jpeg'));
  assert e like '%mulligan_not_counted%', 'vòng có chơi lại cú hỏng không được tính: ' || coalesce(e, 'null');
  e := pg_temp.err(format('select public.whs_sim_submit(%L, %L, %L, current_date, %L::int[], false, false, %L, %L)', v1, crs, '18', array_fill(5, array[17]), 'AAAA', 'image/jpeg'));
  assert e like '%gross_length%', 'thiếu hố: ' || coalesce(e, 'null');
  e := pg_temp.err(format('select public.whs_sim_submit(%L, %L, %L, current_date + 5, %L::int[], false, false, %L, %L)', v1, crs, '18', all5, 'AAAA', 'image/jpeg'));
  assert e like '%bad_date%', 'ngày tương lai: ' || coalesce(e, 'null');

  ----------------------------------------------------------------- 3 vòng đầu: chưa có chỉ số → tối đa par + 5
  g3 := all5; g3[1] := 12;                       -- hố 1 bị giới hạn 9 → AGS 94
  r := public.whs_sim_submit(v1, crs, '18', current_date - 10, all5, false, false, 'AAAA', 'image/jpeg', all5);
  e := pg_temp.err(format('select public.whs_sim_submit(%L, %L, %L, current_date - 10, %L::int[], false, false, %L, %L)', v1, crs, '18', all5, 'AAAA', 'image/jpeg'));
  assert e like '%duplicate_round%', 'chặn gửi trùng: ' || coalesce(e, 'null');
  e := pg_temp.err(format('select public.whs_sim_decide(%L, true)', r));
  assert e like '%forbidden%', 'golfer không tự xác nhận điểm của mình: ' || coalesce(e, 'null');

  perform pg_temp.act_as(ux);
  e := pg_temp.err(format('select public.whs_sim_decide(%L, true)', r));
  assert e like '%forbidden%', 'người ngoài không xác nhận được: ' || coalesce(e, 'null');
  select count(*) into n from public.whs_sim_rounds where member_id = mg;
  assert n = 0, 'người ngoài không thấy vòng của golfer';

  perform pg_temp.act_as(ura);
  select count(*) into n from public.whs_sim_queue() q where q.round_id = r and cardinality(q.par) = 18 and q.ai_scores = all5;
  assert n = 1, 'admin phòng thấy vòng chờ trong hàng chờ (kèm par và điểm AI đọc)';
  e := pg_temp.err(format('select public.whs_sim_decide(%L, false)', r));
  assert e like '%reason_required%', 'từ chối phải có lý do: ' || coalesce(e, 'null');
  perform public.whs_sim_decide(r, true);
  perform pg_temp.act_as(ug);   -- chỉ số chỉ golfer, phụ huynh, nhân sự liên đoàn xem được
  select * into x from public.whs_sim_index where member_id = mg and brand = v_brand;
  assert x.idx is null and x.n_scores = 1 and x.holes = 18 and x.need_holes = 9, 'sau 1 vòng: chưa có chỉ số, còn thiếu 9 hố';

  perform pg_temp.act_as(ug);
  r := public.whs_sim_submit(v1, crs, '18', current_date - 9, all5, false, false, 'AAAA', 'image/jpeg');
  r2 := public.whs_sim_submit(v1, crs, '18', current_date - 8, g3, false, false, 'AAAA', 'image/jpeg', all5);
  select flags into x from public.whs_sim_rounds where id = r2;
  assert 'edited_after_ai' = any(x.flags), 'đánh dấu vòng golfer sửa khác điểm AI đọc';
  perform pg_temp.act_as(ura);
  perform public.whs_sim_decide(r, true);
  perform public.whs_sim_decide(r2, true);
  perform pg_temp.act_as(ug);
  select ags, diff into x from public.whs_sim_results where round_id = r2;
  assert x.ags = 94 and x.diff = 22.0, 'chưa có chỉ số: hố 1 bị giới hạn par + 5; SD = 22.0, thực tế ' || x.ags || ' / ' || x.diff;
  select * into x from public.whs_sim_index where member_id = mg and brand = v_brand;
  assert x.idx = 16.0 and x.n_scores = 3, '3 vòng: điểm tốt nhất 18.0 − 2.0 = 16.0, thực tế ' || coalesce(x.idx::text, 'null');
  assert not x.official, 'hãng chưa có giấy phép → chỉ số nội bộ';

  ----------------------------------------------------------------- Có chỉ số → net double bogey
  perform pg_temp.act_as(ug);
  g4 := array_fill(4, array[18]); g4[17] := 9;   -- CH 16: hố SI 17 không được gậy → tối đa 6
  r := public.whs_sim_submit(v1, crs, '18', current_date - 7, g4, false, false, 'AAAA', 'image/jpeg');
  perform pg_temp.act_as(ura);
  perform public.whs_sim_decide(r, true);
  perform pg_temp.act_as(ug);
  select ags, diff, idx_before, idx_after, (notes ->> 'ch')::int as ch into x from public.whs_sim_results where round_id = r;
  assert x.ch = 16 and x.ags = 74 and x.diff = 2.0 and x.idx_before = 16.0 and x.idx_after = 1.0,
    'net double bogey: CH 16, AGS 74, SD 2.0, chỉ số 2.0 − 1.0 = 1.0; thực tế ' || x.ch || ' / ' || x.ags || ' / ' || x.diff || ' / ' || x.idx_after;

  ----------------------------------------------------------------- Vòng 9 hố quy đổi 18 hố
  perform pg_temp.act_as(ug);
  r := public.whs_sim_submit(v1, crs, 'F', current_date - 6, array_fill(5, array[9]), true, false, 'AAAA', 'image/jpeg');
  perform pg_temp.act_as(ura);
  perform public.whs_sim_decide(r, true);
  perform pg_temp.act_as(ug);
  select diff, (notes ->> 'expected9')::numeric as ex into x from public.whs_sim_results where round_id = r;
  assert x.ex = 1.7 and x.diff = 10.7, '9 hố: 9.0 + (0.52 × 1.0 + 1.2 = 1.7) = 10.7; thực tế ' || x.diff;
  select * into x from public.whs_sim_index where member_id = mg and brand = v_brand;
  assert x.idx = 2.0 and x.holes = 81, '5 vòng: điểm tốt nhất 2.0, không điều chỉnh; thực tế ' || coalesce(x.idx::text, 'null');
  select flags into x from public.whs_sim_rounds where id = r;
  assert 'gimme' = any(x.flags), 'vòng có gimme được đánh dấu';

  ----------------------------------------------------------------- Bạn nhỏ: phụ huynh gửi hộ, không tự xác nhận
  perform pg_temp.act_as(up);
  rk := public.whs_sim_submit(v1, crs, '18', current_date - 3, all5, false, false, 'AAAA', 'image/jpeg', null, mk);
  e := pg_temp.err(format('select public.whs_sim_decide(%L, true)', rk));
  assert e like '%forbidden%', 'phụ huynh không xác nhận điểm của con: ' || coalesce(e, 'null');
  e := pg_temp.err(format('select public.whs_sim_submit(%L, %L, %L, current_date, %L::int[], false, false, %L, %L, null, %L)', v1, crs, '18', all5, 'AAAA', 'image/jpeg', mg));
  assert e like '%not_your_member%', 'phụ huynh không gửi được cho golfer khác: ' || coalesce(e, 'null');
  perform pg_temp.act_as(ura);
  perform public.whs_sim_decide(rk, true);
  perform pg_temp.act_as(up);
  select count(*) into n from public.whs_sim_index where member_id = mk;
  assert n = 1, 'phụ huynh xem được chỉ số của con';
  select count(*) into n from public.whs_sim_index where member_id = mg;
  assert n = 0, 'phụ huynh không xem được chỉ số người khác';

  ----------------------------------------------------------------- Hàng chờ: phòng chưa có admin → nhân sự VN Centre duyệt thay
  perform pg_temp.act_as(ug);
  rq := public.whs_sim_submit(v2, crs, '18', current_date - 2, all5, false, false, 'AAAA', 'image/jpeg');
  r := public.whs_sim_submit(v1, crs, '18', current_date - 1, all5, false, false, 'AAAA', 'image/jpeg');
  perform public.whs_sim_withdraw(r);
  r := public.whs_sim_submit(v1, crs, '18', current_date, all5, false, false, 'AAAA', 'image/jpeg');
  perform pg_temp.act_as(ura);
  e := pg_temp.err(format('select public.whs_sim_decide(%L, true)', rq));
  assert e like '%forbidden%', 'admin phòng chỉ xác nhận trong phòng mình: ' || coalesce(e, 'null');
  perform pg_temp.act_as(ua);
  select count(*) into n from public.whs_sim_queue() q where q.round_id = rq;
  assert n = 1, 'VN Centre thấy vòng của phòng chưa có admin';
  select count(*) into n from public.whs_sim_queue() q where q.round_id = r;
  assert n = 0, 'VN Centre không thấy vòng mới của phòng đã có admin (chưa quá hạn)';
  perform pg_temp.act_as(null);
  update public.whs_sim_rounds set created_at = now() - interval '73 hours' where id = r;   -- giả lập quá hạn (quyền gốc)
  perform pg_temp.act_as(ua);
  select count(*) into n from public.whs_sim_queue() q where q.round_id = r and q.overdue;
  assert n = 1, 'quá 72 giờ → chuyển VN Centre';
  perform public.whs_sim_decide(rq, false, null, 'Ảnh không rõ ngày giờ');

  ----------------------------------------------------------------- Cờ chính thức, huỷ vòng, đổi rating
  perform public.whs_sim_set_brand_status(v_brand, true, current_date, current_date, true, null);
  select * into x from public.whs_sim_index where member_id = mg and brand = v_brand;
  assert x.official, 'hãng có giấy phép WHA và đã ký VGA → đánh dấu chính thức';

  select id into r from public.whs_sim_rounds where member_id = mg and holes = 'F';
  perform public.whs_sim_void(r, 'Kiểm tra lại phát hiện sai');
  select * into x from public.whs_sim_index where member_id = mg and brand = v_brand;
  assert x.idx = 1.0 and x.n_scores = 4, 'huỷ vòng 9 hố → tính lại còn 4 vòng, chỉ số 1.0; thực tế ' || coalesce(x.idx::text, 'null');

  perform public.whs_sim_save_course(crs, v_brand, 'Sân ảo Test', 'Trắng', par18, si18, 71.0, 113);
  select * into x from public.whs_sim_index where member_id = mg and brand = v_brand;
  assert x.idx = 2.0, 'đổi CR 72.0 → 71.0: mọi điểm vi sai tăng 1.0 → chỉ số 2.0; thực tế ' || coalesce(x.idx::text, 'null');
  e := pg_temp.err(format('select public.whs_sim_save_course(%L, %L, %L, %L, %L::int[], %L::int[], 71.0, 113)', crs, v_brand, 'Sân ảo Test', 'Trắng', array_fill(5, array[18]), si18));
  assert e like '%course_in_use%', 'sân đã có vòng thì không đổi par: ' || coalesce(e, 'null');

  ----------------------------------------------------------------- Nhật ký chỉ thêm; cổng tự động đang tắt
  perform pg_temp.act_as(null);
  select count(*) into n from public.whs_sim_round_log where round_id = rq;
  assert n = 2, 'nhật ký ghi gửi và từ chối';
  e := pg_temp.err(format('delete from public.whs_sim_round_log where round_id = %L', rq));
  assert e is not null, 'nhật ký không được xoá';
  e := pg_temp.err('select public.whs_sim_ingest(''{"federation":"zs-test"}''::jsonb)');
  assert e like '%api_not_enabled%', 'cổng tự động đang tắt: ' || coalesce(e, 'null');

  raise exception 'ALL_OK';
end $$;
