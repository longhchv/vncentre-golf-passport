-- Kiểm thử đợt A mục 5–7 (migration 20261128000002): Mã VNC của tôi, đổi mã chính, tìm số, khoá / mở, tặng số, bảng giá, nhật ký.
-- Quy ước: chạy trong một khối DO; thành công thì raise 'ALL_OK' để toàn bộ dữ liệu thử bị huỷ.

do $$
declare
  admin_u uuid := gen_random_uuid();
  parent_u uuid := gen_random_uuid();
  other_u uuid := gen_random_uuid();
  kid uuid; other_kid uuid; g uuid;
  kid_code text; gift text; locked text;
  j jsonb;
  ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (admin_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-w-admin@example.test', now()),
    (parent_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-w-parent@example.test', now()),
    (other_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-w-other@example.test', now());
  insert into public.user_roles (user_id, role) values (admin_u, 'admin');
  insert into public.students (full_name) values ('Test Wallet Kid') returning id, student_code into kid, kid_code;
  insert into public.students (full_name) values ('Test Wallet Other') returning id into other_kid;
  insert into public.guardians (user_id, full_name) values (parent_u, 'Test Wallet Parent') returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (kid, g, 'mother', true, true, 'admin', 'active', now());
  select code into gift from public.vnc_codes where status = 'available' and tier = 'vang' order by code limit 1;
  select code into locked from public.vnc_codes where status = 'available' and tier = 'bac' order by code limit 1;

  -- Admin: tìm, khoá, mở, tặng, đổi giá
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  execute 'set local role authenticated';
  j := public.vnc_search(gift);
  if j -> 0 ->> 'code' <> gift or j -> 0 ->> 'match' <> 'exact' then raise exception 'FAIL: tìm đúng số %', j -> 0; end if;
  if not exists (select 1 from jsonb_array_elements(j) x where x ->> 'match' = 'near') then raise exception 'FAIL: không có số gần giống'; end if;
  if exists (select 1 from jsonb_array_elements(public.vnc_search(null, 'kim_cuong')) x where x ->> 'tier' <> 'kim_cuong') then
    raise exception 'FAIL: lọc theo hạng';
  end if;
  perform public.vnc_admin_set_lock(locked, true, 'Giữ cho giải');
  if exists (select 1 from jsonb_array_elements(public.vnc_search(locked)) x where x ->> 'code' = locked) then raise exception 'FAIL: số khoá vẫn hiện khi tìm'; end if;
  ok := false;
  begin perform public.vnc_admin_set_lock(kid_code, true); exception when others then ok := sqlerrm = 'code_not_available'; end;
  if not ok then raise exception 'FAIL: khoá được số đã có chủ'; end if;
  perform public.vnc_admin_set_lock(locked, false);
  j := public.vnc_admin_gift(gift, kid_code, 'Học viên xuất sắc');
  if (j ->> 'student_id')::uuid <> kid then raise exception 'FAIL: tặng sai người %', j; end if;
  ok := false;
  begin perform public.vnc_admin_gift(gift, kid_code); exception when others then ok := sqlerrm = 'code_not_available'; end;
  if not ok then raise exception 'FAIL: tặng một số hai lần'; end if;
  perform public.vnc_admin_set_price('vang', 4000000, 12000000, current_date);
  if public.vnc_list_price('vang') <> 4000000 then raise exception 'FAIL: giá mới'; end if;
  if (select count(*) from jsonb_array_elements(public.vnc_admin_prices()) x where x ->> 'tier' = 'vang') < 1 then raise exception 'FAIL: bảng giá'; end if;
  if (select count(*) from jsonb_array_elements(public.vnc_admin_events()) x where x ->> 'action' in ('lock', 'unlock', 'gift', 'price')) < 4 then
    raise exception 'FAIL: nhật ký';
  end if;
  execute 'reset role';

  -- Phụ huynh: xem mã của con, đổi mã chính sang số được tặng; mã cũ thành mã phụ, tra mã cũ vẫn ra con
  perform set_config('request.jwt.claims', json_build_object('sub', parent_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', parent_u::text, true);
  execute 'set local role authenticated';
  if (public.vnc_my_people() -> 0 ->> 'student_id')::uuid <> kid then raise exception 'FAIL: danh sách hồ sơ'; end if;
  j := public.vnc_my_codes(kid);
  if jsonb_array_length(j) <> 2 or (j -> 0 ->> 'is_primary')::boolean is not true then raise exception 'FAIL: mã của con %', j; end if;
  if public.vnc_set_primary(kid, gift) <> 'VNC-' || gift then raise exception 'FAIL: đổi mã chính'; end if;
  ok := false;
  begin perform public.vnc_my_codes(other_kid); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: xem được mã của người khác'; end if;
  ok := false;
  begin perform public.vnc_set_primary(kid, locked); exception when others then ok := sqlerrm = 'code_not_owned'; end;
  if not ok then raise exception 'FAIL: đổi sang mã không thuộc mình'; end if;
  ok := false;
  begin perform public.vnc_admin_gift(locked, kid_code); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: phụ huynh tặng được số'; end if;
  execute 'reset role';
  if (select student_code from public.students where id = kid) <> 'VNC-' || gift
     or not exists (select 1 from public.vnc_codes where code = substr(kid_code, 5) and owner_id = kid and not is_primary and status = 'retired_alias')
     or public.vnc_student_id(kid_code) <> kid then
    raise exception 'FAIL: sau đổi mã chính';
  end if;

  raise exception 'ALL_OK';
end $$;
