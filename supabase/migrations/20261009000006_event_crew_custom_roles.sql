-- Nhân sự sự kiện (anh Long 09/10/2026): điều phối thêm BỘ PHẬN mới với tên tự đặt; thêm từng người kèm VỊ TRÍ riêng; sửa vị trí.
-- Chỉ thêm / thay hàm của module này; bộ phận mới là thêm dòng vào event_crew_slots.

-- Thêm bộ phận mới: mã vai là chữ cái chưa dùng (H, I, J, L…), một chỗ đầu tiên <mã>1; việc của bộ phận thêm bằng crew_add_task
create or replace function public.crew_add_department(p_event_id uuid, p_name text, p_badge_label text default null, p_color text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_color text := coalesce(nullif(btrim(coalesce(p_color, '')), ''), '#5B6475');
  v_code text;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if v_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'color_invalid' using errcode = '22023'; end if;
  if exists (select 1 from public.event_crew_slots where public.normalize_name(role_name_vi) = public.normalize_name(v_name)) then
    raise exception 'department_exists' using errcode = '22023';
  end if;
  select l into v_code from unnest(string_to_array('H,I,J,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z', ',')) with ordinality as x(l, n)
  where not exists (select 1 from public.event_crew_slots where role_code = x.l) order by n limit 1;
  if v_code is null then raise exception 'too_many_departments' using errcode = '22023'; end if;
  perform set_config('app.audit_reason', 'Điều phối thêm bộ phận: ' || v_name, true);
  insert into public.event_crew_slots (role_code, role_name_vi, slot_code, badge_color, badge_label, sort_order)
  values (v_code, v_name, v_code || '1', v_color, coalesce(nullif(btrim(coalesce(p_badge_label, '')), ''), v_name),
          (select coalesce(max(sort_order), 0) + 1 from public.event_crew_slots));
  return jsonb_build_object('role_code', v_code, 'label', v_name);
end $$;

-- Sửa vị trí của một người trong sự kiện
create or replace function public.crew_set_position(p_assignment_id uuid, p_position text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_crew_assignments where id = p_assignment_id;
  if v_event is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.is_event_staff(v_event) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.event_crew_assignments set position = nullif(btrim(coalesce(p_position, '')), '') where id = p_assignment_id;
end $$;

-- Nhập (thay bản trước): thêm trường "position" cho từng người
create or replace function public.crew_import(p_event_id uuid, p_rows jsonb, p_commit boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  e public.events;
  r jsonb;
  out jsonb := '[]';
  v_line int;
  v_name text;
  v_dept jsonb;
  v_role text;
  v_pos text;
  v_position text;
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
  v_existing uuid;
  v_reserved uuid[] := '{}';
  v_virtual jsonb := '{}';
  v_new_slot boolean;
  v_tier public.passport_tiers;
  v_batch uuid;
  v_asg uuid;
  v_res jsonb;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  select * into v_tier from public.passport_tiers where code = 'staff';
  perform set_config('app.audit_reason', 'Nhập nhân sự sự kiện: ' || e.name_vi, true);

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    v_line := nullif(r ->> 'line', '')::int;
    v_name := regexp_replace(btrim(coalesce(r ->> 'full_name', '')), '\s+', ' ', 'g');
    v_contact := public.crew_parse_contact(r ->> 'contact');
    v_decision := coalesce(nullif(r ->> 'decision', ''), 'auto');
    v_dept := public.crew_resolve_department(coalesce(nullif(r ->> 'department', ''), r ->> 'slot_code'));
    v_role := v_dept ->> 'role_code';
    v_pos := v_dept ->> 'position';
    -- Vị trí ghi riêng (form thêm từng người) — chỉ để hiển thị, không ảnh hưởng chọn chỗ
    v_position := nullif(btrim(coalesce(r ->> 'position', '')), '');
    v_guardian := null; v_user := null; v_student := null; v_passport := null; v_action := null; v_candidates := null;
    v_existing := null; v_new_slot := false; v_slot := null;
    v_res := jsonb_build_object('line', v_line, 'full_name', v_name, 'department', coalesce(nullif(r ->> 'department', ''), r ->> 'slot_code'),
                                'contact', v_contact ->> 'value');

    begin
      v_year := nullif(btrim(coalesce(r ->> 'birth_year', '')), '')::int;
    exception when others then v_year := -1;
    end;
    if v_name = '' then out := out || (v_res || '{"status":"error","error":"name_required"}'); continue; end if;
    if v_role is null then out := out || (v_res || '{"status":"error","error":"department_not_found"}'); continue; end if;
    if v_contact ->> 'kind' in ('none', 'invalid') then
      out := out || (v_res || jsonb_build_object('status', 'error', 'error', 'contact_' || (v_contact ->> 'kind'))); continue;
    end if;
    if v_year is not null and (v_year < 1900 or v_year > extract(year from e.event_date)::int) then
      out := out || (v_res || '{"status":"error","error":"birth_year_invalid"}'); continue;
    end if;
    v_child := v_year is not null and extract(year from e.event_date)::int - v_year < 11;
    v_res := v_res || jsonb_build_object('is_child', v_child, 'role_code', v_role,
      'role_name', (select role_name_vi from public.event_crew_slots where role_code = v_role order by sort_order limit 1), 'position', v_pos);

    -- Tìm người đã có theo SĐT / email
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
      select id into v_student from public.students where id = v_decision::uuid and deleted_at is null and merged_into_student_id is null;
      if v_student is null then out := out || (v_res || '{"status":"error","error":"student_not_found"}'); continue; end if;
      v_action := 'reuse';
    elsif v_child then
      if v_guardian is not null then
        select s.id into v_student from public.student_guardians sg join public.students s on s.id = sg.student_id
        where sg.guardian_id = v_guardian and sg.deleted_at is null and sg.relationship <> 'self'
          and s.deleted_at is null and s.merged_into_student_id is null and public.normalize_name(s.full_name) = public.normalize_name(v_name)
        limit 1;
      end if;
      v_action := case when v_student is not null then 'reuse' else 'new_child' end;
    else
      if v_guardian is not null then
        select s.id into v_student from public.student_guardians sg join public.students s on s.id = sg.student_id
        where sg.guardian_id = v_guardian and sg.relationship = 'self' and sg.deleted_at is null
          and s.deleted_at is null and s.merged_into_student_id is null
        order by sg.created_at limit 1;
        if v_student is not null and public.normalize_name((select full_name from public.students where id = v_student)) <> public.normalize_name(v_name)
           and v_decision = 'auto' then
          out := out || (v_res || jsonb_build_object('status', 'suspect', 'reason', 'contact_other_name', 'candidates',
            (select jsonb_agg(jsonb_build_object('student_id', s.id, 'student_code', s.student_code, 'full_name', s.full_name)) from public.students s where s.id = v_student)));
          continue;
        end if;
        if v_decision = 'new' then v_student := null; end if;
      end if;
      v_action := case when v_student is not null then 'reuse' when v_guardian is not null or v_user is not null then 'new_self_account' else 'new_self' end;
    end if;

    if v_student is null and v_decision = 'auto' then
      select jsonb_agg(jsonb_build_object('student_id', s.id, 'student_code', s.student_code, 'full_name', s.full_name)) into v_candidates
      from public.students s where s.deleted_at is null and s.merged_into_student_id is null
        and public.normalize_name(s.full_name) = public.normalize_name(v_name);
      if v_candidates is not null then
        out := out || (v_res || jsonb_build_object('status', 'suspect', 'reason', 'same_name_other_contact', 'candidates', v_candidates));
        continue;
      end if;
    end if;

    -- Người này đã ở bộ phận này trong sự kiện → giữ nguyên
    if v_student is not null then
      select a.id into v_existing from public.event_crew_assignments a join public.event_crew_slots sl on sl.id = a.slot_id
      where a.event_id = p_event_id and a.student_id = v_student and sl.role_code = v_role limit 1;
    end if;

    -- Chọn chỗ: mã ô cũ ghi rõ → đúng ô đó; còn lại chỗ trống của bộ phận (đúng trạm nếu có), hết chỗ thì thêm chỗ
    if v_existing is null then
      if v_dept ? 'slot_code' then
        select * into v_slot from public.event_crew_slots where slot_code = v_dept ->> 'slot_code';
        if exists (select 1 from public.event_crew_assignments where event_id = p_event_id and slot_id = v_slot.id) or v_slot.id = any(v_reserved) then
          out := out || (v_res || jsonb_build_object('status', 'error', 'error', 'slot_taken',
            'taken_by', (select s.full_name from public.event_crew_assignments a join public.students s on s.id = a.student_id
                         where a.event_id = p_event_id and a.slot_id = v_slot.id)));
          continue;
        end if;
      else
        select sl.* into v_slot from public.event_crew_slots sl
        where sl.role_code = v_role and not (sl.id = any(v_reserved))
          and not exists (select 1 from public.event_crew_assignments a where a.event_id = p_event_id and a.slot_id = sl.id)
        order by (v_pos is not null and sl.default_position is not distinct from v_pos) desc, sl.sort_order, sl.slot_code
        limit 1;
        if v_slot.id is null or (v_pos is not null and v_slot.default_position is distinct from v_pos and v_slot.default_position is not null) then
          v_new_slot := true;
        end if;
      end if;
    end if;

    if not p_commit then
      if v_new_slot then
        v_virtual := jsonb_set(v_virtual, array[v_role], to_jsonb(coalesce((v_virtual ->> v_role)::int, 0) + 1));
      elsif v_slot.id is not null then
        v_reserved := v_reserved || v_slot.id;
      end if;
      out := out || (v_res || jsonb_build_object('status', 'ok', 'action', v_action, 'new_slot', v_new_slot,
        'slot_code', case when v_existing is not null then (select sl.slot_code from public.event_crew_assignments a join public.event_crew_slots sl on sl.id = a.slot_id where a.id = v_existing)
                          when not v_new_slot then v_slot.slot_code end,
        'position', coalesce(v_position, v_pos, v_slot.default_position),
        'student_code', (select student_code from public.students where id = v_student),
        'already_assigned', v_existing is not null));
      continue;
    end if;

    -- Ghi
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

    if v_existing is null then
      if v_new_slot then v_slot := public.crew_new_slot(v_role, v_pos); end if;
      insert into public.event_crew_assignments (event_id, slot_id, student_id, passport_id, position, created_by)
      values (p_event_id, v_slot.id, v_student, v_passport, coalesce(v_position, v_pos, v_slot.default_position), auth.uid()) returning id into v_asg;
      perform public.crew_generate_tasks(v_asg);
    else
      update public.event_crew_assignments set passport_id = coalesce(passport_id, v_passport), position = coalesce(v_position, position) where id = v_existing;
      v_asg := v_existing;
    end if;

    out := out || (v_res || jsonb_build_object('status', 'ok', 'action', v_action, 'already_assigned', v_existing is not null, 'new_slot', v_new_slot,
      'slot_code', (select sl.slot_code from public.event_crew_assignments a join public.event_crew_slots sl on sl.id = a.slot_id where a.id = v_asg),
      'student_code', (select student_code from public.students where id = v_student),
      'passport_code', (select passport_code from public.passports where id = v_passport)));
  end loop;
  return out;
end $$;

revoke execute on function public.crew_add_department(uuid, text, text, text) from public, anon;
revoke execute on function public.crew_set_position(uuid, text) from public, anon;
revoke execute on function public.crew_import(uuid, jsonb, boolean) from public, anon;
