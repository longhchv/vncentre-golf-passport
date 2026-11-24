-- Spec 25 · bước 2: thẻ thử thách cho người lớn (gắn theo chương trình), bài kiểm tra luật, và công cụ admin để
-- thêm/bớt tuần, buổi riêng theo ngày, nhân bản chương trình. Chỉ thêm và nới ràng buộc; không đổi dữ liệu cũ.
-- Chỉ tiêu thẻ và câu hỏi là bản tạm, admin sửa được.

-------------------------------------------------------------------------------
-- 0. Sửa lỗi quyền: training_is_self_student trả NULL khi người gọi không có hồ sơ học viên, làm cho
--    "if not training_can_view(...)" không chặn được (NULL không phải false). Ép về true/false.
-------------------------------------------------------------------------------
create or replace function public.training_is_self_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_student_id() = p_student_id, false)
    and coalesce(public.training_student_age(p_student_id), 0) >= public.setting_int('training.child_self_entry_min_age', 11)
$$;
create or replace function public.training_can_enter(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.training_enabled() and (public.can_manage_student(p_student_id) or public.training_is_self_student(p_student_id)), false)
$$;
create or replace function public.training_can_view(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.training_can_enter(p_student_id) or public.my_student_id() = p_student_id or public.training_is_coach_of(p_student_id), false)
$$;

-------------------------------------------------------------------------------
-- 1. Thẻ thử thách theo chương trình (người lớn không đi theo level)
-------------------------------------------------------------------------------
alter table public.training_challenges alter column level_number drop not null;
alter table public.training_challenges add column if not exists program_code text references public.training_programs(code) on update cascade;
alter table public.training_challenges drop constraint if exists training_challenges_level_or_program;
alter table public.training_challenges add constraint training_challenges_level_or_program
  check (level_number is not null or program_code is not null);
create index if not exists training_challenges_program_idx on public.training_challenges (program_code, sort_order) where program_code is not null;

insert into public.training_challenges (program_code, code, kind, area, title_vi, how_vi, parts, verify, points_rank, points_reward, is_provisional, sort_order)
values
  ('hcp54', 'HCP54-PUTT-SHORT', 'practice', 'putt_short', 'Putt ngắn 3 ft', 'Đặt 10 bóng cách lỗ 3 ft, putt lần lượt từng bóng.',
   '[{"label_vi":"Vào lỗ từ 3 ft","attempts":10,"target":7}]', 'self', 10, 10, true, 1),
  ('hcp54', 'HCP54-PUTT-LONG', 'practice', 'putt_long', 'Putt xa 20 ft', 'Tạo vòng 6 ft quanh lỗ. 10 putt từ 20 ft.',
   '[{"label_vi":"Dừng trong 6 ft","attempts":10,"target":5}]', 'self', 10, 10, true, 2),
  ('hcp54', 'HCP54-CHIP', 'practice', 'chip', 'Chip lên green', '10 chip từ mép green tới lỗ ở giữa green.',
   '[{"label_vi":"Lên green","attempts":10,"target":8}]', 'self', 10, 10, true, 3),
  ('hcp54', 'HCP54-PITCH', 'practice', 'pitch', 'Pitch 30 yd', '10 pitch tới green cách 30 yd.',
   '[{"label_vi":"Lên green","attempts":10,"target":5}]', 'self', 10, 10, true, 4),
  ('hcp54', 'HCP54-IRON', 'practice', 'approach', 'Sắt 7 bay lên', '10 bóng sắt 7, bóng đặt trên tee. Tính bóng bay lên, không top, không chunk.',
   '[{"label_vi":"Bóng bay lên","attempts":10,"target":7}]', 'self', 10, 10, true, 5),
  ('hcp54', 'HCP54-TEE', 'practice', 'tee', 'Phát bóng vào hành lang 40 yd', '10 cú phát bóng bằng gậy dễ nhất, chọn hai mốc cách nhau 40 yd làm hành lang.',
   '[{"label_vi":"Vào hành lang","attempts":10,"target":6}]', 'self', 10, 10, true, 6),
  ('b100', 'B100-PUTT-SHORT', 'practice', 'putt_short', 'Putt ngắn 4 ft', 'Đặt 10 bóng cách lỗ 4 ft.',
   '[{"label_vi":"Vào lỗ từ 4 ft","attempts":10,"target":8}]', 'self', 10, 10, true, 1),
  ('b100', 'B100-PUTT-LONG', 'practice', 'putt_long', 'Putt xa 25 ft', 'Tạo vòng 3 ft quanh lỗ. 10 putt từ 25 ft.',
   '[{"label_vi":"Dừng trong 3 ft","attempts":10,"target":6}]', 'self', 10, 10, true, 2),
  ('b100', 'B100-CHIP', 'practice', 'chip', 'Chip trong 6 ft', '10 chip từ mép green tới lỗ vừa (25 ft).',
   '[{"label_vi":"Dừng trong 6 ft","attempts":10,"target":5}]', 'self', 10, 10, true, 3),
  ('b100', 'B100-PITCH', 'practice', 'pitch', 'Pitch 50 yd', '10 pitch tới green cách 50 yd.',
   '[{"label_vi":"Lên green","attempts":10,"target":5}]', 'self', 10, 10, true, 4),
  ('b100', 'B100-SCRAMBLE', 'practice', 'other', 'Cứu điểm quanh green', 'Một bóng, 10 lượt từ mép green: lên green và vào lỗ trong tối đa 2 putt.',
   '[{"label_vi":"Lượt thành công","attempts":10,"target":7}]', 'self', 10, 10, true, 5),
  ('b100', 'B100-IRON', 'practice', 'approach', 'Sắt 7 vào hành lang 30 yd', '10 bóng sắt 7 tới mục tiêu, hành lang rộng 30 yd.',
   '[{"label_vi":"Vào hành lang","attempts":10,"target":6}]', 'self', 10, 10, true, 6),
  ('b100', 'B100-TEE', 'practice', 'tee', 'Phát bóng vào hành lang 40 yd', '10 cú phát bóng, hành lang rộng 40 yd.',
   '[{"label_vi":"Vào hành lang","attempts":10,"target":7}]', 'self', 10, 10, true, 7)
on conflict (code) do nothing;

-------------------------------------------------------------------------------
-- 2. Bài kiểm tra luật (câu hỏi giữ kín đáp án; chấm trên máy chủ)
-------------------------------------------------------------------------------
create table if not exists public.training_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  program_code text not null references public.training_programs(code) on update cascade,
  question_vi text not null,
  question_en text not null default '',
  -- ["phương án 1", "phương án 2", ...]
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  correct_index int not null check (correct_index >= 0),
  explain_vi text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (correct_index < jsonb_array_length(options))
);
create index if not exists training_quiz_questions_prog_idx on public.training_quiz_questions (program_code, sort_order);

create table if not exists public.training_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  program_code text not null,
  answers jsonb not null,
  score int not null,
  total int not null,
  passed boolean not null,
  submitted_by uuid,
  merge_trail uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists training_quiz_attempts_student_idx on public.training_quiz_attempts (student_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['training_quiz_questions', 'training_quiz_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.training_quiz_questions'::regclass) then
    create trigger set_updated_at before update on public.training_quiz_questions for each row execute function public.set_updated_at();
    create trigger audit_row after insert or update or delete on public.training_quiz_questions for each row execute function public.audit_row();
  end if;
end $$;

drop policy if exists training_quiz_q_admin on public.training_quiz_questions;
create policy training_quiz_q_admin on public.training_quiz_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists training_quiz_a_read on public.training_quiz_attempts;
create policy training_quiz_a_read on public.training_quiz_attempts for select to authenticated using (public.training_can_view(student_id));

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('training.quiz_pass_ratio', '0.8', 'Tỉ lệ câu đúng để qua bài kiểm tra luật (0.8 = 16/20)', 'Share of correct answers to pass the rules quiz', true)
on conflict do nothing;

-- Câu hỏi (không kèm đáp án) cho người đang tập
create or replace function public.training_quiz_questions(p_program_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'question_vi', question_vi, 'question_en', question_en, 'options', options)
                            order by sort_order, created_at), '[]')
  from public.training_quiz_questions where program_code = p_program_code and is_active and auth.uid() is not null;
$$;

-- Nộp bài: p_answers = {"<id câu hỏi>": chỉ số phương án}. Trả điểm, đạt hay chưa, đáp án và giải thích từng câu.
create or replace function public.training_submit_quiz(p_student_id uuid, p_program_code text, p_answers jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_total int; v_score int; v_ratio numeric; v_passed boolean; v_detail jsonb;
begin
  if not coalesce(public.can_manage_student(p_student_id) or public.training_is_self_student(p_student_id), false) or not public.training_enabled() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_answers, 'null')) <> 'object' then raise exception 'invalid_answers' using errcode = '22023'; end if;
  select count(*), count(*) filter (where (p_answers ->> q.id::text)::int = q.correct_index),
         coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'correct_index', q.correct_index,
                                               'chosen', (p_answers ->> q.id::text)::int, 'explain_vi', q.explain_vi)
                            order by q.sort_order, q.created_at), '[]')
  into v_total, v_score, v_detail
  from public.training_quiz_questions q where q.program_code = p_program_code and q.is_active;
  if v_total = 0 then raise exception 'quiz_not_found' using errcode = '22023'; end if;
  v_ratio := public.setting_num('training.quiz_pass_ratio', 0.8);
  v_passed := v_score >= ceil(v_total * v_ratio);
  insert into public.training_quiz_attempts (student_id, program_code, answers, score, total, passed, submitted_by)
  values (p_student_id, p_program_code, p_answers, v_score, v_total, v_passed, auth.uid());
  return jsonb_build_object('score', v_score, 'total', v_total, 'passed', v_passed,
                            'need', ceil(v_total * v_ratio)::int, 'detail', v_detail);
end $$;

-- Gộp hồ sơ: bài kiểm tra luật đi theo
create or replace function public.training_quiz_follow_merge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.merged_into_student_id is not null and old.merged_into_student_id is null then
    update public.training_quiz_attempts set student_id = new.merged_into_student_id, merge_trail = merge_trail || old.id where student_id = old.id;
  elsif new.merged_into_student_id is null and old.merged_into_student_id is not null then
    update public.training_quiz_attempts set student_id = old.id, merge_trail = array_remove(merge_trail, old.id) where old.id = any(merge_trail);
  end if;
  return new;
end $$;
drop trigger if exists training_quiz_follow_merge on public.students;
create trigger training_quiz_follow_merge after update of merged_into_student_id on public.students
  for each row execute function public.training_quiz_follow_merge();
revoke execute on function public.training_quiz_follow_merge() from public, anon, authenticated;

insert into public.training_quiz_questions (program_code, sort_order, question_vi, options, correct_index, explain_vi)
select 'hcp54', n, q, o::jsonb, c, e from (values
  (1, 'Bóng ra ngoài biên (OB). Xử lý thế nào?', '["Thả bóng tại chỗ bóng ra biên, phạt 2 gậy","Phạt 1 gậy, đánh lại từ chỗ vừa đánh","Không phạt, đánh lại từ chỗ vừa đánh","Phạt 1 gậy, thả cạnh vạch biên"]', 1, 'Phạt 1 gậy và đánh lại từ chỗ vừa đánh. Một số sân có luật địa phương cho thả gần chỗ bóng ra với 2 gậy phạt.'),
  (2, 'Thời gian tối đa để tìm bóng là bao lâu?', '["2 phút","3 phút","5 phút","Không giới hạn"]', 1, 'Từ năm 2019 thời gian tìm bóng là 3 phút.'),
  (3, 'Không chắc tìm được bóng hoặc bóng có thể ra biên. Nên làm gì?', '["Đi tìm trước, không thấy thì quay lại","Đánh bóng tạm trước khi đi tìm","Thả bóng mới ở chỗ đoán bóng rơi","Bỏ hố đó"]', 1, 'Đánh bóng tạm (provisional) giúp không phải quay lại, giữ nhịp chơi.'),
  (4, 'Bóng nằm trong vùng phạt cọc đỏ. Cách nào sau đây được phép?', '["Thả trong 2 gậy từ điểm bóng cắt mép vùng phạt, không gần lỗ hơn, phạt 1 gậy","Thả bên kia hồ, không phạt","Thả gần green, phạt 1 gậy","Nhặt bóng, không phạt"]', 0, 'Vùng phạt đỏ cho thả ngang trong 2 chiều dài gậy, phạt 1 gậy. Cũng có thể đánh bóng nguyên trạng không phạt.'),
  (5, 'Với vùng phạt cọc vàng, cách nào KHÔNG được phép?', '["Đánh lại từ chỗ vừa đánh, phạt 1 gậy","Thả trên đường thẳng nối lỗ với điểm bóng cắt mép, phía sau, phạt 1 gậy","Thả trong 2 gậy từ điểm bóng cắt mép vùng phạt","Đánh bóng nguyên trạng"]', 2, 'Thả ngang trong 2 chiều dài gậy chỉ áp dụng cho vùng phạt đỏ.'),
  (6, 'Ai quyết định bóng "không đánh được"?', '["Người ghi điểm","Ban tổ chức","Chính người chơi","Caddie"]', 2, 'Người chơi tự quyết, ở bất kỳ đâu trừ trong vùng phạt; phạt 1 gậy.'),
  (7, 'Đấu gậy, đánh nhầm bóng của người khác. Phạt thế nào?', '["Không phạt","Phạt 1 gậy","Phạt 2 gậy và phải đánh bóng của mình","Bị loại"]', 2, 'Phạt 2 gậy; cú đánh nhầm không tính, phải sửa lỗi bằng cách đánh bóng của mình.'),
  (8, 'Trên green, bóng putt chạm cờ đang cắm trong lỗ.', '["Phạt 2 gậy","Phạt 1 gậy","Không phạt","Phải putt lại"]', 2, 'Từ năm 2019 được putt khi cờ vẫn cắm, chạm cờ không phạt.'),
  (9, 'Trên green được sửa những gì trên đường putt?', '["Chỉ vết bóng rơi","Vết bóng rơi và vết giày","Không được sửa gì","Chỉ sửa sau khi putt xong"]', 1, 'Được sửa hầu hết hư hại do người hoặc vật gây ra, gồm vết bóng rơi và vết giày.'),
  (10, 'Trước khi nhấc bóng trên green phải làm gì?', '["Không cần làm gì","Đánh dấu vị trí bóng","Báo ban tổ chức","Xin phép bạn chơi"]', 1, 'Phải đánh dấu vị trí bóng trước khi nhấc, nếu không bị phạt 1 gậy.'),
  (11, 'Đấu gậy, phát bóng ngoài khu phát bóng (đặt bóng trước vạch tee).', '["Không phạt","Phạt 1 gậy, đánh tiếp","Phạt 2 gậy và đánh lại trong khu phát bóng","Bị loại ngay"]', 2, 'Phạt 2 gậy, cú đánh đó không tính, phải đánh lại từ trong khu phát bóng.'),
  (12, 'Khu phát bóng sâu bao nhiêu tính từ vạch tee?', '["1 chiều dài gậy","2 chiều dài gậy","3 bước chân","Không giới hạn"]', 1, 'Khu phát bóng là hình chữ nhật sâu 2 chiều dài gậy phía sau hai vạch tee.'),
  (13, 'Trong bunker, chạm gậy xuống cát ngay sau bóng khi tập swing.', '["Không phạt","Phạt 1 gậy","Phạt 2 gậy","Chỉ nhắc nhở"]', 2, 'Chạm cát ngay trước hoặc sau bóng, hoặc khi tập swing, bị phạt chung (2 gậy trong đấu gậy).'),
  (14, 'Bóng nằm trên đường xe điện (vật cản cố định). Được xử lý thế nào?', '["Phải đánh nguyên trạng","Thả trong 1 chiều dài gậy từ điểm gần nhất không bị cản, không gần lỗ hơn, không phạt","Thả trong 2 chiều dài gậy, phạt 1 gậy","Thả ở bất kỳ đâu trên fairway"]', 1, 'Vật cản cố định được giải thoát miễn phí trong 1 chiều dài gậy.'),
  (15, 'Thả bóng đúng cách là thả từ độ cao nào?', '["Ngang vai","Ngang đầu gối","Ngang hông","Đặt sát mặt đất"]', 1, 'Từ năm 2019 thả bóng từ độ cao ngang đầu gối.'),
  (16, 'Số gậy tối đa được mang trong túi khi thi đấu?', '["12","13","14","16"]', 2, 'Tối đa 14 gậy.'),
  (17, 'Bóng bay về phía người khác. Phải làm gì?', '["Im lặng","Hô to \"Fore\"","Vẫy tay","Chạy theo bóng"]', 1, 'Hô to "Fore" để cảnh báo, kể cả khi không chắc bóng có tới người đó.'),
  (18, 'Người phía trước vẫn còn trong tầm đánh của mình. Nên làm gì?', '["Đánh nhẹ tay","Chờ họ đi khỏi tầm","Hô báo rồi đánh","Đánh sang bên cạnh"]', 1, 'Luôn chờ người phía trước ra khỏi tầm bóng.'),
  (19, 'Trước khi có handicap, mỗi hố được tính tối đa bao nhiêu gậy khi nộp điểm?', '["Par + 2","Par + 3","Par + 5","Không giới hạn"]', 2, 'Theo luật handicap, trước khi có chỉ số, mỗi hố tính tối đa par + 5.'),
  (20, 'Một vòng nộp tính handicap cần điều gì?', '["Chơi một mình là được","Có người ghi điểm cùng chơi xác nhận","Phải có caddie","Chỉ cần ảnh chụp phiếu"]', 1, 'Vòng nộp handicap cần người ghi điểm cùng chơi xác nhận.')
) v(n, q, o, c, e)
where not exists (select 1 from public.training_quiz_questions where program_code = 'hcp54');

-------------------------------------------------------------------------------
-- 3. Admin chỉnh giáo án: thêm/bớt tuần, buổi riêng theo ngày, nhân bản chương trình
-------------------------------------------------------------------------------
-- Chép một buổi (kèm các phần) sang tuần/ngày khác
create or replace function public.training_admin_copy_session(p_session_id uuid, p_program_id uuid, p_week int, p_day int)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.training_program_sessions (program_id, week_no, day_no) values (p_program_id, p_week, p_day) returning id into v_id;
  insert into public.training_program_blocks (session_id, sort_order, area, title_vi, title_en, est_minutes, lines)
  select v_id, sort_order, area, title_vi, title_en, est_minutes, lines from public.training_program_blocks where session_id = p_session_id;
  if not exists (select 1 from public.training_program_blocks where session_id = v_id) then
    insert into public.training_program_blocks (session_id, sort_order, area, title_vi, est_minutes, lines)
    values (v_id, 0, 'putt', 'Phần mới', 15, '[{"t":"b","vi":"Bài tập mới","en":""}]');
  end if;
  return v_id;
end $$;

-- Thêm một tuần vào cuối (chép buổi chung của tuần p_copy_week, mặc định tuần cuối)
create or replace function public.training_admin_add_week(p_program_id uuid, p_copy_week int default null)
returns int language plpgsql volatile security definer set search_path = public as $$
declare p public.training_programs%rowtype; v_src uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.training_programs where id = p_program_id for update;
  if p.id is null then raise exception 'program_not_found' using errcode = '22023'; end if;
  if p.weeks >= 52 then raise exception 'too_many_weeks' using errcode = '22023'; end if;
  select id into v_src from public.training_program_sessions
  where program_id = p.id and week_no = coalesce(p_copy_week, p.weeks) order by day_no limit 1;
  update public.training_programs set weeks = weeks + 1 where id = p.id;
  perform public.training_admin_copy_session(v_src, p.id, p.weeks + 1, 0);
  return p.weeks + 1;
end $$;

-- Bớt tuần cuối (không bớt được nếu đã có người tập phần của tuần đó)
create or replace function public.training_admin_remove_last_week(p_program_id uuid)
returns int language plpgsql volatile security definer set search_path = public as $$
declare p public.training_programs%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.training_programs where id = p_program_id for update;
  if p.id is null then raise exception 'program_not_found' using errcode = '22023'; end if;
  if p.weeks <= 1 then raise exception 'last_week' using errcode = '22023'; end if;
  if exists (select 1 from public.training_session_items i join public.training_program_blocks b on b.id = i.block_id
             join public.training_program_sessions s on s.id = b.session_id where s.program_id = p.id and s.week_no = p.weeks) then
    raise exception 'week_in_use' using errcode = '22023';
  end if;
  delete from public.training_program_sessions where program_id = p.id and week_no = p.weeks;
  update public.training_programs set weeks = weeks - 1 where id = p.id;
  return p.weeks - 1;
end $$;

-- Tạo buổi riêng cho một ngày (chép từ buổi chung của tuần) hoặc xoá buổi riêng
create or replace function public.training_admin_add_day_session(p_program_id uuid, p_week int, p_day int)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_src uuid; v_days int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select days_per_week into v_days from public.training_programs where id = p_program_id;
  if p_day < 1 or p_day > coalesce(v_days, 0) then raise exception 'invalid_day' using errcode = '22023'; end if;
  if exists (select 1 from public.training_program_sessions where program_id = p_program_id and week_no = p_week and day_no = p_day) then
    raise exception 'day_exists' using errcode = '22023';
  end if;
  select id into v_src from public.training_program_sessions where program_id = p_program_id and week_no = p_week order by day_no limit 1;
  return public.training_admin_copy_session(v_src, p_program_id, p_week, p_day);
end $$;

create or replace function public.training_admin_delete_session(p_session_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare s public.training_program_sessions%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from public.training_program_sessions where id = p_session_id;
  if s.id is null then raise exception 'session_not_found' using errcode = '22023'; end if;
  if (select count(*) from public.training_program_sessions where program_id = s.program_id and week_no = s.week_no) <= 1 then
    raise exception 'last_session' using errcode = '22023';
  end if;
  if exists (select 1 from public.training_session_items i join public.training_program_blocks b on b.id = i.block_id where b.session_id = s.id) then
    raise exception 'session_in_use' using errcode = '22023';
  end if;
  delete from public.training_program_sessions where id = s.id;
end $$;

-- Nhân bản chương trình (để làm bản mới mà không đụng người đang tập bản cũ)
create or replace function public.training_admin_clone_program(p_program_id uuid, p_code text, p_name_vi text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare p public.training_programs%rowtype; v_id uuid; s record;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.training_programs where id = p_program_id;
  if p.id is null then raise exception 'program_not_found' using errcode = '22023'; end if;
  if coalesce(btrim(p_code), '') = '' or exists (select 1 from public.training_programs where code = btrim(p_code)) then
    raise exception 'code_taken' using errcode = '22023';
  end if;
  insert into public.training_programs (code, name_vi, name_en, kind, audience, target_hcp_min, target_hcp_max, weeks, days_per_week,
                                        summary_vi, summary_en, is_active, sort_order)
  values (btrim(p_code), coalesce(nullif(btrim(p_name_vi), ''), p.name_vi || ' (bản sao)'), p.name_en, p.kind, p.audience,
          null, null, p.weeks, p.days_per_week, p.summary_vi, p.summary_en, false, p.sort_order + 100)
  returning id into v_id;
  for s in select * from public.training_program_sessions where program_id = p.id order by week_no, day_no loop
    perform public.training_admin_copy_session(s.id, v_id, s.week_no, s.day_no);
  end loop;
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.training_quiz_questions(text)', 'public.training_submit_quiz(uuid, text, jsonb)',
    'public.training_admin_copy_session(uuid, uuid, int, int)', 'public.training_admin_add_week(uuid, int)',
    'public.training_admin_remove_last_week(uuid)', 'public.training_admin_add_day_session(uuid, int, int)',
    'public.training_admin_delete_session(uuid)', 'public.training_admin_clone_program(uuid, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
