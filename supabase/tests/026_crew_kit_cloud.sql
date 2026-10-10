-- Bộ kit truyền thông lưu trên máy chủ: chỉ người biết SĐT / email đã đăng ký mới có khoá phiên;
-- sai quá số lần thì khoá; khách không gọi thẳng được hàm; khoá phiên chỉ lưu bản băm.
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
  ev uuid; x jsonb; code_c text; code_e text; r jsonb; tok text; i int; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-kit-adm@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.events (class_id, name_vi, name_en, event_date, status)
  values ((select id from public.classes limit 1), 'Thử bộ kit', 'Kit test', current_date, 'open') returning id into ev;
  perform pg_temp.act_as(adm);
  x := public.crew_import(ev, '[{"line":1,"full_name":"HLV Bộ Kit","slot_code":"C2","contact":"0922000333"},
                                {"line":2,"full_name":"Email Bộ Kit","slot_code":"E1","contact":"Kit.Test@Example.com"}]', true);
  code_c := x -> 0 ->> 'passport_code';
  code_e := x -> 1 ->> 'passport_code';

  -- Khách / người đăng nhập không gọi thẳng được (chỉ Edge Function)
  if has_function_privilege('anon', 'public.crew_kit_login(text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.crew_kit_resolve(text)', 'execute') then
    raise exception 'FAIL: hàm bộ kit mở qua API';
  end if;

  perform pg_temp.act_as(null);
  execute 'set local role service_role';
  -- Đúng SĐT (gõ kiểu nào cũng chuẩn hoá) → khoá phiên dùng được
  r := public.crew_kit_login(lower(code_c), '0922 000 333');
  if r ->> 'result' <> 'ok' then raise exception 'FAIL đúng SĐT: %', r; end if;
  tok := r ->> 'token';
  if public.crew_kit_resolve(tok) is null then raise exception 'FAIL: khoá phiên không dùng được'; end if;
  if public.crew_kit_resolve(tok || 'x') is not null or public.crew_kit_resolve(null) is not null then raise exception 'FAIL: khoá giả vẫn qua'; end if;
  execute 'reset role';
  if exists (select 1 from public.crew_kit_sessions where token_hash = tok) then raise exception 'FAIL: lưu khoá phiên dạng rõ'; end if;
  execute 'set local role service_role';
  -- Email không phân biệt hoa thường
  if public.crew_kit_login(code_e, 'kit.test@example.com') ->> 'result' <> 'ok' then raise exception 'FAIL email'; end if;
  -- Sai SĐT: báo còn mấy lần, sai 5 lần thì khoá, đúng cũng không vào được trong lúc khoá
  r := public.crew_kit_login(code_c, '0900000000');
  if r ->> 'result' <> 'wrong' or (r ->> 'remaining')::int <> 4 then raise exception 'FAIL sai lần 1: %', r; end if;
  for i in 2..5 loop r := public.crew_kit_login(code_c, '0900000000'); end loop;
  if r ->> 'result' <> 'locked' then raise exception 'FAIL: sai 5 lần chưa khoá %', r; end if;
  if public.crew_kit_login(code_c, '0922000333') ->> 'result' <> 'locked' then raise exception 'FAIL: đang khoá vẫn vào được'; end if;
  if public.crew_kit_login('ZZZZZZZZ', '0922000333') ->> 'result' <> 'not_found' then raise exception 'FAIL mã lạ'; end if;

  raise exception 'ALL_OK';
end $$;
