-- Module Nhân sự sự kiện · bước 3: nhập danh sách nhân sự, cấp / ghép hồ sơ + sổ, gán ô, sinh việc của người.
-- Quyết định 09/10/2026 (11-mapping.md mục 3): mã trọn đời = students.student_code (VNC-…); sổ hạng "Thẻ nhân sự" in trên thẻ đeo;
-- ghép theo SĐT/email; dưới 11 tuổi (năm sinh) → hồ sơ con dưới phụ huynh; trùng nghi vấn chờ admin chọn, không tự gộp.

-- Chuẩn hoá liên hệ: email (có @) → chữ thường; còn lại là SĐT → +84… (0xxxxxxxxx → +84xxxxxxxxx)
create or replace function public.crew_parse_contact(p_contact text)
returns jsonb language plpgsql immutable as $$
declare v text := btrim(coalesce(p_contact, ''));
begin
  if v = '' then return jsonb_build_object('kind', 'none'); end if;
  if position('@' in v) > 0 then
    v := lower(v);
    if v !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then return jsonb_build_object('kind', 'invalid'); end if;
    return jsonb_build_object('kind', 'email', 'value', v);
  end if;
  v := regexp_replace(v, '[\s.()-]', '', 'g');
  if v ~ '^0\d{9,10}$' then v := '+84' || substr(v, 2); end if;
  if v ~ '^84\d{9,10}$' then v := '+' || v; end if;
  if v !~ '^\+[1-9]\d{6,14}$' then return jsonb_build_object('kind', 'invalid'); end if;
  return jsonb_build_object('kind', 'phone', 'value', v);
end $$;

-- p_rows: [{ line, full_name, slot_code, contact, birth_year, decision: 'auto' | 'new' | '<student_id>' }]
-- p_commit = false: chỉ xem trước (không ghi gì). true: ghi, dòng lỗi / nghi trùng chưa chọn thì bỏ qua.
create or replace function public.crew_import(p_event_id uuid, p_rows jsonb, p_commit boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  e public.events;
  r jsonb;
  out jsonb := '[]';
  v_line int;
  v_name text;
  v_slot public.event_crew_slots;
  v_contact jsonb;
  v_year int;
  v_child boolean;
  v_decision text;
  v_guardian uuid;
  v_user uuid;
  v_student uuid;
  v_passport uuid;
  v_action text;
  v_candidates jsonb;
  v_existing public.event_crew_assignments;
  v_seen text[] := '{}';
  v_tier public.passport_tiers;
  v_batch uuid;
  v_asg uuid;
  v_res jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  select * into v_tier from public.passport_tiers where code = 'staff';
  perform set_config('app.audit_reason', 'Nhập nhân sự sự kiện: ' || e.name_vi, true);

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    v_line := nullif(r ->> 'line', '')::int;
    v_name := regexp_replace(btrim(coalesce(r ->> 'full_name', '')), '\s+', ' ', 'g');
    v_contact := public.crew_parse_contact(r ->> 'contact');
    v_decision := coalesce(nullif(r ->> 'decision', ''), 'auto');
    v_guardian := null; v_user := null; v_student := null; v_passport := null; v_action := null; v_candidates := '[]';
    select * into v_slot from public.event_crew_slots where slot_code = upper(btrim(coalesce(r ->> 'slot_code', '')));
    v_res := jsonb_build_object('line', v_line, 'full_name', v_name, 'slot_code', upper(btrim(coalesce(r ->> 'slot_code', ''))),
                                'contact', v_contact ->> 'value');

    -- Kiểm tra dòng
    begin
      v_year := nullif(btrim(coalesce(r ->> 'birth_year', '')), '')::int;
    exception when others then v_year := -1;
    end;
    if v_name = '' then out := out || (v_res || '{"status":"error","error":"name_required"}'); continue; end if;
    if v_slot.id is null then out := out || (v_res || '{"status":"error","error":"slot_not_found"}'); continue; end if;
    if v_contact ->> 'kind' in ('none', 'invalid') then
      out := out || (v_res || jsonb_build_object('status', 'error', 'error', 'contact_' || (v_contact ->> 'kind'))); continue;
    end if;
    if v_year is not null and (v_year < 1900 or v_year > extract(year from e.event_date)::int) then
      out := out || (v_res || '{"status":"error","error":"birth_year_invalid"}'); continue;
    end if;
    if v_slot.slot_code = any(v_seen) then out := out || (v_res || '{"status":"error","error":"slot_duplicated"}'); continue; end if;
    v_seen := v_seen || v_slot.slot_code;
    v_child := v_year is not null and extract(year from e.event_date)::int - v_year < 11;
    v_res := v_res || jsonb_build_object('is_child', v_child, 'role_name', v_slot.role_name_vi);

    -- Tìm người đã có theo SĐT / email: người giám hộ trước (ưu tiên có tài khoản), rồi tài khoản (profiles)
    if v_contact ->> 'kind' = 'phone' then
      select g.id, g.user_id into v_guardian, v_user from public.guardians g
      where g.phone = v_contact ->> 'value' and g.deleted_at is null order by (g.user_id is null), g.created_at limit 1;
      if v_guardian is null then select p.user_id into v_user from public.profiles p where p.phone = v_contact ->> 'value' limit 1; end if;
    else
      select g.id, g.user_id into v_guardian, v_user from public.guardians g
      where lower(g.email) = v_contact ->> 'value' and g.deleted_at is null order by (g.user_id is null), g.created_at limit 1;
      if v_guardian is null then select p.user_id into v_user from public.profiles p where lower(p.email) = v_contact ->> 'value' limit 1; end if;
    end if;
    if v_guardian is null and v_user is not null then
      select g.id into v_guardian from public.guardians g where g.user_id = v_user and g.deleted_at is null limit 1;
    end if;

    if v_decision not in ('auto', 'new') then
      -- Admin đã chọn một hồ sơ có sẵn
      select id into v_student from public.students where id = v_decision::uuid and deleted_at is null and merged_into_student_id is null;
      if v_student is null then out := out || (v_res || '{"status":"error","error":"student_not_found"}'); continue; end if;
      v_action := 'reuse';
    elsif v_child then
      -- Dưới 11 tuổi: hồ sơ con dưới phụ huynh (liên hệ là của phụ huynh)
      if v_guardian is not null then
        select s.id into v_student from public.student_guardians sg join public.students s on s.id = sg.student_id
        where sg.guardian_id = v_guardian and sg.deleted_at is null and sg.relationship <> 'self'
          and s.deleted_at is null and s.merged_into_student_id is null and public.normalize_name(s.full_name) = public.normalize_name(v_name)
        limit 1;
      end if;
      v_action := case when v_student is not null then 'reuse' else 'new_child' end;
    else
      -- Từ 11 tuổi / người lớn: hồ sơ tự chơi gắn với liên hệ của chính người đó
      if v_guardian is not null then
        select s.id into v_student from public.student_guardians sg join public.students s on s.id = sg.student_id
        where sg.guardian_id = v_guardian and sg.relationship = 'self' and sg.deleted_at is null
          and s.deleted_at is null and s.merged_into_student_id is null
        order by sg.created_at limit 1;
        if v_student is not null and public.normalize_name((select full_name from public.students where id = v_student)) <> public.normalize_name(v_name)
           and v_decision = 'auto' then
          -- Cùng liên hệ nhưng khác tên: chờ admin chọn
          out := out || (v_res || jsonb_build_object('status', 'suspect', 'reason', 'contact_other_name', 'candidates',
            (select jsonb_agg(jsonb_build_object('student_id', s.id, 'student_code', s.student_code, 'full_name', s.full_name)) from public.students s where s.id = v_student)));
          continue;
        end if;
        if v_decision = 'new' then v_student := null; end if;
      end if;
      v_action := case when v_student is not null then 'reuse' when v_guardian is not null or v_user is not null then 'new_self_account' else 'new_self' end;
    end if;

    -- Tạo mới mà đã có người cùng tên (khác liên hệ): chờ admin chọn, không tự gộp
    if v_student is null and v_decision = 'auto' then
      select jsonb_agg(jsonb_build_object('student_id', s.id, 'student_code', s.student_code, 'full_name', s.full_name)) into v_candidates
      from public.students s where s.deleted_at is null and s.merged_into_student_id is null
        and public.normalize_name(s.full_name) = public.normalize_name(v_name);
      if v_candidates is not null then
        out := out || (v_res || jsonb_build_object('status', 'suspect', 'reason', 'same_name_other_contact', 'candidates', v_candidates));
        continue;
      end if;
    end if;

    -- Ô đã có người khác trong sự kiện
    select * into v_existing from public.event_crew_assignments where event_id = p_event_id and slot_id = v_slot.id;
    if v_existing.id is not null and (v_student is null or v_existing.student_id <> v_student) then
      out := out || (v_res || jsonb_build_object('status', 'error', 'error', 'slot_taken',
        'taken_by', (select full_name from public.students where id = v_existing.student_id)));
      continue;
    end if;

    if not p_commit then
      out := out || (v_res || jsonb_build_object('status', 'ok', 'action', v_action,
        'student_code', (select student_code from public.students where id = v_student),
        'already_assigned', v_existing.id is not null));
      continue;
    end if;

    -- Ghi: người giám hộ, hồ sơ, liên kết
    if v_student is null then
      if v_guardian is null then
        insert into public.guardians (user_id, full_name, phone, email)
        values (v_user, case when not v_child then v_name end,
                case when v_contact ->> 'kind' = 'phone' then v_contact ->> 'value' end,
                case when v_contact ->> 'kind' = 'email' then v_contact ->> 'value' end)
        returning id into v_guardian;
      end if;
      insert into public.students (full_name, verification_status, self_reported)
      values (v_name, 'verified', case when v_year is not null then jsonb_build_object('birth_year', v_year) end)
      returning id into v_student;
      insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
      values (v_student, v_guardian, case when v_child then 'guardian' else 'self' end, true, true, 'admin', 'active', now());
    end if;

    -- Sổ: dùng sổ đang có (Thẻ nhân sự trước, rồi sổ học viên); chưa có thì cấp sổ "Thẻ nhân sự"
    select p.id into v_passport from public.passports p join public.passport_tiers t on t.id = p.tier_id
    where p.student_id = v_student and p.status in ('assigned', 'active') and t.code <> 'event_experience'
    order by (t.code <> 'staff'), p.issued_at desc nulls last limit 1;
    if v_passport is null then
      if v_batch is null then
        insert into public.passport_batches (name, tier_id, quantity, print_method, created_by)
        values ('Thẻ nhân sự · ' || e.name_vi, v_tier.id, 1, 'decal', auth.uid()) returning id into v_batch;
      else
        update public.passport_batches set quantity = quantity + 1 where id = v_batch;
      end if;
      insert into public.passports (passport_code, batch_id, tier_id, student_id, status, issued_at, expires_at, note)
      values (public.new_passport_code(), v_batch, v_tier.id, v_student, 'assigned', now(),
              now() + make_interval(months => v_tier.validity_months), 'Thẻ nhân sự · ' || e.name_vi)
      returning id into v_passport;
    end if;

    -- Phân công + việc của người (chép từ việc mẫu của vai)
    if v_existing.id is null then
      insert into public.event_crew_assignments (event_id, slot_id, student_id, passport_id, position, created_by)
      values (p_event_id, v_slot.id, v_student, v_passport, v_slot.default_position, auth.uid()) returning id into v_asg;
      insert into public.event_crew_tasks (assignment_id, template_id, sort_order, phase_no, phase_label, time_label, area, task_text)
      select v_asg, t.id, t.sort_order, t.phase_no, t.phase_label, t.time_label, t.area, t.task_text
      from public.event_crew_task_templates t where t.role_code = v_slot.role_code;
    else
      update public.event_crew_assignments set passport_id = coalesce(passport_id, v_passport) where id = v_existing.id;
    end if;

    out := out || (v_res || jsonb_build_object('status', 'ok', 'action', v_action, 'already_assigned', v_existing.id is not null,
      'student_code', (select student_code from public.students where id = v_student),
      'passport_code', (select passport_code from public.passports where id = v_passport)));
  end loop;
  return out;
end $$;

-- Bảng nhân sự của sự kiện: ô, vai, họ tên, mã VNC, mã sổ (QR thẻ đeo), liên hệ, tiến độ việc
create or replace function public.crew_roster(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'assignment_id', a.id, 'slot_code', sl.slot_code, 'role_code', sl.role_code, 'role_name', sl.role_name_vi,
      'badge_label', sl.badge_label, 'badge_color', sl.badge_color, 'position', a.position, 'badge_status', a.badge_status,
      'student_id', s.id, 'full_name', s.full_name, 'student_code', s.student_code, 'passport_code', p.passport_code,
      'contact', (select coalesce(g.phone, g.email) from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                  where sg.student_id = s.id and sg.deleted_at is null order by sg.is_primary desc limit 1),
      'is_child', exists (select 1 from public.student_guardians sg where sg.student_id = s.id and sg.relationship <> 'self' and sg.deleted_at is null),
      'tasks', (select count(*) from public.event_crew_tasks t where t.assignment_id = a.id),
      'done', (select count(*) from public.event_crew_tasks t where t.assignment_id = a.id and t.status = 'done'),
      'blocked', (select count(*) from public.event_crew_tasks t where t.assignment_id = a.id and t.status = 'blocked'))
      order by sl.sort_order)
    from public.event_crew_assignments a
    join public.event_crew_slots sl on sl.id = a.slot_id
    join public.students s on s.id = a.student_id
    left join public.passports p on p.id = a.passport_id
    where a.event_id = p_event_id), '[]');
end $$;

revoke execute on function public.crew_import(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.crew_roster(uuid) from public, anon;
