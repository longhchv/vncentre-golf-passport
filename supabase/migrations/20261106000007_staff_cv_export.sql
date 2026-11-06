-- Module Hồ sơ nhân sự · chặng C: S5 xuất CV (snapshot), thu hồi, S6 trang xác thực dùng chung /verify/{mã}.
-- Anh Long chốt 24/10/2026 (D55): người lạ quét QR chỉ thấy tên, vai trò, ngày xuất, trạng thái (S-R7);
-- chủ hồ sơ hoặc admin đã đăng nhập thấy thêm toàn bộ nội dung bản CV đó. PDF dài quá một trang in "và N mục khác".

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('staff_cv.link_ttl_seconds', '86400', 'Link tải PDF CV nhân sự hết hạn sau (giây)', 'Staff CV PDF link expiry (seconds)', false)
on conflict do nothing;

-------------------------------------------------------------------------------
-- S5 bước 1: các dòng sẽ in ra CV nhưng thiếu chữ tiếng Anh (chủ hồ sơ tự nhập, app không dịch)
-------------------------------------------------------------------------------
create or replace function public.staff_cv_missing_en(p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_items jsonb;
begin
  if v_user is null or not (public.is_admin() or v_user = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_items := public.staff_cv_items(v_user);
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('entity', 'engagement', 'id', e ->> 'id', 'field', f.field, 'vi', e ->> (f.field || '_vi'),
                              'context', coalesce(e ->> 'event_name_vi', e ->> 'class_name', e ->> 'project_name_vi')) x
    from jsonb_array_elements(v_items -> 'engagements') e
    cross join (values ('project_name'), ('position'), ('outcome')) f(field)
    where btrim(coalesce(e ->> (f.field || '_vi'), '')) <> '' and btrim(coalesce(e ->> (f.field || '_en'), '')) = ''
      and (f.field <> 'project_name' or e ->> 'kind' = 'project')
    union all
    select jsonb_build_object('entity', 'credential', 'id', c ->> 'id', 'field', 'title', 'vi', c ->> 'title_vi', 'context', c ->> 'issuer')
    from jsonb_array_elements(v_items -> 'credentials') c
    where btrim(coalesce(c ->> 'title_en', '')) = '') q), '[]');
end $$;

-------------------------------------------------------------------------------
-- S5 bước 2: chụp snapshot dữ liệu đã xác thực và đã duyệt, ghi staff_cv_exports (S-R1, S-R5, S-R9)
-------------------------------------------------------------------------------
create or replace function public.staff_cv_export(p_lang text, p_show_contact boolean, p_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
  p public.profiles;
  v_identity jsonb;
  v_items jsonb;
  v_code text := public.new_verify_code();
  v_base text;
  v_data jsonb;
  v_id uuid;
  v_current jsonb;
begin
  if v_user is null or not (public.is_admin() or v_user = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_lang not in ('vi', 'en') then raise exception 'bad_lang' using errcode = '22023'; end if;
  select * into p from public.profiles where user_id = v_user;
  if p.cv_type is null then raise exception 'no_cv_type' using errcode = '22023'; end if;
  if p_lang = 'en' and jsonb_array_length(public.staff_cv_missing_en(v_user)) > 0 then
    raise exception 'missing_en' using errcode = '22023';
  end if;

  v_identity := public.staff_identity(v_user);
  v_items := public.staff_cv_items(v_user);
  select value #>> '{}' into v_base from public.app_settings where key = 'app.public_base_url';
  v_base := rtrim(coalesce(v_base, 'https://app.vncentre.net'), '/');
  -- Vị trí hiện tại: vị trí của việc gần nhất có ghi vị trí
  select jsonb_build_object('vi', e ->> 'position_vi', 'en', e ->> 'position_en') into v_current
  from jsonb_array_elements(v_items -> 'engagements') e
  where btrim(coalesce(e ->> 'position_vi', '')) <> '' limit 1;

  v_data := jsonb_build_object(
    'lang', p_lang,
    'cv_type', p.cv_type,
    'verify_code', v_code,
    'verify_url', v_base || '/verify/' || v_code,
    'exported_at', (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    'person', jsonb_build_object(
      'full_name', coalesce(p.full_name, p.email, ''),
      'identity_code', v_identity ->> 'student_code',
      'photo_path', v_identity ->> 'avatar_url',
      'joined_vncentre_on', p.joined_vncentre_on,
      'current_position', v_current,
      -- Liên hệ chỉ có trong snapshot khi chủ hồ sơ chọn in (S5 bước 1)
      'contact', case when p_show_contact then jsonb_build_object('phone', p.phone, 'email', p.email) end),
    'stage_colors', coalesce((select jsonb_agg(color order by number) from public.passport_stages), '[]'),
    'tiles', coalesce((select jsonb_agg(t) from jsonb_array_elements(public.staff_stats(v_user) -> 'tiles') t
                       where t -> 'value' <> 'null'::jsonb), '[]'),
    'groups', coalesce((select jsonb_agg(distinct e ->> 'staff_group') from jsonb_array_elements(v_items -> 'engagements') e), '[]'),
    'engagements', v_items -> 'engagements',
    'credentials', v_items -> 'credentials',
    'skills', coalesce((select jsonb_agg(jsonb_build_object('code', s.code, 'name_vi', s.name_vi, 'name_en', s.name_en, 'count', n.cnt)
                                         order by n.cnt desc, s.sort_order)
      from (select sk.code, count(*) as cnt from jsonb_array_elements(v_items -> 'engagements') e
            cross join lateral jsonb_array_elements_text(e -> 'skills') sk(code) group by sk.code) n
      join public.staff_skills s on s.code = n.code), '[]'));

  perform set_config('app.audit_reason', 'Xuất CV', true);
  insert into public.staff_cv_exports (verify_code, user_id, cv_type, lang, data, exported_by)
  values (v_code, v_user, p.cv_type, p_lang, v_data, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'verify_code', v_code, 'user_id', v_user, 'data', v_data);
end $$;

-- Một bản đã xuất (Edge Function đọc để tạo hoặc tải PDF). Chủ hồ sơ hoặc admin
create or replace function public.staff_cv_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare x public.staff_cv_exports;
begin
  select * into x from public.staff_cv_exports where id = p_id;
  if x.id is null or not (public.is_admin() or x.user_id = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('id', x.id, 'user_id', x.user_id, 'verify_code', x.verify_code, 'status', x.status,
                            'pdf_path', x.pdf_path, 'data', x.data);
end $$;

create or replace function public.staff_cv_list(p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := coalesce(p_user_id, auth.uid());
begin
  if v_user is null or not (public.is_admin() or v_user = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'verify_code', verify_code, 'cv_type', cv_type, 'lang', lang,
      'exported_at', exported_at, 'status', status, 'revoked_at', revoked_at) order by exported_at desc)
    from public.staff_cv_exports where user_id = v_user), '[]');
end $$;

-- S5 bước 4: chủ hồ sơ hoặc admin thu hồi một bản đã xuất
create or replace function public.staff_cv_revoke(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform set_config('app.audit_reason', 'Thu hồi CV', true);
  update public.staff_cv_exports set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
  where id = p_id and status = 'valid' and (public.is_admin() or user_id = auth.uid());
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-------------------------------------------------------------------------------
-- S6 · Trang xác thực CV (S-R6, S-R7): công khai chỉ tên, vai trò, ngày xuất, trạng thái.
-- Chủ hồ sơ / admin đã đăng nhập nhận thêm `data` (bản đầy đủ, D55).
-------------------------------------------------------------------------------
create or replace function public.staff_cv_verify(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare x public.staff_cv_exports;
begin
  select * into x from public.staff_cv_exports
  where verify_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if x.id is null then return jsonb_build_object('result', 'not_found'); end if;
  return jsonb_build_object(
    'result', x.status, 'kind', 'staff_cv', 'verify_code', x.verify_code,
    'full_name', x.data -> 'person' ->> 'full_name', 'cv_type', x.cv_type,
    'exported_at', x.exported_at, 'revoked_at', x.revoked_at)
    || case when auth.uid() is not null and (x.user_id = auth.uid() or public.is_admin())
            then jsonb_build_object('data', x.data) else '{}'::jsonb end;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.staff_cv_missing_en(uuid)', 'public.staff_cv_export(text, boolean, uuid)', 'public.staff_cv_get(uuid)',
    'public.staff_cv_list(uuid)', 'public.staff_cv_revoke(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.staff_cv_verify(text) to anon, authenticated;
