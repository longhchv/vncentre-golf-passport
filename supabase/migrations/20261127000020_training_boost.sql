-- Spec 24 · chế độ "Tăng tốc trước giải" cho các bạn nhỏ (đợt 2, anh Long chốt 27/11/2026) + màn hình HLV xem phong độ cả lớp.
-- Đề xuất: Claude Doc "Đề xuất: Tập luyện Intensive và Duy trì cho các bạn nhỏ".
--   · 4 gói: 1 tuần, 2 tuần, 1 tháng, vài tháng (12 tuần); mỗi gói 4 chặng: đo trình độ → tập phần yếu → mô phỏng thi đấu → giảm tải.
--   · Dưới 9 tuổi chỉ có "tuần vui trước giải SNAG" (trò chơi, tối đa 1 giờ/ngày).
--   · Giới hạn theo tuổi chỉ là gợi ý (dùng training_age_limits của Giữ phong độ). Đánh dấu "đã làm" dùng chung training_keep_done.
--   · Sau ngày thi: 1 tuần hồi sức rồi quay về Giữ phong độ.
-- Chỉ thêm bảng, hàm, dữ liệu mẫu.

create table public.training_boost_packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name_vi text not null,
  name_en text not null default '',
  -- số ngày từng chặng: {"test":1,"weak":3,"sim":2,"taper":1} hoặc {"fun":7}
  phases jsonb not null check (jsonb_typeof(phases) = 'object'),
  min_age int not null default 0,
  max_age int not null default 25,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_boost_plans (
  student_id uuid primary key references public.students(id),
  id uuid not null default gen_random_uuid() unique,
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  package_code text not null references public.training_boost_packages(code) on update cascade,
  event_name text not null check (char_length(btrim(event_name)) between 2 and 160),
  event_date date not null,
  course_name text,
  holes int not null default 18 check (holes in (6, 9, 18)),
  days int[] not null default '{1,2,3,4,5,6}' check (days <@ array[0, 1, 2, 3, 4, 5, 6] and cardinality(days) between 1 and 7),
  minutes_per_day int not null default 90 check (minutes_per_day between 10 and 480),
  places text[] not null default '{home,range}' check (places <@ array['home', 'range', 'sim3d', 'course'] and cardinality(places) > 0),
  weak_areas text[] not null default '{putting,short_game}' check (cardinality(weak_areas) between 1 and 2),
  hole_notes jsonb not null default '{}' check (jsonb_typeof(hole_notes) = 'object'),   -- {"1":"ghi chú hố 1", ...}
  status text not null default 'active' check (status in ('active', 'cancelled')),
  updated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['training_boost_packages', 'training_boost_plans'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create policy training_boost_packages_read on public.training_boost_packages for select to authenticated using (true);
create policy training_boost_packages_admin on public.training_boost_packages for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy training_boost_plans_read on public.training_boost_plans for select to authenticated
  using (public.is_admin() or coalesce(public.training_can_view(student_id), false));

-------------------------------------------------------------------------------
-- Hàm
-------------------------------------------------------------------------------
create or replace function public.training_set_boost_plan(p_student_id uuid, p_package text, p_event_name text, p_event_date date,
  p_course_name text, p_holes int, p_days int[], p_minutes_per_day int, p_places text[], p_weak_areas text[])
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare pk public.training_boost_packages; v_age int := public.training_student_age(p_student_id); v_id uuid; v_total int;
begin
  if not public.training_keep_can_edit(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into pk from public.training_boost_packages where code = p_package and is_active;
  if pk.id is null then raise exception 'invalid_package' using errcode = '22023'; end if;
  if v_age is not null and (v_age < pk.min_age or v_age > pk.max_age) then raise exception 'package_not_for_age' using errcode = '22023'; end if;
  if p_event_date <= public.vn_today() then raise exception 'event_in_past' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_weak_areas) w where not exists (select 1 from public.training_keep_split s where s.code = w)) then
    raise exception 'invalid_area' using errcode = '22023';
  end if;
  insert into public.training_boost_plans (student_id, package_code, event_name, event_date, course_name, holes, days, minutes_per_day,
                                           places, weak_areas, status, updated_by)
  values (p_student_id, p_package, btrim(p_event_name), p_event_date, nullif(btrim(coalesce(p_course_name, '')), ''), coalesce(p_holes, 18),
          (select array_agg(distinct d order by d) from unnest(p_days) d), p_minutes_per_day,
          (select array_agg(distinct x order by x) from unnest(p_places) x),
          (select array_agg(distinct w) from unnest(p_weak_areas) w), 'active',
          case when exists (select 1 from public.profiles where user_id = auth.uid()) then auth.uid() end)
  on conflict (student_id) do update
  set package_code = excluded.package_code, event_name = excluded.event_name, event_date = excluded.event_date,
      course_name = excluded.course_name, holes = excluded.holes, days = excluded.days, minutes_per_day = excluded.minutes_per_day,
      places = excluded.places, weak_areas = excluded.weak_areas, status = 'active', updated_by = excluded.updated_by,
      hole_notes = case when training_boost_plans.event_date = excluded.event_date then training_boost_plans.hole_notes else '{}' end
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.training_cancel_boost(p_student_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.training_keep_can_edit(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.training_boost_plans set status = 'cancelled' where student_id = p_student_id;
end $$;

-- Sổ sân giải: ghi chiến thuật từng hố
create or replace function public.training_boost_note(p_student_id uuid, p_hole int, p_note text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.training_keep_can_edit(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_hole not between 1 and 18 then raise exception 'invalid_hole' using errcode = '22023'; end if;
  update public.training_boost_plans
  set hole_notes = case when nullif(btrim(coalesce(p_note, '')), '') is null then hole_notes - p_hole::text
                        else hole_notes || jsonb_build_object(p_hole::text, left(btrim(p_note), 500)) end
  where student_id = p_student_id;
  if not found then raise exception 'no_plan' using errcode = '22023'; end if;
end $$;

-- HLV: phong độ cả lớp (chế độ đang dùng, phút đã làm 7 ngày qua, lần kiểm tra gần nhất, dấu hiệu quá sức tuần này)
create or replace function public.training_class_form(p_class_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_monday date := public.vn_today() - ((extract(isodow from public.vn_today())::int) - 1);
begin
  if not (public.is_center_staff() or public.is_class_staff(p_class_id)) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'full_name') from (
    select jsonb_build_object(
      'student_id', s.id, 'full_name', s.full_name, 'age', public.training_student_age(s.id),
      'keep', case when kp.student_id is not null and kp.is_active then jsonb_build_object('days', cardinality(kp.days), 'minutes', kp.minutes_per_day,
                    'light_until', kp.light_until, 'coach_week_hours', kp.coach_week_hours) end,
      'boost', case when bp.student_id is not null and bp.status = 'active' and bp.event_date >= public.vn_today() - 7 then
                    jsonb_build_object('event_name', bp.event_name, 'event_date', bp.event_date, 'package', bp.package_code) end,
      'done_7d', coalesce((select sum(d.minutes) from public.training_keep_done d where d.student_id = s.id and d.day > public.vn_today() - 7), 0),
      'last_check', (select jsonb_build_object('checked_on', c.checked_on, 'result', c.result) from public.training_keep_checks c
                     where c.student_id = s.id order by c.checked_on desc, c.created_at desc limit 1),
      'overload', exists (select 1 from public.training_overload_flags f where f.student_id = s.id and f.flagged_on >= v_monday)
    ) as x
    from public.enrollments e join public.students s on s.id = e.student_id
    left join public.training_keep_plans kp on kp.student_id = s.id
    left join public.training_boost_plans bp on bp.student_id = s.id
    where e.class_id = p_class_id and e.status = 'active' and s.deleted_at is null) q), '[]');
end $$;

do $$
begin
  revoke execute on function public.training_set_boost_plan(uuid, text, text, date, text, int, int[], int, text[], text[]) from public, anon;
  grant execute on function public.training_set_boost_plan(uuid, text, text, date, text, int, int[], int, text[], text[]) to authenticated;
  revoke execute on function public.training_cancel_boost(uuid) from public, anon;
  grant execute on function public.training_cancel_boost(uuid) to authenticated;
  revoke execute on function public.training_boost_note(uuid, int, text) from public, anon;
  grant execute on function public.training_boost_note(uuid, int, text) to authenticated;
  revoke execute on function public.training_class_form(uuid) from public, anon;
  grant execute on function public.training_class_form(uuid) to authenticated;
end $$;

-------------------------------------------------------------------------------
-- Dữ liệu mẫu (đề xuất 27/11/2026, admin sửa)
-------------------------------------------------------------------------------
insert into public.training_boost_packages (code, name_vi, name_en, phases, min_age, max_age, sort_order) values
  ('fun',  'Tuần vui trước giải SNAG', 'Fun week before a SNAG event', '{"fun":7}',                                  0, 8,  10),
  ('w1',   '1 tuần',                   '1 week',                       '{"test":1,"weak":3,"sim":2,"taper":1}',     9, 25, 20),
  ('w2',   '2 tuần',                   '2 weeks',                      '{"test":2,"weak":5,"sim":4,"taper":3}',     9, 25, 30),
  ('m1',   '1 tháng',                  '1 month',                      '{"test":3,"weak":11,"sim":7,"taper":7}',    11, 25, 40),
  ('m3',   'Vài tháng (12 tuần)',      'A few months (12 weeks)',      '{"test":7,"weak":42,"sim":21,"taper":14}',  11, 25, 50)
on conflict (code) do nothing;
