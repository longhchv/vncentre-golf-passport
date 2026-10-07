-- Chứng nhận sự kiện: nền và vị trí chữ lấy theo MẪU HIỆN TẠI mỗi lần xem/tải (anh Long thiết kế nền sau, có thể sau
-- khi quầy đã phát chứng nhận). Tên người chơi, dòng xác nhận, mã xác thực vẫn là snapshot lúc phát (R9).
-- Đổi nền / vị trí ở mẫu → các PDF sự kiện đã tạo sẵn được tạo lại ở lần tải sau.

create or replace function public.certificate_view(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.certificates;
  v_viewer text;
  v_email text;
  v_data jsonb;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into c from public.certificates where id = p_id;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.is_guardian_of(c.student_id, false) then v_viewer := 'guardian';
  elsif exists (select 1 from public.student_accounts a where a.student_id = c.student_id and a.user_id = auth.uid() and a.is_active) then v_viewer := 'student';
  elsif public.is_center_staff() or public.can_staff_view_student(c.student_id) then v_viewer := 'staff';
  else raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status = 'revoked' and v_viewer <> 'staff' then raise exception 'revoked' using errcode = '22023'; end if;
  select nullif(email, '') into v_email from public.profiles where user_id = auth.uid();
  v_data := c.data;
  if c.type = 'event_experience' then
    select v_data || jsonb_build_object('background_path', t.background_image_url, 'layout', coalesce(t.layout, '{}'))
      into v_data from public.certificate_templates t where t.id = c.template_id;
  end if;
  return jsonb_build_object(
    'id', c.id, 'student_id', c.student_id, 'type', c.type, 'status', c.status, 'title_vi', c.title_vi, 'title_en', c.title_en,
    'issued_at', c.issued_at, 'verify_code', c.verify_code, 'data', v_data, 'pdf_path', c.pdf_path,
    'revoked_at', c.revoked_at, 'revoked_reason', case when v_viewer = 'staff' then c.revoked_reason end,
    'viewer', v_viewer,
    'needs_email', v_viewer = 'guardian' and v_email is null,
    'can_download', c.status = 'valid' and (v_viewer = 'staff' or (v_viewer = 'guardian' and v_email is not null)));
end $$;

create or replace function public.event_template_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'event_experience' and (new.background_image_url is distinct from old.background_image_url or new.layout is distinct from old.layout) then
    update public.certificates set pdf_path = null where template_id = new.id and pdf_path is not null;
  end if;
  return new;
end $$;
create trigger event_template_changed after update on public.certificate_templates
  for each row execute function public.event_template_changed();

-- Không snapshot nền / vị trí cho chứng nhận sự kiện (lấy live ở certificate_view)
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
      'verify_code', v_code, 'verify_url', v_base || '/verify/' || v_code),
    e.event_date, auth.uid(), e.class_id)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.issue_event_certificate(uuid) from public, anon, authenticated;
