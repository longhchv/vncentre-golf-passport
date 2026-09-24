-- Bước 9 · Lịch sử khoá học, hàng chờ duyệt, cổng quản lý trường (F12, F13).
-- R6: nhà trường không tạo được level_records đã duyệt; R7: chờ duyệt không hiện cho phụ huynh.

-------------------------------------------------------------------------------
-- Tiện ích
-------------------------------------------------------------------------------
create or replace function public.my_school_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct ur.school_id), '{}') from public.user_roles ur
  join public.profiles p on p.user_id = ur.user_id
  where ur.user_id = auth.uid() and ur.role = 'school_manager' and ur.deleted_at is null and p.status = 'active'
$$;

-- Gửi thông báo trong app cho người giám hộ (có tài khoản, liên kết active) của học viên (F17)
create or replace function public.notify_student_guardians(
  p_student_id uuid, p_type text, p_title_vi text, p_title_en text, p_body_vi text, p_body_en text, p_link text)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title_vi, title_en, body_vi, body_en, link, channels_sent)
  select distinct g.user_id, p_type, p_title_vi, p_title_en, p_body_vi, p_body_en, p_link, '["in_app"]'::jsonb
  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where sg.student_id = p_student_id and sg.status = 'active' and sg.deleted_at is null
    and g.user_id is not null and g.deleted_at is null
$$;

-- "2024-2025" → ngày kết thúc năm học (dùng làm ngày hoàn thành level dữ liệu cũ)
create or replace function public.academic_year_end(p_text text)
returns date language sql stable security definer set search_path = public as $$
  select coalesce(
    (select end_date from public.academic_years where name = p_text),
    case when p_text ~ '^\d{4}-\d{4}$' then make_date(split_part(p_text, '-', 2)::int, 5, 31) end)
$$;

-- Ghi "hoàn thành level N" (core20) nếu chưa có bản ghi còn hiệu lực cho level đó (không tạo trùng — kế hoạch E23)
create or replace function public.upsert_level_completion(
  p_student_id uuid, p_level_number int, p_source text, p_approved boolean, p_completed_at date, p_note text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_level uuid;
  v_rec uuid;
begin
  select l.id into v_level from public.levels l join public.programs p on p.id = l.program_id
  where p.code = 'core20' and l.number = p_level_number;
  if v_level is null then raise exception 'invalid_level' using errcode = '22023'; end if;

  select id into v_rec from public.level_records
  where student_id = p_student_id and level_id = v_level and approval_status <> 'rejected'
  order by (approval_status = 'approved') desc limit 1;

  if v_rec is not null then
    if p_approved then
      update public.level_records
      set approval_status = 'approved', approved_by = auth.uid(), approved_at = now(), status = 'completed',
          completed_at = coalesce(completed_at, p_completed_at)
      where id = v_rec and approval_status = 'pending';
    end if;
    return v_rec;
  end if;

  insert into public.level_records (student_id, level_id, status, completed_at, source, proposed_by,
                                    approval_status, approved_by, approved_at, note)
  values (p_student_id, v_level, 'completed', p_completed_at, p_source, auth.uid(),
          case when p_approved then 'approved' else 'pending' end,
          case when p_approved then auth.uid() end, case when p_approved then now() end, p_note)
  returning id into v_rec;
  return v_rec;
end $$;

-------------------------------------------------------------------------------
-- Nhập lịch sử khoá học (phụ lục A2): admin / HLV trưởng / quản lý trường (chỉ trường mình, luôn chờ duyệt)
-- import_rows.normalized: { full_name, date_of_birth, school_id, school_text, grade_class,
--                           academic_year, course_name, level_number }
-------------------------------------------------------------------------------
create or replace function public.can_import_history(p_school_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_center_staff() or (p_school_id is not null and p_school_id = any(public.my_school_ids()))
$$;

create or replace function public.history_import_validate(p_batch_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  b public.import_batches;
  r record;
  v_matches jsonb;
  v_n int;
begin
  select * into b from public.import_batches where id = p_batch_id for update;
  if b.id is null or b.type <> 'course_history' then raise exception 'batch_not_found' using errcode = 'P0002'; end if;
  if b.created_by <> auth.uid() and not public.is_center_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if b.status not in ('uploaded', 'validated') then raise exception 'batch_closed' using errcode = '22023'; end if;

  for r in select * from public.import_rows where batch_id = p_batch_id and status <> 'error' loop
    -- Quản lý trường chỉ nhập cho trường của mình
    if not public.can_import_history(nullif(r.normalized ->> 'school_id', '')::uuid) then
      update public.import_rows set status = 'error',
        messages = messages || '[{"code":"school_not_allowed"}]'::jsonb where id = r.id;
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'student_code', m.student_code, 'full_name', m.full_name,
                                                 'date_of_birth', m.date_of_birth, 'school', m.school_name)), '[]'::jsonb),
           count(*)
      into v_matches, v_n
    from public.find_student_matches(r.normalized ->> 'full_name', nullif(r.normalized ->> 'date_of_birth', '')::date,
                                     nullif(r.normalized ->> 'school_id', '')::uuid) m;
    update public.import_rows set
      matched_student_id = case when v_n = 1 then (v_matches -> 0 ->> 'id')::uuid end,
      decision = case when v_n = 1 then 'use_existing' end,
      status = case when v_n = 1 then status when v_n = 0 then 'warning' else 'duplicate_suspect' end,
      messages = (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(messages) x
                  where x ->> 'code' not in ('student_not_found', 'multiple_matches', 'matched'))
                 || case when v_n = 0 then '[{"code":"student_not_found"}]'::jsonb
                         when v_n > 1 then jsonb_build_array(jsonb_build_object('code', 'multiple_matches', 'candidates', v_matches))
                         else '[]'::jsonb end
                 || case when v_n = 1 then jsonb_build_array(jsonb_build_object('code', 'matched', 'candidates', v_matches)) else '[]'::jsonb end
    where id = r.id;
  end loop;

  update public.import_batches set status = 'validated',
    totals = (select jsonb_object_agg(status, n) from (select status, count(*) n from public.import_rows where batch_id = p_batch_id group by status) t)
  where id = p_batch_id;
  return (select totals from public.import_batches where id = p_batch_id);
end $$;

create or replace function public.history_import_commit(p_batch_id uuid, p_approve_now boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  b public.import_batches;
  r record;
  n jsonb;
  v_student uuid;
  v_school uuid;
  v_approve boolean := p_approve_now and public.is_center_staff();  -- R6: nhà trường luôn chờ duyệt
  v_source text := case when public.is_center_staff() then 'import' else 'school_entry' end;
  v_level_rec uuid;
  v_level int;
  c_courses int := 0; c_levels int := 0; c_created int := 0; c_skipped int := 0; c_errors int := 0;
begin
  select * into b from public.import_batches where id = p_batch_id for update;
  if b.id is null or b.type <> 'course_history' then raise exception 'batch_not_found' using errcode = 'P0002'; end if;
  if b.created_by <> auth.uid() and not public.is_center_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if b.status <> 'validated' then raise exception 'batch_closed' using errcode = '22023'; end if;

  for r in select * from public.import_rows where batch_id = p_batch_id order by row_number loop
    n := r.normalized;
    if r.status = 'error' then c_errors := c_errors + 1; continue; end if;
    if r.decision is null or r.decision = 'skip' then c_skipped := c_skipped + 1; continue; end if;
    v_school := nullif(n ->> 'school_id', '')::uuid;
    if not public.can_import_history(v_school) then c_errors := c_errors + 1; continue; end if;

    if r.decision = 'use_existing' and r.matched_student_id is not null then
      v_student := r.matched_student_id;
    else
      insert into public.students (full_name, date_of_birth, current_school_id, current_grade_class)
      values (n ->> 'full_name', nullif(n ->> 'date_of_birth', '')::date, v_school, nullif(n ->> 'grade_class', ''))
      returning id into v_student;
      c_created := c_created + 1;
    end if;

    v_level := nullif(n ->> 'level_number', '')::int;
    v_level_rec := null;
    if v_level is not null then
      v_level_rec := public.upsert_level_completion(v_student, v_level,
        case when v_source = 'import' then 'legacy_import' else 'school_entry' end,
        v_approve, public.academic_year_end(n ->> 'academic_year'), 'import:' || p_batch_id);
      c_levels := c_levels + 1;
    end if;

    insert into public.course_history (student_id, school_id, school_name_text, grade_class, academic_year_text,
                                       program_id, course_name, level_achieved_id, source, status, submitted_by,
                                       reviewed_by, reviewed_at, import_batch_id)
    values (v_student, v_school, case when v_school is null then nullif(n ->> 'school_text', '') end,
            nullif(n ->> 'grade_class', ''), n ->> 'academic_year', b.program_id, n ->> 'course_name',
            (select level_id from public.level_records where id = v_level_rec), v_source,
            case when v_approve then 'approved' else 'pending_review' end, auth.uid(),
            case when v_approve then auth.uid() end, case when v_approve then now() end, p_batch_id);
    c_courses := c_courses + 1;
    update public.import_rows set matched_student_id = v_student where id = r.id;
  end loop;

  update public.import_batches set status = 'committed', totals = jsonb_build_object(
    'courses', c_courses, 'levels', c_levels, 'created', c_created, 'skipped', c_skipped, 'errors', c_errors,
    'approved', v_approve)
  where id = p_batch_id;

  -- Duyệt luôn → báo phụ huynh các em có level mới
  if v_approve then
    perform public.notify_student_guardians(s, 'level_approved',
      'Hồ sơ golf của con đã được cập nhật', 'Your child''s golf record has been updated',
      'Level và các khoá đã học của con vừa được cập nhật.', 'Your child''s level and courses have just been updated.',
      '/app/children/' || s)
    from (select distinct matched_student_id s from public.import_rows where batch_id = p_batch_id and matched_student_id is not null) x;
  end if;

  return (select totals from public.import_batches where id = p_batch_id);
end $$;

-- Nhập tay một khoá cho một học sinh (F13 — quản lý trường; admin cũng dùng được)
create or replace function public.add_course_history(p_student_id uuid, p_data jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_school uuid := nullif(p_data ->> 'school_id', '')::uuid;
  v_center boolean := public.is_center_staff();
  v_approve boolean := v_center and coalesce((p_data ->> 'approve_now')::boolean, false);
  v_level int := nullif(p_data ->> 'level_number', '')::int;
  v_rec uuid;
  v_id uuid;
begin
  if not (v_center or exists (select 1 from public.students s where s.id = p_student_id and s.current_school_id = any(public.my_school_ids()))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not v_center and (v_school is null or not (v_school = any(public.my_school_ids()))) then
    v_school := (select current_school_id from public.students where id = p_student_id);
  end if;
  if coalesce(btrim(p_data ->> 'course_name'), '') = '' or coalesce(p_data ->> 'academic_year', '') !~ '^\d{4}-\d{4}$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_level is not null then
    v_rec := public.upsert_level_completion(p_student_id, v_level, case when v_center then 'admin' else 'school_entry' end,
                                            v_approve, public.academic_year_end(p_data ->> 'academic_year'), 'manual');
  end if;
  insert into public.course_history (student_id, school_id, grade_class, academic_year_text, program_id, course_name,
                                     sessions_count, level_achieved_id, source, status, submitted_by, reviewed_by, reviewed_at)
  values (p_student_id, v_school, nullif(p_data ->> 'grade_class', ''), p_data ->> 'academic_year',
          coalesce(nullif(p_data ->> 'program_id', '')::uuid, (select id from public.programs where code = 'core20')),
          btrim(p_data ->> 'course_name'), nullif(p_data ->> 'sessions_count', '')::int,
          (select level_id from public.level_records where id = v_rec),
          case when v_center then 'admin' else 'school_entry' end,
          case when v_approve then 'approved' else 'pending_review' end, auth.uid(),
          case when v_approve then auth.uid() end, case when v_approve then now() end)
  returning id into v_id;
  return v_id;
end $$;

-------------------------------------------------------------------------------
-- Hàng chờ duyệt (F12): admin + HLV trưởng
-------------------------------------------------------------------------------
create or replace function public.review_queue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_center_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'course_history', coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
      select jsonb_build_object('id', ch.id, 'student_id', s.id, 'student_name', s.full_name, 'student_code', s.student_code,
        'date_of_birth', s.date_of_birth, 'school', coalesce(sc.short_name, sc.name, ch.school_name_text), 'grade_class', ch.grade_class,
        'academic_year', ch.academic_year_text, 'course_name', ch.course_name, 'sessions_count', ch.sessions_count,
        'level_number', l.number, 'source', ch.source, 'submitted_by', pr.full_name, 'created_at', ch.created_at) x
      from public.course_history ch join public.students s on s.id = ch.student_id
      left join public.schools sc on sc.id = ch.school_id left join public.levels l on l.id = ch.level_achieved_id
      left join public.profiles pr on pr.user_id = ch.submitted_by
      where ch.status = 'pending_review' and ch.deleted_at is null limit 500) q), '[]'),
    'level_records', coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
      select jsonb_build_object('id', lr.id, 'student_id', s.id, 'student_name', s.full_name, 'student_code', s.student_code,
        'school', coalesce(sc.short_name, sc.name), 'level_number', l.number, 'program', p.code, 'source', lr.source,
        'completed_at', lr.completed_at, 'proposed_by', pr.full_name, 'created_at', lr.created_at) x
      from public.level_records lr join public.students s on s.id = lr.student_id
      join public.levels l on l.id = lr.level_id join public.programs p on p.id = l.program_id
      left join public.schools sc on sc.id = s.current_school_id left join public.profiles pr on pr.user_id = lr.proposed_by
      where lr.approval_status = 'pending' limit 500) q), '[]'),
    'students', coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
      select jsonb_build_object('id', s.id, 'full_name', s.full_name, 'date_of_birth', s.date_of_birth, 'student_code', s.student_code,
        'school', coalesce(sc.short_name, sc.name), 'self_reported', s.self_reported, 'created_at', s.created_at,
        'candidates', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'student_code', c.student_code, 'full_name', c.full_name,
                         'date_of_birth', c.date_of_birth, 'school', coalesce(cs.short_name, cs.name))), '[]')
                       from public.students c left join public.schools cs on cs.id = c.current_school_id
                       where c.id <> s.id and c.deleted_at is null and c.merged_into_student_id is null
                         and c.verification_status = 'verified' and c.full_name_normalized = s.full_name_normalized)) x
      from public.students s left join public.schools sc on sc.id = s.current_school_id
      where s.verification_status = 'pending_review' and s.deleted_at is null and s.merged_into_student_id is null limit 200) q), '[]'),
    'guardian_links', coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
      select jsonb_build_object('id', sg.id, 'student_id', s.id, 'student_name', s.full_name, 'student_code', s.student_code,
        'date_of_birth', s.date_of_birth, 'school', coalesce(sc.short_name, sc.name), 'guardian_name', g.full_name,
        'guardian_phone', g.phone, 'relationship', sg.relationship, 'self_reported', s.self_reported, 'created_at', sg.created_at) x
      from public.student_guardians sg join public.students s on s.id = sg.student_id join public.guardians g on g.id = sg.guardian_id
      left join public.schools sc on sc.id = s.current_school_id
      where sg.status = 'pending_confirmation' and sg.deleted_at is null limit 200) q), '[]'),
    'link_requests', coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
      select jsonb_build_object('id', lq.id, 'child_name', lq.submitted_child_name, 'dob', lq.submitted_dob,
        'school', lq.submitted_school, 'grade_class', lq.submitted_grade_class, 'requester', pr.full_name,
        'requester_phone', pr.phone, 'created_at', lq.created_at) x
      from public.link_requests lq left join public.profiles pr on pr.user_id = lq.requester_user_id
      where lq.status = 'pending' limit 200) q), '[]'),
    'support_requests', coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
      select jsonb_build_object('id', r.id, 'type', r.type, 'body', r.body, 'student_id', s.id, 'student_name', s.full_name,
        'student_code', s.student_code, 'requester', pr.full_name, 'requester_phone', pr.phone, 'created_at', r.created_at) x
      from public.support_requests r left join public.students s on s.id = r.student_id
      left join public.profiles pr on pr.user_id = r.requester_user_id
      where r.status = 'pending' limit 200) q), '[]')
  );
end $$;

-- Duyệt / từ chối hàng loạt (F12). Từ chối bắt buộc lý do.
create or replace function public.review_items(p_kind text, p_ids uuid[], p_action text, p_reason text default null)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
  v_count int := 0;
  v_student uuid;
  v_ok boolean := p_action = 'approve';
  v_row record;
  v_new uuid;
  v_hit boolean;
begin
  if not public.is_center_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if not v_ok and coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  perform set_config('app.audit_reason', coalesce(btrim(p_reason), ''), true);

  foreach v_id in array p_ids loop
    if p_kind = 'course_history' then
      update public.course_history set status = case when v_ok then 'approved' else 'rejected' end,
        reviewed_by = auth.uid(), reviewed_at = now(), rejected_reason = case when v_ok then null else p_reason end
      where id = v_id and status = 'pending_review' returning student_id into v_student;
      v_hit := found;
      if v_hit and v_ok then
        -- Khoá có level đạt → duyệt luôn level đó (cùng một quyết định)
        update public.level_records lr set approval_status = 'approved', approved_by = auth.uid(), approved_at = now()
        from public.course_history ch
        where ch.id = v_id and lr.student_id = ch.student_id and lr.level_id = ch.level_achieved_id and lr.approval_status = 'pending';
        perform public.notify_student_guardians(v_student, 'history_approved',
          'Có khoá học mới trong hồ sơ của con', 'A new course was added to your child''s record',
          null, null, '/app/children/' || v_student);
      end if;

    elsif p_kind = 'level_record' then
      update public.level_records set approval_status = case when v_ok then 'approved' else 'rejected' end,
        approved_by = auth.uid(), approved_at = now(), rejected_reason = case when v_ok then null else p_reason end
      where id = v_id and approval_status = 'pending' returning student_id into v_student;
      v_hit := found;
      if v_hit and v_ok then
        perform public.notify_student_guardians(v_student, 'level_approved',
          'Con đã được xác nhận lên level mới', 'Your child''s new level has been confirmed',
          'Mở hồ sơ để xem lộ trình của con.', 'Open the profile to see your child''s pathway.', '/app/children/' || v_student);
      end if;

    elsif p_kind = 'student' then
      -- Học viên phụ huynh tự khai: xác nhận là học viên mới (từ chối → xoá mềm, gỡ sổ và liên kết)
      v_hit := true;
      if v_ok then
        update public.students set verification_status = 'verified' where id = v_id and verification_status = 'pending_review';
      else
        update public.passports set status = 'void', void_reason = 'Từ chối học viên tự khai: ' || p_reason
        where student_id = v_id and status in ('assigned', 'active');
        update public.student_guardians set deleted_at = now() where student_id = v_id and deleted_at is null;
        update public.students set deleted_at = now() where id = v_id and verification_status = 'pending_review';
      end if;

    elsif p_kind = 'guardian_link' then
      select sg.*, s.self_reported into v_row from public.student_guardians sg join public.students s on s.id = sg.student_id
      where sg.id = v_id and sg.status = 'pending_confirmation' and sg.deleted_at is null;
      if v_row.id is null then continue; end if;
      v_hit := true;
      if v_ok then
        update public.student_guardians set status = 'active' where id = v_id;
        perform public.notify_student_guardians(v_row.student_id, 'link_approved',
          'VN Centre đã xác nhận liên kết với con', 'VN Centre confirmed the link to your child',
          'Bạn đã xem được đầy đủ hồ sơ golf của con.', 'You can now see your child''s full golf record.', '/app/children/' || v_row.student_id);
      else
        -- F2 luồng B: từ chối → gỡ liên kết, sổ chuyển sang học viên mới chờ xác minh (thông tin phụ huynh tự khai)
        insert into public.students (full_name, date_of_birth, current_school_id, current_grade_class, verification_status, self_reported)
        select coalesce(v_row.self_reported ->> 'full_name', 'Học viên tự khai'), nullif(v_row.self_reported ->> 'date_of_birth', '')::date,
               nullif(v_row.self_reported ->> 'school_id', '')::uuid, nullif(v_row.self_reported ->> 'grade_class', ''),
               'pending_review', v_row.self_reported
        returning id into v_new;
        update public.passports set student_id = v_new
        where student_id = v_row.student_id and passport_code = v_row.self_reported ->> 'passport_code' and status = 'active';
        update public.student_guardians set deleted_at = now() where id = v_id;
        insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
        values (v_new, v_row.guardian_id, v_row.relationship, true, true, 'passport', 'active', now());
        update public.students set self_reported = null where id = v_row.student_id;
      end if;

    elsif p_kind = 'link_request' then
      update public.link_requests set status = case when v_ok then 'approved' else 'rejected' end,
        reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = case when v_ok then null else p_reason end
      where id = v_id and status = 'pending';
      v_hit := found;

    elsif p_kind = 'support_request' then
      update public.support_requests set status = case when v_ok then 'resolved' else 'rejected' end,
        handled_by = auth.uid(), handled_at = now(), resolution_note = p_reason
      where id = v_id and status = 'pending';
      v_hit := found;
    else
      raise exception 'invalid_kind' using errcode = '22023';
    end if;
    if v_hit then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;

-- Ghép học viên tự khai vào học viên có sẵn (hàng chờ — F2 luồng B): chuyển sổ, người giám hộ, đồng ý.
-- Gộp đầy đủ hai hồ sơ bất kỳ (có hoàn tác) làm ở Bước 14.
create or replace function public.absorb_pending_student(p_pending_id uuid, p_target_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_center_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.students where id = p_pending_id and verification_status = 'pending_review' and deleted_at is null) then
    raise exception 'not_pending' using errcode = '22023';
  end if;
  if exists (select 1 from public.passports where student_id = p_target_id and status = 'active')
     and exists (select 1 from public.passports where student_id = p_pending_id and status = 'active') then
    -- Học viên có sẵn đã có sổ active: sổ tự khai chuyển thành sổ cấp trước để giữ R2
    update public.passports set status = 'retired' where student_id = p_pending_id and status = 'active';
  end if;
  update public.passports set student_id = p_target_id where student_id = p_pending_id;
  update public.student_guardians sg set student_id = p_target_id, status = 'active'
  where sg.student_id = p_pending_id and sg.deleted_at is null
    and not exists (select 1 from public.student_guardians x where x.student_id = p_target_id and x.guardian_id = sg.guardian_id and x.deleted_at is null);
  update public.student_guardians set deleted_at = now() where student_id = p_pending_id and deleted_at is null;
  update public.consents set student_id = p_target_id where student_id = p_pending_id;
  update public.students set activated_at = (select min(x) from unnest(array[
      (select activated_at from public.students where id = p_target_id),
      (select activated_at from public.students where id = p_pending_id)]) x)
  where id = p_target_id and activated_at is null;
  update public.students set merged_into_student_id = p_target_id, deleted_at = now() where id = p_pending_id;
  perform public.notify_student_guardians(p_target_id, 'link_approved',
    'VN Centre đã xác nhận hồ sơ của con', 'VN Centre confirmed your child''s record',
    'Sổ Golf Passport đã được nối với hồ sơ chính thức của con.', 'The Golf Passport is now linked to your child''s official record.',
    '/app/children/' || p_target_id);
end $$;

-- Admin sửa level trực tiếp (F12): bắt buộc lý do, ghi nhật ký
create or replace function public.admin_set_level(p_student_id uuid, p_level_number int, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_core uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  select id into v_core from public.programs where code = 'core20';
  if p_level_number < 1 or p_level_number > (select max(number) from public.levels where program_id = v_core) then
    raise exception 'invalid_level' using errcode = '22023';
  end if;
  perform set_config('app.audit_reason', btrim(p_reason), true);
  -- Bỏ các level đã duyệt từ level mới trở lên
  update public.level_records lr set approval_status = 'rejected', rejected_reason = 'Admin sửa level: ' || btrim(p_reason)
  from public.levels l
  where lr.level_id = l.id and l.program_id = v_core and lr.student_id = p_student_id
    and l.number >= p_level_number and lr.approval_status <> 'rejected';
  -- Đảm bảo đã hoàn thành level ngay trước (level hiện tại = cao nhất hoàn thành + 1, R5)
  if p_level_number > 1 then
    perform public.upsert_level_completion(p_student_id, p_level_number - 1, 'admin', true, current_date, 'Admin: ' || btrim(p_reason));
  end if;
  perform public.recompute_student_level(p_student_id);
end $$;

-------------------------------------------------------------------------------
-- Cổng quản lý trường (F13)
-------------------------------------------------------------------------------
create or replace function public.school_overview(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_center_staff() or p_school_id = any(public.my_school_ids())) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'students', (select count(*) from public.students where current_school_id = p_school_id and deleted_at is null and merged_into_student_id is null),
    'activated', (select count(*) from public.students where current_school_id = p_school_id and deleted_at is null and merged_into_student_id is null and activated_at is not null),
    'levels', coalesce((select jsonb_agg(jsonb_build_object('level', n, 'count', c) order by n) from (
      select l.number n, count(*) c from public.students s join public.levels l on l.id = s.current_level_id
      where s.current_school_id = p_school_id and s.deleted_at is null and s.merged_into_student_id is null group by l.number) t), '[]'),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'students', cnt, 'activated', act) order by c.name) from (
      select c.id, c.name, count(e.*) filter (where e.status = 'active') cnt,
             count(e.*) filter (where e.status = 'active' and s.activated_at is not null) act
      from public.classes c left join public.enrollments e on e.class_id = c.id left join public.students s on s.id = e.student_id
      where c.school_id = p_school_id and c.deleted_at is null group by c.id, c.name) c), '[]'),
    'pending_history', (select count(*) from public.course_history ch join public.students s on s.id = ch.student_id
                        where s.current_school_id = p_school_id and ch.status = 'pending_review' and ch.deleted_at is null)
  );
end $$;

-- Danh sách học sinh của trường (không có liên hệ phụ huynh — F13, R8)
create or replace function public.school_students(p_school_id uuid, p_class_id uuid default null)
returns table (student_id uuid, student_code text, full_name text, date_of_birth date, grade_class text,
               class_names text, level_number int, activated boolean, pending_history int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_center_staff() or p_school_id = any(public.my_school_ids())) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select s.id, s.student_code, s.full_name, s.date_of_birth, s.current_grade_class,
         (select string_agg(c.name, ', ' order by c.name) from public.enrollments e join public.classes c on c.id = e.class_id
          where e.student_id = s.id and e.status = 'active' and c.deleted_at is null),
         l.number, s.activated_at is not null,
         (select count(*)::int from public.course_history ch where ch.student_id = s.id and ch.status = 'pending_review' and ch.deleted_at is null)
  from public.students s left join public.levels l on l.id = s.current_level_id
  where s.current_school_id = p_school_id and s.deleted_at is null and s.merged_into_student_id is null
    and (p_class_id is null or exists (select 1 from public.enrollments e where e.student_id = s.id and e.class_id = p_class_id and e.status = 'active'))
  order by s.full_name_normalized;
end $$;

-- Người tạo lô nhập tự ghi (quản lý trường cần để qua phân quyền)
alter table public.import_batches alter column created_by set default auth.uid();

-- Lớp của trường (bộ lọc trong cổng trường)
create policy school_manager_read on public.classes for select to authenticated
  using (deleted_at is null and school_id = any(public.my_school_ids()));

-- Quản lý trường tạo và theo dõi lô nhập lịch sử của trường mình
create policy school_manager_own on public.import_batches for all to authenticated
  using (created_by = auth.uid() and type = 'course_history' and school_id = any(public.my_school_ids()))
  with check (created_by = auth.uid() and type = 'course_history' and school_id = any(public.my_school_ids()));
create policy school_manager_own on public.import_rows for all to authenticated
  using (exists (select 1 from public.import_batches b where b.id = batch_id and b.created_by = auth.uid()
                 and b.school_id = any(public.my_school_ids())))
  with check (exists (select 1 from public.import_batches b where b.id = batch_id and b.created_by = auth.uid()
                      and b.school_id = any(public.my_school_ids())));
-- HLV trưởng cũng nhập lịch sử (F12)
create policy head_coach_history on public.import_batches for insert to authenticated
  with check (public.is_head_coach() and type = 'course_history');
create policy head_coach_history_update on public.import_batches for update to authenticated
  using (public.is_head_coach() and type = 'course_history') with check (public.is_head_coach() and type = 'course_history');
create policy head_coach_history on public.import_rows for insert to authenticated
  with check (public.is_head_coach());
create policy head_coach_history_update on public.import_rows for update to authenticated
  using (public.is_head_coach()) with check (public.is_head_coach());

-------------------------------------------------------------------------------
-- Quyền gọi hàm
-------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.notify_student_guardians(uuid, text, text, text, text, text, text)',
    'public.upsert_level_completion(uuid, int, text, boolean, date, text)',
    'public.academic_year_end(text)', 'public.can_import_history(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.my_school_ids()', 'public.history_import_validate(uuid)', 'public.history_import_commit(uuid, boolean)',
    'public.add_course_history(uuid, jsonb)', 'public.review_queue()', 'public.review_items(text, uuid[], text, text)',
    'public.absorb_pending_student(uuid, uuid)', 'public.admin_set_level(uuid, int, text)',
    'public.school_overview(uuid)', 'public.school_students(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
