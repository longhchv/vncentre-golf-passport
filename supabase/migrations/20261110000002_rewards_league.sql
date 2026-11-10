-- Spec 19 · bước 3 (phần A): kết quả League vào điểm thưởng. docs/spec/19-mapping.md mục 3.A, Q1, Q2, Q4.
-- Không sửa hàm nhập kết quả, không đụng league_standings / ranking_coefficient: chỉ bám bằng trigger.
-- Chưa cộng bù chặng cũ (D60): chặng có reward_enabled = false thì mục tiêu = 0. reward_backfill_league viết sẵn, KHÔNG chạy.

-------------------------------------------------------------------------------
-- Lõi: đồng bộ sổ với MỘT dòng kết quả
-- Mục tiêu: round(points_total × reward_coefficient) cho student_id của dòng, nếu là học sinh đã ghép, chặng chưa xoá và đang bật;
-- mọi học viên khác (và khi dòng đã bị xoá) = 0. Lệch thì ghi dòng: lần đầu 'tournament_result', sau đó 'tournament_result_adjust'.
-------------------------------------------------------------------------------
create or replace function public.reward_sync_result(p_result_id uuid, p_tournament_id uuid default null)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  r public.tournament_results;
  v_tid uuid;
  v_student uuid;
  v_target int := 0;
  v_note text;
  v_rows int := 0;
  rec record;
  v_diff int;
begin
  if p_result_id is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('reward_result:' || p_result_id::text));

  select * into r from public.tournament_results where id = p_result_id;
  v_tid := coalesce(r.tournament_id, p_tournament_id);
  if r.id is not null and r.participant_kind = 'student' and r.student_id is not null then
    select round(r.points_total * s.reward_coefficient)::int into v_target
    from public.tournaments t join public.tournament_series s on s.id = t.series_id
    where t.id = r.tournament_id and t.deleted_at is null and t.reward_enabled;
    if found then v_student := r.student_id; else v_target := 0; end if;
  end if;

  -- Ghi chú cố định lúc ghi: dòng kết quả có thể bị xoá cứng khi gửi lại chặng
  select s.name_vi || ' · #' || t.stage_no || ' · ' || se.code into v_note
  from public.tournaments t join public.tournament_series s on s.id = t.series_id join public.seasons se on se.id = t.season_id
  where t.id = v_tid;

  for rec in
    select x.student_id,
           coalesce((select sum(l.delta) from public.reward_ledger l
                     where l.source_type = 'tournament_result' and l.source_id = p_result_id and l.student_id = x.student_id), 0)::int as given
    from (select l.student_id from public.reward_ledger l where l.source_type = 'tournament_result' and l.source_id = p_result_id
          union
          select v_student where v_student is not null) x
    order by (x.student_id = v_student) nulls first      -- trừ người cũ trước, cộng người mới sau
  loop
    v_diff := (case when rec.student_id = v_student then v_target else 0 end) - rec.given;
    if v_diff <> 0 then
      insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, note, created_by)
      values (rec.student_id, v_diff,
              case when exists (select 1 from public.reward_ledger where source_type = 'tournament_result' and source_id = p_result_id
                                  and reason = 'tournament_result')
                   then 'tournament_result_adjust' else 'tournament_result' end,
              'tournament_result', p_result_id, v_note, auth.uid());
      v_rows := v_rows + 1;
    end if;
  end loop;
  return v_rows;
end $$;

-- Dòng kết quả thêm / sửa (điểm, hạng, ghép, gộp, đổi loại người thi) / xoá → đồng bộ. Hàm so số nên gửi lại chặng không sinh dòng trùng.
create or replace function public.tournament_results_reward()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.reward_sync_result(old.id, old.tournament_id);
  else
    perform public.reward_sync_result(new.id, new.tournament_id);
  end if;
  return null;
end $$;
create trigger tournament_results_reward after insert or update or delete on public.tournament_results
  for each row execute function public.tournament_results_reward();

-- Chặng: xoá mềm / khôi phục, bật / tắt điểm thưởng, đổi chuỗi giải → đồng bộ mọi dòng của chặng
create or replace function public.tournaments_reward()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if new.deleted_at is distinct from old.deleted_at or new.reward_enabled is distinct from old.reward_enabled
     or new.series_id is distinct from old.series_id then
    for v in select id from public.tournament_results where tournament_id = new.id loop
      perform public.reward_sync_result(v, new.id);
    end loop;
  end if;
  return null;
end $$;
create trigger tournaments_reward after update on public.tournaments
  for each row execute function public.tournaments_reward();

-- Q2: đổi hệ số điểm thưởng của chuỗi → tính lại các chặng đang bật
create or replace function public.tournament_series_reward()
returns trigger language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if new.reward_coefficient is distinct from old.reward_coefficient then
    for v in select r.id, r.tournament_id from public.tournament_results r join public.tournaments t on t.id = r.tournament_id
             where t.series_id = new.id and t.reward_enabled and t.deleted_at is null loop
      perform public.reward_sync_result(v.id, v.tournament_id);
    end loop;
  end if;
  return null;
end $$;
create trigger tournament_series_reward after update on public.tournament_series
  for each row execute function public.tournament_series_reward();

-------------------------------------------------------------------------------
-- Q4: gộp hồ sơ. Kết quả giải đã đi theo (league_follow_student_merge chạy trước — tên trigger xếp trước theo ABC,
-- reward_sync_result chuyển phần điểm giải). Phần còn lại của sổ (đối tác, ghi tay, quà, ...) chuyển bằng cặp dòng
-- merge_transfer, tách riêng phần khả dụng và phần treo. Hoàn tác gộp: chuyển ngược đúng phần đã chuyển.
-------------------------------------------------------------------------------
create or replace function public.reward_follow_student_merge()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  f boolean;
  v_amt int;
  v_to uuid;
begin
  if old.merged_into_student_id is null and new.merged_into_student_id is not null then
    v_to := new.merged_into_student_id;
    foreach f in array array[false, true] loop
      select coalesce(sum(delta), 0) into v_amt from public.reward_ledger where student_id = old.id and is_frozen = f;
      if v_amt <> 0 then
        insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, is_frozen, note, created_by) values
          (old.id, -v_amt, 'merge_transfer', 'student_merge', old.id, f, 'merge → ' || v_to, auth.uid()),
          (v_to,    v_amt, 'merge_transfer', 'student_merge', old.id, f, 'merge ← ' || old.id, auth.uid());
      end if;
    end loop;
  elsif old.merged_into_student_id is not null and new.merged_into_student_id is null then
    v_to := old.merged_into_student_id;
    foreach f in array array[false, true] loop
      select coalesce(sum(delta), 0) into v_amt from public.reward_ledger
      where student_id = v_to and reason = 'merge_transfer' and source_type = 'student_merge' and source_id = old.id and is_frozen = f;
      if v_amt <> 0 then
        insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, is_frozen, note, created_by) values
          (v_to,  -v_amt, 'merge_transfer', 'student_merge', old.id, f, 'undo merge → ' || old.id, auth.uid()),
          (old.id, v_amt, 'merge_transfer', 'student_merge', old.id, f, 'undo merge ← ' || v_to, auth.uid());
      end if;
    end loop;
  end if;
  return null;
end $$;
create trigger reward_follow_student_merge after update of merged_into_student_id on public.students
  for each row execute function public.reward_follow_student_merge();

-------------------------------------------------------------------------------
-- D60: cộng bù chặng cũ. VIẾT SẴN, KHÔNG CHẠY. Admin gọi khi anh Long chốt: bật reward_enabled → trigger đồng bộ.
-------------------------------------------------------------------------------
create or replace function public.reward_backfill_league(p_tournament_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_before int;
  v_n int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  select count(*) into v_before from public.reward_ledger where source_type = 'tournament_result';
  update public.tournaments set reward_enabled = true
  where id = any(coalesce(p_tournament_ids, '{}')) and not reward_enabled and deleted_at is null;
  get diagnostics v_n = row_count;
  insert into public.audit_logs (action, entity_type, after)
  values ('reward.backfill_league', 'tournaments', jsonb_build_object('tournaments', v_n, 'ids', p_tournament_ids));
  return jsonb_build_object('tournaments', v_n,
    'ledger_rows', (select count(*) from public.reward_ledger where source_type = 'tournament_result') - v_before);
end $$;

-------------------------------------------------------------------------------
-- Ví điểm (phụ huynh, chính chủ, tài khoản con, admin). Giữ khoá cũ balance / recent (màn đối tác spec 18),
-- thêm available (chưa treo), frozen (đang treo, gói Free) và nguồn của từng dòng. Không có tên học viên khác.
-------------------------------------------------------------------------------
create or replace function public.reward_balance(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_guardian_of(p_student_id)
          or exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'balance', coalesce((select sum(delta) from public.reward_ledger where student_id = p_student_id), 0),
    'available', coalesce((select sum(delta) from public.reward_ledger where student_id = p_student_id and not is_frozen), 0),
    'frozen', coalesce((select sum(delta) from public.reward_ledger where student_id = p_student_id and is_frozen), 0),
    'recent', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select l.id, l.delta, l.reason, l.created_at, l.is_frozen,
               case when l.source_type = 'tournament_result' or l.reason in ('merge_transfer') then null else l.note end as note,
               p.name as partner_name,
               case when t.id is not null then jsonb_build_object('series_vi', ts.name_vi, 'series_en', ts.name_en, 'stage_no', t.stage_no,
                                                                  'season', se.code, 'played_on', t.played_on) end as tournament,
               case when l.source_type = 'tournament_result' and t.id is null then l.note end as tournament_note,
               case when rr.id is not null then jsonb_build_object('name_vi', rr.name_vi, 'name_en', rr.name_en) end as rule
        from public.reward_ledger l
        left join public.partner_visits v on v.id = l.source_id and l.source_type = 'partner_visit'
        left join public.partners p on p.id = v.partner_id
        left join public.tournament_results tr on tr.id = l.source_id and l.source_type = 'tournament_result'
        left join public.tournaments t on t.id = tr.tournament_id
        left join public.tournament_series ts on ts.id = t.series_id
        left join public.seasons se on se.id = t.season_id
        left join public.reward_rules rr on rr.id = l.rule_id or (l.rule_id is null and rr.code = l.reason)
        where l.student_id = p_student_id order by l.created_at desc limit 50) x), '[]'));
end $$;

do $$
begin
  revoke execute on function public.reward_sync_result(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.tournament_results_reward() from public, anon, authenticated;
  revoke execute on function public.tournaments_reward() from public, anon, authenticated;
  revoke execute on function public.tournament_series_reward() from public, anon, authenticated;
  revoke execute on function public.reward_follow_student_merge() from public, anon, authenticated;
  revoke execute on function public.reward_backfill_league(uuid[]) from public, anon;
  revoke execute on function public.reward_balance(uuid) from public, anon;
  grant execute on function public.reward_backfill_league(uuid[]), public.reward_balance(uuid) to authenticated;
end $$;
