-- Module Nhân sự sự kiện · bước 2: đủ 20 ô vai, 70 việc mẫu, 26 vật dụng, hạng "Thẻ nhân sự";
-- Vướng bắt buộc lý do; bảng mới mặc định từ chối với người không phải admin.
do $$
declare
  v_event uuid; v_student uuid; v_slot uuid; v_asg uuid; ok boolean; n int;
begin
  if (select count(*) from public.event_crew_slots) <> 20 then raise exception 'FAIL: số ô vai %', (select count(*) from public.event_crew_slots); end if;
  if (select count(*) from public.event_crew_task_templates) <> 70 then raise exception 'FAIL: số việc mẫu'; end if;
  if (select count(*) from public.event_crew_supplies) <> 26 then raise exception 'FAIL: số vật dụng'; end if;
  if (select count(distinct role_code) from public.event_crew_slots) <> 8 then raise exception 'FAIL: số vai'; end if;
  -- Mỗi vai có ô đều có việc mẫu; C1…C4 cùng nhận 12 việc của vai C
  if exists (select 1 from public.event_crew_slots s where not exists (select 1 from public.event_crew_task_templates t where t.role_code = s.role_code)) then
    raise exception 'FAIL: có ô không có việc mẫu';
  end if;
  if (select count(*) from public.event_crew_task_templates where role_code = 'C') <> 12 then raise exception 'FAIL: việc vai C'; end if;
  if not exists (select 1 from public.passport_tiers where code = 'staff' and not counts_toward_single_active and validity_months = 12 and level_from is null) then
    raise exception 'FAIL: hạng Thẻ nhân sự';
  end if;

  -- Vướng không có lý do thì không lưu được
  insert into public.events (class_id, name_vi, name_en, event_date, status)
  values ((select id from public.classes limit 1), 'Thử nhân sự', 'Crew test', current_date, 'open') returning id into v_event;
  insert into public.students (student_code, full_name, verification_status) values (public.next_student_code(), 'Nhân Sự Thử', 'verified') returning id into v_student;
  select id into v_slot from public.event_crew_slots where slot_code = 'C2';
  insert into public.event_crew_assignments (event_id, slot_id, student_id) values (v_event, v_slot, v_student) returning id into v_asg;
  insert into public.event_crew_tasks (assignment_id, phase_no, phase_label, task_text) values (v_asg, 4, '4. Vận hành', 'Việc thử');
  ok := false;
  begin
    update public.event_crew_tasks set status = 'blocked', note = '  ' where assignment_id = v_asg;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: Vướng không lý do vẫn lưu'; end if;
  update public.event_crew_tasks set status = 'blocked', note = 'Thiếu bóng' where assignment_id = v_asg;
  -- Một ô chỉ một người trong một sự kiện
  ok := false;
  begin
    insert into public.event_crew_assignments (event_id, slot_id, student_id) values (v_event, v_slot, v_student);
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: một ô hai người'; end if;

  -- Người không phải admin không đọc thẳng được bảng mới (đi qua hàm ở bước 3–4)
  execute 'set local role anon';
  select count(*) into n from public.event_crew_tasks;
  if n <> 0 then raise exception 'FAIL: anon đọc được việc của người'; end if;
  execute 'reset role';

  raise exception 'ALL_OK';
end $$;
