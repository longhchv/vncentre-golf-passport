-- Tập luyện song ngữ: nội dung mẫu đã có bản tiếng Anh; các hàm trả thêm trường tiếng Anh. Dữ liệu thử bị huỷ ở cuối.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

do $$
declare
  u uuid := gen_random_uuid(); n int; r jsonb; q record; ans jsonb := '{}';
begin
  -- 1. Nội dung mẫu: không còn ô tiếng Anh trống
  select count(*) into n from public.training_program_blocks b, jsonb_array_elements(b.lines) l where coalesce(l ->> 'en', '') = '';
  if n > 0 then raise exception 'FAIL dòng giáo án chưa dịch: %', n; end if;
  select count(*) into n from public.training_program_blocks where coalesce(title_en, '') = '';
  if n > 0 then raise exception 'FAIL tên phần giáo án chưa dịch: %', n; end if;
  select count(*) into n from public.training_drills
  where coalesce(title_en, '') = '' or (goal_vi is not null and goal_en is null) or jsonb_array_length(steps_en) <> jsonb_array_length(steps)
     or (unit_vi is not null and unit_en is null) or (safety_vi is not null and safety_en is null);
  if n > 0 then raise exception 'FAIL bài tập chưa dịch: %', n; end if;
  select count(*) into n from public.training_challenges c
  where coalesce(title_en, '') = '' or (how_vi is not null and coalesce(how_en, '') = '')
     or exists (select 1 from jsonb_array_elements(c.parts) p where coalesce(p ->> 'label_en', '') = '');
  if n > 0 then raise exception 'FAIL thẻ chưa dịch: %', n; end if;
  select count(*) into n from public.training_quiz_questions
  where coalesce(question_en, '') = '' or explain_en is null or jsonb_array_length(options_en) <> jsonb_array_length(options);
  if n > 0 then raise exception 'FAIL câu luật chưa dịch: %', n; end if;
  select count(*) into n from public.training_path_steps where (benefit_vi is not null and benefit_en is null) or (focus_vi is not null and focus_en is null);
  if n > 0 then raise exception 'FAIL lộ trình chưa dịch'; end if;
  select count(*) into n from public.training_finance_plans where summary_en is null or tradeoff_en is null;
  if n > 0 then raise exception 'FAIL phương án chưa dịch'; end if;
  select count(*) into n from public.training_needs where advice_vi is not null and advice_en is null;
  if n > 0 then raise exception 'FAIL nhu cầu chưa dịch'; end if;
  select count(*) into n from public.training_age_limits where (sleep_vi is not null and sleep_en is null) or (note_vi is not null and note_en is null);
  if n > 0 then raise exception 'FAIL giới hạn tuổi chưa dịch'; end if;
  -- Bản tiếng Anh không còn chữ tiếng Việt có dấu
  if exists (select 1 from public.training_program_blocks b, jsonb_array_elements(b.lines) l where l ->> 'en' ~ '[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]') then
    raise exception 'FAIL còn tiếng Việt trong bản tiếng Anh';
  end if;

  -- 2. Câu hỏi luật trả options_en; nộp bài trả explain_en
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ten-' || u || '@example.test', now());
  perform pg_temp.act_as(u);
  r := public.training_quiz_questions('hcp54');
  if jsonb_array_length(r) = 0 or jsonb_array_length(r -> 0 -> 'options_en') <> jsonb_array_length(r -> 0 -> 'options') then
    raise exception 'FAIL quiz chưa có options_en: %', r -> 0;
  end if;
  if coalesce(r -> 0 ->> 'question_en', '') = '' then raise exception 'FAIL quiz chưa có question_en'; end if;
  perform pg_temp.act_as(null);

  -- 3. Hàm HLV chờ xác nhận có title_en (kiểm tra định nghĩa hàm)
  if position('title_en' in pg_get_functiondef('public.training_class_pending(uuid)'::regprocedure)) = 0 then
    raise exception 'FAIL training_class_pending chưa trả title_en';
  end if;
  if position('explain_en' in pg_get_functiondef('public.training_submit_quiz(uuid, text, jsonb)'::regprocedure)) = 0 then
    raise exception 'FAIL training_submit_quiz chưa trả explain_en';
  end if;

  raise exception 'ALL_OK';
end $$;
