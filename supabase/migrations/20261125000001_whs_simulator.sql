-- Module Simulator (golf 3D) của App Handicap · Giai đoạn 1, tuần 1–3 (phần máy chủ)
-- Minh · 25/11/2026. Thiết kế: doc "Kế hoạch sẵn sàng Handicap Simulator Việt Nam", mục 7–9, anh Long duyệt 25/11/2026.
--
-- Chỉ số NỘI BỘ của VN Centre, tên hiển thị tạm "VNC Simulator Index".
-- KHÔNG phải chỉ số chính thức của R&A/USGA/VGA và KHÔNG dùng chữ "WHS" khi hiển thị cho golfer.
-- Chỉ số được đánh dấu "chính thức" (official) chỉ khi hãng máy có giấy phép WHA VÀ đã ký thỏa thuận với VGA.
--
-- Quy tắc cố định:
--   • Tách hẳn khỏi Handicap Index sân thật: không chuyển đổi qua lại, không đọc/ghi bảng whs_rounds, whs_hi_history.
--   • Mỗi golfer một chỉ số riêng cho MỖI hãng máy; không gộp giữa các hãng.
--   • Dùng chung hội viên (whs_members, mã VNC), phòng 3D (practice_venues type '3d') và hãng máy (sim_brands) đã có.
--   • Golfer không ghi thẳng vào bảng; mọi thay đổi qua hàm whs_sim_* và được ghi nhật ký chỉ thêm.
--   • Một golfer (hoặc phụ huynh của golfer) không tự xác nhận điểm của mình.
--   • Mọi tham số riêng của simulator để trong whs_settings (khoá sim*), đổi bằng dữ liệu khi R&A ra thông số.
--
-- Chỉ THÊM bảng/hàm tiền tố whs_sim_ và khoá cấu hình sim*. Không sửa bảng/hàm nào đang chạy. Chạy lại nhiều lần không lỗi.

begin;

-------------------------------------------------------------------------------
-- 0. Cấu hình (giá trị chung; liên đoàn ghi đè bằng whs_fed_configs như các khoá khác)
-------------------------------------------------------------------------------
insert into public.whs_settings (key, value, note) values
  ('simInitMinHoles', '27', 'Simulator: số hố (vòng đã xác nhận) tối thiểu để có chỉ số lần đầu. Hướng mở như app sân thật; cập nhật khi R&A ra chuẩn.'),
  ('simInitMinScores', '3', 'Simulator: số vòng đã xác nhận tối thiểu để có chỉ số lần đầu (không dưới 3).'),
  ('simMaxIndex', '54', 'Simulator: trần chỉ số. Tạm 54 như sân thật (anh Long chốt 25/11/2026); cập nhật theo R&A.'),
  ('simWindow', '20', 'Simulator: số vòng gần nhất xét khi tính chỉ số.'),
  ('simBest', '8', 'Simulator: số điểm vi sai tốt nhất lấy trung bình khi đủ simWindow vòng.'),
  ('simPuttFactor', '1', 'Simulator: hệ số k nhân vào (AGS − CR). Tạm 1, chờ R&A ra hệ số đo putt.'),
  ('simObstacleConst', '0', 'Simulator: hằng số c cộng vào điểm vi sai 18 hố. Tạm 0, chờ R&A ra hệ số chướng ngại.'),
  ('simNineA', '0.52', 'Simulator: điểm vi sai 9 hố còn lại dự kiến = simNineA × chỉ số + simNineB. CẦN ĐỐI CHIẾU Technical Specifications trước khi dùng thật.'),
  ('simNineB', '1.2', 'Simulator: xem simNineA.'),
  ('simNineNoIndex', '54', 'Simulator: chỉ số giả định để quy đổi vòng 9 hố khi golfer chưa có chỉ số. CẦN ĐỐI CHIẾU luật.'),
  ('simAcceptGimme', 'true', 'Simulator: có nhận vòng bật putt tự động (gimme) không. Vòng có gimme vẫn được đánh dấu.'),
  ('simRequirePhoto', 'true', 'Simulator: golfer tự gửi điểm phải kèm ảnh màn hình bảng điểm.'),
  ('simConfirmHours', '72', 'Simulator: quá N giờ admin phòng chưa xác nhận → chuyển nhân sự VN Centre.'),
  ('simMaxPostDays', '0', 'Simulator: chỉ nhận vòng chơi trong N ngày gần đây. 0 = không giới hạn.'),
  ('simApiEnabled', 'false', 'Simulator: bật cổng nhận điểm tự động từ máy (chờ chuẩn kết nối của R&A).')
on conflict (key) do nothing;

-------------------------------------------------------------------------------
-- 1. Tình trạng cấp phép của hãng máy (bảng hãng sim_brands đã có ở module sân tập)
-------------------------------------------------------------------------------
create table if not exists public.whs_sim_brand_status (
  brand text primary key references public.sim_brands(key) on update cascade,
  wha_licensed boolean not null default false,        -- hãng có giấy phép toàn cầu của WHA
  wha_licensed_on date,
  vga_signed_on date,                                 -- ngày ký thỏa thuận với VGA (null = chưa ký)
  enabled boolean not null default true,              -- VN Centre cho phép nhập điểm hãng này
  note text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

-- Chỉ số của hãng là "chính thức" khi đủ cả hai điều kiện
create or replace function public.whs_sim_brand_official(p_brand text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select b.wha_licensed and b.vga_signed_on is not null from public.whs_sim_brand_status b where b.brand = p_brand), false)
$$;

-------------------------------------------------------------------------------
-- 2. Admin phòng 3D (người xác nhận điểm tại phòng)
-------------------------------------------------------------------------------
create table if not exists public.whs_sim_room_admins (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.practice_venues(id) on update cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists whs_sim_room_admins_uniq on public.whs_sim_room_admins (venue_id, user_id) where deleted_at is null;
create index if not exists whs_sim_room_admins_user on public.whs_sim_room_admins (user_id) where deleted_at is null;

create or replace function public.whs_sim_is_room_admin(p_venue text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.whs_sim_room_admins a
    where a.venue_id = p_venue and a.user_id = auth.uid() and a.deleted_at is null)
$$;

create or replace function public.whs_sim_room_has_admin(p_venue text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.whs_sim_room_admins a where a.venue_id = p_venue and a.deleted_at is null)
$$;

-------------------------------------------------------------------------------
-- 3. Sân ảo (theo hãng máy). Rating/slope tạm nhập tay; nguồn ghi ở rating_source.
--    holes = 18: cr/slope là của 18 hố; cr_f/slope_f, cr_b/slope_b là 9 hố trước/sau (trống → cr/2 và slope).
--    holes = 9 : cr/slope là của 9 hố; chỉ chơi được 'F'.
-------------------------------------------------------------------------------
create table if not exists public.whs_sim_courses (
  id uuid primary key default gen_random_uuid(),
  brand text not null references public.sim_brands(key) on update cascade,
  name text not null check (char_length(name) between 1 and 200),
  tee_name text not null check (char_length(tee_name) between 1 and 60),
  holes int not null check (holes in (9, 18)),
  par int[] not null,
  si int[] not null,
  cr numeric(4,1) not null,
  slope int not null check (slope between 55 and 155),
  cr_f numeric(4,1), slope_f int check (slope_f between 55 and 155),
  cr_b numeric(4,1), slope_b int check (slope_b between 55 and 155),
  rating_source text not null default 'manual' check (rating_source in ('manual', 'brand', 'wha')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  check (cardinality(par) = holes and cardinality(si) = holes)
);
create unique index if not exists whs_sim_courses_uniq on public.whs_sim_courses (brand, name, tee_name);

-------------------------------------------------------------------------------
-- 4. Vòng chơi, ảnh màn hình, nhật ký
-------------------------------------------------------------------------------
create table if not exists public.whs_sim_rounds (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.whs_members(id),
  federation_id text not null references public.whs_federations(id),
  venue_id text not null references public.practice_venues(id) on update cascade,
  brand text not null references public.sim_brands(key) on update cascade,   -- chép từ phòng lúc gửi (máy có thể đổi sau)
  course_id uuid not null references public.whs_sim_courses(id),
  holes text not null check (holes in ('18', 'F', 'B')),
  played_on date not null,
  gross int[] not null,
  gimme boolean not null default false,               -- golfer khai: có bật putt tự động
  ai_scores int[],                                    -- điểm AI đọc từ ảnh (để so với điểm golfer gửi)
  via text not null default 'photo' check (via in ('photo', 'staff', 'api')),
  external_ref text,                                  -- mã vòng phía hãng (cổng tự động)
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'withdrawn', 'void')),
  flags text[] not null default '{}',
  submitted_by uuid default auth.uid(),
  decided_by uuid, decided_at timestamptz, decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whs_sim_rounds_member on public.whs_sim_rounds (member_id, brand, played_on);
create index if not exists whs_sim_rounds_pending on public.whs_sim_rounds (venue_id, created_at) where status = 'pending';
create unique index if not exists whs_sim_rounds_ext on public.whs_sim_rounds (brand, external_ref) where external_ref is not null;

create table if not exists public.whs_sim_photos (
  round_id uuid primary key references public.whs_sim_rounds(id) on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data text not null check (char_length(data) <= 1500000),   -- base64, app đã nén ≤ ~1 MB
  created_at timestamptz not null default now()
);

create table if not exists public.whs_sim_round_log (
  id bigint generated always as identity primary key,
  round_id uuid not null references public.whs_sim_rounds(id),
  actor uuid,
  action text not null,
  before jsonb, after jsonb,
  reason text,
  at timestamptz not null default now()
);
create index if not exists whs_sim_round_log_round on public.whs_sim_round_log (round_id, id);

drop trigger if exists whs_sim_round_log_no_change on public.whs_sim_round_log;
create trigger whs_sim_round_log_no_change before update or delete on public.whs_sim_round_log
  for each row execute function public.whs_log_immutable();
drop trigger if exists whs_sim_rounds_touch on public.whs_sim_rounds;
create trigger whs_sim_rounds_touch before update on public.whs_sim_rounds for each row execute function public.whs_touch();

create or replace function public.whs_sim_log(p_round uuid, p_action text, p_before jsonb, p_after jsonb, p_reason text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.whs_sim_round_log (round_id, actor, action, before, after, reason)
  values (p_round, auth.uid(), p_action, p_before, p_after, p_reason)
$$;

-------------------------------------------------------------------------------
-- 5. Kết quả tính (chỉ hàm whs_sim_recompute ghi)
-------------------------------------------------------------------------------
create table if not exists public.whs_sim_results (
  round_id uuid primary key references public.whs_sim_rounds(id) on delete cascade,
  member_id uuid not null references public.whs_members(id),
  brand text not null,
  ags int, diff numeric(5,1),
  idx_before numeric(4,1), idx_after numeric(4,1),
  notes jsonb not null default '{}',                  -- {ch, caps:[..], nine:{expected}, k, c}
  computed_at timestamptz not null default now()
);

create table if not exists public.whs_sim_index (
  member_id uuid not null references public.whs_members(id),
  brand text not null references public.sim_brands(key) on update cascade,
  idx numeric(4,1),                                   -- null = chưa đủ điều kiện
  n_scores int not null default 0,
  holes int not null default 0,
  need_holes int not null default 0,
  need_scores int not null default 0,
  official boolean not null default false,
  as_of date,
  history jsonb not null default '[]',                -- [{date, idx}] mỗi lần chỉ số đổi
  computed_at timestamptz not null default now(),
  primary key (member_id, brand)
);

-------------------------------------------------------------------------------
-- 6. Bộ tính
-------------------------------------------------------------------------------
-- Làm tròn 1 chữ số kiểu WHS (nửa lên, kể cả số âm)
create or replace function public.whs_sim_r1(x numeric) returns numeric language sql immutable as $$
  select floor(x * 10 + 0.5) / 10
$$;

create or replace function public.whs_sim_num(p_fed text, p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((public.whs_setting(p_fed, p_key) #>> '{}')::numeric, p_default)
$$;

create or replace function public.whs_sim_bool(p_fed text, p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((public.whs_setting(p_fed, p_key) #>> '{}')::boolean, p_default)
$$;

-- Số điểm vi sai tốt nhất và điều chỉnh theo số vòng (bảng Rule 5.2a, như app sân thật); đủ cửa sổ → p_best, 0
create or replace function public.whs_sim_best(p_n int, p_window int, p_best int, out cnt int, out adj numeric)
language plpgsql immutable as $$
begin
  if p_n >= p_window then cnt := p_best; adj := 0; return; end if;
  select x.c, x.a into cnt, adj from (values
    (3, 1, -2.0), (4, 1, -1.0), (5, 1, 0.0), (6, 2, -1.0), (7, 2, 0.0), (8, 2, 0.0), (9, 3, 0.0), (10, 3, 0.0), (11, 3, 0.0),
    (12, 4, 0.0), (13, 4, 0.0), (14, 4, 0.0), (15, 5, 0.0), (16, 5, 0.0), (17, 6, 0.0), (18, 6, 0.0), (19, 7, 0.0)
  ) x(n, c, a) where x.n = least(p_n, 19);
  if cnt is null then cnt := 0; adj := 0; end if;       -- dưới 3 vòng: chưa tính
  cnt := least(cnt, p_best);
end $$;

-- Điểm tối đa từng hố: chưa có chỉ số → par + 5; có chỉ số → net double bogey (par + 2 + gậy chấp hố)
create or replace function public.whs_sim_caps(p_par int[], p_si int[], p_ch int) returns int[]
language plpgsql immutable as $$
declare n int := cardinality(p_par); caps int[] := '{}'; i int; rk int; s int; q int; rem int;
begin
  if p_ch is null then
    for i in 1..n loop caps := caps || (p_par[i] + 5); end loop;
    return caps;
  end if;
  for i in 1..n loop
    -- thứ hạng độ khó của hố trong đoạn đang chơi (1 = khó nhất)
    select count(*) + 1 into rk from unnest(p_si) x where x < p_si[i];
    if p_ch >= 0 then
      q := p_ch / n; rem := p_ch % n;
      s := q + case when rk <= rem then 1 else 0 end;
    else
      -- chỉ số cộng (+): trả gậy ở các hố dễ nhất
      q := (-p_ch) / n; rem := (-p_ch) % n;
      s := -(q + case when rk > n - rem then 1 else 0 end);
    end if;
    caps := caps || (p_par[i] + 2 + s);
  end loop;
  return caps;
end $$;

-- Tính lại toàn bộ chỉ số của một hội viên trên một hãng, từ các vòng đã xác nhận (theo thứ tự ngày chơi)
create or replace function public.whs_sim_recompute(p_member uuid, p_brand text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m whs_members; fed text;
  k numeric; c numeric; a9 numeric; b9 numeric; noidx numeric; win int; best int; mx numeric; min_h int; min_s int;
  r record; cs whs_sim_courses;
  v_par int[]; v_si int[]; v_cr numeric; v_sl numeric; n int; ch int; caps int[]; ags int; d numeric; exp9 numeric;
  idx numeric := null; idx_new numeric; diffs numeric[] := '{}'; holes_tot int := 0; n_sc int := 0;
  sel numeric[]; b record; hist jsonb := '[]'; last_date date;
begin
  select * into m from whs_members where id = p_member;
  if m.id is null then raise exception 'member_not_found'; end if;
  fed := m.federation_id;
  k := whs_sim_num(fed, 'simPuttFactor', 1);
  c := whs_sim_num(fed, 'simObstacleConst', 0);
  a9 := whs_sim_num(fed, 'simNineA', 0.52);
  b9 := whs_sim_num(fed, 'simNineB', 1.2);
  noidx := whs_sim_num(fed, 'simNineNoIndex', 54);
  win := whs_sim_num(fed, 'simWindow', 20)::int;
  best := whs_sim_num(fed, 'simBest', 8)::int;
  mx := least(whs_sim_num(fed, 'simMaxIndex', 54), 54);
  min_h := whs_sim_num(fed, 'simInitMinHoles', 27)::int;
  min_s := greatest(whs_sim_num(fed, 'simInitMinScores', 3)::int, 3);

  delete from whs_sim_results where member_id = p_member and brand = p_brand;

  for r in select * from whs_sim_rounds
           where member_id = p_member and brand = p_brand and status = 'confirmed'
           order by played_on, created_at, id loop
    select * into cs from whs_sim_courses where id = r.course_id;
    if r.holes = '18' then
      v_par := cs.par; v_si := cs.si; v_cr := cs.cr; v_sl := cs.slope;
    elsif cs.holes = 9 then
      v_par := cs.par; v_si := cs.si; v_cr := cs.cr; v_sl := cs.slope;
    elsif r.holes = 'F' then
      v_par := cs.par[1:9]; v_si := cs.si[1:9]; v_cr := coalesce(cs.cr_f, cs.cr / 2); v_sl := coalesce(cs.slope_f, cs.slope);
    else
      v_par := cs.par[10:18]; v_si := cs.si[10:18]; v_cr := coalesce(cs.cr_b, cs.cr / 2); v_sl := coalesce(cs.slope_b, cs.slope);
    end if;
    n := cardinality(v_par);

    -- Gậy chấp sân (Course Handicap) theo chỉ số trước vòng này; 9 hố dùng nửa chỉ số
    ch := case when idx is null then null
               else round((case when n = 18 then idx else idx / 2 end) * v_sl / 113.0
                          + (v_cr - (select sum(x) from unnest(v_par) x)))::int end;
    caps := whs_sim_caps(v_par, v_si, ch);
    select sum(least(g, cp))::int into ags from unnest(r.gross, caps) as t(g, cp);

    d := 113.0 / v_sl * (ags - v_cr) * k;
    exp9 := null;
    if n = 9 then
      exp9 := whs_sim_r1(a9 * coalesce(idx, noidx) + b9);
      d := whs_sim_r1(d) + exp9;
    end if;
    d := whs_sim_r1(d + c);

    diffs := diffs || d; holes_tot := holes_tot + n; n_sc := n_sc + 1;

    idx_new := idx;
    if holes_tot >= min_h and n_sc >= min_s then
      select * into b from whs_sim_best(least(n_sc, win), win, best);
      select array_agg(v order by v) into sel
      from unnest(diffs[greatest(1, cardinality(diffs) - win + 1):cardinality(diffs)]) v;
      if b.cnt > 0 then
        idx_new := least(mx, whs_sim_r1((select avg(v) from unnest(sel[1:b.cnt]) v) + b.adj));
      end if;
    end if;

    insert into whs_sim_results (round_id, member_id, brand, ags, diff, idx_before, idx_after, notes)
    values (r.id, p_member, p_brand, ags, d, idx, idx_new,
      jsonb_build_object('ch', ch, 'caps', to_jsonb(caps), 'cr', v_cr, 'slope', v_sl, 'k', k, 'c', c, 'expected9', exp9));

    if idx_new is distinct from idx then
      hist := hist || jsonb_build_array(jsonb_build_object('date', r.played_on, 'idx', idx_new));
    end if;
    idx := idx_new; last_date := r.played_on;
  end loop;

  insert into whs_sim_index (member_id, brand, idx, n_scores, holes, need_holes, need_scores, official, as_of, history, computed_at)
  values (p_member, p_brand, idx, n_sc, holes_tot, greatest(0, min_h - holes_tot), greatest(0, min_s - n_sc),
    whs_sim_brand_official(p_brand), last_date, hist, now())
  on conflict (member_id, brand) do update set idx = excluded.idx, n_scores = excluded.n_scores, holes = excluded.holes,
    need_holes = excluded.need_holes, need_scores = excluded.need_scores, official = excluded.official,
    as_of = excluded.as_of, history = excluded.history, computed_at = excluded.computed_at;
end $$;

-------------------------------------------------------------------------------
-- 7. Luồng golfer
-------------------------------------------------------------------------------
-- Kiểm tra sân ảo, đoạn chơi, điểm từng hố; trả số hố của đoạn
create or replace function public.whs_sim_check_round(p_course public.whs_sim_courses, p_holes text, p_gross int[]) returns int
language plpgsql immutable as $$
declare n int;
begin
  if p_course.id is null or p_course.status <> 'active' then raise exception 'course_not_found'; end if;
  if p_holes not in ('18', 'F', 'B') then raise exception 'bad_holes'; end if;
  if p_course.holes = 9 and p_holes <> 'F' then raise exception 'course_is_9_holes'; end if;
  n := case when p_holes = '18' then 18 else 9 end;
  if p_gross is null or cardinality(p_gross) <> n then raise exception 'gross_length'; end if;
  if exists (select 1 from unnest(p_gross) g where g is null or g not between 1 and 20) then raise exception 'gross_bad_value'; end if;
  return n;
end $$;

-- Gửi điểm. Golfer (hoặc phụ huynh) gửi kèm ảnh → chờ admin phòng xác nhận.
-- p_member = null → hội viên của chính người đăng nhập.
create or replace function public.whs_sim_submit(p_venue text, p_course uuid, p_holes text, p_played_on date, p_gross int[],
  p_gimme boolean default false, p_mulligan boolean default false,
  p_photo text default null, p_photo_mime text default null, p_ai_scores int[] default null, p_member uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare m whs_members; v practice_venues; cs whs_sim_courses; bs whs_sim_brand_status; v_id uuid; v_days int; v_flags text[] := '{}';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  m := whs_resolve_member(p_member, array['active', 'pending']);

  select * into v from practice_venues where id = p_venue;
  if v.id is null or v.type <> '3d' or v.status not in ('active', 'closed_temp') then raise exception 'venue_not_found'; end if;
  if v.machine is null then raise exception 'venue_no_machine'; end if;
  select * into bs from whs_sim_brand_status where brand = v.machine;
  if bs.brand is not null and not bs.enabled then raise exception 'brand_disabled'; end if;

  select * into cs from whs_sim_courses where id = p_course;
  if cs.id is not null and cs.brand <> v.machine then raise exception 'course_brand_mismatch'; end if;
  perform whs_sim_check_round(cs, p_holes, p_gross);

  if coalesce(p_mulligan, false) then raise exception 'mulligan_not_counted'; end if;
  if coalesce(p_gimme, false) then
    if not whs_sim_bool(m.federation_id, 'simAcceptGimme', true) then raise exception 'gimme_not_counted'; end if;
    v_flags := array_append(v_flags, 'gimme');
  end if;

  if p_played_on is null or p_played_on > current_date + 1 then raise exception 'bad_date'; end if;
  v_days := whs_sim_num(m.federation_id, 'simMaxPostDays', 0)::int;
  if v_days > 0 and p_played_on < current_date - v_days then raise exception 'too_old'; end if;

  if p_photo is null then
    if whs_sim_bool(m.federation_id, 'simRequirePhoto', true) then raise exception 'photo_required'; end if;
  elsif p_photo_mime not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'bad_photo';
  end if;
  if p_ai_scores is not null and p_ai_scores is distinct from p_gross then v_flags := array_append(v_flags, 'edited_after_ai'); end if;

  if exists (select 1 from whs_sim_rounds x where x.member_id = m.id and x.course_id = p_course and x.played_on = p_played_on
             and x.holes = p_holes and x.gross = p_gross and x.status in ('pending', 'confirmed')) then
    raise exception 'duplicate_round';
  end if;

  insert into whs_sim_rounds (member_id, federation_id, venue_id, brand, course_id, holes, played_on, gross, gimme, ai_scores, via, flags)
  values (m.id, m.federation_id, v.id, v.machine, cs.id, p_holes, p_played_on, p_gross, coalesce(p_gimme, false), p_ai_scores, 'photo', v_flags)
  returning id into v_id;
  if p_photo is not null then insert into whs_sim_photos (round_id, mime, data) values (v_id, p_photo_mime, p_photo); end if;
  perform whs_sim_log(v_id, 'submit', null, jsonb_build_object('gross', p_gross, 'flags', v_flags), null);
  return v_id;
end $$;

-- Golfer huỷ điểm còn đang chờ
create or replace function public.whs_sim_withdraw(p_round uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update whs_sim_rounds set status = 'withdrawn' where id = p_round and status = 'pending' and whs_can_act_for(member_id);
  if not found then raise exception 'cannot_withdraw'; end if;
  perform whs_sim_log(p_round, 'withdraw', null, null, null);
end $$;

-------------------------------------------------------------------------------
-- 8. Xác nhận: admin phòng; nhân sự VN Centre (nhân sự liên đoàn / admin nền tảng) duyệt thay khi phòng chưa có admin hoặc quá hạn
-------------------------------------------------------------------------------
create or replace function public.whs_sim_can_decide(p_round public.whs_sim_rounds) returns boolean
language sql stable security definer set search_path = public as $$
  select p_round.id is not null
    and not public.whs_can_act_for(p_round.member_id)                 -- không tự xác nhận điểm của mình / của con
    and (public.whs_sim_is_room_admin(p_round.venue_id) or public.whs_is_fed_staff(p_round.federation_id))
$$;

create or replace function public.whs_sim_decide(p_round uuid, p_approve boolean, p_gross int[] default null, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r whs_sim_rounds; cs whs_sim_courses;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into r from whs_sim_rounds where id = p_round for update;
  if r.id is null then raise exception 'round_not_found'; end if;
  if not whs_sim_can_decide(r) then raise exception 'forbidden'; end if;
  if r.status <> 'pending' then raise exception 'not_pending'; end if;
  if p_approve then
    if p_gross is not null and p_gross is distinct from r.gross then
      select * into cs from whs_sim_courses where id = r.course_id;
      perform whs_sim_check_round(cs, r.holes, p_gross);
      perform whs_sim_log(p_round, 'correct', jsonb_build_object('gross', r.gross), jsonb_build_object('gross', p_gross), p_note);
    end if;
    update whs_sim_rounds set status = 'confirmed', gross = coalesce(p_gross, gross),
      decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = p_round;
    perform whs_sim_log(p_round, 'confirm', null, null, p_note);
    perform whs_sim_recompute(r.member_id, r.brand);
  else
    if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
    update whs_sim_rounds set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = p_round;
    perform whs_sim_log(p_round, 'reject', null, null, p_note);
  end if;
end $$;

-- Huỷ một vòng đã xác nhận (phát hiện sai sau) – chỉ nhân sự liên đoàn / admin nền tảng
create or replace function public.whs_sim_void(p_round uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r whs_sim_rounds;
begin
  select * into r from whs_sim_rounds where id = p_round for update;
  if r.id is null then raise exception 'round_not_found'; end if;
  if not whs_is_fed_staff(r.federation_id) then raise exception 'forbidden'; end if;
  if r.status <> 'confirmed' then raise exception 'not_confirmed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update whs_sim_rounds set status = 'void', decision_note = p_reason where id = p_round;
  perform whs_sim_log(p_round, 'void', null, null, p_reason);
  perform whs_sim_recompute(r.member_id, r.brand);
end $$;

-- Hàng chờ xác nhận của người đăng nhập. overdue = quá simConfirmHours.
-- Admin phòng thấy vòng của phòng mình; nhân sự VN Centre thấy vòng của phòng chưa có admin và vòng quá hạn.
drop function if exists public.whs_sim_queue();
create or replace function public.whs_sim_queue() returns table (
  round_id uuid, venue_id text, venue_name text, golfer text, course_id uuid, course text, tee text, par int[], holes text, played_on date,
  gross int[], ai_scores int[], gimme boolean, flags text[], created_at timestamptz, overdue boolean, room_has_admin boolean, has_photo boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.venue_id, v.name, mb.full_name, cs.id, cs.name, cs.tee_name,
    case when r.holes = 'B' then cs.par[10:18] when r.holes = 'F' and cs.holes = 18 then cs.par[1:9] else cs.par end,
    r.holes, r.played_on, r.gross, r.ai_scores, r.gimme, r.flags, r.created_at,
    r.created_at < now() - make_interval(hours => public.whs_sim_num(r.federation_id, 'simConfirmHours', 72)::int),
    public.whs_sim_room_has_admin(r.venue_id),
    exists (select 1 from whs_sim_photos p where p.round_id = r.id)
  from whs_sim_rounds r
  join practice_venues v on v.id = r.venue_id
  join whs_members mb on mb.id = r.member_id
  join whs_sim_courses cs on cs.id = r.course_id
  where r.status = 'pending' and public.whs_sim_can_decide(r)
    and (public.whs_sim_is_room_admin(r.venue_id)
         or not public.whs_sim_room_has_admin(r.venue_id)
         or r.created_at < now() - make_interval(hours => public.whs_sim_num(r.federation_id, 'simConfirmHours', 72)::int))
  order by r.created_at
$$;

-------------------------------------------------------------------------------
-- 9. Quản trị (admin nền tảng VN Centre): hãng, sân ảo, admin phòng
-------------------------------------------------------------------------------
create or replace function public.whs_sim_set_brand_status(p_brand text, p_wha_licensed boolean, p_wha_on date,
  p_vga_signed_on date, p_enabled boolean default true, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_member uuid;
begin
  if not whs_is_platform_admin() then raise exception 'forbidden'; end if;
  insert into whs_sim_brand_status (brand, wha_licensed, wha_licensed_on, vga_signed_on, enabled, note, updated_by, updated_at)
  values (p_brand, coalesce(p_wha_licensed, false), p_wha_on, p_vga_signed_on, coalesce(p_enabled, true), p_note, auth.uid(), now())
  on conflict (brand) do update set wha_licensed = excluded.wha_licensed, wha_licensed_on = excluded.wha_licensed_on,
    vga_signed_on = excluded.vga_signed_on, enabled = excluded.enabled, note = excluded.note,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  update whs_sim_index set official = whs_sim_brand_official(p_brand) where brand = p_brand;
end $$;

create or replace function public.whs_sim_save_course(p_id uuid, p_brand text, p_name text, p_tee text, p_par int[], p_si int[],
  p_cr numeric, p_slope int, p_cr_f numeric default null, p_slope_f int default null, p_cr_b numeric default null, p_slope_b int default null,
  p_source text default 'manual', p_status text default 'active') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int := cardinality(p_par); v_old whs_sim_courses;
begin
  if not whs_is_platform_admin() then raise exception 'forbidden'; end if;
  if n not in (9, 18) then raise exception 'course_9_or_18_holes'; end if;
  if exists (select 1 from unnest(p_par) x where x not between 3 and 6) then raise exception 'bad_par'; end if;
  if p_si is null or cardinality(p_si) <> n then raise exception 'bad_si'; end if;
  if (select count(distinct x) from unnest(p_si) x where x between 1 and n) <> n then raise exception 'bad_si'; end if;
  if p_cr is null or p_slope is null then raise exception 'rating_required'; end if;
  if p_id is null then
    insert into whs_sim_courses (brand, name, tee_name, holes, par, si, cr, slope, cr_f, slope_f, cr_b, slope_b, rating_source, status)
    values (p_brand, p_name, p_tee, n, p_par, p_si, p_cr, p_slope, p_cr_f, p_slope_f, p_cr_b, p_slope_b, coalesce(p_source, 'manual'), coalesce(p_status, 'active'))
    returning id into v_id;
  else
    select * into v_old from whs_sim_courses where id = p_id for update;
    if v_old.id is null then raise exception 'course_not_found'; end if;
    -- Sân đã có vòng thì không đổi hãng, số hố, par, SI (tránh sai lịch sử); được đổi rating và tính lại
    if exists (select 1 from whs_sim_rounds where course_id = p_id) and
       (v_old.brand <> p_brand or v_old.par <> p_par or v_old.si <> p_si) then raise exception 'course_in_use'; end if;
    update whs_sim_courses set brand = p_brand, name = p_name, tee_name = p_tee, holes = n, par = p_par, si = p_si,
      cr = p_cr, slope = p_slope, cr_f = p_cr_f, slope_f = p_slope_f, cr_b = p_cr_b, slope_b = p_slope_b,
      rating_source = coalesce(p_source, 'manual'), status = coalesce(p_status, 'active'), updated_by = auth.uid(), updated_at = now()
    where id = p_id returning id into v_id;
    -- Rating đổi → tính lại cho mọi golfer đã chơi sân này
    if (v_old.cr, v_old.slope, v_old.cr_f, v_old.slope_f, v_old.cr_b, v_old.slope_b)
       is distinct from (p_cr, p_slope, p_cr_f, p_slope_f, p_cr_b, p_slope_b) then
      perform whs_sim_recompute(x.member_id, x.brand)
      from (select distinct member_id, brand from whs_sim_rounds where course_id = p_id and status = 'confirmed') x;
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.whs_sim_set_room_admin(p_venue text, p_user uuid, p_active boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not whs_is_platform_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from practice_venues where id = p_venue and type = '3d') then raise exception 'venue_not_found'; end if;
  if p_active then
    insert into whs_sim_room_admins (venue_id, user_id) values (p_venue, p_user) on conflict do nothing;
  else
    update whs_sim_room_admins set deleted_at = now() where venue_id = p_venue and user_id = p_user and deleted_at is null;
  end if;
end $$;

-- Giao / bỏ quyền admin phòng bằng tài khoản Golf Passport (email hoặc số điện thoại đăng nhập)
create or replace function public.whs_sim_set_room_admin_by_login(p_venue text, p_login text, p_active boolean default true) returns text
language plpgsql security definer set search_path = public, auth as $$
declare v_q text := lower(btrim(coalesce(p_login, ''))); v_phone text; v_user uuid; v_label text;
begin
  if not whs_is_platform_admin() then raise exception 'forbidden'; end if;
  if v_q = '' then raise exception 'login_required'; end if;
  -- SĐT kiểu Việt Nam 0xxx → 84xxx (auth.users.phone lưu không có dấu +)
  v_phone := regexp_replace(v_q, '[^0-9]', '', 'g');
  if v_phone ~ '^0[0-9]{8,10}$' then v_phone := '84' || substr(v_phone, 2); end if;
  select u.id, coalesce(u.email, u.phone) into v_user, v_label from auth.users u
  where (position('@' in v_q) > 0 and lower(u.email) = v_q)
     or (position('@' in v_q) = 0 and v_phone <> '' and regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') = v_phone)
  limit 1;
  if v_user is null then raise exception 'user_not_found'; end if;
  perform whs_sim_set_room_admin(p_venue, v_user, p_active);
  return v_label;
end $$;

-- Danh sách admin phòng (cho admin nền tảng)
create or replace function public.whs_sim_room_admin_list() returns table (venue_id text, venue_name text, user_id uuid, login text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not whs_is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select a.venue_id, v.name, a.user_id, coalesce(u.email, u.phone)::text, a.created_at
    from whs_sim_room_admins a join practice_venues v on v.id = a.venue_id left join auth.users u on u.id = a.user_id
    where a.deleted_at is null order by v.name, a.created_at;
end $$;

-- Cấu hình thay đổi (hệ số R&A, trần…) → tính lại toàn bộ
create or replace function public.whs_sim_recompute_all() returns int
language plpgsql security definer set search_path = public as $$
declare x record; n int := 0;
begin
  -- current_user trong hàm security definer luôn là chủ hàm → xét vai trò theo JWT của phiên
  if not (whs_is_platform_admin()
          or coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role' = 'service_role') then
    raise exception 'forbidden';
  end if;
  for x in select distinct member_id, brand from whs_sim_rounds where status in ('confirmed', 'void') loop
    perform whs_sim_recompute(x.member_id, x.brand); n := n + 1;
  end loop;
  return n;
end $$;

-------------------------------------------------------------------------------
-- 10. Cổng nhận điểm tự động từ máy (khung chờ). Chỉ service role gọi, tắt cho tới khi có chuẩn kết nối R&A.
-- p_payload: {federation, venue_id, student_code, course_id, holes, played_on, gross:[..], gimme, mulligan, external_ref}
-------------------------------------------------------------------------------
create or replace function public.whs_sim_ingest(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare fed text := coalesce(p_payload ->> 'federation', 'vn'); v practice_venues; cs whs_sim_courses; m whs_members;
  v_gross int[]; v_id uuid; v_holes text := p_payload ->> 'holes';
begin
  if not whs_sim_bool(fed, 'simApiEnabled', false) then raise exception 'api_not_enabled'; end if;
  if coalesce((p_payload ->> 'mulligan')::boolean, false) then raise exception 'mulligan_not_counted'; end if;
  select * into v from practice_venues where id = p_payload ->> 'venue_id' and type = '3d';
  if v.id is null or v.machine is null then raise exception 'venue_not_found'; end if;
  if not whs_sim_brand_official(v.machine) then raise exception 'brand_not_official'; end if;
  select mb.* into m from whs_members mb join students s on s.id = mb.student_id
  where s.student_code = p_payload ->> 'student_code' and mb.federation_id = fed and mb.status in ('active', 'pending');
  if m.id is null then raise exception 'member_not_found'; end if;
  select * into cs from whs_sim_courses where id = (p_payload ->> 'course_id')::uuid and brand = v.machine;
  select array_agg(x::int order by o) into v_gross from jsonb_array_elements_text(p_payload -> 'gross') with ordinality t(x, o);
  perform whs_sim_check_round(cs, v_holes, v_gross);
  insert into whs_sim_rounds (member_id, federation_id, venue_id, brand, course_id, holes, played_on, gross, gimme, via, external_ref,
    status, decided_at, flags)
  values (m.id, fed, v.id, v.machine, cs.id, v_holes, (p_payload ->> 'played_on')::date, v_gross,
    coalesce((p_payload ->> 'gimme')::boolean, false), 'api', p_payload ->> 'external_ref', 'confirmed', now(),
    case when coalesce((p_payload ->> 'gimme')::boolean, false) then array['gimme'] else '{}' end)
  returning id into v_id;
  perform whs_sim_log(v_id, 'ingest', null, p_payload, null);
  perform whs_sim_recompute(m.id, v.machine);
  return v_id;
end $$;

-------------------------------------------------------------------------------
-- 11. Phân quyền
-------------------------------------------------------------------------------
alter table public.whs_sim_brand_status enable row level security;
alter table public.whs_sim_room_admins enable row level security;
alter table public.whs_sim_courses enable row level security;
alter table public.whs_sim_rounds enable row level security;
alter table public.whs_sim_photos enable row level security;
alter table public.whs_sim_round_log enable row level security;
alter table public.whs_sim_results enable row level security;
alter table public.whs_sim_index enable row level security;

drop policy if exists whs_sim_brand_read on public.whs_sim_brand_status;
create policy whs_sim_brand_read on public.whs_sim_brand_status for select using (true);
drop policy if exists whs_sim_course_read on public.whs_sim_courses;
create policy whs_sim_course_read on public.whs_sim_courses for select using (status = 'active' or public.whs_is_platform_admin());
drop policy if exists whs_sim_radmin_read on public.whs_sim_room_admins;
create policy whs_sim_radmin_read on public.whs_sim_room_admins for select to authenticated
  using (user_id = auth.uid() or public.whs_is_platform_admin());

drop policy if exists whs_sim_round_read on public.whs_sim_rounds;
create policy whs_sim_round_read on public.whs_sim_rounds for select to authenticated
  using (public.whs_can_see_member(member_id) or public.whs_sim_is_room_admin(venue_id) or public.whs_is_fed_staff(federation_id));
drop policy if exists whs_sim_photo_read on public.whs_sim_photos;
create policy whs_sim_photo_read on public.whs_sim_photos for select to authenticated
  using (exists (select 1 from public.whs_sim_rounds r where r.id = round_id));      -- theo quyền đọc vòng
drop policy if exists whs_sim_log_read on public.whs_sim_round_log;
create policy whs_sim_log_read on public.whs_sim_round_log for select to authenticated
  using (exists (select 1 from public.whs_sim_rounds r where r.id = round_id));
drop policy if exists whs_sim_result_read on public.whs_sim_results;
create policy whs_sim_result_read on public.whs_sim_results for select to authenticated using (public.whs_can_see_member(member_id));
drop policy if exists whs_sim_index_read on public.whs_sim_index;
create policy whs_sim_index_read on public.whs_sim_index for select to authenticated using (public.whs_can_see_member(member_id));

revoke all on public.whs_sim_brand_status, public.whs_sim_room_admins, public.whs_sim_courses, public.whs_sim_rounds,
  public.whs_sim_photos, public.whs_sim_round_log, public.whs_sim_results, public.whs_sim_index from anon, authenticated;
grant select on public.whs_sim_brand_status, public.whs_sim_courses to anon, authenticated;
grant select on public.whs_sim_room_admins, public.whs_sim_rounds, public.whs_sim_photos, public.whs_sim_round_log,
  public.whs_sim_results, public.whs_sim_index to authenticated;

-- Hàm nội bộ
revoke execute on function public.whs_sim_log(uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.whs_sim_recompute(uuid, text) from public, anon, authenticated;
revoke execute on function public.whs_sim_check_round(public.whs_sim_courses, text, int[]) from public, anon, authenticated;
revoke execute on function public.whs_sim_ingest(jsonb) from public, anon, authenticated;
grant execute on function public.whs_sim_ingest(jsonb), public.whs_sim_recompute(uuid, text) to service_role;
-- Hàm dùng trong chính sách / app gọi
revoke execute on function public.whs_sim_is_room_admin(text), public.whs_sim_room_has_admin(text),
  public.whs_sim_can_decide(public.whs_sim_rounds), public.whs_sim_submit(text, uuid, text, date, int[], boolean, boolean, text, text, int[], uuid),
  public.whs_sim_withdraw(uuid), public.whs_sim_decide(uuid, boolean, int[], text), public.whs_sim_void(uuid, text),
  public.whs_sim_queue(), public.whs_sim_set_brand_status(text, boolean, date, date, boolean, text),
  public.whs_sim_save_course(uuid, text, text, text, int[], int[], numeric, int, numeric, int, numeric, int, text, text),
  public.whs_sim_set_room_admin(text, uuid, boolean), public.whs_sim_recompute_all(),
  public.whs_sim_set_room_admin_by_login(text, text, boolean), public.whs_sim_room_admin_list() from public, anon;
grant execute on function public.whs_sim_is_room_admin(text), public.whs_sim_room_has_admin(text),
  public.whs_sim_can_decide(public.whs_sim_rounds), public.whs_sim_submit(text, uuid, text, date, int[], boolean, boolean, text, text, int[], uuid),
  public.whs_sim_withdraw(uuid), public.whs_sim_decide(uuid, boolean, int[], text), public.whs_sim_void(uuid, text),
  public.whs_sim_queue(), public.whs_sim_set_brand_status(text, boolean, date, date, boolean, text),
  public.whs_sim_save_course(uuid, text, text, text, int[], int[], numeric, int, numeric, int, numeric, int, text, text),
  public.whs_sim_set_room_admin(text, uuid, boolean), public.whs_sim_recompute_all(),
  public.whs_sim_set_room_admin_by_login(text, text, boolean), public.whs_sim_room_admin_list() to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261125000001', 'whs_simulator') on conflict (version) do nothing;

commit;
