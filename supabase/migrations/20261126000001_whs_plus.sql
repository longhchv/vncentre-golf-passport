-- App Handicap · Ưu tiên 1 + 2 theo tài liệu so sánh (anh Long duyệt 26/11/2026)
-- Minh · 26/11/2026.
--   1. Thông báo: trong app + đẩy về điện thoại (Web Push, gửi bằng Edge Function whs-push).
--   2. Chấm chéo: bạn chơi cùng xác nhận điểm Junior / SNAG / Golf 3D; xác nhận xong là điểm được tính, admin chỉ xem khi có tranh chấp.
--      (Vòng sân thật đã có marker xác nhận từ migration 20261124000006.)
--   3. Tra cứu golfer theo mã VNC hoặc tên: người lớn xem đủ bốn chỉ số; trẻ em chỉ tìm đúng mã VNC, tên viết tắt, không có vòng chi tiết.
--   4. Thống kê nâng cao (không bắt buộc): driver vào fairway / lệch trái / phải / ngắn, OB, gậy phạt, số lần vào bunker,
--      on tiêu chuẩn (GIR), số gậy on, số putt – theo từng hố.
--   5. Dữ liệu biểu đồ tiến bộ cho phụ huynh: diễn biến các chỉ số + thống kê theo tháng.
--   6. Ban tổ chức giải nhập điểm hàng loạt (kiểm tra trước, rồi mới ghi).
--
-- Chỉ THÊM: bảng/hàm mới tiền tố whs_, thêm cột cho bảng whs_youth_rounds / whs_sim_rounds. Không sửa hàm cũ.
-- Chạy lại nhiều lần không lỗi.

begin;

insert into public.whs_settings (key, value, note) values
  ('peerAttestYouth', 'true', 'Junior / SNAG: bạn chơi xác nhận là điểm được tính, không chờ admin. false = vẫn chờ admin.'),
  ('peerAttestSim', 'true', 'Golf 3D: bạn chơi xác nhận là điểm được tính, không chờ admin phòng. false = vẫn chờ admin phòng.'),
  ('vapidPublicKey', '""', 'Khoá công khai VAPID cho thông báo đẩy (Web Push), do Edge Function whs-push tự tạo. Rỗng = chỉ thông báo trong app.'),
  ('lookupMinors', 'true', 'Cho tra cứu trẻ em bằng đúng mã VNC (chỉ hiện chỉ số, tên viết tắt). false = trẻ em không xuất hiện trong tra cứu.')
on conflict (key) do nothing;

-------------------------------------------------------------------------------
-- 0. Tài khoản nhận thông báo của một hội viên: tài khoản học viên + phụ huynh đang liên kết
-------------------------------------------------------------------------------
create or replace function public.whs_member_users(p_member uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select sa.user_id from public.whs_members m
    join public.student_accounts sa on sa.student_id = m.student_id and sa.is_active
   where m.id = p_member and sa.user_id is not null
  union
  select g.user_id from public.whs_members m
    join public.student_guardians sg on sg.student_id = m.student_id and sg.deleted_at is null and sg.status = 'active'
    join public.guardians g on g.id = sg.guardian_id and g.deleted_at is null
   where m.id = p_member and g.user_id is not null
$$;

-- Tên hiển thị cho tra cứu trẻ em: "Vũ Anh Khôi" → "V. A. Khôi"
create or replace function public.whs_short_name(p_name text) returns text
language sql immutable as $$
  select case when array_length(w, 1) is null then '' when array_length(w, 1) = 1 then w[1]
    else (select string_agg(left(x, 1) || '.', ' ') from unnest(w[1:array_length(w, 1) - 1]) x) || ' ' || w[array_length(w, 1)] end
  from (select regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+') as w) t
$$;

-------------------------------------------------------------------------------
-- 1. Thông báo
-------------------------------------------------------------------------------
create table if not exists public.whs_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid references public.whs_members(id) on delete cascade,
  kind text not null,                 -- app dựng câu theo kind + data (để dịch được); title/body dùng cho thông báo đẩy
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);
create index if not exists whs_notifications_user on public.whs_notifications (user_id, created_at desc);
create index if not exists whs_notifications_push on public.whs_notifications (created_at) where pushed_at is null;

-- Giá trị chỉ số đã báo gần nhất (để tính lại toàn bộ không gửi trùng)
create table if not exists public.whs_notif_state (
  member_id uuid not null references public.whs_members(id) on delete cascade,
  key text not null,                  -- 'whs' | 'junior' | 'snag' | 'sim:<hãng>'
  value numeric,
  updated_at timestamptz not null default now(),
  primary key (member_id, key)
);

create table if not exists public.whs_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  ua text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count int not null default 0
);
create index if not exists whs_push_subs_user on public.whs_push_subs (user_id);

-- Ghi thông báo cho mọi tài khoản của hội viên (trừ người đang thao tác)
create or replace function public.whs_notify(p_member uuid, p_kind text, p_title text, p_body text, p_data jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into whs_notifications (user_id, member_id, kind, title, body, data)
  select u, p_member, p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb)
  from whs_member_users(p_member) u
  where u is distinct from auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;

-- Chỉ số đổi → báo (chỉ khi khác giá trị đã báo lần trước)
create or replace function public.whs_notify_index(p_member uuid, p_key text, p_label text, p_value numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_old numeric; v_had boolean;
begin
  select value, true into v_old, v_had from whs_notif_state where member_id = p_member and key = p_key;
  if coalesce(v_had, false) and v_old is not distinct from p_value then return; end if;
  insert into whs_notif_state (member_id, key, value) values (p_member, p_key, p_value)
  on conflict (member_id, key) do update set value = excluded.value, updated_at = now();
  if p_value is null then return; end if;
  perform whs_notify(p_member, case when v_old is null then 'index_first' else 'index_change' end,
    case when v_old is null then p_label || ': đã có chỉ số ' || p_value else p_label || ': ' || v_old || ' → ' || p_value end,
    (select full_name from whs_members where id = p_member),
    jsonb_build_object('key', p_key, 'label', p_label, 'old', v_old, 'new', p_value));
end $$;

-- Lệnh tính lại có thể xoá rồi ghi lại cả lịch sử: xét theo cả câu lệnh, chỉ báo giá trị cuối cùng của mỗi golfer
create or replace function public.whs_trg_hi_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare x record; v numeric;
begin
  for x in select distinct member_id from new_rows loop
    select case when h.withdrawn then null else h.hi end into v from whs_hi_history h
     where h.member_id = x.member_id order by h.as_of desc limit 1;
    perform whs_notify_index(x.member_id, 'whs', 'Handicap Index', v);
  end loop;
  return null;
end $$;
drop trigger if exists whs_hi_history_notify on public.whs_hi_history;
drop trigger if exists whs_hi_history_notify_ins on public.whs_hi_history;
drop trigger if exists whs_hi_history_notify_upd on public.whs_hi_history;
create trigger whs_hi_history_notify_ins after insert on public.whs_hi_history
  referencing new table as new_rows for each statement execute function public.whs_trg_hi_history();
create trigger whs_hi_history_notify_upd after update on public.whs_hi_history
  referencing new table as new_rows for each statement execute function public.whs_trg_hi_history();

create or replace function public.whs_trg_youth_index() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform whs_notify_index(new.member_id, new.kind, case new.kind when 'junior' then 'Junior Handicap' else 'SNAG Handicap' end, new.idx);
  return null;
end $$;
drop trigger if exists whs_youth_index_notify on public.whs_youth_index;
create trigger whs_youth_index_notify after insert or update on public.whs_youth_index
  for each row execute function public.whs_trg_youth_index();

create or replace function public.whs_trg_sim_index() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform whs_notify_index(new.member_id, 'sim:' || new.brand, 'VNC Simulator Index (' || new.brand || ')', new.idx);
  return null;
end $$;
drop trigger if exists whs_sim_index_notify on public.whs_sim_index;
create trigger whs_sim_index_notify after insert or update on public.whs_sim_index
  for each row execute function public.whs_trg_sim_index();

-- Vòng sân thật: cần marker xác nhận / kết quả xác nhận
create or replace function public.whs_trg_rounds() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_course text;
begin
  if new.status is not distinct from old.status then return null; end if;
  select full_name into v_name from whs_members where id = new.member_id;
  select name into v_course from whs_courses where id = new.course_id;
  if new.status = 'submitted' and new.marker_member_id is not null then
    perform whs_notify(new.marker_member_id, 'attest_request', v_name || ' nhờ xác nhận điểm', v_course,
      jsonb_build_object('round', new.id, 'type', 'whs', 'golfer', v_name, 'course', v_course, 'date', new.played_on));
  elsif new.status in ('attested', 'disputed', 'rejected', 'void') then
    perform whs_notify(new.member_id, 'round_' || new.status,
      case new.status when 'attested' then 'Vòng đã được xác nhận' when 'disputed' then 'Marker không đồng ý điểm'
        when 'rejected' then 'Vòng bị từ chối' else 'Vòng bị huỷ' end, v_course,
      jsonb_build_object('round', new.id, 'type', 'whs', 'course', v_course, 'date', new.played_on));
  end if;
  return null;
end $$;
drop trigger if exists whs_rounds_notify on public.whs_rounds;
create trigger whs_rounds_notify after update of status on public.whs_rounds
  for each row execute function public.whs_trg_rounds();

-------------------------------------------------------------------------------
-- 2. Chấm chéo cho Junior / SNAG / Golf 3D
-------------------------------------------------------------------------------
alter table public.whs_youth_rounds add column if not exists attester_member_id uuid references public.whs_members(id);
alter table public.whs_youth_rounds add column if not exists attest_status text check (attest_status in ('requested', 'accepted', 'disputed'));
alter table public.whs_youth_rounds add column if not exists attested_at timestamptz;
alter table public.whs_youth_rounds add column if not exists attested_by uuid;
alter table public.whs_youth_rounds add column if not exists attest_note text;
alter table public.whs_youth_rounds add column if not exists import_id uuid;
create index if not exists whs_youth_rounds_attester on public.whs_youth_rounds (attester_member_id) where attest_status = 'requested';

alter table public.whs_sim_rounds add column if not exists attester_member_id uuid references public.whs_members(id);
alter table public.whs_sim_rounds add column if not exists attest_status text check (attest_status in ('requested', 'accepted', 'disputed'));
alter table public.whs_sim_rounds add column if not exists attested_at timestamptz;
alter table public.whs_sim_rounds add column if not exists attested_by uuid;
alter table public.whs_sim_rounds add column if not exists attest_note text;
create index if not exists whs_sim_rounds_attester on public.whs_sim_rounds (attester_member_id) where attest_status = 'requested';

alter table public.whs_rounds add column if not exists import_id uuid;

-- Tìm bạn chơi theo mã VNC trong cùng liên đoàn (kể cả hội viên đang chờ duyệt – trẻ em thường ở trạng thái này)
create or replace function public.whs_find_peer(p_fed text, p_code text) returns table (member_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select m.id, m.full_name from public.whs_members m join public.students s on s.id = m.student_id
  where auth.uid() is not null and m.federation_id = p_fed and m.status in ('active', 'pending')
    and upper(s.student_code) = upper(btrim(p_code))
$$;

-- Golfer (hoặc phụ huynh) nhờ một bạn chơi xác nhận vòng đang chờ. p_kind: 'youth' | 'sim'
create or replace function public.whs_peer_request(p_kind text, p_round uuid, p_attester uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_fed text; v_status text; v_has_scores boolean; a whs_members;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_kind = 'youth' then
    select member_id, federation_id, status, scores is not null into v_member, v_fed, v_status, v_has_scores
      from whs_youth_rounds where id = p_round for update;
    if not coalesce((whs_setting(v_fed, 'peerAttestYouth') #>> '{}')::boolean, true) then raise exception 'peer_disabled'; end if;
  elsif p_kind = 'sim' then
    select member_id, federation_id, status, true into v_member, v_fed, v_status, v_has_scores
      from whs_sim_rounds where id = p_round for update;
    if not coalesce((whs_setting(v_fed, 'peerAttestSim') #>> '{}')::boolean, true) then raise exception 'peer_disabled'; end if;
  else raise exception 'bad_kind'; end if;
  if v_member is null or not whs_can_act_for(v_member) then raise exception 'not_your_round'; end if;
  if v_status <> 'pending' then raise exception 'not_pending'; end if;
  if not v_has_scores then raise exception 'scores_required'; end if;
  select * into a from whs_members where id = p_attester and status in ('active', 'pending');
  if a.id is null or a.federation_id <> v_fed then raise exception 'peer_not_found'; end if;
  -- Không tự xác nhận: bạn chơi không được là chính golfer hay người cùng tài khoản (con / phụ huynh)
  if a.id = v_member or whs_can_act_for(a.id) then raise exception 'peer_cannot_be_self'; end if;
  if p_kind = 'youth' then
    update whs_youth_rounds set attester_member_id = a.id, attest_status = 'requested', attested_at = null, attested_by = null, attest_note = null
     where id = p_round;
  else
    update whs_sim_rounds set attester_member_id = a.id, attest_status = 'requested', attested_at = null, attested_by = null, attest_note = null
     where id = p_round;
    perform whs_sim_log(p_round, 'peer_request', null, jsonb_build_object('attester', a.id), null);
  end if;
  perform whs_notify(a.id, 'peer_request', (select full_name from whs_members where id = v_member) || ' nhờ xác nhận điểm', null,
    jsonb_build_object('round', p_round, 'type', p_kind, 'golfer', (select full_name from whs_members where id = v_member)));
end $$;

-- Bạn chơi xác nhận (điểm được tính luôn) hoặc không đồng ý (chuyển admin, bắt buộc lý do)
create or replace function public.whs_peer_attest(p_kind text, p_round uuid, p_accept boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_att uuid; v_status text; v_as text; v_brand text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_kind = 'youth' then
    select member_id, attester_member_id, status, attest_status into v_member, v_att, v_status, v_as
      from whs_youth_rounds where id = p_round for update;
  elsif p_kind = 'sim' then
    select member_id, attester_member_id, status, attest_status, brand into v_member, v_att, v_status, v_as, v_brand
      from whs_sim_rounds where id = p_round for update;
  else raise exception 'bad_kind'; end if;
  if v_att is null or not whs_can_act_for(v_att) then raise exception 'not_peer'; end if;
  if whs_can_act_for(v_member) then raise exception 'cannot_attest_own_round'; end if;
  if v_status <> 'pending' or v_as is distinct from 'requested' then raise exception 'not_pending'; end if;
  if not p_accept and coalesce(btrim(p_note), '') = '' then raise exception 'dispute_needs_reason'; end if;
  if p_kind = 'youth' then
    if p_accept then
      update whs_youth_rounds set status = 'confirmed', attest_status = 'accepted', attested_at = now(), attested_by = auth.uid(),
        attest_note = p_note, decided_by = auth.uid(), decided_at = now(), decision_note = 'Bạn chơi xác nhận' where id = p_round;
    else
      update whs_youth_rounds set attest_status = 'disputed', attested_at = now(), attested_by = auth.uid(), attest_note = p_note where id = p_round;
    end if;
  else
    if p_accept then
      update whs_sim_rounds set status = 'confirmed', attest_status = 'accepted', attested_at = now(), attested_by = auth.uid(),
        attest_note = p_note, decided_by = auth.uid(), decided_at = now(), decision_note = 'Bạn chơi xác nhận' where id = p_round;
      perform whs_sim_log(p_round, 'peer_confirm', null, null, p_note);
      perform whs_sim_recompute(v_member, v_brand);
    else
      update whs_sim_rounds set attest_status = 'disputed', attested_at = now(), attested_by = auth.uid(), attest_note = p_note,
        flags = case when 'peer_disputed' = any(flags) then flags else array_append(flags, 'peer_disputed') end where id = p_round;
      perform whs_sim_log(p_round, 'peer_dispute', null, null, p_note);
    end if;
  end if;
end $$;

-- Thông báo kết quả cho golfer khi vòng Junior / SNAG / Golf 3D được xác nhận hoặc từ chối
create or replace function public.whs_trg_youth_rounds() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_label text := case new.kind when 'junior' then 'Junior' else 'SNAG' end;
begin
  if new.status is distinct from old.status and new.status in ('confirmed', 'rejected') then
    perform whs_notify(new.member_id, 'youth_' || new.status,
      v_label || case new.status when 'confirmed' then ': vòng đã được xác nhận' else ': vòng bị từ chối' end,
      coalesce(new.attest_note, new.decision_note),
      jsonb_build_object('round', new.id, 'type', 'youth', 'kind', new.kind, 'date', new.played_on));
  elsif new.attest_status = 'disputed' and old.attest_status is distinct from 'disputed' then
    perform whs_notify(new.member_id, 'peer_disputed', v_label || ': bạn chơi không đồng ý điểm', new.attest_note,
      jsonb_build_object('round', new.id, 'type', 'youth', 'kind', new.kind, 'date', new.played_on));
  end if;
  return null;
end $$;
drop trigger if exists whs_youth_rounds_notify on public.whs_youth_rounds;
create trigger whs_youth_rounds_notify after update on public.whs_youth_rounds
  for each row execute function public.whs_trg_youth_rounds();

create or replace function public.whs_trg_sim_rounds() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('confirmed', 'rejected', 'void') then
    perform whs_notify(new.member_id, 'sim_' || new.status,
      'Golf 3D' || case new.status when 'confirmed' then ': vòng đã được xác nhận' when 'rejected' then ': vòng bị từ chối' else ': vòng bị huỷ' end,
      coalesce(new.decision_note, new.attest_note),
      jsonb_build_object('round', new.id, 'type', 'sim', 'brand', new.brand, 'date', new.played_on));
  elsif new.attest_status = 'disputed' and old.attest_status is distinct from 'disputed' then
    perform whs_notify(new.member_id, 'peer_disputed', 'Golf 3D: bạn chơi không đồng ý điểm', new.attest_note,
      jsonb_build_object('round', new.id, 'type', 'sim', 'brand', new.brand, 'date', new.played_on));
  end if;
  return null;
end $$;
drop trigger if exists whs_sim_rounds_notify on public.whs_sim_rounds;
create trigger whs_sim_rounds_notify after update on public.whs_sim_rounds
  for each row execute function public.whs_trg_sim_rounds();

-- Hàng chờ "Nhờ tôi xác nhận" (Junior / SNAG / Golf 3D) của các hồ sơ người đăng nhập quản lý
create or replace function public.whs_peer_queue() returns table (
  kind text, round_id uuid, sub text, golfer text, played_on date, ref_name text, holes text, scores jsonb, par jsonb, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select 'youth', r.id, r.kind, m.full_name, r.played_on, coalesce(t.name, l.name),
         jsonb_array_length(r.scores)::text, r.scores,
         coalesce(to_jsonb(t.par), (select jsonb_agg(h -> 'par') from jsonb_array_elements(l.holes) h)), r.created_at
  from whs_youth_rounds r
  join whs_members m on m.id = r.member_id
  left join whs_youth_tees t on t.id = r.tee_id
  left join whs_youth_layouts l on l.id = r.layout_id
  where auth.uid() is not null and r.status = 'pending' and r.attest_status = 'requested'
    and r.attester_member_id in (select x.id from whs_members x where x.student_id in (select whs_my_students()))
  union all
  select 'sim', r.id, r.brand, m.full_name, r.played_on, c.name || ' · ' || c.tee_name, r.holes, to_jsonb(r.gross),
         to_jsonb(case when r.holes = 'B' and c.holes = 18 then c.par[10:18] when r.holes = 'F' and c.holes = 18 then c.par[1:9] else c.par end),
         r.created_at
  from whs_sim_rounds r
  join whs_members m on m.id = r.member_id
  join whs_sim_courses c on c.id = r.course_id
  where auth.uid() is not null and r.status = 'pending' and r.attest_status = 'requested'
    and r.attester_member_id in (select x.id from whs_members x where x.student_id in (select whs_my_students()))
  order by 10
$$;

-------------------------------------------------------------------------------
-- 3. Tra cứu golfer
-------------------------------------------------------------------------------
create or replace function public.whs_lookup_plus(p_q text) returns table (
  member_id uuid, full_name text, vnc_code text, federation_id text, club text, is_minor boolean,
  hi numeric, hi_as_of date, junior numeric, snag numeric, sims jsonb, recent jsonb)
language sql stable security definer set search_path = public as $$
  with q as (select btrim(coalesce(p_q, '')) as q),
  cand as (
    select m.*, s.student_code from whs_members m join students s on s.id = m.student_id, q
    where length(q.q) >= 2 and (
      -- Người lớn: theo tên hoặc mã, đang hoạt động, cho phép tra cứu
      (not m.is_minor and m.public_lookup and m.status = 'active'
        and (m.full_name ilike '%' || q.q || '%' or upper(s.student_code) = upper(q.q)))
      -- Trẻ em: chỉ đúng mã VNC, người tra phải đăng nhập, liên đoàn cho phép
      or (m.is_minor and m.status in ('active', 'pending') and auth.uid() is not null
        and upper(s.student_code) = upper(q.q)
        and coalesce((whs_setting(m.federation_id, 'lookupMinors') #>> '{}')::boolean, true)))
    order by m.full_name limit 30)
  select c.id, case when c.is_minor then whs_short_name(c.full_name) else c.full_name end, c.student_code, c.federation_id,
    case when c.is_minor then null else cl.name end, c.is_minor,
    h.hi, h.as_of,
    (select idx from whs_youth_index y where y.member_id = c.id and y.kind = 'junior'),
    (select idx from whs_youth_index y where y.member_id = c.id and y.kind = 'snag'),
    coalesce((select jsonb_agg(jsonb_build_object('brand', si.brand, 'idx', si.idx, 'official', si.official) order by si.brand)
              from whs_sim_index si where si.member_id = c.id and si.idx is not null), '[]'::jsonb),
    case when c.is_minor then '[]'::jsonb else coalesce((
      select jsonb_agg(x order by x ->> 'date' desc) from (
        select jsonb_build_object('date', r.played_on, 'course', co.name, 'holes', r.holes, 'diff', rr.diff) as x
        from whs_rounds r join whs_round_results rr on rr.round_id = r.id and rr.ok
        left join whs_courses co on co.id = r.course_id
        where r.member_id = c.id and r.status = 'attested' order by r.played_on desc limit 5) z), '[]'::jsonb) end
  from cand c
  left join whs_clubs cl on cl.id = c.home_club_id
  left join lateral (select hi, as_of from whs_hi_history x where x.member_id = c.id and not x.withdrawn order by as_of desc limit 1) h on true
$$;

-------------------------------------------------------------------------------
-- 4. Thống kê nâng cao theo từng hố (không bắt buộc, không ảnh hưởng chỉ số)
--    stats: mảng đúng số hố của vòng, mỗi phần tử null hoặc
--    {"fw": "hit"|"left"|"right"|"short", "gir": true|false, "on": 1–9 (số gậy on green), "putts": 0–9,
--     "pen": 0–9 (gậy phạt), "ob": 0–9, "bunker": 0–9 (số lần vào bunker)}
-------------------------------------------------------------------------------
create table if not exists public.whs_round_stats (
  kind text not null check (kind in ('whs', 'junior', 'snag', 'sim')),
  round_id uuid not null,
  member_id uuid not null references public.whs_members(id) on delete cascade,
  played_on date not null,
  stats jsonb not null,
  summary jsonb not null,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (kind, round_id)
);
create index if not exists whs_round_stats_member on public.whs_round_stats (member_id, played_on);

create or replace function public.whs_stats_summary(p_stats jsonb, p_par jsonb) returns jsonb
language plpgsql immutable as $$
declare e jsonb; i int := 0; par int;
  n int := 0; fw_att int := 0; fw_hit int := 0; fl int := 0; fr int := 0; fs int := 0;
  gir_att int := 0; gir int := 0; putts int := 0; putt_h int := 0; pen int := 0; ob int := 0; bunker int := 0;
  on_sum int := 0; on_h int := 0;
begin
  for e in select value from jsonb_array_elements(p_stats) loop
    i := i + 1;
    continue when jsonb_typeof(e) <> 'object';
    n := n + 1;
    par := case when p_par is not null and jsonb_typeof(p_par -> (i - 1)) = 'number' then (p_par ->> (i - 1))::int end;
    if e ? 'fw' and jsonb_typeof(e -> 'fw') = 'string' and coalesce(par, 4) > 3 then
      fw_att := fw_att + 1;
      case e ->> 'fw' when 'hit' then fw_hit := fw_hit + 1; when 'left' then fl := fl + 1; when 'right' then fr := fr + 1; else fs := fs + 1; end case;
    end if;
    if jsonb_typeof(e -> 'gir') = 'boolean' then gir_att := gir_att + 1; if (e ->> 'gir')::boolean then gir := gir + 1; end if; end if;
    if jsonb_typeof(e -> 'putts') = 'number' then putt_h := putt_h + 1; putts := putts + (e ->> 'putts')::int; end if;
    if jsonb_typeof(e -> 'pen') = 'number' then pen := pen + (e ->> 'pen')::int; end if;
    if jsonb_typeof(e -> 'ob') = 'number' then ob := ob + (e ->> 'ob')::int; end if;
    if jsonb_typeof(e -> 'bunker') = 'number' then bunker := bunker + (e ->> 'bunker')::int; end if;
    if jsonb_typeof(e -> 'on') = 'number' then on_h := on_h + 1; on_sum := on_sum + (e ->> 'on')::int; end if;
  end loop;
  return jsonb_build_object('holes', n, 'fw_att', fw_att, 'fw_hit', fw_hit, 'fw_left', fl, 'fw_right', fr, 'fw_short', fs,
    'gir_att', gir_att, 'gir', gir, 'putts', putts, 'putt_holes', putt_h, 'pen', pen, 'ob', ob, 'bunker', bunker,
    'on_sum', on_sum, 'on_holes', on_h);
end $$;

create or replace function public.whs_set_round_stats(p_kind text, p_round uuid, p_stats jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_date date; v_n int; v_par jsonb; e jsonb; k text; v_sum jsonb;
  cs whs_courses; t whs_youth_tees; l whs_youth_layouts; sc whs_sim_courses; v_holes text; v_tee text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_kind = 'whs' then
    select member_id, played_on, holes, course_id, tee_key into v_member, v_date, v_holes, k, v_tee from whs_rounds where id = p_round;
    v_n := case when v_holes = '18' then 18 else 9 end;
    select * into cs from whs_courses where id = k;
    v_par := case when jsonb_typeof(cs.data -> 'par') = 'array' then cs.data -> 'par' end;
    if v_par is not null and jsonb_typeof(v_par) = 'array' and jsonb_array_length(v_par) = 18 and v_n = 9 then
      v_par := (select jsonb_agg(x order by o) from jsonb_array_elements(v_par) with ordinality a(x, o)
                where (v_holes = 'F' and o <= 9) or (v_holes = 'B' and o > 9));
    end if;
  elsif p_kind in ('junior', 'snag') then
    select member_id, played_on into v_member, v_date from whs_youth_rounds where id = p_round and kind = p_kind;
    if p_kind = 'junior' then
      select t2.* into t from whs_youth_tees t2 join whs_youth_rounds r on r.tee_id = t2.id where r.id = p_round;
      v_n := cardinality(t.yd); v_par := to_jsonb(t.par);
    else
      select l2.* into l from whs_youth_layouts l2 join whs_youth_rounds r on r.layout_id = l2.id where r.id = p_round;
      v_n := jsonb_array_length(l.holes); v_par := (select jsonb_agg(h -> 'par') from jsonb_array_elements(l.holes) h);
    end if;
  elsif p_kind = 'sim' then
    select member_id, played_on, holes into v_member, v_date, v_holes from whs_sim_rounds where id = p_round;
    select c.* into sc from whs_sim_courses c join whs_sim_rounds r on r.course_id = c.id where r.id = p_round;
    v_n := case when v_holes = '18' then 18 else 9 end;
    v_par := to_jsonb(case when sc.holes = 18 and v_holes = 'F' then sc.par[1:9] when sc.holes = 18 and v_holes = 'B' then sc.par[10:18] else sc.par end);
  else raise exception 'bad_kind'; end if;
  if v_member is null then raise exception 'round_not_found'; end if;
  if not whs_can_act_for(v_member) then raise exception 'not_your_round'; end if;
  if p_stats is null or jsonb_typeof(p_stats) = 'null' then
    delete from whs_round_stats where kind = p_kind and round_id = p_round;
    return null;
  end if;
  if jsonb_typeof(p_stats) <> 'array' or jsonb_array_length(p_stats) <> v_n then raise exception 'stats_length'; end if;
  for e in select value from jsonb_array_elements(p_stats) loop
    continue when jsonb_typeof(e) = 'null';
    if jsonb_typeof(e) <> 'object' then raise exception 'stats_bad_value'; end if;
    for k in select jsonb_object_keys(e) loop
      if k not in ('fw', 'gir', 'on', 'putts', 'pen', 'ob', 'bunker') then raise exception 'stats_bad_key'; end if;
    end loop;
    if e ? 'fw' and jsonb_typeof(e -> 'fw') <> 'null' and (e ->> 'fw') not in ('hit', 'left', 'right', 'short') then raise exception 'stats_bad_value'; end if;
    if e ? 'gir' and jsonb_typeof(e -> 'gir') not in ('boolean', 'null') then raise exception 'stats_bad_value'; end if;
    if e ? 'on' and jsonb_typeof(e -> 'on') <> 'null' and (jsonb_typeof(e -> 'on') <> 'number'
       or (e ->> 'on')::numeric not between 1 and 9 or (e ->> 'on')::numeric <> trunc((e ->> 'on')::numeric)) then
      raise exception 'stats_bad_value';
    end if;
    foreach k in array array['putts', 'pen', 'ob', 'bunker'] loop
      if e ? k and jsonb_typeof(e -> k) <> 'null' and (jsonb_typeof(e -> k) <> 'number'
         or (e ->> k)::numeric not between 0 and 9 or (e ->> k)::numeric <> trunc((e ->> k)::numeric)) then
        raise exception 'stats_bad_value';
      end if;
    end loop;
  end loop;
  v_sum := whs_stats_summary(p_stats, v_par);
  insert into whs_round_stats (kind, round_id, member_id, played_on, stats, summary)
  values (p_kind, p_round, v_member, v_date, p_stats, v_sum)
  on conflict (kind, round_id) do update set stats = excluded.stats, summary = excluded.summary, played_on = excluded.played_on,
    updated_by = auth.uid(), updated_at = now();
  return v_sum;
end $$;

-------------------------------------------------------------------------------
-- 5. Dữ liệu biểu đồ tiến bộ (phụ huynh, HLV, golfer)
-------------------------------------------------------------------------------
create or replace function public.whs_progress(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if p_member is null or not whs_can_see_member(p_member) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'whs', coalesce((select jsonb_agg(jsonb_build_object('d', as_of, 'v', hi) order by as_of)
                     from whs_hi_history where member_id = p_member and hi is not null and not withdrawn), '[]'::jsonb),
    'junior', coalesce((select jsonb_agg(jsonb_build_object('d', r.played_on, 'v', x.idx_after) order by r.played_on, r.created_at)
                     from whs_youth_results x join whs_youth_rounds r on r.id = x.round_id
                     where x.member_id = p_member and x.kind = 'junior' and x.ok and x.idx_after is not null), '[]'::jsonb),
    'snag', coalesce((select jsonb_agg(jsonb_build_object('d', r.played_on, 'v', x.idx_after) order by r.played_on, r.created_at)
                     from whs_youth_results x join whs_youth_rounds r on r.id = x.round_id
                     where x.member_id = p_member and x.kind = 'snag' and x.ok and x.idx_after is not null), '[]'::jsonb),
    'sim', coalesce((select jsonb_object_agg(brand, pts) from (
                     select r.brand, jsonb_agg(jsonb_build_object('d', r.played_on, 'v', x.idx_after) order by r.played_on, r.created_at) pts
                     from whs_sim_results x join whs_sim_rounds r on r.id = x.round_id
                     where x.member_id = p_member and x.idx_after is not null group by r.brand) b), '{}'::jsonb),
    'stats', coalesce((select jsonb_agg(m order by m ->> 'month') from (
                     select jsonb_build_object('month', to_char(played_on, 'YYYY-MM'), 'rounds', count(*),
                       'holes', sum((summary ->> 'holes')::int),
                       'fw_att', sum((summary ->> 'fw_att')::int), 'fw_hit', sum((summary ->> 'fw_hit')::int),
                       'fw_left', sum((summary ->> 'fw_left')::int), 'fw_right', sum((summary ->> 'fw_right')::int),
                       'fw_short', sum((summary ->> 'fw_short')::int),
                       'gir_att', sum((summary ->> 'gir_att')::int), 'gir', sum((summary ->> 'gir')::int),
                       'putts', sum((summary ->> 'putts')::int), 'putt_holes', sum((summary ->> 'putt_holes')::int),
                       'pen', sum((summary ->> 'pen')::int), 'ob', sum((summary ->> 'ob')::int),
                       'bunker', sum(coalesce((summary ->> 'bunker')::int, 0)),
                       'on_sum', sum(coalesce((summary ->> 'on_sum')::int, 0)), 'on_holes', sum(coalesce((summary ->> 'on_holes')::int, 0))) m
                     from whs_round_stats where member_id = p_member group by to_char(played_on, 'YYYY-MM')) z), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-------------------------------------------------------------------------------
-- 6. Ban tổ chức giải nhập điểm hàng loạt
--    p_rows: [{line, code, scores:[..], ref?, date?, holes?}] – ref/date/holes bỏ trống thì lấy mặc định của lần nhập
--    p_kind: 'whs' (ref = "mã sân|tee") | 'junior' (ref = mã tee junior) | 'snag' (ref = mã layout SNAG)
--    p_commit = false: chỉ kiểm tra, không ghi gì.
-------------------------------------------------------------------------------
create table if not exists public.whs_imports (
  id uuid primary key default gen_random_uuid(),
  federation_id text not null references public.whs_federations(id),
  kind text not null check (kind in ('whs', 'junior', 'snag')),
  event_name text not null check (char_length(event_name) between 2 and 200),
  played_on date,
  n_ok int not null default 0, n_err int not null default 0,
  report jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.whs_bulk_import(p_fed text, p_kind text, p_event text, p_date date, p_ref text, p_holes text,
  p_rows jsonb, p_commit boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb; v_line int := 0; v_code text; v_ref text; v_date date; v_holes text; v_scores jsonb; v_gross int[];
  m whs_members; v_err text; v_id uuid; v_rep jsonb := '[]'::jsonb; v_ok int := 0; v_bad int := 0; v_imp uuid; v_n int;
  v_course text; v_tee text; v_seen text[] := '{}';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not whs_is_fed_staff(p_fed) then raise exception 'forbidden'; end if;
  if p_kind not in ('whs', 'junior', 'snag') then raise exception 'bad_kind'; end if;
  if coalesce(char_length(btrim(p_event)), 0) < 2 then raise exception 'event_required'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'rows_required'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'too_many_rows'; end if;
  if p_commit then
    insert into whs_imports (federation_id, kind, event_name, played_on) values (p_fed, p_kind, btrim(p_event), p_date) returning id into v_imp;
  end if;

  for e in select value from jsonb_array_elements(p_rows) loop
    v_line := v_line + 1; v_err := null; v_id := null; m := null;
    v_code := upper(btrim(coalesce(e ->> 'code', '')));
    v_ref := coalesce(nullif(btrim(e ->> 'ref'), ''), p_ref);
    v_holes := coalesce(nullif(e ->> 'holes', ''), p_holes, '18');
    v_scores := e -> 'scores';
    v_date := p_date;
    begin
      if nullif(btrim(e ->> 'date'), '') is not null then v_date := (e ->> 'date')::date; end if;
      if v_code = '' then raise exception 'code_required'; end if;
      if v_date is null or v_date > current_date + 1 then raise exception 'bad_date'; end if;
      if v_ref is null then raise exception 'ref_required'; end if;
      select x.* into m from whs_members x join students s on s.id = x.student_id
       where x.federation_id = p_fed and upper(s.student_code) = v_code;
      if m.id is null then raise exception 'member_not_found'; end if;
      if v_code || '|' || v_ref || '|' || v_date = any(v_seen) then raise exception 'duplicate_in_file'; end if;
      v_seen := v_seen || (v_code || '|' || v_ref || '|' || v_date);
      if p_kind = 'whs' then
        if m.status <> 'active' then raise exception 'not_active_member'; end if;
        v_course := split_part(v_ref, '|', 1); v_tee := split_part(v_ref, '|', 2);
        if not exists (select 1 from whs_courses where id = v_course and (data -> 'tees') ? v_tee) then raise exception 'course_or_tee_not_found'; end if;
        if v_holes not in ('18', 'F', 'B') then raise exception 'bad_holes'; end if;
        if jsonb_typeof(v_scores) <> 'array' then raise exception 'scores_required'; end if;
        select array_agg(case when jsonb_typeof(x) = 'number' then (x #>> '{}')::int end order by o) into v_gross
          from jsonb_array_elements(v_scores) with ordinality a(x, o);
        perform whs_check_gross(v_holes, v_gross);
        if exists (select 1 from whs_rounds r where r.member_id = m.id and r.course_id = v_course and r.played_on = v_date
                   and r.gross = v_gross and r.status not in ('cancelled', 'rejected', 'void')) then raise exception 'duplicate_round'; end if;
        if p_commit then
          insert into whs_rounds (member_id, federation_id, course_id, tee_key, played_on, holes, format, type, status,
            gross, submitted_at, attested_at, attested_by, note, entered_by, import_id)
          values (m.id, m.federation_id, v_course, v_tee, v_date, v_holes, 'stroke', 'competition', 'attested',
            v_gross, now(), now(), auth.uid(), btrim(p_event), auth.uid(), v_imp)
          returning id into v_id;
          perform whs_log(v_id, 'bulk_import', null, jsonb_build_object('gross', v_gross, 'event', btrim(p_event), 'import', v_imp));
        end if;
      else
        if m.status not in ('active', 'pending') then raise exception 'member_inactive'; end if;
        v_n := whs_youth_ref_holes(p_kind, v_ref, p_fed);
        perform whs_youth_check_scores(p_kind, v_n, v_scores);
        if exists (select 1 from whs_youth_rounds r where r.member_id = m.id and r.kind = p_kind and r.played_on = v_date
                   and coalesce(r.tee_id, r.layout_id) = v_ref and r.scores = v_scores and r.status <> 'rejected') then
          raise exception 'duplicate_round';
        end if;
        if p_commit then
          insert into whs_youth_rounds (member_id, federation_id, kind, layout_id, tee_id, played_on, round_type, scores, via, status,
            decided_by, decided_at, decision_note, import_id)
          values (m.id, m.federation_id, p_kind, case when p_kind = 'snag' then v_ref end, case when p_kind = 'junior' then v_ref end,
            v_date, 'event', v_scores, 'admin', 'confirmed', auth.uid(), now(), btrim(p_event), v_imp)
          returning id into v_id;
        end if;
      end if;
      v_ok := v_ok + 1;
    exception when others then
      v_err := sqlerrm; v_bad := v_bad + 1;
    end;
    v_rep := v_rep || jsonb_build_object('line', coalesce((e ->> 'line')::int, v_line), 'code', v_code,
      'name', m.full_name, 'ok', v_err is null, 'error', v_err, 'round', v_id);
  end loop;

  if p_commit then
    update whs_imports set n_ok = v_ok, n_err = v_bad, report = v_rep where id = v_imp;
  end if;
  return jsonb_build_object('import', v_imp, 'ok', v_ok, 'err', v_bad, 'rows', v_rep, 'committed', p_commit);
end $$;

-------------------------------------------------------------------------------
-- 7. Thông báo: đọc, đánh dấu đã đọc, đăng ký nhận thông báo đẩy
-------------------------------------------------------------------------------
create or replace function public.whs_notif_list(p_limit int default 40) returns setof public.whs_notifications
language sql stable security definer set search_path = public as $$
  select * from whs_notifications where user_id = auth.uid() order by created_at desc, id desc limit least(greatest(coalesce(p_limit, 40), 1), 200)
$$;

create or replace function public.whs_notif_read(p_ids bigint[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update whs_notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.whs_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_endpoint !~ '^https://' then raise exception 'bad_endpoint'; end if;
  insert into whs_push_subs (user_id, endpoint, p256dh, auth, ua) values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_ua, 300))
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, fail_count = 0;
end $$;

create or replace function public.whs_push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from whs_push_subs where endpoint = p_endpoint and user_id = auth.uid()
$$;

-------------------------------------------------------------------------------
-- 7b. Khoá cho thông báo đẩy – tạo và giữ trên máy chủ, không ai phải gõ tay
--     cron_key: khoá ngẫu nhiên tạo ngay tại đây; lịch chạy đọc khoá từ bảng nên không lộ trong lệnh.
--     VAPID: Edge Function whs-push tự tạo cặp khoá ở lần chạy đầu rồi lưu lại; khoá công khai chép sang whs_settings.
--     Chỉ service_role (Edge Function) và chủ cơ sở dữ liệu đọc được bảng này.
-------------------------------------------------------------------------------
create table if not exists public.whs_push_keys (
  id int primary key default 1 check (id = 1),
  cron_key text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  vapid_public text,
  vapid_private text,
  created_at timestamptz not null default now()
);
insert into public.whs_push_keys (id) values (1) on conflict (id) do nothing;

create or replace function public.whs_push_check(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(length(p_key) >= 32 and p_key = (select cron_key from whs_push_keys where id = 1), false)
$$;

create or replace function public.whs_push_vapid() returns table (vapid_public text, vapid_private text)
language sql stable security definer set search_path = public as $$
  select vapid_public, vapid_private from whs_push_keys where id = 1
$$;

-- Ghi cặp khoá VAPID một lần (lần sau bỏ qua nếu đã có); khoá công khai cho app đăng ký thông báo
create or replace function public.whs_push_set_vapid(p_public text, p_private text) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  update whs_push_keys set vapid_public = p_public, vapid_private = p_private where id = 1 and vapid_public is null;
  select vapid_public into v from whs_push_keys where id = 1;
  insert into whs_settings (key, value, note) values ('vapidPublicKey', to_jsonb(v), 'Khoá công khai VAPID cho thông báo đẩy (Edge Function whs-push tự tạo).')
  on conflict (key) do update set value = to_jsonb(v), updated_at = now();
  return v;
end $$;

-- Đặt lịch gọi whs-push mỗi phút (cần pg_cron + pg_net). Chủ cơ sở dữ liệu chạy một lần:
--   select public.whs_push_schedule('https://<project-ref>.supabase.co/functions/v1/whs-push');
create or replace function public.whs_push_schedule(p_url text) returns text
language plpgsql security definer set search_path = public as $$
declare v_cmd text;
begin
  if to_regnamespace('cron') is null or to_regnamespace('net') is null then raise exception 'need_pg_cron_and_pg_net'; end if;
  if p_url !~ '^https://[a-z0-9.-]+/functions/v1/whs-push$' then raise exception 'bad_url'; end if;
  v_cmd := format($c$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-key', (select cron_key from public.whs_push_keys where id = 1)), body := '{}'::jsonb, timeout_milliseconds := 20000)$c$, p_url);
  execute 'select cron.schedule($1, $2, $3)' using 'whs-push', '* * * * *', v_cmd;
  return 'scheduled';
end $$;

-------------------------------------------------------------------------------
-- 8. RLS và quyền
-------------------------------------------------------------------------------
alter table public.whs_notifications enable row level security;
alter table public.whs_notif_state enable row level security;
alter table public.whs_push_subs enable row level security;
alter table public.whs_round_stats enable row level security;
alter table public.whs_imports enable row level security;
alter table public.whs_push_keys enable row level security;

drop policy if exists whs_notif_own on public.whs_notifications;
create policy whs_notif_own on public.whs_notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists whs_push_own on public.whs_push_subs;
create policy whs_push_own on public.whs_push_subs for select to authenticated using (user_id = auth.uid());
drop policy if exists whs_stats_read on public.whs_round_stats;
create policy whs_stats_read on public.whs_round_stats for select to authenticated using (public.whs_can_see_member(member_id));
drop policy if exists whs_imports_read on public.whs_imports;
create policy whs_imports_read on public.whs_imports for select to authenticated using (public.whs_is_fed_staff(federation_id));

-- Người bạn chơi được nhờ xác nhận xem được vòng (cột tên golfer lấy qua whs_peer_queue)
drop policy if exists whs_yround_peer_read on public.whs_youth_rounds;
create policy whs_yround_peer_read on public.whs_youth_rounds for select to authenticated
  using (attester_member_id is not null and public.whs_can_act_for(attester_member_id));
drop policy if exists whs_sim_round_peer_read on public.whs_sim_rounds;
create policy whs_sim_round_peer_read on public.whs_sim_rounds for select to authenticated
  using (attester_member_id is not null and public.whs_can_act_for(attester_member_id));

revoke all on public.whs_notifications, public.whs_notif_state, public.whs_push_subs, public.whs_round_stats, public.whs_imports
  from anon, authenticated;
grant select on public.whs_notifications, public.whs_push_subs, public.whs_round_stats, public.whs_imports to authenticated;
grant all on public.whs_notifications, public.whs_notif_state, public.whs_push_subs, public.whs_round_stats, public.whs_imports to service_role;
revoke all on public.whs_push_keys from anon, authenticated, service_role;
revoke execute on function public.whs_push_check(text), public.whs_push_vapid(), public.whs_push_set_vapid(text, text),
  public.whs_push_schedule(text) from public, anon, authenticated;
revoke execute on function public.whs_push_schedule(text) from service_role;
grant execute on function public.whs_push_check(text), public.whs_push_vapid(), public.whs_push_set_vapid(text, text) to service_role;

-- Hàm nội bộ
revoke execute on function public.whs_member_users(uuid), public.whs_notify(uuid, text, text, text, jsonb),
  public.whs_notify_index(uuid, text, text, numeric), public.whs_trg_hi_history(), public.whs_trg_youth_index(),
  public.whs_trg_sim_index(), public.whs_trg_rounds(), public.whs_trg_youth_rounds(), public.whs_trg_sim_rounds()
  from public, anon, authenticated;
grant execute on function public.whs_member_users(uuid), public.whs_notify(uuid, text, text, text, jsonb) to service_role;
-- Hàm app gọi (lookup mở cho khách chưa đăng nhập: chỉ trả người lớn đã cho phép tra cứu)
revoke execute on function public.whs_find_peer(text, text), public.whs_peer_request(text, uuid, uuid),
  public.whs_peer_attest(text, uuid, boolean, text), public.whs_peer_queue(), public.whs_set_round_stats(text, uuid, jsonb),
  public.whs_progress(uuid), public.whs_bulk_import(text, text, text, date, text, text, jsonb, boolean),
  public.whs_notif_list(int), public.whs_notif_read(bigint[]), public.whs_push_subscribe(text, text, text, text),
  public.whs_push_unsubscribe(text) from public, anon;
grant execute on function public.whs_find_peer(text, text), public.whs_peer_request(text, uuid, uuid),
  public.whs_peer_attest(text, uuid, boolean, text), public.whs_peer_queue(), public.whs_set_round_stats(text, uuid, jsonb),
  public.whs_progress(uuid), public.whs_bulk_import(text, text, text, date, text, text, jsonb, boolean),
  public.whs_notif_list(int), public.whs_notif_read(bigint[]), public.whs_push_subscribe(text, text, text, text),
  public.whs_push_unsubscribe(text) to authenticated;
grant execute on function public.whs_lookup_plus(text), public.whs_short_name(text), public.whs_stats_summary(jsonb, jsonb)
  to anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261126000001', 'whs_plus') on conflict (version) do nothing;

commit;
