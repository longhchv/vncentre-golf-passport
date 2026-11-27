-- Spec 30 · Bài viết tổng quan cho từng địa điểm (sân tập, phòng 3D) + khối kiến thức máy dùng chung.
-- Không đổi pv_public_venues (trang chủ vncentre.net đọc region, type, status).

-------------------------------------------------------------------------------
-- 1. Khối kiến thức máy: thêm vào hồ sơ hãng (sim_brands) phần "đo được gì" và "tập thế nào".
--    Nội dung lấy từ trang chính thức của hãng; nguồn ghi ở cột sources sẵn có.
-------------------------------------------------------------------------------
alter table public.sim_brands add column if not exists metrics jsonb not null default '[]'::jsonb;   -- [[thông số, ý nghĩa với người tập], …]
alter table public.sim_brands add column if not exists practice jsonb not null default '[]'::jsonb;  -- [[cách tập / chế độ, mô tả], …]
alter table public.sim_brands add column if not exists knowledge_checked_at date;                  -- ngày đối chiếu trang hãng gần nhất

do $$ begin
  alter table public.sim_brands add constraint sim_brands_knowledge_shape
    check (jsonb_typeof(metrics) = 'array' and jsonb_typeof(practice) = 'array');
exception when duplicate_object then null; end $$;

-------------------------------------------------------------------------------
-- 2. Bài viết. Mỗi địa điểm có tối đa 1 bài tổng quan cho mỗi ngôn ngữ; bài review (kind = 'review') để sau.
-------------------------------------------------------------------------------
create table if not exists public.practice_venue_articles (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.practice_venues(id) on delete cascade on update cascade,
  kind text not null default 'overview' check (kind in ('overview', 'review')),
  lang text not null default 'vi' check (lang in ('vi', 'en', 'ko', 'ja', 'zh')),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  sapo text check (sapo is null or char_length(sapo) <= 400),
  body text not null default '' check (char_length(body) <= 30000),          -- Markdown đơn giản: ## tiêu đề, - gạch đầu dòng, **đậm**, [chữ](link)
  cover_photo_id uuid references public.practice_venue_photos(id) on delete set null,
  cover_url text check (cover_url is null or cover_url ~ '^https://'),
  sources jsonb not null default '[]'::jsonb,                                -- [{label, url?, at?}] hiển thị cuối bài
  info_date date,                                                            -- "thông tin cập nhật đến ngày"
  needs_survey boolean not null default false,                               -- bài ngắn vì còn thiếu thông tin chính thức
  author_name text check (author_name is null or char_length(author_name) <= 80),
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  approved_by uuid, approved_at timestamptz,
  created_by uuid default auth.uid(), updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pva_one_overview on public.practice_venue_articles (venue_id, lang) where kind = 'overview';
create index if not exists pva_venue_idx on public.practice_venue_articles (venue_id, status);

-- Kiểm tra nguồn, tự điền slug, ghi người duyệt. Muốn duyệt phải có nội dung và ít nhất 1 nguồn.
create or replace function public.pva_before_write() returns trigger
language plpgsql set search_path = public as $$
declare s jsonb;
begin
  if jsonb_typeof(new.sources) <> 'array' or jsonb_array_length(new.sources) > 30 then
    raise exception 'bad_sources' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(new.sources) loop
    if jsonb_typeof(s) <> 'object' or coalesce(btrim(s->>'label'), '') = ''
       or (s ? 'url' and coalesce(s->>'url', '') <> '' and s->>'url' !~ '^https?://') then
      raise exception 'bad_sources' using errcode = '22023';
    end if;
  end loop;

  if new.slug is null or new.slug = '' then
    new.slug := case when new.kind = 'overview'
                     then new.venue_id || case when new.lang = 'vi' then '' else '-' || new.lang end
                     else new.venue_id || '-r-' || left(replace(new.id::text, '-', ''), 8) end;
  end if;

  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if btrim(new.body) = '' or jsonb_array_length(new.sources) = 0 then
      raise exception 'approve_needs_body_and_sources' using errcode = '22023';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;

  if tg_op = 'UPDATE' then
    new.updated_by := auth.uid();
    new.updated_at := now();
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.status = 'approved' and old.status = 'approved' then   -- sửa bài đang hiển thị: giữ người/ngày duyệt cũ
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists pva_before_write on public.practice_venue_articles;
create trigger pva_before_write before insert or update on public.practice_venue_articles
  for each row execute function public.pva_before_write();

alter table public.practice_venue_articles enable row level security;
drop policy if exists pva_admin on public.practice_venue_articles;
create policy pva_admin on public.practice_venue_articles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.practice_venue_articles from anon;
grant select, insert, update, delete on public.practice_venue_articles to authenticated;

-------------------------------------------------------------------------------
-- 3. View công khai: chỉ bài đã duyệt của địa điểm đang hiển thị. Không lộ người viết/duyệt (uuid).
-------------------------------------------------------------------------------
create or replace view public.pv_public_articles with (security_invoker = false) as
  select a.id, a.venue_id, a.kind, a.lang, a.slug, a.title, a.sapo, a.body,
         (select p.path from public.practice_venue_photos p where p.id = a.cover_photo_id and p.status = 'approved') as cover_path,
         a.cover_url, a.sources, a.info_date, a.needs_survey, a.author_name,
         a.approved_at as published_at, a.updated_at,
         v.name as venue_name, v.region as venue_region, v.type as venue_type
  from public.practice_venue_articles a
  join public.practice_venues v on v.id = a.venue_id
  where a.status = 'approved' and v.status in ('active', 'closed_temp');
grant select on public.pv_public_articles to anon, authenticated;
