-- Bước 11 · Tự tìm con (F5), người giám hộ thứ hai (F6), tài khoản học viên (F7).

-------------------------------------------------------------------------------
-- F5 · Tự tìm và yêu cầu liên kết con
-------------------------------------------------------------------------------
insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('link_request.max_pending_per_account', '5', 'Số yêu cầu nối con đang chờ tối đa mỗi tài khoản', 'Max pending child-link requests per account', false)
on conflict do nothing;

alter table public.link_requests
  add column if not exists requester_guardian_id uuid references public.guardians(id),
  add column if not exists payload jsonb;          -- quan hệ + đồng ý phụ huynh đã chọn (dùng khi duyệt)

create or replace function public.ensure_my_guardian()
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; p record;
begin
  v_id := public.my_guardian_id();
  if v_id is null then
    select full_name, phone, email into p from public.profiles where user_id = auth.uid();
    insert into public.guardians (user_id, full_name, phone, email) values (auth.uid(), p.full_name, p.phone, p.email) returning id into v_id;
  end if;
  return v_id;
end $$;

-- Nối con bằng mã lớp; không có mã / không khớp → yêu cầu chờ duyệt. Không bao giờ trả danh sách (R3).
-- p_data: { child_name, dob, school, grade_class, class_code?, relationship, consents }
create or replace function public.find_child_request(p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := nullif(public.normalize_code(p_data ->> 'class_code'), '');
  v_name text := btrim(coalesce(p_data ->> 'child_name', ''));
  v_dob date;
  v_class uuid;
  v_fails int;
  v_max int := public.setting_int('class_code.max_failures_per_day', 5);
  v_matches uuid[];
  v_cons jsonb := coalesce(p_data -> 'consents', '{}');
  v_rel text := nullif(p_data ->> 'relationship', '');
  v_guardian uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'child_name_required' using errcode = '22023'; end if;
  if coalesce((v_cons ->> 'terms')::boolean, false) is not true or coalesce((v_cons ->> 'privacy')::boolean, false) is not true then
    raise exception 'consent_required' using errcode = '22023';
  end if;
  if v_rel is null or v_rel not in ('father', 'mother', 'guardian', 'other') then
    raise exception 'relationship_required' using errcode = '22023';
  end if;
  begin
    v_dob := nullif(p_data ->> 'dob', '')::date;
  exception when others then raise exception 'invalid_dob' using errcode = '22023';
  end;
  if (select count(*) from public.link_requests where requester_user_id = auth.uid() and status = 'pending')
     >= public.setting_int('link_request.max_pending_per_account', 5) then
    raise exception 'too_many_requests' using errcode = '22023';
  end if;
  v_guardian := public.ensure_my_guardian();

  if v_code is not null then
    select count(*) into v_fails from public.code_attempts
    where kind = 'class_code' and user_id = auth.uid() and not success and created_at > now() - interval '1 day';
    if v_fails >= v_max then return jsonb_build_object('result', 'locked'); end if;
    select id into v_class from public.classes where class_join_code = v_code and deleted_at is null;
    insert into public.code_attempts (kind, code, ip, user_id, success) values ('class_code', left(v_code, 20), public.client_ip(), auth.uid(), v_class is not null);
    -- Trả kết quả (không raise) để lượt sai được ghi lại
    if v_class is null then
      return jsonb_build_object('result', 'wrong_code', 'remaining', v_max - v_fails - 1);
    end if;
    -- Đúng 1 học viên trong lớp khớp tên + ngày sinh (hoặc tên, khi học viên chưa có ngày sinh)
    select array_agg(s.id) into v_matches
    from public.enrollments e join public.students s on s.id = e.student_id
    where e.class_id = v_class and e.status = 'active' and s.deleted_at is null and s.merged_into_student_id is null
      and s.full_name_normalized = public.normalize_name(v_name)
      and (s.date_of_birth is null or s.date_of_birth = v_dob);
    if coalesce(array_length(v_matches, 1), 0) = 1 and not public.has_other_account_guardian(v_matches[1]) then
      perform public.finish_guardian_link(v_matches[1], jsonb_build_object('relationship', v_rel, 'consents', v_cons,
                                          'child', jsonb_build_object('date_of_birth', v_dob)), 'class_code', true);
      return jsonb_build_object('result', 'linked', 'student_id', v_matches[1]);
    end if;
  end if;

  -- Chờ admin (hoặc HLV lớp) duyệt
  insert into public.link_requests (requester_user_id, requester_guardian_id, student_id, class_id, submitted_child_name,
                                    submitted_dob, submitted_school, submitted_grade_class, method, payload)
  values (auth.uid(), v_guardian, case when coalesce(array_length(v_matches, 1), 0) = 1 then v_matches[1] end, v_class,
          v_name, v_dob, nullif(p_data ->> 'school', ''), nullif(p_data ->> 'grade_class', ''),
          case when v_class is not null then 'class_code' else 'manual_review' end,
          jsonb_build_object('relationship', v_rel, 'consents', v_cons));
  return jsonb_build_object('result', 'pending');
end $$;

-- Duyệt yêu cầu liên kết: admin/HLV trưởng (hoặc HLV của lớp trong yêu cầu) chọn đúng học viên
create or replace function public.approve_link_request(p_request_id uuid, p_student_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  r public.link_requests;
  v_versions jsonb;
  v_cons jsonb;
begin
  select * into r from public.link_requests where id = p_request_id and status = 'pending' for update;
  if r.id is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if not (public.is_center_staff() or (r.class_id is not null and public.is_class_staff(r.class_id)
          and exists (select 1 from public.enrollments e where e.class_id = r.class_id and e.student_id = p_student_id and e.status = 'active'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and deleted_at is null and merged_into_student_id is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_cons := coalesce(r.payload -> 'consents', '{}');
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (p_student_id, r.requester_guardian_id, r.payload ->> 'relationship',
          not exists (select 1 from public.student_guardians x join public.guardians g on g.id = x.guardian_id
                      where x.student_id = p_student_id and x.is_primary and x.deleted_at is null and g.user_id is not null),
          true, case when r.method = 'class_code' then 'class_code' else 'admin' end, 'active', now())
  on conflict (student_id, guardian_id) where deleted_at is null do update set status = 'active';
  update public.students set activated_at = now() where id = p_student_id and activated_at is null;
  select value into v_versions from public.app_settings where key = 'legal.versions';
  insert into public.consents (guardian_id, student_id, type, version, granted) values
    (r.requester_guardian_id, null, 'terms', coalesce(v_versions ->> 'terms', 'v0'), true),
    (r.requester_guardian_id, null, 'privacy', coalesce(v_versions ->> 'privacy', 'v0'), true),
    (r.requester_guardian_id, p_student_id, 'leaderboard_name', coalesce(v_versions ->> 'terms', 'v0'), coalesce((v_cons ->> 'leaderboard_name')::boolean, false));
  perform set_config('app.link_approve', 'on', true);
  update public.link_requests set status = 'approved', student_id = p_student_id, reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
  perform set_config('app.link_approve', '', true);
  insert into public.notifications (user_id, type, title_vi, title_en, body_vi, body_en, link, channels_sent)
  values (r.requester_user_id, 'link_request_result', 'VN Centre đã nối bạn với hồ sơ của con', 'VN Centre linked you to your child''s record',
          'Bạn đã xem được hồ sơ golf của con.', 'You can now see your child''s golf record.', '/app/children/' || p_student_id, '["in_app"]');
end $$;

-- Từ chối yêu cầu liên kết: báo phụ huynh (F5 bước 3)
create or replace function public.link_request_rejected_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'rejected' and old.status = 'pending' then
    insert into public.notifications (user_id, type, title_vi, title_en, body_vi, body_en, link, channels_sent)
    values (new.requester_user_id, 'link_request_result', 'Chưa nối được với hồ sơ của con', 'We could not link your child''s record',
            coalesce('Lý do: ' || new.reject_reason, null), coalesce('Reason: ' || new.reject_reason, null), '/app', '["in_app"]');
  end if;
  return new;
end $$;
create trigger link_request_rejected_notify after update on public.link_requests
  for each row execute function public.link_request_rejected_notify();

-- Duyệt phải đi qua approve_link_request (tạo liên kết thật); "duyệt hàng loạt" ở hàng chờ chỉ dùng để từ chối
create or replace function public.link_request_guard()
returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and old.status = 'pending' and coalesce(current_setting('app.link_approve', true), '') <> 'on' then
    raise exception 'link_request_needs_student' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger link_request_guard before update on public.link_requests
  for each row execute function public.link_request_guard();

-- Từ chối (admin, HLV trưởng hoặc HLV của lớp trong yêu cầu)
create or replace function public.reject_link_request(p_request_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare r public.link_requests;
begin
  select * into r from public.link_requests where id = p_request_id and status = 'pending';
  if r.id is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if not (public.is_center_staff() or (r.class_id is not null and public.is_class_staff(r.class_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.link_requests set status = 'rejected', reject_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
  where id = r.id;
end $$;

-- Học viên có thể là con trong yêu cầu (chỉ nhân viên thấy): cùng tên chuẩn hoá, hoặc cả lớp khi yêu cầu có mã lớp
create or replace function public.link_request_candidates(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.link_requests; v_staff boolean := public.is_center_staff();
begin
  select * into r from public.link_requests where id = p_request_id;
  if r.id is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if not (v_staff or (r.class_id is not null and public.is_class_staff(r.class_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'name_match')::boolean desc, x ->> 'full_name') from (
    select distinct on (s.id) jsonb_build_object('id', s.id, 'student_code', s.student_code, 'full_name', s.full_name,
      'date_of_birth', s.date_of_birth, 'school', coalesce(sc.short_name, sc.name), 'grade_class', s.current_grade_class,
      'name_match', s.full_name_normalized = public.normalize_name(r.submitted_child_name),
      'dob_match', s.date_of_birth = r.submitted_dob,
      'has_guardian', exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                              where sg.student_id = s.id and sg.deleted_at is null and g.user_id is not null)) x
    from public.students s left join public.schools sc on sc.id = s.current_school_id
    where s.deleted_at is null and s.merged_into_student_id is null
      and ((r.class_id is not null and exists (select 1 from public.enrollments e where e.class_id = r.class_id and e.student_id = s.id and e.status = 'active'))
           or (v_staff and s.full_name_normalized = public.normalize_name(r.submitted_child_name)))
    limit 200) q), '[]');
end $$;

-- Hàng chờ nhỏ của HLV: yêu cầu nối con của các lớp mình (F5; HLV không thấy SĐT phụ huynh — R8)
create or replace function public.coach_link_requests()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', lq.id, 'child_name', lq.submitted_child_name, 'dob', lq.submitted_dob,
    'school', lq.submitted_school, 'grade_class', lq.submitted_grade_class, 'class_id', c.id, 'class_name', c.name,
    'requester', pr.full_name, 'created_at', lq.created_at) order by lq.created_at), '[]')
  from public.link_requests lq join public.classes c on c.id = lq.class_id
  left join public.profiles pr on pr.user_id = lq.requester_user_id
  where lq.status = 'pending' and public.is_class_staff(c.id)
$$;

-- Phụ huynh xem các yêu cầu của mình (trạng thái)
create policy own_read on public.link_requests for select to authenticated using (requester_user_id = auth.uid());

-------------------------------------------------------------------------------
-- F6 · Quản lý người giám hộ
-------------------------------------------------------------------------------
create or replace function public.set_guardian_can_manage(p_link_id uuid, p_value boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_student uuid;
begin
  select student_id into v_student from public.student_guardians where id = p_link_id and deleted_at is null;
  if v_student is null or not public.can_manage_student(v_student) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.student_guardians set can_manage = p_value where id = p_link_id;
end $$;

-- Gỡ người giám hộ; không gỡ người giám hộ chính cuối cùng (F6 bước 3)
create or replace function public.remove_guardian_link(p_link_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare l record;
begin
  select sg.*, g.user_id into l from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where sg.id = p_link_id and sg.deleted_at is null;
  if l.id is null or not public.can_manage_student(l.student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if l.is_primary and not exists (
      select 1 from public.student_guardians x join public.guardians g on g.id = x.guardian_id
      where x.student_id = l.student_id and x.id <> l.id and x.is_primary and x.status = 'active'
        and x.deleted_at is null and g.user_id is not null) then
    raise exception 'last_primary' using errcode = '22023';
  end if;
  update public.student_guardians set deleted_at = now() where id = p_link_id;
end $$;

-------------------------------------------------------------------------------
-- F7 · Tài khoản học viên
-------------------------------------------------------------------------------
create policy own_read on public.student_accounts for select to authenticated using (user_id = auth.uid());

-- R14: tuổi (theo ngày sinh) ≥ student_account.min_age; chặn ở CSDL cho mọi đường tạo
create or replace function public.student_account_age_ok(p_student_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when s.date_of_birth is null then 'dob_required'
              when extract(year from age(current_date, s.date_of_birth)) < public.setting_int('student_account.min_age', 8) then 'too_young'
              else 'ok' end
  from public.students s where s.id = p_student_id
$$;

create or replace function public.student_account_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text := public.student_account_age_ok(new.student_id);
begin
  if v is distinct from 'ok' then raise exception '%', coalesce(v, 'not_found') using errcode = '22023'; end if;
  return new;
end $$;
create trigger student_account_before_insert before insert on public.student_accounts
  for each row execute function public.student_account_before_insert();

-- Kiểm tra trước khi Edge Function tạo tài khoản (chạy với quyền phụ huynh gọi)
create or replace function public.student_account_check(p_student_id uuid, p_username text)
returns void language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if not public.can_manage_student(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  v := public.student_account_age_ok(p_student_id);
  if v <> 'ok' then raise exception '%', v using errcode = '22023'; end if;
  if exists (select 1 from public.student_accounts where student_id = p_student_id) then
    raise exception 'account_exists' using errcode = '22023';
  end if;
  if p_username is null or p_username !~ '^[a-z0-9._]{3,32}$' then raise exception 'invalid_username' using errcode = '22023'; end if;
  if exists (select 1 from public.student_accounts where username = p_username) then
    raise exception 'username_taken' using errcode = '22023';
  end if;
end $$;

create or replace function public.student_account_info(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record; s record;
begin
  if not public.is_guardian_of(p_student_id, false) then raise exception 'forbidden' using errcode = '42501'; end if;
  select username, is_active, locked_until into a from public.student_accounts where student_id = p_student_id;
  select date_of_birth into s from public.students where id = p_student_id;
  return jsonb_build_object(
    'exists', a.username is not null, 'username', a.username, 'is_active', a.is_active,
    'locked_until', case when a.locked_until > now() then a.locked_until end,
    'date_of_birth', s.date_of_birth,
    'age', case when s.date_of_birth is not null then extract(year from age(current_date, s.date_of_birth))::int end,
    'min_age', public.setting_int('student_account.min_age', 8),
    'can_manage', public.can_manage_student(p_student_id));
end $$;

-------------------------------------------------------------------------------
-- Hồ sơ: thêm link_id cho người giám hộ (để quản lý) và người xem là chính học viên (F7: chỉ xem)
-------------------------------------------------------------------------------
create or replace function public.student_profile(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_viewer text;
  v_link record;
  s record;
  v_level jsonb;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;

  select sg.status, sg.can_manage into v_link
  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where sg.student_id = p_student_id and g.user_id = auth.uid() and sg.deleted_at is null and g.deleted_at is null
  order by (sg.status = 'active') desc limit 1;

  if v_link.status = 'active' then v_viewer := 'guardian';
  elsif exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active) then v_viewer := 'student';
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

  if v_viewer = 'pending' then
    return jsonb_build_object('viewer', 'pending', 'student', jsonb_build_object('id', s.id, 'full_name', s.full_name), 'level', v_level);
  end if;

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
    'completed_levels', coalesce((
      select jsonb_agg(jsonb_build_object('program', p.code, 'number', l.number, 'completed_at', lr.completed_at) order by p.code, l.number)
      from public.level_records lr join public.levels l on l.id = lr.level_id join public.programs p on p.id = l.program_id
      where lr.student_id = s.id and lr.status = 'completed' and lr.approval_status = 'approved'), '[]'),
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
        'expires_at', ps.expires_at, 'activated_at', ps.activated_at, 'tier_vi', t.name_vi, 'tier_en', t.name_en)
        order by (ps.status = 'active') desc, ps.issued_at desc nulls last)
      from public.passports ps join public.passport_tiers t on t.id = ps.tier_id
      where ps.student_id = s.id and ps.status <> 'unassigned'), '[]'),
    'certificates', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title_vi', c.title_vi, 'title_en', c.title_en,
                                          'type', c.type, 'issued_at', c.issued_at, 'verify_code', c.verify_code)
                       order by c.issued_at desc)
      from public.certificates c where c.student_id = s.id and c.status = 'valid'), '[]'),
    -- Người giám hộ: chỉ phụ huynh thấy (tên, quan hệ; không SĐT/email — R8)
    'guardians', case when v_viewer = 'guardian' then coalesce((
      select jsonb_agg(jsonb_build_object('link_id', sg.id, 'name', g.full_name, 'relationship', sg.relationship, 'is_primary', sg.is_primary,
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

-- Học viên đăng nhập: xem hồ sơ của mình
create or replace function public.my_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select student_id from public.student_accounts where user_id = auth.uid() and is_active limit 1
$$;

do $$
declare f text;
begin
  revoke execute on function public.ensure_my_guardian() from public, anon, authenticated;
  revoke execute on function public.student_account_age_ok(uuid) from public, anon, authenticated;
  foreach f in array array[
    'public.find_child_request(jsonb)', 'public.approve_link_request(uuid, uuid)',
    'public.reject_link_request(uuid, text)', 'public.link_request_candidates(uuid)', 'public.coach_link_requests()',
    'public.student_account_check(uuid, text)',
    'public.set_guardian_can_manage(uuid, boolean)', 'public.remove_guardian_link(uuid)',
    'public.student_account_info(uuid)', 'public.my_student_id()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
