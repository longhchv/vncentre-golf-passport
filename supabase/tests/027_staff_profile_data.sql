-- Module Hồ sơ nhân sự · chặng A: tự sinh engagement, S-R1, S-R2, S-R3, S-R10, S-R11, S-R12.
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
  coach_a uuid := gen_random_uuid();     -- HLV A: 2 lớp
  tnv_b uuid := gen_random_uuid();       -- TNV B: event_staff sự kiện 1
  tnv_d uuid := gen_random_uuid();       -- TNV D: crew sự kiện 1, kích hoạt tài khoản sau
  mgr uuid := gen_random_uuid();         -- người phụ trách sự kiện 1
  mgr2 uuid := gen_random_uuid();        -- người phụ trách sự kiện 2
  head_x uuid := gen_random_uuid();      -- HLV trưởng của lớp X (class_staff)
  head_all uuid := gen_random_uuid();    -- HLV trưởng toàn trung tâm (user_roles)
  coach_plain uuid := gen_random_uuid(); -- HLV thường của lớp X
  ev uuid; ev2 uuid; school uuid; program uuid; class_x uuid; class_y uuid;
  stu_d uuid; g_d uuid; slot_e uuid;
  class_z uuid; e_b uuid; e_ax uuid; e_ay uuid; e_az uuid; e_d uuid; e_self uuid; e_rej uuid;
  cred_p uuid; cred_ok uuid; cred_old uuid; cv uuid;
  n int; ok boolean; x jsonb; q jsonb; r record;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-st-adm@example.test', now()),
    (coach_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-st-a@example.test', now()),
    (tnv_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-st-b@example.test', now()),
    (tnv_d, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-st-d@example.test', now()),
    (mgr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-st-mgr@example.test', now()),
    (mgr2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-st-mgr2@example.test', now()),
    (head_x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-st-hx@example.test', now()),
    (head_all, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-st-ha@example.test', now()),
    (coach_plain, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-st-cp@example.test', now());
  update public.profiles set full_name = 'Test NS ' || substr(user_id::text, 1, 4)
  where user_id in (adm, coach_a, tnv_b, tnv_d, mgr, mgr2, head_x, head_all, coach_plain);
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (head_all, 'head_coach'), (coach_a, 'coach');

  perform pg_temp.act_as(adm);
  ev := public.admin_create_event('{"name_vi":"Thử hồ sơ NS","event_date":"2026-10-10"}');
  ev2 := public.admin_create_event('{"name_vi":"Thử hồ sơ NS 2","event_date":"2026-10-11"}');
  update public.profiles set cv_type = 'coach', joined_vncentre_on = '2024-09-01' where user_id = coach_a;
  update public.profiles set cv_type = 'volunteer' where user_id in (tnv_b, tnv_d);
  perform public.admin_set_event_manager(ev, mgr, true);
  perform public.admin_set_event_manager(ev2, mgr2, true);
  perform pg_temp.act_as(null);

  select id into school from public.schools order by created_at limit 1;
  select id into program from public.programs where code = 'core20';
  insert into public.classes (name, school_id, program_id, start_date, end_date) values ('TEST NS X', school, program, '2025-09-01', '2026-05-31') returning id into class_x;
  insert into public.classes (name, school_id, program_id, start_date, end_date) values ('TEST NS Y', school, program, '2025-09-01', '2026-05-31') returning id into class_y;

  ---------------------------------------------------------------------------
  -- Tự sinh: class_staff → 2 dòng giảng dạy, đã xác thực
  ---------------------------------------------------------------------------
  insert into public.class_staff (class_id, user_id, role) values
    (class_x, coach_a, 'coach'), (class_y, coach_a, 'coach'), (class_x, head_x, 'head_coach'), (class_x, coach_plain, 'coach');
  select count(*) into n from public.staff_engagements
  where user_id = coach_a and kind = 'class' and source = 'system' and status = 'approved' and staff_group = 'coach' and deleted_at is null;
  if n <> 2 then raise exception 'FAIL: HLV A có % dòng giảng dạy (mong đợi 2)', n; end if;
  select id into e_ax from public.staff_engagements where user_id = coach_a and class_id = class_x;
  select id into e_ay from public.staff_engagements where user_id = coach_a and class_id = class_y;
  if (select started_on from public.staff_engagements where id = e_ax) <> '2025-09-01' then raise exception 'FAIL: ngày bắt đầu lớp sai'; end if;

  -- Tự sinh: event_staff → dòng sự kiện, vị trí để trống
  perform pg_temp.act_as(adm);
  perform public.set_event_staff(ev, tnv_b, true);
  perform pg_temp.act_as(null);
  select id into e_b from public.staff_engagements where user_id = tnv_b and event_id = ev and kind = 'event' and deleted_at is null;
  if e_b is null then raise exception 'FAIL: gán event_staff không sinh dòng sự kiện'; end if;
  select * into r from public.staff_engagements where id = e_b;
  if r.source <> 'system' or r.status <> 'approved' or r.position_vi is not null or r.started_on <> '2026-10-10' then
    raise exception 'FAIL: dòng sự kiện tự sinh sai (% % % %)', r.source, r.status, r.position_vi, r.started_on;
  end if;

  -- Tự sinh: crew chưa có tài khoản → chưa có dòng; gắn tài khoản sau → sinh bù, vị trí lấy theo ô
  insert into public.students (full_name) values ('Test NS Crew D') returning id into stu_d;
  insert into public.guardians (full_name, email) values ('Test NS Crew D', 'test-st-d@example.test') returning id into g_d;
  insert into public.student_guardians (student_id, guardian_id, relationship, status) values (stu_d, g_d, 'self', 'active');
  select id into slot_e from public.event_crew_slots
  where public.staff_group_for_slot(role_code, badge_label) = 'volunteer' order by sort_order limit 1;
  insert into public.event_crew_assignments (event_id, slot_id, student_id, position) values (ev, slot_e, stu_d, 'Hướng dẫn check-in');
  select count(*) into n from public.staff_engagements where user_id = tnv_d;
  if n <> 0 then raise exception 'FAIL: crew chưa có tài khoản đã có dòng'; end if;
  update public.guardians set user_id = tnv_d where id = g_d;
  select id into e_d from public.staff_engagements where user_id = tnv_d and event_id = ev and deleted_at is null;
  if e_d is null then raise exception 'FAIL: kích hoạt tài khoản không sinh bù dòng crew'; end if;
  if (select position_vi || '/' || staff_group from public.staff_engagements where id = e_d) <> 'Hướng dẫn check-in/volunteer' then
    raise exception 'FAIL: dòng crew sai vị trí hoặc nhóm';
  end if;

  ---------------------------------------------------------------------------
  -- S-R10: người phụ trách chỉ ghi nhận trong sự kiện, lớp của mình
  ---------------------------------------------------------------------------
  perform pg_temp.act_as(mgr);
  perform public.staff_record_engagement(e_b, '{"position_vi":"Hướng dẫn check-in","hours":8,"skills":["coordination","guest_reception"]}');
  select count(*) into n from public.staff_engagements where id in (e_b, e_d);
  if n <> 2 then raise exception 'FAIL S-R10: người phụ trách không thấy nhân sự sự kiện mình (% dòng)', n; end if;
  select count(*) into n from public.staff_engagements where id = e_ax;
  if n <> 0 then raise exception 'FAIL S-R10: người phụ trách sự kiện thấy dòng của lớp'; end if;
  ok := false;
  begin perform public.staff_record_engagement(e_ax, '{"hours":1}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S-R10: người phụ trách sự kiện ghi được cho lớp'; end if;

  perform pg_temp.act_as(mgr2);
  ok := false;
  begin perform public.staff_record_engagement(e_b, '{"hours":2}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S-R10: người phụ trách sự kiện khác ghi được'; end if;

  -- Người phụ trách không tự ghi nhận cho dòng của chính mình
  perform pg_temp.act_as(adm);
  perform public.set_event_staff(ev, mgr, true);
  perform pg_temp.act_as(mgr);
  ok := false;
  begin
    perform public.staff_record_engagement((select id from public.staff_engagements where user_id = mgr and event_id = ev), '{"hours":20}');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S-R10: người phụ trách tự ghi nhận cho mình'; end if;

  -- Lớp: HLV trưởng của lớp X và HLV trưởng toàn trung tâm được; HLV thường không
  perform pg_temp.act_as(head_x);
  perform public.staff_record_engagement(e_ax, '{"position_vi":"HLV chính"}');
  ok := false;
  begin perform public.staff_record_engagement(e_ay, '{"position_vi":"HLV chính"}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S-R10: HLV trưởng lớp X ghi được cho lớp Y'; end if;
  perform pg_temp.act_as(head_all);
  perform public.staff_record_engagement(e_ay, '{"position_vi":"HLV chính"}');
  perform pg_temp.act_as(coach_plain);
  ok := false;
  begin perform public.staff_record_engagement(e_ax, '{"hours":3}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S-R10: HLV thường ghi nhận được'; end if;
  perform pg_temp.act_as(null);

  select count(*) into n from public.staff_skill_records where engagement_id = e_b;
  if n <> 2 then raise exception 'FAIL: dòng B có % kỹ năng (mong đợi 2)', n; end if;
  if (select confirmed_by from public.staff_engagements where id = e_b) <> mgr then raise exception 'FAIL: confirmed_by không phải người phụ trách'; end if;

  ---------------------------------------------------------------------------
  -- S-R3
  ---------------------------------------------------------------------------
  perform pg_temp.act_as(tnv_b);
  select count(*) into n from public.staff_engagements where id = e_b;
  if n <> 1 then raise exception 'FAIL: B không xem được dòng của mình'; end if;
  update public.staff_engagements set position_vi = 'Trưởng ban', hours = 100 where id = e_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL S-R3: B sửa thẳng được dòng sự kiện'; end if;
  ok := false;
  begin
    insert into public.staff_skill_records (user_id, engagement_id, skill_code) values (tnv_b, e_b, 'communications');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S-R3: B tự ghi được kỹ năng'; end if;
  ok := false;
  begin perform public.staff_save_self_engagement(e_b, '{"project_name_vi":"x","started_on":"2026-10-10"}');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S-R3: B sửa được dòng system qua hàm tự khai'; end if;
  ok := false;
  begin perform public.staff_record_engagement(e_b, '{"hours":100}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S-R3: B tự ghi nhận được dòng system'; end if;
  ok := false;
  begin update public.profiles set cv_type = 'organizer' where user_id = tnv_b; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S-R3: B tự đổi được cv_type'; end if;
  update public.profiles set show_contact_on_cv = true where user_id = tnv_b;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B không bật được in liên hệ'; end if;

  -- Trừ chữ EN: sửa được, có audit_logs kèm lý do
  perform public.staff_set_en_text('engagement', e_b, '{"position_en":"Check-in guide"}');
  perform pg_temp.act_as(null);
  if (select position_en from public.staff_engagements where id = e_b) <> 'Check-in guide' then raise exception 'FAIL S-R3: không lưu được chữ EN'; end if;
  select count(*) into n from public.audit_logs where entity_type = 'staff_engagements' and entity_id = e_b and actor_user_id = tnv_b
    and reason = 'Chủ hồ sơ nhập chữ tiếng Anh' and after ->> 'position_en' = 'Check-in guide';
  if n < 1 then raise exception 'FAIL S-R3: sửa chữ EN không ghi audit_logs'; end if;
  perform pg_temp.act_as(coach_a);
  ok := false;
  begin perform public.staff_set_en_text('engagement', e_b, '{"position_en":"hack"}'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL S-R3: người khác sửa được chữ EN của B'; end if;

  ---------------------------------------------------------------------------
  -- Tự khai + duyệt (dữ liệu cho S-R1, S-R2, S-R11, S-R12)
  ---------------------------------------------------------------------------
  perform pg_temp.act_as(tnv_b);
  e_self := public.staff_save_self_engagement(null, '{"project_name_vi":"TNV giải trẻ 2024","position_vi":"Hậu cần","started_on":"2024-05-01","staff_group":"volunteer"}');
  e_rej := public.staff_save_self_engagement(null, '{"project_name_vi":"Việc bị từ chối","started_on":"2023-01-01"}');
  cred_p := public.staff_save_credential(null, '{"type":"certificate","title_vi":"Chứng chỉ chờ duyệt"}');
  cred_ok := public.staff_save_credential(null, '{"type":"certificate","title_vi":"CGI Level 1","issuer":"R&A"}');
  cred_old := public.staff_save_credential(null, '{"type":"certificate","title_vi":"Chứng chỉ hết hạn","issued_on":"2020-01-01","expires_on":"2021-01-01"}');
  if (select status from public.staff_engagements where id = e_self) <> 'pending_review' then raise exception 'FAIL: tự khai không ở trạng thái chờ duyệt'; end if;
  ok := false;
  begin perform public.staff_save_credential(null, format('{"type":"certificate","title_vi":"x","file_path":"%s/credentials/a.pdf"}', coach_a)::jsonb);
  exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: tự khai trỏ được file của người khác'; end if;
  ok := false;
  begin perform public.staff_review('engagement', e_self, true); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: B tự duyệt được mục của mình'; end if;

  -- S-R12: hồ sơ nhân sự không vào hàng chờ F12
  perform pg_temp.act_as(adm);
  q := public.review_queue();
  if q::text like '%' || e_self::text || '%' or q::text like '%' || cred_p::text || '%' then
    raise exception 'FAIL S-R12: mục tự khai của nhân sự lọt vào hàng chờ F12';
  end if;
  x := public.staff_review_queue();
  select count(*) into n from jsonb_array_elements(x -> 'engagements') i where (i ->> 'id')::uuid in (e_self, e_rej);
  if n <> 2 then raise exception 'FAIL S-R12: hàng chờ nhân sự thiếu việc tự khai (% / 2)', n; end if;
  select count(*) into n from jsonb_array_elements(x -> 'credentials') i where (i ->> 'id')::uuid in (cred_p, cred_ok, cred_old);
  if n <> 3 then raise exception 'FAIL S-R12: hàng chờ nhân sự thiếu chứng chỉ (% / 3)', n; end if;

  perform public.staff_review('engagement', e_self, true);
  ok := false;
  begin perform public.staff_review('engagement', e_rej, false, ''); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: từ chối không cần lý do'; end if;
  perform public.staff_review('engagement', e_rej, false, 'Không có minh chứng');
  perform public.staff_review('credential', cred_ok, true);
  perform public.staff_review('credential', cred_old, true);
  ok := false;
  begin perform public.staff_review('engagement', e_b, true); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL: duyệt được dòng system như mục tự khai'; end if;

  -- B thấy lý do bị từ chối
  perform pg_temp.act_as(tnv_b);
  if (select rejected_reason from public.staff_engagements where id = e_rej) <> 'Không có minh chứng' then
    raise exception 'FAIL: B không thấy lý do bị từ chối';
  end if;

  ---------------------------------------------------------------------------
  -- S-R1, S-R2: chỉ mục approved vào CV; system/manager = Đã xác thực, self = Đã duyệt; chứng chỉ hết hạn không in
  ---------------------------------------------------------------------------
  x := public.staff_cv_items(tnv_b);
  if x::text like '%' || e_rej::text || '%' then raise exception 'FAIL S-R1: mục bị từ chối có trong CV'; end if;
  if x::text like '%' || cred_p::text || '%' then raise exception 'FAIL S-R1: chứng chỉ chờ duyệt có trong CV'; end if;
  if x::text like '%' || cred_old::text || '%' then raise exception 'FAIL S-R9: chứng chỉ hết hạn có trong CV'; end if;
  select count(*) into n from jsonb_array_elements(x -> 'engagements') i where (i ->> 'id')::uuid = e_b and i ->> 'badge' = 'verified';
  if n <> 1 then raise exception 'FAIL S-R2: dòng system không mang dấu Đã xác thực'; end if;
  select count(*) into n from jsonb_array_elements(x -> 'engagements') i where (i ->> 'id')::uuid = e_self and i ->> 'badge' = 'approved';
  if n <> 1 then raise exception 'FAIL S-R2: dòng tự khai đã duyệt không mang dấu Đã duyệt'; end if;
  select count(*) into n from jsonb_array_elements(x -> 'credentials') i where (i ->> 'id')::uuid = cred_ok and i ->> 'badge' = 'approved';
  if n <> 1 then raise exception 'FAIL: chứng chỉ đã duyệt không có trong CV'; end if;

  -- Sửa nội dung mục đã duyệt → quay lại chờ duyệt, rời CV (S-R1)
  perform public.staff_save_self_engagement(e_self, '{"project_name_vi":"TNV giải trẻ 2024","position_vi":"Trưởng ban hậu cần","started_on":"2024-05-01","staff_group":"volunteer"}');
  x := public.staff_cv_items(tnv_b);
  if x::text like '%' || e_self::text || '%' then raise exception 'FAIL S-R1: mục sửa sau khi duyệt vẫn ở trên CV'; end if;
  -- Chỉ nhập chữ EN thì giữ trạng thái đã duyệt
  perform public.staff_set_en_text('credential', cred_ok, '{"title_en":"CGI Level 1"}');
  if (select status from public.staff_credentials where id = cred_ok) <> 'approved' then raise exception 'FAIL: nhập chữ EN làm mất trạng thái duyệt'; end if;

  -- Người khác không xem được hồ sơ nhân sự của B
  perform pg_temp.act_as(coach_a);
  select count(*) into n from public.staff_credentials where user_id = tnv_b;
  if n <> 0 then raise exception 'FAIL: người khác xem được chứng chỉ của B'; end if;
  select count(*) into n from public.staff_engagements where user_id = tnv_b;
  if n <> 0 then raise exception 'FAIL: người khác xem được engagement của B'; end if;
  ok := false;
  begin perform public.staff_cv_items(tnv_b); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: người khác đọc được dữ liệu CV của B'; end if;

  ---------------------------------------------------------------------------
  -- S-R11: thay đổi engagement, duyệt, từ chối, xuất và thu hồi CV đều ghi audit_logs
  ---------------------------------------------------------------------------
  perform pg_temp.act_as(mgr);
  perform public.staff_record_engagement(e_b, '{"hours":8}');
  perform pg_temp.act_as(adm);
  insert into public.staff_cv_exports (user_id, cv_type, lang, data, exported_by) values (tnv_b, 'volunteer', 'vi', '{}', adm) returning id into cv;
  update public.staff_cv_exports set status = 'revoked', revoked_at = now(), revoked_by = adm where id = cv;
  perform pg_temp.act_as(null);
  select count(*) into n from public.audit_logs where entity_id = e_b and actor_user_id = mgr and reason = 'Người phụ trách ghi nhận';
  if n < 1 then raise exception 'FAIL S-R11: ghi nhận engagement không có nhật ký'; end if;
  select count(*) into n from public.audit_logs where entity_id = e_self and actor_user_id = adm and reason = 'Duyệt hồ sơ nhân sự';
  if n < 1 then raise exception 'FAIL S-R11: duyệt không có nhật ký'; end if;
  select count(*) into n from public.audit_logs where entity_id = e_rej and reason = 'Từ chối: Không có minh chứng';
  if n < 1 then raise exception 'FAIL S-R11: từ chối không có nhật ký'; end if;
  select count(*) into n from public.audit_logs where entity_id = cred_ok and reason = 'Duyệt hồ sơ nhân sự';
  if n < 1 then raise exception 'FAIL S-R11: duyệt chứng chỉ không có nhật ký'; end if;
  select count(*) into n from public.audit_logs where entity_type = 'staff_cv_exports' and entity_id = cv;
  if n <> 2 then raise exception 'FAIL S-R11: xuất / thu hồi CV có % dòng nhật ký (mong đợi 2)', n; end if;
  select count(*) into n from public.audit_logs where entity_type = 'staff_engagements' and entity_id = e_self and action = 'insert' and actor_user_id = tnv_b;
  if n <> 1 then raise exception 'FAIL S-R11: tự khai không có nhật ký'; end if;

  -- Mã CV không trùng mã chứng nhận (chặn ở trigger)
  ok := false;
  begin
    insert into public.staff_cv_exports (verify_code, user_id, cv_type, lang, data)
    select c.verify_code, tnv_b, 'volunteer', 'vi', '{}' from public.certificates c where c.verify_code is not null limit 1;
    if not found then ok := true; end if;
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL: mã CV trùng được mã chứng nhận'; end if;

  ---------------------------------------------------------------------------
  -- Gỡ gán: dòng chưa ghi nhận thì xoá mềm, đã ghi nhận thì giữ; gán lại thì hiện lại
  ---------------------------------------------------------------------------
  insert into public.classes (name, school_id, program_id) values ('TEST NS Z', school, program) returning id into class_z;
  insert into public.class_staff (class_id, user_id, role) values (class_z, coach_a, 'coach');
  select id into e_az from public.staff_engagements where user_id = coach_a and class_id = class_z;
  delete from public.class_staff where class_id = class_z and user_id = coach_a;
  if (select deleted_at from public.staff_engagements where id = e_az) is null then raise exception 'FAIL: gỡ lớp không xoá mềm dòng chưa ghi nhận'; end if;
  insert into public.class_staff (class_id, user_id, role) values (class_z, coach_a, 'coach');
  if (select deleted_at from public.staff_engagements where id = e_az) is not null then raise exception 'FAIL: gán lại lớp không hiện lại dòng'; end if;
  delete from public.class_staff where class_id = class_x and user_id = coach_a;
  if (select deleted_at from public.staff_engagements where id = e_ax) is not null then raise exception 'FAIL: gỡ lớp xoá dòng đã ghi nhận'; end if;
  delete from public.event_crew_assignments where student_id = stu_d;
  if (select deleted_at from public.staff_engagements where id = e_d) is null then raise exception 'FAIL: bớt người crew không xoá mềm dòng chưa ghi nhận'; end if;
  perform pg_temp.act_as(adm);
  perform public.set_event_staff(ev, tnv_b, false);
  perform pg_temp.act_as(null);
  if (select deleted_at from public.staff_engagements where id = e_b) is not null then raise exception 'FAIL: gỡ event_staff xoá dòng đã ghi nhận'; end if;

  raise exception 'ALL_OK';
end $$;
