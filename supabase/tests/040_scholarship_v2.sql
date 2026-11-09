-- Spec 22 · bước 2: danh mục v2 sau migration (tiêu chí 9 + cấu trúc), hướng đi theo khi gộp học viên, lọc mục theo hướng.
-- Tiêu chí 1–3 (chuyển trạng thái 17 mục cũ) kiểm bằng supabase/tests/upgrade/scholarship_v2_*.sql (cần chạy trước/sau migration).
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
  keep uuid; rem uuid; g uuid; m uuid; r jsonb; n int; ok boolean;
  codes text[];
begin
  ------------------------------------------------------------------ danh mục
  if (select count(*) from public.scholarship_checklist_items) <> 80
     or (select count(*) from public.scholarship_checklist_items where is_active) <> 78
     or (select count(*) from public.scholarship_checklist_items where is_active and code is null) <> 0
     or (select count(*) from public.scholarship_checklist_items where not is_active and code is null) <> 2 then
    raise exception 'FAIL số mục: tổng 80, bật 78 có mã, 2 dòng tắt không mã';
  end if;
  select array_agg(track || ':' || c order by track collate "C") into codes from (
    select track, count(*) c from public.scholarship_checklist_items where is_active group by track) x;
  if codes <> array['asia:4', 'au:4', 'career:5', 'common:18', 'hs:4', 'uk:5', 'us:35', 'vn:3'] then
    raise exception 'FAIL số mục theo hướng: %', codes;
  end if;
  if (select count(*) from public.scholarship_checklist_items where is_active and not is_verified) <> 12
     or exists (select 1 from public.scholarship_checklist_items where is_active and stage <> public.scholarship_stage_of(start_grade))
     or (select string_agg(code, ',' order by sort_order) from public.scholarship_checklist_items where stage = 'post_graduation') <> 'US-A8,US-B4,US-F7'
     or (select string_agg(code || '=' || auto_source, ',' order by sort_order) from public.scholarship_checklist_items
         where is_active and auto_source is not null) <> 'C3=courses,C4=competitions,C5=culture_awards'
     or not (select has_deadline from public.scholarship_checklist_items where code = 'C10')
     or (select has_deadline from public.scholarship_checklist_items where code = 'C1') then
    raise exception 'FAIL thuộc tính mục v2';
  end if;
  -- stage tự theo start_grade khi admin sửa
  update public.scholarship_checklist_items set start_grade = 13 where code = 'C1';
  if (select stage from public.scholarship_checklist_items where code = 'C1') <> 'post_graduation' then raise exception 'FAIL trigger stage'; end if;
  update public.scholarship_checklist_items set start_grade = 5 where code = 'C1';
  ok := false;
  begin update public.scholarship_checklist_items set track = 'mars' where code = 'C1'; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL nhận hướng lạ'; end if;
  if not exists (select 1 from public.audit_logs where action = 'scholarship_v2_migrate') then raise exception 'FAIL thiếu audit nâng cấp'; end if;

  ------------------------------------------------------------------ tiêu chí 9: không mất bảng / cột cũ
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and (table_name, column_name) in (
    ('scholarship_checklist_items', 'id'), ('scholarship_checklist_items', 'org_id'), ('scholarship_checklist_items', 'stage'),
    ('scholarship_checklist_items', 'item_group'), ('scholarship_checklist_items', 'title_vi'), ('scholarship_checklist_items', 'title_en'),
    ('scholarship_checklist_items', 'help_vi'), ('scholarship_checklist_items', 'help_en'), ('scholarship_checklist_items', 'auto_source'),
    ('scholarship_checklist_items', 'sort_order'), ('scholarship_checklist_items', 'is_active'),
    ('scholarship_checklist_items', 'created_at'), ('scholarship_checklist_items', 'updated_at'),
    ('scholarship_checklist_status', 'id'), ('scholarship_checklist_status', 'org_id'), ('scholarship_checklist_status', 'student_id'),
    ('scholarship_checklist_status', 'item_id'), ('scholarship_checklist_status', 'status'), ('scholarship_checklist_status', 'note'),
    ('scholarship_checklist_status', 'updated_by'), ('scholarship_checklist_status', 'merge_trail'),
    ('scholarship_checklist_status', 'created_at'), ('scholarship_checklist_status', 'updated_at'));
  if n <> 23 then raise exception 'FAIL mất cột cũ: còn %/23', n; end if;
  -- CHECK cũ chỉ được nới: mọi giá trị v1 vẫn hợp lệ
  insert into public.scholarship_checklist_items (stage, item_group, title_vi, title_en)
  values ('primary', 'golf', 'Test v2 a', 'a'), ('lower_secondary', 'academic', 'Test v2 b', 'b'), ('upper_secondary', 'personal', 'Test v2 c', 'c');
  delete from public.scholarship_checklist_items where title_vi like 'Test v2 %';

  ------------------------------------------------------------------ RLS bảng hướng
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-shv2-adm@example.test', now()),
    (par, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-shv2-par@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.students (full_name, birth_year) values ('Test SHV2 Giữ', 2014) returning id into keep;
  insert into public.students (full_name, birth_year) values ('Test SHV2 Gộp', 2014) returning id into rem;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH SHV2', '+84900000951', par) returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (keep, g, 'mother', true, true, 'league', 'active', now()), (rem, g, 'mother', true, true, 'league', 'active', now());

  -- chưa chọn hướng → mục chung + hướng Mỹ (như v1)
  perform pg_temp.act_as(par);
  r := public.scholarship_checklist(keep);
  select count(*) into n from jsonb_array_elements(r -> 'stages') s, jsonb_array_elements(s -> 'items') x;
  if n <> 53 or r::text like '%source_ref%' or r -> 'tracks' <> '[]'::jsonb then raise exception 'FAIL chưa chọn hướng: % mục', n; end if;
  ok := false;
  begin insert into public.student_scholarship_tracks (student_id, track) values (keep, 'uk'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh ghi thẳng bảng hướng'; end if;

  perform pg_temp.act_as(null);
  insert into public.student_scholarship_tracks (student_id, track) values (keep, 'uk');
  insert into public.student_scholarship_tracks (student_id, track) values (rem, 'uk'), (rem, 'vn');
  perform pg_temp.act_as(par);
  r := public.scholarship_checklist(keep);
  select count(*) into n from jsonb_array_elements(r -> 'stages') s, jsonb_array_elements(s -> 'items') x;
  if n <> 23 or r -> 'tracks' <> '["uk"]'::jsonb
     or exists (select 1 from jsonb_array_elements(r -> 'stages') s, jsonb_array_elements(s -> 'items') x where x ->> 'track' = 'us')
     or (select x ->> 'is_verified' from jsonb_array_elements(r -> 'stages') s, jsonb_array_elements(s -> 'items') x
         where x ->> 'code' = 'UK-5') <> 'false' then
    raise exception 'FAIL chỉ hướng Anh: % mục', n;
  end if;

  ------------------------------------------------------------------ gộp học viên: hướng đi theo, hoàn tác trả về
  perform pg_temp.act_as(adm);
  m := public.merge_students(keep, rem);
  perform pg_temp.act_as(null);
  if (select array_agg(track order by track) from public.student_scholarship_tracks where student_id = keep) <> array['uk', 'vn']
     or (select count(*) from public.student_scholarship_tracks where student_id = rem) <> 1 then
    raise exception 'FAIL hướng sau khi gộp';
  end if;
  perform pg_temp.act_as(adm);
  perform public.undo_student_merge(m);
  perform pg_temp.act_as(null);
  if (select count(*) from public.student_scholarship_tracks where student_id = keep) <> 1
     or (select count(*) from public.student_scholarship_tracks where student_id = rem) <> 2
     or exists (select 1 from public.student_scholarship_tracks where student_id in (keep, rem) and cardinality(merge_trail) > 0) then
    raise exception 'FAIL hoàn tác gộp không trả hướng về';
  end if;

  raise exception 'ALL_OK';
end $$;
