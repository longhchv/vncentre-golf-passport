-- SNAG Handicap từ kết quả SNAG Golf League (thiết kế "Handicap trẻ em & SNAG Golf", anh Long duyệt 23–24/11/2026).
-- Chỉ số nội bộ VN Centre theo nguyên lý WHS – KHÔNG phải WHS Handicap Index.
--
-- Cách tính (khớp hàm snagProcess của app Handicap, hdcp.vncentre.net):
--   • Mỗi chặng × mỗi bảng là một layout riêng. Điểm dùng to_par (gậy so với par) – kết quả nhập nhanh không có điểm từng hố.
--   • Rating của bảng (so với par) lấy từ "người neo" – các bạn đã có SNAG Handicap từ 3 vòng:
--       rating ngụ ý = to_par − (handicap + 1,5) × số hố / 9; ≥ 5 neo lấy trung vị, ít hơn thì kéo về par.
--   • Differential = (to_par − rating) × 9 / số hố (quy về 9 hố). Số hố lấy từ tournaments.holes, trống thì mặc định 3.
--   • Handicap = trung bình differential tốt nhất trong 10 vòng gần nhất (1–3 vòng lấy 1, 4–5 lấy 2, 6–7 lấy 3, 8–10 lấy 4),
--     có handicap khi tổng số hố ≥ 6; điểm đặc biệt: tốt hơn handicap ≥ 4 → −1, ≥ 6 → −2; tối đa 36,0.
-- Tự tính lại mỗi khi tournament_results thay đổi (lỗi tính không chặn việc ghi kết quả).

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('snag_handicap.default_holes', '3', 'Số hố mặc định của một chặng SNAG League khi chặng chưa ghi số hố', 'Default holes of a SNAG League stage when not recorded', false),
  ('snag_handicap.min_holes', '6', 'Tổng số hố tối thiểu để có SNAG Handicap (6 hoặc 9)', 'Minimum total holes to have a SNAG Handicap (6 or 9)', true)
on conflict do nothing;

create table if not exists public.snag_handicaps (
  student_id uuid primary key references public.students(id) on delete cascade,
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  idx numeric(4,1),                       -- null = chưa đủ số hố
  n_rounds int not null default 0,
  holes int not null default 0,
  need_holes int not null default 0,
  as_of date,
  history jsonb not null default '[]',    -- [{date, idx}]
  rounds jsonb not null default '[]',     -- [{stage_no, played_on, group, holes, to_par, rating, diff, esr, idx_after}]
  computed_at timestamptz not null default now()
);
alter table public.snag_handicaps enable row level security;   -- không có policy: chỉ đọc qua hàm snag_handicap_student
revoke all on public.snag_handicaps from anon, authenticated;
grant all on public.snag_handicaps to service_role;

-- Làm tròn 1 chữ số kiểu WHS (nửa lên, kể cả số âm) – giống r1() của engine
create or replace function public.snag_r1(x numeric) returns numeric language sql immutable as $$
  select floor(x * 10 + 0.5) / 10
$$;

create or replace function public.snag_handicap_recompute() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_off constant numeric := 1.5; full_anchors constant int := 5; anchor_min constant int := 3; win constant int := 10;
  min_holes int; def_holes int;
  t record; g record; r record; s record;
  implied numeric[]; m int; med numeric; rating numeric; d numeric; esr int; k int; v_idx numeric; n_t int := 0; n_r int := 0;
  ent jsonb; best numeric[];
begin
  select coalesce((select (value #>> '{}')::int from app_settings where key = 'snag_handicap.min_holes' limit 1), 6) into min_holes;
  select coalesce((select (value #>> '{}')::int from app_settings where key = 'snag_handicap.default_holes' limit 1), 3) into def_holes;

  create temp table if not exists _sh (student_id uuid primary key, idx numeric, n_rounds int, holes int, entries jsonb, hist jsonb, rounds jsonb) on commit drop;
  truncate _sh;
  create temp table if not exists _pre (student_id uuid primary key, idx numeric, n_rounds int) on commit drop;

  for t in
    select tt.id, tt.stage_no, tt.played_on, coalesce(tt.holes, def_holes)::int as n
    from tournaments tt
    where tt.deleted_at is null and exists (select 1 from tournament_results x where x.tournament_id = tt.id and x.participant_kind = 'student' and x.student_id is not null and x.to_par is not null)
    order by tt.played_on, tt.stage_no
  loop
    n_t := n_t + 1;
    -- Trạng thái đầu ngày (handicap trước chặng)
    truncate _pre;
    insert into _pre select student_id, idx, n_rounds from _sh;

    for g in select distinct coalesce(x.group_name, '') as grp from tournament_results x
             where x.tournament_id = t.id and x.participant_kind = 'student' and x.student_id is not null and x.to_par is not null loop
      -- Rating bảng (so với par) từ người neo
      select array_agg(x.to_par - (p.idx + c_off) * t.n / 9.0) into implied
      from tournament_results x join _pre p on p.student_id = league_current_student(x.student_id)
      where x.tournament_id = t.id and coalesce(x.group_name, '') = g.grp and x.participant_kind = 'student' and x.to_par is not null
        and p.idx is not null and p.n_rounds >= anchor_min;
      m := coalesce(array_length(implied, 1), 0);
      med := case when m > 0 then (select percentile_cont(0.5) within group (order by v) from unnest(implied) v) end;
      rating := snag_r1(case when m >= full_anchors then med when m > 0 then m * med / full_anchors else 0 end);

      for r in select league_current_student(x.student_id) as sid, x.to_par from tournament_results x
               where x.tournament_id = t.id and coalesce(x.group_name, '') = g.grp and x.participant_kind = 'student'
                 and x.student_id is not null and x.to_par is not null loop
        n_r := n_r + 1;
        d := snag_r1((r.to_par - rating) * 9.0 / t.n);
        insert into _sh (student_id, idx, n_rounds, holes, entries, hist, rounds) values (r.sid, null, 0, 0, '[]', '[]', '[]') on conflict do nothing;
        select * into s from _sh where student_id = r.sid;
        ent := s.entries || jsonb_build_array(jsonb_build_object('d', d, 'adj', 0));
        esr := 0;
        select p.idx into v_idx from _pre p where p.student_id = r.sid;
        if v_idx is not null then
          esr := case when v_idx - d >= 6 then -2 when v_idx - d >= 4 then -1 else 0 end;
          if esr <> 0 then   -- cộng điều chỉnh vào 10 vòng gần nhất (kể cả vòng này)
            select jsonb_agg(case when o > jsonb_array_length(ent) - win then jsonb_set(e, '{adj}', to_jsonb((e ->> 'adj')::numeric + esr)) else e end order by o)
              into ent from jsonb_array_elements(ent) with ordinality as a(e, o);
          end if;
        end if;
        update _sh set entries = ent, n_rounds = s.n_rounds + 1, holes = s.holes + t.n,
          rounds = s.rounds || jsonb_build_array(jsonb_build_object('stage_no', t.stage_no, 'played_on', t.played_on, 'group', nullif(g.grp, ''),
            'holes', t.n, 'to_par', r.to_par, 'rating', rating, 'anchors', m, 'diff', d, 'esr', esr))
        where student_id = r.sid;
      end loop;
    end loop;

    -- Handicap cuối ngày cho các bạn đã chơi chặng này
    for s in select h.* from _sh h where exists (select 1 from tournament_results x where x.tournament_id = t.id and x.participant_kind = 'student'
                                                 and x.to_par is not null and league_current_student(x.student_id) = h.student_id) loop
      if s.holes < min_holes then continue; end if;
      select array_agg(v order by v) into best from (
        select (e ->> 'd')::numeric + (e ->> 'adj')::numeric as v
        from jsonb_array_elements(s.entries) with ordinality as a(e, o)
        where o > jsonb_array_length(s.entries) - win) z;
      k := case when array_length(best, 1) <= 3 then 1 when array_length(best, 1) <= 5 then 2 when array_length(best, 1) <= 7 then 3 else 4 end;
      v_idx := least(36, snag_r1((select avg(v) from unnest(best[1:k]) v)));
      update _sh set idx = v_idx, hist = hist || jsonb_build_array(jsonb_build_object('date', t.played_on, 'idx', v_idx)),
        rounds = jsonb_set(rounds, array[(jsonb_array_length(rounds) - 1)::text, 'idx_after'], to_jsonb(v_idx))
      where student_id = s.student_id;
    end loop;
  end loop;

  delete from snag_handicaps h where not exists (select 1 from _sh z where z.student_id = h.student_id);
  insert into snag_handicaps (student_id, idx, n_rounds, holes, need_holes, as_of, history, rounds, computed_at)
  select student_id, idx, n_rounds, holes, greatest(0, min_holes - holes),
         (select max((e ->> 'played_on')::date) from jsonb_array_elements(rounds) e), hist, rounds, now()
  from _sh
  on conflict (student_id) do update set idx = excluded.idx, n_rounds = excluded.n_rounds, holes = excluded.holes, need_holes = excluded.need_holes,
    as_of = excluded.as_of, history = excluded.history, rounds = excluded.rounds, computed_at = excluded.computed_at;
  return jsonb_build_object('tournaments', n_t, 'results', n_r, 'players', (select count(*) from _sh), 'with_handicap', (select count(*) from _sh where idx is not null));
end $$;
revoke execute on function public.snag_handicap_recompute() from public, anon, authenticated;
grant execute on function public.snag_handicap_recompute() to service_role;

-- Tự tính lại khi kết quả giải thay đổi; lỗi tính chỉ ghi cảnh báo, không chặn việc nhập kết quả
create or replace function public.snag_handicap_after_results() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.snag_handicap_recompute();
  exception when others then
    raise warning 'snag_handicap_recompute lỗi: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists snag_handicap_after_results on public.tournament_results;
create trigger snag_handicap_after_results after insert or update or delete on public.tournament_results
  for each statement execute function public.snag_handicap_after_results();

-- Đọc SNAG Handicap của một học viên: cùng quyền với mục Thành tích SNAG Golf League
create or replace function public.snag_handicap_student(p_student_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid := public.league_current_student(p_student_id); h snag_handicaps;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if not (
       public.is_guardian_of(p_student_id, false)
    or exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)
    or public.can_staff_view_student(p_student_id)
    or (public.is_league_staff() and public.league_staff_can_view(v_id))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into h from snag_handicaps where student_id = v_id;
  if h.student_id is null then return null; end if;
  return jsonb_build_object('idx', h.idx, 'n_rounds', h.n_rounds, 'holes', h.holes, 'need_holes', h.need_holes, 'as_of', h.as_of,
    'history', h.history, 'rounds', h.rounds, 'computed_at', h.computed_at);
end $$;
revoke execute on function public.snag_handicap_student(uuid) from public, anon;
grant execute on function public.snag_handicap_student(uuid) to authenticated;

-- Tính lần đầu
select public.snag_handicap_recompute();
