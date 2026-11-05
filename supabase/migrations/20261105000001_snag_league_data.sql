-- Kết nối SNAG Golf League ↔ Golf Passport (13-giao-viec-ket-noi-snag-league.md) · bước 1: dữ liệu, hạng sổ, hạng hiện tại.
-- Bản đối chiếu và các quyết định K1–K12: docs/spec/13-mapping.md (anh Long duyệt 05/11/2026).
-- Tên bảng theo khung đợt 3 (01-du-lieu.md); chỉ tạo phần spec 13 cần. tournament_entries, ranking_points_ledger để đợt 3.

-------------------------------------------------------------------------------
-- Hạng sổ, cột và giá trị mới
-------------------------------------------------------------------------------
-- Thẻ số cho bạn chưa có sổ nào; không tính vào "một sổ active mỗi học viên" (giống event_experience)
insert into public.passport_tiers (code, name_vi, name_en, level_from, level_to, validity_months, counts_toward_single_active)
values ('snag_league', 'SNAG Golf League – thẻ số', 'SNAG Golf League – digital card', null, null, 12, false)
on conflict (code) do nothing;

-- K5: năm sinh riêng (dữ liệu giải thường chỉ có năm). Có ngày sinh thì tự lấy năm từ ngày sinh.
alter table public.students add column if not exists birth_year smallint check (birth_year between 1900 and 2100);
-- K4: phụ huynh xin tắt tên trên BXH khi chưa có tài khoản (admin bật thay)
alter table public.students add column if not exists league_name_hidden boolean not null default false;
update public.students set birth_year = extract(year from date_of_birth)::smallint where date_of_birth is not null and birth_year is null;

create or replace function public.students_sync_birth_year()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.date_of_birth is not null then new.birth_year := extract(year from new.date_of_birth)::smallint; end if;
  return new;
end $$;
create trigger students_sync_birth_year before insert or update of date_of_birth, birth_year on public.students
  for each row execute function public.students_sync_birth_year();

alter table public.student_guardians drop constraint if exists student_guardians_linked_via_check;
alter table public.student_guardians add constraint student_guardians_linked_via_check
  check (linked_via in ('passport', 'claim_code', 'invite', 'class_code', 'admin', 'import', 'event_card', 'league'));

alter table public.code_attempts drop constraint if exists code_attempts_kind_check;
alter table public.code_attempts add constraint code_attempts_kind_check
  check (kind in ('passport_lookup', 'identity', 'claim_lookup', 'class_code', 'league_lookup'));

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('league.lookup_per_minute', '20', 'Số lần tra cứu mã tối đa mỗi phút mỗi IP (cổng app giải)', 'Max code lookups per minute per IP (league app bridge)', false),
  ('league.graduation_best_gross', '3', 'Số lần Best Gross để có nhãn "Tốt nghiệp"', 'Best Gross wins needed for the "Graduated" label', true),
  ('league.name_shown_until_stage', '9', 'Bạn đã thi đến hết chặng này (mùa 2026) được hiện tên khi phụ huynh chưa xin tắt', 'Players who competed up to this stage (2026 season) show their name unless a parent opted out', false)
on conflict do nothing;

-------------------------------------------------------------------------------
-- Bảng mới
-------------------------------------------------------------------------------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique,
  name_vi text not null,
  name_en text not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_series (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique,
  name_vi text not null,
  name_en text not null,
  ranking_coefficient numeric(4, 2) not null default 1 check (ranking_coefficient > 0),   -- phụ lục C mục C3
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  series_id uuid not null references public.tournament_series(id),
  season_id uuid not null references public.seasons(id),
  stage_no int not null check (stage_no > 0),
  played_on date not null,
  venue text,
  holes smallint check (holes is null or holes between 1 and 72),
  counts_for_ranking boolean not null default true,      -- chặng dành riêng thầy cô (Chặng 3 mùa 2026) = false
  results_source text check (results_source in ('import', 'league_app')),
  results_received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (series_id, season_id, stage_no)
);

-- Thang điểm là cấu hình (README quy tắc 2). aliases: các cách viết danh hiệu app giải / file cũ gửi sang
create table public.tournament_point_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  series_id uuid not null references public.tournament_series(id),
  kind text not null check (kind in ('participation', 'rank', 'culture')),
  code text not null,
  name_vi text not null,
  name_en text not null,
  aliases text[] not null default '{}',
  points int not null check (points >= 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, code)
);

create table public.tournament_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  student_id uuid references public.students(id),            -- null: chưa ghép (đang ở hàng chờ) hoặc phụ huynh/thầy cô
  participant_kind text not null default 'student' check (participant_kind in ('student', 'parent', 'teacher')),
  raw_name text not null check (btrim(raw_name) <> ''),
  raw_name_normalized text not null default '',
  raw_club text,
  club_name text,                                             -- sau quy đổi (clb-quy-doi)
  group_name text,                                            -- K11: lưu nguyên văn
  to_par int,
  rank_title_code text,                                       -- tournament_point_rules.code (kind rank)
  rank_title_raw text,
  culture_award_code text,                                    -- tournament_point_rules.code (kind culture)
  culture_award_raw text,
  points_participation int not null default 0 check (points_participation >= 0),
  points_rank int not null default 0 check (points_rank >= 0),
  points_bonus int not null default 0 check (points_bonus >= 0),
  points_total int generated always as (points_participation + points_rank + points_bonus) stored,
  source text not null check (source in ('import', 'league_app')),
  merge_trail uuid[] not null default '{}',                   -- các hồ sơ đã gộp đi qua (để hoàn tác gộp)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, raw_name_normalized)
);
create index tournament_results_student_idx on public.tournament_results (student_id);

-- Mỗi league_ref chỉ cấp mã một lần; gọi lại trả kết quả cũ (spec 13 mục 4.2)
create table public.league_issue_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  league_ref text not null unique check (btrim(league_ref) <> ''),
  status text not null check (status in ('matched', 'created', 'review')),
  student_id uuid not null references public.students(id),
  passport_id uuid references public.passports(id),
  merge_trail uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index league_issue_requests_student_idx on public.league_issue_requests (student_id);

-- Dòng nghi trùng / không chắc chờ admin ghép. Không tự gộp hồ sơ.
-- payload chỉ giữ trường cho phép (tên, ngày/năm sinh, giới, trường, CLB, bảng) — không sức khoẻ, tài trợ, chuyển khoản
create table public.league_match_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  source text not null check (source in ('issue', 'results', 'import')),
  issue_request_id uuid references public.league_issue_requests(id),
  tournament_result_id uuid references public.tournament_results(id) on delete cascade,
  new_student_id uuid references public.students(id),          -- hồ sơ vừa tạo (nếu có)
  candidate_student_ids uuid[] not null default '{}',           -- hồ sơ có sẵn nghi là cùng người
  reason text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'merged', 'linked', 'kept_new', 'dismissed')),
  resolved_by uuid references public.profiles(user_id) on delete set null,
  resolved_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (issue_request_id is not null or tournament_result_id is not null),
  check (status = 'pending' or resolved_at is not null)
);
create index league_match_queue_pending_idx on public.league_match_queue (created_at) where status = 'pending' and deleted_at is null;

create or replace function public.tournament_results_normalize()
returns trigger language plpgsql set search_path = public as $$
begin
  new.raw_name := regexp_replace(btrim(new.raw_name), '\s+', ' ', 'g');
  new.raw_name_normalized := public.normalize_name(new.raw_name);
  return new;
end $$;
create trigger tournament_results_normalize before insert or update of raw_name on public.tournament_results
  for each row execute function public.tournament_results_normalize();

-- updated_at + nhật ký + RLS mặc định từ chối: chỉ admin đọc/ghi thẳng; trang công khai và cổng app giải đi qua hàm
do $$
declare t text;
begin
  foreach t in array array['seasons', 'tournament_series', 'tournaments', 'tournament_point_rules', 'tournament_results',
                           'league_issue_requests', 'league_match_queue'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Gộp học viên: kết quả giải đi theo hồ sơ giữ lại; hoàn tác gộp trả về
-- (merge_students / undo_student_merge giữ nguyên; bám theo cột students.merged_into_student_id)
-------------------------------------------------------------------------------
create or replace function public.league_follow_student_merge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.merged_into_student_id is null and new.merged_into_student_id is not null then
    update public.tournament_results set student_id = new.merged_into_student_id, merge_trail = merge_trail || old.id
    where student_id = old.id;
    update public.league_issue_requests set student_id = new.merged_into_student_id, merge_trail = merge_trail || old.id
    where student_id = old.id;
    update public.students set birth_year = old.birth_year
    where id = new.merged_into_student_id and birth_year is null and date_of_birth is null and old.birth_year is not null;
  elsif old.merged_into_student_id is not null and new.merged_into_student_id is null then
    update public.tournament_results set student_id = old.id, merge_trail = merge_trail[1:cardinality(merge_trail) - 1]
    where merge_trail[cardinality(merge_trail)] = old.id;
    update public.league_issue_requests set student_id = old.id, merge_trail = merge_trail[1:cardinality(merge_trail) - 1]
    where merge_trail[cardinality(merge_trail)] = old.id;
  end if;
  return null;
end $$;
create trigger league_follow_student_merge after update of merged_into_student_id on public.students
  for each row execute function public.league_follow_student_merge();

-------------------------------------------------------------------------------
-- Tra thang điểm theo cách viết (bỏ dấu, không phân biệt hoa thường). Dùng ở bước 2 (nhập lịch sử, lệnh results)
-------------------------------------------------------------------------------
create or replace function public.league_point_rule(p_series_id uuid, p_kind text, p_raw text)
returns public.tournament_point_rules language sql stable security definer set search_path = public as $$
  select r.* from public.tournament_point_rules r
  where r.series_id = p_series_id and r.kind = p_kind and r.is_active and nullif(btrim(coalesce(p_raw, '')), '') is not null
    and (public.normalize_name(r.code) = public.normalize_name(p_raw)
         or public.normalize_name(r.name_vi) = public.normalize_name(p_raw)
         or public.normalize_name(r.name_en) = public.normalize_name(p_raw)
         or exists (select 1 from unnest(r.aliases) a where public.normalize_name(a) = public.normalize_name(p_raw)))
  order by r.sort_order limit 1
$$;

-------------------------------------------------------------------------------
-- Hạng hiện tại (spec 13 mục 6.4, K9): tổng điểm mùa × hệ số chuỗi, chỉ chặng tính BXH, chỉ học sinh.
-- Đồng điểm đồng hạng, hạng kế tiếp bỏ qua (T7, T7, 9). Dòng chưa ghép vẫn là một VĐV, nhận theo tên chuẩn hoá.
-- security_invoker: đọc thẳng thì theo RLS (chỉ admin); trang công khai đọc qua hàm ở bước 3.
-------------------------------------------------------------------------------
create view public.league_standings with (security_invoker = true) as
with per_player as (
  select t.series_id, t.season_id,
         coalesce(r.student_id::text, 'name:' || r.raw_name_normalized) as player_key,
         r.student_id,
         (array_agg(r.raw_name order by t.stage_no desc))[1] as display_raw_name,
         round(sum(r.points_total * s.ranking_coefficient))::int as total_points,
         count(*)::int as stages_played,
         (count(*) filter (where r.rank_title_code = 'best_gross'))::int as best_gross_count
  from public.tournament_results r
  join public.tournaments t on t.id = r.tournament_id and t.deleted_at is null and t.counts_for_ranking
  join public.tournament_series s on s.id = t.series_id
  where r.participant_kind = 'student'
  group by t.series_id, t.season_id, coalesce(r.student_id::text, 'name:' || r.raw_name_normalized), r.student_id
)
select p.*,
       rank() over w as rank,
       (count(*) over (partition by p.series_id, p.season_id, p.total_points) > 1) as tied,
       count(*) over (partition by p.series_id, p.season_id) as players
from per_player p
window w as (partition by p.series_id, p.season_id order by p.total_points desc);
revoke all on public.league_standings from anon;

do $$
begin
  revoke execute on function public.league_point_rule(uuid, text, text) from public, anon, authenticated;
  revoke execute on function public.league_follow_student_merge() from public, anon, authenticated;
end $$;

-------------------------------------------------------------------------------
-- Seed: chuỗi, mùa 2026, thang điểm (phụ lục C mục C2; khớp league.vncentre.net/bxh). Admin chỉnh được.
-------------------------------------------------------------------------------
insert into public.tournament_series (code, name_vi, name_en, ranking_coefficient)
values ('snag_league', 'SNAG Golf League', 'SNAG Golf League', 1)
on conflict (code) do nothing;

insert into public.seasons (code, name_vi, name_en, start_date, end_date)
values ('2026', 'Mùa giải 2026', '2026 season', '2026-01-01', '2026-12-31')
on conflict (code) do nothing;

insert into public.tournament_point_rules (series_id, kind, code, name_vi, name_en, aliases, points, sort_order)
select s.id, x.kind, x.code, x.name_vi, x.name_en, x.aliases, x.points, x.sort_order
from public.tournament_series s
cross join (values
  ('participation', 'participation', 'Tham dự', 'Participation', '{}'::text[], 50, 0),
  ('rank', 'best_gross', 'Vô địch (Best Gross)', 'Champion (Best Gross)', '{"Best Gross","Vô địch"}'::text[], 500, 1),
  ('rank', 'winner', 'Winner bảng', 'Group winner', '{"Winner"}'::text[], 300, 2),
  ('rank', 'runner_up_1', '1st Runner-up', '1st Runner-up', '{"1st Runner Up"}'::text[], 250, 3),
  ('rank', 'runner_up_2', '2nd Runner-up', '2nd Runner-up', '{"2nd Runner Up"}'::text[], 200, 4),
  ('rank', 'runner_up_3', '3rd Runner-up', '3rd Runner-up', '{"3rd Runner Up"}'::text[], 150, 5),
  ('rank', 'runner_up_4', '4th Runner-up', '4th Runner-up', '{"4th Runner Up"}'::text[], 100, 6),
  ('culture', 'spirit_of_the_game', 'Tinh thần Golfer', 'Spirit of the Game', '{}'::text[], 200, 10),
  ('culture', 'essence_of_golf_style', 'Tinh hoa Phong cách Golf', 'The Essence of Golf Style', '{}'::text[], 100, 11),
  ('culture', 'style_bonus', 'Điểm thưởng Phong cách', 'Style bonus', '{}'::text[], 50, 12)
) as x(kind, code, name_vi, name_en, aliases, points, sort_order)
where s.code = 'snag_league'
on conflict (series_id, code) do nothing;
