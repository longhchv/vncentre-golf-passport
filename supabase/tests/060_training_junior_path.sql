-- Spec 24 · đợt 2b: lộ trình, phương án tài chính, nhu cầu gia đình. Dữ liệu thử bị huỷ ở cuối.
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
  pa uuid := gen_random_uuid(); px uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  s uuid; g uuid; sc uuid; r jsonb; n int; ok boolean; bad text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-tjp-' || x || '@example.test', now()
  from unnest(array[pa, px, adm]) x;
  insert into public.profiles (user_id, full_name) select x, 'Test TJP' from unnest(array[pa, px, adm]) x on conflict do nothing;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  update public.app_settings set value = '"all"' where key = 'training.visibility';
  insert into public.schools (name, type) values ('TH công Test TJP', 'public') returning id into sc;
  insert into public.students (full_name, date_of_birth, current_school_id) values ('Test TJP 9', (public.vn_today() - interval '9 years')::date, sc) returning id into s;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH TJP', '+84900006001', pa) returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s, g, 'mother', true, true, 'admin', 'active', now());

  -- 1. Dữ liệu mẫu đủ và khớp nhau
  if (select count(*) from public.training_cost_items) < 16 then raise exception 'FAIL thiếu khoản chi phí'; end if;
  if exists (select 1 from public.training_cost_items where code = 'clubs_premium') then raise exception 'FAIL còn bộ gậy cao cấp'; end if;
  if (select count(*) from public.training_path_steps) <> 6 then raise exception 'FAIL số bước'; end if;
  if (select count(*) from public.training_finance_plans) <> 4 then raise exception 'FAIL số phương án'; end if;
  -- Mọi phương án dùng bộ gậy cơ bản
  if exists (select 1 from public.training_finance_plans p, jsonb_array_elements(p.items) i
             join public.training_cost_items c on c.code = i ->> 'item'
             where c.grp = 'equipment' and c.code not in ('clubs_basic', 'net_cage', 'mat', 'club_single')) then
    raise exception 'FAIL phương án dùng gậy khác bộ cơ bản';
  end if;
  select string_agg(distinct i ->> 'item', ',') into bad from public.training_finance_plans p, jsonb_array_elements(p.items) i
  where not exists (select 1 from public.training_cost_items c where c.code = i ->> 'item');
  if bad is not null then raise exception 'FAIL phương án dùng khoản không có: %', bad; end if;
  if exists (select 1 from public.training_needs n where n.goal_step is not null and not exists (select 1 from public.training_path_steps s where s.code = n.goal_step)) then
    raise exception 'FAIL nhu cầu trỏ bước không có';
  end if;
  if exists (select 1 from public.training_path_steps s where not (s.months ? 'super_saving' and s.months ? 'saving' and s.months ? 'balanced' and s.months ? 'fast')) then
    raise exception 'FAIL bước thiếu thời gian theo phương án';
  end if;
  -- Bước liền nhau, phủ level 1–20
  if (select min(level_from) from public.training_path_steps) <> 1 or (select max(level_to) from public.training_path_steps) <> 20
     or exists (select 1 from public.training_path_steps a join public.training_path_steps b on b.sort_order > a.sort_order and b.level_from <= a.level_to) then
    raise exception 'FAIL bước không liền mạch';
  end if;

  -- 2. Phụ huynh lưu nhu cầu, phương án; mã lạ bị bỏ
  perform pg_temp.act_as(pa);
  if (select count(*) from public.training_cost_items) = 0 then raise exception 'FAIL phụ huynh không đọc được chi phí'; end if;
  -- Trường công → chọn sẵn học SNAG miễn phí tại trường
  r := public.training_path_context(s);
  if r ->> 'snag_place' <> 'public_school' then raise exception 'FAIL không chọn sẵn trường công: %', r; end if;
  r := public.training_set_family_plan(s, array['scholarship', 'health', 'xyz'], 'super_saving', 'outside');
  if r -> 'needs' <> '["health", "scholarship"]'::jsonb or r ->> 'snag_place' <> 'outside' then raise exception 'FAIL lưu nhu cầu: %', r; end if;
  select count(*) into n from public.training_family_plans where student_id = s and plan_code = 'super_saving' and snag_place = 'outside';
  if n <> 1 then raise exception 'FAIL phụ huynh không đọc lại được'; end if;
  ok := false;
  begin perform public.training_set_family_plan(s, '{}', 'luxury'); exception when others then ok := sqlerrm = 'invalid_plan'; end;
  if not ok then raise exception 'FAIL nhận phương án lạ'; end if;
  ok := false;
  begin perform public.training_set_family_plan(s, '{}', null, 'moon'); exception when others then ok := sqlerrm = 'invalid_place'; end;
  if not ok then raise exception 'FAIL nhận nơi học lạ'; end if;
  -- Phụ huynh không sửa được bảng chi phí
  update public.training_cost_items set min_vnd = 1 where code = 'snag_group';
  if (select min_vnd from public.training_cost_items where code = 'snag_group') = 1 then raise exception 'FAIL phụ huynh sửa được chi phí'; end if;

  -- 3. Người khác không xem, không sửa được
  perform pg_temp.act_as(px);
  select count(*) into n from public.training_family_plans where student_id = s;
  if n <> 0 then raise exception 'FAIL người ngoài xem được lựa chọn của gia đình'; end if;
  ok := false;
  begin perform public.training_set_family_plan(s, array['health'], null); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người ngoài sửa được'; end if;
  ok := false;
  begin perform public.training_path_context(s); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người ngoài xem được chỉ số của các con'; end if;

  -- 4. Admin sửa chi phí
  perform pg_temp.act_as(adm);
  update public.training_cost_items set min_vnd = 250000, max_vnd = 250000 where code = 'snag_group';
  if (select min_vnd from public.training_cost_items where code = 'snag_group') <> 250000 then raise exception 'FAIL admin không sửa được chi phí'; end if;
  perform pg_temp.act_as(null);

  raise exception 'ALL_OK';
end $$;
