-- Bộ kit truyền thông: lưu lên máy chủ để mở ở mọi thiết bị (anh Long duyệt 10/10/2026).
-- Xác minh bằng SĐT / email đã đăng ký trong danh sách nhân sự (người nhặt được thẻ đeo không biết số nên không xem được ảnh).
-- Đúng → cấp khoá phiên lưu trên thiết bị (chỉ lưu bản băm ở đây). Sai quá số lần → khoá 24 giờ.
-- Ảnh ở kho riêng tư crew-kit, chỉ Edge Function crew-kit (service role) đọc / ghi; admin xem được.

alter table public.event_crew_assignments
  add column kit_failures int not null default 0,
  add column kit_locked_until timestamptz;

create table public.crew_kit_saves (
  assignment_id uuid primary key references public.event_crew_assignments(id) on delete cascade,
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  data jsonb not null default '{}',             -- ô đã nhập, chỉnh phóng to / vị trí
  photo_p_path text,                             -- ảnh chân dung
  photo_s_path text,                             -- ảnh đang vung / theo gậy
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crew_kit_sessions (
  token_hash text primary key,
  assignment_id uuid not null references public.event_crew_assignments(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index crew_kit_sessions_assignment_idx on public.crew_kit_sessions (assignment_id);

create trigger set_updated_at before update on public.crew_kit_saves for each row execute function public.set_updated_at();
alter table public.crew_kit_saves enable row level security;
alter table public.crew_kit_sessions enable row level security;
create policy admin_all on public.crew_kit_saves for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_read on public.crew_kit_sessions for select to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crew-kit', 'crew-kit', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "crew kit: admin" on storage.objects for all to authenticated
  using (bucket_id = 'crew-kit' and public.is_admin())
  with check (bucket_id = 'crew-kit' and public.is_admin());

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('crew_kit.session_days', '180', 'Số ngày thiết bị được nhớ sau khi xác minh để mở bộ kit đã lưu', 'Days a device stays verified for the saved media kit', false);

-- Xác minh SĐT / email → khoá phiên. Trả kết quả (không raise) để số lần sai được ghi lại.
create or replace function public.crew_kit_login(p_code text, p_contact text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  a public.event_crew_assignments;
  v_contact jsonb := public.crew_parse_contact(p_contact);
  v_ok boolean;
  v_max int := public.setting_int('event.phone_check_max_failures', 5);
  v_token text;
begin
  select ea.* into a from public.event_crew_assignments ea join public.passports p on p.id = ea.passport_id
  where p.passport_code = public.normalize_code(p_code) order by ea.created_at desc limit 1;
  if a.id is null then return jsonb_build_object('result', 'not_found'); end if;
  perform 1 from public.event_crew_assignments where id = a.id for update;
  if a.kit_locked_until > now() then return jsonb_build_object('result', 'locked'); end if;
  if v_contact ->> 'kind' not in ('phone', 'email') then return jsonb_build_object('result', 'invalid'); end if;
  select exists (
    select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = a.student_id and sg.deleted_at is null
      and (g.phone = v_contact ->> 'value' or lower(g.email) = v_contact ->> 'value')) into v_ok;
  if not v_ok then
    update public.event_crew_assignments set kit_failures = kit_failures + 1,
      kit_locked_until = case when kit_failures + 1 >= v_max then now() + make_interval(hours => public.setting_int('event.phone_check_lock_hours', 24)) end
    where id = a.id;
    if a.kit_failures + 1 >= v_max then
      update public.event_crew_assignments set kit_failures = 0 where id = a.id;
      return jsonb_build_object('result', 'locked');
    end if;
    return jsonb_build_object('result', 'wrong', 'remaining', v_max - a.kit_failures - 1);
  end if;
  update public.event_crew_assignments set kit_failures = 0 where id = a.id and kit_failures > 0;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.crew_kit_sessions (token_hash, assignment_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), a.id, now() + make_interval(days => public.setting_int('crew_kit.session_days', 180)));
  return jsonb_build_object('result', 'ok', 'token', v_token);
end $$;

-- Khoá phiên → phân công (chỉ Edge Function dùng)
create or replace function public.crew_kit_resolve(p_token text)
returns uuid language sql stable security definer set search_path = public as $$
  select assignment_id from public.crew_kit_sessions
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now()
$$;

revoke execute on function public.crew_kit_login(text, text) from public, anon, authenticated;
revoke execute on function public.crew_kit_resolve(text) from public, anon, authenticated;
grant execute on function public.crew_kit_login(text, text) to service_role;
grant execute on function public.crew_kit_resolve(text) to service_role;
