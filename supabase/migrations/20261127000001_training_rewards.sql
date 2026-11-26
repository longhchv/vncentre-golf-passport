-- Spec 24 · đợt 3: cộng điểm thưởng (điểm tích luỹ) vào ví cho thẻ thử thách và bài HLV giao, cộng bù phần đã làm ở đợt 2.
-- Quy tắc giữ nguyên của module điểm thưởng (spec 19):
--   · Điểm tích luỹ (reward_ledger) chỉ bị trừ khi đổi quà. Ở đây chỉ CỘNG, không có dòng trừ lại
--     (HLV bỏ đánh dấu, thẻ bị từ chối sau, ... không trừ điểm đã cộng).
--   · Điểm xếp hạng (BXH giải, league_standings) không đổi: module này không đụng.
-- Mức điểm: thẻ lấy points_reward của từng thẻ (admin sửa; mặc định luyện thêm 10, lên level 30);
--           bài HLV giao lấy points của bài (HLV chọn; mặc định bài về nhà 20, làm tại lớp 50 — cài đặt training.points).
-- Mỗi thẻ chỉ cộng một lần cho mỗi bạn (lần đạt đầu tiên). Mỗi bài giao chỉ cộng một lần cho mỗi bạn.
-- Giới hạn điểm tự xác nhận: thẻ đạt mà không có HLV xác nhận (tự bấm đạt, phụ huynh xác nhận) cộng tối đa
--   training.self_points_cap.per_week điểm mỗi tuần (thứ Hai–Chủ nhật, giờ Việt Nam, theo ngày làm thẻ). Vượt mức thì không cộng.
-- Chỉ cộng cho thẻ theo level của các bạn nhỏ. Thẻ người lớn (Có Handicap, Break 100) chưa cộng: ví người lớn là sổ riêng (D61), chưa làm.
-- Chỉ thêm: giá trị reason, cài đặt, chỉ mục, hàm, trigger; thay reward_balance để hiện tên thẻ / bài.

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('training.self_points_cap', '{"per_week":60}',
   'Điểm tối đa mỗi tuần cho thẻ không có HLV xác nhận (tự bấm đạt, phụ huynh xác nhận)',
   'Weekly cap on points from cards without coach confirmation', true)
on conflict do nothing;
update public.app_settings set description_vi = 'Mức điểm mặc định khi tạo thẻ / giao bài: thẻ luyện thêm, thẻ lên level, bài về nhà, làm tại lớp',
  description_en = 'Default points when creating cards / assignments'
where key = 'training.points';

alter table public.reward_ledger drop constraint if exists reward_ledger_reason_check;
alter table public.reward_ledger add constraint reward_ledger_reason_check check (reason in (
  'partner_visit', 'partner_visit_void', 'admin_adjust',
  'tournament_result', 'tournament_result_adjust',
  'school_award', 'attendance', 'attendance_full_month', 'skill_passed', 'level_up', 'conduct', 'theory_test', 'practice_test',
  'manual_void', 'level_up_adjust',
  'gift_order', 'gift_order_refund',
  'merge_transfer',
  'event_points', 'event_redemption',
  'opening_balance', 'opening_balance_adjust',
  'training_challenge', 'training_assignment'));

-- Một bài giao chỉ cộng một lần cho mỗi bạn; một lượt thẻ chỉ sinh một dòng
create unique index if not exists reward_ledger_training_one on public.reward_ledger (student_id, source_type, source_id)
  where reason in ('training_challenge', 'training_assignment');

-------------------------------------------------------------------------------
-- Lượt thẻ có HLV (hoặc nhân viên trung tâm) xác nhận hay không
-------------------------------------------------------------------------------
create or replace function public.training_result_by_staff(r public.training_challenge_results)
returns boolean language sql stable security definer set search_path = public as $$
  select r.submitted_as = 'coach'
      or (r.reviewed_by is not null and exists (
            select 1 from public.user_roles ur where ur.user_id = r.reviewed_by
            and ur.deleted_at is null and ur.role in ('admin', 'head_coach', 'coach', 'assistant')))
$$;

-------------------------------------------------------------------------------
-- Cộng điểm cho một lượt thẻ đạt. Gọi lại nhiều lần vẫn chỉ cộng một lần. Trả số điểm vừa cộng.
-------------------------------------------------------------------------------
create or replace function public.training_reward_result(p_result_id uuid)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  r public.training_challenge_results%rowtype;
  c public.training_challenges%rowtype;
  v_points int; v_self boolean; v_cap int; v_used int; v_week date;
begin
  select * into r from public.training_challenge_results where id = p_result_id;
  if r.id is null or r.status not in ('passed', 'approved') then return 0; end if;
  select * into c from public.training_challenges where id = r.challenge_id;
  if c.id is null or c.level_number is null or c.points_reward <= 0 then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('training_reward:' || r.student_id::text));
  -- Thẻ này đã cộng cho bạn này (kể cả hồ sơ đã gộp vào)?
  if exists (select 1 from public.reward_ledger l join public.training_challenge_results x on x.id = l.source_id
             where l.reason = 'training_challenge' and l.source_type = 'training_result' and x.challenge_id = c.id
               and (l.student_id = r.student_id
                    or l.student_id in (select s.id from public.students s where s.merged_into_student_id = r.student_id))) then
    return 0;
  end if;
  v_points := c.points_reward;
  v_self := not public.training_result_by_staff(r);
  if v_self then
    v_cap := coalesce((select (value ->> 'per_week')::int from public.app_settings where key = 'training.self_points_cap'), 60);
    v_week := date_trunc('week', public.vn_date(r.created_at))::date;
    select coalesce(sum(l.delta), 0) into v_used
    from public.reward_ledger l join public.training_challenge_results x on x.id = l.source_id
    where l.reason = 'training_challenge' and l.source_type = 'training_result' and l.student_id = r.student_id
      and not public.training_result_by_staff(x)
      and date_trunc('week', public.vn_date(x.created_at))::date = v_week;
    v_points := least(v_points, greatest(v_cap - v_used, 0));
  end if;
  if v_points <= 0 then return 0; end if;
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, created_by)
  values (r.student_id, v_points, 'training_challenge', 'training_result', r.id,
          case when exists (select 1 from public.profiles where user_id = auth.uid()) then auth.uid() end)
  on conflict do nothing;
  return v_points;
end $$;

-------------------------------------------------------------------------------
-- Cộng điểm cho một bài giao đã được HLV xác nhận
-------------------------------------------------------------------------------
create or replace function public.training_reward_mark(p_mark_id uuid)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  m public.training_assignment_marks%rowtype;
  a public.training_assignments%rowtype;
begin
  select * into m from public.training_assignment_marks where id = p_mark_id;
  if m.id is null or m.confirmed_at is null then return 0; end if;
  select * into a from public.training_assignments where id = m.assignment_id;
  if a.id is null or a.deleted_at is not null or a.points <= 0 then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('training_reward:' || m.student_id::text));
  if exists (select 1 from public.reward_ledger l
             where l.reason = 'training_assignment' and l.source_type = 'training_assignment' and l.source_id = a.id
               and (l.student_id = m.student_id
                    or l.student_id in (select s.id from public.students s where s.merged_into_student_id = m.student_id))) then
    return 0;
  end if;
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, created_by)
  values (m.student_id, a.points, 'training_assignment', 'training_assignment', a.id,
          case when exists (select 1 from public.profiles where user_id = auth.uid()) then auth.uid() end)
  on conflict do nothing;
  return a.points;
end $$;

create or replace function public.training_results_reward()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('passed', 'approved') then perform public.training_reward_result(new.id); end if;
  return null;
end $$;
create trigger training_results_reward after insert or update of status on public.training_challenge_results
  for each row execute function public.training_results_reward();

create or replace function public.training_marks_reward()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.confirmed_at is not null then perform public.training_reward_mark(new.id); end if;
  return null;
end $$;
create trigger training_marks_reward after insert or update of confirmed_at on public.training_assignment_marks
  for each row execute function public.training_marks_reward();

-------------------------------------------------------------------------------
-- Cộng bù đợt 2 (và chạy lại an toàn bất cứ lúc nào: phần đã cộng thì bỏ qua). Theo thứ tự thời gian để giới hạn tuần đúng.
-------------------------------------------------------------------------------
create or replace function public.training_reward_backfill()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare x record; n_res int := 0; n_mark int := 0; pts int := 0; v int;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  for x in select id from public.training_challenge_results where status in ('passed', 'approved') order by created_at, id loop
    v := public.training_reward_result(x.id);
    if v > 0 then n_res := n_res + 1; pts := pts + v; end if;
  end loop;
  for x in select id from public.training_assignment_marks where confirmed_at is not null order by confirmed_at, id loop
    v := public.training_reward_mark(x.id);
    if v > 0 then n_mark := n_mark + 1; pts := pts + v; end if;
  end loop;
  insert into public.audit_logs (action, entity_type, after)
  values ('training.reward_backfill', 'reward_ledger', jsonb_build_object('results', n_res, 'marks', n_mark, 'points', pts));
  return jsonb_build_object('results', n_res, 'marks', n_mark, 'points', pts);
end $$;

revoke execute on function public.training_result_by_staff(public.training_challenge_results) from public, anon, authenticated;
revoke execute on function public.training_reward_result(uuid) from public, anon, authenticated;
revoke execute on function public.training_reward_mark(uuid) from public, anon, authenticated;
revoke execute on function public.training_results_reward() from public, anon, authenticated;
revoke execute on function public.training_marks_reward() from public, anon, authenticated;
revoke execute on function public.training_reward_backfill() from public, anon;
grant execute on function public.training_reward_backfill() to authenticated;

-------------------------------------------------------------------------------
-- Ví điểm: thêm tên thẻ / bài giao cho dòng điểm Tập luyện. Phần còn lại giữ nguyên bản 20261110000005.
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
    'available', public.reward_available(p_student_id),
    'frozen', coalesce((select sum(delta) from public.reward_ledger where student_id = p_student_id and is_frozen), 0),
    'recent', coalesce((select jsonb_agg(x order by x.created_at desc, x.delta) from (
        select l.id, l.delta, l.reason, l.created_at, l.is_frozen,
               case when l.source_type in ('tournament_result', 'gift_order', 'event_redemption', 'training_result', 'training_assignment')
                      or l.reason in ('merge_transfer') then null else l.note end as note,
               p.name as partner_name,
               case when t.id is not null then jsonb_build_object('series_vi', ts.name_vi, 'series_en', ts.name_en, 'stage_no', t.stage_no,
                                                                  'season', se.code, 'played_on', t.played_on) end as tournament,
               case when l.source_type = 'tournament_result' and t.id is null then l.note end as tournament_note,
               case when rr.id is not null then jsonb_build_object('name_vi', rr.name_vi, 'name_en', rr.name_en) end as rule,
               case when gi.id is not null then jsonb_build_object('name_vi', gi.name_vi, 'name_en', gi.name_en, 'qty', go.qty) end as gift,
               case when ev.id is not null then jsonb_build_object('name_vi', ev.name_vi, 'name_en', ev.name_en, 'gift_label', er.gift_label) end as event,
               case when tc.id is not null then jsonb_build_object('kind', 'challenge', 'name_vi', tc.title_vi, 'name_en', tc.title_en, 'level', tc.level_number)
                    when ta.id is not null then jsonb_build_object('kind', case when ta.in_class then 'in_class' else 'assignment' end,
                                                                   'name_vi', ta.title_vi, 'name_en', ta.title_vi) end as training
        from public.reward_ledger l
        left join public.partner_visits v on v.id = l.source_id and l.source_type = 'partner_visit'
        left join public.partners p on p.id = v.partner_id
        left join public.tournament_results tr on tr.id = l.source_id and l.source_type = 'tournament_result'
        left join public.tournaments t on t.id = tr.tournament_id
        left join public.tournament_series ts on ts.id = t.series_id
        left join public.seasons se on se.id = t.season_id
        left join public.reward_rules rr on rr.id = l.rule_id or (l.rule_id is null and rr.code = l.reason)
        left join public.gift_orders go on go.id = l.source_id and l.source_type = 'gift_order'
        left join public.gift_items gi on gi.id = go.gift_id
        left join public.event_redemptions er on er.id = l.source_id and l.source_type = 'event_redemption'
        left join public.events ev on ev.id = er.event_id
        left join public.training_challenge_results tcr on tcr.id = l.source_id and l.source_type = 'training_result'
        left join public.training_challenges tc on tc.id = tcr.challenge_id
        left join public.training_assignments ta on ta.id = l.source_id and l.source_type = 'training_assignment'
        where l.student_id = p_student_id order by l.created_at desc limit 50) x), '[]'));
end $$;

-------------------------------------------------------------------------------
-- Cộng bù ngay khi chạy migration (phần đợt 2 đã làm)
-------------------------------------------------------------------------------
do $$ begin perform public.training_reward_backfill(); end $$;
