-- Bước 12 · Chứng nhận (F9): mẫu, phát hành hàng loạt, xem/tải PDF, xác thực công khai, thu hồi. R9: snapshot.

-------------------------------------------------------------------------------
-- Kho file
-------------------------------------------------------------------------------
-- Tài sản mẫu (nền, chữ ký, logo, font): riêng tư; người đã đăng nhập xem được (để xem chứng nhận trên app), admin tải lên
insert into storage.buckets (id, name, public, file_size_limit)
values ('certificate-assets', 'certificate-assets', false, 5242880)
on conflict (id) do nothing;
-- PDF chứng nhận đã tạo: chỉ máy chủ đọc/ghi, phát link có hạn
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', false, 3145728, array['application/pdf'])
on conflict (id) do nothing;

create policy "certificate assets: xem" on storage.objects for select to authenticated
  using (bucket_id = 'certificate-assets');
create policy "certificate assets: admin" on storage.objects for all to authenticated
  using (bucket_id = 'certificate-assets' and public.is_admin())
  with check (bucket_id = 'certificate-assets' and public.is_admin());

-------------------------------------------------------------------------------
-- Mẫu và cấu hình
-------------------------------------------------------------------------------
update public.certificate_templates set
  signer_name = 'Vu Anh Long',
  signer_title = E'Director of the R&A - VGA\nJunior Golf Development Project',
  background_image_url = 'templates/default/background.jpg',
  signature_image_url = 'signatures/default.png'
where background_image_url is null;

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('certificate.issuer', '{"vi":"VN Centre – Dự án phát triển golf trẻ R&A – VGA","en":"VN Centre – R&A – VGA Junior Golf Development Project"}',
   'Đơn vị cấp chứng nhận (trang xác thực)', 'Certificate issuer (verification page)', true),
  ('certificate.pdf_link_ttl_seconds', '300', 'Link tải PDF chứng nhận hết hạn sau (giây)', 'Certificate PDF link expiry (seconds)', false)
on conflict do nothing;

alter table public.otp_logs
  drop constraint if exists otp_logs_purpose_check,
  add constraint otp_logs_purpose_check
    check (purpose in ('signup', 'reset_password', 'activation', 'invite', 'verify_email', 'add_phone', 'notification'));

-------------------------------------------------------------------------------
-- Chuẩn bị phát hành: kiểm tra từng học viên, dựng snapshot (R9)
--   p_data: { program, level_id?, level_label?, issued_at?, language: 'en'|'bilingual' }
-------------------------------------------------------------------------------
create or replace function public.certificate_prepare(p_template_id uuid, p_student_ids uuid[], p_data jsonb)
returns table (student_id uuid, full_name text, status text, level_record_id uuid, data jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  tpl public.certificate_templates;
  v_program text := btrim(coalesce(p_data ->> 'program', ''));
  v_level_id uuid := nullif(p_data ->> 'level_id', '')::uuid;
  v_label text := nullif(btrim(coalesce(p_data ->> 'level_label', '')), '');
  v_lang text := coalesce(nullif(p_data ->> 'language', ''), 'en');
  v_issued date := coalesce(nullif(p_data ->> 'issued_at', '')::date, current_date);
  v_base text;
  s record;
  v_lr uuid;
begin
  select * into tpl from public.certificate_templates where id = p_template_id and is_active;
  if tpl.id is null then raise exception 'template_not_found' using errcode = 'P0002'; end if;
  if v_program = '' then raise exception 'program_required' using errcode = '22023'; end if;
  if v_lang not in ('en', 'bilingual') then raise exception 'invalid_language' using errcode = '22023'; end if;
  if tpl.type = 'level_completion' and v_level_id is null then raise exception 'level_required' using errcode = '22023'; end if;
  if v_level_id is not null and v_label is null then
    select case when p.code = 'core20' then 'Level ' else 'Journey ' end || l.number into v_label
    from public.levels l join public.programs p on p.id = l.program_id where l.id = v_level_id;
  end if;
  select value #>> '{}' into v_base from public.app_settings where key = 'app.public_base_url';
  v_base := rtrim(coalesce(v_base, 'https://app.vncentre.net'), '/');

  for s in
    select st.id, st.full_name, st.current_grade_class, sc.name as school_name
    from unnest(p_student_ids) with ordinality u(id, ord)
    join public.students st on st.id = u.id and st.deleted_at is null and st.merged_into_student_id is null
    left join public.schools sc on sc.id = st.current_school_id
    order by u.ord
  loop
    student_id := s.id;
    full_name := s.full_name;
    level_record_id := null;
    -- F9 bước 3: "Hoàn thành level" chỉ cho học viên có level_records tương ứng đã duyệt
    if tpl.type = 'level_completion' then
      select lr.id into v_lr from public.level_records lr
      where lr.student_id = s.id and lr.level_id = v_level_id and lr.status = 'completed' and lr.approval_status = 'approved'
      limit 1;
      level_record_id := v_lr;
    end if;
    status := case
      when tpl.type = 'level_completion' and level_record_id is null then 'no_level'
      when exists (select 1 from public.certificates c where c.student_id = s.id and c.template_id = tpl.id and c.status = 'valid'
                     and c.data ->> 'program' = v_program and coalesce(c.data ->> 'level_label', '') = coalesce(v_label, '')) then 'duplicate'
      else 'ok' end;
    data := jsonb_build_object(
      'student_name', s.full_name, 'class_name', s.current_grade_class, 'school_name', s.school_name,
      'program', v_program, 'level_label', v_label, 'issued_at', v_issued, 'language', v_lang,
      'signer_name', coalesce(tpl.signer_name, ''), 'signer_title', coalesce(tpl.signer_title, ''),
      'background_path', tpl.background_image_url, 'signature_path', tpl.signature_image_url,
      'verify_code', 'PREVIEW000', 'verify_url', v_base || '/verify');
    return next;
  end loop;
end $$;

create or replace function public.certificate_issue_preview(p_template_id uuid, p_student_ids uuid[], p_data jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_center_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('student_id', student_id, 'full_name', full_name, 'status', status, 'data', data))
                   from public.certificate_prepare(p_template_id, p_student_ids, p_data)), '[]');
end $$;

-- Phát hành: tạo chứng nhận cho các học viên hợp lệ, thông báo trong app cho phụ huynh đã kích hoạt
create or replace function public.certificate_issue(p_template_id uuid, p_student_ids uuid[], p_data jsonb, p_class_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  tpl public.certificate_templates;
  v_code text;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_skipped jsonb := '[]';
  v_line text;
begin
  if not public.is_center_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into tpl from public.certificate_templates where id = p_template_id;
  for r in select * from public.certificate_prepare(p_template_id, p_student_ids, p_data) loop
    if r.status <> 'ok' then
      v_skipped := v_skipped || jsonb_build_object('student_id', r.student_id, 'full_name', r.full_name, 'reason', r.status);
      continue;
    end if;
    v_code := public.new_verify_code();
    v_line := concat_ws(' - ', r.data ->> 'program', r.data ->> 'level_label');
    insert into public.certificates (verify_code, student_id, template_id, type, title_vi, title_en, language, data,
                                     issued_at, issued_by, class_id, level_record_id)
    values (v_code, r.student_id, tpl.id, tpl.type, 'Chứng nhận hoàn thành – ' || v_line, 'Certificate of Completion – ' || v_line,
            r.data ->> 'language',
            r.data || jsonb_build_object('verify_code', v_code, 'verify_url', (r.data ->> 'verify_url') || '/' || v_code),
            (r.data ->> 'issued_at')::date, auth.uid(), p_class_id, r.level_record_id)
    returning id into v_id;
    v_ids := v_ids || v_id;
    perform public.notify_student_guardians(r.student_id, 'certificate_issued',
      'Con có chứng nhận mới', 'New certificate for your child',
      r.full_name || ': ' || v_line || '. Mở hồ sơ để xem và tải PDF.',
      r.full_name || ': ' || v_line || '. Open the profile to view and download the PDF.',
      '/app/children/' || r.student_id || '?tab=certificates');
  end loop;
  return jsonb_build_object('issued', coalesce(array_length(v_ids, 1), 0), 'certificate_ids', to_jsonb(v_ids), 'skipped', v_skipped);
end $$;

-------------------------------------------------------------------------------
-- Xem một chứng nhận (phụ huynh, học viên, nhân viên) + quyền tải PDF
-------------------------------------------------------------------------------
create or replace function public.certificate_view(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.certificates;
  v_viewer text;
  v_email text;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into c from public.certificates where id = p_id;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.is_guardian_of(c.student_id, false) then v_viewer := 'guardian';
  elsif exists (select 1 from public.student_accounts a where a.student_id = c.student_id and a.user_id = auth.uid() and a.is_active) then v_viewer := 'student';
  elsif public.is_center_staff() or public.can_staff_view_student(c.student_id) then v_viewer := 'staff';
  else raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Chứng nhận đã thu hồi: phụ huynh / học viên không xem nữa
  if c.status = 'revoked' and v_viewer <> 'staff' then raise exception 'revoked' using errcode = '22023'; end if;
  select nullif(email, '') into v_email from public.profiles where user_id = auth.uid();
  return jsonb_build_object(
    'id', c.id, 'student_id', c.student_id, 'type', c.type, 'status', c.status, 'title_vi', c.title_vi, 'title_en', c.title_en,
    'issued_at', c.issued_at, 'verify_code', c.verify_code, 'data', c.data, 'pdf_path', c.pdf_path,
    'revoked_at', c.revoked_at, 'revoked_reason', case when v_viewer = 'staff' then c.revoked_reason end,
    'viewer', v_viewer,
    -- F9: phụ huynh phải có email mới tải PDF; học viên không tải
    'needs_email', v_viewer = 'guardian' and v_email is null,
    'can_download', c.status = 'valid' and (v_viewer = 'staff' or (v_viewer = 'guardian' and v_email is not null)));
end $$;

-------------------------------------------------------------------------------
-- Trang xác thực công khai /verify/{mã}: không ngày sinh, trường, phụ huynh
-------------------------------------------------------------------------------
create or replace function public.certificate_verify(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.certificates;
  v_issuer jsonb;
begin
  select * into c from public.certificates where verify_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if c.id is null then return jsonb_build_object('result', 'not_found'); end if;
  select value into v_issuer from public.app_settings where key = 'certificate.issuer';
  return jsonb_build_object(
    'result', c.status, 'verify_code', c.verify_code,
    'student_name', c.data ->> 'student_name', 'type', c.type,
    'program', c.data ->> 'program', 'level_label', c.data ->> 'level_label',
    'title_vi', c.title_vi, 'title_en', c.title_en, 'issued_at', c.issued_at,
    'revoked_at', c.revoked_at, 'issuer', v_issuer);
end $$;

-------------------------------------------------------------------------------
-- Thu hồi (admin, bắt buộc lý do)
-------------------------------------------------------------------------------
create or replace function public.revoke_certificate(p_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.certificates set status = 'revoked', revoked_reason = btrim(p_reason), revoked_at = now(), revoked_by = auth.uid()
  where id = p_id and status = 'valid';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- Danh sách chứng nhận đã phát hành (admin / HLV trưởng)
create or replace function public.admin_certificates(p_search text default null, p_status text default null, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_center_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
    select jsonb_build_object('id', c.id, 'student_id', c.student_id, 'student_name', c.data ->> 'student_name',
      'student_code', s.student_code, 'class_name', cl.name, 'title_vi', c.title_vi, 'title_en', c.title_en, 'type', c.type,
      'status', c.status, 'issued_at', c.issued_at, 'verify_code', c.verify_code, 'revoked_reason', c.revoked_reason,
      'created_at', c.created_at) x
    from public.certificates c join public.students s on s.id = c.student_id
    left join public.classes cl on cl.id = c.class_id
    where (p_status is null or c.status = p_status)
      and (v_q is null or c.verify_code = upper(regexp_replace(v_q, '[^A-Za-z0-9]', '', 'g'))
           or s.full_name_normalized like '%' || public.normalize_name(v_q) || '%' or s.student_code ilike v_q)
    order by c.created_at desc limit least(coalesce(p_limit, 100), 500)) q), '[]');
end $$;

-------------------------------------------------------------------------------
-- Quyền gọi hàm
-------------------------------------------------------------------------------
do $$
declare f text;
begin
  revoke execute on function public.certificate_prepare(uuid, uuid[], jsonb) from public, anon, authenticated;
  foreach f in array array[
    'public.certificate_issue_preview(uuid, uuid[], jsonb)', 'public.certificate_issue(uuid, uuid[], jsonb, uuid)',
    'public.certificate_view(uuid)', 'public.revoke_certificate(uuid, text)', 'public.admin_certificates(text, text, int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.certificate_verify(text) to anon, authenticated;
