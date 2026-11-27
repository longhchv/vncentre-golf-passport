-- Lớp học trực tiếp: danh sách chủ đề theo giáo án (anh Long, 27/11/2026). HLV chọn "Buổi N · chủ đề" một chạm.
-- Danh sách nằm trong cài đặt class_live.topics (mảng chuỗi, phần tử thứ N là chủ đề Buổi N; admin sửa ở trang Cài đặt).
-- Chỉ thêm cài đặt, hàm đọc cài đặt và thay thân class_live_board (thêm khoá topics).

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('class_live.topics', '["Sân golf và cách chơi golf", "Những văn hoá và phép lịch sự trong golf", "Các cú đánh trong golf và kiến thức golf cần có", "Kỹ thuật và bài tập Putting", "Kỹ năng golf – kỹ năng sống", "Kỹ thuật và bài tập Chipping", "Công cụ hỗ trợ Chipping, kỹ năng chip", "Kỹ năng golf – kỹ năng sống và Luật golf", "Kỹ thuật và bài tập Pitching", "Kỹ năng golf – kỹ năng sống và Luật golf", "Kỹ thuật và bài tập Fullswing (Launch)", "Kỹ năng golf – kỹ năng sống", "Ôn tập, tổng kết", "Giải đấu – kiến thức, luật, văn hoá golf"]',
   'Giáo án lớp học: chủ đề Buổi 1, 2, 3… (mảng chuỗi theo thứ tự buổi)',
   'Class curriculum: topic of session 1, 2, 3… (array of strings in session order)', false)
on conflict do nothing;

create or replace function public.class_live_topics()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_agg(left(btrim(x), 200) order by n)
                   from public.app_settings s, jsonb_array_elements_text(s.value) with ordinality as e(x, n)
                   where s.key = 'class_live.topics' and jsonb_typeof(s.value) = 'array' and n <= 100), '[]')
$$;

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

do $$
begin
  revoke execute on function public.class_live_topics() from public, anon, authenticated;
  revoke execute on function public.class_live_board(uuid, date) from public, anon;
  grant execute on function public.class_live_board(uuid, date) to authenticated;
end $$;
