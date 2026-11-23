-- Spec 19 · bước 4 (phần B): ghi điểm thưởng tay theo vai, huỷ lần ghi sai, lên level tự động (Q5), sổ admin, ảnh giấy khen.
-- Tiêu chí 6. Toàn bộ bị huỷ ở cuối.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

create or replace function pg_temp.bal(p uuid) returns int language sql as $f$
  select coalesce(sum(delta), 0)::int from public.reward_ledger where student_id = p
$f$;

do $$
declare
  adm uuid := gen_random_uuid();
  head uuid := gen_random_uuid();   -- HLV trưởng
  co uuid := gen_random_uuid();     -- HLV lớp X
  asst uuid := gen_random_uuid();   -- trợ giảng lớp X
  par uuid := gen_random_uuid();
  program uuid; cx uuid; k1 uuid; k2 uuid; k3 uuid; g uuid; lvl uuid; lr uuid; lr2 uuid; old_row uuid;
  r jsonb; ok boolean; n int; l1 uuid; l_head uuid; l_theory uuid; t_row uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rwm-' || x || '@example.test', now()
  from unnest(array[adm, head, co, asst, par]) x;
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (head, 'head_coach'), (co, 'coach'), (asst, 'assistant');
  select id into program from public.programs where code = 'core20';
  insert into public.classes (name, program_id) values ('TEST RWM X', program) returning id into cx;
  insert into public.class_staff (class_id, user_id, role) values (cx, co, 'coach'), (cx, asst, 'assistant');
  insert into public.students (full_name, birth_year) values ('Test RWM Một', 2016) returning id into k1;
  insert into public.students (full_name, birth_year) values ('Test RWM Hai', 2016) returning id into k2;
  insert into public.students (full_name, birth_year) values ('Test RWM Ngoài Lớp', 2016) returning id into k3;
  insert into public.enrollments (student_id, class_id) values (k1, cx), (k2, cx);
  insert into public.guardians (full_name, phone, user_id) values ('Test PH RWM', '+84900004601', par) returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (k1, g, 'father', true, true, 'admin', 'active', now());

  ------------------------------------------------------------------ Danh mục theo vai
  perform pg_temp.act_as(co);
  r := public.reward_rules_manual();
  if not (r @> '[{"code":"school_award"}]' and r @> '[{"code":"conduct"}]' and r @> '[{"code":"theory_test"}]') then raise exception 'FAIL HLV thiếu nguồn: %', r; end if;
  if r @> '[{"code":"level_up"}]' or r @> '[{"code":"attendance"}]' then raise exception 'FAIL nguồn tự động hiện trong ghi tay'; end if;
  if (select count(*) from jsonb_array_elements(public.reward_classes())) <> 1 then raise exception 'FAIL HLV thấy lớp khác'; end if;
  if jsonb_array_length(public.reward_class_roster(cx)) <> 2 then raise exception 'FAIL danh sách lớp'; end if;
  ok := false;
  begin perform public.reward_find_students('RWM'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL HLV lớp tìm được học viên bất kỳ'; end if;

  ------------------------------------------------------------------ Tiêu chí 6: school_award không ghi chú → không lưu
  ok := false;
  begin perform public.reward_record(array[k1], null, 'school_award', 100, '  '); exception when invalid_parameter_value then ok := sqlerrm = 'note_required'; end;
  if not ok then raise exception 'FAIL school_award không ghi chú vẫn lưu'; end if;
  -- Tiêu chí 6: học viên ngoài lớp → từ chối cả lần ghi
  ok := false;
  begin perform public.reward_record(array[k1, k3], null, 'conduct', 20, null); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL HLV ghi được cho học viên ngoài lớp'; end if;
  perform pg_temp.act_as(null);
  if pg_temp.bal(k1) <> 0 or pg_temp.bal(k3) <> 0 then raise exception 'FAIL lần ghi bị từ chối vẫn sinh dòng'; end if;

  -- Ngoài khoảng min–max
  perform pg_temp.act_as(co);
  ok := false;
  begin perform public.reward_record(array[k1], null, 'conduct', 40, null); exception when invalid_parameter_value then ok := sqlerrm = 'points_out_of_range'; end;
  if not ok then raise exception 'FAIL điểm ngoài khoảng'; end if;
  ok := false;
  begin perform public.reward_record(array[k1], null, 'level_up', 200, null); exception when invalid_parameter_value then ok := sqlerrm = 'rule_unavailable'; end;
  if not ok then raise exception 'FAIL ghi tay nguồn tự động'; end if;

  -- Cả lớp: mỗi con một dòng, chung một lần ghi
  r := public.reward_record(null, cx, 'conduct', 25, 'Giúp bạn nhặt bóng');
  if (r ->> 'count')::int <> 2 then raise exception 'FAIL ghi cả lớp: %', r; end if;
  perform pg_temp.act_as(null);
  if pg_temp.bal(k1) <> 25 or pg_temp.bal(k2) <> 25 then raise exception 'FAIL số dư sau ghi cả lớp'; end if;
  if (select count(distinct source_id) from public.reward_ledger where student_id in (k1, k2) and reason = 'conduct') <> 1 then raise exception 'FAIL chung lần ghi'; end if;
  select id into l1 from public.reward_ledger where student_id = k1 and reason = 'conduct';
  if (select created_by from public.reward_ledger where id = l1) <> co then raise exception 'FAIL người ghi'; end if;

  -- Q6: trợ giảng không ghi được
  perform pg_temp.act_as(asst);
  ok := false;
  begin perform public.reward_record(array[k1], null, 'conduct', 20, null); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL trợ giảng ghi được'; end if;

  -- HLV trưởng: mọi học viên; ảnh giấy khen
  perform pg_temp.act_as(head);
  ok := false;
  begin perform public.reward_record(array[k3], null, 'school_award', 600, 'HS giỏi'); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL school_award quá max 500'; end if;
  ok := false;
  begin perform public.reward_record(array[k3], null, 'conduct', 20, null, k1 || '/x.jpg'); exception when invalid_parameter_value then ok := sqlerrm = 'attachment_not_allowed'; end;
  if not ok then raise exception 'FAIL đính ảnh cho nguồn không cho phép'; end if;
  ok := false;
  begin perform public.reward_record(array[k3], null, 'school_award', 100, 'HS giỏi', k1 || '/x.jpg'); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL ảnh của con khác'; end if;
  r := public.reward_record(array[k3], null, 'school_award', null, 'Học sinh giỏi cấp trường', k3 || '/giay-khen.jpg');
  if (r ->> 'points')::int <> 100 then raise exception 'FAIL điểm mặc định school_award'; end if;
  perform pg_temp.act_as(null);
  select id into l_head from public.reward_ledger where student_id = k3 and reason = 'school_award';
  if (select attachment_path from public.reward_ledger where id = l_head) <> k3 || '/giay-khen.jpg' then raise exception 'FAIL lưu ảnh'; end if;

  -- Bài kiểm tra: chỉ lần đạt đầu
  perform pg_temp.act_as(co);
  perform public.reward_record(array[k1], null, 'theory_test', null, null);
  ok := false;
  begin perform public.reward_record(array[k1, k2], null, 'theory_test', null, null); exception when invalid_parameter_value then ok := sqlerrm = 'already_passed'; end;
  if not ok then raise exception 'FAIL đạt lý thuyết lần 2'; end if;

  ------------------------------------------------------------------ Huỷ lần ghi sai
  perform pg_temp.act_as(null);
  select id into l_theory from public.reward_ledger where student_id = k1 and reason = 'theory_test';
  perform pg_temp.act_as(co);
  ok := false;
  begin perform public.reward_void(l_theory, ''); exception when invalid_parameter_value then ok := sqlerrm = 'reason_required'; end;
  if not ok then raise exception 'FAIL huỷ không lý do'; end if;
  perform public.reward_void(l_theory, 'Ghi nhầm con');
  ok := false;
  begin perform public.reward_void(l_theory, 'lần 2'); exception when invalid_parameter_value then ok := sqlerrm = 'already_voided'; end;
  if not ok then raise exception 'FAIL huỷ hai lần'; end if;
  perform public.reward_record(array[k1], null, 'theory_test', null, null);    -- đã huỷ thì ghi lại được
  ok := false;
  begin perform public.reward_void(l_head, 'không phải của tôi'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL HLV huỷ dòng người khác ghi'; end if;
  r := public.reward_recent_records(7);
  if exists (select 1 from jsonb_array_elements(r) x where x ->> 'id' = l_head::text) then raise exception 'FAIL HLV thấy dòng người khác'; end if;
  if not exists (select 1 from jsonb_array_elements(r) x where x ->> 'id' = l_theory::text and (x ->> 'voided')::boolean) then raise exception 'FAIL danh sách gần đây'; end if;
  perform pg_temp.act_as(null);
  if pg_temp.bal(k1) <> 25 + 50 then raise exception 'FAIL số dư sau huỷ: %', pg_temp.bal(k1); end if;
  -- quá 7 ngày: người ghi không huỷ được, admin được
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, rule_id, created_by, created_at)
  select k1, 20, 'conduct', 'reward_rule', gen_random_uuid(), id, co, now() - interval '8 days' from public.reward_rules where code = 'conduct'
  returning id into old_row;
  perform pg_temp.act_as(co);
  ok := false;
  begin perform public.reward_void(old_row, 'muộn'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL huỷ quá 7 ngày'; end if;
  perform pg_temp.act_as(adm);
  perform public.reward_void(old_row, 'admin huỷ');
  -- dòng không phải ghi tay thì không huỷ bằng reward_void
  perform pg_temp.act_as(null);
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id) values (k1, 10, 'partner_visit', 'partner_visit', gen_random_uuid()) returning id into t_row;
  perform pg_temp.act_as(adm);
  ok := false;
  begin perform public.reward_void(t_row, 'x'); exception when invalid_parameter_value then ok := sqlerrm = 'not_voidable'; end;
  if not ok then raise exception 'FAIL huỷ dòng đối tác bằng manual_void'; end if;

  ------------------------------------------------------------------ Admin: tìm học viên, sổ theo học viên / nguồn / tháng
  if jsonb_array_length(public.reward_find_students('Test RWM')) <> 3 then raise exception 'FAIL admin tìm học viên'; end if;
  r := public.reward_admin_ledger(k1, null, current_date, 500);
  if (r ->> 'total')::int <> pg_temp.bal(k1) then raise exception 'FAIL tổng sổ admin: %', r ->> 'total'; end if;
  r := public.reward_admin_ledger(null, 'school_award', null, 500);
  if not exists (select 1 from jsonb_array_elements(r -> 'rows') x where x ->> 'student_id' = k3::text and x ->> 'source_vi' = 'Khen thưởng ở trường') then
    raise exception 'FAIL lọc theo nguồn';
  end if;
  perform pg_temp.act_as(co);
  ok := false;
  begin perform public.reward_admin_ledger(null, null, null, 10); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL HLV xem sổ admin'; end if;

  ------------------------------------------------------------------ Q5: lên level tự động khi duyệt (assessment), không cộng dữ liệu cũ
  perform pg_temp.act_as(null);
  select l.id into lvl from public.levels l join public.programs p on p.id = l.program_id where p.code = 'core20' order by l.number limit 1;
  n := pg_temp.bal(k2);
  insert into public.level_records (student_id, level_id, status, completed_at, source, approval_status, approved_by, approved_at)
  values (k2, lvl, 'completed', current_date, 'assessment', 'pending', null, null) returning id into lr;
  if pg_temp.bal(k2) <> n then raise exception 'FAIL cộng khi chưa duyệt'; end if;
  update public.level_records set approval_status = 'approved', approved_by = head, approved_at = now() where id = lr;
  if pg_temp.bal(k2) <> n + 200 then raise exception 'FAIL lên level phải +200'; end if;
  update public.level_records set note = 'sửa ghi chú' where id = lr;
  if pg_temp.bal(k2) <> n + 200 then raise exception 'FAIL sửa không liên quan sinh dòng'; end if;
  update public.level_records set approval_status = 'rejected' where id = lr;
  if pg_temp.bal(k2) <> n then raise exception 'FAIL huỷ duyệt phải trừ'; end if;
  update public.level_records set approval_status = 'approved' where id = lr;
  if pg_temp.bal(k2) <> n + 200 or (select count(*) from public.reward_ledger where source_id = lr and reason = 'level_up') <> 1 then
    raise exception 'FAIL duyệt lại';
  end if;
  delete from public.level_records where id = lr;
  if pg_temp.bal(k2) <> n then raise exception 'FAIL xoá bản ghi level phải trừ'; end if;
  -- dữ liệu cũ / nhập lịch sử: không cộng
  insert into public.level_records (student_id, level_id, status, completed_at, source, approval_status, approved_at)
  values (k2, lvl, 'completed', current_date, 'legacy_import', 'approved', now()) returning id into lr2;
  insert into public.level_records (student_id, level_id, status, completed_at, source, approval_status, approved_at)
  values (k2, lvl, 'completed', '2025-01-01', 'assessment', 'approved', now() - interval '400 days');
  if pg_temp.bal(k2) <> n then raise exception 'FAIL cộng level cho dữ liệu cũ'; end if;

  ------------------------------------------------------------------ Ví phụ huynh hiện tên nguồn ghi tay; ảnh giấy khen (kho riêng tư)
  perform pg_temp.act_as(par);
  r := public.reward_balance(k1);
  if not exists (select 1 from jsonb_array_elements(r -> 'recent') x where x #>> '{rule,name_vi}' = 'Ứng xử tốt') then raise exception 'FAIL ví thiếu tên nguồn'; end if;
  perform pg_temp.act_as(null);
  grant select, insert on storage.objects to authenticated;     -- Supabase cấp sẵn; PGlite thì không
  perform pg_temp.act_as(co);
  insert into storage.objects (bucket_id, name, owner) values ('reward-proofs', k1 || '/a.jpg', co);
  ok := false;
  begin insert into storage.objects (bucket_id, name, owner) values ('reward-proofs', k3 || '/a.jpg', co); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL HLV tải ảnh cho con ngoài lớp'; end if;
  perform pg_temp.act_as(par);
  if (select count(*) from storage.objects where bucket_id = 'reward-proofs' and name = k1 || '/a.jpg') <> 1 then raise exception 'FAIL phụ huynh không xem được ảnh của con'; end if;
  perform pg_temp.act_as(asst);
  if (select count(*) from storage.objects where bucket_id = 'reward-proofs') <> 0 then raise exception 'FAIL trợ giảng xem được ảnh'; end if;

  perform pg_temp.act_as(null);
  if has_function_privilege('authenticated', 'public.reward_sync_level(uuid)', 'execute') then raise exception 'FAIL reward_sync_level lộ ra ngoài'; end if;
  if has_function_privilege('anon', 'public.reward_record(uuid[], uuid, text, integer, text, text)', 'execute') then raise exception 'FAIL anon ghi điểm'; end if;

  raise exception 'ALL_OK';
end $$;
