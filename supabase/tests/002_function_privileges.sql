-- Kiểm thử: hàm nội bộ không mở qua API (R3 và nguyên tắc mặc định từ chối).
do $$
begin
  if has_function_privilege('authenticated', 'public.find_student_matches(text, date, uuid)', 'execute')
     or has_function_privilege('anon', 'public.find_student_matches(text, date, uuid)', 'execute') then
    raise exception 'FAIL R3: find_student_matches gọi được qua API';
  end if;
  if has_function_privilege('authenticated', 'public.recompute_student_level(uuid)', 'execute') then
    raise exception 'FAIL: recompute_student_level gọi được qua API';
  end if;
  if has_function_privilege('anon', 'public.import_commit_student_list(uuid)', 'execute') then
    raise exception 'FAIL: khách gọi được import_commit_student_list';
  end if;
  raise exception 'ALL_OK';
end $$;
