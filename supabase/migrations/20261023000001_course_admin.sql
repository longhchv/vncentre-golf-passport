-- Khu quản trị sân golf (Golf Passport) · 5 bảng gc_ + phân quyền + chuyển dữ liệu từ app CSR + trang website đã đăng
-- Minh · 23/10/2026 · Supabase zrfipnqkjrhzrscaaeth · Chạy lại nhiều lần không lỗi, không xoá dữ liệu.
-- Nguyên tắc: chỉ admin Golf Passport (is_admin) hoặc admin CSR (csr_is_admin) đọc/ghi.
-- Người xem website KHÔNG đọc các bảng này; họ đọc trang đã đăng trong site_courses.

-- Admin Golf Passport, hoặc admin CSR nếu cơ sở dữ liệu có phần app CSR (csr_is_admin / cm_is_mod).
-- Viết kiểu kiểm tra tồn tại để migration chạy được cả trên DB mới (supabase db reset) chưa có bảng CSR.
create or replace function public.gc_is_admin() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r boolean := coalesce(public.is_admin(), false);
begin
  if not r and to_regprocedure('public.csr_is_admin()') is not null then
    execute 'select coalesce(public.csr_is_admin(), false)' into r;
  end if;
  if not r and to_regprocedure('public.cm_is_mod()') is not null then
    execute 'select coalesce(public.cm_is_mod(), false)' into r;
  end if;
  return r;
end $$;

-- 1. Sân: sân đo (rated, nối với app CSR qua csr_course_id) và sân trải nghiệm (experience)
create table if not exists public.gc_courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  kind text not null default 'experience' check (kind in ('rated', 'experience')),
  csr_course_id text unique,                       -- mã sân trong app CSR (csr_docs col='courses'), chỉ sân đo
  name text not null check (char_length(name) <= 200),
  name_en text,
  country char(2) not null default 'VN',           -- mã quốc gia ISO, vd VN, TH, JP
  province text,
  lat double precision, lng double precision,
  google_place_id text,
  phone text, website text,
  holes int check (holes between 1 and 54),
  par int,
  units text not null default 'yd' check (units in ('yd', 'm')),
  intro_vi text, intro_en text,
  facilities jsonb not null default '[]'::jsonb,
  booking jsonb not null default '{}'::jsonb,
  played_on date,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now()
);

-- 2. Bộ tee của sân trải nghiệm (theo scorecard). holes = [{"par":4,"len":380,"si":7}, ...]
create table if not exists public.gc_tees (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.gc_courses(id) on delete cascade,
  name text not null, color text,
  gender text not null default 'M' check (gender in ('M', 'F', 'X')),
  holes jsonb not null default '[]'::jsonb,
  source text not null default 'scorecard',
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists gc_tees_course on public.gc_tees (course_id, sort);

-- 3. Ảnh đã đóng logo (đường dẫn trong kho site-photos)
create table if not exists public.gc_photos (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.gc_courses(id) on delete cascade,
  path text not null,
  kind text,                                       -- signature, view, sunset, clubhouse, hole, ...
  hole int,
  caption_vi text, caption_en text,
  sort int not null default 0,
  taken_on date,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists gc_photos_course on public.gc_photos (course_id, sort);

-- 4. Cảm nhận của VN Centre (một bài mỗi sân)
create table if not exists public.gc_reviews (
  course_id uuid primary key references public.gc_courses(id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,       -- {"course":8,"difficulty":7,"service":9,"value":8}
  text_vi text, text_en text,
  tips jsonb not null default '[]'::jsonb,         -- [{"hole":5,"vi":"...","en":"..."}]
  played_on date,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now()
);

-- 5. Địa điểm quanh sân – KHO CHUNG cho app CSR và Golf Passport
create table if not exists public.gc_places (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.gc_courses(id) on delete cascade,
  legacy_id text,                                  -- id cũ trong app CSR (guide.places[].id)
  src text not null default 'web' check (src in ('web', 'visited')),   -- web = gợi ý tra cứu; visited = đoàn đã ghé
  cat text not null,
  name text not null,
  area text,
  note text, note_en text,
  phone text,
  km numeric(6,1), drive_min int,
  g_rating numeric(2,1), g_count int, g_at date, pid text,
  family boolean not null default false,
  auto boolean not null default false,             -- do máy đề xuất
  hidden boolean not null default false,
  data jsonb not null default '{}'::jsonb,         -- phần còn lại: ảnh, điểm chấm, địa chỉ, srcUrl, giá...
  version int not null default 1,                  -- tăng mỗi lần sửa; app gửi version cũ để phát hiện ghi đè
  updated_via text not null default 'passport' check (updated_via in ('csr', 'passport', 'import', 'auto')),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now()
);
create unique index if not exists gc_places_legacy on public.gc_places (course_id, legacy_id) where legacy_id is not null;
create unique index if not exists gc_places_pid on public.gc_places (course_id, pid) where pid is not null;
create index if not exists gc_places_course on public.gc_places (course_id, cat);

-- Ghi ai sửa, lúc nào; tăng version
create or replace function public.gc_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if tg_table_name in ('gc_courses', 'gc_reviews', 'gc_places') then new.updated_by := coalesce(auth.uid(), new.updated_by); end if;
  if tg_table_name = 'gc_places' and tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end $$;
drop trigger if exists gc_courses_touch on public.gc_courses;
create trigger gc_courses_touch before update on public.gc_courses for each row execute function public.gc_touch();
drop trigger if exists gc_tees_touch on public.gc_tees;
create trigger gc_tees_touch before update on public.gc_tees for each row execute function public.gc_touch();
drop trigger if exists gc_reviews_touch on public.gc_reviews;
create trigger gc_reviews_touch before update on public.gc_reviews for each row execute function public.gc_touch();
drop trigger if exists gc_places_touch on public.gc_places;
create trigger gc_places_touch before update on public.gc_places for each row execute function public.gc_touch();

-- Phân quyền: chỉ admin
do $$ declare t text; begin
  foreach t in array array['gc_courses', 'gc_tees', 'gc_photos', 'gc_reviews', 'gc_places'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.gc_is_admin()) with check (public.gc_is_admin())', t || '_admin', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- 6. Chuyển dữ liệu từ app CSR (csr_docs col='courses') sang kho chung. Chạy lại được: cập nhật, không nhân đôi.
--    p_course = mã sân CSR (vd 'xuanthanh'); null = mọi sân có dữ liệu Quanh sân.
create or replace function public.gc_import_from_csr(p_course text default null)
returns table (csr_course text, places_in int)
language plpgsql security definer set search_path = public as $$
declare r record; gid uuid; n int;
begin
  if not public.gc_is_admin() and auth.uid() is not null then raise exception 'Chỉ admin được chuyển dữ liệu'; end if;
  for r in select d.id, d.data from public.csr_docs d
           where d.col = 'courses' and not coalesce(d.deleted, false) and (p_course is null or d.id = p_course)
             and jsonb_typeof(d.data->'guide'->'places') = 'array' loop
    insert into public.gc_courses (kind, csr_course_id, name, holes, updated_by)
    values ('rated', r.id, coalesce(nullif(r.data->>'name', ''), r.id), nullif(r.data->>'holes', '')::int, auth.uid())
    on conflict (csr_course_id) do update set name = excluded.name
    returning id into gid;
    insert into public.gc_places (course_id, legacy_id, src, cat, name, area, note, note_en, phone, km,
      g_rating, g_count, g_at, pid, family, data, updated_via)
    select gid, p->>'id', case when p->>'src' = 'web' then 'web' else 'visited' end, coalesce(p->>'cat', 'see'), p->>'name',
      p->>'area', p->>'note', p->>'noteEn', p->>'phone', nullif(p->>'km', '')::numeric,
      nullif(p->>'gR', '')::numeric, nullif(p->>'gN', '')::int, nullif(p->>'gAt', '')::date, nullif(p->>'pid', ''),
      coalesce((p->>'family')::boolean, false),
      p - array['id','src','cat','name','area','note','noteEn','phone','km','gR','gN','gAt','pid','family'], 'import'
    from jsonb_array_elements(r.data->'guide'->'places') p
    where coalesce(p->>'name', '') <> '' and coalesce(p->>'id', '') <> ''
    on conflict (course_id, legacy_id) where legacy_id is not null do update set
      src = excluded.src, cat = excluded.cat, name = excluded.name, area = excluded.area, note = excluded.note,
      note_en = excluded.note_en, phone = excluded.phone, km = excluded.km, g_rating = excluded.g_rating,
      g_count = excluded.g_count, g_at = excluded.g_at, pid = excluded.pid, family = excluded.family,
      data = excluded.data, updated_via = 'import';
    get diagnostics n = row_count;
    csr_course := r.id; places_in := n; return next;
  end loop;
end $$;
revoke execute on function public.gc_import_from_csr(text) from anon, public;
grant execute on function public.gc_import_from_csr(text) to authenticated;

-- 7. Trang website đã đăng (courses.vncentre.net). Bảng và kho ảnh đã tạo trên staging ngày 23/10/2026 từ app CSR;
--    ở đây tạo lại nếu thiếu (DB mới) và mở quyền ghi cho admin Golf Passport.
create table if not exists public.site_courses (
  course_id text primary key,                -- mã sân; '_index' = trang chủ danh sách sân
  slug text unique,
  html text not null,
  published_at timestamptz not null,
  published_by uuid default auth.uid()
);
-- Thông tin thẻ sân để CẢ HAI app (CSR, Golf Passport) dựng trang chủ từ toàn bộ sân đã đăng
alter table public.site_courses add column if not exists source text not null default 'csr' check (source in ('csr', 'passport'));
alter table public.site_courses add column if not exists kind text not null default 'rated' check (kind in ('rated', 'experience'));
alter table public.site_courses add column if not exists country char(2) not null default 'VN';
alter table public.site_courses add column if not exists card jsonb not null default '{}'::jsonb;  -- tên Việt/Anh, tỉnh, ảnh thẻ, số hố, par, đường dẫn
alter table public.site_courses enable row level security;
drop policy if exists site_read on public.site_courses;
create policy site_read on public.site_courses for select using (true);
drop policy if exists site_write on public.site_courses;
create policy site_write on public.site_courses for all to authenticated using (public.gc_is_admin()) with check (public.gc_is_admin());
grant select on public.site_courses to anon, authenticated;
grant insert, update, delete on public.site_courses to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', true, 3145728, array['image/jpeg'])
on conflict (id) do nothing;
drop policy if exists site_photo_write on storage.objects;
create policy site_photo_write on storage.objects for insert to authenticated with check (bucket_id = 'site-photos' and public.gc_is_admin());
drop policy if exists site_photo_update on storage.objects;
create policy site_photo_update on storage.objects for update to authenticated using (bucket_id = 'site-photos' and public.gc_is_admin());
drop policy if exists site_photo_del on storage.objects;
create policy site_photo_del on storage.objects for delete to authenticated using (bucket_id = 'site-photos' and public.gc_is_admin());
drop policy if exists site_photo_list on storage.objects;
create policy site_photo_list on storage.objects for select to authenticated using (bucket_id = 'site-photos' and public.gc_is_admin());
