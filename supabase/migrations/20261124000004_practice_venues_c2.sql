-- Spec 28 · bổ sung: admin huỷ hoặc chuyển việc khảo sát đã giao (anh Long yêu cầu 24/11/2026).
-- Minh · 24/11/2026. Chỉ thêm. Chạy lại nhiều lần không lỗi.

-- Huỷ: xoá hẳn dòng giao việc chưa gửi (assigned / draft). Phiếu đã gửi hoặc đã duyệt không huỷ được.
create or replace function public.pv_cancel_survey(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  delete from public.practice_venue_surveys where id = p_id and status in ('assigned', 'draft');
  if not found then raise exception 'not_editable'; end if;
end $$;

-- Chuyển: đổi khảo sát viên của việc chưa gửi; nháp của người cũ được giữ để người mới làm tiếp.
create or replace function public.pv_reassign_survey(p_id uuid, p_surveyor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.practice_venue_surveys;
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_surveyor and role in ('venue_surveyor', 'admin') and deleted_at is null) then
    raise exception 'not_a_surveyor';
  end if;
  select * into s from public.practice_venue_surveys where id = p_id for update;
  if s is null or s.status not in ('assigned', 'draft') then raise exception 'not_editable'; end if;
  if s.surveyor_id = p_surveyor then return; end if;
  if exists (select 1 from public.practice_venue_surveys x where x.venue_id = s.venue_id and x.surveyor_id = p_surveyor
             and x.status in ('assigned', 'draft', 'submitted')) then
    raise exception 'already_assigned';
  end if;
  update public.practice_venue_surveys set surveyor_id = p_surveyor, assigned_by = auth.uid(), assigned_at = now(), updated_at = now()
  where id = p_id;
end $$;

revoke execute on function public.pv_cancel_survey(uuid) from public, anon;
grant execute on function public.pv_cancel_survey(uuid) to authenticated;
revoke execute on function public.pv_reassign_survey(uuid, uuid) from public, anon;
grant execute on function public.pv_reassign_survey(uuid, uuid) to authenticated;
