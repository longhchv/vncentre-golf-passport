-- Spec 23 · Tập luyện đợt 1: bật/tắt dùng thử, tự tạo hồ sơ golfer (cách B), mục tiêu, lưu buổi tập và con trỏ,
-- phân quyền, chuẩn thống kê, nhắc tập, gộp hồ sơ. Toàn bộ dữ liệu thử bị huỷ ở cuối.
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
  ua uuid := gen_random_uuid();   -- người lớn dùng thử
  ub uuid := gen_random_uuid();   -- người lớn khác
  uk uuid := gen_random_uuid();   -- người dưới 18 tuổi
  r jsonb; sa uuid; sb uuid; old_s uuid; goal uuid; goal2 uuid; ok boolean; n int; v numeric; prog text;
  b1 record; b2 record; nb int; g record; dob date := public.vn_today() - interval '35 years';
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-train-' || x || '@example.test', now()
  from unnest(array[adm, ua, ub, uk]) x;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  -- Hồ sơ có sẵn trùng tên + ngày sinh với người A (ví dụ từ sự kiện)
  insert into public.students (full_name, date_of_birth, verification_status) values ('Test Golfer Tập', dob, 'verified') returning id into old_s;
  update public.app_settings set value = '"beta"' where key = 'training.visibility';
  update public.app_settings set value = jsonb_build_array(ua::text, ub::text, uk::text) where key = 'training.beta_user_ids';

  -- 1. Bật/tắt
  perform pg_temp.act_as(gen_random_uuid());
  if public.training_enabled() then raise exception 'FAIL người ngoài danh sách thử vẫn thấy Tập luyện'; end if;
  perform pg_temp.act_as(ua);
  if not public.training_enabled() then raise exception 'FAIL người trong danh sách thử không thấy Tập luyện'; end if;
  if public.training_self_student() is not null then raise exception 'FAIL chưa tạo hồ sơ mà đã có hồ sơ self'; end if;

  -- 2. Tự tạo hồ sơ golfer
  ok := false;
  begin perform public.training_create_self_profile('Test Trẻ', (public.vn_today() - interval '15 years')::date); exception when others then ok := sqlerrm = 'under_min_age'; end;
  if not ok then raise exception 'FAIL dưới 18 tuổi vẫn tạo được hồ sơ người lớn'; end if;
  r := public.training_create_self_profile('Test Golfer Tập', dob, 'male');
  sa := (r ->> 'student_id')::uuid;
  if not (r ->> 'created')::boolean or (r ->> 'match_count')::int <> 1 then raise exception 'FAIL tạo hồ sơ: %', r; end if;
  if sa = old_s then raise exception 'FAIL tự nối vào hồ sơ có sẵn của người khác'; end if;
  if public.training_self_student() <> sa then raise exception 'FAIL không nhận ra hồ sơ self vừa tạo'; end if;
  r := public.training_create_self_profile('Tên khác', dob);
  if (r ->> 'created')::boolean or (r ->> 'student_id')::uuid <> sa then raise exception 'FAIL tạo hồ sơ lần hai sinh hồ sơ mới'; end if;
  perform pg_temp.act_as(null);
  if (select verification_status from public.students where id = sa) <> 'pending_review' then raise exception 'FAIL hồ sơ tự khai không ở trạng thái chờ xác minh'; end if;
  if (select self_reported ->> 'source' from public.students where id = sa) <> 'training' then raise exception 'FAIL thiếu nguồn training trong self_reported'; end if;

  -- 3. Mục tiêu: tự chọn chương trình theo handicap mục tiêu
  perform pg_temp.act_as(ua);
  goal := public.training_start_goal(jsonb_build_object('hcp_start', 24, 'hcp_target', 12, 'months', 6, 'schedule_mode', 'fixed_12_weeks',
                                     'days_of_week', jsonb_build_array(1,2,3,4,5,6)));
  select p.code into prog from public.training_goals tg join public.training_programs p on p.id = tg.program_id where tg.id = goal;
  if prog <> 'b80' then raise exception 'FAIL mục tiêu 12 phải ra Break 80, ra %', prog; end if;
  goal2 := public.training_start_goal(jsonb_build_object('hcp_target', 20, 'days_of_week', jsonb_build_array(2,4,6), 'session_minutes', 30));
  select p.code into prog from public.training_goals tg join public.training_programs p on p.id = tg.program_id where tg.id = goal2;
  if prog <> 'b90' then raise exception 'FAIL mục tiêu 20 phải ra Break 90, ra %', prog; end if;
  if (select status from public.training_goals where id = goal) <> 'replaced' then raise exception 'FAIL mục tiêu cũ không chuyển replaced'; end if;
  goal := goal2;

  -- Sửa lịch được, sửa con trỏ thì không
  update public.training_goals set days_of_week = '{1,3,5}', session_minutes = 45 where id = goal;
  ok := false;
  begin update public.training_goals set cursor_week = 12 where id = goal; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người tập sửa thẳng được con trỏ giáo án'; end if;

  -- 4. Lưu buổi tập: phần đầu tuần 1 làm một nửa, rồi làm nốt
  select b.* into b1 from public.training_program_blocks b
  where b.session_id = public.training_session_for((select program_id from public.training_goals where id = goal), 1, 1) and b.sort_order = 0;
  select b.* into b2 from public.training_program_blocks b where b.session_id = b1.session_id and b.sort_order = 1;
  r := public.training_save_session(goal, public.vn_today(), 30, jsonb_build_array(
         jsonb_build_object('block_id', b1.id, 'unit_from', 0, 'unit_to', 4, 'unit_total', 8, 'completed', true, 'result_text', '12/20'),
         jsonb_build_object('block_id', b2.id, 'unit_from', 0, 'unit_to', 2, 'unit_total', 6, 'completed', false)));
  if (r -> 'cursor' ->> 'block')::int <> 0 or (r -> 'cursor' ->> 'fraction')::numeric <> 0.5 then raise exception 'FAIL con trỏ sau nửa phần: %', r; end if;
  if (r ->> 'done_minutes')::numeric <> round(b1.est_minutes / 2.0, 1) then raise exception 'FAIL số phút đã tập: %', r; end if;
  if (select result_made from public.training_session_items i join public.training_session_logs l on l.id = i.log_id
      where l.id = (r ->> 'log_id')::uuid and i.sort_order = 0) <> 12 then raise exception 'FAIL không tách được kết quả 12/20'; end if;
  ok := false;
  begin
    perform public.training_save_session(goal, public.vn_today(), 30, jsonb_build_array(
      jsonb_build_object('block_id', b2.id, 'unit_from', 0, 'unit_to', 6, 'unit_total', 6, 'completed', true)));
  exception when others then ok := sqlerrm = 'out_of_order';
  end;
  if not ok then raise exception 'FAIL lưu được phần không đúng thứ tự giáo án'; end if;
  r := public.training_save_session(goal, public.vn_today(), 30, jsonb_build_array(
         jsonb_build_object('block_id', b1.id, 'unit_from', 4, 'unit_to', 8, 'unit_total', 8, 'completed', true)));
  if (r -> 'cursor' ->> 'block')::int <> 1 or (r -> 'cursor' ->> 'fraction')::numeric <> 0 then raise exception 'FAIL con trỏ sau khi xong phần: %', r; end if;

  -- 5. Người khác không thấy dữ liệu tập của A
  perform pg_temp.act_as(ub);
  select count(*) into n from public.training_goals where student_id = sa;
  if n <> 0 then raise exception 'FAIL người khác đọc được mục tiêu của A'; end if;
  select count(*) into n from public.training_session_logs where student_id = sa;
  if n <> 0 then raise exception 'FAIL người khác đọc được buổi tập của A'; end if;
  ok := false;
  begin perform public.training_save_session(goal, public.vn_today(), 30, '[{}]'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người khác lưu được buổi tập vào mục tiêu của A'; end if;
  select count(*) into n from public.training_program_blocks b join public.training_program_sessions s on s.id = b.session_id
    join public.training_programs p on p.id = s.program_id where p.code in ('b90', 'b80', 'b70');
  if n <> 194 then raise exception 'FAIL người dùng thử đọc giáo án ra % phần (mong đợi 194)', n; end if;

  -- 6. Vòng đấu và khoảng cách gậy
  perform pg_temp.act_as(ua);
  insert into public.club_distances (student_id, club_code, carry_yards) values (sa, '7i', 140);
  perform pg_temp.act_as(ub);
  ok := false;
  begin insert into public.club_distances (student_id, club_code, carry_yards) values (sa, '8i', 130); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người khác ghi được khoảng cách gậy của A'; end if;

  -- 7. Chuẩn thống kê
  perform pg_temp.act_as(ua);
  if public.training_benchmark('fir_pct', 12) <> 51 then raise exception 'FAIL chuẩn FIR HCP 12'; end if;
  if public.training_benchmark('putts_per_18', 15) <> 37.5 then raise exception 'FAIL chuẩn putt HCP 15: %', public.training_benchmark('putts_per_18', 15); end if;
  if public.training_benchmark('scramble_pct', 5) <> 50 then raise exception 'FAIL chuẩn up & down HCP 5'; end if;

  -- 8. Hết giáo án → mục tiêu hoàn thành
  perform pg_temp.act_as(null);
  select count(*) into nb from public.training_program_blocks
  where session_id = public.training_session_for((select program_id from public.training_goals where id = goal), 12, 3);
  update public.training_goals set cursor_week = 12, cursor_day = 3, cursor_block = nb - 1, cursor_fraction = 0 where id = goal;
  select b.* into b1 from public.training_program_blocks b
  where b.session_id = public.training_session_for((select program_id from public.training_goals where id = goal), 12, 3) and b.sort_order = nb - 1;
  perform pg_temp.act_as(ua);
  r := public.training_save_session(goal, public.vn_today(), 30, jsonb_build_array(
         jsonb_build_object('block_id', b1.id, 'unit_from', 0, 'unit_to', 3, 'unit_total', 3, 'completed', true)));
  if not (r ->> 'program_completed')::boolean then raise exception 'FAIL hết giáo án mà chưa báo hoàn thành: %', r; end if;
  if (select status from public.training_goals where id = goal) <> 'completed' then raise exception 'FAIL mục tiêu không chuyển completed'; end if;

  -- 9. Nhắc tập: mỗi ngày tối đa một thông báo
  goal := public.training_start_goal(jsonb_build_object('hcp_target', 20, 'days_of_week', jsonb_build_array(0,1,2,3,4,5,6)));
  perform pg_temp.act_as(null);
  update public.training_goals set start_date = public.vn_today() - 10 where id = goal;
  perform public.training_send_reminders();
  perform public.training_send_reminders();
  select count(*) into n from public.notifications where user_id = ua and type like 'training_%';
  if n <> 1 then raise exception 'FAIL nhắc tập gửi % thông báo trong một ngày', n; end if;
  if not exists (select 1 from public.notifications where user_id = ua and type = 'training_missed_7d') then
    raise exception 'FAIL 10 ngày không tập mà không nhắc mức 7 ngày';
  end if;

  -- 10. Gộp hồ sơ: dữ liệu tập đi theo hồ sơ giữ lại, bỏ gộp thì trả về
  update public.students set merged_into_student_id = old_s, deleted_at = now() where id = sa;
  select count(*) into n from public.training_session_logs where student_id = old_s;
  if n = 0 then raise exception 'FAIL gộp hồ sơ không chuyển buổi tập'; end if;
  if exists (select 1 from public.training_goals where student_id = sa) then raise exception 'FAIL còn mục tiêu ở hồ sơ đã gộp'; end if;
  update public.students set merged_into_student_id = null, deleted_at = null where id = sa;
  if exists (select 1 from public.training_session_logs where student_id = old_s) then raise exception 'FAIL bỏ gộp không trả buổi tập về'; end if;

  -- 11. Tắt hẳn: không ai ngoài admin thấy
  update public.app_settings set value = '"off"' where key = 'training.visibility';
  perform pg_temp.act_as(ua);
  if public.training_enabled() then raise exception 'FAIL tắt mà người thử vẫn thấy Tập luyện'; end if;
  perform pg_temp.act_as(adm);
  if not public.training_enabled() then raise exception 'FAIL admin không thấy Tập luyện khi tắt'; end if;

  raise exception 'ALL_OK';
end $$;
