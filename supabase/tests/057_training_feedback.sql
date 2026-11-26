-- Spec 25 · góp ý trong Tập luyện: gửi, xem của mình, admin xem và đổi trạng thái, chặn gửi dồn. Dữ liệu thử bị huỷ ở cuối.
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
  adm uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  f uuid; n int; ok boolean; r jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-fb-' || u || '@example.test', now()
  from unnest(array[adm, ua, ub]) u;
  insert into public.user_roles (user_id, role) values (adm, 'admin');

  perform pg_temp.act_as(ua);
  f := public.training_send_feedback('/app/training', 'bug', 'Nút lưu không bấm được trên iPhone', null, 'test');
  ok := false;
  begin perform public.training_send_feedback('/app/training', 'bug', ' a '); exception when others then ok := sqlerrm = 'feedback_too_short'; end;
  if not ok then raise exception 'FAIL góp ý quá ngắn vẫn gửi được'; end if;
  ok := false;
  begin insert into public.training_feedback (message) values ('gửi thẳng vào bảng'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL gửi thẳng vào bảng được'; end if;
  select count(*) into n from public.training_feedback;
  if n <> 1 then raise exception 'FAIL người gửi thấy % góp ý', n; end if;

  perform pg_temp.act_as(ub);
  select count(*) into n from public.training_feedback;
  if n <> 0 then raise exception 'FAIL người khác thấy góp ý'; end if;
  update public.training_feedback set status = 'done' where id = f;
  ok := false;
  begin perform public.training_feedback_admin_list(); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người thường xem danh sách admin'; end if;
  for n in 1..20 loop perform public.training_send_feedback('/x', 'idea', 'Ý kiến số ' || n); end loop;
  ok := false;
  begin perform public.training_send_feedback('/x', 'idea', 'Ý kiến thứ 21'); exception when others then ok := sqlerrm = 'feedback_rate_limited'; end;
  if not ok then raise exception 'FAIL không chặn gửi dồn'; end if;

  perform pg_temp.act_as(adm);
  r := public.training_feedback_admin_list('new');
  if jsonb_array_length(r) < 21 then raise exception 'FAIL admin không thấy đủ góp ý'; end if;
  if (select status from public.training_feedback where id = f) <> 'new' then raise exception 'FAIL người khác đổi được trạng thái'; end if;
  update public.training_feedback set status = 'in_progress', admin_note = 'Đang sửa' where id = f;
  if (select status from public.training_feedback where id = f) <> 'in_progress' then raise exception 'FAIL admin không đổi được trạng thái'; end if;

  raise exception 'ALL_OK';
end $$;
