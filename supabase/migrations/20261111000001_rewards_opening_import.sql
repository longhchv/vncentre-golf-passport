-- Spec 19 · D60 (anh Long 11/11/2026): KHÔNG cộng bù theo chặng. Nhập số dư điểm thưởng thực tế (điểm tích luỹ trước
-- khi có module — gồm cả học sinh ở trường không thi đấu) từ file Excel trên trang admin Điểm thưởng.
--
-- Mỗi học viên có MỘT dòng gốc 'opening_balance' (source_type 'opening_balance', source_id = id học viên).
-- Tải lại file đã sửa: chỉ ghi phần chênh 'opening_balance_adjust' (cùng quy tắc đồng bộ như điểm giải) → không cộng trùng.

alter table public.reward_ledger drop constraint if exists reward_ledger_reason_check;
alter table public.reward_ledger add constraint reward_ledger_reason_check check (reason in (
  'partner_visit', 'partner_visit_void', 'admin_adjust',
  'tournament_result', 'tournament_result_adjust',
  'school_award', 'attendance', 'attendance_full_month', 'skill_passed', 'level_up', 'conduct', 'theory_test', 'practice_test',
  'manual_void', 'level_up_adjust',
  'gift_order', 'gift_order_refund',
  'merge_transfer',
  'event_points', 'event_redemption',
  'opening_balance', 'opening_balance_adjust'));

create unique index if not exists reward_ledger_opening_one on public.reward_ledger (source_type, source_id, reason)
  where reason = 'opening_balance';

-------------------------------------------------------------------------------
-- Đối chiếu dòng trong file với hồ sơ học viên (chỉ đọc).
-- p_rows: [{row, code?, name, year?, phone?, school?}]
-- Thứ tự: mã học viên (nếu có) → họ tên chuẩn hoá; rồi lọc theo năm sinh, SĐT phụ huynh, trường khi còn nhiều hồ sơ.
-------------------------------------------------------------------------------
create or replace function public.reward_import_match(p_rows jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
  v_out jsonb := '[]';
  v_code text; v_name text; v_year int; v_phone text; v_school text;
  v_ids uuid[]; v_tmp uuid[];
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 3000 then raise exception 'invalid_rows' using errcode = '22023'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_code := nullif(btrim(coalesce(r ->> 'code', '')), '');
    v_name := public.normalize_name(r ->> 'name');
    v_year := case when (r ->> 'year') ~ '^\d{4}$' then (r ->> 'year')::int end;
    v_school := nullif(public.normalize_name(r ->> 'school'), '');
    begin
      v_phone := public.league_norm_phone(r ->> 'phone');
    exception when others then v_phone := null;
    end;

    if v_code is not null then
      select array_agg(st.id) into v_ids from public.students st
      where st.deleted_at is null and st.merged_into_student_id is null
        and public.normalize_code(st.student_code) = public.normalize_code(v_code);
    elsif v_name <> '' then
      select array_agg(st.id) into v_ids from public.students st
      where st.deleted_at is null and st.merged_into_student_id is null and st.full_name_normalized = v_name;
    else
      v_ids := null;
    end if;

    -- Năm sinh (khi dò theo tên): loại hồ sơ có năm sinh khác (hồ sơ chưa có năm sinh vẫn giữ)
    if v_year is not null and v_code is null and cardinality(v_ids) >= 1 then
      select array_agg(st.id) into v_tmp from public.students st
      where st.id = any(v_ids)
        and coalesce(st.birth_year::int, extract(year from st.date_of_birth)::int, v_year) = v_year;
      v_ids := v_tmp;
    end if;
    -- SĐT phụ huynh: nếu có hồ sơ khớp số thì chỉ giữ các hồ sơ đó
    if v_phone is not null and cardinality(v_ids) > 1 then
      select array_agg(distinct sg.student_id) into v_tmp from public.student_guardians sg
      join public.guardians g on g.id = sg.guardian_id
      where sg.student_id = any(v_ids) and sg.status = 'active' and g.phone = v_phone;
      if cardinality(v_tmp) > 0 then v_ids := v_tmp; end if;
    end if;
    -- Trường: tương tự
    if v_school is not null and cardinality(v_ids) > 1 then
      select array_agg(st.id) into v_tmp from public.students st join public.schools sc on sc.id = st.current_school_id
      where st.id = any(v_ids)
        and (public.normalize_name(sc.name) like '%' || v_school || '%' or public.normalize_name(sc.short_name) = v_school);
      if cardinality(v_tmp) > 0 then v_ids := v_tmp; end if;
    end if;

    v_out := v_out || jsonb_build_object(
      'row', r -> 'row',
      'status', case when coalesce(cardinality(v_ids), 0) = 0 then 'not_found' when cardinality(v_ids) = 1 then 'matched' else 'ambiguous' end,
      'candidates', coalesce((select jsonb_agg(jsonb_build_object(
          'id', st.id, 'full_name', st.full_name, 'student_code', st.student_code,
          'birth_year', coalesce(st.birth_year::int, extract(year from st.date_of_birth)::int),
          'school', sc.name,
          'opening', (select sum(l.delta) from public.reward_ledger l
                      where l.student_id = st.id and l.reason in ('opening_balance', 'opening_balance_adjust')),
          'available', public.reward_available(st.id)) order by st.full_name, st.student_code)
        from public.students st left join public.schools sc on sc.id = st.current_school_id
        where st.id = any(v_ids) and cardinality(v_ids) <= 10), '[]'));
  end loop;
  return v_out;
end $$;

-------------------------------------------------------------------------------
-- Ghi số dư đầu kỳ. p_items: [{student_id, points}]. Tải lại: chỉ ghi phần chênh.
-------------------------------------------------------------------------------
create or replace function public.reward_import_opening(p_items jsonb, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  it record;
  v_cur int;
  v_has boolean;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 200);
  n_new int := 0; n_adj int := 0; n_same int := 0;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 3000 then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x
             where not ((x ->> 'points') ~ '^\d{1,6}$') or (x ->> 'student_id') is null) then
    raise exception 'invalid_points' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct x ->> 'student_id') from jsonb_array_elements(p_items) x) then
    raise exception 'duplicate_student' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x
             left join public.students st on st.id = (x ->> 'student_id')::uuid and st.deleted_at is null and st.merged_into_student_id is null
             where st.id is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  for it in select (x ->> 'student_id')::uuid as sid, (x ->> 'points')::int as pts from jsonb_array_elements(p_items) x loop
    perform 1 from public.students where id = it.sid for update;
    select coalesce(sum(delta), 0), count(*) filter (where reason = 'opening_balance') > 0 into v_cur, v_has
    from public.reward_ledger
    where student_id = it.sid and source_type = 'opening_balance' and reason in ('opening_balance', 'opening_balance_adjust');
    if not v_has then
      if it.pts = 0 then n_same := n_same + 1; continue; end if;
      insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, note, created_by)
      values (it.sid, it.pts, 'opening_balance', 'opening_balance', it.sid, v_note, auth.uid());
      n_new := n_new + 1;
    elsif it.pts <> v_cur then
      insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, note, created_by)
      values (it.sid, it.pts - v_cur, 'opening_balance_adjust', 'opening_balance', it.sid, v_note, auth.uid());
      n_adj := n_adj + 1;
    else
      n_same := n_same + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted', n_new, 'adjusted', n_adj, 'unchanged', n_same);
end $$;

do $$
begin
  revoke execute on function public.reward_import_match(jsonb) from public, anon;
  revoke execute on function public.reward_import_opening(jsonb, text) from public, anon;
  grant execute on function public.reward_import_match(jsonb), public.reward_import_opening(jsonb, text) to authenticated;
end $$;
