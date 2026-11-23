-- Spec 23 · bước 4: admin thêm/xoá/đổi chỗ phần giáo án (thứ tự liền mạch), tăng version, chặn người thường, tổng quan,
-- lưu buổi tập sau khi admin đổi số dòng của phần đang tập. Toàn bộ dữ liệu thử bị huỷ ở cuối.
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
  sess uuid; v0 int; v1 int; nb int; newb uuid; ok boolean; orders int[]; r jsonb; goal uuid; sa uuid; b record;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-tadm-' || x || '@example.test', now()
  from unnest(array[adm, ua]) x;
  insert into public.profiles (user_id, full_name) values (adm, 'Test Admin TL') on conflict do nothing;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  update public.app_settings set value = '"all"' where key = 'training.visibility';
  select s.id into sess from public.training_program_sessions s join public.training_programs p on p.id = s.program_id
  where p.code = 'b90' and s.week_no = 2 and s.day_no = 0;
  select count(*) into nb from public.training_program_blocks where session_id = sess;
  select version into v0 from public.training_programs where code = 'b90';

  -- Người thường không gọi được hàm admin
  perform pg_temp.act_as(ua);
  ok := false;
  begin perform public.training_admin_add_block(sess, 0); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người thường thêm được phần giáo án'; end if;
  ok := false;
  begin perform public.training_admin_overview(); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người thường xem được tổng quan'; end if;

  -- Thêm sau phần đầu, đổi chỗ, xoá: thứ tự luôn 0..n-1
  perform pg_temp.act_as(adm);
  newb := public.training_admin_add_block(sess, 0);
  if (select sort_order from public.training_program_blocks where id = newb) <> 1 then raise exception 'FAIL phần mới không ở vị trí 1'; end if;
  select array_agg(sort_order order by sort_order) into orders from public.training_program_blocks where session_id = sess;
  if orders <> (select array_agg(g) from generate_series(0, nb) g) then raise exception 'FAIL thứ tự sau khi thêm: %', orders; end if;
  perform public.training_admin_move_block(newb, -1);
  if (select sort_order from public.training_program_blocks where id = newb) <> 0 then raise exception 'FAIL đổi chỗ lên không được'; end if;
  perform public.training_admin_move_block(newb, -1);
  if (select sort_order from public.training_program_blocks where id = newb) <> 0 then raise exception 'FAIL đổi chỗ vượt đầu danh sách'; end if;
  update public.training_program_blocks set title_vi = 'Phần thử', est_minutes = 20 where id = newb;
  perform public.training_admin_delete_block(newb);
  select array_agg(sort_order order by sort_order) into orders from public.training_program_blocks where session_id = sess;
  if orders <> (select array_agg(g) from generate_series(0, nb - 1) g) then raise exception 'FAIL thứ tự sau khi xoá: %', orders; end if;
  select version into v1 from public.training_programs where code = 'b90';
  if v1 <= v0 then raise exception 'FAIL sửa giáo án không tăng version'; end if;
  if not exists (select 1 from public.audit_logs where entity_type = 'training_program_blocks' and entity_id = newb) then
    raise exception 'FAIL không ghi nhật ký khi sửa phần giáo án';
  end if;
  r := public.training_admin_overview();
  if r ? 'active_goals' is false then raise exception 'FAIL tổng quan thiếu số liệu'; end if;

  -- Người tập đang ở giữa phần (con trỏ 1/3); admin đổi số dòng làm tổng khối thành 8; lưu tiếp vẫn được
  perform pg_temp.act_as(ua);
  sa := (public.training_create_self_profile('Test Tập Admin', '1985-05-05') ->> 'student_id')::uuid;
  goal := public.training_start_goal(jsonb_build_object('hcp_target', 20, 'days_of_week', jsonb_build_array(1,3,5)));
  perform pg_temp.act_as(null);
  update public.training_goals set cursor_week = 2, cursor_day = 1, cursor_block = 0, cursor_fraction = 0.33333 where id = goal;
  select * into b from public.training_program_blocks where session_id = sess and sort_order = 0;
  perform pg_temp.act_as(ua);
  -- Sau khi admin sửa, tổng số khối là 8: con trỏ 0.33333 → khối gần nhất là 3 (3/8 = 0.375)
  r := public.training_save_session(goal, public.vn_today(), 20, jsonb_build_array(
    jsonb_build_object('block_id', b.id, 'unit_from', 3, 'unit_to', 8, 'unit_total', 8, 'completed', true)));
  if (r -> 'cursor' ->> 'block')::int <> 1 then raise exception 'FAIL không lưu tiếp được sau khi admin đổi giáo án: %', r; end if;
  -- Lệch quá nửa khối vẫn bị chặn
  perform pg_temp.act_as(null);
  update public.training_goals set cursor_block = 0, cursor_fraction = 0.33333 where id = goal;
  perform pg_temp.act_as(ua);
  ok := false;
  begin
    perform public.training_save_session(goal, public.vn_today(), 20, jsonb_build_array(
      jsonb_build_object('block_id', b.id, 'unit_from', 6, 'unit_to', 8, 'unit_total', 8, 'completed', true)));
  exception when others then ok := sqlerrm = 'out_of_order';
  end;
  if not ok then raise exception 'FAIL lưu được phần lệch xa con trỏ'; end if;

  -- Phần đã có người tập thì không xoá được
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.training_admin_delete_block(b.id); exception when others then ok := sqlerrm = 'block_in_use'; end;
  if not ok then raise exception 'FAIL xoá được phần đã có người tập'; end if;

  raise exception 'ALL_OK';
end $$;
