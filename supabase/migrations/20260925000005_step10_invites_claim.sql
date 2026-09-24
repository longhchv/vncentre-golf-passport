-- Bước 10 · Link mời kích hoạt (F3) và mã kích hoạt trên chứng nhận giấy (F4).
-- Gửi tin do Edge Function send-invitations làm (Zalo/email); ở đây là dữ liệu và các bước kích hoạt.

-------------------------------------------------------------------------------
-- Phần chung khi hoàn tất liên kết: quan hệ, thông tin con, đồng ý, ngày kích hoạt (dùng cho F3, F4)
-------------------------------------------------------------------------------
create or replace function public.finish_guardian_link(
  p_student_id uuid, p_data jsonb, p_linked_via text, p_can_manage boolean default true)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_guardian uuid;
  v_child jsonb := coalesce(p_data -> 'child', '{}');
  v_cons jsonb := coalesce(p_data -> 'consents', '{}');
  v_rel text := nullif(p_data ->> 'relationship', '');
  v_goals text[];
  v_versions jsonb;
  v_profile record;
begin
  if coalesce((v_cons ->> 'terms')::boolean, false) is not true or coalesce((v_cons ->> 'privacy')::boolean, false) is not true then
    raise exception 'consent_required' using errcode = '22023';
  end if;
  if v_rel is null or v_rel not in ('father', 'mother', 'guardian', 'other') then
    raise exception 'relationship_required' using errcode = '22023';
  end if;

  v_guardian := public.my_guardian_id();
  if v_guardian is null then
    select p2.full_name, p2.phone, p2.email into v_profile from public.profiles p2 where p2.user_id = v_uid;
    insert into public.guardians (user_id, full_name, phone, email)
    values (v_uid, v_profile.full_name, v_profile.phone, v_profile.email) returning id into v_guardian;
  end if;
  update public.guardians set relationship_default = coalesce(relationship_default, v_rel) where id = v_guardian;

  if v_child ? 'golf_goals' then
    select coalesce(array_agg(x), '{}') into v_goals from jsonb_array_elements_text(v_child -> 'golf_goals') x;
  end if;
  begin
    update public.students
    set date_of_birth = coalesce(date_of_birth, nullif(v_child ->> 'date_of_birth', '')::date),
        gender = coalesce(nullif(v_child ->> 'gender', ''), gender),
        golf_goals = coalesce(v_goals, golf_goals),
        golf_goals_other = coalesce(nullif(v_child ->> 'golf_goals_other', ''), golf_goals_other)
    where id = p_student_id;
  exception when invalid_datetime_format then
    raise exception 'invalid_dob' using errcode = '22023';
  end;

  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (p_student_id, v_guardian, v_rel,
          not exists (select 1 from public.student_guardians x where x.student_id = p_student_id and x.is_primary and x.deleted_at is null
                        and exists (select 1 from public.guardians gg where gg.id = x.guardian_id and gg.user_id is not null)),
          p_can_manage, p_linked_via, 'active', now())
  on conflict (student_id, guardian_id) where deleted_at is null
  do update set relationship = excluded.relationship, status = 'active',
                can_manage = student_guardians.can_manage or excluded.can_manage,
                is_primary = student_guardians.is_primary or excluded.is_primary,
                linked_via = coalesce(student_guardians.linked_via, excluded.linked_via),
                linked_at = coalesce(student_guardians.linked_at, now());

  update public.students set activated_at = now() where id = p_student_id and activated_at is null;  -- R11

  select value into v_versions from public.app_settings where key = 'legal.versions';
  insert into public.consents (guardian_id, student_id, type, version, granted) values
    (v_guardian, null, 'terms', coalesce(v_versions ->> 'terms', 'v0'), true),
    (v_guardian, null, 'privacy', coalesce(v_versions ->> 'privacy', 'v0'), true),
    (v_guardian, p_student_id, 'leaderboard_name', coalesce(v_versions ->> 'terms', 'v0'), coalesce((v_cons ->> 'leaderboard_name')::boolean, false));
  if v_cons ? 'photo' and exists (select 1 from public.students s join public.schools sc on sc.id = s.current_school_id
                                   where s.id = p_student_id and sc.requires_photo_consent) then
    insert into public.consents (guardian_id, student_id, type, version, granted)
    values (v_guardian, p_student_id, 'photo', coalesce(v_versions ->> 'terms', 'v0'), coalesce((v_cons ->> 'photo')::boolean, false));
  end if;
  return v_guardian;
end $$;

-------------------------------------------------------------------------------
-- F4 · Mã kích hoạt trên chứng nhận giấy (claim_code): như luồng A, dùng một lần
-------------------------------------------------------------------------------
-- Tra mã sổ: nếu không phải mã sổ mà là mã kích hoạt học viên → báo "claim" để chuyển sang /c/{mã}
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
  if v_ip is not null then
    select count(*) into v_fail from public.code_attempts
    where kind = 'passport_lookup' and ip = v_ip and not success
      and created_at > now() - make_interval(mins => public.setting_int('code_entry.lock_minutes', 60));
    if v_fail >= public.setting_int('code_entry.max_failures_per_ip_per_hour', 10) then
      return jsonb_build_object('result', 'locked', 'retry_minutes', public.setting_int('code_entry.lock_minutes', 60));
    end if;
  end if;

  select ps.id, ps.status, ps.student_id, ps.tier_id, s.full_name, coalesce(sc.short_name, sc.name) as school_name,
         t.name_vi as tier_vi, t.name_en as tier_en
    into p
  from public.passports ps
  left join public.students s on s.id = ps.student_id
  left join public.schools sc on sc.id = s.current_school_id
  left join public.passport_tiers t on t.id = ps.tier_id
  where ps.passport_code = v_code;

  if p.id is null then
    if exists (select 1 from public.students where claim_code = v_code and deleted_at is null) then
      insert into public.code_attempts (kind, code, ip, user_id, success) values ('claim_lookup', v_code, v_ip, auth.uid(), true);
      return jsonb_build_object('result', 'claim');
    end if;
    insert into public.code_attempts (kind, code, ip, user_id, success) values ('passport_lookup', left(v_code, 20), v_ip, auth.uid(), false);
    return jsonb_build_object('result', 'not_found');
  end if;
  insert into public.code_attempts (kind, code, ip, user_id, success) values ('passport_lookup', v_code, v_ip, auth.uid(), true);

  if auth.uid() is not null and p.student_id is not null then
    if public.is_guardian_of(p.student_id, true) then v_relation := 'guardian';
    elsif public.can_staff_view_student(p.student_id) then v_relation := 'staff';
    end if;
  end if;
  if v_relation <> 'none' and p.status in ('lost', 'void', 'retired') then
    select passport_code into v_current from public.passports
    where student_id = p.student_id and status in ('active', 'assigned') order by status limit 1;
  end if;

  return jsonb_build_object('result', 'ok', 'status', p.status, 'tier_vi', p.tier_vi, 'tier_en', p.tier_en,
    'masked_name', public.mask_name(p.full_name), 'school_name', p.school_name, 'relation', v_relation,
    'student_id', case when v_relation <> 'none' then p.student_id end,
    'current_passport_code', v_current, 'identity_locked', public.identity_locked(v_code));
end $$;

create or replace function public.claim_lookup(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := public.normalize_code(p_code);
  v_ip text := public.client_ip();
  v_fail int;
  s record;
begin
  if v_ip is not null then
    select count(*) into v_fail from public.code_attempts
    where kind in ('passport_lookup', 'claim_lookup') and ip = v_ip and not success
      and created_at > now() - make_interval(mins => public.setting_int('code_entry.lock_minutes', 60));
    if v_fail >= public.setting_int('code_entry.max_failures_per_ip_per_hour', 10) then
      return jsonb_build_object('result', 'locked', 'retry_minutes', public.setting_int('code_entry.lock_minutes', 60));
    end if;
  end if;
  select st.id, st.full_name, st.claim_code_used_at, coalesce(sc.short_name, sc.name) as school_name into s
  from public.students st left join public.schools sc on sc.id = st.current_school_id
  where st.claim_code = v_code and st.deleted_at is null and st.merged_into_student_id is null;
  insert into public.code_attempts (kind, code, ip, user_id, success) values ('claim_lookup', left(v_code, 20), v_ip, auth.uid(), s.id is not null);
  if s.id is null then return jsonb_build_object('result', 'not_found'); end if;
  return jsonb_build_object('result', 'ok', 'used', s.claim_code_used_at is not null,
    'masked_name', public.mask_name(s.full_name), 'school_name', s.school_name,
    'relation', case when auth.uid() is not null and public.is_guardian_of(s.id, true) then 'guardian' else 'none' end,
    'student_id', case when auth.uid() is not null and public.is_guardian_of(s.id, true) then s.id end);
end $$;

create or replace function public.claim_start(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_code text := public.normalize_code(p_code);
  s record;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select st.id, st.date_of_birth, st.claim_code_used_at, st.gender, st.golf_goals, st.golf_goals_other,
         coalesce(sc.requires_photo_consent, false) as requires_photo_consent into s
  from public.students st left join public.schools sc on sc.id = st.current_school_id
  where st.claim_code = v_code and st.deleted_at is null and st.merged_into_student_id is null;
  if s.id is null then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if s.claim_code_used_at is not null then raise exception 'claim_used' using errcode = '22023'; end if;
  if public.is_trusted_for_student(s.id) then
    return jsonb_build_object('flow', 'A', 'trusted', true, 'needs_dob', s.date_of_birth is null,
      'requires_photo_consent', s.requires_photo_consent,
      'child', jsonb_build_object('gender', s.gender, 'golf_goals', s.golf_goals, 'golf_goals_other', s.golf_goals_other));
  end if;
  if public.has_other_account_guardian(s.id) then return jsonb_build_object('flow', 'A', 'blocked', 'other_guardian'); end if;
  if public.identity_locked(v_code) then return jsonb_build_object('flow', 'A', 'blocked', 'identity_locked'); end if;
  return jsonb_build_object('flow', 'A', 'trusted', false, 'identity', case when s.date_of_birth is not null then 'dob' else 'name' end,
    'needs_dob', s.date_of_birth is null, 'requires_photo_consent', s.requires_photo_consent);
end $$;

create or replace function public.claim_verify_identity(p_code text, p_answer text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := public.normalize_code(p_code);
  v_student uuid;
  v_left int;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select id into v_student from public.students where claim_code = v_code and claim_code_used_at is null and deleted_at is null;
  if v_student is null then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if public.identity_locked(v_code) then raise exception 'identity_locked' using errcode = '22023'; end if;
  if public.check_identity_answer(v_code, v_student, p_answer) then return jsonb_build_object('ok', true); end if;
  select public.setting_int('activation.max_identity_failures', 5) - count(*) into v_left from public.code_attempts
  where kind = 'identity' and code = v_code and not success
    and created_at > now() - make_interval(hours => public.setting_int('activation.identity_lock_hours', 24));
  return jsonb_build_object('ok', false, 'attempts_left', greatest(v_left, 0));
end $$;

create or replace function public.claim_complete(p_code text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := public.normalize_code(p_code);
  v_student uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select id into v_student from public.students
  where claim_code = v_code and deleted_at is null and merged_into_student_id is null for update;
  if v_student is null then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if (select claim_code_used_at from public.students where id = v_student) is not null then
    raise exception 'claim_used' using errcode = '22023';  -- R1: dùng một lần
  end if;
  if not public.is_trusted_for_student(v_student) then
    if public.has_other_account_guardian(v_student) then raise exception 'other_guardian' using errcode = '22023'; end if;
    if public.identity_locked(v_code) then raise exception 'identity_locked' using errcode = '22023'; end if;
    if not public.check_identity_answer(v_code, v_student, coalesce(p_data ->> 'identity_answer', '')) then
      raise exception 'identity_failed' using errcode = '22023';
    end if;
  end if;
  perform public.finish_guardian_link(v_student, p_data, 'claim_code', true);
  update public.students set claim_code_used_at = now() where id = v_student;
  return jsonb_build_object('student_id', v_student, 'link_status', 'active', 'matched', false, 'flow', 'A');
end $$;

-- Admin tạo lại mã kích hoạt (mã cũ mất hiệu lực — F4)
create or replace function public.regenerate_claim_code(p_student_id uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_code text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_code := public.new_claim_code();
  update public.students set claim_code = v_code, claim_code_used_at = null where id = p_student_id;
  return v_code;
end $$;

-- Danh sách "tên ↔ mã kích hoạt" của lớp để in (kế hoạch F26)
create or replace function public.class_claim_codes(p_class_id uuid)
returns table (student_code text, full_name text, date_of_birth date, grade_class text, claim_code text, used boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select s.student_code, s.full_name, s.date_of_birth, s.current_grade_class, s.claim_code, s.claim_code_used_at is not null
  from public.enrollments e join public.students s on s.id = e.student_id
  where e.class_id = p_class_id and e.status = 'active' and s.deleted_at is null and s.merged_into_student_id is null
  order by s.full_name_normalized;
end $$;

-------------------------------------------------------------------------------
-- F3 · Link mời kích hoạt
-------------------------------------------------------------------------------

create or replace function public.invitation_lookup(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i record;
begin
  select inv.*, s.full_name, coalesce(sc.short_name, sc.name) as school_name into i
  from public.invitations inv join public.students s on s.id = inv.student_id
  left join public.schools sc on sc.id = s.current_school_id
  where inv.token = p_token;
  if i.id is null then return jsonb_build_object('result', 'not_found'); end if;
  return jsonb_build_object(
    'result', case when i.status = 'used' or i.used_at is not null then 'used'
                   when i.status = 'cancelled' then 'cancelled'
                   when i.expires_at < now() then 'expired' else 'ok' end,
    'purpose', i.purpose, 'channel', i.channel,
    'masked_name', public.mask_name(i.full_name), 'school_name', i.school_name,
    'masked_target', case when i.target like '%@%' then left(split_part(i.target, '@', 1), 2) || '***@' || split_part(i.target, '@', 2)
                          else left(i.target, 4) || '****' || right(i.target, 3) end,
    'target_kind', case when i.target like '%@%' then 'email' else 'phone' end);
end $$;

-- Người mở link phải đã xác thực đúng SĐT/email được mời (F3 bước 3, 5)
create or replace function public.invitation_for_caller(p_token text)
returns public.invitations language plpgsql stable security definer set search_path = public, auth as $$
declare
  i public.invitations;
  v_phone text;
  v_email text;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into i from public.invitations where token = p_token;
  if i.id is null then raise exception 'invite_not_found' using errcode = 'P0002'; end if;
  if i.used_at is not null or i.status = 'used' then raise exception 'invite_used' using errcode = '22023'; end if;
  if i.status = 'cancelled' then raise exception 'invite_cancelled' using errcode = '22023'; end if;
  if i.expires_at < now() then raise exception 'invite_expired' using errcode = '22023'; end if;
  select case when phone_confirmed_at is not null then '+' || phone end,
         case when email_confirmed_at is not null then lower(email) end
    into v_phone, v_email
  from auth.users where id = auth.uid();
  if not (i.target = v_phone or lower(i.target) = v_email) then
    raise exception 'invite_other_target' using errcode = '22023';
  end if;
  return i;
end $$;

create or replace function public.invitation_start(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  i public.invitations := public.invitation_for_caller(p_token);
  s record;
begin
  update public.invitations set opened_at = coalesce(opened_at, now()) where id = i.id;
  select st.date_of_birth, st.gender, st.golf_goals, st.golf_goals_other, coalesce(sc.requires_photo_consent, false) as requires_photo_consent
    into s
  from public.students st left join public.schools sc on sc.id = st.current_school_id where st.id = i.student_id;
  -- Đúng số được mời → không cần xác nhận ngày sinh (F3 bước 4)
  return jsonb_build_object('flow', 'A', 'trusted', true, 'needs_dob', s.date_of_birth is null,
    'requires_photo_consent', s.requires_photo_consent, 'purpose', i.purpose,
    'child', jsonb_build_object('gender', s.gender, 'golf_goals', s.golf_goals, 'golf_goals_other', s.golf_goals_other));
end $$;

create or replace function public.invitation_complete(p_token text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  i public.invitations := public.invitation_for_caller(p_token);
begin
  -- Người giám hộ thứ hai (F6): mặc định không có quyền quản lý
  perform public.finish_guardian_link(i.student_id, p_data, 'invite', i.purpose = 'activation');
  update public.invitations set used_at = now(), status = 'used' where id = i.id;
  -- Liên kết người giám hộ (nhập từ danh sách, chưa có tài khoản) của lời mời với tài khoản này
  update public.guardians set user_id = auth.uid()
  where id = i.guardian_id and user_id is null and public.my_guardian_id() is null;
  return jsonb_build_object('student_id', i.student_id, 'link_status', 'active', 'matched', false, 'flow', 'A');
end $$;

-------------------------------------------------------------------------------
-- Quyền gọi hàm
-------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.finish_guardian_link(uuid, jsonb, text, boolean)', 'public.invitation_for_caller(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.claim_start(text)', 'public.claim_verify_identity(text, text)', 'public.claim_complete(text, jsonb)',
    'public.regenerate_claim_code(uuid)', 'public.class_claim_codes(uuid)',
    'public.invitation_start(text)', 'public.invitation_complete(text, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.claim_lookup(text) to anon, authenticated;
grant execute on function public.invitation_lookup(text) to anon, authenticated;
