-- Mã VNC — đợt A của mục 5–7 (docs/spec/12-ma-vnc-so-dep-dang-nhap.md): "Mã VNC của tôi", đổi mã chính, tìm số,
-- quản trị kho (xem theo hạng / trạng thái, khoá / mở số, tặng số, bảng giá, nhật ký). Mua số: đợt B.
-- Không lời hứa đầu tư / sinh lời: chỉ hiện hạng, nhóm, giá niêm yết hiện tại.
-- Chỉ thêm: bảng nhật ký, hàm. Không đổi mã của ai (đổi mã chính chỉ chọn trong các mã người đó đã có).

-------------------------------------------------------------------------------
-- Nhật ký nghiệp vụ mọi thao tác cấp, tặng, bán, đổi mã chính, khoá / mở, đổi giá (mục 7)
-------------------------------------------------------------------------------
create table if not exists public.vnc_code_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code char(6) check (code ~ '^\d{6}$'),
  action text not null check (action in ('assign', 'gift', 'sell', 'set_primary', 'lock', 'unlock', 'price')),
  student_id uuid references public.students(id),
  actor_user_id uuid default auth.uid(),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists vnc_code_events_code_idx on public.vnc_code_events (code, created_at desc);
create index if not exists vnc_code_events_time_idx on public.vnc_code_events (created_at desc);
alter table public.vnc_code_events enable row level security;
revoke all on public.vnc_code_events from anon;
drop policy if exists vnc_code_events_admin_read on public.vnc_code_events;
create policy vnc_code_events_admin_read on public.vnc_code_events for select to authenticated using (public.is_admin());

-------------------------------------------------------------------------------
-- Mã VNC của tôi (và của các con mình quản lý)
-------------------------------------------------------------------------------
-- Hồ sơ người gọi xem / đổi mã được: hồ sơ của chính mình hoặc con đang quản lý; admin mọi hồ sơ
create or replace function public.vnc_can_manage(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (public.is_admin() or public.can_manage_student(p_student_id))
$$;

-- Danh sách hồ sơ để chọn trên trang "Mã VNC của tôi": chính mình trước, rồi các con
create or replace function public.vnc_my_people()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('student_id', s.id, 'full_name', s.full_name, 'student_code', s.student_code,
                                               'is_self', sg.relationship = 'self')
                            order by (sg.relationship = 'self') desc, s.full_name), '[]')
  from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id
  join public.students s on s.id = sg.student_id
  where g.user_id = auth.uid() and g.deleted_at is null and sg.deleted_at is null and sg.status = 'active' and sg.can_manage
    and s.deleted_at is null and s.merged_into_student_id is null
$$;

create or replace function public.vnc_my_codes(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.vnc_can_manage(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'code', v.code, 'is_primary', v.is_primary, 'status', v.status, 'tier', v.tier, 'categories', to_jsonb(v.category),
      'list_price', public.vnc_list_price(v.tier), 'acquired_at', v.acquired_at, 'acquired_by', v.acquired_by)
      order by v.is_primary desc, v.acquired_at nulls last, v.code)
    from public.vnc_codes v where v.owner_id = p_student_id), '[]');
end $$;

-- Đổi mã chính: chọn một mã đã thuộc hồ sơ; mã chính cũ thành mã phụ (trigger vnc_students_code_guard lo cờ)
create or replace function public.vnc_set_primary(p_student_id uuid, p_code text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  c text := right(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), 6);
  v_old text;
begin
  if not public.vnc_can_manage(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(c) <> 6 or not exists (select 1 from public.vnc_codes where code = c and owner_id = p_student_id) then
    raise exception 'code_not_owned' using errcode = '22023';
  end if;
  select student_code into v_old from public.students where id = p_student_id;
  if v_old = 'VNC-' || c then return v_old; end if;
  update public.students set student_code = 'VNC-' || c where id = p_student_id;
  insert into public.vnc_code_events (code, action, student_id, detail)
  values (c, 'set_primary', p_student_id, jsonb_build_object('old_primary', v_old));
  return 'VNC-' || c;
end $$;

-------------------------------------------------------------------------------
-- Tìm số (mục 5): lọc theo hạng / nhóm; ô nhập số gần đúng → mã khớp, chứa dãy số, hoặc khác 1 chữ số, còn trống.
-- Còn trống = trong kho (available) hoặc chưa có trong sổ. Chỉ trả số có hạng (năm sinh trở lên); số thường không bán.
-------------------------------------------------------------------------------
create or replace function public.vnc_free(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.vnc_codes v where v.code = p_code and v.status <> 'available')
$$;

create or replace function public.vnc_search(p_query text default null, p_tier text default null, p_category text default null,
  p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(q) > 6 then q := right(q, 6); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('code', y.code, 'tier', y.tier, 'categories', to_jsonb(y.cats),
                                                       'list_price', public.vnc_list_price(y.tier), 'match', y.match)
                                    order by y.rank, y.tier_rank, y.code)
    from (select x.* from (
      select distinct on (c.code) c.code, c.cats, public.vnc_tier_of(c.cats) as tier, c.match, c.rank,
             array_position(array['kim_cuong', 'vang', 'bac', 'dong', 'nam_sinh'], public.vnc_tier_of(c.cats)) as tier_rank
      from (
        -- Đúng số (kể cả số chưa có trong sổ, ví dụ số năm sinh)
        select q as code, public.vnc_categories(q) as cats, 'exact' as match, 0 as rank where length(q) = 6
        union all
        -- Khác đúng một chữ số so với số đã nhập
        select overlay(q placing d::text from p for 1), public.vnc_categories(overlay(q placing d::text from p for 1)), 'near', 2
        from generate_series(1, 6) p, generate_series(0, 9) d
        where length(q) = 6 and substr(q, p, 1) <> d::text
        union all
        -- Trong kho số đẹp: chứa dãy số đã nhập (hoặc không nhập gì: theo bộ lọc)
        select v.code, v.category, case when q = '' then 'stock' else 'contains' end, 1
        from public.vnc_codes v
        where v.status = 'available' and (q = '' or v.code like '%' || q || '%')
      ) c
      where public.vnc_free(c.code) and public.vnc_tier_of(c.cats) <> 'thuong'
        and (p_tier is null or public.vnc_tier_of(c.cats) = p_tier)
        and (p_category is null or p_category = any(c.cats))
      order by c.code, c.rank
    ) x
    order by x.rank, x.tier_rank, x.code
    limit v_limit) y), '[]');
end $$;

-------------------------------------------------------------------------------
-- Quản trị kho (mục 7)
-------------------------------------------------------------------------------
create or replace function public.vnc_admin_stock(p_status text default null, p_tier text default null, p_category text default null,
  p_query text default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'counts', (select coalesce(jsonb_agg(jsonb_build_object('status', status, 'tier', tier, 'n', n)), '[]')
               from (select status, tier, count(*) as n from public.vnc_codes group by 1, 2) z),
    'rows', coalesce((select jsonb_agg(r) from (
        select jsonb_build_object('code', v.code, 'status', v.status, 'tier', v.tier, 'categories', to_jsonb(v.category),
               'is_primary', v.is_primary, 'list_price', public.vnc_list_price(v.tier), 'acquired_by', v.acquired_by,
               'acquired_at', v.acquired_at, 'owner_id', v.owner_id, 'owner_name', s.full_name, 'owner_code', s.student_code, 'note', v.note) as r
        from public.vnc_codes v left join public.students s on s.id = v.owner_id
        where (p_status is null or v.status = p_status) and (p_tier is null or v.tier = p_tier)
          and (p_category is null or p_category = any(v.category)) and (q = '' or v.code like '%' || q || '%')
        order by array_position(array['kim_cuong', 'vang', 'bac', 'dong', 'nam_sinh', 'thuong'], v.tier), v.code
        limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) t), '[]'));
end $$;

-- Khoá (giữ lại, không bán / tặng) hoặc mở lại một số đẹp trong kho
create or replace function public.vnc_admin_set_lock(p_code text, p_locked boolean, p_note text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare c text := right(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), 6);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(c) <> 6 then raise exception 'code_invalid' using errcode = '22023'; end if;
  if p_locked then
    -- Số chưa có trong sổ cũng khoá được (ví dụ số năm sinh)
    insert into public.vnc_codes (code, status, category, tier, note)
    values (c, 'reserved', public.vnc_categories(c), public.vnc_tier_of(public.vnc_categories(c)), nullif(btrim(p_note), ''))
    on conflict (code) do update set status = 'reserved', note = coalesce(excluded.note, public.vnc_codes.note)
      where public.vnc_codes.status = 'available';
    if not found then raise exception 'code_not_available' using errcode = '22023'; end if;
  else
    update public.vnc_codes set status = 'available' where code = c and status = 'reserved';
    if not found then raise exception 'code_not_locked' using errcode = '22023'; end if;
  end if;
  insert into public.vnc_code_events (code, action, detail)
  values (c, case when p_locked then 'lock' else 'unlock' end, jsonb_build_object('note', nullif(btrim(p_note), '')));
end $$;

-- Tặng số (học viên xuất sắc, giải thưởng): số trống hoặc đang khoá → thành mã phụ của người nhận; người nhận tự đổi làm mã chính
create or replace function public.vnc_admin_gift(p_code text, p_recipient text, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c text := right(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), 6);
  v_to uuid := public.vnc_student_id(p_recipient);
  v_cats text[];
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(c) <> 6 then raise exception 'code_invalid' using errcode = '22023'; end if;
  if v_to is null then raise exception 'recipient_not_found' using errcode = 'P0002'; end if;
  v_cats := public.vnc_categories(c);
  insert into public.vnc_codes (code, owner_id, is_primary, status, category, tier, acquired_at, acquired_by, gifted_by, note)
  values (c, v_to, false, 'gifted', v_cats, public.vnc_tier_of(v_cats), now(), 'tang', auth.uid(), nullif(btrim(p_note), ''))
  on conflict (code) do update set owner_id = excluded.owner_id, is_primary = false, status = 'gifted', acquired_at = now(),
    acquired_by = 'tang', gifted_by = excluded.gifted_by, note = excluded.note
    where public.vnc_codes.owner_id is null;
  if not found then raise exception 'code_not_available' using errcode = '22023'; end if;
  insert into public.vnc_code_events (code, action, student_id, detail)
  values (c, 'gift', v_to, jsonb_build_object('note', nullif(btrim(p_note), ''), 'recipient', p_recipient));
  return jsonb_build_object('code', c, 'student_id', v_to,
    'full_name', (select full_name from public.students where id = v_to));
end $$;

-- Đổi giá một hạng: đóng khung giá đang hiệu lực, thêm dòng mới (giữ lịch sử)
create or replace function public.vnc_admin_set_price(p_tier text, p_price_from bigint, p_price_to bigint, p_valid_from date default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_from date := coalesce(p_valid_from, current_date);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_tier not in ('kim_cuong', 'vang', 'bac', 'dong', 'nam_sinh') then raise exception 'tier_invalid' using errcode = '22023'; end if;
  if p_price_from is null or p_price_from < 0 or (p_price_to is not null and p_price_to < p_price_from) then
    raise exception 'price_invalid' using errcode = '22023';
  end if;
  update public.vnc_price_table set valid_to = v_from - 1
  where tier = p_tier and valid_to is null and valid_from < v_from;
  delete from public.vnc_price_table where tier = p_tier and valid_from = v_from;   -- sửa lại giá của cùng ngày
  insert into public.vnc_price_table (tier, price_from, price_to, valid_from) values (p_tier, p_price_from, p_price_to, v_from);
  insert into public.vnc_code_events (action, detail)
  values ('price', jsonb_build_object('tier', p_tier, 'price_from', p_price_from, 'price_to', p_price_to, 'valid_from', v_from));
end $$;

create or replace function public.vnc_admin_prices()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('tier', tier, 'price_from', price_from, 'price_to', price_to,
      'valid_from', valid_from, 'valid_to', valid_to,
      'current', valid_from <= current_date and (valid_to is null or valid_to >= current_date))
      order by array_position(array['kim_cuong', 'vang', 'bac', 'dong', 'nam_sinh'], tier), valid_from desc)
    from public.vnc_price_table), '[]');
end $$;

create or replace function public.vnc_admin_events(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select e.created_at, e.code, e.action, e.detail, s.full_name as student_name, s.student_code, p.full_name as actor_name
      from public.vnc_code_events e
      left join public.students s on s.id = e.student_id
      left join public.profiles p on p.user_id = e.actor_user_id
      order by e.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]');
end $$;

do $$
begin
  revoke execute on function public.vnc_can_manage(uuid) from public, anon, authenticated;
  revoke execute on function public.vnc_free(text) from public, anon, authenticated;
  revoke execute on function public.vnc_my_people() from public, anon;
  revoke execute on function public.vnc_my_codes(uuid) from public, anon;
  revoke execute on function public.vnc_set_primary(uuid, text) from public, anon;
  revoke execute on function public.vnc_search(text, text, text, int) from public, anon;
  revoke execute on function public.vnc_admin_stock(text, text, text, text, int, int) from public, anon;
  revoke execute on function public.vnc_admin_set_lock(text, boolean, text) from public, anon;
  revoke execute on function public.vnc_admin_gift(text, text, text) from public, anon;
  revoke execute on function public.vnc_admin_set_price(text, bigint, bigint, date) from public, anon;
  revoke execute on function public.vnc_admin_prices() from public, anon;
  revoke execute on function public.vnc_admin_events(int) from public, anon;
  grant execute on function public.vnc_my_people(), public.vnc_my_codes(uuid), public.vnc_set_primary(uuid, text),
    public.vnc_search(text, text, text, int), public.vnc_admin_stock(text, text, text, text, int, int),
    public.vnc_admin_set_lock(text, boolean, text), public.vnc_admin_gift(text, text, text),
    public.vnc_admin_set_price(text, bigint, bigint, date), public.vnc_admin_prices(), public.vnc_admin_events(int) to authenticated;
end $$;
