-- Spec 24 · đợt 3: cộng điểm thưởng cho thẻ thử thách và bài HLV giao, cộng bù, giới hạn điểm tự xác nhận. Dữ liệu thử bị huỷ ở cuối.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

create or replace function pg_temp.made(p_code text) returns int[] language sql as $f$
  select array_agg((p ->> 'target')::int order by i)
  from public.training_challenges c, jsonb_array_elements(c.parts) with ordinality as x(p, i) where c.code = p_code
$f$;

create or replace function pg_temp.pts(s uuid) returns int language sql as $f$
  select coalesce(sum(delta), 0)::int from public.reward_ledger where student_id = s and reason in ('training_challenge', 'training_assignment')
$f$;

do $$
declare
  co uuid := gen_random_uuid();   -- HLV lớp
  pa uuid := gen_random_uuid();   -- phụ huynh
  ad uuid := gen_random_uuid();   -- người lớn tự tập
  s12 uuid; sb uuid; sa uuid; g uuid; cls uuid; sc uuid; ay uuid; prog uuid; ctype uuid; lvl uuid;
  r jsonb; n int; asg uuid; asg2 uuid; v int; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-trw-' || x || '@example.test', now()
  from unnest(array[co, pa, ad]) x;
  insert into public.profiles (user_id, full_name) select x, 'Test TRW' from unnest(array[co, pa, ad]) x on conflict do nothing;
  insert into public.user_roles (user_id, role) values (co, 'coach');
  update public.app_settings set value = '"all"' where key = 'training.visibility';
  update public.app_settings set value = '{"per_week":60}' where key = 'training.self_points_cap';

  insert into public.students (full_name, date_of_birth) values ('Test TRW 12', (public.vn_today() - interval '12 years 1 month')::date) returning id into s12;
  insert into public.students (full_name, date_of_birth) values ('Test TRW cũ', (public.vn_today() - interval '11 years')::date) returning id into sb;
  insert into public.guardians (full_name, phone, user_id) values ('Test PH TRW', '+84900005901', pa) returning id into g;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (s12, g, 'mother', true, true, 'admin', 'active', now()), (sb, g, 'mother', true, true, 'admin', 'active', now());

  insert into public.schools (name, type) values ('TH Test TRW', 'public') returning id into sc;
  select id into ay from public.academic_years order by is_current desc limit 1;
  select id into prog from public.programs where code = 'core20';
  select id into ctype from public.class_types limit 1;
  insert into public.classes (name, school_id, academic_year_id, program_id, class_type_id) values ('Lớp TRW', sc, ay, prog, ctype) returning id into cls;
  insert into public.class_staff (class_id, user_id, role) values (cls, co, 'coach');
  insert into public.enrollments (student_id, class_id) values (s12, cls), (sb, cls);
  select l.id into lvl from public.levels l where l.program_id = prog and l.number = 10;
  update public.students set current_level_id = lvl where id in (s12, sb);

  -- 1. Cộng bù: lượt đạt có từ đợt 2 (trước khi có trigger) được cộng khi chạy hàm bù, chạy lại không cộng thêm
  alter table public.training_challenge_results disable trigger training_results_reward;
  insert into public.training_challenge_results (student_id, challenge_id, made, status, submitted_as, reviewed_by, reviewed_at)
  values (sb, (select id from public.training_challenges where code = 'L10-TEE'), pg_temp.made('L10-TEE'), 'approved', 'coach', co, now());
  alter table public.training_challenge_results enable trigger training_results_reward;
  if pg_temp.pts(sb) <> 0 then raise exception 'FAIL đã cộng khi trigger tắt'; end if;
  r := public.training_reward_backfill();
  if pg_temp.pts(sb) <> 30 then raise exception 'FAIL cộng bù: % điểm', pg_temp.pts(sb); end if;
  r := public.training_reward_backfill();
  if pg_temp.pts(sb) <> 30 or (r ->> 'points')::int <> 0 then raise exception 'FAIL cộng bù lần 2 cộng thêm: %', r; end if;

  -- 2. Phụ huynh xác nhận đã xem: thẻ lên level +30; làm lại thẻ đó không cộng thêm
  perform pg_temp.act_as(pa);
  r := public.training_submit_result(s12, (select id from public.training_challenges where code = 'L10-TEE'), pg_temp.made('L10-TEE'), null, true);
  if r ->> 'status' <> 'approved' then raise exception 'FAIL lượt phụ huynh: %', r; end if;
  perform pg_temp.act_as(null);
  if pg_temp.pts(s12) <> 30 then raise exception 'FAIL thẻ đầu: %', pg_temp.pts(s12); end if;
  perform pg_temp.act_as(pa);
  r := public.training_submit_result(s12, (select id from public.training_challenges where code = 'L10-TEE'), pg_temp.made('L10-TEE'), null, true);
  perform pg_temp.act_as(null);
  if pg_temp.pts(s12) <> 30 then raise exception 'FAIL cộng hai lần một thẻ'; end if;

  -- 3. Giới hạn tự xác nhận 60 điểm/tuần: thẻ thứ 2 +30, thẻ thứ 3 không cộng
  perform pg_temp.act_as(pa);
  r := public.training_submit_result(s12, (select id from public.training_challenges where code = 'L10-APR'), pg_temp.made('L10-APR'), null, true);
  r := public.training_submit_result(s12, (select id from public.training_challenges where code = 'L10-PIT'), pg_temp.made('L10-PIT'), null, true);
  perform pg_temp.act_as(null);
  if pg_temp.pts(s12) <> 60 then raise exception 'FAIL giới hạn tuần: % điểm', pg_temp.pts(s12); end if;

  -- 4. HLV chấm không tính vào giới hạn: thẻ L10-PIT (đã đạt nhưng chưa được cộng do giới hạn) HLV chấm lại → +30
  perform pg_temp.act_as(co);
  n := public.training_coach_mark((select id from public.training_challenges where code = 'L10-PIT'), array[s12], true);
  perform pg_temp.act_as(null);
  if pg_temp.pts(s12) <> 90 then raise exception 'FAIL HLV chấm sau giới hạn: %', pg_temp.pts(s12); end if;

  -- 5. Lượt chưa đạt, chờ duyệt, bị từ chối: không cộng
  perform pg_temp.act_as(pa);
  r := public.training_submit_result(s12, (select id from public.training_challenges where code = 'L10-BUN'), array[0], null, false);
  if r ->> 'status' <> 'below' then raise exception 'FAIL lượt chưa đạt: %', r; end if;
  r := public.training_submit_result(s12, (select id from public.training_challenges where code = 'L10-BUN'), pg_temp.made('L10-BUN'), null, false);
  if r ->> 'status' <> 'pending' then raise exception 'FAIL lượt chờ: %', r; end if;
  perform pg_temp.act_as(co);
  r := public.training_review_result((r ->> 'id')::uuid, false);
  perform pg_temp.act_as(null);
  if pg_temp.pts(s12) <> 90 then raise exception 'FAIL cộng cho lượt không đạt'; end if;

  -- 6. Bài giao: phụ huynh đánh dấu chưa cộng; HLV xác nhận +20; bài tại lớp HLV đánh dấu +50;
  --    HLV bỏ đánh dấu rồi đánh dấu lại: không trừ, không cộng thêm
  insert into public.training_assignments (class_id, title_vi, points, created_by) values (cls, 'Putt 30 bóng', 20, co) returning id into asg;
  insert into public.training_assignments (class_id, title_vi, points, in_class, created_by) values (cls, 'Chip tại lớp', 50, true, co) returning id into asg2;
  perform pg_temp.act_as(pa);
  perform public.training_mark_assignment(asg, s12, true);
  perform pg_temp.act_as(null);
  if pg_temp.pts(s12) <> 90 then raise exception 'FAIL cộng khi HLV chưa xác nhận'; end if;
  perform pg_temp.act_as(co);
  n := public.training_confirm_marks(asg, array[s12]);
  perform public.training_mark_assignment(asg2, s12, true);
  perform pg_temp.act_as(null);
  if pg_temp.pts(s12) <> 160 then raise exception 'FAIL bài giao: %', pg_temp.pts(s12); end if;
  perform pg_temp.act_as(co);
  perform public.training_mark_assignment(asg2, s12, false);
  perform public.training_mark_assignment(asg2, s12, true);
  perform pg_temp.act_as(null);
  if pg_temp.pts(s12) <> 160 then raise exception 'FAIL bỏ / đánh dấu lại đổi điểm: %', pg_temp.pts(s12); end if;

  -- 7. Ví hiện tên thẻ / bài; điểm vào số dư khả dụng
  perform pg_temp.act_as(pa);
  r := public.reward_balance(s12);
  if (r ->> 'available')::int < 160 then raise exception 'FAIL số dư %', r ->> 'available'; end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'recent') x where x -> 'training' ->> 'kind' = 'in_class' and x -> 'training' ->> 'name_vi' = 'Chip tại lớp') then
    raise exception 'FAIL ví không hiện tên bài';
  end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'recent') x where x -> 'training' ->> 'kind' = 'challenge') then
    raise exception 'FAIL ví không hiện tên thẻ';
  end if;
  -- Người dùng không gọi được hàm cộng điểm, không chạy được cộng bù
  ok := false;
  begin perform public.training_reward_backfill(); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh chạy được cộng bù'; end if;
  ok := false;
  begin perform public.training_reward_result(gen_random_uuid()); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL phụ huynh gọi được hàm cộng điểm'; end if;
  perform pg_temp.act_as(null);

  -- 8. Thẻ người lớn chưa cộng (ví người lớn là sổ riêng)
  perform pg_temp.act_as(ad);
  r := public.training_create_self_profile('Test TRW người lớn', (public.vn_today() - interval '40 years')::date);
  sa := public.training_self_student();
  r := public.training_submit_result(sa, (select id from public.training_challenges where code = 'HCP54-CHIP'), array[8]);
  perform pg_temp.act_as(null);
  if r ->> 'status' <> 'passed' then raise exception 'FAIL thẻ người lớn %', r; end if;
  if pg_temp.pts(sa) <> 0 then raise exception 'FAIL cộng điểm thẻ người lớn'; end if;

  -- 9. Sổ chỉ cộng: không có dòng âm nào từ Tập luyện
  if exists (select 1 from public.reward_ledger where reason in ('training_challenge', 'training_assignment') and delta <= 0) then
    raise exception 'FAIL có dòng không dương';
  end if;

  raise exception 'ALL_OK';
end $$;
