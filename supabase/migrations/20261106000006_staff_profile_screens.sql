-- Module Hồ sơ nhân sự · chặng B: hàm đọc cho S2 (Hồ sơ của tôi), S3 (người phụ trách ghi nhận), S4 (hàng chờ admin)
-- và cách tính 4 ô số liệu theo mục 5 (tính lúc đọc, không lưu cột cứng). Chỉ thêm hàm.

-------------------------------------------------------------------------------
-- Mã định danh: mã Golf Passport của hồ sơ tự chơi gắn với tài khoản (11-mapping mục 3.1)
-------------------------------------------------------------------------------
create or replace function public.staff_identity(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('student_id', s.id, 'student_code', s.student_code, 'avatar_url', s.avatar_url,
    'passport_code', (select p.passport_code from public.passports p
                      where p.student_id = s.id and p.status in ('active', 'assigned', 'event_registered')
                      order by p.created_at desc limit 1))
  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id join public.students s on s.id = sg.student_id
  where g.user_id = p_user_id and sg.relationship = 'self' and sg.deleted_at is null and g.deleted_at is null
    and s.deleted_at is null and s.merged_into_student_id is null
  order by sg.created_at limit 1
$$;

-------------------------------------------------------------------------------
-- 4 ô số liệu theo cv_type (mục 5). value = null → không có nguồn dữ liệu → ẩn ô (S-R8).
-- Số buổi đứng lớp, lượt lên cấp thuộc bước 2: luôn null cho tới khi có sessions, attendance.
-------------------------------------------------------------------------------
create or replace function public.staff_stats(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_type text;
  v_first date;
  v_first_self boolean;
  v_self_years numeric;
  v_years numeric;
  v_students int;
  v_events int;
  v_hours numeric;
  v_roles int;
  v_certs int;
  v_projects int;
  v_participants numeric;
  v_schools numeric;
  t jsonb;
begin
  if not (public.is_admin() or p_user_id = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select cv_type into v_type from public.profiles where user_id = p_user_id;

  -- Năm kinh nghiệm: engagement sớm nhất (approved) đến nay + years của kinh nghiệm tự khai đã duyệt
  select e.started_on, e.source = 'self' into v_first, v_first_self from public.staff_engagements e
  where e.user_id = p_user_id and e.status = 'approved' and e.deleted_at is null and e.started_on is not null
  order by e.started_on, (e.source = 'self') limit 1;
  select sum(c.years) into v_self_years from public.staff_credentials c
  where c.user_id = p_user_id and c.type = 'prior_experience' and c.status = 'approved' and c.deleted_at is null and c.years is not null;
  if v_first is not null or v_self_years is not null then
    v_years := round(greatest(coalesce((current_date - v_first) / 365.25, 0), 0)::numeric + coalesce(v_self_years, 0), 1);
  end if;

  -- Học viên đã dạy (bước 1): học viên khác nhau trong enrollments của các lớp có tên mình ở class_staff
  if exists (select 1 from public.class_staff cs where cs.user_id = p_user_id
             and not exists (select 1 from public.events ev where ev.class_id = cs.class_id)) then
    select count(distinct en.student_id) into v_students
    from public.class_staff cs join public.enrollments en on en.class_id = cs.class_id
    join public.students s on s.id = en.student_id and s.deleted_at is null and s.merged_into_student_id is null
    where cs.user_id = p_user_id and not exists (select 1 from public.events ev where ev.class_id = cs.class_id);
  end if;

  select nullif(count(*), 0) into v_events from public.staff_engagements
  where user_id = p_user_id and kind = 'event' and status = 'approved' and deleted_at is null;
  select sum(hours) into v_hours from public.staff_engagements
  where user_id = p_user_id and status = 'approved' and deleted_at is null and hours is not null;
  select nullif(count(distinct lower(btrim(position_vi))), 0) into v_roles from public.staff_engagements
  where user_id = p_user_id and status = 'approved' and deleted_at is null and btrim(coalesce(position_vi, '')) <> '';
  select nullif(count(*), 0) into v_certs from public.certificates c
  where c.status = 'valid' and c.student_id = (public.staff_identity(p_user_id) ->> 'student_id')::uuid;
  select nullif(count(*), 0) into v_projects from public.staff_engagements
  where user_id = p_user_id and kind in ('event', 'project') and status = 'approved' and deleted_at is null;
  -- Lượt người tham dự: sự kiện trong app lấy số thẻ đã ghi tên, còn lại lấy scale.participants
  select sum(case when e.kind = 'event' then (select count(*) from public.event_participations ep where ep.event_id = e.event_id)
                  else nullif(e.scale ->> 'participants', '')::numeric end)
    into v_participants
  from public.staff_engagements e
  where e.user_id = p_user_id and e.kind in ('event', 'project') and e.status = 'approved' and e.deleted_at is null;
  select sum(coalesce(nullif(scale ->> 'schools', '')::numeric, 0) + coalesce(nullif(scale ->> 'partners', '')::numeric, 0))
    into v_schools
  from public.staff_engagements
  where user_id = p_user_id and status = 'approved' and deleted_at is null and (scale ? 'schools' or scale ? 'partners');
  if v_participants = 0 then v_participants := null; end if;
  if v_schools = 0 then v_schools := null; end if;

  t := case coalesce(v_type, 'volunteer')
    when 'coach' then jsonb_build_array(
      jsonb_build_object('key', 'years', 'value', v_years,
        'badge', case when v_self_years is not null or v_first_self then 'approved' else 'verified' end),
      jsonb_build_object('key', 'sessions', 'value', null, 'badge', 'verified'),
      jsonb_build_object('key', 'students', 'value', v_students, 'badge', 'verified'),
      jsonb_build_object('key', 'level_ups', 'value', null, 'badge', 'verified'))
    when 'organizer' then jsonb_build_array(
      jsonb_build_object('key', 'projects', 'value', v_projects, 'badge', 'verified'),
      jsonb_build_object('key', 'participants', 'value', v_participants, 'badge', 'verified'),
      jsonb_build_object('key', 'schools_partners', 'value', v_schools, 'badge', 'verified'),
      jsonb_build_object('key', 'years', 'value', v_years,
        'badge', case when v_self_years is not null or v_first_self then 'approved' else 'verified' end))
    else jsonb_build_array(
      jsonb_build_object('key', 'events', 'value', v_events, 'badge', 'verified'),
      jsonb_build_object('key', 'hours', 'value', v_hours, 'badge', 'verified'),
      jsonb_build_object('key', 'roles', 'value', v_roles, 'badge', 'verified'),
      jsonb_build_object('key', 'certificates', 'value', v_certs, 'badge', 'verified'))
    end;
  return jsonb_build_object('cv_type', v_type, 'tiles', t);
end $$;

-------------------------------------------------------------------------------
-- S2 · Hồ sơ của tôi (admin xem được hồ sơ của người khác). Có cả mục chờ duyệt, bị từ chối của chủ hồ sơ.
-------------------------------------------------------------------------------
create or replace function public.staff_my_profile(p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
  p public.profiles;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if v_user is null or not (public.is_admin() or v_user = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.profiles where user_id = v_user;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'profile', jsonb_build_object('user_id', p.user_id, 'full_name', p.full_name, 'avatar_url', p.avatar_url, 'email', p.email,
      'phone', p.phone, 'cv_type', p.cv_type, 'joined_vncentre_on', p.joined_vncentre_on, 'show_contact_on_cv', p.show_contact_on_cv),
    'identity', public.staff_identity(v_user),
    'roles', coalesce((select jsonb_agg(distinct r.role) from public.user_roles r where r.user_id = v_user and r.deleted_at is null), '[]'),
    'engagements', coalesce((select jsonb_agg(x order by x ->> 'started_on' desc nulls last, x ->> 'created_at' desc) from (
      select jsonb_build_object('id', e.id, 'kind', e.kind, 'event_id', e.event_id, 'class_id', e.class_id,
        'event_name_vi', ev.name_vi, 'event_name_en', ev.name_en,
        'class_name', cl.name, 'school_name', coalesce(sc.short_name, sc.name), 'academic_year', ay.name,
        'project_name_vi', e.project_name_vi, 'project_name_en', e.project_name_en,
        'position_vi', e.position_vi, 'position_en', e.position_en, 'staff_group', e.staff_group,
        'started_on', e.started_on, 'ended_on', e.ended_on, 'hours', e.hours, 'scale', e.scale,
        'outcome_vi', e.outcome_vi, 'outcome_en', e.outcome_en, 'source', e.source, 'status', e.status,
        'rejected_reason', e.rejected_reason, 'created_at', e.created_at,
        'badge', case when e.status = 'pending_review' then 'pending' when e.status = 'rejected' then 'rejected'
                      when e.source in ('system', 'manager') then 'verified' else 'approved' end,
        'confirmed_by_name', case when e.source in ('system', 'manager') then cp.full_name end,
        'skills', coalesce((select jsonb_agg(sr.skill_code order by sr.skill_code) from public.staff_skill_records sr
                            where sr.engagement_id = e.id), '[]')) x
      from public.staff_engagements e
      left join public.events ev on ev.id = e.event_id
      left join public.classes cl on cl.id = e.class_id
      left join public.schools sc on sc.id = cl.school_id
      left join public.academic_years ay on ay.id = cl.academic_year_id
      left join public.profiles cp on cp.user_id = e.confirmed_by
      where e.user_id = v_user and e.deleted_at is null) q), '[]'),
    'credentials', coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
      select jsonb_build_object('id', c.id, 'type', c.type, 'title_vi', c.title_vi, 'title_en', c.title_en, 'issuer', c.issuer,
        'issued_on', c.issued_on, 'expires_on', c.expires_on, 'years', c.years, 'file_path', c.file_path,
        'status', c.status, 'rejected_reason', c.rejected_reason, 'created_at', c.created_at,
        'expired', c.expires_on is not null and c.expires_on < v_today) x
      from public.staff_credentials c where c.user_id = v_user and c.deleted_at is null) q), '[]'),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('code', s.code, 'name_vi', s.name_vi, 'name_en', s.name_en, 'count', n.cnt)
                                         order by n.cnt desc, s.sort_order)
      from (select sr.skill_code, count(*) as cnt from public.staff_skill_records sr
            join public.staff_engagements e on e.id = sr.engagement_id
            where sr.user_id = v_user and e.status = 'approved' and e.deleted_at is null group by sr.skill_code) n
      join public.staff_skills s on s.code = n.skill_code), '[]'),
    'stats', public.staff_stats(v_user));
end $$;

-------------------------------------------------------------------------------
-- S3 · Danh sách nhân sự của một sự kiện hoặc một lớp mà mình phụ trách (S-R10)
-------------------------------------------------------------------------------
create or replace function public.staff_scope_list(p_event_id uuid default null, p_class_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if (p_event_id is null) = (p_class_id is null) then raise exception 'bad_scope' using errcode = '22023'; end if;
  if p_event_id is not null and not public.is_event_manager(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_class_id is not null and not public.is_class_manager(p_class_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'name', coalesce((select name_vi from public.events where id = p_event_id), (select name from public.classes where id = p_class_id)),
    'items', coalesce((select jsonb_agg(x order by x ->> 'full_name') from (
      select jsonb_build_object('id', e.id, 'user_id', e.user_id, 'full_name', coalesce(p.full_name, p.email),
        'cv_type', p.cv_type, 'staff_group', e.staff_group,
        'position_vi', e.position_vi, 'position_en', e.position_en, 'hours', e.hours, 'scale', e.scale,
        'outcome_vi', e.outcome_vi, 'outcome_en', e.outcome_en, 'confirmed_at', e.confirmed_at, 'confirmed_by_name', cp.full_name,
        'skills', coalesce((select jsonb_agg(sr.skill_code order by sr.skill_code) from public.staff_skill_records sr
                            where sr.engagement_id = e.id), '[]')) x
      from public.staff_engagements e
      join public.profiles p on p.user_id = e.user_id
      left join public.profiles cp on cp.user_id = e.confirmed_by
      where e.deleted_at is null and e.source in ('system', 'manager')
        and (e.event_id = p_event_id or e.class_id = p_class_id)
        and (public.is_admin() or e.user_id <> auth.uid())) q), '[]'));
end $$;

-- Những sự kiện, lớp mình được ghi nhận (không tính quyền admin: admin làm ở trang quản trị)
create or replace function public.staff_my_scopes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'date' desc nulls last) from (
    select jsonb_build_object('kind', 'event', 'id', e.id, 'name', e.name_vi, 'date', e.event_date) x
    from public.event_managers m join public.events e on e.id = m.event_id
    where m.user_id = auth.uid() and m.deleted_at is null
    union all
    select jsonb_build_object('kind', 'class', 'id', c.id, 'name', c.name, 'date', c.start_date)
    from public.classes c
    where c.deleted_at is null and not exists (select 1 from public.events ev where ev.class_id = c.id)
      and (exists (select 1 from public.class_staff cs where cs.class_id = c.id and cs.user_id = auth.uid() and cs.role = 'head_coach')
           or (public.is_head_coach() and exists (select 1 from public.staff_engagements e
                                                  where e.class_id = c.id and e.deleted_at is null and e.user_id <> auth.uid())))
    limit 300) q), '[]');
end $$;

-- Admin: người phụ trách của một sự kiện
create or replace function public.event_manager_list(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'full_name', p.full_name, 'email', p.email) order by p.full_name)
    from public.event_managers m join public.profiles p on p.user_id = m.user_id
    where m.event_id = p_event_id and m.deleted_at is null), '[]');
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.staff_stats(uuid)', 'public.staff_my_profile(uuid)', 'public.staff_scope_list(uuid, uuid)',
    'public.staff_my_scopes()', 'public.event_manager_list(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke execute on function public.staff_identity(uuid) from public, anon, authenticated;
end $$;
