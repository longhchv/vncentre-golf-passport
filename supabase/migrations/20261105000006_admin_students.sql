-- Spec 14 · bước 2: trang Học viên khu quản trị (danh sách có lọc, phân trang) và mục Thành tích SNAG trên các trang học viên.
-- Migration chỉ thêm hàm mới. admin_search_students (F16) giữ nguyên.

-------------------------------------------------------------------------------
-- 1.1 Danh sách học viên cho admin / HLV trưởng.
-- Tìm: mã VNC, họ tên (bỏ dấu), SĐT phụ huynh, mã sổ (hoặc link /p/… quét từ QR).
-- Lọc: trường, hạng sổ (passport_tiers.code), verification_status, đã thi SNAG League.
-- Trả {total, rows}; rows sắp theo tên, cắt theo p_limit / p_offset.
-------------------------------------------------------------------------------
create or replace function public.admin_students_page(
  p_query text default null,
  p_school_id uuid default null,
  p_tier_code text default null,
  p_verification text default null,
  p_league boolean default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  q text := nullif(btrim(coalesce(p_query, '')), '');
  q_norm text := public.normalize_name(q);
  q_code text := upper(replace(coalesce(q, ''), '-', ''));
  q_pass text := public.normalize_code(regexp_replace(coalesce(q, ''), '^.*/p/', ''));
  q_digits text := regexp_replace(coalesce(q, ''), '\D', '', 'g');
  q_phone text;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_total int;
  v_rows jsonb;
begin
  if not public.is_center_staff() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  q_phone := case
    when q_digits ~ '^0\d{8,10}$' then '+84' || substr(q_digits, 2)
    when length(q_digits) >= 8 then '+' || q_digits
    else null end;

  with m as (
    select s.*
    from public.students s
    where s.deleted_at is null and s.merged_into_student_id is null
      and (p_school_id is null or s.current_school_id = p_school_id)
      and (p_verification is null or s.verification_status = p_verification)
      and (p_tier_code is null or exists (
             select 1 from public.passports p join public.passport_tiers t on t.id = p.tier_id
             where p.student_id = s.id and t.code = p_tier_code and p.status not in ('unassigned', 'void')))
      and (p_league is null or p_league = exists (
             select 1 from public.tournament_results r where r.student_id = s.id and r.participant_kind = 'student'))
      and (q is null
           or s.full_name_normalized like '%' || q_norm || '%'
           or upper(replace(s.student_code, '-', '')) like '%' || q_code || '%'
           or (q_pass <> '' and exists (
                 select 1 from public.passports p where p.student_id = s.id and p.passport_code = q_pass))
           or (q_phone is not null and exists (
                 select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                 where sg.student_id = s.id and sg.deleted_at is null and g.phone like q_phone || '%')))
  ),
  pg as (
    select m.* from m order by m.full_name_normalized, m.id limit v_limit offset v_offset
  )
  select (select count(*) from m)::int,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', pg.id, 'student_code', pg.student_code, 'full_name', pg.full_name,
           'date_of_birth', pg.date_of_birth, 'birth_year', coalesce(pg.birth_year, extract(year from pg.date_of_birth)::int),
           'school_name', (select coalesce(sc.short_name, sc.name) from public.schools sc where sc.id = pg.current_school_id),
           'current_grade_class', pg.current_grade_class,
           'level_number', (select l.number from public.levels l where l.id = pg.current_level_id),
           'verification_status', pg.verification_status,
           'activated', pg.activated_at is not null,
           'passports', (select coalesce(jsonb_agg(jsonb_build_object('code', p.passport_code, 'tier_code', t.code, 'status', p.status)
                                                   order by p.created_at desc), '[]')
                         from public.passports p join public.passport_tiers t on t.id = p.tier_id
                         where p.student_id = pg.id and p.status not in ('unassigned', 'void')),
           'league_stages', (select count(*) from public.tournament_results r where r.student_id = pg.id and r.participant_kind = 'student'))
           order by pg.full_name_normalized, pg.id), '[]')
    into v_total, v_rows
  from pg;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

-------------------------------------------------------------------------------
-- 1.1 / 1.2 Thành tích SNAG của một học viên, cho các trang học viên đã có quyền:
-- phụ huynh đang gắn (active), chính học viên, nhân sự xem được học viên (can_staff_view_student: admin, HLV trưởng,
-- HLV / trợ giảng lớp đang học, quản lý trường), BTC giải trong phạm vi league_staff_can_view.
-- null nếu chưa thi chặng nào (giao diện ẩn mục). Không có quyền → 42501.
-------------------------------------------------------------------------------
create or replace function public.league_student_profile(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_id uuid := public.league_current_student(p_student_id);
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if not (
       public.is_guardian_of(p_student_id, false)
    or exists (select 1 from public.student_accounts a where a.student_id = p_student_id and a.user_id = auth.uid() and a.is_active)
    or public.can_staff_view_student(p_student_id)
    or (public.is_league_staff() and public.league_staff_can_view(v_id))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.league_student_summary(v_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_students_page(text, uuid, text, text, boolean, int, int)', 'public.league_student_profile(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
