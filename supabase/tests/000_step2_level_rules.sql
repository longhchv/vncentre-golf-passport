-- Kiểm thử quy tắc level (Bước 2): R4, R5, R7 (chờ duyệt không đổi level), R11.
do $$
declare
  sid uuid; l1 uuid; l20 uuid; cur int; rec uuid; t0 timestamptz;
begin
  insert into public.students (full_name) values ('Test Level Rules') returning id into sid;
  select l.id into l1 from public.levels l join public.programs p on p.id = l.program_id where p.code = 'core20' and l.number = 1;
  select l.id into l20 from public.levels l join public.programs p on p.id = l.program_id where p.code = 'core20' and l.number = 20;

  select l.number into cur from public.students s join public.levels l on l.id = s.current_level_id where s.id = sid;
  if cur <> 1 then raise exception 'FAIL R4: học viên mới ở level %', cur; end if;

  insert into public.level_records (student_id, level_id, source, approval_status)
  values (sid, l1, 'legacy_import', 'pending') returning id into rec;
  select l.number into cur from public.students s join public.levels l on l.id = s.current_level_id where s.id = sid;
  if cur <> 1 then raise exception 'FAIL R5/R7: level chờ duyệt làm đổi level thành %', cur; end if;

  update public.level_records set approval_status = 'approved', approved_at = now() where id = rec;
  select l.number into cur from public.students s join public.levels l on l.id = s.current_level_id where s.id = sid;
  if cur <> 2 then raise exception 'FAIL R5: sau khi duyệt Level 1, level là % (mong đợi 2)', cur; end if;

  update public.level_records set approval_status = 'rejected' where id = rec;
  select l.number into cur from public.students s join public.levels l on l.id = s.current_level_id where s.id = sid;
  if cur <> 1 then raise exception 'FAIL R5: từ chối nhưng level vẫn là %', cur; end if;

  insert into public.level_records (student_id, level_id, source, approval_status) values (sid, l20, 'admin', 'approved');
  select l.number into cur from public.students s join public.levels l on l.id = s.current_level_id where s.id = sid;
  if cur <> 20 then raise exception 'FAIL R5: vượt quá Level 20 (%)', cur; end if;

  update public.students set activated_at = '2026-01-01' where id = sid;
  select activated_at into t0 from public.students where id = sid;
  update public.students set activated_at = '2026-06-01' where id = sid;
  if (select activated_at from public.students where id = sid) <> t0 then raise exception 'FAIL R11: activated_at bị ghi đè'; end if;

  if (select full_name_normalized from public.students where id = sid) <> 'test level rules' then
    raise exception 'FAIL: tên chuẩn hoá sai';
  end if;
  if (select public.normalize_name('  Đặng   Quốc BẢO ')) <> 'dang quoc bao' then
    raise exception 'FAIL: normalize_name tiếng Việt sai';
  end if;

  raise exception 'ALL_OK';
end $$;
