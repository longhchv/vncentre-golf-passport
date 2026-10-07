-- Module Trải nghiệm sự kiện · S3: kích hoạt tài khoản qua email và tải chứng nhận (E6), hồ sơ trải nghiệm.
-- E-R3: chỉ đi tiếp khi nhập đúng đầy đủ SĐT đã ghi khi nhận thẻ; mã qua email; SĐT giữ trạng thái chưa xác minh.

alter table public.otp_logs drop constraint if exists otp_logs_purpose_check;
alter table public.otp_logs add constraint otp_logs_purpose_check
  check (purpose in ('signup', 'reset_password', 'activation', 'invite', 'verify_email', 'add_phone', 'notification', 'event_activate'));

-------------------------------------------------------------------------------
-- Kiểm tra SĐT (E6 bước 2). Trả kết quả (không raise) để lượt sai được ghi lại; sai quá N lần → khoá thẻ, báo admin
-------------------------------------------------------------------------------
create or replace function public.event_phone_check(p_code text, p_phone text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  ep public.event_participations;
  v_guardian uuid;
  v_saved text;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s.()-]', '', 'g'), '');
  v_max int := public.setting_int('event.phone_check_max_failures', 5);
  v_fails int;
begin
  select * into c from public.event_card(p_code);
  if c.passport_id is null then return jsonb_build_object('result', 'not_found'); end if;
  select * into ep from public.event_participations where passport_id = c.passport_id for update;
  if ep.id is null then return jsonb_build_object('result', 'not_registered'); end if;
  if c.status not in ('event_registered', 'active') then return jsonb_build_object('result', 'inactive'); end if;
  if ep.locked_until > now() then return jsonb_build_object('result', 'locked', 'locked_until', ep.locked_until); end if;
  if v_phone ~ '^0\d{9,10}$' then v_phone := '+84' || substr(v_phone, 2); end if;
  if v_phone is null or v_phone !~ '^\+[1-9]\d{6,14}$' then return jsonb_build_object('result', 'invalid_phone'); end if;

  select g.id, g.phone into v_guardian, v_saved
  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where sg.student_id = ep.student_id and sg.linked_via = 'event_card' and sg.deleted_at is null
  order by sg.created_at limit 1;

  -- Thẻ HLV ghi tên hộ không có SĐT → nhập SĐT mới, bỏ qua bước khớp
  if v_saved is not null and v_saved <> v_phone then
    v_fails := ep.phone_check_failures + 1;
    if v_fails >= v_max then
      update public.event_participations set phone_check_failures = 0,
        locked_until = now() + make_interval(hours => public.setting_int('event.phone_check_lock_hours', 24)) where id = ep.id;
      -- Báo admin
      insert into public.notifications (user_id, type, title_vi, title_en, body_vi, body_en, link, channels_sent)
      select distinct r.user_id, 'event_card_locked', 'Thẻ sự kiện bị khoá do nhập sai SĐT', 'Event card locked after wrong phone numbers',
        'Thẻ ' || c.passport_code || ' bị nhập sai SĐT ' || v_max || ' lần khi tạo tài khoản.',
        'Card ' || c.passport_code || ': wrong phone entered ' || v_max || ' times during account creation.',
        '/admin/events/' || ep.event_id, '["in_app"]'::jsonb
      from public.user_roles r where r.role = 'admin' and r.deleted_at is null;
      return jsonb_build_object('result', 'locked');
    end if;
    update public.event_participations set phone_check_failures = v_fails where id = ep.id;
    return jsonb_build_object('result', 'wrong', 'remaining', v_max - v_fails);
  end if;
  update public.event_participations set phone_check_failures = 0 where id = ep.id and phone_check_failures > 0;

  return jsonb_build_object('result', 'ok', 'completed', ep.completion_status = 'completed', 'new_phone', v_saved is null,
    -- Nhiều người chơi cùng SĐT trong cùng sự kiện (E6 bước 6): tên che bớt
    'cards', (select coalesce(jsonb_agg(jsonb_build_object('code', p.passport_code, 'masked_name', public.mask_name(s.full_name),
                'completed', ep2.completion_status = 'completed', 'activated', p.status = 'active') order by ep2.created_at), '[]')
              from public.event_participations ep2 join public.passports p on p.id = ep2.passport_id join public.students s on s.id = ep2.student_id
              where ep2.event_id = ep.event_id and exists (select 1 from public.student_guardians sg2
                where sg2.student_id = ep2.student_id and sg2.guardian_id = v_guardian and sg2.deleted_at is null)));
end $$;

-------------------------------------------------------------------------------
-- Nối thẻ (và các thẻ cùng SĐT trong sự kiện) vào một tài khoản. Chỉ gọi sau khi đã kiểm tra SĐT.
-- p_data: { full_name?, phone, contact_consent, photo_consent }
-------------------------------------------------------------------------------
create or replace function public.event_link_to_user(p_code text, p_user_id uuid, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  ep public.event_participations;
  v_event_guardian uuid;
  v_mine uuid;
  v_target uuid;
  v_versions jsonb;
  v_students uuid[];
  v_email text;
  v_phone text := nullif(regexp_replace(coalesce(p_data ->> 'phone', ''), '[\s.()-]', '', 'g'), '');
begin
  select * into c from public.event_card(p_code);
  select * into ep from public.event_participations where passport_id = c.passport_id;
  if ep.id is null then raise exception 'card_not_registered' using errcode = '22023'; end if;
  -- Tạo tài khoản chỉ mở khi đã hoàn thành (E6 bước 2)
  if ep.completion_status <> 'completed' then raise exception 'not_completed' using errcode = '22023'; end if;
  if v_phone ~ '^0\d{9,10}$' then v_phone := '+84' || substr(v_phone, 2); end if;

  select g.id into v_event_guardian from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where sg.student_id = ep.student_id and sg.linked_via = 'event_card' and sg.deleted_at is null order by sg.created_at limit 1;
  -- Thẻ đã nối với tài khoản khác → E-R1 (chỉ kích hoạt tài khoản một lần)
  if exists (select 1 from public.guardians where id = v_event_guardian and user_id is not null and user_id <> p_user_id) then
    raise exception 'card_already_activated' using errcode = '22023';
  end if;
  select email into v_email from public.profiles where user_id = p_user_id;

  -- Học viên của các thẻ cùng người giám hộ trong sự kiện này
  select array_agg(ep2.student_id) into v_students
  from public.event_participations ep2
  where ep2.event_id = ep.event_id and exists (select 1 from public.student_guardians sg2
    where sg2.student_id = ep2.student_id and sg2.guardian_id = v_event_guardian and sg2.deleted_at is null);

  select id into v_mine from public.guardians where user_id = p_user_id and deleted_at is null;
  if v_mine is null then
    update public.guardians set user_id = p_user_id, email = coalesce(email, v_email), phone = coalesce(phone, v_phone),
      full_name = coalesce(nullif(btrim(p_data ->> 'full_name'), ''), full_name)
    where id = v_event_guardian;
    v_target := v_event_guardian;
  else
    -- Tài khoản đã có người giám hộ (ví dụ phụ huynh học viên): chuyển liên kết sang người giám hộ đó
    update public.student_guardians sg set guardian_id = v_mine
    where sg.guardian_id = v_event_guardian and sg.deleted_at is null and sg.student_id = any(v_students)
      and not exists (select 1 from public.student_guardians x where x.student_id = sg.student_id and x.guardian_id = v_mine and x.deleted_at is null);
    update public.consents set guardian_id = v_mine where guardian_id = v_event_guardian and student_id = any(v_students);
    update public.guardians set phone = coalesce(phone, v_phone) where id = v_mine;
    if not exists (select 1 from public.student_guardians where guardian_id = v_event_guardian and deleted_at is null) then
      update public.guardians set deleted_at = now() where id = v_event_guardian;
    end if;
    v_target := v_mine;
  end if;

  -- Thẻ → active; ghi người kích hoạt và ngày kích hoạt học viên (R11 giữ lần đầu)
  update public.passports p set status = 'active', activated_at = coalesce(p.activated_at, now()), activated_by_guardian_id = v_target
  from public.event_participations ep2
  where ep2.passport_id = p.id and ep2.student_id = any(v_students) and ep2.event_id = ep.event_id and p.status = 'event_registered';
  update public.students set activated_at = now() where id = any(v_students) and activated_at is null;

  -- Đồng ý: Điều khoản + Chính sách (bắt buộc), liên hệ, ảnh (tuỳ chọn, mặc định không)
  select value into v_versions from public.app_settings where key = 'legal.versions';
  insert into public.consents (guardian_id, student_id, type, version, granted, granted_at) values
    (v_target, null, 'terms', coalesce(v_versions ->> 'terms', 'v0'), true, clock_timestamp()),
    (v_target, null, 'privacy', coalesce(v_versions ->> 'privacy', 'v0'), true, clock_timestamp());
  insert into public.consents (guardian_id, student_id, type, version, granted, granted_at)
  select v_target, s, t.type, coalesce(v_versions ->> 'privacy', 'v0'), t.granted, clock_timestamp()
  from unnest(v_students) s,
       (values ('contact_by_vncentre', coalesce((p_data ->> 'contact_consent')::boolean, false)),
               ('photo', coalesce((p_data ->> 'photo_consent')::boolean, false))) as t(type, granted);
  return jsonb_build_object('students', to_jsonb(v_students));
end $$;

-- Đã đăng nhập (email đã có tài khoản): kiểm tra SĐT rồi nối thẻ vào chính tài khoản này
create or replace function public.event_link_card_to_me(p_code text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  r := public.event_phone_check(p_code, p_data ->> 'phone');
  if r ->> 'result' <> 'ok' then return r; end if;
  return r || public.event_link_to_user(p_code, auth.uid(), p_data);
end $$;

-- Trạng thái kích hoạt hiển thị trên /p (E6 bước 1): thêm "đã nối tài khoản chưa"
create or replace function public.event_card_activated(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'active' from public.event_card(p_code)), false)
$$;

-------------------------------------------------------------------------------
-- Hồ sơ trải nghiệm (E6): sự kiện, điểm từng trạm, tổng tích luỹ, đổi quà
-------------------------------------------------------------------------------
create or replace function public.event_profile(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_guardian_of(p_student_id, false) or public.is_admin()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'event_name_vi', e.name_vi, 'event_name_en', e.name_en, 'event_date', e.event_date, 'venue', e.venue, 'zalo_oa_url', e.zalo_oa_url,
        'code', p.passport_code, 'completion_status', ep.completion_status, 'completed_at', ep.completed_at,
        'scores', (select coalesce(jsonb_agg(jsonb_build_object('name_vi', s.name_vi, 'name_en', s.name_en,
                     'score', (select sc.score from public.event_scores sc where sc.passport_id = p.id and sc.station_id = s.id)) order by s.sort_order), '[]')
                   from public.event_stations s where s.event_id = e.id),
        'points', public.event_card_points(p.id),
        'redemptions', (select coalesce(jsonb_agg(jsonb_build_object('points', r.points, 'gift_label', r.gift_label, 'redeemed_at', r.redeemed_at)
                          order by r.redeemed_at desc), '[]') from public.event_redemptions r where r.passport_id = p.id))
        order by e.event_date desc)
      from public.event_participations ep join public.events e on e.id = ep.event_id join public.passports p on p.id = ep.passport_id
      where ep.student_id = p_student_id), '[]'),
    'total_points', coalesce((select sum((public.event_card_points(ep.passport_id) ->> 'total')::int) from public.event_participations ep where ep.student_id = p_student_id), 0),
    'balance', coalesce((select sum((public.event_card_points(ep.passport_id) ->> 'balance')::int) from public.event_participations ep where ep.student_id = p_student_id), 0));
end $$;

-- Thẻ con ở trang chủ: thêm cờ người trải nghiệm sự kiện (ẩn level, lộ trình — E6)
drop function if exists public.my_children();
create function public.my_children()
returns table (
  student_id uuid, full_name text, student_code text, avatar_url text,
  link_status text, relationship text, can_manage boolean,
  level_number int, level_name_vi text, level_name_en text, group_name_vi text, group_name_en text,
  stage_number int, stage_name_vi text, stage_name_en text, stage_color text,
  tier_name_vi text, tier_name_en text, school_name text, grade_class text,
  is_event_guest boolean, event_name_vi text, event_name_en text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.full_name,
         case when sg.status = 'active' then s.student_code end,
         case when sg.status = 'active' then s.avatar_url end,
         sg.status, sg.relationship, sg.can_manage and sg.status = 'active',
         l.number, l.name_vi, l.name_en,
         case when sg.status = 'active' then l.group_name_vi end, case when sg.status = 'active' then l.group_name_en end,
         case when sg.status = 'active' then st.number end, case when sg.status = 'active' then st.name_vi end,
         case when sg.status = 'active' then st.name_en end, case when sg.status = 'active' then st.color end,
         case when sg.status = 'active' then t.name_vi end, case when sg.status = 'active' then t.name_en end,
         case when sg.status = 'active' then coalesce(sc.short_name, sc.name) end,
         case when sg.status = 'active' then s.current_grade_class end,
         s.verification_status = 'event_guest',
         (select e.name_vi from public.event_participations ep join public.events e on e.id = ep.event_id where ep.student_id = s.id order by e.event_date desc limit 1),
         (select e.name_en from public.event_participations ep join public.events e on e.id = ep.event_id where ep.student_id = s.id order by e.event_date desc limit 1)
  from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id and g.user_id = auth.uid() and g.deleted_at is null
  join public.students s on s.id = sg.student_id and s.deleted_at is null and s.merged_into_student_id is null
  left join public.levels l on l.id = s.current_level_id
  left join public.passport_stages st on st.id = l.passport_stage_id
  left join public.passport_tiers t on t.id = l.passport_tier_id
  left join public.schools sc on sc.id = s.current_school_id
  where sg.deleted_at is null
  order by sg.linked_at nulls last, s.full_name
$$;

do $$
declare f text;
begin
  revoke execute on function public.event_link_to_user(text, uuid, jsonb) from public, anon, authenticated;
  grant execute on function public.event_link_to_user(text, uuid, jsonb) to service_role;
  grant execute on function public.event_phone_check(text, text) to anon, authenticated;
  foreach f in array array['public.event_link_card_to_me(text, jsonb)', 'public.event_profile(uuid)', 'public.my_children()', 'public.event_card_activated(text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
