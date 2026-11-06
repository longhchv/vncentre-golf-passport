-- Spec 17 · Bước 1 + 2: Hồ sơ của tôi (con của tôi, cờ Kinh doanh), staff_history từ app giải (tiêu chí 4–7 ở tầng SQL).
-- Dùng chặng 98 (không có trong dữ liệu thật); toàn bộ bị huỷ ở cuối.
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
  ua uuid := gen_random_uuid();   -- BTC đã có tài khoản
  ub uuid := gen_random_uuid();   -- BTC kích hoạt tài khoản sau
  par uuid := gen_random_uuid();  -- phụ huynh, chưa từng làm việc
  ls uuid := gen_random_uuid();   -- BTC giải (league_staff)
  sa uuid; sb uuid; kid uuid; ga uuid; gb uuid; gp uuid;
  ca text; cb text; t uuid; r jsonb; e jsonb; ok boolean; n int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-adult-' || x || '@example.test', now()
  from unnest(array[adm, ua, ub, par, ls]) x;
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (ls, 'league_staff');

  insert into public.students (full_name, birth_year, verification_status) values ('Test BTC A', 1990, 'verified') returning id into sa;
  insert into public.students (full_name, birth_year, verification_status) values ('Test BTC B', 1992, 'verified') returning id into sb;
  insert into public.students (full_name, birth_year) values ('Test Con PH', 2016) returning id into kid;
  select student_code into ca from public.students where id = sa;
  select student_code into cb from public.students where id = sb;
  insert into public.guardians (full_name, phone, user_id) values ('Test BTC A', '+84900001001', ua) returning id into ga;
  insert into public.guardians (full_name, phone) values ('Test BTC B', '+84900001002') returning id into gb;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH', '+84900001003', par) returning id into gp;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (sa, ga, 'self', true, true, 'admin', 'active', now()),
         (sb, gb, 'self', true, true, 'admin', 'active', now()),
         (kid, gp, 'mother', true, true, 'league', 'active', now());

  perform public.league_save_stage(98, '2026-12-20', 'Sân thử', 3, '[]'::jsonb, 'league_app', false);
  select id into t from public.tournaments where series_id = public.league_series_id() and stage_no = 98;
  if t is null then raise exception 'FAIL không tạo được chặng thử'; end if;

  ------------------------------------------------------------------ staff_history
  r := public.league_staff_history(jsonb_build_object('action', 'staff_history', 'event', jsonb_build_object('no', 98, 'date', '2026-12-20'),
    'rows', jsonb_build_array(
      jsonb_build_object('student_code', ca, 'role', 'Hội trường & sân tập', 'tasks_done', 14, 'tasks_total', 15, 'hours', 6),
      jsonb_build_object('student_code', cb, 'role', 'Đón khách', 'tasks_done', 8, 'tasks_total', 8, 'hours', 4),
      jsonb_build_object('student_code', 'VNC-999999', 'role', 'Không rõ'))));
  if not (r ->> 'ok' = 'true' and (r ->> 'saved')::int = 2 and (r ->> 'waiting')::int = 1 and (r ->> 'unmatched')::int = 1) then
    raise exception 'FAIL kết quả staff_history: %', r;
  end if;
  if (select count(*) from public.staff_engagements where tournament_id = t and deleted_at is null) <> 1
     or not exists (select 1 from public.staff_engagements where tournament_id = t and user_id = ua and kind = 'tournament'
                    and source = 'league_app' and status = 'pending_review' and tasks_done = 14 and tasks_total = 15 and hours = 6
                    and position_vi = 'Hội trường & sân tập' and project_name_vi = 'SNAG Golf League · Chặng 98') then
    raise exception 'FAIL dòng chặng của A';
  end if;
  if (select count(*) from public.staff_history_pending where tournament_id = t and student_id = sb and attached_at is null) <> 1 then
    raise exception 'FAIL B chưa có tài khoản phải lưu chờ';
  end if;
  if not exists (select 1 from public.audit_logs where action = 'league.staff_history' and entity_id = t) then
    raise exception 'FAIL thiếu nhật ký staff_history';
  end if;

  -- Tiêu chí 4: hiện "Chờ duyệt"; admin xác nhận → "Đã xác thực", có trong CV
  perform pg_temp.act_as(ua);
  e := (select x from jsonb_array_elements(public.staff_my_profile() -> 'engagements') x where x ->> 'tournament_id' = t::text);
  if e ->> 'badge' <> 'pending' or (e ->> 'tasks_done')::int <> 14 then raise exception 'FAIL A thấy dòng chờ duyệt: %', e; end if;
  perform pg_temp.act_as(adm);
  if not exists (select 1 from jsonb_array_elements(public.staff_review_queue() -> 'engagements') x
                 where x ->> 'source' = 'league_app' and x ->> 'user_id' = ua::text) then
    raise exception 'FAIL hàng chờ admin thiếu dòng app giải';
  end if;
  perform public.staff_review('engagement', (e ->> 'id')::uuid, true, null);
  perform pg_temp.act_as(ua);
  e := (select x from jsonb_array_elements(public.staff_my_profile() -> 'engagements') x where x ->> 'tournament_id' = t::text);
  if e ->> 'badge' <> 'verified' then raise exception 'FAIL sau xác nhận phải Đã xác thực: %', e; end if;
  if not exists (select 1 from jsonb_array_elements(public.staff_cv_items(ua) -> 'engagements') x
                 where x ->> 'id' = e ->> 'id' and x ->> 'badge' = 'verified') then
    raise exception 'FAIL dòng đã xác thực không có trong CV';
  end if;

  -- Gửi lại giống hệt → không nhân đôi, giữ Đã xác thực; gửi lại có đổi → một dòng, về Chờ duyệt
  perform pg_temp.act_as(null);
  perform public.league_staff_history(jsonb_build_object('event', jsonb_build_object('no', 98, 'date', '2026-12-20'),
    'rows', jsonb_build_array(jsonb_build_object('student_code', ca, 'role', 'Hội trường & sân tập', 'tasks_done', 14, 'tasks_total', 15, 'hours', 6),
                              jsonb_build_object('student_code', cb, 'role', 'Đón khách', 'tasks_done', 8, 'tasks_total', 8, 'hours', 4))));
  if (select count(*) from public.staff_engagements where tournament_id = t and user_id = ua and deleted_at is null) <> 1
     or (select status from public.staff_engagements where tournament_id = t and user_id = ua and deleted_at is null) <> 'approved'
     or (select count(*) from public.staff_history_pending where tournament_id = t) <> 1 then
    raise exception 'FAIL gửi lại giống hệt';
  end if;
  perform public.league_staff_history(jsonb_build_object('event', jsonb_build_object('no', 98, 'date', '2026-12-20'),
    'rows', jsonb_build_array(jsonb_build_object('student_code', ca, 'role', 'Hội trường & sân tập', 'tasks_done', 15, 'tasks_total', 15, 'hours', 6),
                              jsonb_build_object('student_code', cb, 'role', 'Đón khách', 'tasks_done', 8, 'tasks_total', 8, 'hours', 4))));
  if (select count(*) from public.staff_engagements where tournament_id = t and user_id = ua and deleted_at is null) <> 1
     or (select status from public.staff_engagements where tournament_id = t and user_id = ua and deleted_at is null) <> 'pending_review' then
    raise exception 'FAIL gửi lại có đổi phải thay dòng cũ, về chờ duyệt';
  end if;

  -- Sai dữ liệu
  ok := false;
  begin perform public.league_staff_history('{"event":{"no":97,"date":"2026-12-21"},"rows":[]}'); exception when no_data_found then ok := true; end;
  if not ok then raise exception 'FAIL chặng không có phải báo tournament_not_found'; end if;
  ok := false;
  begin
    perform public.league_staff_history(jsonb_build_object('event', jsonb_build_object('no', 98, 'date', '2026-12-20'),
      'rows', jsonb_build_array(jsonb_build_object('student_code', ca, 'tasks_done', 9, 'tasks_total', 5))));
  exception when invalid_parameter_value then ok := true;
  end;
  if not ok then raise exception 'FAIL nhận số việc xong lớn hơn tổng'; end if;

  -- Tiêu chí 5: B kích hoạt tài khoản → thấy đúng dòng của mình
  update public.guardians set user_id = ub where id = gb;
  if not exists (select 1 from public.staff_engagements where tournament_id = t and user_id = ub and source = 'league_app'
                 and position_vi = 'Đón khách' and tasks_done = 8 and deleted_at is null)
     or exists (select 1 from public.staff_history_pending where tournament_id = t and student_id = sb and attached_at is null) then
    raise exception 'FAIL B kích hoạt tài khoản không nhận dòng chờ';
  end if;
  perform pg_temp.act_as(ub);
  if not exists (select 1 from jsonb_array_elements(public.staff_my_profile() -> 'engagements') x where x ->> 'tournament_id' = t::text) then
    raise exception 'FAIL B không thấy dòng của mình';
  end if;

  -- Người không còn trong lần gửi → bỏ dòng cũ của chặng
  perform pg_temp.act_as(null);
  perform public.league_staff_history(jsonb_build_object('event', jsonb_build_object('no', 98, 'date', '2026-12-20'),
    'rows', jsonb_build_array(jsonb_build_object('student_code', ca, 'role', 'Hội trường & sân tập', 'tasks_done', 15, 'tasks_total', 15, 'hours', 6))));
  if exists (select 1 from public.staff_engagements where tournament_id = t and user_id = ub and deleted_at is null) then
    raise exception 'FAIL dòng của người bị bỏ ra vẫn còn';
  end if;

  ------------------------------------------------------------------ Bước 1: phụ huynh, cờ Kinh doanh, quyền
  perform pg_temp.act_as(par);
  r := public.staff_my_profile();
  if jsonb_array_length(r -> 'children') <> 1 or r #>> '{children,0,id}' <> kid::text or r ->> 'business_enabled' <> 'false'
     or jsonb_array_length(r -> 'engagements') <> 0 or r #>> '{profile,cv_type}' is not null then
    raise exception 'FAIL Hồ sơ của tôi của phụ huynh: %', r;
  end if;
  perform pg_temp.act_as(ua);
  if jsonb_array_length(public.staff_my_profile() -> 'children') <> 0 then raise exception 'FAIL hồ sơ tự chơi không phải "con của tôi"'; end if;

  -- Tiêu chí 6: league_staff không mở được hồ sơ người lớn khác; không gọi được staff_history
  perform pg_temp.act_as(ls);
  ok := false;
  begin perform public.staff_my_profile(ua); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL league_staff mở được hồ sơ người lớn khác'; end if;
  ok := false;
  begin perform public.league_staff_history('{}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người đăng nhập gọi thẳng được league_staff_history'; end if;

  raise exception 'ALL_OK';
end $$;
