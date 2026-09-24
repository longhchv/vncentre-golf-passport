-- Bước 7 · Kích hoạt bằng mã sổ Passport (F2, luồng A và B).
-- Quyết định: D30 (đăng nhập/OTP trước), D31 (không tự nối khi đã có người giám hộ khác),
--             D32 (chờ duyệt chỉ thấy tên + level), D33 (SĐT khớp danh sách → tin cậy).

-------------------------------------------------------------------------------
-- Dữ liệu
-------------------------------------------------------------------------------
-- Thông tin phụ huynh tự khai khi kích hoạt sổ chưa gán (luồng B) để admin xét trong hàng chờ
alter table public.students add column if not exists self_reported jsonb;

-- Ghi mọi lần nhập mã/xác nhận để chống dò mã (F2, R13)
create table public.code_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  kind text not null check (kind in ('passport_lookup', 'identity', 'claim_lookup', 'class_code')),
  code text,
  ip text,
  user_id uuid references public.profiles(user_id) on delete set null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index code_attempts_ip_idx on public.code_attempts (kind, ip, created_at desc);
create index code_attempts_code_idx on public.code_attempts (kind, code, created_at desc);
alter table public.code_attempts enable row level security;
create policy admin_all on public.code_attempts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-------------------------------------------------------------------------------
-- Hàm tiện ích
-------------------------------------------------------------------------------
create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default)
$$;

-- IP người gọi (PostgREST chuyển header vào request.headers)
create or replace function public.client_ip()
returns text language sql stable as $$
  select nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '')
$$;

-- "Nguyễn Đức An" → "Nguyễn Đ. A." (trang công khai chỉ hiện tên che bớt, 01 mục 13)
create or replace function public.mask_name(p_name text)
returns text language sql immutable as $$
  select case
    when p_name is null or btrim(p_name) = '' then null
    else (select string_agg(case when i = 1 then w else left(w, 1) || '.' end, ' ' order by i)
          from unnest(regexp_split_to_array(btrim(p_name), '\s+')) with ordinality as t(w, i))
  end
$$;

create or replace function public.my_guardian_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.guardians where user_id = auth.uid() and deleted_at is null limit 1
$$;

-- Người đang đăng nhập là người giám hộ của học viên (p_include_pending: tính cả liên kết chờ duyệt)
create or replace function public.is_guardian_of(p_student_id uuid, p_include_pending boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student_id and g.user_id = auth.uid() and sg.deleted_at is null and g.deleted_at is null
      and (sg.status = 'active' or (p_include_pending and sg.status = 'pending_confirmation')))
$$;

-- Nhân viên được xem học viên: admin/HLV trưởng, nhân sự lớp đang học, quản lý trường (01 mục 13)
create or replace function public.can_staff_view_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_center_staff()
      or exists (select 1 from public.enrollments e where e.student_id = p_student_id and e.status = 'active'
                 and public.is_class_staff(e.class_id))
      or exists (select 1 from public.students s where s.id = p_student_id and public.is_school_manager_of(s.current_school_id))
      or exists (select 1 from public.enrollments e join public.classes c on c.id = e.class_id
                 where e.student_id = p_student_id and public.is_school_manager_of(c.school_id))
$$;

-- Người gọi được tin cậy với học viên (D30, D33): đã là người giám hộ, hoặc SĐT đã xác minh trùng SĐT
-- người giám hộ có sẵn trong danh sách trường của học viên.
create or replace function public.is_trusted_for_student(p_student_id uuid)
returns boolean language plpgsql stable security definer set search_path = public, auth as $$
declare v_phone text;
begin
  if public.is_guardian_of(p_student_id, true) then return true; end if;
  select '+' || phone into v_phone from auth.users where id = auth.uid() and phone_confirmed_at is not null;
  if v_phone is null then return false; end if;
  return exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                 where sg.student_id = p_student_id and sg.deleted_at is null and g.deleted_at is null and g.phone = v_phone);
end $$;

-- D31: học viên đã có người giám hộ khác (có tài khoản) đang liên kết
create or replace function public.has_other_account_guardian(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                 where sg.student_id = p_student_id and sg.deleted_at is null and g.deleted_at is null
                   and sg.status = 'active' and g.user_id is not null and g.user_id <> auth.uid())
$$;

create or replace function public.identity_locked(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) >= public.setting_int('activation.max_identity_failures', 5)
  from public.code_attempts
  where kind = 'identity' and code = p_code and not success
    and created_at > now() - make_interval(hours => public.setting_int('activation.identity_lock_hours', 24))
$$;

-------------------------------------------------------------------------------
-- Tra cứu mã sổ (trang /p/{mã}) — gọi được khi chưa đăng nhập
-------------------------------------------------------------------------------
create or replace function public.passport_lookup(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := public.normalize_code(p_code);
  v_ip text := public.client_ip();
  v_fail int;
  p record;
  v_relation text := 'none';
  v_current text;
begin
  -- Quá 10 lần sai/giờ theo IP → khoá 1 giờ (F2)
  if v_ip is not null then
    select count(*) into v_fail from public.code_attempts
    where kind = 'passport_lookup' and ip = v_ip and not success
      and created_at > now() - make_interval(mins => public.setting_int('code_entry.lock_minutes', 60));
    if v_fail >= public.setting_int('code_entry.max_failures_per_ip_per_hour', 10) then
      return jsonb_build_object('result', 'locked', 'retry_minutes', public.setting_int('code_entry.lock_minutes', 60));
    end if;
  end if;

  select ps.id, ps.status, ps.student_id, ps.tier_id, s.full_name, s.verification_status,
         coalesce(sc.short_name, sc.name) as school_name, t.name_vi as tier_vi, t.name_en as tier_en
    into p
  from public.passports ps
  left join public.students s on s.id = ps.student_id
  left join public.schools sc on sc.id = s.current_school_id
  left join public.passport_tiers t on t.id = ps.tier_id
  where ps.passport_code = v_code;

  if p.id is null then
    insert into public.code_attempts (kind, code, ip, user_id, success) values ('passport_lookup', left(v_code, 20), v_ip, auth.uid(), false);
    return jsonb_build_object('result', 'not_found');
  end if;
  insert into public.code_attempts (kind, code, ip, user_id, success) values ('passport_lookup', v_code, v_ip, auth.uid(), true);

  if auth.uid() is not null and p.student_id is not null then
    if public.is_guardian_of(p.student_id, true) then v_relation := 'guardian';
    elsif public.can_staff_view_student(p.student_id) then v_relation := 'staff';
    end if;
  end if;

  -- Sổ hiện tại của học viên (chỉ cho người có quyền, khi sổ này đã mất/huỷ/cấp trước)
  if v_relation <> 'none' and p.status in ('lost', 'void', 'retired') then
    select passport_code into v_current from public.passports
    where student_id = p.student_id and status in ('active', 'assigned') order by status limit 1;
  end if;

  return jsonb_build_object(
    'result', 'ok',
    'status', p.status,
    'tier_vi', p.tier_vi,
    'tier_en', p.tier_en,
    'masked_name', public.mask_name(p.full_name),
    'school_name', p.school_name,
    'relation', v_relation,
    'student_id', case when v_relation <> 'none' then p.student_id end,
    'current_passport_code', v_current,
    'identity_locked', public.identity_locked(v_code)
  );
end $$;

-------------------------------------------------------------------------------
-- Bắt đầu kích hoạt (đã đăng nhập): cho biết luồng A/B, có cần xác nhận ngày sinh/họ tên không
-------------------------------------------------------------------------------
create or replace function public.activation_start(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_code text := public.normalize_code(p_code);
  p record;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select ps.id, ps.status, ps.student_id, s.date_of_birth, s.gender, s.golf_goals, s.golf_goals_other,
         coalesce(sc.requires_photo_consent, false) as requires_photo_consent
    into p
  from public.passports ps
  left join public.students s on s.id = ps.student_id
  left join public.schools sc on sc.id = s.current_school_id
  where ps.passport_code = v_code;
  if p.id is null then raise exception 'passport_not_found' using errcode = 'P0002'; end if;

  if p.status = 'unassigned' then
    return jsonb_build_object('flow', 'B');
  end if;
  if p.status <> 'assigned' then
    raise exception 'passport_not_activatable:%', p.status using errcode = '22023';
  end if;

  if public.is_trusted_for_student(p.student_id) then
    return jsonb_build_object('flow', 'A', 'trusted', true, 'identity', null,
      'needs_dob', p.date_of_birth is null, 'requires_photo_consent', p.requires_photo_consent,
      'child', jsonb_build_object('gender', p.gender, 'golf_goals', p.golf_goals, 'golf_goals_other', p.golf_goals_other));
  end if;
  if public.has_other_account_guardian(p.student_id) then
    return jsonb_build_object('flow', 'A', 'blocked', 'other_guardian');
  end if;
  if public.identity_locked(v_code) then
    return jsonb_build_object('flow', 'A', 'blocked', 'identity_locked');
  end if;
  return jsonb_build_object('flow', 'A', 'trusted', false,
    'identity', case when p.date_of_birth is not null then 'dob' else 'name' end,
    'needs_dob', p.date_of_birth is null, 'requires_photo_consent', p.requires_photo_consent);
end $$;

-- Kiểm tra câu trả lời xác nhận (ngày sinh yyyy-mm-dd, hoặc họ tên đầy đủ khi chưa có ngày sinh).
-- Sai quá 5 lần → khoá mã 24 giờ và báo admin (F2 luồng A bước 2).
create or replace function public.check_identity_answer(p_code text, p_student_id uuid, p_answer text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_dob date;
  v_norm text;
  v_ok boolean;
  v_fails int;
begin
  select date_of_birth, full_name_normalized into v_dob, v_norm from public.students where id = p_student_id;
  if v_dob is not null then
    begin
      v_ok := p_answer::date = v_dob;
    exception when others then v_ok := false;
    end;
  else
    v_ok := public.normalize_name(p_answer) = v_norm;
  end if;
  insert into public.code_attempts (kind, code, ip, user_id, success) values ('identity', p_code, public.client_ip(), auth.uid(), v_ok);

  if not v_ok then
    select count(*) into v_fails from public.code_attempts
    where kind = 'identity' and code = p_code and not success
      and created_at > now() - make_interval(hours => public.setting_int('activation.identity_lock_hours', 24));
    if v_fails = public.setting_int('activation.max_identity_failures', 5) then
      -- Báo admin một lần khi mã bị khoá
      insert into public.notifications (user_id, type, title_vi, title_en, body_vi, body_en, link)
      select distinct ur.user_id, 'activation_locked',
             'Mã sổ bị khoá do xác nhận sai nhiều lần', 'Passport code locked after failed checks',
             'Mã ' || p_code || ' bị nhập sai ngày sinh/họ tên ' || v_fails || ' lần và bị khoá 24 giờ.',
             'Code ' || p_code || ' had ' || v_fails || ' failed date-of-birth/name checks and is locked for 24 hours.',
             '/admin/passports'
      from public.user_roles ur where ur.role = 'admin' and ur.deleted_at is null;
    end if;
  end if;
  return v_ok;
end $$;

create or replace function public.activation_verify_identity(p_code text, p_answer text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := public.normalize_code(p_code);
  v_student uuid;
  v_status text;
  v_left int;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select student_id, status into v_student, v_status from public.passports where passport_code = v_code;
  if v_student is null or v_status <> 'assigned' then raise exception 'passport_not_found' using errcode = 'P0002'; end if;
  if public.identity_locked(v_code) then raise exception 'identity_locked' using errcode = '22023'; end if;
  if public.check_identity_answer(v_code, v_student, p_answer) then
    return jsonb_build_object('ok', true);
  end if;
  select public.setting_int('activation.max_identity_failures', 5) - count(*) into v_left from public.code_attempts
  where kind = 'identity' and code = v_code and not success
    and created_at > now() - make_interval(hours => public.setting_int('activation.identity_lock_hours', 24));
  return jsonb_build_object('ok', false, 'attempts_left', greatest(v_left, 0));
end $$;

-------------------------------------------------------------------------------
-- Hoàn tất kích hoạt (F2 bước 4–7): quan hệ, đồng ý, thông tin con, sổ active, liên kết người giám hộ
-- p_data: { identity_answer?, relationship, consents: { terms, privacy, leaderboard_name, photo },
--           child: { full_name?, date_of_birth?, school_id?, school_text?, grade_class?, gender?, golf_goals?, golf_goals_other? } }
-------------------------------------------------------------------------------
create or replace function public.activation_complete(p_code text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_code text := public.normalize_code(p_code);
  v_uid uuid := auth.uid();
  p public.passports;
  v_guardian uuid;
  v_student uuid;
  v_link_status text := 'active';
  v_matched boolean := false;
  v_child jsonb := coalesce(p_data -> 'child', '{}');
  v_cons jsonb := coalesce(p_data -> 'consents', '{}');
  v_rel text := nullif(p_data ->> 'relationship', '');
  v_dob date;
  v_school uuid;
  v_goals text[];
  v_versions jsonb;
  v_months int;
  v_matches uuid[];
  v_requires_photo boolean;
  v_profile record;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if coalesce((v_cons ->> 'terms')::boolean, false) is not true or coalesce((v_cons ->> 'privacy')::boolean, false) is not true then
    raise exception 'consent_required' using errcode = '22023';
  end if;
  if v_rel is null or v_rel not in ('father', 'mother', 'guardian', 'other') then
    raise exception 'relationship_required' using errcode = '22023';
  end if;

  select * into p from public.passports where passport_code = v_code for update;
  if p.id is null then raise exception 'passport_not_found' using errcode = 'P0002'; end if;
  if p.status not in ('assigned', 'unassigned') then
    raise exception 'passport_not_activatable:%', p.status using errcode = '22023';
  end if;

  -- Người giám hộ của tài khoản (thường đã tạo khi đăng ký)
  v_guardian := public.my_guardian_id();
  if v_guardian is null then
    select p2.full_name, p2.phone, p2.email into v_profile from public.profiles p2 where p2.user_id = v_uid;
    insert into public.guardians (user_id, full_name, phone, email)
    values (v_uid, v_profile.full_name, v_profile.phone, v_profile.email) returning id into v_guardian;
  end if;
  update public.guardians set relationship_default = coalesce(relationship_default, v_rel) where id = v_guardian;

  begin
    v_dob := nullif(v_child ->> 'date_of_birth', '')::date;
  exception when others then
    raise exception 'invalid_dob' using errcode = '22023';
  end;
  if v_child ? 'golf_goals' then
    select coalesce(array_agg(x), '{}') into v_goals from jsonb_array_elements_text(v_child -> 'golf_goals') x;
  end if;

  if p.status = 'assigned' then
    ---------------------------------------------------------------- Luồng A
    v_student := p.student_id;
    if not public.is_trusted_for_student(v_student) then
      if public.has_other_account_guardian(v_student) then raise exception 'other_guardian' using errcode = '22023'; end if;
      if public.identity_locked(v_code) then raise exception 'identity_locked' using errcode = '22023'; end if;
      if not public.check_identity_answer(v_code, v_student, coalesce(p_data ->> 'identity_answer', '')) then
        raise exception 'identity_failed' using errcode = '22023';
      end if;
    end if;
    update public.students
    set date_of_birth = coalesce(date_of_birth, v_dob),
        gender = coalesce(nullif(v_child ->> 'gender', ''), gender),
        golf_goals = coalesce(v_goals, golf_goals),
        golf_goals_other = coalesce(nullif(v_child ->> 'golf_goals_other', ''), golf_goals_other)
    where id = v_student;
  else
    ---------------------------------------------------------------- Luồng B (sổ chưa gán)
    if coalesce(btrim(v_child ->> 'full_name'), '') = '' or v_dob is null then
      raise exception 'child_info_required' using errcode = '22023';
    end if;
    v_school := nullif(v_child ->> 'school_id', '')::uuid;
    -- Dò học viên có sẵn: tên chuẩn hoá + ngày sinh + trường, chưa có sổ active
    select array_agg(s.id) into v_matches from public.students s
    where s.deleted_at is null and s.merged_into_student_id is null
      and s.full_name_normalized = public.normalize_name(v_child ->> 'full_name')
      and s.date_of_birth = v_dob
      and (v_school is null or s.current_school_id = v_school)
      and not exists (select 1 from public.passports x where x.student_id = s.id and x.status = 'active');

    if coalesce(array_length(v_matches, 1), 0) = 1 then
      -- Khớp đúng 1 em: gán sổ, liên kết chờ xác nhận (admin/HLV duyệt trong 48 giờ)
      v_student := v_matches[1];
      v_matched := true;
      v_link_status := 'pending_confirmation';
      update public.students
      set self_reported = v_child || jsonb_build_object('submitted_at', now(), 'passport_code', v_code)
      where id = v_student;
    else
      -- Không khớp hoặc khớp nhiều: tạo học viên mới chờ xác minh
      insert into public.students (full_name, date_of_birth, current_school_id, current_grade_class, gender,
                                   golf_goals, golf_goals_other, verification_status, self_reported)
      values (v_child ->> 'full_name', v_dob, v_school, nullif(v_child ->> 'grade_class', ''),
              nullif(v_child ->> 'gender', ''), coalesce(v_goals, '{}'), nullif(v_child ->> 'golf_goals_other', ''),
              'pending_review',
              v_child || jsonb_build_object('submitted_at', now(), 'passport_code', v_code,
                                            'match_count', coalesce(array_length(v_matches, 1), 0)))
      returning id into v_student;
    end if;
    select validity_months into v_months from public.passport_tiers where id = p.tier_id;
    update public.passports
    set student_id = v_student, issued_at = now(), expires_at = now() + make_interval(months => v_months)
    where id = p.id;
  end if;

  -- Liên kết người giám hộ ↔ học viên (F2 bước 7)
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (v_student, v_guardian, v_rel,
          not exists (select 1 from public.student_guardians x where x.student_id = v_student and x.is_primary and x.deleted_at is null),
          true, 'passport', v_link_status, now())
  on conflict (student_id, guardian_id) where deleted_at is null
  do update set relationship = excluded.relationship,
                can_manage = true,
                -- đã active thì giữ active; không hạ xuống chờ duyệt
                status = case when student_guardians.status = 'active' then 'active' else excluded.status end,
                is_primary = student_guardians.is_primary or excluded.is_primary,
                linked_at = coalesce(student_guardians.linked_at, now());

  -- Sổ cũ đang active (lên cấp hộ chiếu mới) → sổ cấp trước (kế hoạch D19)
  update public.passports set status = 'retired'
  where student_id = v_student and status = 'active' and id <> p.id;
  update public.passports
  set status = 'active', activated_at = now(), activated_by_guardian_id = v_guardian
  where id = p.id;

  -- R11: chỉ ghi lần kích hoạt đầu tiên (trigger giữ giá trị cũ)
  update public.students set activated_at = now() where id = v_student and activated_at is null;

  -- Đồng ý (F2 bước 5, F18): lưu cả phiên bản văn bản
  select value into v_versions from public.app_settings where key = 'legal.versions';
  insert into public.consents (guardian_id, student_id, type, version, granted) values
    (v_guardian, null, 'terms', coalesce(v_versions ->> 'terms', 'v0'), true),
    (v_guardian, null, 'privacy', coalesce(v_versions ->> 'privacy', 'v0'), true),
    (v_guardian, v_student, 'leaderboard_name', coalesce(v_versions ->> 'terms', 'v0'),
     coalesce((v_cons ->> 'leaderboard_name')::boolean, false));
  select coalesce(sc.requires_photo_consent, false) into v_requires_photo
  from public.students s left join public.schools sc on sc.id = s.current_school_id where s.id = v_student;
  if v_requires_photo and v_cons ? 'photo' then
    insert into public.consents (guardian_id, student_id, type, version, granted)
    values (v_guardian, v_student, 'photo', coalesce(v_versions ->> 'terms', 'v0'), coalesce((v_cons ->> 'photo')::boolean, false));
  end if;

  return jsonb_build_object('student_id', v_student, 'link_status', v_link_status, 'matched', v_matched,
                            'flow', case when p.status = 'assigned' then 'A' else 'B' end);
end $$;

-------------------------------------------------------------------------------
-- Trang chủ phụ huynh: thẻ từng con (02 mục 3.2). Chờ duyệt → chỉ tên + level (D32).
-------------------------------------------------------------------------------
create or replace function public.my_children()
returns table (
  student_id uuid, full_name text, student_code text, avatar_url text,
  link_status text, relationship text, can_manage boolean,
  level_number int, level_name_vi text, level_name_en text, group_name_vi text, group_name_en text,
  stage_number int, stage_name_vi text, stage_name_en text, stage_color text,
  tier_name_vi text, tier_name_en text, school_name text, grade_class text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.full_name,
         case when sg.status = 'active' then s.student_code end,
         case when sg.status = 'active' then s.avatar_url end,
         sg.status, sg.relationship, sg.can_manage and sg.status = 'active',
         l.number, l.name_vi, l.name_en,
         case when sg.status = 'active' then l.group_name_vi end, case when sg.status = 'active' then l.group_name_en end,
         case when sg.status = 'active' then st.number end, case when sg.status = 'active' then st.name_vi end,
         case when sg.status = 'active' then st.name_en end, case when sg.status = 'active' then st.color end,
         case when sg.status = 'active' then t.name_vi end, case when sg.status = 'active' then t.name_en end,
         case when sg.status = 'active' then coalesce(sc.short_name, sc.name) end,
         case when sg.status = 'active' then s.current_grade_class end
  from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id and g.user_id = auth.uid() and g.deleted_at is null
  join public.students s on s.id = sg.student_id and s.deleted_at is null and s.merged_into_student_id is null
  left join public.levels l on l.id = s.current_level_id
  left join public.passport_stages st on st.id = l.passport_stage_id
  left join public.passport_tiers t on t.id = l.passport_tier_id
  left join public.schools sc on sc.id = s.current_school_id
  where sg.deleted_at is null
  order by sg.linked_at nulls last, s.full_name
$$;

-------------------------------------------------------------------------------
-- Quyền gọi hàm
-------------------------------------------------------------------------------
do $$
declare f text;
begin
  -- Hàm nội bộ: không mở qua API
  foreach f in array array[
    'public.check_identity_answer(text, uuid, text)', 'public.is_trusted_for_student(uuid)',
    'public.has_other_account_guardian(uuid)', 'public.identity_locked(text)', 'public.setting_int(text, int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- Người đã đăng nhập
  foreach f in array array[
    'public.activation_start(text)', 'public.activation_verify_identity(text, text)',
    'public.activation_complete(text, jsonb)', 'public.my_children()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.passport_lookup(text) to anon, authenticated;
