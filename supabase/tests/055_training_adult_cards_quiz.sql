-- Spec 25 · bước 2: thẻ người lớn, bài kiểm tra luật, admin thêm/bớt tuần và nhân bản chương trình. Dữ liệu thử bị huỷ ở cuối.
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
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  sa uuid; r jsonb; q jsonb; ans jsonb := '{}'; ok boolean; n int; prog uuid; clone uuid; w int; x record;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-adq-' || u || '@example.test', now()
  from unnest(array[adm, ua, ub]) u;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  update public.app_settings set value = '"all"' where key = 'training.visibility';

  -- 1. Người lớn tự tạo hồ sơ, làm thẻ của chương trình
  perform pg_temp.act_as(ua);
  r := public.training_create_self_profile('Test Người lớn', (public.vn_today() - interval '40 years')::date);
  sa := public.training_self_student();
  if sa is null then raise exception 'FAIL không có hồ sơ tự tạo'; end if;
  select count(*) into n from public.training_challenges where program_code = 'hcp54' and is_active;
  if n <> 6 then raise exception 'FAIL người lớn thấy % thẻ Có Handicap', n; end if;
  r := public.training_submit_result(sa, (select id from public.training_challenges where code = 'HCP54-CHIP'), array[8]);
  if r ->> 'status' <> 'passed' then raise exception 'FAIL thẻ tự xác nhận không đạt: %', r; end if;
  r := public.training_submit_result(sa, (select id from public.training_challenges where code = 'B100-TEE'), array[3]);
  if r ->> 'status' <> 'below' then raise exception 'FAIL chưa đạt mà không ghi below'; end if;

  -- 2. Bài kiểm tra luật: không lộ đáp án, chấm trên máy chủ
  q := public.training_quiz_questions('hcp54');
  if jsonb_array_length(q) <> 20 then raise exception 'FAIL số câu hỏi %', jsonb_array_length(q); end if;
  if q -> 0 ? 'correct_index' then raise exception 'FAIL lộ đáp án'; end if;
  select count(*) into n from public.training_quiz_questions;
  if n <> 0 then raise exception 'FAIL người dùng đọc thẳng được bảng câu hỏi'; end if;
  perform pg_temp.act_as(null);
  for x in select id, correct_index, sort_order from public.training_quiz_questions where program_code = 'hcp54' loop
    ans := ans || jsonb_build_object(x.id::text, case when x.sort_order <= 15 then x.correct_index else (x.correct_index + 1) % 4 end);
  end loop;
  perform pg_temp.act_as(ua);
  r := public.training_submit_quiz(sa, 'hcp54', ans);
  if (r ->> 'score')::int <> 15 or (r ->> 'passed')::boolean then raise exception 'FAIL 15/20 mà vẫn qua: %', r - 'detail'; end if;
  perform pg_temp.act_as(null);
  ans := '{}';
  for x in select id, correct_index, sort_order from public.training_quiz_questions where program_code = 'hcp54' loop
    ans := ans || jsonb_build_object(x.id::text, case when x.sort_order <= 16 then x.correct_index else (x.correct_index + 1) % 4 end);
  end loop;
  perform pg_temp.act_as(ua);
  r := public.training_submit_quiz(sa, 'hcp54', ans);
  if not (r ->> 'passed')::boolean then raise exception 'FAIL 16/20 mà không qua: %', r - 'detail'; end if;
  if jsonb_array_length(r -> 'detail') <> 20 then raise exception 'FAIL không trả giải thích'; end if;
  select count(*) into n from public.training_quiz_attempts where student_id = sa;
  if n <> 2 then raise exception 'FAIL không xem được bài đã làm của mình'; end if;

  -- 3. Người khác không làm hộ, không xem được
  perform pg_temp.act_as(ub);
  ok := false;
  begin perform public.training_submit_quiz(sa, 'hcp54', ans); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người khác nộp bài hộ được'; end if;
  select count(*) into n from public.training_quiz_attempts where student_id = sa;
  if n <> 0 then raise exception 'FAIL người khác xem được bài kiểm tra'; end if;
  -- Lỗi NULL cũ: người không liên quan gọi hàm đọc theo học viên phải bị chặn
  if public.training_can_view(sa) is distinct from false then raise exception 'FAIL training_can_view không trả false'; end if;
  ok := false;
  begin perform public.training_student_assignments(sa); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người ngoài đọc được bài về nhà của học viên khác'; end if;
  ok := false;
  begin perform public.training_admin_add_week((select id from public.training_programs where code = 'b100')); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL không phải admin mà thêm tuần được'; end if;

  -- 4. Admin: thêm tuần, bớt tuần, buổi riêng theo ngày, nhân bản
  perform pg_temp.act_as(adm);
  select id into prog from public.training_programs where code = 'b100';
  w := public.training_admin_add_week(prog);
  if w <> 13 or (select weeks from public.training_programs where id = prog) <> 13 then raise exception 'FAIL thêm tuần'; end if;
  select count(*) into n from public.training_program_blocks b join public.training_program_sessions s on s.id = b.session_id
  where s.program_id = prog and s.week_no = 13;
  if n <> 5 then raise exception 'FAIL tuần mới chép % phần', n; end if;
  perform public.training_admin_add_day_session(prog, 13, 2);
  ok := false;
  begin perform public.training_admin_add_day_session(prog, 13, 2); exception when others then ok := sqlerrm = 'day_exists'; end;
  if not ok then raise exception 'FAIL tạo trùng buổi riêng'; end if;
  perform public.training_admin_delete_session((select id from public.training_program_sessions where program_id = prog and week_no = 13 and day_no = 2));
  w := public.training_admin_remove_last_week(prog);
  if w <> 12 or exists (select 1 from public.training_program_sessions where program_id = prog and week_no = 13) then raise exception 'FAIL bớt tuần'; end if;
  clone := public.training_admin_clone_program(prog, 'b100-test', 'Break 100 thử');
  if (select count(*) from public.training_program_sessions where program_id = clone) <> 12 then raise exception 'FAIL nhân bản'; end if;
  if (select is_active from public.training_programs where id = clone) then raise exception 'FAIL bản sao bật sẵn'; end if;
  ok := false;
  begin perform public.training_admin_clone_program(prog, 'b100-test', 'x'); exception when others then ok := sqlerrm = 'code_taken'; end;
  if not ok then raise exception 'FAIL trùng mã chương trình'; end if;

  -- 5. Tuần đã có người tập thì không bớt được
  perform pg_temp.act_as(ua);
  perform public.training_start_goal(jsonb_build_object('hcp_target', 54, 'program_code', 'hcp54', 'days_of_week', jsonb_build_array(1, 3, 5)));
  perform pg_temp.act_as(null);
  insert into public.training_session_logs (student_id, goal_id, practiced_on, planned_minutes)
  select sa, g.id, public.vn_today(), 30 from public.training_goals g where g.student_id = sa and g.status = 'active';
  insert into public.training_session_items (log_id, block_id, sort_order, unit_from, unit_to, unit_total)
  select l.id, b.id, 0, 0, 1, 4 from public.training_session_logs l, public.training_program_blocks b
  join public.training_program_sessions s on s.id = b.session_id join public.training_programs p on p.id = s.program_id
  where l.student_id = sa and p.code = 'hcp54' and s.week_no = 8 limit 1;
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.training_admin_remove_last_week((select id from public.training_programs where code = 'hcp54'));
  exception when others then ok := sqlerrm = 'week_in_use'; end;
  if not ok then raise exception 'FAIL bớt được tuần đang có người tập'; end if;

  -- 6. Thẻ người lớn không lẫn vào thẻ level của các bạn nhỏ
  select count(*) into n from public.training_challenges where level_number is null and program_code is null;
  if n <> 0 then raise exception 'FAIL thẻ không có level lẫn chương trình'; end if;

  raise exception 'ALL_OK';
end $$;
