-- Module Trải nghiệm sự kiện · S4: tự xác nhận hoàn thành bằng ảnh (E5), hàng chờ duyệt ảnh của sự kiện,
-- bảng theo dõi trực tiếp (E8), bảng điều khiển không tính người trải nghiệm vào học viên (quyết định 13).

-------------------------------------------------------------------------------
-- Kho ảnh thẻ điểm: riêng tư, chỉ admin xem. Đường dẫn {event_id}/{mã thẻ}/{uuid}.jpg (Edge Function event-claim tải lên)
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-claims', 'event-claims', false, 1572864, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "event claims: admin" on storage.objects for all to authenticated
  using (bucket_id = 'event-claims' and public.is_admin())
  with check (bucket_id = 'event-claims' and public.is_admin());

-------------------------------------------------------------------------------
-- E5 · Gửi ảnh tự xác nhận (không cần tài khoản). Kiểm tra trước khi tải ảnh, kiểm tra lại khi ghi.
-------------------------------------------------------------------------------
create or replace function public.event_claim_check(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  e public.events;
  ep public.event_participations;
  v_open int;
begin
  select * into c from public.event_card(p_code);
  if c.passport_id is null then raise exception 'card_not_found' using errcode = 'P0002'; end if;
  select * into ep from public.event_participations where passport_id = c.passport_id;
  if ep.id is null then raise exception 'card_not_registered' using errcode = '22023'; end if;
  select * into e from public.events where id = c.event_id;
  -- E-R14: không gửi ảnh sau self_claim_closes_at
  if e.status = 'archived' or (e.self_claim_closes_at is not null and now() >= e.self_claim_closes_at) then
    raise exception 'claim_closed' using errcode = '22023';
  end if;
  if ep.completion_status not in ('registered', 'rejected') then raise exception 'claim_not_allowed' using errcode = '22023'; end if;
  -- Tối đa N yêu cầu đang chờ hoặc bị từ chối mỗi thẻ (app_settings)
  select count(*) into v_open from public.event_completion_claims where participation_id = ep.id and status in ('pending', 'rejected');
  if v_open >= public.setting_int('event.max_open_claims', 3) then raise exception 'too_many_claims' using errcode = '22023'; end if;
  return jsonb_build_object('event_id', c.event_id, 'code', c.passport_code, 'participation_id', ep.id);
end $$;

create or replace function public.event_submit_claim(p_code text, p_photo_path text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r jsonb;
begin
  r := public.event_claim_check(p_code);
  perform 1 from public.event_participations where id = (r ->> 'participation_id')::uuid for update;
  r := public.event_claim_check(p_code);   -- kiểm tra lại sau khi khoá dòng (hai lần gửi cùng lúc)
  if p_photo_path is null or split_part(p_photo_path, '/', 2) <> (r ->> 'code') then raise exception 'invalid_path' using errcode = '22023'; end if;
  insert into public.event_completion_claims (participation_id, photo_path) values ((r ->> 'participation_id')::uuid, p_photo_path);
  update public.event_participations set completion_status = 'pending_review' where id = (r ->> 'participation_id')::uuid;
  return jsonb_build_object('result', 'ok');
end $$;

revoke execute on function public.event_claim_check(text) from public, anon, authenticated;
revoke execute on function public.event_submit_claim(text, text) from public, anon, authenticated;
grant execute on function public.event_claim_check(text) to service_role;
grant execute on function public.event_submit_claim(text, text) to service_role;

-------------------------------------------------------------------------------
-- Hàng chờ xác nhận của sự kiện (tách khỏi F12 — E-R4). Chỉ admin.
-------------------------------------------------------------------------------
create or replace function public.event_claims_queue(p_event_id uuid, p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', cl.id, 'status', cl.status, 'photo_path', cl.photo_path, 'submitted_at', cl.submitted_at,
      'reviewed_at', cl.reviewed_at, 'reject_reason', cl.reject_reason,
      'code', p.passport_code, 'full_name', s.full_name, 'player_type', ep.player_type, 'completion_status', ep.completion_status,
      'claims_count', (select count(*) from public.event_completion_claims x where x.participation_id = ep.id))
      order by cl.submitted_at)
    from public.event_completion_claims cl
    join public.event_participations ep on ep.id = cl.participation_id
    join public.passports p on p.id = ep.passport_id
    join public.students s on s.id = ep.student_id
    where ep.event_id = p_event_id and (p_status is null or cl.status = p_status)), '[]');
end $$;

-- Duyệt: nhập điểm từ ảnh → cả 4 trạm đạt mức tối thiểu (E-R6) → completed (self_claim) → chứng nhận (E-R7).
-- Từ chối: bắt buộc lý do → rejected, người chơi gửi ảnh mới được.
create or replace function public.event_review_claim(p_claim_id uuid, p_approve boolean, p_scores jsonb default '{}', p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  cl public.event_completion_claims;
  ep public.event_participations;
  v_code text;
  v_missing text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into cl from public.event_completion_claims where id = p_claim_id for update;
  if cl.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if cl.status <> 'pending' then raise exception 'claim_not_pending' using errcode = '22023'; end if;
  select * into ep from public.event_participations where id = cl.participation_id for update;
  select passport_code into v_code from public.passports where id = ep.passport_id;

  if not p_approve then
    if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
    update public.event_completion_claims set status = 'rejected', reject_reason = btrim(p_reason), reviewed_by = auth.uid(), reviewed_at = now()
    where id = cl.id;
    update public.event_participations set completion_status = 'rejected' where id = ep.id and completion_status = 'pending_review';
    return jsonb_build_object('result', 'rejected');
  end if;

  perform public.counter_save_scores(ep.event_id, v_code, coalesce(p_scores, '{}'));
  select string_agg(s.code, ',' order by s.sort_order) into v_missing
  from public.event_stations s left join public.event_scores sc on sc.station_id = s.id and sc.passport_id = ep.passport_id
  where s.event_id = ep.event_id and coalesce(sc.score, 0) < s.min_score_to_complete;
  if v_missing is not null then raise exception 'stations_incomplete:%', v_missing using errcode = '22023'; end if;
  update public.event_participations set completion_status = 'completed', completed_via = 'self_claim', completed_at = now(), completed_by = auth.uid()
  where id = ep.id;
  update public.event_completion_claims set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = cl.id;
  perform public.issue_event_certificate(ep.id);
  return jsonb_build_object('result', 'approved');
end $$;

-------------------------------------------------------------------------------
-- E8 · Bảng theo dõi trực tiếp (admin và nhân viên sự kiện; chỉ số đếm, không có thông tin cá nhân)
-------------------------------------------------------------------------------
create or replace function public.event_live_stats(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return (
    select jsonb_build_object(
      'cards', (select count(*) from public.passports p2 join public.passport_batches b on b.id = p2.batch_id
                where b.event_id = p_event_id and p2.status <> 'void'),
      'registered', count(ep.id),
      'self_registered', count(ep.id) filter (where ep.registered_by is null),
      'staff_registered', count(ep.id) filter (where ep.registered_by is not null),
      'players_self', count(ep.id) filter (where ep.player_type = 'self'),
      'players_child', count(ep.id) filter (where ep.player_type = 'child'),
      'completed', count(ep.id) filter (where ep.completion_status = 'completed'),
      'completed_counter', count(ep.id) filter (where ep.completion_status = 'completed' and ep.completed_via = 'counter'),
      'completed_self_claim', count(ep.id) filter (where ep.completion_status = 'completed' and ep.completed_via = 'self_claim'),
      'pending_review', count(ep.id) filter (where ep.completion_status = 'pending_review'),
      'rejected', count(ep.id) filter (where ep.completion_status = 'rejected'),
      'activated', count(ep.id) filter (where p.status = 'active'),
      'gift_cards', (select count(distinct r.passport_id) from public.event_redemptions r where r.event_id = p_event_id),
      'gift_points', (select coalesce(sum(r.points), 0) from public.event_redemptions r where r.event_id = p_event_id),
      'last_15_min', count(ep.id) filter (where ep.created_at >= now() - interval '15 minutes'),
      'updated_at', now())
    from public.event_participations ep join public.passports p on p.id = ep.passport_id
    where ep.event_id = p_event_id);
end $$;

-------------------------------------------------------------------------------
-- Bảng điều khiển: người trải nghiệm sự kiện (event_guest) không tính vào học viên
-------------------------------------------------------------------------------
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', now())::date;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'students', (select count(*) from public.students where deleted_at is null and merged_into_student_id is null and verification_status <> 'event_guest'),
    'activated', (select count(*) from public.students where deleted_at is null and merged_into_student_id is null and verification_status <> 'event_guest' and activated_at is not null),
    'guardian_accounts', (select count(*) from public.guardians where user_id is not null and deleted_at is null),
    -- Liên hệ thu được: SĐT / email của phụ huynh đã có tài khoản
    'contacts_phone', (select count(distinct p.phone) from public.guardians g join public.profiles p on p.user_id = g.user_id where g.deleted_at is null and p.phone is not null),
    'contacts_email', (select count(distinct lower(p.email)) from public.guardians g join public.profiles p on p.user_id = g.user_id where g.deleted_at is null and p.email is not null),
    'by_school', coalesce((select jsonb_agg(x order by x ->> 'name') from (
      select jsonb_build_object('id', sc.id, 'name', coalesce(sc.short_name, sc.name),
        'students', count(s.id), 'activated', count(s.id) filter (where s.activated_at is not null)) x
      from public.schools sc join public.students s on s.current_school_id = sc.id and s.deleted_at is null and s.merged_into_student_id is null and s.verification_status <> 'event_guest'
      group by sc.id) q), '[]'),
    'by_class', coalesce((select jsonb_agg(x order by (x ->> 'students')::int desc) from (
      select jsonb_build_object('id', c.id, 'name', c.name, 'students', count(s.id), 'activated', count(s.id) filter (where s.activated_at is not null)) x
      from public.classes c join public.enrollments e on e.class_id = c.id and e.status = 'active'
      join public.students s on s.id = e.student_id and s.deleted_at is null and s.merged_into_student_id is null and s.verification_status <> 'event_guest'
      where c.deleted_at is null and c.status = 'active'
      group by c.id limit 200) q), '[]'),
    'queue', jsonb_build_object(
      'course_history', (select count(*) from public.course_history where status = 'pending_review' and deleted_at is null),
      'level_records', (select count(*) from public.level_records where approval_status = 'pending'),
      'students', (select count(*) from public.students where verification_status = 'pending_review' and deleted_at is null and merged_into_student_id is null),
      'guardian_links', (select count(*) from public.student_guardians where status = 'pending_confirmation' and deleted_at is null),
      'link_requests', (select count(*) from public.link_requests where status = 'pending'),
      'support_requests', (select count(*) from public.support_requests where status = 'pending')),
    'orders_need_passport', (select count(*) from public.orders o where o.status = 'paid'
                              and not exists (select 1 from public.passports np where np.replaced_passport_id = o.related_passport_id)),
    'orders_pending', (select count(*) from public.orders where status = 'pending' and expires_at > now()),
    'invoices_requested', (select count(*) from public.invoice_requests where status = 'requested'),
    'message_cost_month', (select coalesce(sum(cost_vnd), 0) from public.otp_logs where created_at >= v_month),
    'messages_month', (select count(*) from public.otp_logs where created_at >= v_month and channel in ('zalo', 'sms')),
    'certificates', (select count(*) from public.certificates where status = 'valid'),
    -- Người trải nghiệm sự kiện: đếm riêng, không tính vào học viên (quyết định 13)
    'event_guests', (select count(*) from public.students where verification_status = 'event_guest' and deleted_at is null and merged_into_student_id is null));
end $$;
