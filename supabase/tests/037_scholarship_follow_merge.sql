-- Spec 15 · B23: trạng thái checklist học bổng đi theo hồ sơ khi gộp (merge_students) và trở về khi hoàn tác (undo_student_merge).
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
  keep uuid; rem uuid; g uuid; m uuid;
  i_a uuid; i_b uuid; i_c uuid; r jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-chkm-adm@example.test', now()),
    (par, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-chkm-par@example.test', now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.students (full_name, birth_year) values ('Test CHKM Giữ', 2016) returning id into keep;
  insert into public.students (full_name, birth_year) values ('Test CHKM Gộp', 2016) returning id into rem;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH CHKM', '+84900000901', par) returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (keep, g, 'mother', true, true, 'league', 'active', now()),
         (rem, g, 'mother', true, true, 'league', 'active', now());

  select id into i_a from public.scholarship_checklist_items where title_vi = 'Học bạ / bảng điểm từng năm';
  select id into i_b from public.scholarship_checklist_items where title_vi = 'Chứng chỉ tiếng Anh (Cambridge…)';
  select id into i_c from public.scholarship_checklist_items where title_vi = 'Hoạt động ngoại khoá, thiện nguyện';

  -- hồ sơ giữ lại: A = đang làm · hồ sơ bị gộp: A = đã có (trùng), B = đã có, C = đang làm
  perform pg_temp.act_as(par);
  perform public.set_scholarship_item(keep, i_a, 'in_progress', 'giu');
  perform public.set_scholarship_item(rem, i_a, 'done', 'gop');
  perform public.set_scholarship_item(rem, i_b, 'done', null);
  perform public.set_scholarship_item(rem, i_c, 'in_progress', null);

  perform pg_temp.act_as(adm);
  m := public.merge_students(keep, rem);

  perform pg_temp.act_as(par);
  r := public.scholarship_checklist(keep);
  if (select x ->> 'status' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = i_a::text) <> 'in_progress'
     or (select x ->> 'note' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = i_a::text) <> 'giu'
     or (select x ->> 'status' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = i_b::text) <> 'done'
     or (select x ->> 'status' from jsonb_array_elements(r #> '{stages,0,items}') x where x ->> 'id' = i_c::text) <> 'in_progress' then
    raise exception 'FAIL sau khi gộp: %', r #> '{stages,0,items}';
  end if;
  -- mở bằng id hồ sơ đã gộp → ra checklist của hồ sơ giữ lại
  if public.scholarship_checklist(rem) ->> 'student_id' <> keep::text then raise exception 'FAIL mở bằng id đã gộp'; end if;

  perform pg_temp.act_as(null);
  if (select count(*) from public.scholarship_checklist_status where student_id = rem) <> 1 then
    raise exception 'FAIL bản trùng của hồ sơ bị gộp phải nằm nguyên chỗ cũ';
  end if;

  perform pg_temp.act_as(adm);
  perform public.undo_student_merge(m);
  perform pg_temp.act_as(null);
  if (select count(*) from public.scholarship_checklist_status where student_id = rem) <> 3
     or (select count(*) from public.scholarship_checklist_status where student_id = keep) <> 1
     or exists (select 1 from public.scholarship_checklist_status where student_id in (keep, rem) and cardinality(merge_trail) > 0)
     or (select status from public.scholarship_checklist_status where student_id = rem and item_id = i_a) <> 'done' then
    raise exception 'FAIL hoàn tác gộp không trả checklist về đúng hồ sơ';
  end if;

  raise exception 'ALL_OK';
end $$;
