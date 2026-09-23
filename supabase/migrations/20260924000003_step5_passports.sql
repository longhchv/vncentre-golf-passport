-- Bước 5 · Sổ Passport (F11): tạo lô mã, gán sổ cho học viên, huỷ sổ.
-- Mã sổ 8 ký tự ngẫu nhiên an toàn (public.new_passport_code, Bước 2).

-------------------------------------------------------------------------------
-- Cấu hình
-------------------------------------------------------------------------------
insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('app.public_base_url', '"https://app.vncentre.net"',
   'Địa chỉ web in trong QR (sổ, chứng nhận). Staging đặt địa chỉ thử; production là https://app.vncentre.net',
   'Web address printed in QR codes (passports, certificates). Staging uses its test address; production is https://app.vncentre.net',
   true)
on conflict (org_id, key) do nothing;

-- Bố cục tem mặc định vừa khổ A4 (210 × 297 mm): 5 cột × 6 hàng tem 35 × 45 mm
update public.app_settings
set value = '{"page": "A4", "width_mm": 35, "height_mm": 45, "columns": 5, "rows": 6, "margin_top_mm": 6, "margin_left_mm": 7.5, "gap_x_mm": 2, "gap_y_mm": 2}'
where key = 'passport_decal.layout';

-------------------------------------------------------------------------------
-- Tạo lô mã
-------------------------------------------------------------------------------
create or replace function public.create_passport_batch(
  p_name text, p_tier_id uuid, p_quantity int, p_print_method text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_batch uuid;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Thiếu tên lô' using errcode = '22023';
  end if;
  insert into public.passport_batches (name, tier_id, quantity, print_method, created_by)
  values (btrim(p_name), p_tier_id, p_quantity, p_print_method, auth.uid())
  returning id into v_batch;

  -- Mỗi mã sinh riêng (default new_passport_code), không tuần tự, không trùng
  insert into public.passports (batch_id, tier_id, status)
  select v_batch, p_tier_id, 'unassigned' from generate_series(1, p_quantity);

  return v_batch;
end $$;

-------------------------------------------------------------------------------
-- Gán sổ cho học viên (F11 "Gán sổ")
-------------------------------------------------------------------------------
create or replace function public.assign_passport(p_code text, p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text := public.normalize_code(p_code);
  p public.passports;
  v_months int;
  v_conflict text;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;

  select * into p from public.passports where passport_code = v_code for update;
  if p.id is null then
    raise exception 'passport_not_found' using errcode = 'P0002';
  end if;
  if p.status <> 'unassigned' then
    if p.student_id = p_student_id and p.status = 'assigned' then
      return jsonb_build_object('passport_id', p.id, 'code', p.passport_code, 'already', true);
    end if;
    raise exception 'passport_not_available:%', p.status using errcode = '22023';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and deleted_at is null and merged_into_student_id is null) then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  -- Không gán thêm sổ cùng cấp khi học viên đang có sổ assigned/active cùng cấp.
  -- Trường hợp mất sổ phải đi qua quy trình báo mất (F15): sổ cũ chuyển 'lost' trước.
  select status into v_conflict from public.passports
  where student_id = p_student_id and tier_id = p.tier_id and status in ('assigned', 'active')
  limit 1;
  if v_conflict is not null then
    raise exception 'student_has_passport:%', v_conflict using errcode = '22023';
  end if;

  select validity_months into v_months from public.passport_tiers where id = p.tier_id;

  update public.passports
  set student_id = p_student_id,
      status = 'assigned',
      issued_at = now(),
      expires_at = now() + make_interval(months => v_months),
      -- sổ cấp lại sau khi báo mất: trỏ tới sổ cũ gần nhất bị mất cùng cấp
      replaced_passport_id = (select id from public.passports
                              where student_id = p_student_id and tier_id = p.tier_id and status = 'lost'
                              order by updated_at desc limit 1)
  where id = p.id;

  return jsonb_build_object('passport_id', p.id, 'code', p.passport_code, 'already', false);
end $$;

-- Gán hàng loạt: lần lượt theo danh sách lớp (tên A→Z), bỏ qua em đã có sổ cùng cấp.
-- Trả danh sách đối chiếu "học viên ↔ mã sổ" để dán đúng sổ (F11 cách 2).
create or replace function public.assign_passports_bulk(p_class_id uuid, p_batch_id uuid)
returns table (student_id uuid, student_code text, full_name text, grade_class text, passport_code text, result text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_tier uuid;
  s record;
  v_code text;
  v_months int;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  select tier_id into v_tier from public.passport_batches where id = p_batch_id;
  if v_tier is null then
    raise exception 'batch_not_found' using errcode = 'P0002';
  end if;
  select validity_months into v_months from public.passport_tiers where id = v_tier;

  for s in
    select st.id, st.student_code, st.full_name, st.current_grade_class
    from public.enrollments e
    join public.students st on st.id = e.student_id and st.deleted_at is null and st.merged_into_student_id is null
    where e.class_id = p_class_id and e.status = 'active'
    order by st.full_name_normalized
  loop
    student_id := s.id;
    student_code := s.student_code;
    full_name := s.full_name;
    grade_class := s.current_grade_class;

    select ps.passport_code into v_code from public.passports ps
    where ps.student_id = s.id and ps.tier_id = v_tier and ps.status in ('assigned', 'active')
    limit 1;
    if v_code is not null then
      passport_code := v_code;
      result := 'already_has';
      return next;
      continue;
    end if;

    select ps.passport_code into v_code from public.passports ps
    where ps.batch_id = p_batch_id and ps.status = 'unassigned'
    order by ps.created_at, ps.passport_code
    limit 1
    for update skip locked;
    if v_code is null then
      passport_code := null;
      result := 'batch_empty';
      return next;
      continue;
    end if;

    update public.passports
    set student_id = s.id, status = 'assigned', issued_at = now(),
        expires_at = now() + make_interval(months => v_months)
    where passports.passport_code = v_code;
    passport_code := v_code;
    result := 'assigned';
    return next;
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Huỷ sổ (chỉ sổ chưa kích hoạt), bắt buộc lý do
-------------------------------------------------------------------------------
create or replace function public.void_passport(p_passport_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select status into v_status from public.passports where id = p_passport_id for update;
  if v_status is null then
    raise exception 'passport_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('unassigned', 'assigned') then
    raise exception 'passport_not_voidable:%', v_status using errcode = '22023';
  end if;
  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.passports set status = 'void', void_reason = btrim(p_reason) where id = p_passport_id;
end $$;

-- Thống kê số sổ theo trạng thái của từng lô (trang danh sách lô)
create or replace view public.passport_batch_stats with (security_invoker = true) as
select b.id as batch_id,
       count(p.*) filter (where p.status = 'unassigned') as unassigned,
       count(p.*) filter (where p.status = 'assigned') as assigned,
       count(p.*) filter (where p.status = 'active') as active,
       count(p.*) filter (where p.status in ('lost', 'void', 'retired')) as inactive
from public.passport_batches b
left join public.passports p on p.batch_id = b.id
group by b.id;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_passport_batch(text, uuid, int, text)',
    'public.assign_passport(text, uuid)',
    'public.assign_passports_bulk(uuid, uuid)',
    'public.void_passport(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
