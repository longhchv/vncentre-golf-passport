-- Lớp học trực tiếp – bổ sung của anh Long, 27/11/2026:
--   1. Thêm mức +1: class_live.point_steps = [1, 5, 10, 20, 30, 40, 50] (hàm class_live_steps giữ nguyên).
--   3. Trừ điểm (phạt): lý do mới 'penalty' – "Trừ điểm", khác 'fix' – "Sửa nhầm". Trừ đúng một mức, chỉ trong buổi,
--      điểm của buổi không xuống dưới 0 (below_zero).
--   4. Đánh số buổi = số buổi lớn nhất trước ngày đó + 1 (trước đây đếm số buổi + 1: lớp chỉ có Buổi 10 thì buổi sau ra 2).
-- Thay thân class_live_tag_label, class_live_session_id, class_live_board, class_live_sync; thêm class_live_next_no.

update public.app_settings set value = '[1, 5, 10, 20, 30, 40, 50]'::jsonb
where key = 'class_live.point_steps';

-- Số buổi tiếp theo của lớp tại một ngày: số buổi lớn nhất của các buổi trước ngày đó + 1
create or replace function public.class_live_next_no(p_class_id uuid, p_date date)
returns int language sql stable security definer set search_path = public as $$
  select least(999, coalesce((select max(session_no) from public.class_sessions
                              where class_id = p_class_id and session_date < p_date), 0) + 1)
$$;

create or replace function public.class_live_tag_label(p_tag text)
returns text language sql immutable as $$
  select case p_tag
    when 'game' then 'Hoàn thành trò chơi'
    when 'rules' then 'Đúng luật golf'
    when 'listen' then 'Nghe hiệu lệnh'
    when 'fair_play' then 'Fair play – bị trêu không đáp trả'
    when 'team_win' then 'Đội thắng'
    when 'fix' then 'Sửa nhầm'
    when 'penalty' then 'Trừ điểm'
  end
$$;

create or replace function public.class_live_session_id(p_class_id uuid, p_date date)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.class_sessions where class_id = p_class_id and session_date = p_date;
  if v_id is not null then return v_id; end if;
  perform pg_advisory_xact_lock(hashtext('class_session:' || p_class_id::text));
  select id into v_id from public.class_sessions where class_id = p_class_id and session_date = p_date;
  if v_id is not null then return v_id; end if;
  insert into public.class_sessions (class_id, session_date, session_no, created_by)
  values (p_class_id, p_date,
          public.class_live_next_no(p_class_id, p_date),
          case when exists (select 1 from public.profiles where user_id = auth.uid()) then auth.uid() end)
  returning id into v_id;
  return v_id;
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
    'session', case when s.id is not null then jsonb_build_object('id', s.id, 'session_no', s.session_no, 'topic', s.topic) end,
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
        'comment_tags', coalesce(to_jsonb(m.comment_tags), '[]'), 'note', m.note)
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
        insert into public.class_session_students (session_id, student_id, attendance, leave_count, comment_tags, note, updated_by)
        values (v_sid, v_student,
                case when o ? 'attendance' then nullif(o ->> 'attendance', '') end,
                case when o ? 'leave_count' then (o ->> 'leave_count')::int else 0 end,
                coalesce(v_tags, '{}'),
                case when o ? 'note' then nullif(btrim(o ->> 'note'), '') end,
                v_uid)
        on conflict (session_id, student_id) do update set
          attendance = case when o ? 'attendance' then excluded.attendance else class_session_students.attendance end,
          leave_count = case when o ? 'leave_count' then excluded.leave_count else class_session_students.leave_count end,
          comment_tags = case when o ? 'comment_tags' then excluded.comment_tags else class_session_students.comment_tags end,
          note = case when o ? 'note' then excluded.note else class_session_students.note end,
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
  revoke execute on function public.class_live_next_no(uuid, date) from public, anon, authenticated;
  revoke execute on function public.class_live_session_id(uuid, date) from public, anon, authenticated;
  revoke execute on function public.class_live_tag_label(text) from public, anon;
  revoke execute on function public.class_live_board(uuid, date) from public, anon;
  revoke execute on function public.class_live_sync(jsonb) from public, anon;
  grant execute on function public.class_live_board(uuid, date), public.class_live_sync(jsonb) to authenticated;
end $$;
