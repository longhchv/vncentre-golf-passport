-- Kiểm thử tra cứu bằng mã phụ (migration 20261128000001): vnc_same_person và các hàm tìm học viên của admin.
-- Quy ước: chạy trong một khối DO; thành công thì raise 'ALL_OK' để toàn bộ dữ liệu thử bị huỷ.

do $$
declare
  admin_u uuid := gen_random_uuid();
  a uuid; b uuid; m uuid;
  code_a text; code_b text; code_m text;
  alias text;
  j jsonb;
begin
  insert into public.students (full_name) values ('Test Alias A') returning id, student_code into a, code_a;
  insert into public.students (full_name) values ('Test Alias B') returning id, student_code into b, code_b;
  insert into public.students (full_name) values ('Test Alias M') returning id, student_code into m, code_m;
  -- A có thêm một mã phụ (như sau khi đổi mã chính): một số thường chưa ai dùng
  select lpad(g::text, 6, '0') into alias from generate_series(12467, 99999) g
  where not exists (select 1 from public.vnc_codes v where v.code = lpad(g::text, 6, '0'))
    and not public.vnc_is_premium_tier(public.vnc_tier_of(public.vnc_categories(lpad(g::text, 6, '0'))))
  limit 1;
  insert into public.vnc_codes (code, owner_id, is_primary, status, category, tier, acquired_at, acquired_by)
  values (alias, a, false, 'retired_alias', public.vnc_categories(alias), public.vnc_tier_of(public.vnc_categories(alias)), now(), 'cap');
  -- M gộp vào A
  update public.students set merged_into_student_id = a where id = m;

  -- So khớp: như cũ (cùng mã, mọi cách viết) + mã phụ của chính người đó; không khớp người khác
  if not public.vnc_same_person(code_a, code_a) or not public.vnc_same_person(code_a, lower(replace(code_a, '-', ''))) then
    raise exception 'FAIL: cùng mã';
  end if;
  if not public.vnc_same_person(code_a, alias) or not public.vnc_same_person(code_a, 'VNC-' || alias) then raise exception 'FAIL: mã phụ'; end if;
  if public.vnc_same_person(code_b, alias) then raise exception 'FAIL: mã phụ của A khớp B'; end if;
  if public.vnc_same_person(code_a, code_b) then raise exception 'FAIL: A khớp mã B'; end if;
  -- Hồ sơ đã gộp: mã của M vẫn khớp dòng M như cũ; dòng A khớp mã M qua nhánh mã phụ (một người)
  if not public.vnc_same_person(code_m, code_m) then raise exception 'FAIL: mã của hồ sơ đã gộp'; end if;
  if public.vnc_same_person(code_m, alias) then raise exception 'FAIL: dòng đã gộp khớp mã phụ (sinh hai dòng)'; end if;
  -- Mã phụ phải đủ 6 chữ số (không đoán bằng số ngắn)
  if public.vnc_same_person(code_a, ltrim(alias, '0')) and length(ltrim(alias, '0')) < 6 then raise exception 'FAIL: số ngắn'; end if;

  -- Admin tìm học viên bằng mã phụ → ra A
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (admin_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-alias-admin@example.test', now());
  insert into public.user_roles (user_id, role) values (admin_u, 'admin');
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  execute 'set local role authenticated';
  j := public.reward_find_students('VNC-' || alias);
  if not exists (select 1 from jsonb_array_elements(j) x where (x ->> 'id')::uuid = a) then raise exception 'FAIL: reward_find_students %', j; end if;
  j := public.admin_students_page(p_query => alias);
  if not exists (select 1 from jsonb_array_elements(j -> 'rows') x where (x ->> 'id')::uuid = a) then raise exception 'FAIL: admin_students_page %', j; end if;

  raise exception 'ALL_OK';
end $$;
