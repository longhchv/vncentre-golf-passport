-- Spec 19 · bước 6 (B18): lần đổi quà ở quầy sự kiện thành giao dịch trong sổ reward_ledger.
-- Điểm sự kiện vẫn là ví riêng của thẻ (event_scores − event_redemptions, quầy kiểm bằng event_card_points — giữ nguyên).
-- Để sổ có đủ lịch sử mà KHÔNG làm đổi số dư điểm thưởng (chưa chốt quy đổi điểm sự kiện ↔ điểm thưởng), mỗi lần đổi ghi
-- MỘT CẶP dòng: +N 'event_points' (điểm sự kiện dùng tại quầy) và −N 'event_redemption' (quà đã đổi). Tổng = 0.
-- Nếu sau này gộp hẳn hai ví thì chỉ cần thôi ghi dòng 'event_points' cho lần đổi mới.

alter table public.reward_ledger drop constraint if exists reward_ledger_reason_check;
alter table public.reward_ledger add constraint reward_ledger_reason_check check (reason in (
  'partner_visit', 'partner_visit_void', 'admin_adjust',
  'tournament_result', 'tournament_result_adjust',
  'school_award', 'attendance', 'attendance_full_month', 'skill_passed', 'level_up', 'conduct', 'theory_test', 'practice_test',
  'manual_void', 'level_up_adjust',
  'gift_order', 'gift_order_refund',
  'merge_transfer',
  'event_points', 'event_redemption'));

-- Mỗi lần đổi chỉ một cặp
create unique index if not exists reward_ledger_event_one on public.reward_ledger (source_type, source_id, reason)
  where reason in ('event_points', 'event_redemption');

create or replace function public.reward_record_event_redemption(p_redemption_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  r public.event_redemptions;
  v_student uuid;
  v_note text;
begin
  select * into r from public.event_redemptions where id = p_redemption_id;
  if r.id is null then return; end if;
  select student_id into v_student from public.passports where id = r.passport_id;
  if v_student is null then return; end if;          -- thẻ chưa gắn học viên: không có sổ
  select e.name_vi || coalesce(' · ' || r.gift_label, '') into v_note from public.events e where e.id = r.event_id;
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, note, created_by, created_at)
  values (v_student,  r.points, 'event_points',     'event_redemption', r.id, v_note, r.redeemed_by, r.redeemed_at),
         (v_student, -r.points, 'event_redemption', 'event_redemption', r.id, v_note, r.redeemed_by, r.redeemed_at)
  on conflict do nothing;
end $$;

create or replace function public.event_redemptions_reward()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.reward_record_event_redemption(new.id);
  return null;
end $$;
create trigger event_redemptions_reward after insert on public.event_redemptions
  for each row execute function public.event_redemptions_reward();

-- Chuyển các lần đổi đã có (staging 10/11/2026: 0 dòng). Tổng mỗi cặp = 0 nên không đổi số dư.
do $$
declare v uuid;
begin
  for v in select id from public.event_redemptions order by redeemed_at loop
    perform public.reward_record_event_redemption(v);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Ví điểm: tên sự kiện + quà cho dòng đổi quà ở quầy
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
               case when l.source_type in ('tournament_result', 'gift_order', 'event_redemption') or l.reason in ('merge_transfer') then null else l.note end as note,
               p.name as partner_name,
               case when t.id is not null then jsonb_build_object('series_vi', ts.name_vi, 'series_en', ts.name_en, 'stage_no', t.stage_no,
                                                                  'season', se.code, 'played_on', t.played_on) end as tournament,
               case when l.source_type = 'tournament_result' and t.id is null then l.note end as tournament_note,
               case when rr.id is not null then jsonb_build_object('name_vi', rr.name_vi, 'name_en', rr.name_en) end as rule,
               case when gi.id is not null then jsonb_build_object('name_vi', gi.name_vi, 'name_en', gi.name_en, 'qty', go.qty) end as gift,
               case when ev.id is not null then jsonb_build_object('name_vi', ev.name_vi, 'name_en', ev.name_en, 'gift_label', er.gift_label) end as event
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
        where l.student_id = p_student_id order by l.created_at desc limit 50) x), '[]'));
end $$;

do $$
begin
  revoke execute on function public.reward_record_event_redemption(uuid) from public, anon, authenticated;
  revoke execute on function public.event_redemptions_reward() from public, anon, authenticated;
end $$;
