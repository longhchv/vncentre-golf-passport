-- Spec 25 / 27 · Sân tập & phòng golf 3D — ĐỢT B: đề xuất của người dùng, ảnh, điểm đóng góp, chủ sân tự cập nhật, nhận trang.
-- Minh · 24/11/2026 · anh Long duyệt mức điểm và quy tắc nhận trang ngày 24/11/2026.
-- Chỉ thêm. Chạy lại nhiều lần không lỗi, không xoá dữ liệu.

-------------------------------------------------------------------------------
-- 0. Cột bổ sung trên practice_venues
-------------------------------------------------------------------------------
alter table public.practice_venues add column if not exists owner_updated_at timestamptz;

-------------------------------------------------------------------------------
-- 1. Đề xuất của người dùng
-------------------------------------------------------------------------------
create table if not exists public.practice_venue_submissions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_venue', 'edit', 'report_closed', 'claim')),
  venue_id text references public.practice_venues(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  evidence text,
  evidence_path text,                                        -- ảnh bằng chứng (nhận trang: giấy phép kinh doanh)
  submitted_by uuid not null default auth.uid() references public.profiles(user_id) on delete cascade,
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'partly_approved', 'rejected', 'duplicate')),
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  applied_fields text[] not null default '{}',
  result_venue_id text,                                      -- mã địa điểm được tạo khi duyệt new_venue
  check (kind = 'new_venue' or venue_id is not null)
);
create index if not exists pv_sub_status_idx on public.practice_venue_submissions (status, submitted_at);
create index if not exists pv_sub_user_idx on public.practice_venue_submissions (submitted_by, submitted_at desc);

-------------------------------------------------------------------------------
-- 2. Ảnh (kho venue-photos, công khai theo đường dẫn khó đoán; không cho liệt kê)
-------------------------------------------------------------------------------
create table if not exists public.practice_venue_photos (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.practice_venues(id) on delete cascade,
  submission_id uuid references public.practice_venue_submissions(id) on delete set null,
  path text not null unique,                                 -- <user_id>/<uuid>.jpg
  tag text not null default 'other' check (tag in ('facade', 'bay', 'simulator', 'range', 'cafe', 'parking', 'price_board', 'other')),
  caption_vi text, caption_en text,
  consent boolean not null check (consent),
  uploaded_by uuid not null default auth.uid() references public.profiles(user_id) on delete cascade,
  uploaded_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  sort int not null default 100
);
create index if not exists pv_photos_venue_idx on public.practice_venue_photos (venue_id, status);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'practice_venues_cover_fk') then
    alter table public.practice_venues add constraint practice_venues_cover_fk
      foreign key (cover_photo_id) references public.practice_venue_photos(id) on delete set null;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('venue-photos', 'venue-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "venue photos: tải ảnh của mình" on storage.objects;
create policy "venue photos: tải ảnh của mình" on storage.objects for insert to authenticated
  with check (bucket_id = 'venue-photos' and public.storage_first_uuid(name) = auth.uid());
drop policy if exists "venue photos: xoá ảnh của mình" on storage.objects;
create policy "venue photos: xoá ảnh của mình" on storage.objects for delete to authenticated
  using (bucket_id = 'venue-photos' and public.storage_first_uuid(name) = auth.uid());
drop policy if exists "venue photos: admin" on storage.objects;
create policy "venue photos: admin" on storage.objects for all to authenticated
  using (bucket_id = 'venue-photos' and public.is_admin())
  with check (bucket_id = 'venue-photos' and public.is_admin());

-------------------------------------------------------------------------------
-- 3. Điểm đóng góp (chờ ghi vào ví người lớn — spec 21; 1 điểm = 1.000 đ)
-------------------------------------------------------------------------------
create table if not exists public.venue_contribution_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  points int not null,
  reason text not null check (reason in ('new_venue', 'edit', 'machine_photo', 'price_photo', 'photo', 'revoke')),
  source_type text not null check (source_type in ('submission', 'photo', 'admin')),
  source_id uuid,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  credited_at timestamptz                                    -- điền khi đã chuyển sang ví người lớn
);
create index if not exists vcp_user_idx on public.venue_contribution_points (user_id, created_at);

-- Mức điểm đã duyệt 24/11/2026 và trần 300 điểm / tháng (giờ Việt Nam)
create or replace function public.pv_award(p_user uuid, p_points int, p_reason text, p_source_type text, p_source_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare used int; give int;
begin
  select coalesce(sum(points), 0) into used from public.venue_contribution_points
  where user_id = p_user and points > 0
    and date_trunc('month', created_at at time zone 'Asia/Ho_Chi_Minh') = date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh');
  give := least(p_points, greatest(0, 300 - used));
  if give > 0 then
    insert into public.venue_contribution_points (user_id, points, reason, source_type, source_id)
    values (p_user, give, p_reason, p_source_type, p_source_id);
  end if;
  return give;
end $$;
revoke execute on function public.pv_award(uuid, int, text, text, uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- 4. Trường được phép đề xuất / chủ sân tự sửa
-------------------------------------------------------------------------------
create or replace function public.pv_edit_fields() returns text[] language sql immutable as $$
  select array['name', 'type', 'district', 'address', 'lat', 'lng', 'phone', 'email', 'web', 'fb_url', 'hours', 'late',
               'machine', 'machine_detail', 'bays', 'svc', 'parking', 'parking_note', 'residents_only', 'prices']
$$;
create or replace function public.pv_owner_fields() returns text[] language sql immutable as $$
  select array['phone', 'email', 'web', 'fb_url', 'hours', 'late', 'machine', 'machine_detail', 'bays', 'svc',
               'parking', 'parking_note', 'prices']
$$;

-- Áp dụng các trường của p_patch (đã lọc) vào một địa điểm, giữ nguyên kiểu dữ liệu
create or replace function public.pv_apply_patch(p_venue_id text, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare cur jsonb; merged public.practice_venues;
begin
  select to_jsonb(v) into cur from public.practice_venues v where id = p_venue_id for update;
  if cur is null then raise exception 'venue_not_found'; end if;
  merged := jsonb_populate_record(null::public.practice_venues, cur || p_patch);
  update public.practice_venues set
    name = merged.name, type = merged.type, district = merged.district, address = merged.address,
    lat = merged.lat, lng = merged.lng, phone = merged.phone, email = merged.email, web = merged.web,
    fb_url = merged.fb_url, hours = merged.hours, late = merged.late, machine = merged.machine,
    machine_detail = merged.machine_detail, bays = merged.bays, svc = merged.svc, parking = merged.parking,
    parking_note = merged.parking_note, residents_only = merged.residents_only, prices = merged.prices,
    status = merged.status, owner_updated_at = merged.owner_updated_at, updated_by = auth.uid()
  where id = p_venue_id;
end $$;
revoke execute on function public.pv_apply_patch(text, jsonb) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- 5. Người dùng gửi đề xuất
-------------------------------------------------------------------------------
create or replace function public.pv_submit(p_kind text, p_venue_id text, p_payload jsonb, p_evidence text, p_evidence_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_patch jsonb := '{}'::jsonb; k text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'insufficient_privilege'; end if;
  if (select count(*) from public.practice_venue_submissions where submitted_by = v_uid and status = 'pending') >= 20 then
    raise exception 'too_many_pending';
  end if;
  if p_kind not in ('new_venue', 'edit', 'report_closed', 'claim') then raise exception 'invalid_kind'; end if;
  if p_kind <> 'new_venue' and not exists (select 1 from public.practice_venues where id = p_venue_id) then
    raise exception 'venue_not_found';
  end if;
  if p_kind in ('new_venue', 'edit') then
    for k in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
      if k = any (public.pv_edit_fields() || array['region']) then v_patch := v_patch || jsonb_build_object(k, p_payload -> k); end if;
    end loop;
    if v_patch = '{}'::jsonb then raise exception 'nothing_changed'; end if;
    if p_kind = 'new_venue' and (coalesce(v_patch ->> 'name', '') = '' or coalesce(v_patch ->> 'type', '') = '' or coalesce(v_patch ->> 'region', '') = '') then
      raise exception 'new_venue_incomplete';
    end if;
  elsif p_kind = 'report_closed' then
    v_patch := jsonb_build_object('status', case when p_payload ->> 'status' = 'closed' then 'closed' else 'closed_temp' end);
  elsif p_kind = 'claim' then
    if p_evidence_path is null and coalesce(p_evidence, '') = '' then raise exception 'claim_needs_evidence'; end if;
    v_patch := jsonb_build_object('business_name', p_payload ->> 'business_name', 'role', p_payload ->> 'role', 'contact_phone', p_payload ->> 'contact_phone');
  end if;
  insert into public.practice_venue_submissions (kind, venue_id, payload, evidence, evidence_path)
  values (p_kind, case when p_kind = 'new_venue' then null else p_venue_id end, v_patch, nullif(trim(p_evidence), ''), p_evidence_path)
  returning id into v_id;
  return v_id;
end $$;

-------------------------------------------------------------------------------
-- 6. Admin duyệt / từ chối
-------------------------------------------------------------------------------
create or replace function public.pv_approve_submission(p_id uuid, p_fields text[] default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.practice_venue_submissions; v_patch jsonb := '{}'::jsonb; k text; v_fields text[] := '{}';
        v_new text; v_partner uuid; v_pts int := 0; v_status text;
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  select * into s from public.practice_venue_submissions where id = p_id for update;
  if s is null or s.status <> 'pending' then raise exception 'not_pending'; end if;
  perform set_config('pv.source', 'submission', true);
  perform set_config('pv.source_id', p_id::text, true);

  if s.kind in ('edit', 'new_venue') then
    for k in select jsonb_object_keys(s.payload) loop
      if p_fields is null or k = any (p_fields) or k = 'region' then
        v_patch := v_patch || jsonb_build_object(k, s.payload -> k);
        if k <> 'region' then v_fields := v_fields || k; end if;
      end if;
    end loop;
    if cardinality(v_fields) = 0 then raise exception 'no_field_selected'; end if;
  end if;

  if s.kind = 'edit' then
    perform public.pv_apply_patch(s.venue_id, v_patch - 'region');
    v_pts := public.pv_award(s.submitted_by, 5, 'edit', 'submission', s.id);
    if 'machine' = any (v_fields) and exists (select 1 from public.practice_venue_photos where submission_id = s.id and tag = 'simulator') then
      v_pts := v_pts + public.pv_award(s.submitted_by, 10, 'machine_photo', 'submission', s.id);
    end if;
    if 'prices' = any (v_fields) and exists (select 1 from public.practice_venue_photos where submission_id = s.id and tag = 'price_board') then
      v_pts := v_pts + public.pv_award(s.submitted_by, 10, 'price_photo', 'submission', s.id);
    end if;
  elsif s.kind = 'new_venue' then
    v_new := public.pv_next_id(s.payload ->> 'region');
    insert into public.practice_venues (id, region, name, type, status, created_by)
    values (v_new, s.payload ->> 'region', s.payload ->> 'name', s.payload ->> 'type', 'active', s.submitted_by);
    perform public.pv_apply_patch(v_new, v_patch - 'region' - 'name' - 'type');
    update public.practice_venue_photos set venue_id = v_new where submission_id = s.id;
    if s.payload ? 'name' and s.payload ? 'type' and s.payload ? 'lat' and s.payload ? 'phone' then
      v_pts := public.pv_award(s.submitted_by, 20, 'new_venue', 'submission', s.id);
    else
      v_pts := public.pv_award(s.submitted_by, 5, 'edit', 'submission', s.id);
    end if;
  elsif s.kind = 'report_closed' then
    perform public.pv_apply_patch(s.venue_id, jsonb_build_object('status', s.payload ->> 'status'));
    v_fields := array['status'];
    v_pts := public.pv_award(s.submitted_by, 5, 'edit', 'submission', s.id);
  elsif s.kind = 'claim' then
    select partner_id into v_partner from public.practice_venues where id = s.venue_id;
    if v_partner is null then
      insert into public.partners (name, kind, address, lat, lng, status, contract_note)
      select v.name, 'driving_range', v.address, v.lat, v.lng, 'draft', 'Nhận trang sân tập ' || v.id || ' qua đề xuất ' || s.id
      from public.practice_venues v where v.id = s.venue_id
      returning id into v_partner;
      perform public.pv_apply_patch(s.venue_id, '{}'::jsonb);
      update public.practice_venues set partner_id = v_partner where id = s.venue_id;
    end if;
    insert into public.partner_staff (partner_id, user_id, role) values (v_partner, s.submitted_by, 'manager')
    on conflict (partner_id, user_id) where deleted_at is null do update set role = 'manager';
    if not exists (select 1 from public.user_roles where user_id = s.submitted_by and role = 'partner_staff' and deleted_at is null) then
      insert into public.user_roles (user_id, role, granted_by) values (s.submitted_by, 'partner_staff', auth.uid());
    end if;
    v_fields := array['partner_id'];
  end if;

  v_status := case when s.kind in ('edit', 'new_venue') and cardinality(v_fields) < (select count(*) from jsonb_object_keys(s.payload - 'region'))
                   then 'partly_approved' else 'approved' end;
  update public.practice_venue_submissions set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(),
    review_note = nullif(trim(p_note), ''), applied_fields = v_fields, result_venue_id = coalesce(v_new, s.venue_id)
  where id = p_id;
  return jsonb_build_object('status', v_status, 'venue_id', coalesce(v_new, s.venue_id), 'points', v_pts);
end $$;

create or replace function public.pv_reject_submission(p_id uuid, p_note text, p_duplicate boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
  update public.practice_venue_submissions set status = case when p_duplicate then 'duplicate' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = trim(p_note)
  where id = p_id and status = 'pending';
  if not found then raise exception 'not_pending'; end if;
  update public.practice_venue_photos set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  where submission_id = p_id and status = 'pending';
end $$;

-- Ảnh: duyệt / từ chối / đặt ảnh đại diện. 2 điểm mỗi ảnh, tối đa 5 ảnh được thưởng / người / địa điểm
create or replace function public.pv_moderate_photo(p_id uuid, p_status text, p_cover boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare ph public.practice_venue_photos; n int; v_pts int := 0;
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'invalid_status'; end if;
  select * into ph from public.practice_venue_photos where id = p_id for update;
  if ph is null then raise exception 'photo_not_found'; end if;
  if ph.status = 'pending' and p_status = 'approved' then
    select count(*) into n from public.venue_contribution_points c
      join public.practice_venue_photos x on x.id = c.source_id
      where c.reason = 'photo' and c.user_id = ph.uploaded_by and x.venue_id = ph.venue_id;
    if n < 5 then v_pts := public.pv_award(ph.uploaded_by, 2, 'photo', 'photo', ph.id); end if;
  end if;
  update public.practice_venue_photos set status = p_status, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  if p_cover and p_status = 'approved' then
    perform set_config('pv.source', 'admin', true);
    update public.practice_venues set cover_photo_id = p_id, updated_by = auth.uid() where id = ph.venue_id;
  end if;
  return v_pts;
end $$;

-------------------------------------------------------------------------------
-- 7. Chủ sân tự cập nhật (không qua duyệt; ghi lịch sử nguồn 'owner')
-------------------------------------------------------------------------------
create or replace function public.pv_is_owner(p_venue_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.practice_venues v join public.partner_staff ps on ps.partner_id = v.partner_id
    join public.profiles p on p.user_id = ps.user_id and p.status = 'active'
    where v.id = p_venue_id and ps.user_id = auth.uid() and ps.role = 'manager' and ps.deleted_at is null)
$$;

create or replace function public.pv_owner_update(p_venue_id text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_patch jsonb := '{}'::jsonb; k text;
begin
  if not public.pv_is_owner(p_venue_id) then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  for k in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if k = any (public.pv_owner_fields()) then v_patch := v_patch || jsonb_build_object(k, p_payload -> k); end if;
  end loop;
  if v_patch = '{}'::jsonb then raise exception 'nothing_changed'; end if;
  perform set_config('pv.source', 'owner', true);
  perform public.pv_apply_patch(p_venue_id, v_patch || jsonb_build_object('owner_updated_at', now()));
end $$;

-- Địa điểm mà tài khoản đang quản lý (cho trang "Trang của tôi" trong /partner)
create or replace function public.pv_my_venues() returns setof public.practice_venues
language sql stable security definer set search_path = public as $$
  select v.* from public.practice_venues v
  where exists (select 1 from public.partner_staff ps where ps.partner_id = v.partner_id and ps.user_id = auth.uid()
                and ps.role = 'manager' and ps.deleted_at is null)
  order by v.name
$$;

-------------------------------------------------------------------------------
-- 8. RLS
-------------------------------------------------------------------------------
alter table public.practice_venue_submissions enable row level security;
alter table public.practice_venue_photos enable row level security;
alter table public.venue_contribution_points enable row level security;

drop policy if exists pvs_own_read on public.practice_venue_submissions;
create policy pvs_own_read on public.practice_venue_submissions for select to authenticated
  using (submitted_by = auth.uid() or public.is_admin());
drop policy if exists pvs_admin on public.practice_venue_submissions;
create policy pvs_admin on public.practice_venue_submissions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.practice_venue_submissions from anon;
grant select, update on public.practice_venue_submissions to authenticated;

drop policy if exists pvp_read on public.practice_venue_photos;
create policy pvp_read on public.practice_venue_photos for select to authenticated
  using (uploaded_by = auth.uid() or public.is_admin() or status = 'approved' or public.pv_is_owner(venue_id));
drop policy if exists pvp_insert on public.practice_venue_photos;
create policy pvp_insert on public.practice_venue_photos for insert to authenticated
  with check (uploaded_by = auth.uid() and status = 'pending' and consent
              and split_part(path, '/', 1) = auth.uid()::text
              and (submission_id is null or exists (select 1 from public.practice_venue_submissions s
                   where s.id = submission_id and s.submitted_by = auth.uid())));
drop policy if exists pvp_own_delete on public.practice_venue_photos;
create policy pvp_own_delete on public.practice_venue_photos for delete to authenticated
  using ((uploaded_by = auth.uid() and status = 'pending') or public.is_admin());
drop policy if exists pvp_admin on public.practice_venue_photos;
create policy pvp_admin on public.practice_venue_photos for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.practice_venue_photos from anon;
grant select, insert, update, delete on public.practice_venue_photos to authenticated;

drop policy if exists vcp_read on public.venue_contribution_points;
create policy vcp_read on public.venue_contribution_points for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke all on public.venue_contribution_points from anon;
grant select on public.venue_contribution_points to authenticated;

-- Admin đọc thêm được bảng địa điểm gốc đã có (đợt A); người đề xuất mới cần đọc tên địa điểm qua view công khai.

-------------------------------------------------------------------------------
-- 9. View công khai: ảnh đã duyệt; view địa điểm thêm ảnh đại diện + mốc chủ sân cập nhật
-------------------------------------------------------------------------------
create or replace view public.pv_public_photos with (security_invoker = false) as
  select p.id, p.venue_id, p.path, p.tag, p.caption_vi, p.caption_en, p.sort, (v.cover_photo_id = p.id) as is_cover
  from public.practice_venue_photos p join public.practice_venues v on v.id = p.venue_id
  where p.status = 'approved' and v.status in ('active', 'closed_temp');
grant select on public.pv_public_photos to anon, authenticated;

create or replace view public.pv_public_venues with (security_invoker = false) as
  select v.id, v.region, v.name, v.type, v.district, v.address, v.lat, v.lng, v.phone, v.email, v.web,
         v.fb_url, v.fb_chain_url, v.fb_chain_name, v.videos, v.hours, v.late, v.machine, v.machine_detail, v.bays,
         v.svc, v.parking, v.parking_note, v.residents_only, v.prices, v.google_rating, v.google_reviews,
         v.status, v.vnc_score, v.vnc_scored_at, v.user_rating, v.user_reviews, v.updated_at,
         v.owner_updated_at, (select p.path from public.practice_venue_photos p where p.id = v.cover_photo_id and p.status = 'approved') as cover_path,
         (v.partner_id is not null) as claimed
  from public.practice_venues v
  where v.status in ('active', 'closed_temp');
grant select on public.pv_public_venues to anon, authenticated;

-------------------------------------------------------------------------------
-- 10. Quyền gọi hàm
-------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.pv_submit(text, text, jsonb, text, text)', 'public.pv_approve_submission(uuid, text[], text)',
    'public.pv_reject_submission(uuid, text, boolean)', 'public.pv_moderate_photo(uuid, text, boolean)',
    'public.pv_owner_update(text, jsonb)', 'public.pv_my_venues()', 'public.pv_is_owner(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
