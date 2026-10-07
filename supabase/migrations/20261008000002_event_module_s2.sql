-- Module Trải nghiệm sự kiện · S2: ghi tên tại chỗ (E2), quầy đổi quà (E4: điểm, hoàn thành, đổi quà B18),
-- chứng nhận sự kiện (mục 5). Người chơi không bao giờ tự chuyển sang "hoàn thành" (E-R8).

-------------------------------------------------------------------------------
-- Mẫu chứng nhận sự kiện (nền do anh Long thiết kế, tải lên ở Admin → Chứng nhận → Mẫu)
-------------------------------------------------------------------------------
alter table public.certificate_templates drop constraint if exists certificate_templates_type_check;
alter table public.certificate_templates add constraint certificate_templates_type_check
  check (type in ('summer_camp', 'course_completion', 'level_completion', 'tournament', 'event_experience'));
alter table public.certificates drop constraint if exists certificates_type_check;
alter table public.certificates add constraint certificates_type_check
  check (type in ('summer_camp', 'course_completion', 'level_completion', 'tournament', 'event_experience'));
insert into public.certificate_templates (code, name_vi, name_en, type, language, layout)
values ('event_experience', 'Chứng nhận trải nghiệm sự kiện', 'Event experience certificate', 'event_experience', 'vi',
        '{"name_y": 640, "line_y": 760, "show_line": true, "qr_x": 1637, "qr_y": 1080, "qr_size": 176, "text_color": "#181e42"}')
on conflict (code) do nothing;

-------------------------------------------------------------------------------
-- Tiện ích
-------------------------------------------------------------------------------
-- Sự kiện đang nhận ghi tên (E-R14): mở + trong khung giờ. Nhân viên ghi tên hộ được tới khi sự kiện đóng (quyết định 9)
create or replace function public.event_registration_open(e public.events, p_staff boolean)
returns boolean language sql stable as $$
  select e.status = 'open' and (p_staff or (
    (e.registration_opens_at is null or now() >= e.registration_opens_at) and (e.registration_closes_at is null or now() < e.registration_closes_at)))
$$;

-- Thẻ sự kiện theo mã (chỉ hạng event_experience) + sự kiện của lô thẻ
create or replace function public.event_card(p_code text)
returns table (passport_id uuid, passport_code text, status text, student_id uuid, event_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.passport_code, p.status, p.student_id, b.event_id
  from public.passports p join public.passport_tiers t on t.id = p.tier_id and t.code = 'event_experience'
  join public.passport_batches b on b.id = p.batch_id
  where p.passport_code = public.normalize_code(p_code)
$$;

-- Phát hành chứng nhận sự kiện cho một người đã hoàn thành (E-R7: chỉ khi completed; không có điểm)
create or replace function public.issue_event_certificate(p_participation_id uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  ep public.event_participations;
  e public.events;
  tpl public.certificate_templates;
  v_code text;
  v_base text;
  v_id uuid;
  v_name text;
  v_date text;
begin
  select * into ep from public.event_participations where id = p_participation_id;
  if ep.completion_status <> 'completed' then raise exception 'not_completed' using errcode = '22023'; end if;
  select id into v_id from public.certificates where student_id = ep.student_id and type = 'event_experience'
    and status = 'valid' and data ->> 'participation_id' = ep.id::text;
  if v_id is not null then return v_id; end if;
  select * into e from public.events where id = ep.event_id;
  select * into tpl from public.certificate_templates where code = 'event_experience';
  select full_name into v_name from public.students where id = ep.student_id;
  select value #>> '{}' into v_base from public.app_settings where key = 'app.public_base_url';
  v_base := rtrim(coalesce(v_base, 'https://app.vncentre.net'), '/');
  v_code := public.new_verify_code();
  v_date := to_char(e.event_date, 'DD/MM/YYYY');
  insert into public.certificates (verify_code, student_id, template_id, type, title_vi, title_en, language, data, issued_at, issued_by, class_id)
  values (v_code, ep.student_id, tpl.id, 'event_experience',
    'Chứng nhận trải nghiệm golf – ' || e.name_vi, 'Golf experience certificate – ' || e.name_en, 'vi',
    jsonb_build_object('kind', 'event', 'participation_id', ep.id, 'student_name', v_name,
      'program', e.name_vi, 'event_name_vi', e.name_vi, 'event_name_en', e.name_en, 'venue', e.venue, 'event_date', e.event_date,
      'line_vi', 'Đã hoàn thành trải nghiệm môn Golf tại ' || e.name_vi || coalesce(', ' || e.venue, '') || ', ngày ' || v_date,
      'line_en', 'Completed the golf experience at ' || e.name_en || coalesce(', ' || e.venue, '') || ' on ' || v_date,
      'language', 'en', 'signer_name', '', 'signer_title', '',
      'background_path', tpl.background_image_url, 'layout', coalesce(tpl.layout, '{}'),
      'verify_code', v_code, 'verify_url', v_base || '/verify/' || v_code),
    e.event_date, auth.uid(), e.class_id)
  returning id into v_id;
  return v_id;
end $$;

-------------------------------------------------------------------------------
-- Tra thẻ công khai (/p/{mã}): thay cho passport_lookup khi là thẻ sự kiện. Chỉ tên che bớt, không SĐT
-------------------------------------------------------------------------------
create or replace function public.event_card_status(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  e public.events;
  ep public.event_participations;
begin
  select * into c from public.event_card(p_code);
  if c.passport_id is null then return jsonb_build_object('result', 'not_found'); end if;
  select * into e from public.events where id = c.event_id;
  select * into ep from public.event_participations where passport_id = c.passport_id;
  return jsonb_build_object(
    'result', 'ok', 'code', c.passport_code, 'card_status', c.status,
    'event', jsonb_build_object('id', e.id, 'name_vi', e.name_vi, 'name_en', e.name_en, 'event_date', e.event_date, 'venue', e.venue,
      'zalo_oa_url', e.zalo_oa_url, 'status', e.status, 'registration_open', public.event_registration_open(e, false),
      'claim_open', e.status <> 'archived' and (e.self_claim_closes_at is null or now() < e.self_claim_closes_at)),
    'participation', case when ep.id is null then null else jsonb_build_object(
      'masked_name', (select public.mask_name(full_name) from public.students where id = ep.student_id),
      'player_type', ep.player_type, 'completion_status', ep.completion_status, 'completed_at', ep.completed_at,
      'locked', ep.locked_until > now(),
      'reject_reason', (select reject_reason from public.event_completion_claims where participation_id = ep.id and status = 'rejected'
                        order by reviewed_at desc limit 1),
      'points', public.event_card_points(c.passport_id)) end);
end $$;

-------------------------------------------------------------------------------
-- E2 · Ghi tên (tự quét: bắt buộc SĐT; nhân viên ghi hộ: SĐT tuỳ chọn — quyết định 8)
-- p_data: { player_type: 'self'|'child', full_name, phone (+84…), age, residence, contact_consent }
-------------------------------------------------------------------------------
create or replace function public.event_do_register(p_code text, p_data jsonb, p_staff boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  e public.events;
  v_type text := p_data ->> 'player_type';
  v_name text := regexp_replace(btrim(coalesce(p_data ->> 'full_name', '')), '\s+', ' ', 'g');
  v_phone text := nullif(regexp_replace(coalesce(p_data ->> 'phone', ''), '[\s.()-]', '', 'g'), '');
  v_age int;
  v_student uuid;
  v_guardian uuid;
  v_versions jsonb;
  v_months int;
begin
  select * into c from public.event_card(p_code);
  if c.passport_id is null then raise exception 'card_not_found' using errcode = 'P0002'; end if;
  -- Khoá dòng thẻ: hai người quét cùng lúc thì chỉ một người ghi tên được
  select status into c.status from public.passports where id = c.passport_id for update;
  -- E-R1: một thẻ chỉ ghi tên một lần
  if c.status <> 'unassigned' then raise exception 'card_already_registered' using errcode = '22023'; end if;
  select * into e from public.events where id = c.event_id;
  if not public.event_registration_open(e, p_staff) then raise exception 'registration_closed' using errcode = '22023'; end if;
  if v_type not in ('self', 'child') then raise exception 'player_type_required' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if v_phone is null and not p_staff then raise exception 'phone_required' using errcode = '22023'; end if;
  if v_phone is not null then
    if v_phone ~ '^0\d{9,10}$' then v_phone := '+84' || substr(v_phone, 2); end if;
    if v_phone !~ '^\+[1-9]\d{6,14}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;
  end if;
  begin
    v_age := nullif(p_data ->> 'age', '')::int;
  exception when others then raise exception 'invalid_age' using errcode = '22023';
  end;
  if v_age is not null and (v_age < 1 or v_age > 120) then raise exception 'invalid_age' using errcode = '22023'; end if;

  insert into public.students (full_name, verification_status) values (v_name, 'event_guest') returning id into v_student;
  -- Cùng SĐT trong cùng sự kiện (một phụ huynh nhiều con) → dùng chung một người giám hộ (E6 bước 6)
  if v_phone is not null then
    select g.id into v_guardian from public.guardians g
    where g.phone = v_phone and g.user_id is null and g.deleted_at is null
      and exists (select 1 from public.student_guardians sg join public.event_participations ep2 on ep2.student_id = sg.student_id
                  where sg.guardian_id = g.id and sg.linked_via = 'event_card' and ep2.event_id = e.id)
    limit 1;
  end if;
  if v_guardian is null then
    insert into public.guardians (full_name, phone) values (case when v_type = 'self' then v_name end, v_phone) returning id into v_guardian;
  end if;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
  values (v_student, v_guardian, case when v_type = 'self' then 'self' else 'guardian' end, true, true, 'event_card', 'active', now());
  insert into public.enrollments (student_id, class_id) values (v_student, e.class_id);

  -- "Bằng việc ghi tên, bạn đồng ý với Điều khoản và Chính sách" + đồng ý liên hệ (tuỳ chọn, mặc định không)
  select value into v_versions from public.app_settings where key = 'legal.versions';
  insert into public.consents (guardian_id, student_id, type, version, granted) values
    (v_guardian, null, 'terms', coalesce(v_versions ->> 'terms', 'v0'), true),
    (v_guardian, null, 'privacy', coalesce(v_versions ->> 'privacy', 'v0'), true),
    (v_guardian, v_student, 'contact_by_vncentre', coalesce(v_versions ->> 'privacy', 'v0'), coalesce((p_data ->> 'contact_consent')::boolean, false));

  insert into public.event_participations (event_id, passport_id, student_id, player_type, age_at_registration, residence, registered_by)
  values (e.id, c.passport_id, v_student, v_type, v_age, nullif(btrim(coalesce(p_data ->> 'residence', '')), ''), case when p_staff then auth.uid() end);
  select validity_months into v_months from public.passport_tiers where code = 'event_experience';
  update public.passports set status = 'event_registered', student_id = v_student, issued_at = now(),
    expires_at = now() + make_interval(months => coalesce(v_months, 12))
  where id = c.passport_id;
  return jsonb_build_object('masked_name', public.mask_name(v_name), 'code', c.passport_code);
end $$;

create or replace function public.event_register(p_code text, p_data jsonb)
returns jsonb language sql volatile security definer set search_path = public as $$
  select public.event_do_register(p_code, p_data, false)
$$;

create or replace function public.event_staff_register(p_event_id uuid, p_code text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select event_id from public.event_card(p_code)) is distinct from p_event_id then raise exception 'card_other_event' using errcode = '22023'; end if;
  return public.event_do_register(p_code, p_data, true);
end $$;

-------------------------------------------------------------------------------
-- E4 · Quầy đổi quà (nhân viên sự kiện). Không bao giờ trả SĐT/email (E-R12)
-------------------------------------------------------------------------------
-- Sự kiện mình là nhân viên (admin: mọi sự kiện chưa lưu trữ)
create or replace function public.my_events()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name_vi', e.name_vi, 'name_en', e.name_en, 'event_date', e.event_date,
    'venue', e.venue, 'status', e.status) order by e.event_date desc), '[]')
  from public.events e where e.status <> 'archived' and public.is_event_staff(e.id)
$$;

create or replace function public.counter_card(p_event_id uuid, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  ep public.event_participations;
  e public.events;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.event_card(p_code);
  if c.passport_id is null then return jsonb_build_object('result', 'not_found'); end if;
  select * into ep from public.event_participations where passport_id = c.passport_id;
  select * into e from public.events where id = c.event_id;
  return jsonb_build_object(
    'result', 'ok', 'code', c.passport_code, 'card_status', c.status,
    -- Thẻ của sự kiện khác vẫn đổi quà được ở đợt đổi quà này (B18), nhưng không nhập điểm / hoàn thành ở đây
    'same_event', c.event_id = p_event_id, 'card_event_name', e.name_vi,
    'registration_open', public.event_registration_open(e, true),
    'participation', case when ep.id is null then null else jsonb_build_object(
      'full_name', (select full_name from public.students where id = ep.student_id),
      'player_type', ep.player_type, 'completion_status', ep.completion_status, 'completed_via', ep.completed_via,
      'completed_at', ep.completed_at) end,
    'stations', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name_vi', s.name_vi, 'name_en', s.name_en,
        'score_step', s.score_step, 'min_score_to_complete', s.min_score_to_complete, 'max_score', s.max_score,
        'score', (select sc.score from public.event_scores sc where sc.passport_id = c.passport_id and sc.station_id = s.id))
        order by s.sort_order), '[]')
      from public.event_stations s where s.event_id = c.event_id),
    'points', public.event_card_points(c.passport_id),
    'redemptions', (select coalesce(jsonb_agg(jsonb_build_object('points', r.points, 'gift_label', r.gift_label, 'redeemed_at', r.redeemed_at,
        'event_name', ev.name_vi) order by r.redeemed_at desc), '[]')
      from public.event_redemptions r join public.events ev on ev.id = r.event_id where r.passport_id = c.passport_id));
end $$;

-- Lưu điểm 4 trạm (E-R10). Đã hoàn thành mà sửa điểm → bắt buộc lý do, ghi nhật ký (E-R13)
create or replace function public.counter_save_scores(p_event_id uuid, p_code text, p_scores jsonb, p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  ep public.event_participations;
  s record;
  v text;
  v_score int;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.event_card(p_code);
  if c.passport_id is null then raise exception 'card_not_found' using errcode = 'P0002'; end if;
  if c.event_id <> p_event_id then raise exception 'card_other_event' using errcode = '22023'; end if;
  select * into ep from public.event_participations where passport_id = c.passport_id for update;
  if ep.id is null then raise exception 'card_not_registered' using errcode = '22023'; end if;
  if ep.completion_status = 'completed' then
    if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
    perform set_config('app.audit_reason', btrim(p_reason), true);
  end if;
  for s in select * from public.event_stations where event_id = p_event_id loop
    v := p_scores ->> s.code;
    if v is null or btrim(v) = '' then continue; end if;
    begin
      v_score := v::int;
    exception when others then raise exception 'invalid_score:%', s.code using errcode = '22023';
    end;
    if v_score < 0 or v_score % s.score_step <> 0 or (s.max_score is not null and v_score > s.max_score) then
      raise exception 'invalid_score:%', s.code using errcode = '22023';
    end if;
    insert into public.event_scores (event_id, passport_id, station_id, score, entered_by, updated_by)
    values (p_event_id, c.passport_id, s.id, v_score, auth.uid(), auth.uid())
    on conflict (passport_id, station_id) do update set score = excluded.score, updated_by = auth.uid()
      where event_scores.score is distinct from excluded.score;
  end loop;
  perform set_config('app.audit_reason', '', true);
  return public.counter_card(p_event_id, p_code);
end $$;

-- Hoàn thành tại quầy: cả 4 trạm đạt mức tối thiểu (E-R6) → completed (counter) → chứng nhận ngay (E-R7)
create or replace function public.counter_complete(p_event_id uuid, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  ep public.event_participations;
  v_missing text;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.event_card(p_code);
  if c.passport_id is null then raise exception 'card_not_found' using errcode = 'P0002'; end if;
  if c.event_id <> p_event_id then raise exception 'card_other_event' using errcode = '22023'; end if;
  select * into ep from public.event_participations where passport_id = c.passport_id for update;
  if ep.id is null then raise exception 'card_not_registered' using errcode = '22023'; end if;
  if ep.completion_status = 'completed' then raise exception 'already_completed' using errcode = '22023'; end if;
  select string_agg(s.code, ',' order by s.sort_order) into v_missing
  from public.event_stations s left join public.event_scores sc on sc.station_id = s.id and sc.passport_id = c.passport_id
  where s.event_id = p_event_id and coalesce(sc.score, 0) < s.min_score_to_complete;
  if v_missing is not null then raise exception 'stations_incomplete:%', v_missing using errcode = '22023'; end if;
  update public.event_participations set completion_status = 'completed', completed_via = 'counter', completed_at = now(), completed_by = auth.uid()
  where id = ep.id;
  -- Đang chờ duyệt ảnh mà đã hoàn thành ở quầy → đóng yêu cầu
  update public.event_completion_claims set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where participation_id = ep.id and status = 'pending';
  perform public.issue_event_certificate(ep.id);
  return public.counter_card(p_event_id, p_code);
end $$;

-- Đổi quà bằng điểm (B18): nhiều lần, tổng không vượt điểm tích luỹ
create or replace function public.counter_redeem(p_event_id uuid, p_code text, p_points int, p_gift_label text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_balance int;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.event_card(p_code);
  if c.passport_id is null then raise exception 'card_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.event_participations where passport_id = c.passport_id) then
    raise exception 'card_not_registered' using errcode = '22023';
  end if;
  if p_points is null or p_points <= 0 then raise exception 'invalid_points' using errcode = '22023'; end if;
  perform 1 from public.passports where id = c.passport_id for update;   -- tránh đổi trùng cùng lúc ở hai máy
  v_balance := (public.event_card_points(c.passport_id) ->> 'balance')::int;
  if p_points > v_balance then raise exception 'not_enough_points:%', v_balance using errcode = '22023'; end if;
  insert into public.event_redemptions (passport_id, event_id, points, gift_label, redeemed_by)
  values (c.passport_id, p_event_id, p_points, nullif(btrim(coalesce(p_gift_label, '')), ''), auth.uid());
  return public.counter_card(p_event_id, p_code);
end $$;

-------------------------------------------------------------------------------
-- /p/{mã}: passport_lookup báo "event" để trang chuyển sang luồng thẻ sự kiện
-------------------------------------------------------------------------------
create or replace function public.passport_lookup(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := public.normalize_code(p_code);
  v_ip text := public.client_ip();
  v_fail int;
  p record;
  v_relation text := 'none';
  v_current text;
begin
  if v_ip is not null then
    select count(*) into v_fail from public.code_attempts
    where kind = 'passport_lookup' and ip = v_ip and not success
      and created_at > now() - make_interval(mins => public.setting_int('code_entry.lock_minutes', 60));
    if v_fail >= public.setting_int('code_entry.max_failures_per_ip_per_hour', 10) then
      return jsonb_build_object('result', 'locked', 'retry_minutes', public.setting_int('code_entry.lock_minutes', 60));
    end if;
  end if;

  select ps.id, ps.status, ps.student_id, ps.tier_id, s.full_name, coalesce(sc.short_name, sc.name) as school_name,
         t.name_vi as tier_vi, t.name_en as tier_en, t.code as tier_code
    into p
  from public.passports ps
  left join public.students s on s.id = ps.student_id
  left join public.schools sc on sc.id = s.current_school_id
  left join public.passport_tiers t on t.id = ps.tier_id
  where ps.passport_code = v_code;

  if p.id is null then
    if exists (select 1 from public.students where claim_code = v_code and deleted_at is null) then
      insert into public.code_attempts (kind, code, ip, user_id, success) values ('claim_lookup', v_code, v_ip, auth.uid(), true);
      return jsonb_build_object('result', 'claim');
    end if;
    insert into public.code_attempts (kind, code, ip, user_id, success) values ('passport_lookup', left(v_code, 20), v_ip, auth.uid(), false);
    return jsonb_build_object('result', 'not_found');
  end if;
  insert into public.code_attempts (kind, code, ip, user_id, success) values ('passport_lookup', v_code, v_ip, auth.uid(), true);

  -- Thẻ sự kiện: luồng riêng (module 10)
  if p.tier_code = 'event_experience' then
    return jsonb_build_object('result', 'event', 'code', v_code);
  end if;

  if auth.uid() is not null and p.student_id is not null then
    if public.is_guardian_of(p.student_id, true) then v_relation := 'guardian';
    elsif public.can_staff_view_student(p.student_id) then v_relation := 'staff';
    end if;
  end if;
  if v_relation <> 'none' and p.status in ('lost', 'void', 'retired') then
    select passport_code into v_current from public.passports
    where student_id = p.student_id and status in ('active', 'assigned') order by status limit 1;
  end if;

  return jsonb_build_object('result', 'ok', 'status', p.status, 'tier_vi', p.tier_vi, 'tier_en', p.tier_en,
    'masked_name', public.mask_name(p.full_name), 'school_name', p.school_name, 'relation', v_relation,
    'student_id', case when v_relation <> 'none' then p.student_id end,
    'current_passport_code', v_current, 'identity_locked', public.identity_locked(v_code));
end $$;

-------------------------------------------------------------------------------
-- Quyền gọi hàm
-------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.event_registration_open(public.events, boolean)', 'public.event_card(text)',
                           'public.issue_event_certificate(uuid)', 'public.event_do_register(text, jsonb, boolean)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.event_staff_register(uuid, text, jsonb)', 'public.my_events()', 'public.counter_card(uuid, text)',
                           'public.counter_save_scores(uuid, text, jsonb, text)', 'public.counter_complete(uuid, text)',
                           'public.counter_redeem(uuid, text, int, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Ghi tên và xem trạng thái thẻ không cần tài khoản (E-R2)
  grant execute on function public.event_register(text, jsonb) to anon, authenticated;
  grant execute on function public.event_card_status(text) to anon, authenticated;
end $$;
