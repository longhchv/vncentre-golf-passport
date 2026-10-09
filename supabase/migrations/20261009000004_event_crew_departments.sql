-- Module Nhân sự sự kiện · nhập theo BỘ PHẬN thay cho mã ô, thêm chỗ tự động, thêm / bớt việc, bảng điều phối (bước 5–6 tối thiểu).
-- Anh Long chốt 09/10/2026: điều phối làm trên tài khoản BTC của sự kiện (is_event_staff) hoặc admin; phải đăng nhập.
-- Chỉ thêm: bảng mới, cột mới trên bảng mới của module, thay hàm của chính module này.

-- Việc thêm riêng cho cả một bộ phận trong một sự kiện (người nhập sau cũng nhận)
create table public.event_crew_extra_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  event_id uuid not null references public.events(id),
  role_code text not null check (role_code ~ '^[A-Z]$'),
  sort_order int not null default 100,
  phase_no int not null check (phase_no between 1 and 6),
  phase_label text not null,
  time_label text,
  area text,
  task_text text not null check (btrim(task_text) <> ''),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Việc mẫu bỏ khỏi một bộ phận trong một sự kiện (người nhập sau cũng không nhận)
create table public.event_crew_task_exclusions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  event_id uuid not null references public.events(id),
  template_id uuid not null references public.event_crew_task_templates(id),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, template_id)
);
alter table public.event_crew_tasks add column extra_task_id uuid references public.event_crew_extra_tasks(id);

do $$
declare t text;
begin
  foreach t in array array['event_crew_extra_tasks', 'event_crew_task_exclusions'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Bộ phận từ chữ gõ tự nhiên: "Điều phối", "An toàn", "HLV Chipping", "Đại sứ", "Check-in", "Quầy quà", "Truyền thông", "Khách mời"
-- hoặc mã ô cũ (C2, E1). Trả { role_code, position, slot_code }.
-------------------------------------------------------------------------------
create or replace function public.crew_resolve_department(p_text text)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v text := public.normalize_name(p_text);
  v_code text := upper(btrim(coalesce(p_text, '')));
  v_role text;
  v_pos text;
begin
  if v = '' then return null; end if;
  if exists (select 1 from public.event_crew_slots where slot_code = v_code) then
    return jsonb_build_object('slot_code', v_code, 'role_code', (select role_code from public.event_crew_slots where slot_code = v_code));
  end if;
  if exists (select 1 from public.event_crew_slots where role_code = v_code) then return jsonb_build_object('role_code', v_code); end if;
  select role_code into v_role from public.event_crew_slots where public.normalize_name(role_name_vi) = v limit 1;
  if v_role is null then
    v_role := case
      when v like '%dieu phoi%' then 'A'
      when v like '%an toan%' or v like '%pho bien%' or v like '%van hoa%' then 'B'
      when v like '%hlv%' or v like '%huan luyen%' or v like '%tram%' or v like '%coach%' then 'C'
      when v like '%dai su%' then 'D'
      when v like '%check%' then 'E'
      when v like '%khach%' or v like '%don tiep%' then 'K'
      when v like '%truyen thong%' or v like '%chup%' or v like '%media%' or v like '%quay phim%' then 'G'
      when v like '%qua%' then 'F'
    end;
  end if;
  if v_role is null then return null; end if;
  if v_role = 'C' then
    v_pos := case
      when v like '%putt%' then 'Trạm Putting'
      when v like '%chip%' then 'Trạm Chipping'
      when v like '%pitch%' then 'Trạm Pitching'
      when v like '%full%' or v like '%swing%' then 'Trạm Full swing'
    end;
  end if;
  return jsonb_build_object('role_code', v_role, 'position', v_pos);
end $$;

-- Danh sách bộ phận để chọn (gộp các ô cùng vai); HLV tách theo trạm
create or replace function public.crew_departments()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x ->> 'sort'), '[]') from (
    select jsonb_build_object('value', min(s.role_code), 'role_code', s.role_code, 'label', min(s.role_name_vi), 'sort', lpad(min(s.sort_order)::text, 4, '0'),
                              'badge_color', min(s.badge_color)) x
    from public.event_crew_slots s group by s.role_code
    union all
    select jsonb_build_object('value', 'HLV ' || replace(s.default_position, 'Trạm ', ''), 'role_code', 'C', 'label', s.role_name_vi || ' · ' || s.default_position,
                              'sort', lpad(s.sort_order::text, 4, '0') || 'b', 'badge_color', s.badge_color)
    from public.event_crew_slots s where s.role_code = 'C' and s.default_position is not null
      and s.id in (select min(id::text)::uuid from public.event_crew_slots where role_code = 'C' group by default_position)
  ) q
$$;
grant execute on function public.crew_departments() to authenticated;

-- Thêm chỗ cho một vai (bộ phận đủ người): mã ô kế tiếp, chép màu / nhãn / ghi chú của vai
create or replace function public.crew_new_slot(p_role_code text, p_position text)
returns public.event_crew_slots language plpgsql volatile security definer set search_path = public as $$
declare
  base public.event_crew_slots;
  v_n int;
  s public.event_crew_slots;
begin
  select * into base from public.event_crew_slots where role_code = p_role_code order by sort_order limit 1;
  select coalesce(max(coalesce(nullif(substr(slot_code, 2), '')::int, 1)), 0) + 1 into v_n from public.event_crew_slots where role_code = p_role_code;
  insert into public.event_crew_slots (role_code, role_name_vi, role_name_en, slot_code, default_position, badge_color, badge_label, note, sort_order)
  values (p_role_code, base.role_name_vi, base.role_name_en, p_role_code || v_n, p_position, base.badge_color, base.badge_label, base.note,
          (select max(sort_order) from public.event_crew_slots where role_code = p_role_code))
  returning * into s;
  return s;
end $$;
revoke execute on function public.crew_new_slot(text, text) from public, anon, authenticated;

-- Sinh việc cho một phân công: việc mẫu của vai (trừ việc đã bỏ trong sự kiện) + việc thêm cho bộ phận trong sự kiện
create or replace function public.crew_generate_tasks(p_assignment_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare a record;
begin
  select ca.id, ca.event_id, sl.role_code into a from public.event_crew_assignments ca join public.event_crew_slots sl on sl.id = ca.slot_id where ca.id = p_assignment_id;
  insert into public.event_crew_tasks (assignment_id, template_id, sort_order, phase_no, phase_label, time_label, area, task_text)
  select a.id, t.id, t.sort_order, t.phase_no, t.phase_label, t.time_label, t.area, t.task_text
  from public.event_crew_task_templates t
  where t.role_code = a.role_code
    and not exists (select 1 from public.event_crew_task_exclusions x where x.event_id = a.event_id and x.template_id = t.id);
  insert into public.event_crew_tasks (assignment_id, extra_task_id, sort_order, phase_no, phase_label, time_label, area, task_text)
  select a.id, x.id, x.sort_order, x.phase_no, x.phase_label, x.time_label, x.area, x.task_text
  from public.event_crew_extra_tasks x where x.event_id = a.event_id and x.role_code = a.role_code;
end $$;
revoke execute on function public.crew_generate_tasks(uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Nhập danh sách (thay bản bước 3): cột thứ 2 là BỘ PHẬN (hoặc mã ô cũ). Tự xếp vào chỗ trống của bộ phận, đủ người thì thêm chỗ.
-- p_rows: [{ line, full_name, department | slot_code, contact, birth_year, decision }]
-------------------------------------------------------------------------------
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
        'position', coalesce(v_pos, v_slot.default_position),
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
      values (p_event_id, v_slot.id, v_student, v_passport, coalesce(v_pos, v_slot.default_position), auth.uid()) returning id into v_asg;
      perform public.crew_generate_tasks(v_asg);
    else
      update public.event_crew_assignments set passport_id = coalesce(passport_id, v_passport) where id = v_existing;
      v_asg := v_existing;
    end if;

    out := out || (v_res || jsonb_build_object('status', 'ok', 'action', v_action, 'already_assigned', v_existing is not null, 'new_slot', v_new_slot,
      'slot_code', (select sl.slot_code from public.event_crew_assignments a join public.event_crew_slots sl on sl.id = a.slot_id where a.id = v_asg),
      'student_code', (select student_code from public.students where id = v_student),
      'passport_code', (select passport_code from public.passports where id = v_passport)));
  end loop;
  return out;
end $$;

-- Bảng nhân sự: BTC của sự kiện xem được (không có SĐT/email — chỉ admin thấy liên hệ)
create or replace function public.crew_roster(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean := public.is_admin();
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'assignment_id', a.id, 'slot_code', sl.slot_code, 'role_code', sl.role_code, 'role_name', sl.role_name_vi,
      'badge_label', sl.badge_label, 'badge_color', sl.badge_color, 'position', a.position, 'badge_status', a.badge_status,
      'student_id', s.id, 'full_name', s.full_name, 'student_code', s.student_code, 'passport_code', p.passport_code,
      'contact', case when v_admin then (select coalesce(g.phone, g.email) from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                  where sg.student_id = s.id and sg.deleted_at is null order by sg.is_primary desc limit 1) end,
      'is_child', exists (select 1 from public.student_guardians sg where sg.student_id = s.id and sg.relationship <> 'self' and sg.deleted_at is null),
      'tasks', (select count(*) from public.event_crew_tasks t where t.assignment_id = a.id),
      'done', (select count(*) from public.event_crew_tasks t where t.assignment_id = a.id and t.status = 'done'),
      'blocked', (select count(*) from public.event_crew_tasks t where t.assignment_id = a.id and t.status = 'blocked'))
      order by sl.sort_order, sl.slot_code)
    from public.event_crew_assignments a
    join public.event_crew_slots sl on sl.id = a.slot_id
    join public.students s on s.id = a.student_id
    left join public.passports p on p.id = a.passport_id
    where a.event_id = p_event_id), '[]');
end $$;

-------------------------------------------------------------------------------
-- Thêm / bớt việc, bớt người, thẻ đeo đã nhận (BTC của sự kiện hoặc admin)
-------------------------------------------------------------------------------
create or replace function public.crew_phase_label(p_phase int)
returns text language sql stable set search_path = public as $$
  select coalesce((select phase_label from public.event_crew_task_templates where phase_no = p_phase order by sort_order limit 1), 'Giai đoạn ' || p_phase)
$$;

-- p_assignment_id: thêm cho một người; p_role_code: thêm cho cả bộ phận (người nhập sau cũng nhận)
create or replace function public.crew_add_task(p_event_id uuid, p_assignment_id uuid, p_role_code text, p_phase_no int,
                                                p_time_label text, p_area text, p_task_text text)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  v_text text := nullif(btrim(coalesce(p_task_text, '')), '');
  v_extra uuid;
  n int;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_text is null then raise exception 'task_required' using errcode = '22023'; end if;
  if p_phase_no is null or p_phase_no not between 1 and 6 then raise exception 'phase_invalid' using errcode = '22023'; end if;
  perform set_config('app.audit_reason', 'Điều phối thêm việc', true);
  if p_assignment_id is not null then
    if not exists (select 1 from public.event_crew_assignments where id = p_assignment_id and event_id = p_event_id) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    insert into public.event_crew_tasks (assignment_id, sort_order, phase_no, phase_label, time_label, area, task_text)
    values (p_assignment_id, 100, p_phase_no, public.crew_phase_label(p_phase_no), nullif(btrim(coalesce(p_time_label, '')), ''),
            nullif(btrim(coalesce(p_area, '')), ''), v_text);
    return 1;
  end if;
  if p_role_code is null or not exists (select 1 from public.event_crew_slots where role_code = p_role_code) then
    raise exception 'department_not_found' using errcode = '22023';
  end if;
  insert into public.event_crew_extra_tasks (event_id, role_code, phase_no, phase_label, time_label, area, task_text, created_by)
  values (p_event_id, p_role_code, p_phase_no, public.crew_phase_label(p_phase_no), nullif(btrim(coalesce(p_time_label, '')), ''),
          nullif(btrim(coalesce(p_area, '')), ''), v_text, auth.uid())
  returning id into v_extra;
  insert into public.event_crew_tasks (assignment_id, extra_task_id, sort_order, phase_no, phase_label, time_label, area, task_text)
  select a.id, x.id, x.sort_order, x.phase_no, x.phase_label, x.time_label, x.area, x.task_text
  from public.event_crew_extra_tasks x
  join public.event_crew_assignments a on a.event_id = x.event_id
  join public.event_crew_slots sl on sl.id = a.slot_id and sl.role_code = x.role_code
  where x.id = v_extra;
  get diagnostics n = row_count;
  return n;
end $$;

-- p_scope 'one': bớt việc của một người; 'role': bớt việc đó khỏi cả bộ phận (người nhập sau cũng không nhận)
create or replace function public.crew_remove_task(p_task_id uuid, p_scope text default 'one')
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  t record;
  n int;
begin
  select ct.*, a.event_id, sl.role_code into t from public.event_crew_tasks ct
  join public.event_crew_assignments a on a.id = ct.assignment_id join public.event_crew_slots sl on sl.id = a.slot_id
  where ct.id = p_task_id;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.is_event_staff(t.event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform set_config('app.audit_reason', 'Điều phối bớt việc', true);
  if p_scope = 'role' and t.template_id is not null then
    insert into public.event_crew_task_exclusions (event_id, template_id, created_by) values (t.event_id, t.template_id, auth.uid())
    on conflict (event_id, template_id) do nothing;
    delete from public.event_crew_tasks ct using public.event_crew_assignments a, public.event_crew_slots sl
    where ct.assignment_id = a.id and sl.id = a.slot_id and a.event_id = t.event_id and sl.role_code = t.role_code and ct.template_id = t.template_id;
  elsif p_scope = 'role' and t.extra_task_id is not null then
    delete from public.event_crew_tasks where extra_task_id = t.extra_task_id;
    delete from public.event_crew_extra_tasks where id = t.extra_task_id;
  else
    delete from public.event_crew_tasks where id = t.id;
  end if;
  get diagnostics n = row_count;
  return greatest(n, 1);
end $$;

-- Bớt người khỏi sự kiện (nhập nhầm): xoá phân công và việc của người đó; hồ sơ, mã VNC, sổ vẫn giữ
create or replace function public.crew_remove_assignment(p_assignment_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_crew_assignments where id = p_assignment_id;
  if v_event is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.is_event_staff(v_event) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform set_config('app.audit_reason', 'Điều phối bớt người', true);
  delete from public.event_crew_tasks where assignment_id = p_assignment_id;
  delete from public.event_crew_assignments where id = p_assignment_id;
end $$;

create or replace function public.crew_set_badge(p_assignment_id uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_crew_assignments where id = p_assignment_id;
  if v_event is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.is_event_staff(v_event) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('not_printed', 'printed', 'received') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.event_crew_assignments set badge_status = p_status where id = p_assignment_id;
end $$;

-------------------------------------------------------------------------------
-- Bảng điều phối (spec 11 mục 4.5)
-------------------------------------------------------------------------------
-- Hạn của một việc: giờ cuối cùng ghi trong time_label ("16h00–17h45" → 17h45, "Trước 14h" → 14h00);
-- giai đoạn 1 là tối hôm trước, 2–5 là ngày sự kiện, 6 không tính quá giờ. Không đọc được giờ thì null.
create or replace function public.crew_task_deadline(p_event_date date, p_phase int, p_time_label text)
returns timestamptz language plpgsql stable set search_path = public as $$
declare m text[]; h int; mi int;
begin
  if p_phase not between 1 and 5 or p_time_label is null then return null; end if;
  for m in select x from regexp_matches(p_time_label, '(\d{1,2})h(\d{2})?', 'g') x loop
    h := m[1]::int; mi := coalesce(m[2], '0')::int;
  end loop;
  if h is null or h > 23 or mi > 59 then return null; end if;
  return ((case when p_phase = 1 then p_event_date - 1 else p_event_date end) + make_time(h, mi, 0)) at time zone 'Asia/Ho_Chi_Minh';
end $$;

create or replace function public.crew_board(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.events;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event_id;
  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name_vi', e.name_vi, 'event_date', e.event_date, 'status', e.status),
    'departments', coalesce((select jsonb_agg(x order by x ->> 'sort') from (
      select jsonb_build_object('role_code', sl.role_code, 'role_name', min(sl.role_name_vi), 'badge_color', min(sl.badge_color),
        'sort', lpad(min(sl.sort_order)::text, 4, '0'), 'people', count(distinct a.id),
        'total', count(t.id), 'done', count(t.id) filter (where t.status = 'done'), 'blocked', count(t.id) filter (where t.status = 'blocked')) x
      from public.event_crew_assignments a join public.event_crew_slots sl on sl.id = a.slot_id
      left join public.event_crew_tasks t on t.assignment_id = a.id
      where a.event_id = p_event_id group by sl.role_code) q), '[]'),
    'phases', coalesce((select jsonb_agg(jsonb_build_object('phase_no', phase_no, 'phase_label', phase_label, 'total', total, 'done', done, 'blocked', blocked) order by phase_no)
      from (select t.phase_no, min(t.phase_label) phase_label, count(*) total, count(*) filter (where t.status = 'done') done,
                   count(*) filter (where t.status = 'blocked') blocked
            from public.event_crew_tasks t join public.event_crew_assignments a on a.id = t.assignment_id
            where a.event_id = p_event_id group by t.phase_no) q), '[]'),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('task_id', t.id, 'slot_code', sl.slot_code, 'role_name', sl.role_name_vi, 'full_name', s.full_name,
                         'task_text', t.task_text, 'note', t.note, 'status_at', t.status_at) order by t.status_at desc)
      from public.event_crew_tasks t join public.event_crew_assignments a on a.id = t.assignment_id
      join public.event_crew_slots sl on sl.id = a.slot_id join public.students s on s.id = a.student_id
      where a.event_id = p_event_id and t.status = 'blocked'), '[]'),
    'overdue', coalesce((select jsonb_agg(jsonb_build_object('task_id', q.id, 'slot_code', q.slot_code, 'role_name', q.role_name_vi, 'full_name', q.full_name,
                         'task_text', q.task_text, 'time_label', q.time_label, 'deadline', q.deadline) order by q.deadline)
      from (select t.id, sl.slot_code, sl.role_name_vi, s.full_name, t.task_text, t.time_label,
                   public.crew_task_deadline(e.event_date, t.phase_no, t.time_label) deadline
            from public.event_crew_tasks t join public.event_crew_assignments a on a.id = t.assignment_id
            join public.event_crew_slots sl on sl.id = a.slot_id join public.students s on s.id = a.student_id
            where a.event_id = p_event_id and t.status = 'open') q
      where q.deadline < now()), '[]'),
    'badges', jsonb_build_object(
      'not_printed', (select count(*) from public.event_crew_assignments where event_id = p_event_id and badge_status = 'not_printed'),
      'printed', (select count(*) from public.event_crew_assignments where event_id = p_event_id and badge_status = 'printed'),
      'received', (select count(*) from public.event_crew_assignments where event_id = p_event_id and badge_status = 'received')));
end $$;

-- Việc của một người (để điều phối thêm / bớt)
create or replace function public.crew_person_tasks(p_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_crew_assignments where id = p_assignment_id;
  if v_event is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.is_event_staff(v_event) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'phase_no', t.phase_no, 'phase_label', t.phase_label, 'time_label', t.time_label,
      'area', t.area, 'task_text', t.task_text, 'status', t.status, 'note', t.note, 'kind',
      case when t.template_id is not null then 'template' when t.extra_task_id is not null then 'department' else 'personal' end)
      order by t.phase_no, t.sort_order, t.created_at)
    from public.event_crew_tasks t where t.assignment_id = p_assignment_id), '[]');
end $$;

-- Trang "Hôm nay": tổng của vai A hiện thêm vị trí; trả event_id để hiện nút chức năng theo vai
create or replace function public.crew_today(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_asg uuid := public.crew_assignment_for_code(p_code);
  a public.event_crew_assignments;
  e public.events;
  sl public.event_crew_slots;
  s public.students;
  v_is_a boolean;
begin
  if v_asg is null then return jsonb_build_object('result', 'none'); end if;
  select * into a from public.event_crew_assignments where id = v_asg;
  select * into e from public.events where id = a.event_id;
  select * into sl from public.event_crew_slots where id = a.slot_id;
  select * into s from public.students where id = a.student_id;
  v_is_a := sl.role_code = 'A';
  return jsonb_build_object(
    'result', 'crew', 'code', public.normalize_code(p_code),
    'full_name', s.full_name, 'student_code', s.student_code,
    'event', jsonb_build_object('id', e.id, 'name_vi', e.name_vi, 'name_en', e.name_en, 'event_date', e.event_date, 'venue', e.venue, 'status', e.status),
    'slot', jsonb_build_object('slot_code', sl.slot_code, 'role_code', sl.role_code, 'role_name', sl.role_name_vi, 'badge_label', sl.badge_label,
                               'badge_color', sl.badge_color, 'position', coalesce(a.position, sl.default_position), 'note', sl.note),
    'editable', e.status in ('draft', 'open'),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'phase_no', t.phase_no, 'phase_label', t.phase_label, 'time_label', t.time_label,
                         'area', t.area, 'task_text', t.task_text, 'status', t.status, 'note', t.note, 'status_at', t.status_at)
                       order by t.phase_no, t.sort_order, t.created_at)
                       from public.event_crew_tasks t where t.assignment_id = a.id), '[]'),
    'summary', case when v_is_a then coalesce((select jsonb_agg(jsonb_build_object('slot_code', sl2.slot_code, 'role_name', sl2.role_name_vi,
                         'position', a2.position, 'full_name', s2.full_name, 'total', x.total, 'done', x.done, 'blocked', x.blocked) order by sl2.sort_order, sl2.slot_code)
                       from public.event_crew_assignments a2
                       join public.event_crew_slots sl2 on sl2.id = a2.slot_id
                       join public.students s2 on s2.id = a2.student_id
                       cross join lateral (select count(*) total, count(*) filter (where t.status = 'done') done,
                                                  count(*) filter (where t.status = 'blocked') blocked
                                           from public.event_crew_tasks t where t.assignment_id = a2.id) x
                       where a2.event_id = a.event_id), '[]') end,
    'blocked', case when v_is_a then coalesce((select jsonb_agg(jsonb_build_object('slot_code', sl2.slot_code, 'role_name', sl2.role_name_vi, 'full_name', s2.full_name,
                         'task_text', t.task_text, 'note', t.note, 'status_at', t.status_at) order by t.status_at desc)
                       from public.event_crew_tasks t
                       join public.event_crew_assignments a2 on a2.id = t.assignment_id
                       join public.event_crew_slots sl2 on sl2.id = a2.slot_id
                       join public.students s2 on s2.id = a2.student_id
                       where a2.event_id = a.event_id and t.status = 'blocked'), '[]') end);
end $$;

revoke execute on function public.crew_import(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.crew_roster(uuid) from public, anon;
revoke execute on function public.crew_add_task(uuid, uuid, text, int, text, text, text) from public, anon;
revoke execute on function public.crew_remove_task(uuid, text) from public, anon;
revoke execute on function public.crew_remove_assignment(uuid) from public, anon;
revoke execute on function public.crew_set_badge(uuid, text) from public, anon;
revoke execute on function public.crew_board(uuid) from public, anon;
revoke execute on function public.crew_person_tasks(uuid) from public, anon;
