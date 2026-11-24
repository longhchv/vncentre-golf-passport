-- Spec 25 / 28 · Sân tập & phòng golf 3D — ĐỢT C: khảo sát VN Centre (lớp 1) và đánh giá người dùng (lớp 2);
-- kèm: kho riêng tư venue-private cho ảnh giấy phép kinh doanh khi nhận trang (anh Long chốt 24/11/2026).
-- Minh · 24/11/2026. Chỉ thêm. Chạy lại nhiều lần không lỗi, không xoá dữ liệu.

-------------------------------------------------------------------------------
-- 0. Kho riêng tư cho giấy tờ nhận trang: <user_id>/claim-<uuid>.jpg
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('venue-private', 'venue-private', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "venue private: chủ tải" on storage.objects;
create policy "venue private: chủ tải" on storage.objects for insert to authenticated
  with check (bucket_id = 'venue-private' and public.storage_first_uuid(name) = auth.uid());
drop policy if exists "venue private: chủ xem" on storage.objects;
create policy "venue private: chủ xem" on storage.objects for select to authenticated
  using (bucket_id = 'venue-private' and public.storage_first_uuid(name) = auth.uid());
drop policy if exists "venue private: admin" on storage.objects;
create policy "venue private: admin" on storage.objects for all to authenticated
  using (bucket_id = 'venue-private' and public.is_admin())
  with check (bucket_id = 'venue-private' and public.is_admin());

-------------------------------------------------------------------------------
-- 1. Khảo sát VN Centre: một dòng = một lần giao việc → phiếu
-------------------------------------------------------------------------------
create table if not exists public.practice_venue_surveys (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.practice_venues(id) on delete cascade,
  surveyor_id uuid not null references public.profiles(user_id) on delete cascade,
  assigned_by uuid references public.profiles(user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  visit_date date,
  answers jsonb not null default '{}'::jsonb,               -- trường thông tin (hãng máy, giá, giờ, đỗ xe…) cùng khoá với practice_venues
  scores jsonb not null default '{}'::jsonb,                -- facility, tech, service, clean, value, family: 1–10
  overall numeric(3, 1),
  pros_vi text, cons_vi text, pros_en text, cons_en text,
  status text not null default 'assigned' check (status in ('assigned', 'draft', 'submitted', 'approved', 'rejected')),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  published boolean not null default false,
  applied_fields text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists pvsv_surveyor_idx on public.practice_venue_surveys (surveyor_id, status);
create index if not exists pvsv_venue_idx on public.practice_venue_surveys (venue_id, status);

create or replace function public.pv_score_keys() returns text[] language sql immutable as $$
  select array['facility', 'tech', 'service', 'clean', 'value', 'family']
$$;

-- Admin giao địa điểm cho khảo sát viên (người có vai venue_surveyor)
create or replace function public.pv_assign_survey(p_venue_ids text[], p_surveyor uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_surveyor and role in ('venue_surveyor', 'admin') and deleted_at is null) then
    raise exception 'not_a_surveyor';
  end if;
  insert into public.practice_venue_surveys (venue_id, surveyor_id, assigned_by)
  select v, p_surveyor, auth.uid() from unnest(p_venue_ids) v
  where exists (select 1 from public.practice_venues where id = v)
    and not exists (select 1 from public.practice_venue_surveys s where s.venue_id = v and s.surveyor_id = p_surveyor
                    and s.status in ('assigned', 'draft', 'submitted'));
  get diagnostics n = row_count;
  return n;
end $$;

-- Khảo sát viên lưu nháp / gửi phiếu
create or replace function public.pv_save_survey(p_id uuid, p_visit_date date, p_answers jsonb, p_scores jsonb,
  p_pros text, p_cons text, p_submit boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.practice_venue_surveys; k text; v numeric; clean jsonb := '{}'::jsonb; ans jsonb := '{}'::jsonb; avg numeric;
begin
  select * into s from public.practice_venue_surveys where id = p_id for update;
  if s is null or s.surveyor_id <> auth.uid() then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  if s.status not in ('assigned', 'draft') then raise exception 'not_editable'; end if;
  foreach k in array public.pv_score_keys() loop
    if p_scores ? k and jsonb_typeof(p_scores -> k) = 'number' then
      v := (p_scores ->> k)::numeric;
      if v < 1 or v > 10 then raise exception 'score_out_of_range'; end if;
      clean := clean || jsonb_build_object(k, v);
    end if;
  end loop;
  for k in select jsonb_object_keys(coalesce(p_answers, '{}'::jsonb)) loop
    if k = any (public.pv_edit_fields()) then ans := ans || jsonb_build_object(k, p_answers -> k); end if;
  end loop;
  select round(avg(value::numeric), 1) into avg from jsonb_each_text(clean);
  if p_submit and (select count(*) from jsonb_object_keys(clean)) < 6 then raise exception 'scores_incomplete'; end if;
  if p_submit and p_visit_date is null then raise exception 'visit_date_required'; end if;
  update public.practice_venue_surveys set visit_date = p_visit_date, answers = ans, scores = clean, overall = avg,
    pros_vi = nullif(trim(p_pros), ''), cons_vi = nullif(trim(p_cons), ''),
    status = case when p_submit then 'submitted' else 'draft' end,
    submitted_at = case when p_submit then now() else submitted_at end, updated_at = now()
  where id = p_id;
end $$;

-- Admin duyệt phiếu: áp dụng các trường thông tin được chọn, công bố điểm VN Centre nếu chọn
create or replace function public.pv_approve_survey(p_id uuid, p_fields text[], p_publish boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.practice_venue_surveys; patch jsonb := '{}'::jsonb; k text; f text[] := '{}';
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  select * into s from public.practice_venue_surveys where id = p_id for update;
  if s is null or s.status <> 'submitted' then raise exception 'not_pending'; end if;
  for k in select jsonb_object_keys(s.answers) loop
    if p_fields is null or k = any (p_fields) then patch := patch || jsonb_build_object(k, s.answers -> k); f := f || k; end if;
  end loop;
  perform set_config('pv.source', 'survey', true);
  perform set_config('pv.source_id', p_id::text, true);
  if patch <> '{}'::jsonb then perform public.pv_apply_patch(s.venue_id, patch); end if;
  if p_publish then
    update public.practice_venue_surveys set published = false where venue_id = s.venue_id and published and id <> p_id;
    update public.practice_venues set vnc_score = s.overall, vnc_scored_at = coalesce(s.visit_date, current_date), updated_by = auth.uid()
    where id = s.venue_id;
  end if;
  update public.practice_venue_surveys set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
    review_note = nullif(trim(p_note), ''), published = p_publish, applied_fields = f, updated_at = now()
  where id = p_id;
end $$;

create or replace function public.pv_reject_survey(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
  -- trả về nháp để khảo sát viên sửa và gửi lại
  update public.practice_venue_surveys set status = 'draft', reviewed_by = auth.uid(), reviewed_at = now(), review_note = trim(p_note), updated_at = now()
  where id = p_id and status = 'submitted';
  if not found then raise exception 'not_pending'; end if;
end $$;

-- Danh sách khảo sát viên (cho admin chọn khi giao việc)
create or replace function public.pv_surveyors() returns table (user_id uuid, full_name text, email text, phone text, open_tasks int)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.full_name, p.email, p.phone,
    (select count(*)::int from public.practice_venue_surveys s where s.surveyor_id = p.user_id and s.status in ('assigned', 'draft', 'submitted'))
  from public.profiles p
  where public.is_admin() and exists (select 1 from public.user_roles r where r.user_id = p.user_id and r.role = 'venue_surveyor' and r.deleted_at is null)
  order by p.full_name
$$;

-------------------------------------------------------------------------------
-- 2. Đánh giá người dùng: hiện ngay (Q7); 3 báo cáo → vào hàng chờ admin; chủ sân trả lời 1 lần
-------------------------------------------------------------------------------
create table if not exists public.practice_venue_reviews (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.practice_venues(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(user_id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  sub jsonb not null default '{}'::jsonb,                    -- tech, service, value, family: 1–5 (tuỳ chọn)
  body text check (body is null or char_length(body) <= 2000),
  visit_month date,
  status text not null default 'published' check (status in ('published', 'hidden')),
  hidden_reason text, hidden_by uuid references public.profiles(user_id) on delete set null, hidden_at timestamptz,
  report_count int not null default 0,
  owner_reply text check (owner_reply is null or char_length(owner_reply) <= 1000),
  owner_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, user_id)
);
create index if not exists pvr_venue_idx on public.practice_venue_reviews (venue_id, status, created_at desc);

create table if not exists public.practice_venue_review_reports (
  review_id uuid not null references public.practice_venue_reviews(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(user_id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table if not exists public.practice_venue_review_history (
  id bigint generated always as identity primary key,
  review_id uuid not null,
  changed_at timestamptz not null default now(),
  before jsonb
);

-- Tính lại điểm người dùng của địa điểm
create or replace function public.pv_recalc_rating(p_venue text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.practice_venues v set
    user_rating = (select round(avg(stars)::numeric, 1) from public.practice_venue_reviews r where r.venue_id = p_venue and r.status = 'published'),
    user_reviews = (select count(*) from public.practice_venue_reviews r where r.venue_id = p_venue and r.status = 'published')
  where v.id = p_venue
    and (v.user_rating is distinct from (select round(avg(stars)::numeric, 1) from public.practice_venue_reviews r where r.venue_id = p_venue and r.status = 'published')
      or v.user_reviews <> (select count(*) from public.practice_venue_reviews r where r.venue_id = p_venue and r.status = 'published'));
end $$;
-- Điểm người dùng tự tính lại: không ghi lịch sử, không đổi ngày "cập nhật" của địa điểm
drop trigger if exists set_updated_at on public.practice_venues;
create trigger set_updated_at before update on public.practice_venues for each row
  when ((to_jsonb(old) - array['user_rating', 'user_reviews', 'updated_at']) is distinct from (to_jsonb(new) - array['user_rating', 'user_reviews', 'updated_at']))
  execute function public.set_updated_at();
drop trigger if exists pv_log_change on public.practice_venues;
create trigger pv_log_change after insert or delete on public.practice_venues for each row execute function public.pv_log_change();
drop trigger if exists pv_log_change_upd on public.practice_venues;
create trigger pv_log_change_upd after update on public.practice_venues for each row
  when ((to_jsonb(old) - array['user_rating', 'user_reviews', 'updated_at']) is distinct from (to_jsonb(new) - array['user_rating', 'user_reviews', 'updated_at']))
  execute function public.pv_log_change();

create or replace function public.pv_review_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (old.stars, old.body, old.sub) is distinct from (new.stars, new.body, new.sub) then
    insert into public.practice_venue_review_history (review_id, before) values (old.id, to_jsonb(old));
  end if;
  perform public.pv_recalc_rating(coalesce(new.venue_id, old.venue_id));
  return coalesce(new, old);
end $$;
drop trigger if exists pv_review_changed on public.practice_venue_reviews;
create trigger pv_review_changed after insert or update or delete on public.practice_venue_reviews
  for each row execute function public.pv_review_changed();

create or replace function public.pv_save_review(p_venue_id text, p_stars int, p_sub jsonb, p_body text, p_visit_month date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; k text; clean jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'insufficient_privilege'; end if;
  if p_stars not between 1 and 5 then raise exception 'stars_invalid'; end if;
  if not exists (select 1 from public.practice_venues where id = p_venue_id and status in ('active', 'closed_temp')) then raise exception 'venue_not_found'; end if;
  if exists (select 1 from public.practice_venues v join public.partner_staff ps on ps.partner_id = v.partner_id
             where v.id = p_venue_id and ps.user_id = auth.uid() and ps.deleted_at is null) then
    raise exception 'owner_cannot_review';
  end if;
  foreach k in array array['tech', 'service', 'value', 'family'] loop
    if p_sub ? k and (p_sub ->> k)::int between 1 and 5 then clean := clean || jsonb_build_object(k, (p_sub ->> k)::int); end if;
  end loop;
  insert into public.practice_venue_reviews (venue_id, user_id, stars, sub, body, visit_month)
  values (p_venue_id, auth.uid(), p_stars, clean, nullif(trim(p_body), ''), p_visit_month)
  on conflict (venue_id, user_id) do update set stars = excluded.stars, sub = excluded.sub, body = excluded.body,
    visit_month = excluded.visit_month, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.pv_report_review(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'insufficient_privilege'; end if;
  insert into public.practice_venue_review_reports (review_id, user_id, reason) values (p_id, auth.uid(), nullif(trim(p_reason), ''))
  on conflict do nothing;
  if found then update public.practice_venue_reviews set report_count = report_count + 1 where id = p_id; end if;
end $$;

create or replace function public.pv_moderate_review(p_id uuid, p_hide boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  if p_hide and coalesce(trim(p_reason), '') = '' then raise exception 'note_required'; end if;
  update public.practice_venue_reviews set status = case when p_hide then 'hidden' else 'published' end,
    hidden_reason = case when p_hide then trim(p_reason) end, hidden_by = case when p_hide then auth.uid() end,
    hidden_at = case when p_hide then now() end,
    report_count = case when p_hide then report_count else 0 end
  where id = p_id;
  if not p_hide then delete from public.practice_venue_review_reports where review_id = p_id; end if;
end $$;

create or replace function public.pv_owner_reply(p_id uuid, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.practice_venue_reviews;
begin
  select * into r from public.practice_venue_reviews where id = p_id for update;
  if r is null or not public.pv_is_owner(r.venue_id) then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  if r.owner_reply is not null then raise exception 'already_replied'; end if;
  if coalesce(trim(p_reply), '') = '' then raise exception 'reply_required'; end if;
  update public.practice_venue_reviews set owner_reply = trim(p_reply), owner_reply_at = now() where id = p_id;
end $$;

-------------------------------------------------------------------------------
-- 3. RLS
-------------------------------------------------------------------------------
alter table public.practice_venue_surveys enable row level security;
alter table public.practice_venue_reviews enable row level security;
alter table public.practice_venue_review_reports enable row level security;
alter table public.practice_venue_review_history enable row level security;

drop policy if exists pvsv_read on public.practice_venue_surveys;
create policy pvsv_read on public.practice_venue_surveys for select to authenticated
  using (surveyor_id = auth.uid() or public.is_admin());
revoke all on public.practice_venue_surveys from anon;
grant select on public.practice_venue_surveys to authenticated;

drop policy if exists pvr_read on public.practice_venue_reviews;
create policy pvr_read on public.practice_venue_reviews for select to authenticated
  using (status = 'published' or user_id = auth.uid() or public.is_admin() or public.pv_is_owner(venue_id));
revoke all on public.practice_venue_reviews from anon;
grant select on public.practice_venue_reviews to authenticated;

drop policy if exists pvrr_admin on public.practice_venue_review_reports;
create policy pvrr_admin on public.practice_venue_review_reports for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
revoke all on public.practice_venue_review_reports from anon;
grant select on public.practice_venue_review_reports to authenticated;

drop policy if exists pvrh_admin on public.practice_venue_review_history;
create policy pvrh_admin on public.practice_venue_review_history for select to authenticated using (public.is_admin());
revoke all on public.practice_venue_review_history from anon;
grant select on public.practice_venue_review_history to authenticated;

-- Khảo sát viên đọc bảng địa điểm gốc đã có từ đợt A (pv_surveyor_read)

-------------------------------------------------------------------------------
-- 4. View công khai
-------------------------------------------------------------------------------
-- Tên hiển thị rút gọn: tên gọi + chữ cái đầu của họ ("Vũ Anh Long" → "Long V.")
create or replace function public.pv_short_name(p text) returns text language sql immutable as $$
  select case when coalesce(trim(p), '') = '' then null
              when array_length(regexp_split_to_array(trim(p), '\s+'), 1) = 1 then trim(p)
              else (regexp_split_to_array(trim(p), '\s+'))[array_length(regexp_split_to_array(trim(p), '\s+'), 1)]
                   || ' ' || left((regexp_split_to_array(trim(p), '\s+'))[1], 1) || '.' end
$$;

create or replace view public.pv_public_reviews with (security_invoker = false) as
  select r.id, r.venue_id, r.stars, r.sub, r.body, r.visit_month, r.created_at, r.updated_at, r.owner_reply, r.owner_reply_at,
         coalesce(public.pv_short_name(p.full_name), 'Golfer') as author
  from public.practice_venue_reviews r
  join public.practice_venues v on v.id = r.venue_id and v.status in ('active', 'closed_temp')
  left join public.profiles p on p.user_id = r.user_id
  where r.status = 'published';
grant select on public.pv_public_reviews to anon, authenticated;

create or replace view public.pv_public_surveys with (security_invoker = false) as
  select s.venue_id, s.overall, s.scores, s.pros_vi, s.cons_vi, s.pros_en, s.cons_en, s.visit_date
  from public.practice_venue_surveys s
  join public.practice_venues v on v.id = s.venue_id and v.status in ('active', 'closed_temp')
  where s.published and s.status = 'approved';
grant select on public.pv_public_surveys to anon, authenticated;

-------------------------------------------------------------------------------
-- 5. Quyền gọi hàm
-------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.pv_assign_survey(text[], uuid)', 'public.pv_save_survey(uuid, date, jsonb, jsonb, text, text, boolean)',
    'public.pv_approve_survey(uuid, text[], boolean, text)', 'public.pv_reject_survey(uuid, text)', 'public.pv_surveyors()',
    'public.pv_save_review(text, integer, jsonb, text, date)', 'public.pv_report_review(uuid, text)',
    'public.pv_moderate_review(uuid, boolean, text)', 'public.pv_owner_reply(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.pv_recalc_rating(text) from public, anon, authenticated;
