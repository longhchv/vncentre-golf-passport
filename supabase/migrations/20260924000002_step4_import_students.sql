-- Bước 4 · Nhập danh sách học sinh (F10, phụ lục A1).
-- Trình duyệt đọc file và chuẩn hoá từng dòng (src/features/imports/normalize.ts),
-- ghi vào import_rows; hai hàm dưới đây dò trùng và ghi dữ liệu thật trong một giao dịch.
--
-- import_rows.normalized: { full_name, date_of_birth, school_id, school_text, grade_class,
--                           contact_name, contact_phone, contact_email }
-- import_rows.messages:   [ { code, params } ]

-- Tìm học viên có sẵn khớp tên + ngày sinh; hoặc tên + trường khi thiếu ngày sinh (F10 bước 4)
create or replace function public.find_student_matches(
  p_full_name text, p_dob date, p_school_id uuid
)
returns table (id uuid, student_code text, full_name text, date_of_birth date, school_name text)
language sql stable security definer set search_path = public as $$
  select s.id, s.student_code, s.full_name, s.date_of_birth, coalesce(sc.short_name, sc.name)
  from public.students s
  left join public.schools sc on sc.id = s.current_school_id
  where s.deleted_at is null and s.merged_into_student_id is null
    and s.full_name_normalized = public.normalize_name(p_full_name)
    and (
      (p_dob is not null and s.date_of_birth = p_dob)
      or ((p_dob is null or s.date_of_birth is null) and s.current_school_id = p_school_id)
    )
  order by s.created_at
  limit 5
$$;

-- Bước "xem trước": gắn nhãn duplicate_suspect cho dòng nghi trùng học viên có sẵn
create or replace function public.import_validate_student_list(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_matches jsonb;
  v_batch public.import_batches;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if v_batch.id is null or v_batch.type <> 'student_list' then
    raise exception 'Không tìm thấy lô nhập' using errcode = 'P0002';
  end if;
  if v_batch.status not in ('uploaded', 'validated') then
    raise exception 'Lô đã nhập hoặc đã huỷ' using errcode = '22023';
  end if;

  for r in select * from public.import_rows where batch_id = p_batch_id and status <> 'error' loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'student_code', m.student_code, 'full_name', m.full_name,
             'date_of_birth', m.date_of_birth, 'school', m.school_name)), '[]'::jsonb)
      into v_matches
    from public.find_student_matches(
      r.normalized ->> 'full_name',
      nullif(r.normalized ->> 'date_of_birth', '')::date,
      nullif(r.normalized ->> 'school_id', '')::uuid) m;

    if jsonb_array_length(v_matches) > 0 then
      update public.import_rows
      set status = 'duplicate_suspect',
          matched_student_id = (v_matches -> 0 ->> 'id')::uuid,
          messages = (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(messages) x
                      where x ->> 'code' <> 'duplicate_existing')
                     || jsonb_build_array(jsonb_build_object('code', 'duplicate_existing', 'candidates', v_matches))
      where id = r.id;
    end if;
  end loop;

  update public.import_batches
  set status = 'validated',
      totals = (select jsonb_object_agg(status, n) from (
                  select status, count(*) n from public.import_rows where batch_id = p_batch_id group by status) t)
  where id = p_batch_id;

  return (select totals from public.import_batches where id = p_batch_id);
end $$;

-- Bước "Nhập": ghi học viên, lịch sử trường, ghi danh lớp, người giám hộ (F10 bước 5)
create or replace function public.import_commit_student_list(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_batch public.import_batches;
  r record;
  n jsonb;
  v_student uuid;
  v_school uuid;
  v_guardian uuid;
  v_phone text;
  v_email text;
  v_contact text;
  c_created int := 0;
  c_updated int := 0;
  c_skipped int := 0;
  c_errors int := 0;
  c_enrolled int := 0;
  c_g_created int := 0;
  c_g_reused int := 0;
  v_totals jsonb;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if v_batch.id is null or v_batch.type <> 'student_list' then
    raise exception 'Không tìm thấy lô nhập' using errcode = 'P0002';
  end if;
  if v_batch.status <> 'validated' then
    raise exception 'Lô chưa qua bước xem trước hoặc đã nhập' using errcode = '22023';
  end if;

  for r in select * from public.import_rows where batch_id = p_batch_id order by row_number loop
    n := r.normalized;

    if r.status = 'error' then
      c_errors := c_errors + 1;
      continue;
    end if;
    -- Dòng nghi trùng phải có quyết định; chưa quyết định hoặc chọn bỏ qua → không nhập
    if r.decision = 'skip' or (r.status = 'duplicate_suspect' and r.decision is null) then
      c_skipped := c_skipped + 1;
      continue;
    end if;

    v_school := coalesce(nullif(n ->> 'school_id', '')::uuid, v_batch.school_id);

    if r.status = 'duplicate_suspect' and r.decision = 'use_existing' and r.matched_student_id is not null then
      v_student := r.matched_student_id;
      update public.students
      set current_school_id = coalesce(v_school, current_school_id),
          current_grade_class = coalesce(nullif(n ->> 'grade_class', ''), current_grade_class),
          date_of_birth = coalesce(date_of_birth, nullif(n ->> 'date_of_birth', '')::date)
      where id = v_student;
      c_updated := c_updated + 1;
    else
      -- Học viên mới: mã học viên và mã kích hoạt tự sinh (F10 bước 5)
      insert into public.students (full_name, date_of_birth, current_school_id, current_grade_class)
      values (n ->> 'full_name', nullif(n ->> 'date_of_birth', '')::date, v_school, nullif(n ->> 'grade_class', ''))
      returning id into v_student;
      c_created := c_created + 1;
    end if;

    if v_school is not null and v_batch.academic_year_id is not null then
      insert into public.student_school_history (student_id, school_id, academic_year_id, grade_class)
      values (v_student, v_school, v_batch.academic_year_id, nullif(n ->> 'grade_class', ''))
      on conflict (student_id, school_id, academic_year_id)
      do update set grade_class = coalesce(excluded.grade_class, student_school_history.grade_class);
    end if;

    if v_batch.class_id is not null then
      insert into public.enrollments (student_id, class_id, status)
      values (v_student, v_batch.class_id, 'active')
      on conflict (student_id, class_id) do update set status = 'active', left_at = null;
      c_enrolled := c_enrolled + 1;
    end if;

    -- Người liên hệ → người giám hộ (chưa có tài khoản). Anh chị em cùng SĐT dùng chung một người giám hộ (A1).
    v_phone := nullif(n ->> 'contact_phone', '');
    v_email := nullif(lower(n ->> 'contact_email'), '');
    v_contact := nullif(n ->> 'contact_name', '');
    v_guardian := null;
    if v_phone is not null or v_email is not null or v_contact is not null then
      if v_phone is not null then
        select id into v_guardian from public.guardians where phone = v_phone and deleted_at is null order by created_at limit 1;
      end if;
      if v_guardian is null and v_email is not null then
        select id into v_guardian from public.guardians where lower(email) = v_email and deleted_at is null order by created_at limit 1;
      end if;
      if v_guardian is null then
        insert into public.guardians (full_name, phone, email)
        values (v_contact, v_phone, v_email)
        returning id into v_guardian;
        c_g_created := c_g_created + 1;
      else
        update public.guardians
        set full_name = coalesce(full_name, v_contact),
            phone = coalesce(phone, v_phone),
            email = coalesce(email, v_email)
        where id = v_guardian;
        c_g_reused := c_g_reused + 1;
      end if;

      insert into public.student_guardians (student_id, guardian_id, linked_via, status, linked_at)
      values (v_student, v_guardian, 'import', 'active', now())
      on conflict (student_id, guardian_id) where deleted_at is null do nothing;
    end if;

    update public.import_rows set matched_student_id = v_student where id = r.id;
  end loop;

  v_totals := jsonb_build_object(
    'created', c_created, 'updated', c_updated, 'skipped', c_skipped, 'errors', c_errors,
    'enrolled', c_enrolled, 'guardians_created', c_g_created, 'guardians_reused', c_g_reused);

  update public.import_batches set status = 'committed', totals = v_totals where id = p_batch_id;
  return v_totals;
end $$;

-- find_student_matches trả thông tin học viên → chỉ dùng nội bộ trong các hàm khác,
-- không ai gọi trực tiếp qua API (R3: không lộ kết quả tìm học viên)
revoke execute on function public.find_student_matches(text, date, uuid) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['public.import_validate_student_list(uuid)', 'public.import_commit_student_list(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Hàm nội bộ của Bước 2: chỉ trigger dùng, không mở qua API
revoke execute on function public.recompute_student_level(uuid) from public, anon, authenticated;
