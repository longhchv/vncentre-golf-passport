-- Lớp học trực tiếp cho HLV (yêu cầu 27/11/2026, việc 1, 2, 3, 5): HLV tạo hồ sơ học viên, nhập điểm khởi đầu,
-- chấm điểm ngay trong buổi, ghi chủ đề buổi, chuyên cần và nhận xét. Học viên không cần đăng nhập.
-- Dùng lại, không tạo mới:
--   · Hồ sơ: bảng students (mã Golf Passport VNC-xxxxxx tự sinh, claim_code để phụ huynh liên kết bằng mã / QR /c/<mã>),
--     enrollments (vào lớp), quyền HLV theo class_staff (coach / head_coach) như module điểm thưởng.
--   · Điểm: ví reward_ledger theo thang sổ Passport (spec 19). Điểm khởi đầu = dòng opening_balance / opening_balance_adjust
--     (cùng quy tắc với nhập file của admin). Điểm trong buổi = dòng reason 'class_points', source_type 'class_session'.
--     Bấm −1 để sửa nhầm = một dòng âm (sổ không sửa, không xoá).
-- Tổng tích luỹ = mọi dòng sổ trừ dòng đổi quà (gift_order, gift_order_refund, event_redemption): đổi quà không làm giảm tổng.
-- Hoạt động khi mạng yếu: máy HLV tự sinh id cho mỗi lần bấm; class_live_sync nhận lại nhiều lần vẫn chỉ ghi một lần.
-- Chỉ thêm: bảng, hàm, giá trị reason / code mới.

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
  'training_challenge', 'training_assignment',
  'class_points'));

-- Nguồn điểm "Điểm trên lớp" để ví điểm của phụ huynh hiện đúng tên (reward_balance nối theo code). Chỉ ghi qua màn lớp học.
alter table public.reward_rules drop constraint if exists reward_rules_code_check;
alter table public.reward_rules add constraint reward_rules_code_check check (code in ('school_award', 'attendance', 'attendance_full_month',
  'skill_passed', 'level_up', 'conduct', 'theory_test', 'practice_test', 'class_points'));
insert into public.reward_rules (code, name_vi, name_en, default_points, min_points, max_points, allowed_roles, note_required, photo_allowed, mode, first_pass_only, sort_order)
values ('class_points', 'Điểm trên lớp', 'In-class points', 1, 1, 3, '{}', false, false, 'auto', false, 90)
on conflict (code) do nothing;

-------------------------------------------------------------------------------
-- Buổi học: một buổi mỗi lớp mỗi ngày (giờ Việt Nam). Chủ đề, số buổi HLV sửa được.
-------------------------------------------------------------------------------
create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  class_id uuid not null references public.classes(id),
  session_date date not null,
  session_no int check (session_no between 1 and 999),
  topic text check (char_length(topic) <= 200),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, session_date)
);

-- Chuyên cần và nhận xét của từng bạn trong một buổi
create table if not exists public.class_session_students (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  session_id uuid not null references public.class_sessions(id),
  student_id uuid not null references public.students(id),
  attendance text check (attendance in ('present', 'late', 'absent')),
  leave_count int not null default 0 check (leave_count between 0 and 99),
  comment_tags text[] not null default '{}' check (comment_tags <@ array['focused', 'needs_reminder', 'tech_progress', 'fair_play']::text[]),
  note text check (char_length(note) <= 1000),
  updated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);
create index if not exists class_session_students_student_idx on public.class_session_students (student_id);
create index if not exists reward_ledger_class_session_idx on public.reward_ledger (source_id) where source_type = 'class_session';

alter table public.class_sessions enable row level security;
alter table public.class_session_students enable row level security;
revoke all on public.class_sessions, public.class_session_students from anon;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.class_sessions'::regclass) then
    create trigger set_updated_at before update on public.class_sessions for each row execute function public.set_updated_at();
    create trigger audit_row after insert or update or delete on public.class_sessions for each row execute function public.audit_row();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.class_session_students'::regclass) then
    create trigger set_updated_at before update on public.class_session_students for each row execute function public.set_updated_at();
    create trigger audit_row after insert or update or delete on public.class_session_students for each row execute function public.audit_row();
  end if;
end $$;

-- Đọc trực tiếp: admin. Mọi thao tác khác qua các hàm bên dưới.
drop policy if exists class_sessions_admin_read on public.class_sessions;
create policy class_sessions_admin_read on public.class_sessions for select to authenticated using (public.is_admin());
drop policy if exists class_session_students_admin_read on public.class_session_students;
create policy class_session_students_admin_read on public.class_session_students for select to authenticated using (public.is_admin());

-------------------------------------------------------------------------------
-- Quyền: admin, HLV trưởng, HLV lớp (coach / head_coach trong class_staff) — như quyền ghi điểm thưởng (spec 19 Q6)
-------------------------------------------------------------------------------
create or replace function public.class_live_can(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.classes c where c.id = p_class_id and c.deleted_at is null)
     and (public.is_admin() or public.is_head_coach()
          or exists (select 1 from public.class_staff cs join public.profiles p on p.user_id = cs.user_id and p.status = 'active'
                     where cs.class_id = p_class_id and cs.user_id = auth.uid() and cs.role in ('coach', 'head_coach')))
$$;

create or replace function public.class_live_in_class(p_class_id uuid, p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enrollments e join public.students st on st.id = e.student_id
                 where e.class_id = p_class_id and e.student_id = p_student_id and e.status = 'active'
                   and st.deleted_at is null and st.merged_into_student_id is null)
$$;

-- Tổng tích luỹ: không trừ phần đã đổi quà
create or replace function public.class_live_total(p_student_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int from public.reward_ledger
  where student_id = p_student_id and reason not in ('gift_order', 'gift_order_refund', 'event_redemption')
$$;

-- Lấy (hoặc tạo) buổi học của lớp trong ngày. Số buổi mặc định = số buổi đã có + 1.
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
          least(999, (select count(*) from public.class_sessions where class_id = p_class_id) + 1),
          case when exists (select 1 from public.profiles where user_id = auth.uid()) then auth.uid() end)
  returning id into v_id;
  return v_id;
end $$;

-------------------------------------------------------------------------------
-- 1. HLV tạo hồ sơ học viên ngay trong lớp: họ tên (bắt buộc), ngày sinh, ảnh (không bắt buộc).
--    Ảnh: ảnh nhỏ đã nén trên máy (data:image/jpeg, ≤ 80 KB), lưu vào students.avatar_url.
-------------------------------------------------------------------------------
create or replace function public.class_live_create_student(p_class_id uuid, p_full_name text,
  p_date_of_birth date default null, p_avatar text default null, p_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_school uuid;
  st public.students;
begin
  if not public.class_live_can(p_class_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'name_required' using errcode = '22023'; end if;
  if p_date_of_birth is not null and (p_date_of_birth > current_date or p_date_of_birth < date '1930-01-01') then
    raise exception 'invalid_dob' using errcode = '22023';
  end if;
  if p_avatar is not null and (p_avatar !~ '^data:image/(jpeg|png|webp);base64,' or char_length(p_avatar) > 110000) then
    raise exception 'invalid_photo' using errcode = '22023';
  end if;
  -- Gửi lại cùng id (mạng chập chờn) → trả hồ sơ đã tạo
  if p_id is not null then
    select * into st from public.students where id = p_id;
    if st.id is not null then
      return jsonb_build_object('id', st.id, 'student_code', st.student_code, 'claim_code', st.claim_code, 'created', false);
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('class_live_create:' || p_class_id::text));
  if exists (select 1 from public.enrollments e join public.students x on x.id = e.student_id
             where e.class_id = p_class_id and e.status = 'active' and x.deleted_at is null and x.merged_into_student_id is null
               and x.full_name_normalized = public.normalize_name(v_name)) then
    raise exception 'duplicate_in_class' using errcode = '23505';
  end if;
  select school_id into v_school from public.classes where id = p_class_id;
  insert into public.students (id, full_name, date_of_birth, current_school_id, avatar_url)
  values (coalesce(p_id, gen_random_uuid()), v_name, p_date_of_birth, v_school, p_avatar)
  returning * into st;
  insert into public.enrollments (student_id, class_id, status, joined_at) values (st.id, p_class_id, 'active', public.vn_date(now()));
  return jsonb_build_object('id', st.id, 'student_code', st.student_code, 'claim_code', st.claim_code, 'created', true);
end $$;

-- Sửa nhanh hồ sơ (tên, ngày sinh, ảnh) của bạn trong lớp mình. p_avatar = '' để xoá ảnh.
create or replace function public.class_live_update_student(p_class_id uuid, p_student_id uuid, p_full_name text,
  p_date_of_birth date default null, p_avatar text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
begin
  if not public.class_live_can(p_class_id) or not public.class_live_in_class(p_class_id, p_student_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'name_required' using errcode = '22023'; end if;
  if p_date_of_birth is not null and (p_date_of_birth > current_date or p_date_of_birth < date '1930-01-01') then
    raise exception 'invalid_dob' using errcode = '22023';
  end if;
  if nullif(p_avatar, '') is not null and (p_avatar !~ '^data:image/(jpeg|png|webp);base64,' or char_length(p_avatar) > 110000) then
    raise exception 'invalid_photo' using errcode = '22023';
  end if;
  update public.students set full_name = v_name, date_of_birth = p_date_of_birth,
    avatar_url = case when p_avatar is null then avatar_url else nullif(p_avatar, '') end
  where id = p_student_id;
end $$;

-------------------------------------------------------------------------------
-- 2. Màn lớp học: buổi hôm nay + thẻ từng bạn (điểm hôm nay, tổng tích luỹ, điểm hiện có, điểm khởi đầu, chuyên cần, nhận xét)
-------------------------------------------------------------------------------
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

-------------------------------------------------------------------------------
-- Nhận một loạt thao tác từ máy HLV (gửi ngay, hoặc gửi dồn khi có mạng lại). Gửi lại nhiều lần vẫn chỉ ghi một lần.
-- p_ops: [{op:'points', id, class_id, date, student_id, delta, tag}
--         {op:'mark', class_id, date, student_id, attendance?, leave_count?, comment_tags?, note?}  (chỉ đổi khoá có gửi)
--         {op:'topic', class_id, date, session_no?, topic?}]
-- Trả {applied, skipped: [{index, reason}]}. Lỗi từng thao tác không làm hỏng các thao tác khác.
-------------------------------------------------------------------------------
create or replace function public.class_live_tag_label(p_tag text)
returns text language sql immutable as $$
  select case p_tag
    when 'game' then 'Hoàn thành trò chơi'
    when 'rules' then 'Đúng luật golf'
    when 'listen' then 'Nghe hiệu lệnh'
    when 'fair_play' then 'Fair play – bị trêu không đáp trả'
    when 'team_win' then 'Đội thắng'
    when 'fix' then 'Sửa nhầm'
  end
$$;

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
        if v_delta not in (-1, 1, 2, 3) then raise exception 'invalid_delta'; end if;
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

-------------------------------------------------------------------------------
-- Điểm khởi đầu (tổng điểm ghi trên giấy các buổi trước). Một dòng gốc opening_balance mỗi học viên;
-- sửa lại thì ghi phần chênh opening_balance_adjust — cùng quy tắc với reward_import_opening của admin.
-------------------------------------------------------------------------------
create or replace function public.class_live_set_opening(p_class_id uuid, p_student_id uuid, p_points int)
returns int language plpgsql volatile security definer set search_path = public as $$
declare v_cur int;
begin
  if not public.class_live_can(p_class_id) or not public.class_live_in_class(p_class_id, p_student_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_points is null or p_points < 0 or p_points > 100000 then raise exception 'points_out_of_range' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('reward_opening:' || p_student_id::text));
  select coalesce(sum(delta), 0) into v_cur from public.reward_ledger
  where student_id = p_student_id and source_type = 'opening_balance' and reason in ('opening_balance', 'opening_balance_adjust');
  if not exists (select 1 from public.reward_ledger where student_id = p_student_id and reason = 'opening_balance') then
    if p_points = 0 then return 0; end if;
    insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, note, created_by)
    values (p_student_id, p_points, 'opening_balance', 'opening_balance', p_student_id, 'Điểm khởi đầu (HLV nhập từ sổ giấy)', auth.uid());
  elsif p_points <> v_cur then
    insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, note, created_by)
    values (p_student_id, p_points - v_cur, 'opening_balance_adjust', 'opening_balance', p_student_id, 'HLV sửa điểm khởi đầu', auth.uid());
  end if;
  return p_points;
end $$;

-------------------------------------------------------------------------------
-- 5. Lịch sử của một bạn qua các buổi: chủ đề, điểm từng lý do, chuyên cần, nhận xét
-------------------------------------------------------------------------------
create or replace function public.class_live_history(p_class_id uuid, p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.class_live_can(p_class_id) or not public.class_live_in_class(p_class_id, p_student_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'opening', coalesce((select sum(l.delta) from public.reward_ledger l where l.student_id = p_student_id
                         and l.source_type = 'opening_balance' and l.reason in ('opening_balance', 'opening_balance_adjust')), 0),
    'total', public.class_live_total(p_student_id),
    'available', public.reward_available(p_student_id),
    'sessions', coalesce((select jsonb_agg(x order by x.session_date desc) from (
      select s.session_date, s.session_no, s.topic, c.name as class_name,
             coalesce((select sum(l.delta) from public.reward_ledger l
                       where l.student_id = p_student_id and l.source_type = 'class_session' and l.source_id = s.id), 0) as points,
             coalesce((select jsonb_object_agg(z.note, z.pts) from (
                 select coalesce(l.note, '') as note, sum(l.delta) as pts from public.reward_ledger l
                 where l.student_id = p_student_id and l.source_type = 'class_session' and l.source_id = s.id
                 group by l.note having sum(l.delta) <> 0) z), '{}') as by_reason,
             m.attendance, coalesce(m.leave_count, 0) as leave_count, coalesce(to_jsonb(m.comment_tags), '[]') as comment_tags, m.note
      from public.class_sessions s
      join public.classes c on c.id = s.class_id
      left join public.class_session_students m on m.session_id = s.id and m.student_id = p_student_id
      where s.class_id = p_class_id
        and (m.id is not null or exists (select 1 from public.reward_ledger l
                                         where l.student_id = p_student_id and l.source_type = 'class_session' and l.source_id = s.id))
      limit 200) x), '[]'));
end $$;

do $$
begin
  revoke execute on function public.class_live_can(uuid) from public, anon, authenticated;
  revoke execute on function public.class_live_in_class(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.class_live_total(uuid) from public, anon, authenticated;
  revoke execute on function public.class_live_session_id(uuid, date) from public, anon, authenticated;
  revoke execute on function public.class_live_tag_label(text) from public, anon;
  revoke execute on function public.class_live_create_student(uuid, text, date, text, uuid) from public, anon;
  revoke execute on function public.class_live_update_student(uuid, uuid, text, date, text) from public, anon;
  revoke execute on function public.class_live_board(uuid, date) from public, anon;
  revoke execute on function public.class_live_sync(jsonb) from public, anon;
  revoke execute on function public.class_live_set_opening(uuid, uuid, int) from public, anon;
  revoke execute on function public.class_live_history(uuid, uuid) from public, anon;
  grant execute on function public.class_live_create_student(uuid, text, date, text, uuid),
    public.class_live_update_student(uuid, uuid, text, date, text),
    public.class_live_board(uuid, date), public.class_live_sync(jsonb),
    public.class_live_set_opening(uuid, uuid, int), public.class_live_history(uuid, uuid) to authenticated;
end $$;
