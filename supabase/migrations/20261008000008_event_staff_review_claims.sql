-- BTC sự kiện trải nghiệm (event_staff) được duyệt ảnh tự xác nhận của sự kiện mình được gán (anh Long chốt 08/10/2026).
-- Admin vẫn duyệt được mọi sự kiện. BTC vẫn không thấy SĐT/email người chơi (E-R12): hàng chờ chỉ có tên, mã thẻ, ảnh.

create or replace function public.event_claims_queue(p_event_id uuid, p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
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

-- 4 trạm của sự kiện để nhập điểm khi duyệt (bảng event_stations chỉ admin đọc trực tiếp)
create or replace function public.event_station_list(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_event_staff(p_event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('code', s.code, 'name_vi', s.name_vi, 'name_en', s.name_en,
      'score_step', s.score_step, 'min_score_to_complete', s.min_score_to_complete, 'sort_order', s.sort_order) order by s.sort_order)
    from public.event_stations s where s.event_id = p_event_id), '[]');
end $$;

create or replace function public.event_review_claim(p_claim_id uuid, p_approve boolean, p_scores jsonb default '{}', p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  cl public.event_completion_claims;
  ep public.event_participations;
  v_code text;
  v_missing text;
begin
  select * into cl from public.event_completion_claims where id = p_claim_id for update;
  if cl.id is null then
    if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into ep from public.event_participations where id = cl.participation_id for update;
  if not public.is_event_staff(ep.event_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if cl.status <> 'pending' then raise exception 'claim_not_pending' using errcode = '22023'; end if;
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

-- Ảnh thẻ điểm: BTC xem được ảnh của sự kiện mình (thư mục đầu của đường dẫn là event_id)
create or replace function public.storage_first_uuid(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create policy "event claims: BTC sự kiện xem" on storage.objects for select to authenticated
  using (bucket_id = 'event-claims' and public.is_event_staff(public.storage_first_uuid(name)));
