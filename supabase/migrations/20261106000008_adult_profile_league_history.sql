-- Spec 17 · Bước 1 + Bước 2: "Hồ sơ của tôi" cho mọi người lớn và lịch sử BTC từ app giải (staff_history).
-- Anh Long chốt 06/11/2026: app giải chạy việc, Passport giữ hồ sơ. Không làm mục Kinh doanh (spec 18).
-- Chỉ thêm: cấu hình, cột, bảng chờ, hàm; thay lại 4 hàm của 11b (staff_my_profile, staff_cv_items, staff_review_queue, staff_review).

-------------------------------------------------------------------------------
-- Khối 7 Kinh doanh: chừa chỗ, tắt bằng cấu hình (spec 18 sẽ bật)
-------------------------------------------------------------------------------
insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('profile.business_tab_enabled', 'false',
   'Hiện khối Kinh doanh (mã giới thiệu, đối tác) trong Hồ sơ của tôi — spec 18',
   'Show the Business block (referral code, partners) in My profile — spec 18', true)
on conflict do nothing;

-------------------------------------------------------------------------------
-- Bước 2 · staff_engagements nhận chặng giải
-------------------------------------------------------------------------------
alter table public.staff_engagements drop constraint staff_engagements_kind_check;
alter table public.staff_engagements add constraint staff_engagements_kind_check
  check (kind in ('event', 'project', 'class', 'tournament'));
alter table public.staff_engagements drop constraint staff_engagements_source_check;
alter table public.staff_engagements add constraint staff_engagements_source_check
  check (source in ('system', 'manager', 'self', 'league_app'));
alter table public.staff_engagements
  add column tournament_id uuid references public.tournaments(id),
  add column tasks_done int check (tasks_done is null or tasks_done >= 0),
  add column tasks_total int check (tasks_total is null or tasks_total >= 0),
  add constraint staff_engagements_tournament_check check (kind <> 'tournament' or tournament_id is not null),
  add constraint staff_engagements_tasks_check check (tasks_done is null or tasks_total is null or tasks_done <= tasks_total),
  add constraint staff_engagements_league_app_check check (source <> 'league_app' or kind = 'tournament');
-- Một chặng một dòng cho mỗi người: gửi lại thay dòng cũ, không nhân đôi
create unique index staff_engagements_tournament_user on public.staff_engagements (tournament_id, user_id)
  where source = 'league_app' and deleted_at is null;

-- Người có trong staff_history nhưng chưa có tài khoản: lưu chờ, gắn khi kích hoạt
create table public.staff_history_pending (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  tournament_id uuid not null references public.tournaments(id),
  student_id uuid not null references public.students(id),
  role text,
  tasks_done int check (tasks_done is null or tasks_done >= 0),
  tasks_total int check (tasks_total is null or tasks_total >= 0),
  hours numeric(6, 1) check (hours is null or hours >= 0),
  attached_at timestamptz,
  attached_engagement_id uuid references public.staff_engagements(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, student_id)
);
create trigger set_updated_at before update on public.staff_history_pending for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.staff_history_pending for each row execute function public.audit_row();
alter table public.staff_history_pending enable row level security;
create policy admin_read on public.staff_history_pending for select to authenticated using (public.is_admin());
revoke all on public.staff_history_pending from anon;

-- Tài khoản của một hồ sơ VNC: người giám hộ "self" đã xác nhận có tài khoản (staff_identity theo chiều ngược)
create or replace function public.staff_user_for_student(p_student_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select g.user_id
  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where sg.student_id = public.league_current_student(p_student_id) and sg.relationship = 'self'
    and sg.deleted_at is null and sg.status = 'active' and g.deleted_at is null and g.user_id is not null
  order by sg.created_at limit 1
$$;

-- Ghi / thay một dòng chặng giải cho một tài khoản. Dữ liệu đổi → về Chờ duyệt; giống hệt → giữ nguyên (kể cả đã xác nhận).
create or replace function public.staff_history_upsert(p_user uuid, t public.tournaments, p_role text, p_done int, p_total int, p_hours numeric)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  e public.staff_engagements;
  v_name_vi text := 'SNAG Golf League · Chặng ' || t.stage_no;
  v_name_en text := 'SNAG Golf League · Stage ' || t.stage_no;
begin
  select * into e from public.staff_engagements
  where tournament_id = t.id and user_id = p_user and source = 'league_app' and deleted_at is null;
  if e.id is null then
    insert into public.staff_engagements (user_id, kind, tournament_id, project_name_vi, project_name_en, position_vi,
      staff_group, started_on, ended_on, hours, tasks_done, tasks_total, scale, source, status)
    values (p_user, 'tournament', t.id, v_name_vi, v_name_en, p_role, 'organizer', t.played_on, t.played_on,
      p_hours, p_done, p_total, case when t.venue is null then '{}'::jsonb else jsonb_build_object('venue', t.venue) end,
      'league_app', 'pending_review')
    returning * into e;
  elsif e.position_vi is distinct from p_role or e.tasks_done is distinct from p_done or e.tasks_total is distinct from p_total
        or e.hours is distinct from p_hours then
    update public.staff_engagements set position_vi = p_role, tasks_done = p_done, tasks_total = p_total, hours = p_hours,
      status = 'pending_review', confirmed_by = null, confirmed_at = null, rejected_reason = null
    where id = e.id returning * into e;
  end if;
  return e.id;
end $$;

-------------------------------------------------------------------------------
-- league-bridge · staff_history (chỉ service_role). Gửi lại cùng chặng → thay dòng cũ của chặng đó.
-------------------------------------------------------------------------------
create or replace function public.league_staff_history(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_no int; v_date date;
  t public.tournaments;
  r jsonb;
  v_code text; v_student uuid; v_user uuid; v_role text; v_done int; v_total int; v_hours numeric;
  v_saved int := 0; v_waiting int := 0;
  v_unmatched jsonb := '[]';
  v_users uuid[] := '{}';
  v_students uuid[] := '{}';
begin
  begin
    v_no := (p #>> '{event,no}')::int;
    v_date := (p #>> '{event,date}')::date;
  exception when others then raise exception 'invalid_event' using errcode = '22023';
  end;
  select * into t from public.tournaments
  where series_id = public.league_series_id() and stage_no = v_no and played_on = v_date and deleted_at is null;
  if t.id is null then raise exception 'tournament_not_found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p -> 'rows') is distinct from 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;

  for r in select * from jsonb_array_elements(p -> 'rows') loop
    v_code := upper(btrim(coalesce(r ->> 'student_code', '')));
    begin
      v_done := nullif(r ->> 'tasks_done', '')::int;
      v_total := nullif(r ->> 'tasks_total', '')::int;
      v_hours := nullif(r ->> 'hours', '')::numeric;
    exception when others then raise exception 'invalid_row: %', v_code using errcode = '22023';
    end;
    if v_done < 0 or v_total < 0 or v_hours < 0 or v_done > v_total then raise exception 'invalid_row: %', v_code using errcode = '22023'; end if;
    v_role := nullif(btrim(coalesce(r ->> 'role', '')), '');
    select public.league_current_student(s.id) into v_student from public.students s where s.student_code = v_code and s.deleted_at is null;
    if v_student is null then
      v_unmatched := v_unmatched || to_jsonb(v_code);
      continue;
    end if;
    v_user := public.staff_user_for_student(v_student);
    if v_user is null then
      insert into public.staff_history_pending (tournament_id, student_id, role, tasks_done, tasks_total, hours)
      values (t.id, v_student, v_role, v_done, v_total, v_hours)
      on conflict (tournament_id, student_id) do update
        set role = excluded.role, tasks_done = excluded.tasks_done, tasks_total = excluded.tasks_total, hours = excluded.hours,
            attached_at = null, attached_engagement_id = null;
      v_students := v_students || v_student;
      v_waiting := v_waiting + 1;
    else
      perform public.staff_history_upsert(v_user, t, v_role, v_done, v_total, v_hours);
      v_users := v_users || v_user;
      v_saved := v_saved + 1;
    end if;
  end loop;

  -- Người không còn trong lần gửi này: bỏ dòng cũ của chặng
  update public.staff_engagements set deleted_at = now()
  where tournament_id = t.id and source = 'league_app' and deleted_at is null and not (user_id = any(v_users));
  delete from public.staff_history_pending where tournament_id = t.id and attached_at is null and not (student_id = any(v_students));

  insert into public.audit_logs (action, entity_type, entity_id, after)
  values ('league.staff_history', 'tournaments', t.id,
          jsonb_build_object('stage_no', t.stage_no, 'saved', v_saved, 'waiting', v_waiting, 'unmatched', v_unmatched));
  return jsonb_build_object('ok', true, 'saved', v_saved + v_waiting, 'waiting', v_waiting,
                            'unmatched', jsonb_array_length(v_unmatched), 'unmatched_codes', v_unmatched);
end $$;

-- Gắn dòng chờ khi hồ sơ VNC có tài khoản (kích hoạt tài khoản / nối người giám hộ "self")
create or replace function public.staff_history_attach(p_student_id uuid)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  v_user uuid := public.staff_user_for_student(p_student_id);
  pe public.staff_history_pending;
  t public.tournaments;
  n int := 0;
begin
  if v_user is null then return 0; end if;
  for pe in select * from public.staff_history_pending
            where attached_at is null and public.league_current_student(student_id) = public.league_current_student(p_student_id) loop
    select * into t from public.tournaments where id = pe.tournament_id;
    update public.staff_history_pending
    set attached_at = now(), attached_engagement_id = public.staff_history_upsert(v_user, t, pe.role, pe.tasks_done, pe.tasks_total, pe.hours)
    where id = pe.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.staff_history_on_student_guardian()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.relationship = 'self' and new.status = 'active' and new.deleted_at is null then
    perform public.staff_history_attach(new.student_id);
  end if;
  return null;
end $$;
create trigger staff_history_attach after insert or update of status, guardian_id, deleted_at on public.student_guardians
  for each row execute function public.staff_history_on_student_guardian();

create or replace function public.staff_history_on_guardian()
returns trigger language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if new.user_id is not null and old.user_id is distinct from new.user_id then
    for s in select sg.student_id from public.student_guardians sg
             where sg.guardian_id = new.id and sg.relationship = 'self' and sg.deleted_at is null loop
      perform public.staff_history_attach(s);
    end loop;
  end if;
  return null;
end $$;
create trigger staff_history_attach after update of user_id on public.guardians
  for each row execute function public.staff_history_on_guardian();

-------------------------------------------------------------------------------
-- Bước 1 · Hồ sơ của tôi: thêm chứng nhận VN Centre, con của tôi, cờ Kinh doanh, thông tin chặng giải
-------------------------------------------------------------------------------
create or replace function public.staff_my_profile(p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
  p public.profiles;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if v_user is null or not (public.is_admin() or v_user = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.profiles where user_id = v_user;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'profile', jsonb_build_object('user_id', p.user_id, 'full_name', p.full_name, 'avatar_url', p.avatar_url, 'email', p.email,
      'phone', p.phone, 'cv_type', p.cv_type, 'joined_vncentre_on', p.joined_vncentre_on, 'show_contact_on_cv', p.show_contact_on_cv),
    'identity', public.staff_identity(v_user),
    'roles', coalesce((select jsonb_agg(distinct r.role) from public.user_roles r where r.user_id = v_user and r.deleted_at is null), '[]'),
    'engagements', coalesce((select jsonb_agg(x order by x ->> 'started_on' desc nulls last, x ->> 'created_at' desc) from (
      select jsonb_build_object('id', e.id, 'kind', e.kind, 'event_id', e.event_id, 'class_id', e.class_id,
        'event_name_vi', ev.name_vi, 'event_name_en', ev.name_en,
        'class_name', cl.name, 'school_name', coalesce(sc.short_name, sc.name), 'academic_year', ay.name,
        'project_name_vi', e.project_name_vi, 'project_name_en', e.project_name_en,
        'position_vi', e.position_vi, 'position_en', e.position_en, 'staff_group', e.staff_group,
        'started_on', e.started_on, 'ended_on', e.ended_on, 'hours', e.hours, 'scale', e.scale,
        'outcome_vi', e.outcome_vi, 'outcome_en', e.outcome_en, 'source', e.source, 'status', e.status,
        'rejected_reason', e.rejected_reason, 'created_at', e.created_at,
        'tournament_id', e.tournament_id, 'tasks_done', e.tasks_done, 'tasks_total', e.tasks_total,
        'badge', case when e.status = 'pending_review' then 'pending' when e.status = 'rejected' then 'rejected'
                      when e.source in ('system', 'manager', 'league_app') then 'verified' else 'approved' end,
        'confirmed_by_name', case when e.source in ('system', 'manager', 'league_app') then cp.full_name end,
        'skills', coalesce((select jsonb_agg(sr.skill_code order by sr.skill_code) from public.staff_skill_records sr
                            where sr.engagement_id = e.id), '[]')) x
      from public.staff_engagements e
      left join public.events ev on ev.id = e.event_id
      left join public.classes cl on cl.id = e.class_id
      left join public.schools sc on sc.id = cl.school_id
      left join public.academic_years ay on ay.id = cl.academic_year_id
      left join public.profiles cp on cp.user_id = e.confirmed_by
      where e.user_id = v_user and e.deleted_at is null) q), '[]'),
    'credentials', coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
      select jsonb_build_object('id', c.id, 'type', c.type, 'title_vi', c.title_vi, 'title_en', c.title_en, 'issuer', c.issuer,
        'issued_on', c.issued_on, 'expires_on', c.expires_on, 'years', c.years, 'file_path', c.file_path,
        'status', c.status, 'rejected_reason', c.rejected_reason, 'created_at', c.created_at,
        'expired', c.expires_on is not null and c.expires_on < v_today) x
      from public.staff_credentials c where c.user_id = v_user and c.deleted_at is null) q), '[]'),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('code', s.code, 'name_vi', s.name_vi, 'name_en', s.name_en, 'count', n.cnt)
                                         order by n.cnt desc, s.sort_order)
      from (select sr.skill_code, count(*) as cnt from public.staff_skill_records sr
            join public.staff_engagements e on e.id = sr.engagement_id
            where sr.user_id = v_user and e.status = 'approved' and e.deleted_at is null group by sr.skill_code) n
      join public.staff_skills s on s.code = n.skill_code), '[]'),
    'stats', public.staff_stats(v_user),
    -- Spec 17 khối 3a: chứng nhận VN Centre cấp cho chính người này (hồ sơ VNC tự chơi gắn với tài khoản)
    'certificates', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type, 'title_vi', c.title_vi,
        'title_en', c.title_en, 'issued_at', c.issued_at, 'verify_code', c.verify_code) order by c.issued_at desc)
      from public.certificates c
      where c.student_id = (public.staff_identity(v_user) ->> 'student_id')::uuid and c.status = 'valid'), '[]'),
    -- Khối 6: con của tôi (phụ huynh đã xác nhận; không gồm hồ sơ tự chơi)
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'full_name', s.full_name, 'student_code', s.student_code,
        'avatar_url', s.avatar_url, 'level_number', l.number) order by s.full_name)
      from public.guardians g
      join public.student_guardians sg on sg.guardian_id = g.id and sg.deleted_at is null and sg.status = 'active' and sg.relationship <> 'self'
      join public.students s on s.id = sg.student_id and s.deleted_at is null and s.merged_into_student_id is null
      left join public.levels l on l.id = s.current_level_id
      where g.user_id = v_user and g.deleted_at is null), '[]'),
    -- Khối 7: Kinh doanh (spec 18) — tắt bằng cấu hình
    'business_enabled', coalesce((select value = 'true'::jsonb from public.app_settings where key = 'profile.business_tab_enabled'), false));
end $$;

-------------------------------------------------------------------------------
-- CV, hàng chờ admin, duyệt: dòng từ app giải (league_app) được duyệt như mục tự khai, sau khi duyệt mang dấu "Đã xác thực".
-- Người xác nhận: admin (tournaments chưa có người phụ trách riêng như event_managers).
-------------------------------------------------------------------------------
create or replace function public.staff_cv_items(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or p_user_id = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'engagements', coalesce((select jsonb_agg(x order by x ->> 'started_on' desc nulls last) from (
      select jsonb_build_object('id', e.id, 'kind', e.kind, 'event_id', e.event_id, 'class_id', e.class_id,
        'event_name_vi', ev.name_vi, 'event_name_en', ev.name_en,
        'class_name', cl.name, 'school_name', coalesce(sc.short_name, sc.name), 'academic_year', ay.name,
        'project_name_vi', e.project_name_vi, 'project_name_en', e.project_name_en,
        'position_vi', e.position_vi, 'position_en', e.position_en, 'staff_group', e.staff_group,
        'started_on', e.started_on, 'ended_on', e.ended_on, 'hours', e.hours, 'scale', e.scale,
        'outcome_vi', e.outcome_vi, 'outcome_en', e.outcome_en, 'source', e.source,
        'badge', case when e.source in ('system', 'manager', 'league_app') then 'verified' else 'approved' end,
        'confirmed_by_name', case when e.source in ('system', 'manager', 'league_app') then cp.full_name end,
        'skills', coalesce((select jsonb_agg(sr.skill_code order by sr.skill_code) from public.staff_skill_records sr
                            where sr.engagement_id = e.id), '[]')) x
      from public.staff_engagements e
      left join public.events ev on ev.id = e.event_id
      left join public.classes cl on cl.id = e.class_id
      left join public.schools sc on sc.id = cl.school_id
      left join public.academic_years ay on ay.id = cl.academic_year_id
      left join public.profiles cp on cp.user_id = e.confirmed_by
      where e.user_id = p_user_id and e.status = 'approved' and e.deleted_at is null) q), '[]'),
    'credentials', coalesce((select jsonb_agg(x order by x ->> 'issued_on' desc nulls last) from (
      select jsonb_build_object('id', c.id, 'type', c.type, 'title_vi', c.title_vi, 'title_en', c.title_en, 'issuer', c.issuer,
        'issued_on', c.issued_on, 'expires_on', c.expires_on, 'years', c.years, 'badge', 'approved') x
      from public.staff_credentials c
      where c.user_id = p_user_id and c.status = 'approved' and c.deleted_at is null
        and (c.expires_on is null or c.expires_on >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)) q), '[]'));
end $$;

create or replace function public.staff_review_queue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'engagements', coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
      select jsonb_build_object('id', e.id, 'user_id', e.user_id, 'full_name', p.full_name, 'cv_type', p.cv_type,
        'project_name_vi', e.project_name_vi, 'project_name_en', e.project_name_en, 'position_vi', e.position_vi,
        'staff_group', e.staff_group, 'started_on', e.started_on, 'ended_on', e.ended_on, 'hours', e.hours, 'scale', e.scale,
        'outcome_vi', e.outcome_vi, 'created_at', e.created_at,
        'source', e.source, 'kind', e.kind, 'tasks_done', e.tasks_done, 'tasks_total', e.tasks_total) x
      from public.staff_engagements e join public.profiles p on p.user_id = e.user_id
      where e.source in ('self', 'league_app') and e.status = 'pending_review' and e.deleted_at is null limit 500) q), '[]'),
    'credentials', coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
      select jsonb_build_object('id', c.id, 'user_id', c.user_id, 'full_name', p.full_name, 'cv_type', p.cv_type,
        'type', c.type, 'title_vi', c.title_vi, 'title_en', c.title_en, 'issuer', c.issuer, 'issued_on', c.issued_on,
        'expires_on', c.expires_on, 'years', c.years, 'file_path', c.file_path, 'created_at', c.created_at) x
      from public.staff_credentials c join public.profiles p on p.user_id = c.user_id
      where c.status = 'pending_review' and c.deleted_at is null limit 500) q), '[]'));
end $$;

create or replace function public.staff_review(p_entity text, p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not p_approve and v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
  perform set_config('app.audit_reason', case when p_approve then 'Duyệt hồ sơ nhân sự' else 'Từ chối: ' || v_reason end, true);
  if p_entity = 'engagement' then
    update public.staff_engagements set
      status = case when p_approve then 'approved' else 'rejected' end,
      rejected_reason = case when p_approve then null else v_reason end,
      confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_id and source in ('self', 'league_app') and status = 'pending_review' and deleted_at is null;
  elsif p_entity = 'credential' then
    update public.staff_credentials set
      status = case when p_approve then 'approved' else 'rejected' end,
      rejected_reason = case when p_approve then null else v_reason end,
      reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_id and status = 'pending_review' and deleted_at is null;
  else
    raise exception 'bad_entity' using errcode = '22023';
  end if;
  if not found then raise exception 'not_pending' using errcode = '22023'; end if;
end $$;

do $$
begin
  revoke execute on function public.league_staff_history(jsonb) from public, anon, authenticated;
  revoke execute on function public.staff_user_for_student(uuid) from public, anon, authenticated;
  revoke execute on function public.staff_history_upsert(uuid, public.tournaments, text, int, int, numeric) from public, anon, authenticated;
  revoke execute on function public.staff_history_attach(uuid) from public, anon, authenticated;
  revoke execute on function public.staff_history_on_student_guardian() from public, anon, authenticated;
  revoke execute on function public.staff_history_on_guardian() from public, anon, authenticated;
end $$;
