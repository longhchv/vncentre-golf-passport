-- Spec 24 · Giữ phong độ: lịch, đánh dấu đã làm, kiểm tra định kỳ, dấu hiệu quá sức, HLV duyệt giờ. Dữ liệu thử bị huỷ ở cuối.
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
  pa uuid := gen_random_uuid(); px uuid := gen_random_uuid(); co uuid := gen_random_uuid();
  s12 uuid; s16 uuid; g uuid; sc uuid; ay uuid; prog uuid; ctype uuid; cls uuid; r jsonb; n int; ok boolean; v numeric;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-tkf-' || x || '@example.test', now()
  from unnest(array[pa, px, co]) x;
  insert into public.profiles (user_id, full_name) select x, 'Test TKF' from unnest(array[pa, px, co]) x on conflict do nothing;
  insert into public.user_roles (user_id, role) values (co, 'coach');
  update public.app_settings set value = '"all"' where key = 'training.visibility';
  insert into public.students (full_name, date_of_birth) values ('Test TKF 12', (public.vn_today() - interval '12 years 2 months')::date) returning id into s12;
  insert into public.students (full_name, date_of_birth) values ('Test TKF 16', (public.vn_today() - interval '16 years 2 months')::date) returning id into s16;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH TKF', '+84900006101', pa) returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s12, g, 'mother', true, true, 'admin', 'active', now()), (s16, g, 'mother', true, true, 'admin', 'active', now());
  insert into public.schools (name, type) values ('TH Test TKF', 'public') returning id into sc;
  select id into ay from public.academic_years order by is_current desc limit 1;
  select id into prog from public.programs where code = 'core20';
  select id into ctype from public.class_types limit 1;
  insert into public.classes (name, school_id, academic_year_id, program_id, class_type_id) values ('Lớp TKF', sc, ay, prog, ctype) returning id into cls;
  insert into public.class_staff (class_id, user_id, role) values (cls, co, 'coach');
  insert into public.enrollments (student_id, class_id) values (s12, cls), (s16, cls);

  -- 1. Cấu hình mẫu: tỉ lệ cộng đủ 100, có 4 nhóm tuổi
  if (select sum(pct) from public.training_keep_split where is_active) <> 100 then raise exception 'FAIL tỉ lệ không đủ 100'; end if;
  if (select count(*) from public.training_age_limits) <> 4 then raise exception 'FAIL nhóm tuổi'; end if;

  -- 2. Phụ huynh lập kế hoạch, đánh dấu đã làm, bỏ đánh dấu
  perform pg_temp.act_as(pa);
  perform public.training_set_keep_plan(s12, 'weekend', array[6, 0, 6], 180, array['range', 'course']);
  select count(*) into n from public.training_keep_plans where student_id = s12 and days = '{0,6}' and minutes_per_day = 180;
  if n <> 1 then raise exception 'FAIL lưu kế hoạch'; end if;
  perform public.training_keep_mark(s12, public.vn_today(), 'd-putting-0', true, 45);
  perform public.training_keep_mark(s12, public.vn_today(), 'd-putting-0', true, 45);
  select count(*) into n from public.training_keep_done where student_id = s12;
  if n <> 1 then raise exception 'FAIL đánh dấu trùng'; end if;
  ok := false;
  begin perform public.training_keep_mark(s12, public.vn_today() + 1, 'x', true); exception when others then ok := sqlerrm = 'day_out_of_range'; end;
  if not ok then raise exception 'FAIL đánh dấu ngày tương lai'; end if;
  perform public.training_keep_mark(s12, public.vn_today(), 'd-putting-0', false);
  select count(*) into n from public.training_keep_done where student_id = s12;
  if n <> 0 then raise exception 'FAIL bỏ đánh dấu'; end if;

  -- 3. Kiểm tra định kỳ: lần đầu, tăng, tụt, giữ
  r := public.training_keep_record_check(s12, 2, 2, 2, 10);
  if r ->> 'result' <> 'first' then raise exception 'FAIL lần đầu: %', r; end if;
  r := public.training_keep_record_check(s12, 3, 3, 2, 8);
  if r ->> 'result' <> 'up' then raise exception 'FAIL tăng: %', r; end if;
  r := public.training_keep_record_check(s12, 2, 2, 2, 12);
  if r ->> 'result' <> 'down' then raise exception 'FAIL tụt: %', r; end if;
  r := public.training_keep_record_check(s12, 4, 2, 2, 16);
  if r ->> 'result' <> 'same' then raise exception 'FAIL giữ (một tăng một tụt): %', r; end if;

  -- 4. Dấu hiệu quá sức: lưu và báo HLV
  perform public.training_flag_overload(s12, array['tired', 'pain'], 'mệt sau buổi tập');
  perform pg_temp.act_as(null);
  select count(*) into n from public.notifications where user_id = co and title_vi = 'Dấu hiệu quá sức';
  if n <> 1 then raise exception 'FAIL không báo HLV'; end if;

  -- 5. Người ngoài không xem, không ghi được
  perform pg_temp.act_as(px);
  select count(*) into n from public.training_keep_checks where student_id = s12;
  if n <> 0 then raise exception 'FAIL người ngoài xem được kiểm tra'; end if;
  ok := false;
  begin perform public.training_keep_mark(s12, public.vn_today(), 'x', true); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người ngoài đánh dấu được'; end if;

  -- 6. HLV duyệt giờ: chỉ bạn từ 15 tuổi, không quá 20; phụ huynh không duyệt được
  perform pg_temp.act_as(pa);
  perform public.training_set_keep_plan(s16, 'daily', array[1, 2, 3, 4, 5], 120, array['range']);
  ok := false;
  begin perform public.training_keep_approve_hours(s16, 18); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh tự duyệt giờ'; end if;
  perform pg_temp.act_as(co);
  v := public.training_keep_approve_hours(s16, 18);
  if (select coach_week_hours from public.training_keep_plans where student_id = s16) <> 18 then raise exception 'FAIL HLV duyệt'; end if;
  ok := false;
  begin perform public.training_keep_approve_hours(s16, 25); exception when others then ok := sqlerrm = 'over_coach_max'; end;
  if not ok then raise exception 'FAIL duyệt quá 20 giờ'; end if;
  ok := false;
  begin perform public.training_keep_approve_hours(s12, 14); exception when others then ok := sqlerrm = 'not_allowed_for_age'; end;
  if not ok then raise exception 'FAIL duyệt cho bạn 12 tuổi'; end if;
  perform pg_temp.act_as(null);

  raise exception 'ALL_OK';
end $$;
