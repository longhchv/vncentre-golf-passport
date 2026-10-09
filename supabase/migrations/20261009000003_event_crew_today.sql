-- Module Nhân sự sự kiện · bước 4: trang "Hôm nay" trên /p/<mã sổ> (spec 11 mục 4.4, phần checklist).
-- Phương án (a) cho 10/10 (11-mapping mục 3.5): ai mở đúng link cũng xem và tích được khi sự kiện chưa đóng;
-- mỗi lần tích ghi thời điểm (status_by = tài khoản nếu đang đăng nhập). Sau sự kiện chuyển sang bắt đăng nhập.

-- Phân công đang dùng của một mã sổ: sổ in trên thẻ đeo, hoặc sổ khác của cùng người; sự kiện chưa đóng, gần hôm nay nhất
create or replace function public.crew_assignment_for_code(p_code text)
returns uuid language sql stable security definer set search_path = public as $$
  select a.id
  from public.passports p
  join public.event_crew_assignments a on a.passport_id = p.id or a.student_id = p.student_id
  join public.events e on e.id = a.event_id
  where p.passport_code = public.normalize_code(p_code) and p.status not in ('void', 'lost')
    and e.status in ('draft', 'open')
  order by (a.passport_id = p.id) desc, abs(e.event_date - current_date), a.created_at
  limit 1
$$;
revoke execute on function public.crew_assignment_for_code(text) from public, anon, authenticated;

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
    -- Không trả SĐT, email, ảnh (spec 11 nguyên tắc 7)
    'full_name', s.full_name, 'student_code', s.student_code,
    'event', jsonb_build_object('id', e.id, 'name_vi', e.name_vi, 'name_en', e.name_en, 'event_date', e.event_date, 'venue', e.venue, 'status', e.status),
    'slot', jsonb_build_object('slot_code', sl.slot_code, 'role_code', sl.role_code, 'role_name', sl.role_name_vi, 'badge_label', sl.badge_label,
                               'badge_color', sl.badge_color, 'position', coalesce(a.position, sl.default_position), 'note', sl.note),
    'editable', e.status in ('draft', 'open'),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'phase_no', t.phase_no, 'phase_label', t.phase_label, 'time_label', t.time_label,
                         'area', t.area, 'task_text', t.task_text, 'status', t.status, 'note', t.note, 'status_at', t.status_at)
                       order by t.phase_no, t.sort_order, t.created_at)
                       from public.event_crew_tasks t where t.assignment_id = a.id), '[]'),
    -- Vai A (điều phối) xem tổng Xong / Vướng của từng ô và các mục Vướng mới nhất
    'summary', case when v_is_a then coalesce((select jsonb_agg(jsonb_build_object('slot_code', sl2.slot_code, 'role_name', sl2.role_name_vi,
                         'full_name', s2.full_name, 'total', x.total, 'done', x.done, 'blocked', x.blocked) order by sl2.sort_order)
                       from public.event_crew_assignments a2
                       join public.event_crew_slots sl2 on sl2.id = a2.slot_id
                       join public.students s2 on s2.id = a2.student_id
                       cross join lateral (select count(*) total, count(*) filter (where t.status = 'done') done,
                                                  count(*) filter (where t.status = 'blocked') blocked
                                           from public.event_crew_tasks t where t.assignment_id = a2.id) x
                       where a2.event_id = a.event_id), '[]') end,
    'blocked', case when v_is_a then coalesce((select jsonb_agg(jsonb_build_object('slot_code', sl2.slot_code, 'full_name', s2.full_name,
                         'task_text', t.task_text, 'note', t.note, 'status_at', t.status_at) order by t.status_at desc)
                       from public.event_crew_tasks t
                       join public.event_crew_assignments a2 on a2.id = t.assignment_id
                       join public.event_crew_slots sl2 on sl2.id = a2.slot_id
                       join public.students s2 on s2.id = a2.student_id
                       where a2.event_id = a.event_id and t.status = 'blocked'), '[]') end);
end $$;

-- Xong / Vướng / bỏ đánh dấu. Vướng bắt buộc lý do. Chỉ việc của chính mã đó, khi sự kiện chưa đóng.
create or replace function public.crew_set_task(p_code text, p_task_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_asg uuid := public.crew_assignment_for_code(p_code);
  t public.event_crew_tasks;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_asg is null then raise exception 'not_crew' using errcode = 'P0002'; end if;
  select * into t from public.event_crew_tasks where id = p_task_id and assignment_id = v_asg for update;
  if t.id is null then raise exception 'task_not_found' using errcode = 'P0002'; end if;
  if p_status not in ('open', 'done', 'blocked') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_status = 'blocked' and v_note is null then raise exception 'note_required' using errcode = '22023'; end if;
  perform set_config('app.audit_reason', 'Checklist nhân sự qua /p/' || public.normalize_code(p_code), true);
  update public.event_crew_tasks
  set status = p_status, note = case when p_status = 'blocked' then v_note when p_status = 'done' then coalesce(v_note, note) else note end,
      status_by = auth.uid(), status_at = now()
  where id = t.id
  returning * into t;
  return jsonb_build_object('id', t.id, 'status', t.status, 'note', t.note, 'status_at', t.status_at);
end $$;

grant execute on function public.crew_today(text) to anon, authenticated;
grant execute on function public.crew_set_task(text, uuid, text, text) to anon, authenticated;
