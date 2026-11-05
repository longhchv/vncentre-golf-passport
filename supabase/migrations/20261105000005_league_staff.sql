-- Spec 14 · bước 1: vai trò "BTC giải" (league_staff) và các hàm xem hồ sơ VĐV SNAG Golf League.
-- Quyết định anh Long 05/11/2026 (B-ghi trong phụ lục D):
--   · Gán / gỡ vai trò trên trang Người dùng hiện có (tài khoản đăng nhập của chính người BTC), không tạo mã riêng.
--   · Khu làm việc riêng /league.
--   · VĐV được xem: có dòng tournament_results (participant_kind = student) HOẶC có league_issue_requests ở MỌI trạng thái
--     (matched / created / review); hồ sơ đã gộp thì quyền đi theo hồ sơ đích (league_current_student).
--   · Phụ huynh: mọi phụ huynh đang gắn, gồm tên, SĐT, quan hệ; không email.
-- league_staff KHÔNG có policy RLS nào trên bảng → đọc thẳng bảng bị chặn (mặc định từ chối). Mọi truy cập đi qua
-- hàm security definer dưới đây; không có hàm ghi nào cho vai trò này.
-- Migration chỉ thêm: nới check vai trò, thêm hàm mới. Không đổi hàm cũ.

-------------------------------------------------------------------------------
-- Vai trò mới
-------------------------------------------------------------------------------
-- Bỏ check vai trò cũ theo nội dung (không phụ thuộc tên ràng buộc trên từng CSDL), rồi thêm lại có league_staff
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.user_roles'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%event_staff%'
  loop
    execute format('alter table public.user_roles drop constraint %I', c);
  end loop;
end $$;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'head_coach', 'coach', 'assistant', 'school_manager',
                  'pe_teacher', 'partner', 'event_staff', 'league_staff'));

create or replace function public.is_league_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('league_staff')
$$;

-------------------------------------------------------------------------------
-- Tập học viên BTC giải được xem (đã quy về hồ sơ đích nếu từng gộp)
-------------------------------------------------------------------------------
create or replace function public.league_staff_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct x.sid from (
    select public.league_current_student(r.student_id) as sid
    from public.tournament_results r
    where r.student_id is not null and r.participant_kind = 'student'
    union
    select public.league_current_student(q.student_id)
    from public.league_issue_requests q
  ) x
  join public.students s on s.id = x.sid and s.deleted_at is null and s.merged_into_student_id is null
$$;

create or replace function public.league_staff_can_view(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_student_id is not null and exists (select 1 from public.league_staff_student_ids() i where i = p_student_id)
$$;

-------------------------------------------------------------------------------
-- Thành tích SNAG của một học viên, theo id (dùng nội bộ; cùng dạng với league_public_profile
-- nhưng luôn có tên thật và không có chứng nhận). null nếu chưa thi chặng nào.
-- Hàm gọi phải tự kiểm tra quyền: hàm này KHÔNG cấp cho authenticated.
-------------------------------------------------------------------------------
create or replace function public.league_student_summary(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_series uuid := public.league_series_id();
  s public.students;
  st record;
  v_best_all int;
  v_stages jsonb;
begin
  select * into s from public.students where id = public.league_current_student(p_student_id) and deleted_at is null;
  if s.id is null or v_series is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'stage_no', t.stage_no, 'played_on', t.played_on, 'venue', t.venue, 'season', se.code,
           'counts_for_ranking', t.counts_for_ranking, 'group', r.group_name, 'to_par', r.to_par,
           'title_code', r.rank_title_code, 'title_vi', rk.name_vi, 'title_en', rk.name_en,
           'culture_code', r.culture_award_code, 'culture_vi', cu.name_vi, 'culture_en', cu.name_en,
           'points', r.points_total)
         order by t.played_on desc, t.stage_no desc), '[]'),
         count(*) filter (where r.rank_title_code = 'best_gross')
    into v_stages, v_best_all
  from public.tournament_results r
  join public.tournaments t on t.id = r.tournament_id and t.deleted_at is null and t.series_id = v_series
  join public.seasons se on se.id = t.season_id
  left join public.tournament_point_rules rk on rk.series_id = v_series and rk.code = r.rank_title_code
  left join public.tournament_point_rules cu on cu.series_id = v_series and cu.code = r.culture_award_code
  where r.student_id = s.id and r.participant_kind = 'student';
  if jsonb_array_length(v_stages) = 0 then return null; end if;

  select l.total_points, l.rank, l.tied, l.players, se.code as season_code, se.name_vi as season_vi, se.name_en as season_en
    into st
  from public.league_standings l join public.seasons se on se.id = l.season_id
  where l.series_id = v_series and l.student_id = s.id
  order by se.start_date desc limit 1;

  return jsonb_build_object(
    'name', s.full_name, 'anonymous', false,
    'season', st.season_code, 'season_vi', st.season_vi, 'season_en', st.season_en,
    'total_points', st.total_points, 'rank', st.rank, 'tied', st.tied, 'players', st.players,
    'stages_count', jsonb_array_length(v_stages),
    'best_gross_count', v_best_all,
    'graduated', v_best_all >= public.setting_int('league.graduation_best_gross', 3),
    'stages', v_stages,
    'certificates', null);
end $$;

-------------------------------------------------------------------------------
-- /league · tìm VĐV: mã VNC, họ tên (bỏ dấu), SĐT phụ huynh, mã sổ (để quét QR thẻ)
-- Chỉ trả trong tập league_staff_student_ids(). Không trả ngày sinh, email.
-------------------------------------------------------------------------------
create or replace function public.league_staff_search(p_query text default null, p_limit int default 30)
returns table (
  id uuid,
  student_code text,
  full_name text,
  birth_year int,
  school_name text,
  stages_count int
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  q text := nullif(btrim(coalesce(p_query, '')), '');
  q_norm text := public.normalize_name(q);
  q_code text := upper(replace(coalesce(q, ''), '-', ''));
  q_pass text := public.normalize_code(regexp_replace(coalesce(q, ''), '^.*/p/', ''));
  q_digits text := regexp_replace(coalesce(q, ''), '\D', '', 'g');
  q_phone text;
begin
  if not (public.is_league_staff() or public.is_admin()) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  q_phone := case
    when q_digits ~ '^0\d{8,10}$' then '+84' || substr(q_digits, 2)
    when length(q_digits) >= 8 then '+' || q_digits
    else null end;

  return query
  select s.id, s.student_code, s.full_name,
         coalesce(s.birth_year, extract(year from s.date_of_birth)::int),
         coalesce(sc.short_name, sc.name),
         (select count(*)::int from public.tournament_results r
          where r.student_id = s.id and r.participant_kind = 'student')
  from public.league_staff_student_ids() i
  join public.students s on s.id = i
  left join public.schools sc on sc.id = s.current_school_id
  where q is null
     or s.full_name_normalized like '%' || q_norm || '%'
     or upper(replace(s.student_code, '-', '')) like '%' || q_code || '%'
     or (q_pass <> '' and exists (
           select 1 from public.passports p
           where p.passport_code = q_pass and p.status not in ('unassigned', 'void')
             and public.league_current_student(p.student_id) = s.id))
     or (q_phone is not null and exists (
           select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
           where sg.student_id = s.id and sg.deleted_at is null and sg.status = 'active' and g.phone like q_phone || '%'))
  order by s.full_name_normalized
  limit least(greatest(coalesce(p_limit, 30), 1), 200);
end $$;

-------------------------------------------------------------------------------
-- /league/students/:id · hồ sơ rút gọn. Ghi một dòng audit_logs mỗi lần mở.
-- Có: tên, năm sinh, trường, mã VNC, sổ (mã, hạng, trạng thái), phụ huynh (tên, SĐT, quan hệ), thành tích SNAG.
-- Không: ngày sinh đầy đủ, email, ghi chú nội bộ, kết quả đánh giá lớp học, thanh toán.
-- Học viên ngoài tập được xem (hoặc không tồn tại) → cùng một lỗi 42501, không lộ là có hay không.
-------------------------------------------------------------------------------
create or replace function public.league_staff_student(p_student_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := public.league_current_student(p_student_id);
  s public.students;
  v jsonb;
begin
  if not (public.is_league_staff() or public.is_admin()) or not public.league_staff_can_view(v_id) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  select * into s from public.students where id = v_id;

  v := jsonb_build_object(
    'id', s.id,
    'student_code', s.student_code,
    'full_name', s.full_name,
    'birth_year', coalesce(s.birth_year, extract(year from s.date_of_birth)::int),
    'school', (select coalesce(sc.short_name, sc.name) from public.schools sc where sc.id = s.current_school_id),
    'passports', (select coalesce(jsonb_agg(jsonb_build_object(
                    'passport_code', p.passport_code, 'status', p.status,
                    'tier_code', t.code, 'tier_vi', t.name_vi, 'tier_en', t.name_en)
                  order by p.created_at desc), '[]')
                  from public.passports p join public.passport_tiers t on t.id = p.tier_id
                  where p.student_id = s.id and p.status not in ('unassigned', 'void')),
    'guardians', (select coalesce(jsonb_agg(jsonb_build_object(
                    'full_name', g.full_name, 'phone', g.phone,
                    'relationship', coalesce(sg.relationship, g.relationship_default), 'is_primary', sg.is_primary)
                  order by sg.is_primary desc, sg.created_at), '[]')
                  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                  where sg.student_id = s.id and sg.deleted_at is null and sg.status = 'active'),
    'league', public.league_student_summary(s.id));

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, reason)
  values (auth.uid(), 'league_staff_view', 'students', s.id, 'BTC giải mở hồ sơ VĐV (spec 14 mục 1.3)');
  return v;
end $$;

-------------------------------------------------------------------------------
-- Quyền gọi hàm
-------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.is_league_staff()', 'public.league_staff_search(text, int)', 'public.league_staff_student(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Hàm nội bộ: chỉ gọi từ hàm security definer khác
  foreach f in array array[
    'public.league_staff_student_ids()', 'public.league_staff_can_view(uuid)', 'public.league_student_summary(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
