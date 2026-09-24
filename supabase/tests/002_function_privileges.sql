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
  -- Bước 6: tra tài khoản theo SĐT/email chỉ dành cho máy chủ (tránh dò tài khoản)
  if has_function_privilege('authenticated', 'public.auth_user_id_by_phone(text)', 'execute')
     or has_function_privilege('anon', 'public.auth_user_id_by_email(text)', 'execute') then
    raise exception 'FAIL: auth_user_id_by_* gọi được qua API';
  end if;
  -- Bước 11: hàm nội bộ; khách chưa đăng nhập không tự tìm con được
  if has_function_privilege('authenticated', 'public.ensure_my_guardian()', 'execute')
     or has_function_privilege('authenticated', 'public.finish_guardian_link(uuid, jsonb, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.find_child_request(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.link_request_candidates(uuid)', 'execute') then
    raise exception 'FAIL: hàm Bước 11 mở quá rộng';
  end if;
  raise exception 'ALL_OK';
end $$;
