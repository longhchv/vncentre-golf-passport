-- Lớp học trực tiếp: đổi mức điểm mỗi lần bấm từ 1/2/3 sang 5, 10, 20, 30, 40, 50 (anh Long, 27/11/2026).
-- Các mức nằm trong cài đặt class_live.point_steps (admin sửa ở trang Cài đặt, không cần migration).
-- Hoàn tác = một dòng âm bằng đúng một mức (sổ không sửa, không xoá). Chỉ thay thân 2 hàm và thêm cài đặt.

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('class_live.point_steps', '[5, 10, 20, 30, 40, 50]',
   'Các mức điểm HLV bấm khi chấm trong lớp (mảng số nguyên dương, tối đa 8 mức)',
   'Point steps coaches can award in live class (array of positive integers, max 8)', false)
on conflict do nothing;

-- Đọc cài đặt; cài đặt sai thì dùng mặc định
create or replace function public.class_live_steps()
returns int[] language plpgsql stable security definer set search_path = public as $$
declare v int[];
begin
  begin
    select array_agg(x::int order by x::int) into v
    from public.app_settings s, jsonb_array_elements_text(s.value) x
    where s.key = 'class_live.point_steps' and jsonb_typeof(s.value) = 'array';
  exception when others then v := null;
  end;
  if v is null or cardinality(v) = 0 or cardinality(v) > 8 or exists (select 1 from unnest(v) x where x <= 0 or x > 1000) then
    v := array[5, 10, 20, 30, 40, 50];
  end if;
  return v;
end $$;

-- Nguồn điểm "Điểm trên lớp": khoảng điểm cho khớp mức mới (chỉ để hiển thị; ghi qua class_live_sync)
update public.reward_rules set default_points = 5, min_points = 5, max_points = 50 where code = 'class_points' and max_points < 50;

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
    'session', case when s.id is not null then jsonb_build_object('id', s.id, 'session_no', s.session_no, 'topic', s.topic) end,
    'next_session_no', (select count(*) + 1 from public.class_sessions where class_id = p_class_id and session_date < v_date),
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
        -- Sửa nhầm không kéo điểm hôm nay xuống dưới 0
        if v_delta < 0 then
          select coalesce(sum(delta), 0) into v_today from public.reward_ledger
          where student_id = v_student and source_type = 'class_session' and source_id = v_sid;
          if v_today + v_delta < 0 then raise exception 'below_zero'; end if;
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
  revoke execute on function public.class_live_steps() from public, anon, authenticated;
  revoke execute on function public.class_live_board(uuid, date) from public, anon;
  revoke execute on function public.class_live_sync(jsonb) from public, anon;
  grant execute on function public.class_live_board(uuid, date), public.class_live_sync(jsonb) to authenticated;
end $$;
