-- Bước 14 · Gộp học viên trùng (F10, R12) và hoàn tác trong 30 ngày.
-- Mọi bản ghi liên quan chuyển sang hồ sơ giữ lại; chỗ trùng không xoá cứng (ẩn / để lại / đổi trạng thái)
-- và được ghi đủ trong student_merges.snapshot để hoàn tác chính xác.

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('student_merge.undo_days', '30', 'Số ngày được hoàn tác gộp học viên', 'Days a student merge can be undone', false)
on conflict do nothing;

-- Các trường admin chọn giá trị khi gộp
create or replace function public.merge_fields()
returns text[] language sql immutable as $$
  select array['full_name', 'date_of_birth', 'gender', 'nationality', 'current_school_id', 'current_grade_class',
               'avatar_url', 'golf_goals', 'golf_goals_other']
$$;

-------------------------------------------------------------------------------
-- Xem trước: hai hồ sơ cạnh nhau + số bản ghi liên quan + chỗ trùng
-------------------------------------------------------------------------------
create or replace function public.student_merge_preview(p_a uuid, p_b uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb := '[]';
  sid uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_a = p_b then raise exception 'same_student' using errcode = '22023'; end if;
  foreach sid in array array[p_a, p_b] loop
    if not exists (select 1 from public.students where id = sid and deleted_at is null and merged_into_student_id is null) then
      raise exception 'student_not_found' using errcode = 'P0002';
    end if;
    v := v || (select jsonb_build_object(
      'id', s.id, 'student_code', s.student_code, 'created_at', s.created_at, 'activated_at', s.activated_at,
      'verification_status', s.verification_status,
      'fields', jsonb_build_object('full_name', s.full_name, 'date_of_birth', s.date_of_birth, 'gender', s.gender, 'nationality', s.nationality,
        'current_school_id', s.current_school_id, 'current_grade_class', s.current_grade_class, 'avatar_url', s.avatar_url,
        'golf_goals', to_jsonb(s.golf_goals), 'golf_goals_other', s.golf_goals_other),
      'school_name', coalesce(sc.short_name, sc.name),
      'level_number', (select l.number from public.levels l where l.id = s.current_level_id),
      'counts', jsonb_build_object(
        'guardians', (select count(*) from public.student_guardians x where x.student_id = s.id and x.deleted_at is null),
        'classes', (select count(*) from public.enrollments x where x.student_id = s.id),
        'courses', (select count(*) from public.course_history x where x.student_id = s.id and x.deleted_at is null),
        'levels', (select count(*) from public.level_records x where x.student_id = s.id),
        'passports', (select count(*) from public.passports x where x.student_id = s.id),
        'certificates', (select count(*) from public.certificates x where x.student_id = s.id),
        'orders', (select count(*) from public.orders x where x.student_id = s.id),
        'account', (select count(*) from public.student_accounts x where x.student_id = s.id)),
      'guardian_names', (select coalesce(jsonb_agg(g.full_name), '[]') from public.student_guardians x join public.guardians g on g.id = x.guardian_id
                         where x.student_id = s.id and x.deleted_at is null),
      'active_passport', (select passport_code from public.passports x where x.student_id = s.id and x.status = 'active'))
      from public.students s left join public.schools sc on sc.id = s.current_school_id where s.id = sid);
  end loop;
  return jsonb_build_object('students', v,
    'shared_guardians', (select count(*) from public.student_guardians a join public.student_guardians b on a.guardian_id = b.guardian_id
                         where a.student_id = p_a and b.student_id = p_b and a.deleted_at is null and b.deleted_at is null),
    'both_active_passport', exists (select 1 from public.passports where student_id = p_a and status = 'active')
                            and exists (select 1 from public.passports where student_id = p_b and status = 'active'),
    'both_accounts', exists (select 1 from public.student_accounts where student_id = p_a)
                     and exists (select 1 from public.student_accounts where student_id = p_b));
end $$;

-------------------------------------------------------------------------------
-- Gộp: p_remove → p_keep. p_fields: { tên_trường: 'keep' | 'remove' } (mặc định keep)
-------------------------------------------------------------------------------
create or replace function public.merge_students(p_keep uuid, p_remove uuid, p_fields jsonb default '{}')
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  k public.students;
  r public.students;
  v_moved jsonb := '{}';
  v_ids uuid[];
  v_sg_deleted uuid[];
  v_accounts uuid[];
  v_retired uuid[];
  v_keep_before jsonb;
  v_set text := '';
  f text;
  t record;
  v_merge uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_keep = p_remove then raise exception 'same_student' using errcode = '22023'; end if;
  select * into k from public.students where id = p_keep and deleted_at is null and merged_into_student_id is null for update;
  select * into r from public.students where id = p_remove and deleted_at is null and merged_into_student_id is null for update;
  if k.id is null or r.id is null then raise exception 'student_not_found' using errcode = 'P0002'; end if;

  -- Người giám hộ: trùng người → ẩn liên kết của hồ sơ bị gộp; còn lại chuyển
  select coalesce(array_agg(x.id), '{}') into v_sg_deleted from public.student_guardians x
  where x.student_id = r.id and x.deleted_at is null
    and exists (select 1 from public.student_guardians y where y.student_id = k.id and y.guardian_id = x.guardian_id and y.deleted_at is null);
  update public.student_guardians set deleted_at = now() where id = any(v_sg_deleted);
  with m as (update public.student_guardians set student_id = k.id where student_id = r.id and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;
  v_moved := v_moved || jsonb_build_object('student_guardians', to_jsonb(v_ids));

  -- Lớp: cùng lớp → giữ bản của hồ sơ giữ lại
  with m as (update public.enrollments e set student_id = k.id where e.student_id = r.id
               and not exists (select 1 from public.enrollments y where y.student_id = k.id and y.class_id = e.class_id) returning e.id)
  select coalesce(array_agg(id), '{}') into v_ids from m;
  v_moved := v_moved || jsonb_build_object('enrollments', to_jsonb(v_ids));

  with m as (update public.student_school_history h set student_id = k.id where h.student_id = r.id
               and not exists (select 1 from public.student_school_history y where y.student_id = k.id and y.school_id = h.school_id
                                 and y.academic_year_id is not distinct from h.academic_year_id) returning h.id)
  select coalesce(array_agg(id), '{}') into v_ids from m;
  v_moved := v_moved || jsonb_build_object('student_school_history', to_jsonb(v_ids));

  -- Tài khoản học viên: mỗi hồ sơ một tài khoản → nếu cả hai có, khoá tài khoản của hồ sơ bị gộp
  if exists (select 1 from public.student_accounts where student_id = k.id) then
    with m as (update public.student_accounts set is_active = false where student_id = r.id and is_active returning id)
    select coalesce(array_agg(id), '{}') into v_accounts from m;
    v_moved := v_moved || jsonb_build_object('student_accounts', '[]'::jsonb);
  else
    v_accounts := '{}';
    with m as (update public.student_accounts set student_id = k.id where student_id = r.id returning id)
    select coalesce(array_agg(id), '{}') into v_ids from m;
    v_moved := v_moved || jsonb_build_object('student_accounts', to_jsonb(v_ids));
  end if;

  -- Sổ: nếu cả hai đang có sổ active → sổ của hồ sơ bị gộp chuyển 'retired' (mỗi học viên một sổ active)
  if exists (select 1 from public.passports where student_id = k.id and status = 'active') then
    with m as (update public.passports set status = 'retired', note = concat_ws(' · ', note, 'Gộp hồ sơ ' || to_char(now(), 'DD/MM/YYYY'))
               where student_id = r.id and status = 'active' returning id)
    select coalesce(array_agg(id), '{}') into v_retired from m;
  else
    v_retired := '{}';
  end if;

  -- Các bảng chuyển toàn bộ
  for t in select * from (values ('passports', 'student_id'), ('level_records', 'student_id'), ('course_history', 'student_id'),
                                 ('certificates', 'student_id'), ('invitations', 'student_id'), ('link_requests', 'student_id'),
                                 ('consents', 'student_id'), ('support_requests', 'student_id'), ('orders', 'student_id'),
                                 ('import_rows', 'matched_student_id')) as x(tbl, col) loop
    execute format('with m as (update public.%I set %I = $1 where %I = $2 returning id) select coalesce(array_agg(id), ''{}'') from m',
                   t.tbl, t.col, t.col) into v_ids using k.id, r.id;
    v_moved := v_moved || jsonb_build_object(t.tbl, to_jsonb(v_ids));
  end loop;

  -- Giá trị từng trường (admin chọn)
  v_keep_before := jsonb_build_object('full_name', k.full_name, 'date_of_birth', k.date_of_birth, 'gender', k.gender, 'nationality', k.nationality,
    'current_school_id', k.current_school_id, 'current_grade_class', k.current_grade_class, 'avatar_url', k.avatar_url,
    'golf_goals', to_jsonb(k.golf_goals), 'golf_goals_other', k.golf_goals_other, 'activated_at', k.activated_at,
    'verification_status', k.verification_status);
  foreach f in array public.merge_fields() loop
    if p_fields ->> f = 'remove' then
      v_set := v_set || format(', %I = r.%I', f, f);
    end if;
  end loop;
  if v_set <> '' then
    execute format('update public.students k set %s from public.students r where k.id = $1 and r.id = $2', substr(v_set, 3)) using k.id, r.id;
  end if;
  update public.students set
    activated_at = (select min(x) from unnest(array[k.activated_at, r.activated_at]) x),
    verification_status = case when k.verification_status = 'verified' or r.verification_status = 'verified' then 'verified' else k.verification_status end
  where id = k.id;

  update public.students set merged_into_student_id = k.id, deleted_at = now() where id = r.id;
  perform public.recompute_student_level(k.id);

  insert into public.student_merges (from_student_id, to_student_id, merged_by, merged_at, snapshot)
  values (r.id, k.id, auth.uid(), now(), jsonb_build_object(
    'moved', v_moved, 'guardian_links_hidden', to_jsonb(v_sg_deleted), 'accounts_deactivated', to_jsonb(v_accounts),
    'passports_retired', to_jsonb(v_retired), 'keep_before', v_keep_before, 'fields', p_fields,
    'remove_code', r.student_code, 'keep_code', k.student_code))
  returning id into v_merge;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'student.merge', 'students', k.id, jsonb_build_object('removed_student', r.id, 'removed_code', r.student_code),
          jsonb_build_object('merge_id', v_merge));
  return v_merge;
end $$;

-------------------------------------------------------------------------------
-- Hoàn tác trong N ngày: trả từng bản ghi đã chuyển về hồ sơ cũ, khôi phục giá trị và trạng thái
-------------------------------------------------------------------------------
create or replace function public.undo_student_merge(p_merge_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  m public.student_merges;
  sn jsonb;
  t record;
  kb jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into m from public.student_merges where id = p_merge_id for update;
  if m.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if m.undone_at is not null then raise exception 'already_undone' using errcode = '22023'; end if;
  if m.merged_at < now() - make_interval(days => public.setting_int('student_merge.undo_days', 30)) then
    raise exception 'undo_expired' using errcode = '22023';
  end if;
  -- Hồ sơ giữ lại đã bị gộp tiếp vào hồ sơ khác → phải hoàn tác lần gộp sau trước
  if exists (select 1 from public.students where id = m.to_student_id and (merged_into_student_id is not null or deleted_at is not null)) then
    raise exception 'undo_later_merge_first' using errcode = '22023';
  end if;
  sn := m.snapshot;

  for t in select key as tbl, value as ids from jsonb_each(sn -> 'moved') loop
    if t.tbl not in ('student_guardians', 'enrollments', 'student_school_history', 'student_accounts', 'passports', 'level_records',
                     'course_history', 'certificates', 'invitations', 'link_requests', 'consents', 'support_requests', 'orders', 'import_rows') then
      continue;
    end if;
    execute format('update public.%I set %I = $1 where id = any($2)', t.tbl,
                   case when t.tbl = 'import_rows' then 'matched_student_id' else 'student_id' end)
      using m.from_student_id, array(select jsonb_array_elements_text(t.ids)::uuid);
  end loop;
  update public.student_guardians set deleted_at = null
  where id = any(array(select jsonb_array_elements_text(sn -> 'guardian_links_hidden')::uuid));
  update public.student_accounts set is_active = true
  where id = any(array(select jsonb_array_elements_text(sn -> 'accounts_deactivated')::uuid));
  update public.passports set status = 'active'
  where id = any(array(select jsonb_array_elements_text(sn -> 'passports_retired')::uuid)) and status = 'retired';

  kb := sn -> 'keep_before';
  update public.students set
    full_name = kb ->> 'full_name', date_of_birth = (kb ->> 'date_of_birth')::date, gender = kb ->> 'gender', nationality = kb ->> 'nationality',
    current_school_id = (kb ->> 'current_school_id')::uuid, current_grade_class = kb ->> 'current_grade_class', avatar_url = kb ->> 'avatar_url',
    golf_goals = coalesce(array(select jsonb_array_elements_text(kb -> 'golf_goals')), '{}'), golf_goals_other = kb ->> 'golf_goals_other',
    activated_at = (kb ->> 'activated_at')::timestamptz, verification_status = kb ->> 'verification_status'
  where id = m.to_student_id;
  update public.students set merged_into_student_id = null, deleted_at = null where id = m.from_student_id;
  perform public.recompute_student_level(m.to_student_id);
  perform public.recompute_student_level(m.from_student_id);

  update public.student_merges set undone_at = now(), undone_by = auth.uid() where id = m.id;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'student.merge_undo', 'students', m.to_student_id, jsonb_build_object('merge_id', m.id),
          jsonb_build_object('restored_student', m.from_student_id));
end $$;

-- Lịch sử gộp (admin): mới nhất trước, kèm còn hoàn tác được không
create or replace function public.student_merges_list(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_days int := public.setting_int('student_merge.undo_days', 30);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'merged_at' desc) from (
    select jsonb_build_object('id', m.id, 'merged_at', m.merged_at, 'undone_at', m.undone_at,
      'from_id', m.from_student_id, 'from_name', f.full_name, 'from_code', f.student_code,
      'to_id', m.to_student_id, 'to_name', k.full_name, 'to_code', k.student_code,
      'merged_by', p.full_name, 'undo_until', m.merged_at + make_interval(days => v_days),
      'can_undo', m.undone_at is null and m.merged_at >= now() - make_interval(days => v_days)) x
    from public.student_merges m join public.students f on f.id = m.from_student_id join public.students k on k.id = m.to_student_id
    left join public.profiles p on p.user_id = m.merged_by
    order by m.merged_at desc limit least(coalesce(p_limit, 100), 500)) q), '[]');
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.student_merge_preview(uuid, uuid)', 'public.merge_students(uuid, uuid, jsonb)',
                           'public.undo_student_merge(uuid)', 'public.student_merges_list(int)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
