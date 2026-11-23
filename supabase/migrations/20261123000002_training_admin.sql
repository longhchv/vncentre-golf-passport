-- Spec 23 · bước 4: quản trị nội dung Tập luyện (giáo án, chuẩn thống kê) và tổng quan sử dụng.
-- Chỉ thêm trigger, hàm; thay hàm training_save_session để chịu được việc admin sửa số dòng của phần đang tập.

-------------------------------------------------------------------------------
-- 1. Nhật ký và phiên bản giáo án
-------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['training_programs', 'training_program_sessions', 'training_program_blocks', 'training_stat_benchmarks'] loop
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- Sửa nội dung buổi hoặc phần → tăng version của chương trình (mục tiêu mới ghi version đang dùng)
create or replace function public.training_bump_program_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prog uuid;
begin
  if tg_table_name = 'training_program_sessions' then
    v_prog := coalesce(new.program_id, old.program_id);
  else
    select program_id into v_prog from public.training_program_sessions where id = coalesce(new.session_id, old.session_id);
  end if;
  if v_prog is not null then
    update public.training_programs set version = version + 1 where id = v_prog;
  end if;
  return null;
end $$;
create trigger training_bump_version after insert or update or delete on public.training_program_sessions
  for each row execute function public.training_bump_program_version();
create trigger training_bump_version after insert or update or delete on public.training_program_blocks
  for each row when (pg_trigger_depth() < 2) execute function public.training_bump_program_version();
revoke execute on function public.training_bump_program_version() from public, anon, authenticated;

-------------------------------------------------------------------------------
-- 2. Thứ tự phần trong buổi phải liền mạch 0..n-1 (con trỏ giáo án dựa vào thứ tự này).
--    Thêm, xoá, đổi chỗ phần chỉ qua các hàm dưới đây.
-------------------------------------------------------------------------------
create or replace function public.training_admin_add_block(p_session_id uuid, p_after int default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_pos int; v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(p_after + 1, count(*)) into v_pos from public.training_program_blocks where session_id = p_session_id;
  -- Dời các phần phía sau xuống một bậc (đi từ cuối lên để không đụng ràng buộc duy nhất)
  update public.training_program_blocks set sort_order = -sort_order - 1 where session_id = p_session_id and sort_order >= v_pos;
  update public.training_program_blocks set sort_order = -sort_order where session_id = p_session_id and sort_order < 0;
  insert into public.training_program_blocks (session_id, sort_order, area, title_vi, est_minutes, lines)
  values (p_session_id, v_pos, 'putt', 'Phần mới', 15, '[{"t":"b","vi":"Bài tập mới","en":""}]')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.training_admin_delete_block(p_block_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare b record;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into b from public.training_program_blocks where id = p_block_id;
  if b.id is null then raise exception 'block_not_found' using errcode = '22023'; end if;
  if exists (select 1 from public.training_session_items where block_id = p_block_id) then
    raise exception 'block_in_use' using errcode = '22023';
  end if;
  if (select count(*) from public.training_program_blocks where session_id = b.session_id) <= 1 then
    raise exception 'last_block' using errcode = '22023';
  end if;
  delete from public.training_program_blocks where id = p_block_id;
  update public.training_program_blocks set sort_order = -sort_order where session_id = b.session_id and sort_order > b.sort_order;
  update public.training_program_blocks set sort_order = -sort_order - 1 where session_id = b.session_id and sort_order < 0;
end $$;

create or replace function public.training_admin_move_block(p_block_id uuid, p_delta int)
returns void language plpgsql volatile security definer set search_path = public as $$
declare b record; v_to int; v_n int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into b from public.training_program_blocks where id = p_block_id;
  if b.id is null then raise exception 'block_not_found' using errcode = '22023'; end if;
  select count(*) into v_n from public.training_program_blocks where session_id = b.session_id;
  v_to := b.sort_order + sign(p_delta)::int;
  if v_to < 0 or v_to >= v_n then return; end if;
  update public.training_program_blocks set sort_order = -1 where id = b.id;
  update public.training_program_blocks set sort_order = b.sort_order where session_id = b.session_id and sort_order = v_to;
  update public.training_program_blocks set sort_order = v_to where id = b.id;
end $$;


-------------------------------------------------------------------------------
-- 3. Tổng quan sử dụng (admin)
-------------------------------------------------------------------------------
create or replace function public.training_admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'profiles_self_created', (select count(*) from public.students where self_reported ->> 'source' = 'training' and deleted_at is null),
    'profiles_pending', (select count(*) from public.students where self_reported ->> 'source' = 'training' and verification_status = 'pending_review' and deleted_at is null),
    'active_goals', (select count(*) from public.training_goals where status = 'active'),
    'completed_goals', (select count(*) from public.training_goals where status = 'completed'),
    'sessions_7d', (select count(*) from public.training_session_logs where practiced_on >= public.vn_today() - 6),
    'sessions_30d', (select count(*) from public.training_session_logs where practiced_on >= public.vn_today() - 29),
    'active_users_7d', (select count(distinct student_id) from public.training_session_logs where practiced_on >= public.vn_today() - 6),
    'rounds_30d', (select count(*) from public.round_stats where played_on >= public.vn_today() - 29 and deleted_at is null),
    'by_program', coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'name', p.name_vi, 'active', (select count(*) from public.training_goals g where g.program_id = p.id and g.status = 'active'),
                    'completed', (select count(*) from public.training_goals g where g.program_id = p.id and g.status = 'completed')) order by p.sort_order)
                   from public.training_programs p), '[]')
  );
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.training_admin_add_block(uuid, int)', 'public.training_admin_delete_block(uuid)',
                           'public.training_admin_move_block(uuid, int)', 'public.training_admin_overview()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- 4. Lưu buổi tập: chịu lệch nửa khối khi admin đổi số dòng của phần đang tập
-------------------------------------------------------------------------------
create or replace function public.training_save_session(p_goal_id uuid, p_practiced_on date, p_planned_minutes int,
                                                       p_items jsonb, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g public.training_goals%rowtype;
  p public.training_programs%rowtype;
  v_log uuid;
  v_item jsonb;
  v_i int := 0;
  v_moving boolean := true;
  v_session uuid;
  v_block public.training_program_blocks%rowtype;
  v_from int; v_to int; v_total int;
  v_done numeric := 0;
  v_ok int := 0;
  v_n_blocks int;
  v_m text[];
begin
  select * into g from public.training_goals where id = p_goal_id for update;
  if g.id is null or g.status <> 'active' then raise exception 'goal_not_active' using errcode = '22023'; end if;
  if not public.training_can_manage(g.student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_items, 'null')) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required' using errcode = '22023';
  end if;
  if p_practiced_on is null or p_practiced_on > public.vn_today() then raise exception 'date_invalid' using errcode = '22023'; end if;
  select * into p from public.training_programs where id = g.program_id;

  insert into public.training_session_logs (student_id, goal_id, practiced_on, planned_minutes, note, created_by)
  values (g.student_id, g.id, p_practiced_on, coalesce(p_planned_minutes, 0), nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_log;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_block from public.training_program_blocks where id = (v_item ->> 'block_id')::uuid;
    if v_block.id is null then raise exception 'block_not_found' using errcode = '22023'; end if;
    v_from := (v_item ->> 'unit_from')::int; v_to := (v_item ->> 'unit_to')::int; v_total := (v_item ->> 'unit_total')::int;
    v_m := regexp_match(coalesce(v_item ->> 'result_text', ''), '(\d+)\s*/\s*(\d+)');
    insert into public.training_session_items (log_id, block_id, sort_order, unit_from, unit_to, unit_total, completed,
                                               result_text, result_made, result_attempts)
    values (v_log, v_block.id, v_i, v_from, v_to, v_total, coalesce((v_item ->> 'completed')::boolean, false),
            nullif(btrim(coalesce(v_item ->> 'result_text', '')), ''),
            case when v_m is not null then v_m[1]::int end, case when v_m is not null then v_m[2]::int end);
    v_i := v_i + 1;

    if v_moving and coalesce((v_item ->> 'completed')::boolean, false) then
      -- Phần này phải đúng vị trí con trỏ
      v_session := public.training_session_for(g.program_id, g.cursor_week, g.cursor_day);
      if v_block.session_id <> v_session or v_block.sort_order <> g.cursor_block then
        raise exception 'out_of_order' using errcode = '22023';
      end if;
      -- Cho lệch tối đa nửa khối: admin sửa số dòng của phần đang tập làm đổi tổng số khối
      if abs(v_from::numeric / v_total - g.cursor_fraction) > 0.5 / v_total + 0.0001 then raise exception 'out_of_order' using errcode = '22023'; end if;
      v_done := v_done + v_block.est_minutes * (v_to - v_from)::numeric / v_total;
      v_ok := v_ok + 1;
      if v_to >= v_total then
        g.cursor_block := g.cursor_block + 1; g.cursor_fraction := 0;
        select count(*) into v_n_blocks from public.training_program_blocks where session_id = v_session;
        if g.cursor_block >= v_n_blocks then
          g.cursor_block := 0; g.cursor_day := g.cursor_day + 1;
          if g.cursor_day > p.days_per_week then g.cursor_day := 1; g.cursor_week := g.cursor_week + 1; end if;
        end if;
      else
        g.cursor_fraction := v_to::numeric / v_total;
      end if;
    else
      v_moving := false;
    end if;
  end loop;

  update public.training_session_logs set done_minutes = round(v_done, 1) where id = v_log;
  update public.training_goals
  set cursor_week = g.cursor_week, cursor_day = g.cursor_day, cursor_block = g.cursor_block, cursor_fraction = g.cursor_fraction,
      status = case when g.cursor_week > p.weeks then 'completed' else status end,
      completed_at = case when g.cursor_week > p.weeks then now() else completed_at end
  where id = g.id;
  return jsonb_build_object('log_id', v_log, 'completed_items', v_ok, 'done_minutes', round(v_done, 1),
    'cursor', jsonb_build_object('week', g.cursor_week, 'day', g.cursor_day, 'block', g.cursor_block, 'fraction', g.cursor_fraction),
    'program_completed', g.cursor_week > p.weeks);
end $$;