-- Kiểm thử Bước 15: đồng ý lại khi đổi phiên bản (F18), đồng ý tuỳ chọn có lịch sử, yêu cầu xoá dữ liệu, bảng điều khiển.
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
  par uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  school uuid; s1 uuid; g1 uuid; g2 uuid; r jsonb; ok boolean; v_old jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s15-adm@example.test', now()),
    (par, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s15-par@example.test', now()),
    (viewer, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-s15-v@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  select id into school from public.schools order by created_at limit 1;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test Dong Y', '2016-01-01', school) returning id into s1;
  insert into public.guardians (user_id, full_name) values (par, 'PH') returning id into g1;
  insert into public.guardians (user_id, full_name) values (viewer, 'PH xem') returning id into g2;
  insert into public.student_guardians (student_id, guardian_id, is_primary, can_manage, status) values (s1, g1, true, true, 'active'), (s1, g2, false, false, 'active');
  select value into v_old from public.app_settings where key = 'legal.versions';
  insert into public.consents (guardian_id, type, version, granted) values
    (g1, 'terms', v_old ->> 'terms', true), (g1, 'privacy', v_old ->> 'privacy', true);

  ------------------------------------------------------------------ Đồng ý lại khi đổi phiên bản
  perform pg_temp.act_as(par);
  if (public.my_consent_status() ->> 'needs_reconsent')::boolean then raise exception 'FAIL: hỏi lại khi chưa đổi phiên bản'; end if;
  perform pg_temp.act_as(null);
  update public.app_settings set value = jsonb_set(value, '{terms}', '"v-test-2"') where key = 'legal.versions';
  perform pg_temp.act_as(par);
  if not (public.my_consent_status() ->> 'needs_reconsent')::boolean then raise exception 'FAIL: đổi phiên bản mà không hỏi lại'; end if;
  perform public.accept_legal();
  r := public.my_consent_status();
  if (r ->> 'needs_reconsent')::boolean or r -> 'accepted' ->> 'terms' <> 'v-test-2' then raise exception 'FAIL: đồng ý lại %', r; end if;

  ------------------------------------------------------------------ Đồng ý tuỳ chọn: lưu lịch sử, chỉ người có quyền quản lý
  perform public.set_consent(s1, 'leaderboard_name', true);
  perform public.set_consent(s1, 'leaderboard_name', false);
  r := public.my_consents();
  if (r -> 0 -> 'leaderboard_name' ->> 'granted')::boolean then raise exception 'FAIL: rút đồng ý không có hiệu lực'; end if;
  perform pg_temp.act_as(null);
  if (select count(*) from public.consents where guardian_id = g1 and student_id = s1 and type = 'leaderboard_name') <> 2 then raise exception 'FAIL: không giữ lịch sử đồng ý'; end if;
  perform pg_temp.act_as(viewer);
  ok := false;
  begin perform public.set_consent(s1, 'leaderboard_name', true); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người chỉ xem đổi được đồng ý'; end if;

  ------------------------------------------------------------------ Yêu cầu xoá dữ liệu → hàng chờ admin
  ok := false;
  begin perform public.request_data_deletion(s1, 'x'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người chỉ xem yêu cầu xoá được'; end if;
  perform pg_temp.act_as(par);
  perform public.request_data_deletion(s1, 'Chuyển trường');
  if not public.data_deletion_pending(s1) then raise exception 'FAIL: chưa ghi yêu cầu xoá'; end if;
  ok := false;
  begin perform public.request_data_deletion(s1, 'lần 2'); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: gửi trùng yêu cầu xoá'; end if;

  ------------------------------------------------------------------ Bảng điều khiển: chỉ admin
  ok := false;
  begin perform public.admin_dashboard(); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: phụ huynh xem được bảng điều khiển'; end if;
  perform pg_temp.act_as(adm);
  r := public.admin_dashboard();
  if (r -> 'queue' ->> 'support_requests')::int < 1 or (r ->> 'students')::int < 1 then raise exception 'FAIL dashboard: %', r; end if;
  if not (r -> 'review_queue' is null) then raise exception 'FAIL'; end if;

  raise exception 'ALL_OK';
end $$;
