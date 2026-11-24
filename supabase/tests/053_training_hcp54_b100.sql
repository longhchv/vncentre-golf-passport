-- Spec 25 · Có Handicap và Break 100: đủ dữ liệu, chọn đúng chương trình theo mục tiêu. Toàn bộ dữ liệu thử bị huỷ ở cuối.
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
  ua uuid := gen_random_uuid();
  n int; g uuid; code text;
begin
  -- 1. Dữ liệu giáo án
  select count(*) into n from public.training_program_sessions s join public.training_programs p on p.id = s.program_id where p.code = 'hcp54';
  if n <> 8 then raise exception 'FAIL Có Handicap có % buổi', n; end if;
  select count(*) into n from public.training_program_sessions s join public.training_programs p on p.id = s.program_id where p.code = 'b100';
  if n <> 12 then raise exception 'FAIL Break 100 có % buổi', n; end if;
  select count(*) into n from public.training_program_blocks b join public.training_program_sessions s on s.id = b.session_id
    join public.training_programs p on p.id = s.program_id where p.code in ('hcp54', 'b100');
  if n <> 84 then raise exception 'FAIL số phần = %', n; end if;
  if exists (select 1 from public.training_program_blocks b join public.training_program_sessions s on s.id = b.session_id
             join public.training_programs p on p.id = s.program_id
             where p.code in ('hcp54', 'b100') and not exists (select 1 from jsonb_array_elements(b.lines) l where l ->> 't' in ('b', 's', 'd'))) then
    raise exception 'FAIL có phần không có dòng bài tập';
  end if;

  -- 2. Chọn chương trình theo mục tiêu
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-b100-' || ua || '@example.test', now());
  update public.app_settings set value = '"all"' where key = 'training.visibility';
  perform pg_temp.act_as(ua);
  perform public.training_create_self_profile('Test B100', (public.vn_today() - interval '40 years')::date);
  for n, code in select * from (values (54, 'hcp54'), (36, 'b100'), (25, 'b100'), (24, 'b90'), (18, 'b90'), (12, 'b80'), (5, 'b70')) v(t, c) loop
    g := public.training_start_goal(jsonb_build_object('hcp_target', n, 'days_of_week', jsonb_build_array(2, 4, 6), 'session_minutes', 60));
    if (select p.code from public.training_goals tg join public.training_programs p on p.id = tg.program_id where tg.id = g) <> code then
      raise exception 'FAIL mục tiêu % không ra %', n, code;
    end if;
  end loop;
  -- Chọn thẳng theo mã (người chưa có handicap)
  g := public.training_start_goal(jsonb_build_object('hcp_target', 54, 'program_code', 'hcp54', 'days_of_week', jsonb_build_array(1, 3, 5)));
  if (select p.weeks from public.training_goals tg join public.training_programs p on p.id = tg.program_id where tg.id = g) <> 8 then
    raise exception 'FAIL chọn theo mã hcp54';
  end if;
  perform pg_temp.act_as(null);

  raise exception 'ALL_OK';
end $$;
