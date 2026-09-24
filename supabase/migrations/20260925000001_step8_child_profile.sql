-- Bước 8 · Hồ sơ học viên (F8 cho phụ huynh, F14 cho HLV), ảnh riêng tư, yêu cầu cập nhật lịch sử.
-- Phụ huynh / HLV không đọc thẳng bảng students; hồ sơ trả qua student_profile() với đúng phần được phép:
--   - Phụ huynh liên kết chờ duyệt: chỉ tên + level (D32)
--   - Nhân viên: không có liên hệ phụ huynh (R8)
--   - Lịch sử khoá học chờ duyệt không hiện (R7)

-------------------------------------------------------------------------------
-- Hồ sơ học viên
-------------------------------------------------------------------------------
create or replace function public.student_profile(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_viewer text;
  v_link record;
  s record;
  v_level jsonb;
  v_core uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;

  select sg.status, sg.can_manage, sg.relationship into v_link
  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where sg.student_id = p_student_id and g.user_id = auth.uid() and sg.deleted_at is null and g.deleted_at is null
  order by (sg.status = 'active') desc limit 1;

  if v_link.status = 'active' then v_viewer := 'guardian';
  elsif public.can_staff_view_student(p_student_id) then v_viewer := 'staff';
  elsif v_link.status = 'pending_confirmation' then v_viewer := 'pending';
  else raise exception 'forbidden' using errcode = '42501';
  end if;

  select st.*, coalesce(sc.short_name, sc.name) as school_name into s
  from public.students st left join public.schools sc on sc.id = st.current_school_id
  where st.id = p_student_id and st.deleted_at is null;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  select jsonb_build_object(
    'id', l.id, 'number', l.number, 'name_vi', l.name_vi, 'name_en', l.name_en,
    'group_name_vi', l.group_name_vi, 'group_name_en', l.group_name_en,
    'stage', case when st.id is null then null else jsonb_build_object('number', st.number, 'name_vi', st.name_vi, 'name_en', st.name_en, 'color', st.color) end,
    'tier', case when t.id is null then null else jsonb_build_object('code', t.code, 'name_vi', t.name_vi, 'name_en', t.name_en) end)
  into v_level
  from public.levels l
  left join public.passport_stages st on st.id = l.passport_stage_id
  left join public.passport_tiers t on t.id = l.passport_tier_id
  where l.id = s.current_level_id;

  -- D32: chờ duyệt → chỉ tên + level
  if v_viewer = 'pending' then
    return jsonb_build_object('viewer', 'pending', 'student', jsonb_build_object('id', s.id, 'full_name', s.full_name), 'level', v_level);
  end if;

  select id into v_core from public.programs where code = 'core20';

  return jsonb_build_object(
    'viewer', v_viewer,
    'can_manage', v_viewer = 'guardian' and coalesce(v_link.can_manage, false),
    'student', jsonb_build_object(
      'id', s.id, 'full_name', s.full_name, 'student_code', s.student_code,
      'date_of_birth', s.date_of_birth, 'gender', s.gender, 'nationality', s.nationality,
      'school_name', s.school_name, 'grade_class', s.current_grade_class,
      'avatar_path', s.avatar_url, 'golf_goals', s.golf_goals, 'golf_goals_other', s.golf_goals_other,
      'verification_status', s.verification_status),
    'level', v_level,
    -- Level đã hoàn thành (đã duyệt) — tô dấu tích trên lộ trình
    'completed_levels', coalesce((
      select jsonb_agg(jsonb_build_object('program', p.code, 'number', l.number, 'completed_at', lr.completed_at) order by p.code, l.number)
      from public.level_records lr join public.levels l on l.id = lr.level_id join public.programs p on p.id = l.program_id
      where lr.student_id = s.id and lr.status = 'completed' and lr.approval_status = 'approved'), '[]'),
    -- R7: chỉ khoá học đã duyệt, mới nhất lên đầu
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ch.id, 'academic_year', ch.academic_year_text, 'school', coalesce(sc.short_name, sc.name, ch.school_name_text),
        'grade_class', ch.grade_class, 'course_name', ch.course_name, 'sessions_count', ch.sessions_count,
        'program_code', p.code, 'program_vi', p.name_vi, 'program_en', p.name_en,
        'level_number', l.number, 'level_program', lp.code)
        order by ch.academic_year_text desc nulls last, ch.created_at desc)
      from public.course_history ch
      left join public.schools sc on sc.id = ch.school_id
      left join public.programs p on p.id = ch.program_id
      left join public.levels l on l.id = ch.level_achieved_id
      left join public.programs lp on lp.id = l.program_id
      where ch.student_id = s.id and ch.status = 'approved' and ch.deleted_at is null), '[]'),
    'passports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ps.id, 'code', ps.passport_code, 'status', ps.status, 'issued_at', ps.issued_at,
        'expires_at', ps.expires_at, 'activated_at', ps.activated_at,
        'tier_vi', t.name_vi, 'tier_en', t.name_en)
        order by (ps.status = 'active') desc, ps.issued_at desc nulls last)
      from public.passports ps join public.passport_tiers t on t.id = ps.tier_id
      where ps.student_id = s.id and ps.status <> 'unassigned'), '[]'),
    'certificates', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title_vi', c.title_vi, 'title_en', c.title_en,
                                          'type', c.type, 'issued_at', c.issued_at, 'verify_code', c.verify_code)
                       order by c.issued_at desc)
      from public.certificates c where c.student_id = s.id and c.status = 'valid'), '[]'),
    -- Người giám hộ: phụ huynh thấy tên + quan hệ; không trả SĐT/email (kể cả cho nhân viên — R8)
    'guardians', case when v_viewer = 'guardian' then coalesce((
      select jsonb_agg(jsonb_build_object('name', g.full_name, 'relationship', sg.relationship, 'is_primary', sg.is_primary,
                                          'can_manage', sg.can_manage, 'has_account', g.user_id is not null,
                                          'is_me', g.user_id = auth.uid(), 'status', sg.status)
                       order by sg.is_primary desc, sg.linked_at)
      from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
      where sg.student_id = s.id and sg.deleted_at is null and g.deleted_at is null), '[]') end,
    'has_history', exists (select 1 from public.course_history ch where ch.student_id = s.id and ch.status = 'approved' and ch.deleted_at is null)
                   or exists (select 1 from public.level_records lr where lr.student_id = s.id and lr.approval_status = 'approved'),
    'history_request_pending', exists (select 1 from public.support_requests r where r.student_id = s.id and r.type = 'history_update' and r.status = 'pending')
  );
end $$;

-------------------------------------------------------------------------------
-- Phụ huynh (can_manage) sửa thông tin con: ngày sinh, giới tính, mục tiêu golf, ảnh (01 mục 13)
-------------------------------------------------------------------------------
create or replace function public.update_child_info(p_student_id uuid, p_data jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_goals text[];
begin
  if not exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                 where sg.student_id = p_student_id and g.user_id = auth.uid() and sg.status = 'active'
                   and sg.can_manage and sg.deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_data ? 'golf_goals' then
    select coalesce(array_agg(x), '{}') into v_goals from jsonb_array_elements_text(p_data -> 'golf_goals') x;
  end if;
  update public.students set
    date_of_birth = case when p_data ? 'date_of_birth' then nullif(p_data ->> 'date_of_birth', '')::date else date_of_birth end,
    gender = case when p_data ? 'gender' then nullif(p_data ->> 'gender', '') else gender end,
    golf_goals = coalesce(v_goals, golf_goals),
    golf_goals_other = case when p_data ? 'golf_goals_other' then nullif(p_data ->> 'golf_goals_other', '') else golf_goals_other end,
    avatar_url = case when p_data ? 'avatar_path' then nullif(p_data ->> 'avatar_path', '') else avatar_url end
  where id = p_student_id;
end $$;

-- "Con đã từng học golf? Báo cho Trung tâm" (F8) → hàng chờ admin
create or replace function public.request_history_update(p_student_id uuid, p_body text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_guardian_of(p_student_id, false) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'body_required' using errcode = '22023'; end if;
  insert into public.support_requests (type, student_id, requester_user_id, body)
  values ('history_update', p_student_id, auth.uid(), left(btrim(p_body), 2000));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.student_profile(uuid)', 'public.update_child_info(uuid, jsonb)', 'public.request_history_update(uuid, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Ảnh học viên: kho riêng tư, xem qua link có hạn (02 mục 6). Đường dẫn: {student_id}/{tên file}
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.storage_student_id(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create policy "student photos: xem" on storage.objects for select to authenticated
  using (bucket_id = 'student-photos' and (
    public.is_guardian_of(public.storage_student_id(name), false)
    or public.can_staff_view_student(public.storage_student_id(name))));

create policy "student photos: phụ huynh tải lên" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and exists (
    select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = public.storage_student_id(name) and g.user_id = auth.uid()
      and sg.status = 'active' and sg.can_manage and sg.deleted_at is null));

create policy "student photos: admin" on storage.objects for all to authenticated
  using (bucket_id = 'student-photos' and public.is_admin())
  with check (bucket_id = 'student-photos' and public.is_admin());
