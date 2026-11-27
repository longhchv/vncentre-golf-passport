-- Spec 24 · chế độ "Giữ phong độ" cho các bạn nhỏ (đợt 1 của đề xuất Tăng tốc trước giải / Giữ phong độ, anh Long chốt 27/11/2026).
-- Đề xuất: Claude Doc "Đề xuất: Tập luyện Intensive và Duy trì cho các bạn nhỏ".
--   · Giới hạn giờ theo tuổi chỉ là GỢI Ý (admin sửa), app cảnh báo khi vượt, không chặn. Từ 15 tuổi HLV duyệt tới 20 giờ/tuần.
--   · Phụ huynh chọn mức thời gian, ngày tập, nơi tập có sẵn; app sinh lịch tuần theo tỉ lệ phân bổ (admin sửa); mỗi việc có nút "đã làm".
--   · Kiểm tra 4 tuần một lần: tăng / giữ / tụt. Tuần thi học kỳ giảm tải. Nút "dấu hiệu quá sức" giảm một nửa khối lượng tuần đó.
-- Chỉ thêm bảng, hàm, dữ liệu mẫu.

-------------------------------------------------------------------------------
-- 1. Bảng cấu hình (admin sửa)
-------------------------------------------------------------------------------
create table public.training_age_limits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  age_from int not null check (age_from between 0 and 25),
  age_to int not null check (age_to between 0 and 25),
  week_hours numeric(4,1),            -- giờ golf gợi ý tối đa / tuần; null = bằng số tuổi
  session_max_min int not null default 60 check (session_max_min between 10 and 480),
  rest_days int not null default 1 check (rest_days between 0 and 7),
  sleep_vi text,
  coach_week_max numeric(4,1),        -- HLV được duyệt tới mức này (null = không áp dụng)
  note_vi text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (age_to >= age_from)
);

-- Tỉ lệ phân bổ của chế độ Giữ phong độ. skills = kỹ năng trong kho bài tập (training_drills.skill) dùng để chọn bài.
create table public.training_keep_split (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name_vi text not null,
  name_en text not null default '',
  pct int not null check (pct between 0 and 100),
  skills text[] not null default '{}',
  places text[] not null default '{}' check (places <@ array['home', 'range', 'sim3d', 'course']),  -- tập được ở đâu
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- 2. Dữ liệu của từng bạn
-------------------------------------------------------------------------------
create table public.training_keep_plans (
  student_id uuid primary key references public.students(id),
  id uuid not null default gen_random_uuid() unique,
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  option text not null default 'daily' check (option in ('daily', 'weekend', 'custom')),
  days int[] not null default '{1,2,3,4,5}',             -- 0 = Chủ nhật … 6 = Thứ bảy
  minutes_per_day int not null default 60 check (minutes_per_day between 10 and 480),
  places text[] not null default '{home}' check (places <@ array['home', 'range', 'sim3d', 'course'] and cardinality(places) > 0),
  light_until date,                                      -- tuần thi học kỳ: giảm tải đến hết ngày này
  coach_week_hours numeric(4,1),                         -- HLV duyệt mức cao (từ 15 tuổi)
  coach_approved_by uuid references public.profiles(user_id) on delete set null,
  is_active boolean not null default true,
  started_on date not null default public.vn_today(),
  updated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (days <@ array[0, 1, 2, 3, 4, 5, 6] and cardinality(days) between 1 and 7)
);

create table public.training_keep_done (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  day date not null,
  item_key text not null check (char_length(item_key) between 1 and 80),
  minutes int not null default 0 check (minutes between 0 and 480),
  marked_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, day, item_key)
);

create table public.training_keep_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  checked_on date not null default public.vn_today(),
  test_putt int not null check (test_putt between 0 and 5),
  test_chip int not null check (test_chip between 0 and 5),
  test_long int not null check (test_long between 0 and 5),
  nine_to_par int check (nine_to_par between -9 and 60),
  result text not null check (result in ('first', 'up', 'same', 'down')),
  note text,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index training_keep_checks_student_idx on public.training_keep_checks (student_id, checked_on desc);

create table public.training_overload_flags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  flagged_on date not null default public.vn_today(),
  signs text[] not null default '{}' check (signs <@ array['tired', 'no_fun', 'want_quit', 'pain']),
  note text,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index training_overload_flags_student_idx on public.training_overload_flags (student_id, flagged_on desc);

do $$
declare t text;
begin
  foreach t in array array['training_age_limits', 'training_keep_split', 'training_keep_plans'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['training_age_limits', 'training_keep_split', 'training_keep_plans', 'training_keep_checks', 'training_overload_flags'] loop
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
  foreach t in array array['training_age_limits', 'training_keep_split', 'training_keep_plans', 'training_keep_done', 'training_keep_checks', 'training_overload_flags'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  foreach t in array array['training_age_limits', 'training_keep_split'] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
  -- Dữ liệu của từng bạn: đọc khi xem được học viên; ghi chỉ qua hàm
  foreach t in array array['training_keep_plans', 'training_keep_done', 'training_keep_checks', 'training_overload_flags'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin() or coalesce(public.training_can_view(student_id), false))', t || '_read', t);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- 3. Hàm
-------------------------------------------------------------------------------
-- Ghi được: phụ huynh quản lý hồ sơ, các bạn tự nhập được (từ 11 tuổi), HLV của lớp, admin
create or replace function public.training_keep_can_edit(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin() or public.training_can_enter(p_student_id) or public.training_is_coach_of(p_student_id), false)
$$;

create or replace function public.training_set_keep_plan(p_student_id uuid, p_option text, p_days int[], p_minutes_per_day int,
                                                         p_places text[], p_light_until date default null, p_active boolean default true)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.training_keep_can_edit(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_option not in ('daily', 'weekend', 'custom') then raise exception 'invalid_option' using errcode = '22023'; end if;
  insert into public.training_keep_plans (student_id, option, days, minutes_per_day, places, light_until, is_active, updated_by)
  values (p_student_id, p_option, (select array_agg(distinct d order by d) from unnest(p_days) d), p_minutes_per_day,
          (select array_agg(distinct x order by x) from unnest(p_places) x), p_light_until, coalesce(p_active, true),
          case when exists (select 1 from public.profiles where user_id = auth.uid()) then auth.uid() end)
  on conflict (student_id) do update
  set option = excluded.option, days = excluded.days, minutes_per_day = excluded.minutes_per_day, places = excluded.places,
      light_until = excluded.light_until, is_active = excluded.is_active, updated_by = excluded.updated_by
  returning id into v_id;
  return v_id;
end $$;

-- HLV duyệt mức giờ cao cho bạn từ 15 tuổi (không vượt coach_week_max của nhóm tuổi)
create or replace function public.training_keep_approve_hours(p_student_id uuid, p_week_hours numeric)
returns numeric language plpgsql volatile security definer set search_path = public as $$
declare v_age int := public.training_student_age(p_student_id); v_max numeric;
begin
  if not coalesce(public.training_is_coach_of(p_student_id) or public.is_admin(), false) then
    raise exception 'coach_only' using errcode = '42501';
  end if;
  select coach_week_max into v_max from public.training_age_limits
  where coalesce(v_age, 0) between age_from and age_to order by sort_order limit 1;
  if v_max is null then raise exception 'not_allowed_for_age' using errcode = '22023'; end if;
  if p_week_hours is not null and (p_week_hours <= 0 or p_week_hours > v_max) then
    raise exception 'over_coach_max' using errcode = '22023';
  end if;
  update public.training_keep_plans set coach_week_hours = p_week_hours,
    coach_approved_by = case when p_week_hours is null then null else auth.uid() end
  where student_id = p_student_id;
  if not found then raise exception 'no_plan' using errcode = '22023'; end if;
  return p_week_hours;
end $$;

create or replace function public.training_keep_mark(p_student_id uuid, p_day date, p_item_key text, p_done boolean, p_minutes int default 0)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.training_keep_can_edit(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_day > public.vn_today() or p_day < public.vn_today() - 14 then raise exception 'day_out_of_range' using errcode = '22023'; end if;
  if p_done then
    insert into public.training_keep_done (student_id, day, item_key, minutes, marked_by)
    values (p_student_id, p_day, p_item_key, greatest(coalesce(p_minutes, 0), 0),
            case when exists (select 1 from public.profiles where user_id = auth.uid()) then auth.uid() end)
    on conflict (student_id, day, item_key) do nothing;
  else
    delete from public.training_keep_done where student_id = p_student_id and day = p_day and item_key = p_item_key;
  end if;
end $$;

-- Kiểm tra định kỳ: so với lần trước. Bài test 3 phần chênh từ 2 quả, 9 hố chênh từ 3 gậy.
-- Có chiều tăng mà không có chiều tụt → tăng; ngược lại → tụt; còn lại → giữ.
create or replace function public.training_keep_record_check(p_student_id uuid, p_putt int, p_chip int, p_long int,
                                                             p_nine_to_par int default null, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare prev public.training_keep_checks; v_up boolean := false; v_down boolean := false; v_res text; v_d int;
begin
  if not public.training_keep_can_edit(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into prev from public.training_keep_checks where student_id = p_student_id order by checked_on desc, created_at desc limit 1;
  if prev.id is null then
    v_res := 'first';
  else
    v_d := (p_putt + p_chip + p_long) - (prev.test_putt + prev.test_chip + prev.test_long);
    if v_d >= 2 then v_up := true; elsif v_d <= -2 then v_down := true; end if;
    if p_nine_to_par is not null and prev.nine_to_par is not null then
      if p_nine_to_par - prev.nine_to_par <= -3 then v_up := true; elsif p_nine_to_par - prev.nine_to_par >= 3 then v_down := true; end if;
    end if;
    v_res := case when v_up and not v_down then 'up' when v_down and not v_up then 'down' else 'same' end;
  end if;
  insert into public.training_keep_checks (student_id, test_putt, test_chip, test_long, nine_to_par, result, note, created_by, created_at)
  values (p_student_id, p_putt, p_chip, p_long, p_nine_to_par, v_res, nullif(btrim(coalesce(p_note, '')), ''),
          case when exists (select 1 from public.profiles where user_id = auth.uid()) then auth.uid() end, clock_timestamp());
  return jsonb_build_object('result', v_res,
    'total', p_putt + p_chip + p_long,
    'prev_total', case when prev.id is null then null else prev.test_putt + prev.test_chip + prev.test_long end);
end $$;

create or replace function public.training_flag_overload(p_student_id uuid, p_signs text[], p_note text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.training_keep_can_edit(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(cardinality(p_signs), 0) = 0 then raise exception 'no_signs' using errcode = '22023'; end if;
  insert into public.training_overload_flags (student_id, signs, note, created_by)
  values (p_student_id, (select array_agg(distinct s) from unnest(p_signs) s), nullif(btrim(coalesce(p_note, '')), ''),
          case when exists (select 1 from public.profiles where user_id = auth.uid()) then auth.uid() end)
  returning id into v_id;
  -- Báo HLV của các lớp đang học (thông báo trong app)
  insert into public.notifications (user_id, type, title_vi, title_en, body_vi, body_en, link)
  select distinct cs.user_id, 'training', 'Dấu hiệu quá sức', 'Signs of overtraining',
         s.full_name || ': phụ huynh đánh dấu dấu hiệu quá sức. App đã giảm một nửa khối lượng tuần này.',
         s.full_name || ': a parent flagged signs of overtraining. This week''s load was halved.',
         '/coach/classes/' || e.class_id || '/training'
  from public.enrollments e join public.class_staff cs on cs.class_id = e.class_id
  join public.students s on s.id = e.student_id
  where e.student_id = p_student_id and e.status = 'active' and cs.user_id is not null;
  return v_id;
end $$;

do $$
begin
  revoke execute on function public.training_keep_can_edit(uuid) from public, anon;
  grant execute on function public.training_keep_can_edit(uuid) to authenticated;
  revoke execute on function public.training_set_keep_plan(uuid, text, int[], int, text[], date, boolean) from public, anon;
  grant execute on function public.training_set_keep_plan(uuid, text, int[], int, text[], date, boolean) to authenticated;
  revoke execute on function public.training_keep_approve_hours(uuid, numeric) from public, anon;
  grant execute on function public.training_keep_approve_hours(uuid, numeric) to authenticated;
  revoke execute on function public.training_keep_mark(uuid, date, text, boolean, int) from public, anon;
  grant execute on function public.training_keep_mark(uuid, date, text, boolean, int) to authenticated;
  revoke execute on function public.training_keep_record_check(uuid, int, int, int, int, text) from public, anon;
  grant execute on function public.training_keep_record_check(uuid, int, int, int, int, text) to authenticated;
  revoke execute on function public.training_flag_overload(uuid, text[], text) from public, anon;
  grant execute on function public.training_flag_overload(uuid, text[], text) to authenticated;
end $$;

-------------------------------------------------------------------------------
-- 4. Dữ liệu mẫu (đề xuất 27/11/2026, admin sửa)
-------------------------------------------------------------------------------
insert into public.training_age_limits (age_from, age_to, week_hours, session_max_min, rest_days, sleep_vi, coach_week_max, note_vi, sort_order) values
  (0,  8,  5,    60,  2, '9–12 giờ',  null, 'Chủ yếu trò chơi và thẻ level; chỉ có tuần vui trước giải SNAG', 10),
  (9,  10, null, 90,  2, '9–12 giờ',  null, 'Giờ golf mỗi tuần không quá số tuổi (gợi ý)', 20),
  (11, 14, null, 150, 1, '9–12 giờ (13–14 tuổi: 8–10 giờ)', null, 'Giờ golf mỗi tuần không quá số tuổi (gợi ý)', 30),
  (15, 17, null, 240, 1, '8–10 giờ',  20,   'HLV duyệt được tới 20 giờ/tuần', 40);

insert into public.training_keep_split (code, name_vi, name_en, pct, skills, places, sort_order) values
  ('putting',    'Putting',                        'Putting',              30, '{putt}',                '{home,range,sim3d,course}', 10),
  ('short_game', 'Short game (chip, pitch, bunker)', 'Short game',          25, '{chip,pitch}',          '{home,range,course}',       20),
  ('full_swing', 'Cú đánh chính',                  'Full swing',           25, '{full_swing,basics}',   '{home,range,sim3d}',        30),
  ('on_course',  'Lên sân hoặc 9 hố trên máy 3D',  'On course / simulator', 10, '{on_course}',          '{course,sim3d}',            40),
  ('fitness',    'Thể lực, giãn cơ',               'Fitness and mobility', 10, '{fitness}',             '{home,range,sim3d,course}', 50)
on conflict (code) do nothing;
