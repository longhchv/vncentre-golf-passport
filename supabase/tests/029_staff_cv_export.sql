-- Module Hồ sơ nhân sự · chặng C: S-R4, S-R5, S-R6, S-R7, S-R8, S-R9 (và S-R1 trên bản đã xuất).
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

do $$
declare
  adm uuid := gen_random_uuid();
  tnv_b uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  mgr uuid := gen_random_uuid();
  ev uuid; stu uuid; g uuid; e_b uuid; e_self uuid; cred_ok uuid; cred_old uuid; cred_p uuid;
  x jsonb; snap jsonb; v jsonb; cv_id uuid; cv_code text; n int; ok boolean; v_passport text;
begin
  insert into auth.users (id, instance_id, aud, role, email, phone, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cv-adm@example.test', null, now()),
    (tnv_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cv-b@example.test', '84900000777', now()),
    (other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cv-o@example.test', null, now()),
    (mgr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cv-m@example.test', null, now());
  update public.profiles set full_name = 'Test CV Bê' where user_id = tnv_b;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  perform pg_temp.act_as(adm);
  ev := public.admin_create_event('{"name_vi":"Thử xuất CV","name_en":"CV test","event_date":"2026-10-10"}');
  perform public.admin_set_event_manager(ev, mgr, true);
  perform public.set_event_staff(ev, tnv_b, true);
  perform pg_temp.act_as(null);

  -- Hồ sơ tự chơi + sổ của B (mã định danh, QR thẻ nhân sự)
  insert into public.students (full_name) values ('Test CV Bê') returning id into stu;
  insert into public.guardians (full_name, email, user_id) values ('Test CV Bê', 'test-cv-b@example.test', tnv_b) returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, status) values (stu, g, 'self', 'active');
  insert into public.passports (tier_id, student_id, status) values ((select id from public.passport_tiers where code = 'first'), stu, 'active')
  returning passport_code into v_passport;

  select id into e_b from public.staff_engagements where user_id = tnv_b and event_id = ev;
  perform pg_temp.act_as(mgr);
  perform public.staff_record_engagement(e_b, '{"position_vi":"Hướng dẫn check-in","hours":8,"skills":["coordination"]}');

  perform pg_temp.act_as(tnv_b);
  e_self := public.staff_save_self_engagement(null, '{"project_name_vi":"Việc cũ chờ duyệt","started_on":"2024-01-01"}');
  cred_ok := public.staff_save_credential(null, '{"type":"certificate","title_vi":"CGI Level 1"}');
  cred_old := public.staff_save_credential(null, '{"type":"certificate","title_vi":"Chứng chỉ hết hạn","issued_on":"2020-01-01","expires_on":"2021-01-01"}');
  cred_p := public.staff_save_credential(null, '{"type":"certificate","title_vi":"Chứng chỉ chờ duyệt"}');

  -- Chưa gán cv_type thì chưa xuất được
  ok := false;
  begin perform public.staff_cv_export('vi', false); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: xuất CV khi chưa có mẫu CV'; end if;

  perform pg_temp.act_as(adm);
  update public.profiles set cv_type = 'volunteer' where user_id = tnv_b;
  perform public.staff_review('credential', cred_ok, true);
  perform public.staff_review('credential', cred_old, true);

  ---------------------------------------------------------------------------
  -- S5: chọn tiếng Anh còn thiếu chữ EN → liệt kê, chưa xuất được
  ---------------------------------------------------------------------------
  perform pg_temp.act_as(tnv_b);
  x := public.staff_cv_missing_en();
  select count(*) into n from jsonb_array_elements(x) i
  where (i ->> 'entity' = 'engagement' and (i ->> 'id')::uuid = e_b and i ->> 'field' = 'position')
     or (i ->> 'entity' = 'credential' and (i ->> 'id')::uuid = cred_ok);
  if n <> 2 then raise exception 'FAIL S5: danh sách thiếu chữ EN sai (%)', x; end if;
  if x::text like '%' || e_self::text || '%' or x::text like '%' || cred_p::text || '%' then
    raise exception 'FAIL S5: đòi chữ EN cho mục không in ra CV';
  end if;
  ok := false;
  begin perform public.staff_cv_export('en', false); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL S5: xuất CV tiếng Anh khi còn thiếu chữ EN'; end if;
  perform public.staff_set_en_text('engagement', e_b, '{"position_en":"Check-in guide"}');
  perform public.staff_set_en_text('credential', cred_ok, '{"title_en":"CGI Level 1"}');
  if jsonb_array_length(public.staff_cv_missing_en()) <> 0 then raise exception 'FAIL S5: vẫn báo thiếu chữ EN sau khi nhập'; end if;

  ---------------------------------------------------------------------------
  -- Xuất bản tiếng Việt, không in liên hệ
  ---------------------------------------------------------------------------
  x := public.staff_cv_export('vi', false);
  cv_id := (x ->> 'id')::uuid;
  cv_code := x ->> 'verify_code';
  snap := x -> 'data';
  -- S-R1, S-R9
  if snap::text like '%' || e_self::text || '%' or snap::text like '%' || cred_p::text || '%' then raise exception 'FAIL S-R1: CV có mục chưa duyệt'; end if;
  if snap::text like '%' || cred_old::text || '%' then raise exception 'FAIL S-R9: CV có chứng chỉ hết hạn'; end if;
  if snap::text not like '%' || cred_ok::text || '%' then raise exception 'FAIL: CV thiếu chứng chỉ đã duyệt'; end if;
  -- Tiêu chí 8: tắt in liên hệ → snapshot không có SĐT, email
  if snap -> 'person' -> 'contact' <> 'null'::jsonb or snap::text like '%test-cv-b@example.test%' or snap::text like '%900000777%' then
    raise exception 'FAIL: CV không in liên hệ vẫn có SĐT, email';
  end if;
  -- S-R8: ô thiếu nguồn không có trong snapshot (TNV chưa có chứng nhận tham gia)
  select count(*) into n from jsonb_array_elements(snap -> 'tiles') t where t -> 'value' = 'null'::jsonb or t ->> 'key' = 'certificates';
  if n <> 0 then raise exception 'FAIL S-R8: snapshot có ô không có nguồn dữ liệu'; end if;
  select count(*) into n from jsonb_array_elements(snap -> 'tiles') t where t ->> 'key' = 'hours' and (t ->> 'value')::numeric = 8;
  if n <> 1 then raise exception 'FAIL: ô giờ đóng góp sai'; end if;
  if snap ->> 'verify_url' not like '%/verify/' || cv_code then raise exception 'FAIL: link QR sai'; end if;

  -- In liên hệ khi chọn
  x := public.staff_cv_export('vi', true);
  if x -> 'data' -> 'person' -> 'contact' ->> 'email' <> 'test-cv-b@example.test' then raise exception 'FAIL: chọn in liên hệ mà không có email'; end if;
  if (x ->> 'verify_code') = cv_code then raise exception 'FAIL: hai lần xuất trùng mã'; end if;

  ---------------------------------------------------------------------------
  -- S-R5: sửa hồ sơ sau khi xuất → bản đã xuất giữ nguyên nội dung
  ---------------------------------------------------------------------------
  update public.profiles set full_name = 'Tên Đã Đổi' where user_id = tnv_b;
  perform pg_temp.act_as(mgr);
  perform public.staff_record_engagement(e_b, '{"position_vi":"Trưởng nhóm check-in","hours":20}');
  perform pg_temp.act_as(tnv_b);
  v := public.staff_cv_get(cv_id);
  if v -> 'data' <> snap then raise exception 'FAIL S-R5: nội dung CV đã xuất bị đổi'; end if;
  v := public.staff_cv_verify(cv_code);
  if v ->> 'full_name' <> 'Test CV Bê' then raise exception 'FAIL S-R5: trang xác thực đọc tên mới thay vì snapshot'; end if;

  ---------------------------------------------------------------------------
  -- S-R6, S-R7: trang xác thực công khai
  ---------------------------------------------------------------------------
  if exists (select 1 from public.certificates where verify_code = cv_code) then raise exception 'FAIL S-R6: mã CV trùng mã chứng nhận'; end if;
  perform pg_temp.act_as(null);
  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v := public.staff_cv_verify(lower(substr(cv_code, 1, 5) || '-' || substr(cv_code, 6)));
  if v ->> 'result' <> 'valid' then raise exception 'FAIL S6: mã gõ thường có gạch không nhận ra (%)', v; end if;
  if v ? 'data' or v::text like '%example.test%' or v::text like '%check-in%' or v::text like '%CGI%' then
    raise exception 'FAIL S-R7: trang xác thực công khai lộ nội dung chi tiết (%)', v;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v) k) <> array['cv_type', 'exported_at', 'full_name', 'kind', 'result', 'revoked_at', 'verify_code'] then
    raise exception 'FAIL S-R7: trang xác thực có trường ngoài danh sách cho phép (%)', v;
  end if;
  if (public.staff_cv_verify('ZZZZZZZZZZ') ->> 'result') <> 'not_found' then raise exception 'FAIL S6: mã không tồn tại'; end if;

  ---------------------------------------------------------------------------
  -- S-R4: quét QR thẻ nhân sự khi chưa đăng nhập chỉ có thẻ tóm tắt
  ---------------------------------------------------------------------------
  v := public.passport_lookup(v_passport);
  if v::text like '%example.test%' or v::text like '%900000777%' or v::text like '%' || e_b::text || '%'
     or v::text ilike '%engagement%' or v ->> 'student_id' is not null then
    raise exception 'FAIL S-R4: quét QR chưa đăng nhập trả thêm dữ liệu (%)', v;
  end if;
  ok := false;
  begin perform public.staff_my_profile(tnv_b); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S-R4: người chưa đăng nhập đọc được hồ sơ nhân sự'; end if;
  select count(*) into n from public.staff_engagements;
  if n <> 0 then raise exception 'FAIL S-R4: anon đọc được staff_engagements'; end if;

  ---------------------------------------------------------------------------
  -- Chủ hồ sơ đăng nhập quét QR: thấy bản đầy đủ (D55); người khác đăng nhập: không
  ---------------------------------------------------------------------------
  perform pg_temp.act_as(tnv_b);
  if public.staff_cv_verify(cv_code) -> 'data' <> snap then raise exception 'FAIL D55: chủ hồ sơ không thấy bản đầy đủ'; end if;
  perform pg_temp.act_as(other);
  if public.staff_cv_verify(cv_code) ? 'data' then raise exception 'FAIL D55: người khác thấy bản đầy đủ'; end if;
  ok := false;
  begin perform public.staff_cv_get(cv_id); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người khác tải được CV của B'; end if;
  ok := false;
  begin perform public.staff_cv_revoke(cv_id); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người khác thu hồi được CV của B'; end if;

  -- Thu hồi → trang xác thực báo đã thu hồi (S-R6), có nhật ký (S-R11)
  perform pg_temp.act_as(tnv_b);
  perform public.staff_cv_revoke(cv_id);
  perform pg_temp.act_as(null);
  v := public.staff_cv_verify(cv_code);
  if v ->> 'result' <> 'revoked' or v ->> 'revoked_at' is null then raise exception 'FAIL S-R6: CV thu hồi không báo đã thu hồi'; end if;
  select count(*) into n from public.audit_logs where entity_id = cv_id and reason = 'Thu hồi CV' and actor_user_id = tnv_b;
  if n < 1 then raise exception 'FAIL S-R11: thu hồi CV không có nhật ký'; end if;
  select count(*) into n from public.audit_logs where entity_id = cv_id and action = 'insert';
  if n <> 1 then raise exception 'FAIL S-R11: xuất CV không có nhật ký'; end if;

  -- S-R9: chứng chỉ quá hạn sau khi đã duyệt (hôm nay hết hạn hôm qua) không in
  update public.staff_credentials set expires_on = current_date - 1 where id = cred_ok;
  perform pg_temp.act_as(tnv_b);
  x := public.staff_cv_export('vi', false);
  if (x -> 'data')::text like '%' || cred_ok::text || '%' then raise exception 'FAIL S-R9: chứng chỉ vừa hết hạn vẫn in'; end if;

  perform pg_temp.act_as(null);
  raise exception 'ALL_OK';
end $$;
