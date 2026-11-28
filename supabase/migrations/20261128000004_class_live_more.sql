-- Lớp học trực tiếp — việc 4, 6, 7 của yêu cầu 27/11/2026 (docs/spec/31-lop-hoc-truc-tiep.md):
--   4. Trình chiếu: đội A/B theo buổi (class_session_students.team), bảng điểm có đội; app tự làm mới.
--   6. Đổi quà trên lớp: HLV lớp đổi quà hộ (gift_can_redeem thêm HLV lớp, công tắc rewards.coach_can_redeem); HLV tạo quà
--      riêng của lớp (gift_items.class_id — chỉ hiện cho các bạn trong lớp đó); còn thiếu bao nhiêu điểm cho món kế tiếp.
--      Đổi quà đi qua gift_order_place sẵn có: trừ điểm hiện có, tổng tích luỹ giữ nguyên (class_live_total bỏ dòng gift_order).
--   7. Cuối buổi gửi tóm tắt cho phụ huynh (một lần mỗi buổi); phụ huynh xem điểm, chủ đề, nhận xét của con qua các buổi.
-- Thay thân class_live_sync, class_live_board (thêm team, summary_sent_at), gift_can_redeem, gift_catalog (lọc quà của lớp).

alter table public.class_session_students add column if not exists team text check (team in ('A', 'B'));
alter table public.class_sessions add column if not exists summary_sent_at timestamptz;
alter table public.gift_items add column if not exists class_id uuid references public.classes(id);
create index if not exists gift_items_class_idx on public.gift_items (class_id) where class_id is not null;

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('rewards.coach_can_redeem', 'true', 'HLV lớp được đổi quà hộ học viên lớp mình ngay trên lớp', 'Class coaches may redeem gifts for their students', false)
on conflict do nothing;

-- Quà chung (class_id trống) hiện cho mọi bạn; quà của một lớp chỉ hiện cho các bạn đang học lớp đó
create or replace function public.gift_visible_to(p_class_id uuid, p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_class_id is null or exists (select 1 from public.enrollments e
    where e.class_id = p_class_id and e.student_id = p_student_id and e.status = 'active')
$$;

create or replace function public.gift_can_redeem(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (public.is_admin() or public.can_manage_student(p_student_id)
    -- Lớp học trực tiếp (việc 6): HLV lớp (coach / head_coach) đổi quà hộ các bạn ngay trên lớp
    or (coalesce((select value = 'true'::jsonb from public.app_settings where key = 'rewards.coach_can_redeem'), true)
        and public.reward_is_class_coach_of(p_student_id))
    or (coalesce((select value = 'true'::jsonb from public.app_settings where key = 'rewards.student_can_redeem'), false)
        and exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)))
$$;

create or replace function public.gift_catalog(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_guardian_of(p_student_id)
          or exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'available', public.reward_available(p_student_id),
    'frozen', coalesce((select sum(delta) from public.reward_ledger where student_id = p_student_id and is_frozen), 0),
    'can_redeem', public.gift_can_redeem(p_student_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name_vi', g.name_vi, 'name_en', g.name_en, 'kind', g.kind,
        'description_vi', g.description_vi, 'description_en', g.description_en, 'photo_path', g.photo_path, 'points', g.points,
        'stock', public.gift_stock(g.id), 'per_student_limit', g.per_student_limit,
        'ordered', (select coalesce(sum(o.qty), 0) from public.gift_orders o where o.gift_id = g.id and o.student_id = p_student_id and o.status <> 'cancelled'))
      order by g.sort_order, g.points)
      from public.gift_items g where g.is_active and public.gift_visible_to(g.class_id, p_student_id)), '[]'));
end $$;

-------------------------------------------------------------------------------
-- 6. Quà cho màn lớp học: quà chung + quà của lớp, điểm hiện có, còn thiếu bao nhiêu cho món kế tiếp
-------------------------------------------------------------------------------
create or replace function public.class_live_gifts(p_class_id uuid, p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_avail int;
begin
  if not public.class_live_can(p_class_id) or not public.class_live_in_class(p_class_id, p_student_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_avail := public.reward_available(p_student_id);
  return jsonb_build_object(
    'available', v_avail,
    'total', public.class_live_total(p_student_id),
    'next_gap', (select min(g.points) - v_avail from public.gift_items g
                 where g.is_active and g.points > v_avail and public.gift_visible_to(g.class_id, p_student_id) and public.gift_stock(g.id) > 0),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name_vi', g.name_vi, 'name_en', g.name_en, 'points', g.points,
        'stock', public.gift_stock(g.id), 'class_only', g.class_id is not null, 'gap', greatest(g.points - v_avail, 0))
        order by g.points, g.sort_order)
      from public.gift_items g where g.is_active and public.gift_visible_to(g.class_id, p_student_id)), '[]'),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'gift_vi', g.name_vi, 'points', o.points, 'status', o.status,
        'created_at', o.created_at) order by o.created_at desc)
      from public.gift_orders o join public.gift_items g on g.id = o.gift_id where o.student_id = p_student_id), '[]'));
end $$;

-- HLV tạo quà riêng của lớp (tên, số điểm, số lượng nhập kho)
create or replace function public.class_live_gift_add(p_class_id uuid, p_name text, p_points int, p_qty int)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.class_live_can(p_class_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'name_required' using errcode = '22023'; end if;
  if p_points is null or p_points < 1 or p_points > 100000 then raise exception 'points_out_of_range' using errcode = '22023'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'invalid_qty' using errcode = '22023'; end if;
  insert into public.gift_items (name_vi, name_en, kind, points, class_id) values (v_name, v_name, 'other', p_points, p_class_id)
  returning id into v_id;
  insert into public.gift_stock_moves (gift_id, qty, reason, note, created_by) values (v_id, p_qty, 'restock', 'HLV tạo quà của lớp', auth.uid());
  return v_id;
end $$;

-------------------------------------------------------------------------------
-- 7. Tóm tắt cuối buổi gửi phụ huynh (thông báo trong app), một lần mỗi buổi
-------------------------------------------------------------------------------
create or replace function public.class_live_send_summary(p_class_id uuid, p_date date default null)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  v_date date := coalesce(p_date, public.vn_date(now()));
  s public.class_sessions;
  r record;
  n int := 0;
  v_tags text;
  v_best text;
begin
  if not public.class_live_can(p_class_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from public.class_sessions where class_id = p_class_id and session_date = v_date for update;
  if s.id is null then raise exception 'no_session' using errcode = 'P0002'; end if;
  if s.summary_sent_at is not null then raise exception 'already_sent' using errcode = '22023'; end if;
  for r in
    select st.id, st.full_name, m.attendance, m.comment_tags, m.note,
           coalesce((select sum(l.delta) from public.reward_ledger l where l.student_id = st.id and l.source_type = 'class_session' and l.source_id = s.id), 0)::int as today,
           public.class_live_total(st.id) as total,
           (select l.note from public.reward_ledger l where l.student_id = st.id and l.source_type = 'class_session' and l.source_id = s.id
              and l.delta > 0 and l.reason = 'class_points' and l.note is not null group by l.note order by sum(l.delta) desc limit 1) as best
    from public.enrollments e
    join public.students st on st.id = e.student_id and st.deleted_at is null and st.merged_into_student_id is null
    left join public.class_session_students m on m.session_id = s.id and m.student_id = st.id
    where e.class_id = p_class_id and e.status = 'active'
  loop
    continue when r.attendance = 'absent' and r.today = 0;
    select string_agg(case t when 'focused' then 'Tập trung tốt' when 'needs_reminder' then 'Cần nhắc nhở'
                             when 'tech_progress' then 'Tiến bộ kỹ thuật' when 'fair_play' then 'Fair play' end, ', ')
      into v_tags from unnest(coalesce(r.comment_tags, '{}')) t;
    v_best := r.best;
    perform public.notify_student_guardians(r.id, 'class_summary',
      'Buổi ' || coalesce(s.session_no::text, '') || ' của ' || r.full_name,
      'Session ' || coalesce(s.session_no::text, '') || ' – ' || r.full_name,
      concat_ws(' ',
        case when s.topic is not null then 'Chủ đề: ' || s.topic || '.' end,
        'Hôm nay con được ' || r.today || ' điểm, tổng tích luỹ ' || r.total || ' điểm.',
        case when v_best is not null then 'Điểm nổi bật: ' || v_best || '.' end,
        case when v_tags is not null then 'Nhận xét: ' || v_tags || '.' end,
        case when r.note is not null then 'HLV ghi: ' || r.note end),
      concat_ws(' ',
        case when s.topic is not null then 'Topic: ' || s.topic || '.' end,
        'Today: ' || r.today || ' points, total ' || r.total || ' points.',
        case when r.note is not null then 'Coach note: ' || r.note end),
      '/app/children/' || r.id);
    n := n + 1;
  end loop;
  update public.class_sessions set summary_sent_at = now() where id = s.id;
  return n;
end $$;

-- Phụ huynh / tài khoản con / nhân sự xem được hồ sơ: lịch sử các buổi trên lớp (chủ đề, điểm, chuyên cần, nhận xét)
create or replace function public.class_live_student_report(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_guardian_of(p_student_id)
          or exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)
          or public.reward_is_class_coach_of(p_student_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total', public.class_live_total(p_student_id),
    'available', public.reward_available(p_student_id),
    'sessions', coalesce((select jsonb_agg(x order by x.session_date desc) from (
      select s.session_date, s.session_no, s.topic, c.name as class_name,
             coalesce((select sum(l.delta) from public.reward_ledger l
                       where l.student_id = p_student_id and l.source_type = 'class_session' and l.source_id = s.id), 0) as points,
             m.attendance, coalesce(to_jsonb(m.comment_tags), '[]') as comment_tags, m.note
      from public.class_sessions s
      join public.classes c on c.id = s.class_id
      left join public.class_session_students m on m.session_id = s.id and m.student_id = p_student_id
      where m.id is not null or exists (select 1 from public.reward_ledger l
                                        where l.student_id = p_student_id and l.source_type = 'class_session' and l.source_id = s.id)
      limit 100) x), '[]'));
end $$;

create or replace function public.class_live_board(p_class_id uuid, p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_date date := coalesce(p_date, public.vn_date(now()));
  s public.class_sessions;
begin
  if not public.class_live_can(p_class_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from public.class_sessions where class_id = p_class_id and session_date = v_date;
  return jsonb_build_object(
    'class', (select jsonb_build_object('id', c.id, 'name', c.name, 'school', sc.name)
              from public.classes c left join public.schools sc on sc.id = c.school_id where c.id = p_class_id),
    'date', v_date,
    'steps', to_jsonb(public.class_live_steps()),
    'rules', public.class_live_rules(p_class_id),
    'topics', public.class_live_topics(),
    'session', case when s.id is not null then jsonb_build_object('id', s.id, 'session_no', s.session_no, 'topic', s.topic,
                                                                  'summary_sent_at', s.summary_sent_at) end,
    'next_session_no', public.class_live_next_no(p_class_id, v_date),
    'last_topic', (select topic from public.class_sessions where class_id = p_class_id and session_date < v_date and topic is not null
                   order by session_date desc limit 1),
    'students', coalesce((select jsonb_agg(jsonb_build_object(
        'id', st.id, 'full_name', st.full_name, 'student_code', st.student_code, 'claim_code', st.claim_code,
        'claimed', st.claim_code_used_at is not null
                   or exists (select 1 from public.student_guardians g where g.student_id = st.id and g.status = 'active'),
        'date_of_birth', st.date_of_birth, 'avatar_url', st.avatar_url,
        'today', coalesce((select sum(l.delta) from public.reward_ledger l
                           where l.student_id = st.id and l.source_type = 'class_session' and l.source_id = s.id), 0),
        'total', public.class_live_total(st.id),
        'available', public.reward_available(st.id),
        'opening', coalesce((select sum(l.delta) from public.reward_ledger l where l.student_id = st.id
                             and l.source_type = 'opening_balance' and l.reason in ('opening_balance', 'opening_balance_adjust')), 0),
        'has_opening', exists (select 1 from public.reward_ledger l where l.student_id = st.id and l.reason = 'opening_balance'),
        'attendance', m.attendance, 'leave_count', coalesce(m.leave_count, 0),
        'comment_tags', coalesce(to_jsonb(m.comment_tags), '[]'), 'note', m.note, 'team', m.team)
        order by st.full_name_normalized)
      from public.enrollments e
      join public.students st on st.id = e.student_id and st.deleted_at is null and st.merged_into_student_id is null
      left join public.class_session_students m on m.session_id = s.id and m.student_id = st.id
      where e.class_id = p_class_id and e.status = 'active'), '[]'));
end $$;

create or replace function public.class_live_sync(p_ops jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o jsonb;
  i int := 0;
  v_applied int := 0;
  v_skipped jsonb := '[]';
  v_class uuid; v_student uuid; v_date date; v_sid uuid; v_delta int; v_tag text; v_today int;
  v_rule uuid := (select id from public.reward_rules where code = 'class_points');
  v_uid uuid := case when exists (select 1 from public.profiles where user_id = auth.uid()) then auth.uid() end;
  v_tags text[];
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 500 then raise exception 'invalid_ops' using errcode = '22023'; end if;

  for o in select * from jsonb_array_elements(p_ops) loop
    i := i + 1;
    begin
      v_class := (o ->> 'class_id')::uuid;
      v_date := coalesce((o ->> 'date')::date, public.vn_date(now()));
      if v_class is null or not public.class_live_can(v_class) then raise exception 'forbidden'; end if;
      -- Không ghi cho ngày tương lai hoặc quá 7 ngày trước (máy để quên lâu ngày không mạng)
      if v_date > public.vn_date(now()) + 1 or v_date < public.vn_date(now()) - 7 then raise exception 'date_out_of_range'; end if;

      if o ->> 'op' = 'points' then
        v_student := (o ->> 'student_id')::uuid;
        v_delta := (o ->> 'delta')::int;
        v_tag := coalesce(nullif(o ->> 'tag', ''), case when v_delta < 0 then 'fix' end);
        -- Cộng: lý do cộng (hoặc không ghi); trừ: 'fix' (sửa nhầm) hoặc 'penalty' (trừ điểm)
        if v_delta < 0 and v_tag not in ('fix', 'penalty') then raise exception 'invalid_tag'; end if;
        if v_delta > 0 and v_tag in ('fix', 'penalty') then raise exception 'invalid_tag'; end if;
        if (o ->> 'id') is null then raise exception 'id_required'; end if;
        if exists (select 1 from public.reward_ledger where id = (o ->> 'id')::uuid) then
          v_applied := v_applied + 1;  -- đã nhận ở lần gửi trước
          continue;
        end if;
        if not public.class_live_in_class(v_class, v_student) then raise exception 'not_in_class'; end if;
        -- Cộng theo các mức trong cài đặt; trừ (hoàn tác) đúng một mức
        if v_delta = 0 or not (abs(v_delta) = any(public.class_live_steps())) then raise exception 'invalid_delta'; end if;
        if v_tag is not null and public.class_live_tag_label(v_tag) is null then raise exception 'invalid_tag'; end if;
        v_sid := public.class_live_session_id(v_class, v_date);
        perform pg_advisory_xact_lock(hashtext('class_points:' || v_student::text));
        -- Điểm của buổi (gồm cả điểm danh): hoàn tác không xuống dưới 0, cộng không vượt trần của loại lớp
        select coalesce(sum(delta), 0) into v_today from public.reward_ledger
        where student_id = v_student and source_type = 'class_session' and source_id = v_sid;
        if v_delta < 0 and v_today + v_delta < 0 then raise exception 'below_zero'; end if;
        if v_delta > 0 and v_today + v_delta > (public.class_live_rules(v_class) ->> 'session_cap')::int then
          raise exception 'session_cap';
        end if;
        insert into public.reward_ledger (id, student_id, delta, reason, source_type, source_id, rule_id, note, created_by)
        values ((o ->> 'id')::uuid, v_student, v_delta, 'class_points', 'class_session', v_sid, v_rule,
                public.class_live_tag_label(v_tag), v_uid)
        on conflict (id) do nothing;
        v_applied := v_applied + 1;

      elsif o ->> 'op' = 'mark' then
        v_student := (o ->> 'student_id')::uuid;
        if not public.class_live_in_class(v_class, v_student) then raise exception 'not_in_class'; end if;
        if o ? 'comment_tags' then
          select coalesce(array_agg(distinct x), '{}') into v_tags from jsonb_array_elements_text(o -> 'comment_tags') x;
        end if;
        v_sid := public.class_live_session_id(v_class, v_date);
        insert into public.class_session_students (session_id, student_id, attendance, leave_count, comment_tags, note, team, updated_by)
        values (v_sid, v_student,
                case when o ? 'attendance' then nullif(o ->> 'attendance', '') end,
                case when o ? 'leave_count' then (o ->> 'leave_count')::int else 0 end,
                coalesce(v_tags, '{}'),
                case when o ? 'note' then nullif(btrim(o ->> 'note'), '') end,
                case when o ? 'team' then nullif(o ->> 'team', '') end,
                v_uid)
        on conflict (session_id, student_id) do update set
          attendance = case when o ? 'attendance' then excluded.attendance else class_session_students.attendance end,
          leave_count = case when o ? 'leave_count' then excluded.leave_count else class_session_students.leave_count end,
          comment_tags = case when o ? 'comment_tags' then excluded.comment_tags else class_session_students.comment_tags end,
          note = case when o ? 'note' then excluded.note else class_session_students.note end,
          team = case when o ? 'team' then excluded.team else class_session_students.team end,
          updated_by = excluded.updated_by;
        if o ? 'attendance' then perform public.class_live_sync_attendance(v_class, v_sid, v_student); end if;
        v_tags := null;
        v_applied := v_applied + 1;

      elsif o ->> 'op' = 'topic' then
        v_sid := public.class_live_session_id(v_class, v_date);
        update public.class_sessions set
          topic = case when o ? 'topic' then nullif(btrim(o ->> 'topic'), '') else topic end,
          session_no = case when o ? 'session_no' then nullif(o ->> 'session_no', '')::int else session_no end
        where id = v_sid;
        v_applied := v_applied + 1;

      else
        raise exception 'invalid_op';
      end if;
    exception when others then
      v_tags := null;
      v_skipped := v_skipped || jsonb_build_object('index', i - 1, 'reason', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
end $$;

do $$
begin
  revoke execute on function public.gift_visible_to(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.class_live_gifts(uuid, uuid) from public, anon;
  revoke execute on function public.class_live_gift_add(uuid, text, int, int) from public, anon;
  revoke execute on function public.class_live_send_summary(uuid, date) from public, anon;
  revoke execute on function public.class_live_student_report(uuid) from public, anon;
  revoke execute on function public.class_live_board(uuid, date) from public, anon;
  revoke execute on function public.class_live_sync(jsonb) from public, anon;
  grant execute on function public.class_live_gifts(uuid, uuid), public.class_live_gift_add(uuid, text, int, int),
    public.class_live_send_summary(uuid, date), public.class_live_student_report(uuid),
    public.class_live_board(uuid, date), public.class_live_sync(jsonb) to authenticated;
end $$;
