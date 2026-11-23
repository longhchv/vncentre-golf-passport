-- Spec 24 · Tập luyện đợt 2: thẻ thử thách, tự nhập theo tuổi, xác nhận, đề xuất lên level (không tự cấp),
-- HLV chấm thẻ level 1–9, bài về nhà, phân quyền, gộp hồ sơ. Toàn bộ dữ liệu thử bị huỷ ở cuối.
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
  hc uuid := gen_random_uuid();   -- HLV trưởng
  co uuid := gen_random_uuid();   -- HLV lớp
  pa uuid := gen_random_uuid();   -- phụ huynh
  px uuid := gen_random_uuid();   -- phụ huynh khác
  ka uuid := gen_random_uuid();   -- tài khoản con 9 tuổi
  kb uuid := gen_random_uuid();   -- tài khoản con 12 tuổi
  s9 uuid; s12 uuid; sx uuid; g uuid; gx uuid; cls uuid; cls2 uuid; sc uuid; ay uuid; prog uuid; ctype uuid; lvl uuid;
  ch record; r jsonb; ok boolean; n int; asg uuid; res uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ts2-' || x || '@example.test', now()
  from unnest(array[hc, co, pa, px, ka, kb]) x;
  insert into public.profiles (user_id, full_name) select x, 'Test TS2' from unnest(array[hc, co, pa, px, ka, kb]) x on conflict do nothing;
  insert into public.user_roles (user_id, role) values (hc, 'head_coach'), (co, 'coach');
  update public.app_settings set value = '"all"' where key = 'training.visibility';

  insert into public.students (full_name, date_of_birth) values ('Test Bé 9', (public.vn_today() - interval '9 years 2 months')::date) returning id into s9;
  insert into public.students (full_name, date_of_birth) values ('Test Bạn 12', (public.vn_today() - interval '12 years 1 month')::date) returning id into s12;
  insert into public.students (full_name, date_of_birth) values ('Test Bạn khác', (public.vn_today() - interval '10 years')::date) returning id into sx;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH TS2', '+84900002001', pa) returning id into g;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH khác', '+84900002002', px) returning id into gx;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s9, g, 'mother', true, true, 'admin', 'active', now()), (s12, g, 'mother', true, true, 'admin', 'active', now()),
         (sx, gx, 'father', true, true, 'admin', 'active', now());
  insert into public.student_accounts (student_id, user_id, username) values (s9, ka, 'test.ts2.be9'), (s12, kb, 'test.ts2.ban12');

  -- Lớp của HLV có s9, s12 (không có sx)
  insert into public.schools (name, type) values ('TH Test TS2', 'public') returning id into sc;
  select id into ay from public.academic_years order by is_current desc limit 1;
  select id into prog from public.programs where code = 'core20';
  select id into ctype from public.class_types limit 1;
  insert into public.classes (name, school_id, academic_year_id, program_id, class_type_id) values ('Lớp TS2', sc, ay, prog, ctype) returning id into cls;
  insert into public.classes (name, school_id, academic_year_id, program_id, class_type_id) values ('Lớp TS2 khác', sc, ay, prog, ctype) returning id into cls2;
  insert into public.class_staff (class_id, user_id, role) values (cls, co, 'coach');
  insert into public.enrollments (student_id, class_id) values (s9, cls), (s12, cls), (sx, cls2);

  -- s12 đang học level 10
  select l.id into lvl from public.levels l where l.program_id = prog and l.number = 10;
  update public.students set current_level_id = lvl where id = s12;
  insert into public.level_records (student_id, level_id, status, completed_at, source, approval_status)
  select s12, l.id, 'completed', public.vn_today(), 'admin', 'approved' from public.levels l where l.program_id = prog and l.number = 9;

  -- 1. Tự nhập theo tuổi: con 9 tuổi không tự nhập được, con 12 tuổi được
  select * into ch from public.training_challenges where code = 'L10-TEE';
  perform pg_temp.act_as(ka);
  if public.training_can_enter(s9) then raise exception 'FAIL con 9 tuổi tự nhập được'; end if;
  if not public.training_can_view(s9) then raise exception 'FAIL con 9 tuổi không xem được của mình'; end if;
  ok := false;
  begin perform public.training_submit_result(s9, ch.id, array[1]); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL con 9 tuổi nộp được kết quả'; end if;
  perform pg_temp.act_as(kb);
  r := public.training_submit_result(s12, ch.id, array[1]);
  if r ->> 'status' <> 'pending' then raise exception 'FAIL con 12 tuổi nộp thẻ cần xác nhận mà không chờ: %', r; end if;
  res := (r ->> 'id')::uuid;
  ok := false;
  begin perform public.training_review_result(res, true); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL con tự xác nhận thẻ của mình'; end if;
  r := public.training_submit_result(s12, ch.id, array[0]);
  if r ->> 'status' <> 'below' then raise exception 'FAIL chưa đạt chỉ tiêu mà không ghi below: %', r; end if;

  -- 2. Người khác không xem, không nộp được
  perform pg_temp.act_as(px);
  select count(*) into n from public.training_challenge_results where student_id = s12;
  if n <> 0 then raise exception 'FAIL phụ huynh khác xem được kết quả'; end if;
  ok := false;
  begin perform public.training_submit_result(s12, ch.id, array[1], null, true); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh khác nộp được kết quả'; end if;

  -- 3. Phụ huynh xác nhận đã xem; HLV lớp duyệt lượt chờ
  perform pg_temp.act_as(pa);
  r := public.training_review_result(res, true);
  if r ->> 'status' <> 'approved' then raise exception 'FAIL phụ huynh không xác nhận được'; end if;
  ok := false;
  begin perform public.training_submit_result(s12, (select id from public.training_challenges where code = 'L5-FORMULA'), array[1]);
  exception when others then ok := sqlerrm = 'coach_only'; end;
  if not ok then raise exception 'FAIL phụ huynh nộp được thẻ chỉ HLV chấm'; end if;

  -- 4. Đạt đủ thẻ level 10 → đúng một đề xuất chờ duyệt, level chưa đổi
  for ch in select * from public.training_challenges where level_number = 10 and kind = 'level_up' and code <> 'L10-TEE' loop
    r := public.training_submit_result(s12, ch.id,
           array(select (p ->> 'target')::int from jsonb_array_elements(ch.parts) with ordinality x(p, i) order by i), null, true);
  end loop;
  if not (r -> 'level' ->> 'proposed')::boolean then raise exception 'FAIL đủ thẻ mà không đề xuất: %', r; end if;
  perform pg_temp.act_as(null);
  select count(*) into n from public.level_records lr join public.levels l on l.id = lr.level_id
  where lr.student_id = s12 and l.number = 10 and lr.approval_status = 'pending';
  if n <> 1 then raise exception 'FAIL số đề xuất level 10 = %', n; end if;
  if public.training_current_level(s12) <> 10 then raise exception 'FAIL hệ thống tự cấp level'; end if;
  perform pg_temp.act_as(pa);
  perform public.training_submit_result(s12, (select id from public.training_challenges where code = 'L10-BUN'), array[5], null, true);
  perform pg_temp.act_as(null);
  select count(*) into n from public.level_records lr join public.levels l on l.id = lr.level_id where lr.student_id = s12 and l.number = 10;
  if n <> 1 then raise exception 'FAIL tạo trùng đề xuất'; end if;
  update public.level_records set approval_status = 'approved', approved_at = now()
  where student_id = s12 and approval_status = 'pending';
  if public.training_current_level(s12) <> 11 then raise exception 'FAIL duyệt xong không lên level 11'; end if;

  -- 5. HLV chấm thẻ level 1 cho cả lớp; không chấm được học viên lớp khác
  perform pg_temp.act_as(co);
  n := public.training_coach_mark((select id from public.training_challenges where code = 'L1-FORMULA'), array[s9], true);
  if n <> 1 then raise exception 'FAIL HLV chấm thẻ level 1'; end if;
  n := public.training_coach_mark((select id from public.training_challenges where code = 'L1-CULTURE'), array[s9], true);
  perform pg_temp.act_as(null);
  select count(*) into n from public.level_records lr join public.levels l on l.id = lr.level_id
  where lr.student_id = s9 and l.number = 1 and lr.approval_status = 'pending';
  if n <> 1 then raise exception 'FAIL đủ 2 thẻ level 1 mà không đề xuất'; end if;
  perform pg_temp.act_as(co);
  ok := false;
  begin perform public.training_coach_mark((select id from public.training_challenges where code = 'L1-FORMULA'), array[sx], true);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL HLV chấm được học viên lớp khác'; end if;
  r := public.training_class_progress(cls);
  if jsonb_array_length(r) <> 2 then raise exception 'FAIL tiến độ lớp: %', r; end if;

  -- 6. Bài về nhà: HLV giao, phụ huynh đánh dấu, HLV xác nhận; phụ huynh lớp khác không thấy
  insert into public.training_assignments (class_id, title_vi, points, created_by) values (cls, 'Putt 30 bóng', 20, co) returning id into asg;
  perform pg_temp.act_as(pa);
  select count(*) into n from public.training_assignments where id = asg;
  if n <> 1 then raise exception 'FAIL phụ huynh không thấy bài giao'; end if;
  perform public.training_mark_assignment(asg, s9, true);
  perform pg_temp.act_as(px);
  select count(*) into n from public.training_assignments where id = asg;
  if n <> 0 then raise exception 'FAIL phụ huynh lớp khác thấy bài giao'; end if;
  ok := false;
  begin perform public.training_mark_assignment(asg, sx, true); exception when others then ok := sqlerrm = 'not_in_class'; end;
  if not ok then raise exception 'FAIL đánh dấu được cho học viên ngoài lớp'; end if;
  perform pg_temp.act_as(co);
  if public.training_confirm_marks(asg, array[s9, s12]) <> 1 then raise exception 'FAIL HLV xác nhận bài về nhà'; end if;
  perform public.training_mark_assignment(asg, s12, true);
  if (select confirmed_at from public.training_assignment_marks where assignment_id = asg and student_id = s12) is null then
    raise exception 'FAIL HLV đánh dấu tại lớp mà không tự xác nhận';
  end if;
  perform pg_temp.act_as(pa);
  perform public.training_mark_assignment(asg, s9, false);
  if not exists (select 1 from public.training_assignment_marks where assignment_id = asg and student_id = s9) then
    raise exception 'FAIL phụ huynh bỏ được dòng HLV đã xác nhận';
  end if;

  -- 7. Gộp hồ sơ: kết quả và bài về nhà đi theo, bỏ gộp trả về
  perform pg_temp.act_as(null);
  update public.students set merged_into_student_id = sx, deleted_at = now() where id = s12;
  if exists (select 1 from public.training_challenge_results where student_id = s12) then raise exception 'FAIL gộp không chuyển kết quả'; end if;
  update public.students set merged_into_student_id = null, deleted_at = null where id = s12;
  if exists (select 1 from public.training_challenge_results where student_id = sx) then raise exception 'FAIL bỏ gộp không trả kết quả'; end if;

  raise exception 'ALL_OK';
end $$;
