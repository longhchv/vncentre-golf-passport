-- Spec 24 · Tăng tốc trước giải: gói theo tuổi, lưu kế hoạch, sổ sân, huỷ; HLV xem phong độ cả lớp. Dữ liệu thử bị huỷ ở cuối.
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
  pa uuid := gen_random_uuid(); px uuid := gen_random_uuid(); co uuid := gen_random_uuid();
  s7 uuid; s12 uuid; g uuid; sc uuid; ay uuid; prog uuid; ctype uuid; cls uuid; r jsonb; n int; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-tbo-' || x || '@example.test', now()
  from unnest(array[pa, px, co]) x;
  insert into public.profiles (user_id, full_name) select x, 'Test TBO' from unnest(array[pa, px, co]) x on conflict do nothing;
  insert into public.user_roles (user_id, role) values (co, 'coach');
  update public.app_settings set value = '"all"' where key = 'training.visibility';
  insert into public.students (full_name, date_of_birth) values ('Test TBO 7', (public.vn_today() - interval '7 years 2 months')::date) returning id into s7;
  insert into public.students (full_name, date_of_birth) values ('Test TBO 12', (public.vn_today() - interval '12 years 2 months')::date) returning id into s12;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH TBO', '+84900006301', pa) returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s7, g, 'mother', true, true, 'admin', 'active', now()), (s12, g, 'mother', true, true, 'admin', 'active', now());
  insert into public.schools (name, type) values ('TH Test TBO', 'public') returning id into sc;
  select id into ay from public.academic_years order by is_current desc limit 1;
  select id into prog from public.programs where code = 'core20';
  select id into ctype from public.class_types limit 1;
  insert into public.classes (name, school_id, academic_year_id, program_id, class_type_id) values ('Lớp TBO', sc, ay, prog, ctype) returning id into cls;
  insert into public.class_staff (class_id, user_id, role) values (cls, co, 'coach');
  insert into public.enrollments (student_id, class_id) values (s7, cls), (s12, cls);

  -- 1. Gói mẫu: tổng ngày đúng
  if (select sum(v::int) from public.training_boost_packages, jsonb_each_text(phases) e(k, v) where code = 'm1') <> 28 then raise exception 'FAIL gói 1 tháng'; end if;

  -- 2. Bạn 7 tuổi chỉ có tuần vui; bạn 12 tuổi không chọn được tuần vui
  perform pg_temp.act_as(pa);
  ok := false;
  begin perform public.training_set_boost_plan(s7, 'w2', 'Giải SNAG', public.vn_today() + 14, null, 9, array[1,2,3,4,5], 60, array['home'], array['putting']);
  exception when others then ok := sqlerrm = 'package_not_for_age'; end;
  if not ok then raise exception 'FAIL bạn 7 tuổi chọn được gói 2 tuần'; end if;
  perform public.training_set_boost_plan(s7, 'fun', 'Giải SNAG tháng 12', public.vn_today() + 7, null, 9, array[1,2,3,4,5,6], 45, array['home'], array['putting']);
  ok := false;
  begin perform public.training_set_boost_plan(s12, 'fun', 'Giải', public.vn_today() + 7, null, 9, array[1], 60, array['home'], array['putting']);
  exception when others then ok := sqlerrm = 'package_not_for_age'; end;
  if not ok then raise exception 'FAIL bạn 12 tuổi chọn được tuần vui'; end if;

  -- 3. Bạn 12 tuổi gói 1 tháng; ngày thi phải ở tương lai; phần yếu phải có trong bảng tỉ lệ
  ok := false;
  begin perform public.training_set_boost_plan(s12, 'm1', 'Giải trẻ', public.vn_today(), null, 18, array[1], 60, array['home'], array['putting']);
  exception when others then ok := sqlerrm = 'event_in_past'; end;
  if not ok then raise exception 'FAIL nhận ngày thi hôm nay'; end if;
  ok := false;
  begin perform public.training_set_boost_plan(s12, 'm1', 'Giải trẻ', public.vn_today() + 28, null, 18, array[1], 60, array['home'], array['xyz']);
  exception when others then ok := sqlerrm = 'invalid_area'; end;
  if not ok then raise exception 'FAIL nhận phần yếu lạ'; end if;
  perform public.training_set_boost_plan(s12, 'm1', 'Giải trẻ Hà Nội', public.vn_today() + 28, 'Sân Thử', 18, array[1,2,3,4,6], 120, array['range','course'], array['putting','short_game']);
  perform public.training_boost_note(s12, 3, 'Đánh gỗ 3 về bên trái fairway');
  perform public.training_boost_note(s12, 7, 'Green dốc từ sau ra trước');
  perform public.training_boost_note(s12, 7, '');
  if (select hole_notes from public.training_boost_plans where student_id = s12) <> '{"3":"Đánh gỗ 3 về bên trái fairway"}'::jsonb then
    raise exception 'FAIL sổ sân';
  end if;
  perform public.training_keep_mark(s12, public.vn_today(), 'b-putting', true, 40);

  -- 4. Người ngoài không xem, không sửa
  perform pg_temp.act_as(px);
  select count(*) into n from public.training_boost_plans where student_id = s12;
  if n <> 0 then raise exception 'FAIL người ngoài xem được kế hoạch'; end if;
  ok := false;
  begin perform public.training_boost_note(s12, 1, 'x'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người ngoài ghi sổ sân'; end if;
  ok := false;
  begin perform public.training_class_form(cls); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người ngoài xem lớp'; end if;

  -- 5. HLV xem phong độ cả lớp
  perform pg_temp.act_as(co);
  r := public.training_class_form(cls);
  if jsonb_array_length(r) <> 2 then raise exception 'FAIL số bạn trong lớp: %', r; end if;
  if not exists (select 1 from jsonb_array_elements(r) x where x ->> 'student_id' = s12::text
                 and x -> 'boost' ->> 'package' = 'm1' and (x ->> 'done_7d')::int = 40) then
    raise exception 'FAIL dữ liệu lớp: %', r;
  end if;

  -- 6. Huỷ
  perform pg_temp.act_as(pa);
  perform public.training_cancel_boost(s12);
  perform pg_temp.act_as(co);
  r := public.training_class_form(cls);
  if exists (select 1 from jsonb_array_elements(r) x where x ->> 'student_id' = s12::text and x -> 'boost' is not null and x -> 'boost' <> 'null'::jsonb) then
    raise exception 'FAIL huỷ vẫn hiện';
  end if;
  perform pg_temp.act_as(null);

  raise exception 'ALL_OK';
end $$;
