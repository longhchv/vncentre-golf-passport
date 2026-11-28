-- Mã VNC và kho số đẹp — giai đoạn 1: khoá số đẹp (docs/spec/12-ma-vnc-so-dep-dang-nhap.md mục 1–4).
--
-- Hiện trạng trước migration này:
--   · Mã VNC = public.students.student_code, dạng 'VNC-' + 6 chữ số, sinh tuần tự bởi next_student_code()
--     (sequence student_code_seq, bắt đầu từ 1) → dải đầu 0 đang được cấp lần lượt, gồm cả số đẹp.
--   · Mọi người (học viên, phụ huynh / người lớn có hồ sơ golfer, nhân sự, BTC) đều là một dòng students;
--     app Handicap gắn hội viên vào students.student_code.
--
-- Sau migration:
--   · vnc_codes: sổ mọi mã VNC (6 chữ số, giữ số 0 đầu). owner_id = students.id (mã nội bộ trọn đời).
--     students.student_code giữ nguyên là mã chính để hiển thị ('VNC-' + code) — không đổi mã của ai.
--   · Mã đã cấp: chuyển sang vnc_codes (assigned, mã chính). Hồ sơ đã gộp: mã của hồ sơ bị gộp thành mã phụ
--     (retired_alias) của hồ sơ đích. Không thu hồi số đẹp đã cấp, chỉ ghi nhóm và hạng.
--   · Kho số đẹp: mọi số hạng Đồng trở lên trong toàn dải 000000–999999 chưa cấp → available (năm sinh không khoá trước).
--   · next_student_code(): chọn ngẫu nhiên trong dải đang mở (cài đặt vnc.open_prefixes, hiện ["0"]),
--     bỏ mã đã có trong vnc_codes và mã hạng Đồng trở lên; tối đa 20 lần, quá thì báo lỗi.
--   · vnc_student_id(code): tra bằng bất kỳ mã nào của một người (mã chính, mã phụ, mã của hồ sơ đã gộp) → hồ sơ đang dùng.
-- Chỉ thêm: bảng, hàm, trigger, cài đặt. Không xoá, không đổi students.student_code của ai.

-------------------------------------------------------------------------------
-- 1. Phân loại số đẹp (mục 3)
-------------------------------------------------------------------------------
-- Các nhóm của một mã 6 chữ số. p_year: năm hiện tại (cận trên của nhóm năm sinh).
create or replace function public.vnc_categories(p_code text, p_year int default extract(year from now())::int)
returns text[] language sql immutable parallel safe as $$
  with c as (
    select p_code as s, right(p_code, 4) as l4, right(p_code, 3) as l3,
           substr(p_code, 1, 2)::int as dd, substr(p_code, 3, 2)::int as mm, substr(p_code, 5, 2)::int as yy
    where p_code ~ '^\d{6}$'
  )
  select coalesce(array_remove(array[
    case when s ~ '^(\d)\1{5}$' then 'luc_quy' end,
    case when s !~ '^(\d)\1{5}$' and s ~ '(\d)\1{4}' then 'ngu_quy' end,
    case when s in ('012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321', '543210') then 'sanh_6' end,
    case when l4 in ('0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210') then 'sanh_4' end,
    case when s ~ '^[1-9]0{5}$' then 'so_tron' end,
    case when l4 ~ '^(\d)\1{3}$' then 'tu_quy' end,
    case when s !~ '^(\d)\1{5}$' and (s ~ '^(\d\d)\1\1$' or s ~ '^(\d\d\d)\1$') then 'taxi' end,
    case when s = reverse(s) then 'dao_ganh_6' end,
    case when l4 = reverse(l4) and l4 !~ '^(\d)\1{3}$' then 'dao_ganh_4' end,
    case when s in ('727272', '181818', '545454', '000072', '000018') then 'so_golf' end,
    case when s not in ('727272', '181818') and l4 in ('7272', '1818') then 'so_golf_duoi' end,
    case when l4 in ('6868', '8686', '3939', '7979') then 'loc_phat' end,
    case when l3 ~ '^(\d)\1\1$' then 'tam_hoa' end,
    case when l4::int between 1940 and p_year
           or (mm between 1 and 12 and dd >= 1 and dd <= case when mm = 2 then 28 + (yy % 4 = 0)::int
                                                              when mm in (4, 6, 9, 11) then 30 else 31 end)
         then 'nam_sinh' end
  ], null), '{}') from c
$$;

-- Hạng cao nhất của một danh sách nhóm: kim_cuong > vang > bac > dong > nam_sinh > thuong
create or replace function public.vnc_tier_of(p_categories text[])
returns text language sql immutable parallel safe as $$
  select case
    when p_categories && array['luc_quy', 'ngu_quy', 'sanh_6', 'so_tron'] then 'kim_cuong'
    when p_categories && array['tu_quy', 'taxi', 'dao_ganh_6', 'so_golf'] then 'vang'
    when p_categories && array['sanh_4', 'so_golf_duoi', 'loc_phat'] then 'bac'
    when p_categories && array['dao_ganh_4', 'tam_hoa'] then 'dong'
    when p_categories && array['nam_sinh'] then 'nam_sinh'
    else 'thuong' end
$$;

-- Hạng từ Đồng trở lên = số đẹp, không cấp ngẫu nhiên
create or replace function public.vnc_is_premium_tier(p_tier text)
returns boolean language sql immutable parallel safe as $$
  select p_tier in ('kim_cuong', 'vang', 'bac', 'dong')
$$;

-- classify_vnc(code): {"code", "categories": [...], "tier"}. Nhận '012345', 'VNC-012345', 'vnc012345'.
create or replace function public.classify_vnc(p_code text)
returns jsonb language sql stable as $$
  with n as (select lpad(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), 6, '0') as s)
  select case when s ~ '^\d{6}$' then jsonb_build_object('code', s, 'categories', to_jsonb(public.vnc_categories(s)),
                                                          'tier', public.vnc_tier_of(public.vnc_categories(s))) end
  from n
$$;

-------------------------------------------------------------------------------
-- 2. Bảng (mục 2)
-------------------------------------------------------------------------------
create table if not exists public.vnc_price_table (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  tier text not null check (tier in ('kim_cuong', 'vang', 'bac', 'dong', 'nam_sinh', 'thuong')),
  price_from bigint not null check (price_from >= 0),
  price_to bigint check (price_to is null or price_to >= price_from),
  valid_from date not null default current_date,
  valid_to date check (valid_to is null or valid_to >= valid_from),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vnc_price_table_tier_idx on public.vnc_price_table (tier, valid_from desc);

insert into public.vnc_price_table (tier, price_from, price_to, valid_from)
select v.tier, v.f, v.t, date '2026-11-27'
from (values ('nam_sinh', 300000::bigint, 500000::bigint), ('dong', 500000, 1000000), ('bac', 1000000, 3000000),
             ('vang', 3000000, 10000000), ('kim_cuong', 10000000, null)) as v(tier, f, t)
where not exists (select 1 from public.vnc_price_table);

create table if not exists public.vnc_codes (
  code char(6) primary key check (code ~ '^\d{6}$'),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  -- Kiểm tra cuối giao dịch: mã được ghi vào sổ ngay trước khi dòng students được ghi (trigger before insert)
  owner_id uuid references public.students(id) on delete restrict deferrable initially deferred,
  is_primary boolean not null default false,
  status text not null default 'available'
    check (status in ('available', 'reserved', 'gifted', 'sold', 'assigned', 'retired_alias')),
  category text[] not null default '{}',
  tier text not null default 'thuong' check (tier in ('kim_cuong', 'vang', 'bac', 'dong', 'nam_sinh', 'thuong')),
  list_price bigint check (list_price is null or list_price >= 0),
  acquired_at timestamptz,
  acquired_by text check (acquired_by in ('cap', 'tang', 'mua')),
  gifted_by uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_primary or owner_id is not null),
  check ((owner_id is null) = (status in ('available', 'reserved')))
);
create unique index if not exists vnc_codes_one_primary on public.vnc_codes (owner_id) where is_primary;
create index if not exists vnc_codes_owner_idx on public.vnc_codes (owner_id);
create index if not exists vnc_codes_stock_idx on public.vnc_codes (status, tier);

alter table public.vnc_codes enable row level security;
alter table public.vnc_price_table enable row level security;
revoke all on public.vnc_codes, public.vnc_price_table from anon;
drop policy if exists vnc_codes_admin_read on public.vnc_codes;
create policy vnc_codes_admin_read on public.vnc_codes for select to authenticated using (public.is_admin());
drop policy if exists vnc_price_read on public.vnc_price_table;
create policy vnc_price_read on public.vnc_price_table for select to authenticated using (true);
drop policy if exists vnc_price_admin on public.vnc_price_table;
create policy vnc_price_admin on public.vnc_price_table for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('vnc.open_prefixes', '["0"]', 'Mã VNC: các chữ số đầu đang mở để cấp ngẫu nhiên cho người mới (hiện chỉ dải đầu 0)',
   'VNC codes: leading digits open for random assignment', false)
on conflict do nothing;

-- Giá niêm yết hiện tại của một hạng (giá thấp nhất của khung đang hiệu lực)
create or replace function public.vnc_list_price(p_tier text)
returns bigint language sql stable security definer set search_path = public as $$
  select price_from from public.vnc_price_table
  where tier = p_tier and valid_from <= current_date and (valid_to is null or valid_to >= current_date)
  order by valid_from desc limit 1
$$;

-------------------------------------------------------------------------------
-- 3. Chuyển mã đã cấp sang vnc_codes (giữ nguyên chủ). Hồ sơ đã gộp: mã thành mã phụ của hồ sơ đích.
-------------------------------------------------------------------------------
-- Hồ sơ đang dùng của một hồ sơ (đi theo chuỗi gộp, tối đa 10 bước)
create or replace function public.vnc_current_student(p_student_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid := p_student_id; nxt uuid; i int := 0;
begin
  loop
    select merged_into_student_id into nxt from public.students where id = v;
    exit when nxt is null or i >= 10;
    v := nxt; i := i + 1;
  end loop;
  return v;
end $$;

do $$
declare n_bad int; n_pretty int; n_total int;
begin
  insert into public.vnc_codes (code, owner_id, is_primary, status, category, tier, acquired_at, acquired_by, note)
  select x.code, x.owner, x.primary_, case when x.primary_ then 'assigned' else 'retired_alias' end,
         public.vnc_categories(x.code), public.vnc_tier_of(public.vnc_categories(x.code)), x.created_at, 'cap',
         case when not x.primary_ then 'Mã của hồ sơ đã gộp' end
  from (
    select substr(s.student_code, 5, 6) as code, s.created_at,
           case when s.merged_into_student_id is null then s.id else public.vnc_current_student(s.id) end as owner,
           s.merged_into_student_id is null as primary_
    from public.students s where s.student_code ~ '^VNC-\d{6}$'
  ) x
  on conflict (code) do nothing;
  select count(*) into n_total from public.vnc_codes where owner_id is not null;
  select count(*) into n_pretty from public.vnc_codes where owner_id is not null and public.vnc_is_premium_tier(tier);
  select count(*) into n_bad from public.students where student_code !~ '^VNC-\d{6}$';
  raise notice 'Mã VNC đã cấp chuyển sang vnc_codes: %. Trong đó số đẹp (Đồng trở lên) đã cấp trước đây: %. Mã không đúng dạng VNC-######: %',
    n_total, n_pretty, n_bad;
end $$;

-------------------------------------------------------------------------------
-- 4. Đợt khởi tạo kho số đẹp: toàn dải 000000–999999, hạng Đồng trở lên, chưa cấp → available
-------------------------------------------------------------------------------
-- Quét 1 triệu số mất vài chục giây: nới thời gian chờ cho riêng migration này
set statement_timeout = '15min';

-- Lọc nhanh bằng dấu hiệu của từng nhóm số đẹp (đủ rộng để không sót), rồi mới phân loại đầy đủ
insert into public.vnc_codes (code, status, category, tier, list_price)
select z.code, 'available', z.cats, public.vnc_tier_of(z.cats), public.vnc_list_price(public.vnc_tier_of(z.cats))
from (select s as code, public.vnc_categories(s) as cats
      from (select lpad(g::text, 6, '0') as s from generate_series(0, 999999) g) a
      where s ~ '(\d)\1\1$' or right(s, 4) = reverse(right(s, 4)) or s = reverse(s)
         or right(s, 4) in ('0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210',
                            '7272', '1818', '6868', '8686', '3939', '7979')
         or s ~ '^(\d\d)\1\1$' or s ~ '^(\d\d\d)\1$' or s ~ '(\d)\1{4}' or s ~ '^[1-9]0{5}$'
         or s in ('012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321', '543210',
                  '545454', '000072', '000018')) z
where public.vnc_is_premium_tier(public.vnc_tier_of(z.cats))
on conflict (code) do nothing;

reset statement_timeout;

-- Nhật ký mọi thao tác trên kho mã (sau đợt khởi tạo, để không ghi hàng chục nghìn dòng nhật ký khởi tạo)
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.vnc_codes'::regclass) then
    create trigger set_updated_at before update on public.vnc_codes for each row execute function public.set_updated_at();
    create trigger audit_row after insert or update or delete on public.vnc_codes for each row execute function public.audit_row();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.vnc_price_table'::regclass) then
    create trigger set_updated_at before update on public.vnc_price_table for each row execute function public.set_updated_at();
    create trigger audit_row after insert or update or delete on public.vnc_price_table for each row execute function public.audit_row();
  end if;
end $$;

-------------------------------------------------------------------------------
-- 5. Bộ sinh mã cho người mới (mục 4). Giữ tên next_student_code() vì là giá trị mặc định của students.student_code
--    (mọi chỗ tạo hồ sơ — HLV, nhập file, sự kiện, app Handicap — đều đi qua đây).
-------------------------------------------------------------------------------
create or replace function public.next_student_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_prefixes text[];
  p text;
  c text;
  i int;
begin
  select array_agg(x) into v_prefixes
  from public.app_settings s, jsonb_array_elements_text(s.value) x
  where s.key = 'vnc.open_prefixes' and jsonb_typeof(s.value) = 'array' and x ~ '^\d{1,5}$';
  v_prefixes := coalesce(v_prefixes, array['0']);
  for i in 1..20 loop
    p := v_prefixes[1 + floor(random() * cardinality(v_prefixes))::int];
    c := p || lpad(floor(random() * power(10, 6 - length(p)))::bigint::text, 6 - length(p), '0');
    continue when public.vnc_is_premium_tier(public.vnc_tier_of(public.vnc_categories(c)));
    -- Mã đã có trong sổ (đã cấp, mã phụ, hoặc trong kho số đẹp) → thử số khác. Trigger sau khi tạo hồ sơ ghi mã vào sổ;
    -- hai hồ sơ tạo cùng lúc trúng cùng một số thì khoá chính của vnc_codes chặn hồ sơ sau.
    if not exists (select 1 from public.vnc_codes where code = c) then return 'VNC-' || c; end if;
  end loop;
  raise exception 'vnc_code_exhausted' using errcode = 'P0001',
    hint = 'Không tìm được mã VNC trống sau 20 lần trong dải đang mở (vnc.open_prefixes). Admin cần mở thêm dải.';
end $$;

-- Ghi mã của hồ sơ mới vào sổ ngay trước khi ghi hồ sơ (before insert): khi một câu lệnh tạo nhiều hồ sơ,
-- dòng sau sinh mã đã thấy mã của dòng trước. Mã đã thuộc người khác thì từ chối.
create or replace function public.vnc_students_register_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare c text := substring(new.student_code from '^VNC-(\d{6})$');
begin
  if c is null then return new; end if;
  -- Mã mới → ghi vào sổ. Mã có sẵn trong kho (hồ sơ tạo với mã chỉ định) → gắn chủ. Mã đã thuộc người khác → từ chối.
  insert into public.vnc_codes (code, owner_id, is_primary, status, category, tier, acquired_at, acquired_by)
  values (c, new.id, true, 'assigned', public.vnc_categories(c), public.vnc_tier_of(public.vnc_categories(c)), now(), 'cap')
  on conflict (code) do update set owner_id = excluded.owner_id, is_primary = true, status = 'assigned',
                                   acquired_at = excluded.acquired_at, acquired_by = excluded.acquired_by
    where public.vnc_codes.owner_id is null;
  if not found then raise exception 'vnc_code_taken' using errcode = '23505'; end if;
  return new;
end $$;

drop trigger if exists vnc_students_register_code on public.students;
create trigger vnc_students_register_code before insert on public.students
  for each row execute function public.vnc_students_register_code();

-- Mã VNC không đổi tay: chỉ được đổi sang một mã khác đã thuộc chính người đó (đổi mã chính — giai đoạn sau)
create or replace function public.vnc_students_code_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare c text := substring(new.student_code from '^VNC-(\d{6})$');
begin
  if new.student_code is distinct from old.student_code then
    if c is null or not exists (select 1 from public.vnc_codes where code = c and owner_id = new.id) then
      raise exception 'vnc_code_immutable' using errcode = '42501';
    end if;
    update public.vnc_codes set is_primary = false, status = 'retired_alias' where owner_id = new.id and is_primary and code <> c;
    update public.vnc_codes set is_primary = true, status = 'assigned' where code = c;
  end if;
  return new;
end $$;

drop trigger if exists vnc_students_code_guard on public.students;
create trigger vnc_students_code_guard before update of student_code on public.students
  for each row execute function public.vnc_students_code_guard();

-- Gộp hồ sơ: mã của hồ sơ bị gộp thành mã phụ của hồ sơ đích; hoàn tác gộp thì trả lại làm mã chính
create or replace function public.vnc_follow_student_merge()
returns trigger language plpgsql security definer set search_path = public as $$
declare c text := substring(new.student_code from '^VNC-(\d{6})$');
begin
  if c is null then return new; end if;
  if new.merged_into_student_id is not null then
    -- Cả mã chính lẫn mã phụ của hồ sơ bị gộp đi theo hồ sơ đích
    update public.vnc_codes set owner_id = public.vnc_current_student(new.id), is_primary = false, status = 'retired_alias',
           note = 'Mã của hồ sơ đã gộp'
    where code = c or owner_id = new.id;
  elsif old.merged_into_student_id is not null then
    update public.vnc_codes set owner_id = new.id, is_primary = true, status = 'assigned', note = null where code = c;
  end if;
  return new;
end $$;

drop trigger if exists vnc_follow_student_merge on public.students;
create trigger vnc_follow_student_merge after update of merged_into_student_id on public.students
  for each row execute function public.vnc_follow_student_merge();

-------------------------------------------------------------------------------
-- 6. Tra cứu bằng bất kỳ mã nào của một người → hồ sơ đang dùng
-------------------------------------------------------------------------------
create or replace function public.vnc_student_id(p_code text)
returns uuid language sql stable security definer set search_path = public as $$
  select public.vnc_current_student(v.owner_id)
  from public.vnc_codes v
  where v.code = lpad(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), 6, '0')
    and length(regexp_replace(coalesce(p_code, ''), '\D', '', 'g')) between 1 and 6
    and v.owner_id is not null
$$;

-- Admin / HLV trưởng mở hồ sơ bằng mã VNC bất kỳ (trang /admin/students/VNC-xxxxxx)
create or replace function public.admin_vnc_lookup(p_code text)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_head_coach()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.vnc_student_id(p_code);
end $$;

do $$
begin
  revoke execute on function public.vnc_current_student(uuid) from public, anon;
  revoke execute on function public.vnc_list_price(text) from public, anon;
  -- next_student_code() là giá trị mặc định của students.student_code: người tạo hồ sơ phải gọi được. Gọi lẻ chỉ trả về một số, không giữ chỗ.
  revoke execute on function public.vnc_students_register_code() from public, anon, authenticated;
  revoke execute on function public.vnc_students_code_guard() from public, anon, authenticated;
  revoke execute on function public.vnc_follow_student_merge() from public, anon, authenticated;
  revoke execute on function public.vnc_student_id(text) from public, anon, authenticated;
  revoke execute on function public.admin_vnc_lookup(text) from public, anon;
  grant execute on function public.admin_vnc_lookup(text), public.classify_vnc(text) to authenticated;
end $$;
