-- Spec 19 · bước 4 (phần B): ghi điểm thưởng tay, huỷ lần ghi sai, lên level tự động (Q5), sổ điểm cho admin.
-- docs/spec/19-mapping.md mục 3.B, Q5, Q6, Q9. Điểm danh / kỹ năng chưa có bảng → để sau (không tạo bảng mới).

-- Q5: lên level cần dòng điều chỉnh khi huỷ duyệt → thêm reason level_up_adjust (chỉ thêm giá trị)
alter table public.reward_ledger drop constraint if exists reward_ledger_reason_check;
alter table public.reward_ledger add constraint reward_ledger_reason_check check (reason in (
  'partner_visit', 'partner_visit_void', 'admin_adjust',
  'tournament_result', 'tournament_result_adjust',
  'school_award', 'attendance', 'attendance_full_month', 'skill_passed', 'level_up', 'conduct', 'theory_test', 'practice_test',
  'manual_void', 'level_up_adjust',
  'gift_order', 'gift_order_refund',
  'merge_transfer'));

insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('rewards.void_days', '7', 'Người ghi điểm thưởng được huỷ lần ghi của mình trong số ngày này (admin lúc nào cũng được)', 'Days during which the recorder can void their own reward entry', false),
  ('rewards.level_up_from', to_jsonb(public.vn_date(now())::text), 'Chỉ cộng điểm Lên level cho lần duyệt từ ngày này (không cộng dữ liệu cũ)', 'Level-up reward points only for approvals from this date', false)
on conflict do nothing;

-------------------------------------------------------------------------------
-- Quyền ghi theo vai (Q6: admin, HLV trưởng, HLV lớp; trợ giảng / GV thể dục không)
-------------------------------------------------------------------------------
-- Người gọi có phải HLV lớp (coach / head_coach trong class_staff) của một lớp đang học của học viên này không
create or replace function public.reward_is_class_coach_of(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    join public.classes c on c.id = e.class_id and c.deleted_at is null and c.status = 'active'
    join public.class_staff cs on cs.class_id = e.class_id and cs.user_id = auth.uid() and cs.role in ('coach', 'head_coach')
    join public.profiles p on p.user_id = cs.user_id and p.status = 'active'
    where e.student_id = p_student_id and e.status = 'active')
$$;

create or replace function public.reward_can_record(p_student_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
       ('admin' = any(p_roles) and public.is_admin())
    or ('head_coach' = any(p_roles) and public.is_head_coach())
    or ('coach' = any(p_roles) and public.reward_is_class_coach_of(p_student_id)))
$$;

-------------------------------------------------------------------------------
-- Danh mục nguồn ghi tay được (theo vai người gọi) và danh sách lớp / học viên để chọn
-------------------------------------------------------------------------------
create or replace function public.reward_rules_manual()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_head_coach() or public.has_role('coach')) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'name_vi', r.name_vi, 'name_en', r.name_en,
      'default_points', r.default_points, 'min_points', r.min_points, 'max_points', r.max_points,
      'note_required', r.note_required, 'photo_allowed', r.photo_allowed, 'first_pass_only', r.first_pass_only,
      'class_only', not ((public.is_admin() and 'admin' = any(r.allowed_roles)) or (public.is_head_coach() and 'head_coach' = any(r.allowed_roles))))
    order by r.sort_order)
    from public.reward_rules r
    where r.is_active and r.mode in ('manual', 'both')
      and ((public.is_admin() and 'admin' = any(r.allowed_roles))
        or (public.is_head_coach() and 'head_coach' = any(r.allowed_roles))
        or (public.has_role('coach') and 'coach' = any(r.allowed_roles)))), '[]');
end $$;

-- Lớp đang học để ghi cả lớp: admin / HLV trưởng thấy mọi lớp đang hoạt động; HLV lớp chỉ lớp mình
create or replace function public.reward_classes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'school', s.name,
      'students', (select count(*) from public.enrollments e where e.class_id = c.id and e.status = 'active')) order by c.name)
    from public.classes c left join public.schools s on s.id = c.school_id
    where c.deleted_at is null and c.status = 'active'
      and (public.is_admin() or public.is_head_coach()
           or exists (select 1 from public.class_staff cs where cs.class_id = c.id and cs.user_id = auth.uid() and cs.role in ('coach', 'head_coach')))), '[]');
end $$;

create or replace function public.reward_class_roster(p_class_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_head_coach()
          or exists (select 1 from public.class_staff cs where cs.class_id = p_class_id and cs.user_id = auth.uid() and cs.role in ('coach', 'head_coach'))) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'full_name', st.full_name, 'student_code', st.student_code) order by st.full_name)
    from public.enrollments e join public.students st on st.id = e.student_id and st.deleted_at is null and st.merged_into_student_id is null
    where e.class_id = p_class_id and e.status = 'active'), '[]');
end $$;

-- Admin / HLV trưởng: tìm một học viên bất kỳ (mã VNC hoặc tên)
create or replace function public.reward_find_students(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := btrim(coalesce(p_query, ''));
begin
  if not (public.is_admin() or public.is_head_coach()) then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if length(q) < 2 then return '[]'; end if;
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', st.id, 'full_name', st.full_name, 'student_code', st.student_code, 'birth_year', st.birth_year) as x
    from public.students st
    where st.deleted_at is null and st.merged_into_student_id is null
      and (public.normalize_code(st.student_code) = public.normalize_code(q)
           or public.normalize_name(st.full_name) like '%' || public.normalize_name(q) || '%')
    order by st.full_name limit 20) z), '[]');
end $$;

-------------------------------------------------------------------------------
-- Ghi điểm thưởng (một học viên, nhiều học viên, hoặc cả lớp). Mỗi con một dòng, chung source_id (một lần ghi).
-------------------------------------------------------------------------------
create or replace function public.reward_record(p_student_ids uuid[], p_class_id uuid, p_rule_code text, p_points int,
  p_note text, p_attachment_path text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  rr public.reward_rules;
  v_ids uuid[];
  v_pts int;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_batch uuid := gen_random_uuid();
  v_bad uuid[];
  s uuid;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  select * into rr from public.reward_rules where code = p_rule_code;
  if rr.id is null or not rr.is_active or rr.mode not in ('manual', 'both') then raise exception 'rule_unavailable' using errcode = '22023'; end if;

  if p_class_id is not null then
    select array_agg(e.student_id) into v_ids from public.enrollments e
    join public.students st on st.id = e.student_id and st.deleted_at is null and st.merged_into_student_id is null
    where e.class_id = p_class_id and e.status = 'active';
  else
    select array_agg(distinct x) into v_ids from unnest(coalesce(p_student_ids, '{}')) x;
  end if;
  if coalesce(cardinality(v_ids), 0) = 0 then raise exception 'students_required' using errcode = '22023'; end if;
  if cardinality(v_ids) > 200 then raise exception 'too_many' using errcode = '22023'; end if;
  if exists (select 1 from unnest(v_ids) x where not exists (
      select 1 from public.students st where st.id = x and st.deleted_at is null and st.merged_into_student_id is null)) then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  -- Tiêu chí 6: học viên ngoài lớp mình → từ chối cả lần ghi
  foreach s in array v_ids loop
    if not public.reward_can_record(s, rr.allowed_roles) then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  end loop;

  v_pts := coalesce(p_points, rr.default_points);
  if v_pts < rr.min_points or v_pts > rr.max_points then raise exception 'points_out_of_range' using errcode = '22023'; end if;
  if rr.note_required and v_note is null then raise exception 'note_required' using errcode = '22023'; end if;
  if p_attachment_path is not null and (not rr.photo_allowed or public.storage_first_uuid(p_attachment_path) is distinct from v_ids[1]
                                        or cardinality(v_ids) <> 1) then
    raise exception 'attachment_not_allowed' using errcode = '22023';
  end if;
  -- Bài kiểm tra: chỉ lần đạt đầu (dòng còn hiệu lực = chưa bị huỷ)
  if rr.first_pass_only then
    select array_agg(x) into v_bad from unnest(v_ids) x
    where exists (select 1 from public.reward_ledger l where l.student_id = x and l.reason = rr.code
                    and not exists (select 1 from public.reward_ledger v where v.voids_id = l.id));
    if v_bad is not null then raise exception 'already_passed' using errcode = '22023', detail = array_to_string(v_bad, ','); end if;
  end if;

  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, rule_id, note, attachment_path, created_by)
  select x, v_pts, rr.code, 'reward_rule', v_batch, rr.id, v_note, p_attachment_path, auth.uid() from unnest(v_ids) x;

  return jsonb_build_object('batch_id', v_batch, 'count', cardinality(v_ids), 'points', v_pts);
end $$;

-- Huỷ một dòng ghi tay: admin lúc nào cũng được; người ghi trong rewards.void_days ngày. Lý do bắt buộc. Mỗi dòng một lần.
create or replace function public.reward_void(p_ledger_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare l public.reward_ledger;
begin
  select * into l from public.reward_ledger where id = p_ledger_id;
  if l.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.is_admin() or (l.created_by = auth.uid()
          and l.created_at > now() - make_interval(days => public.setting_int('rewards.void_days', 7)))) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if l.source_type is distinct from 'reward_rule' or l.reason = 'manual_void' or l.rule_id is null then
    raise exception 'not_voidable' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'reason_required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('reward_void:' || l.id::text));
  if exists (select 1 from public.reward_ledger where voids_id = l.id) then raise exception 'already_voided' using errcode = '22023'; end if;
  insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, rule_id, voids_id, is_frozen, note, created_by)
  values (l.student_id, -l.delta, 'manual_void', 'reward_rule', l.source_id, l.rule_id, l.id, l.is_frozen, btrim(p_reason), auth.uid());
end $$;

-- Lần ghi gần đây: người gọi thấy dòng mình ghi; admin thấy tất cả. Tên học viên chỉ hiện cho người có quyền ghi (nhân sự).
create or replace function public.reward_recent_records(p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_head_coach() or public.has_role('coach')) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select l.id, l.created_at, l.delta, l.reason, l.note, l.attachment_path, st.full_name, st.student_code,
           r.name_vi as rule_vi, r.name_en as rule_en, (l.created_by = auth.uid()) as mine,
           pr.full_name as created_by_name,
           (v.id is not null) as voided, v.note as void_reason,
           (v.id is null and (public.is_admin() or (l.created_by = auth.uid()
              and l.created_at > now() - make_interval(days => public.setting_int('rewards.void_days', 7))))) as can_void
    from public.reward_ledger l
    join public.students st on st.id = l.student_id
    left join public.reward_rules r on r.id = l.rule_id
    left join public.profiles pr on pr.user_id = l.created_by
    left join public.reward_ledger v on v.voids_id = l.id
    where l.source_type = 'reward_rule' and l.reason <> 'manual_void'
      and l.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)))
      and (public.is_admin() or l.created_by = auth.uid())
    order by l.created_at desc limit 300) x), '[]');
end $$;

-------------------------------------------------------------------------------
-- Q5: Lên level tự động khi HLV trưởng duyệt (assessment / school_entry), từ rewards.level_up_from.
-- Không cộng legacy_import / admin. Huỷ duyệt / xoá / chưa hoàn thành → dòng level_up_adjust trừ lại.
-------------------------------------------------------------------------------
create or replace function public.reward_sync_level(p_record_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  lr public.level_records;
  rr public.reward_rules;
  v_student uuid;
  rec record;
  v_from date := coalesce((select (value #>> '{}')::date from public.app_settings where key = 'rewards.level_up_from'), '2026-11-10');
begin
  perform pg_advisory_xact_lock(hashtext('reward_level:' || p_record_id::text));
  select * into lr from public.level_records where id = p_record_id;
  select * into rr from public.reward_rules where code = 'level_up';
  if lr.id is not null and lr.status = 'completed' and lr.approval_status = 'approved' and lr.source in ('assessment', 'school_entry')
     and lr.approved_at is not null and public.vn_date(lr.approved_at) >= v_from then
    v_student := lr.student_id;
  end if;
  for rec in
    select x.student_id,
           coalesce((select sum(l.delta) from public.reward_ledger l
                     where l.source_type = 'level_record' and l.source_id = p_record_id and l.student_id = x.student_id), 0)::int as given
    from (select l.student_id from public.reward_ledger l where l.source_type = 'level_record' and l.source_id = p_record_id
          union select v_student where v_student is not null) x
    order by (x.student_id = v_student) nulls first
  loop
    if rec.student_id is distinct from v_student and rec.given <> 0 then
      insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, rule_id, created_by)
      values (rec.student_id, -rec.given, 'level_up_adjust', 'level_record', p_record_id, rr.id, auth.uid());
    elsif rec.student_id = v_student and rec.given = 0 and rr.is_active then
      insert into public.reward_ledger (student_id, delta, reason, source_type, source_id, rule_id, created_by)
      values (v_student, rr.default_points,
              case when exists (select 1 from public.reward_ledger where source_type = 'level_record' and source_id = p_record_id and reason = 'level_up')
                   then 'level_up_adjust' else 'level_up' end,
              'level_record', p_record_id, rr.id, auth.uid());
    end if;
  end loop;
end $$;

create or replace function public.level_records_reward()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.reward_sync_level(case when tg_op = 'DELETE' then old.id else new.id end);
  return null;
end $$;
create trigger level_records_reward after insert or update or delete on public.level_records
  for each row execute function public.level_records_reward();

-------------------------------------------------------------------------------
-- Admin: sổ điểm theo học viên / nguồn / tháng (xuất CSV ở trình duyệt)
-------------------------------------------------------------------------------
create or replace function public.reward_admin_ledger(p_student_id uuid default null, p_reason text default null, p_month date default null,
  p_limit int default 500)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  return jsonb_build_object(
    'total', coalesce((select sum(l.delta) from public.reward_ledger l
       where (p_student_id is null or l.student_id = p_student_id) and (p_reason is null or l.reason = p_reason)
         and (p_month is null or date_trunc('month', public.vn_date(l.created_at)) = date_trunc('month', p_month))), 0),
    'rows', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select l.id, l.created_at, l.student_id, st.full_name, st.student_code, l.delta, l.reason, l.source_type, l.source_id,
             l.note, l.is_frozen, l.voids_id, l.attachment_path, pr.full_name as created_by_name,
             coalesce(r.name_vi, case when t.id is not null then ts.name_vi || ' · #' || t.stage_no || ' · ' || se.code end, p.name) as source_vi,
             coalesce(r.name_en, case when t.id is not null then ts.name_en || ' · #' || t.stage_no || ' · ' || se.code end, p.name) as source_en
      from public.reward_ledger l
      join public.students st on st.id = l.student_id
      left join public.profiles pr on pr.user_id = l.created_by
      left join public.reward_rules r on r.id = l.rule_id
      left join public.tournament_results tr on tr.id = l.source_id and l.source_type = 'tournament_result'
      left join public.tournaments t on t.id = tr.tournament_id
      left join public.tournament_series ts on ts.id = t.series_id
      left join public.seasons se on se.id = t.season_id
      left join public.partner_visits v on v.id = l.source_id and l.source_type = 'partner_visit'
      left join public.partners p on p.id = v.partner_id
      where (p_student_id is null or l.student_id = p_student_id) and (p_reason is null or l.reason = p_reason)
        and (p_month is null or date_trunc('month', public.vn_date(l.created_at)) = date_trunc('month', p_month))
      order by l.created_at desc limit greatest(1, least(coalesce(p_limit, 500), 5000))) x), '[]'));
end $$;

-------------------------------------------------------------------------------
-- Q9: ảnh giấy khen — kho riêng tư reward-proofs/{student_id}/… ; nhân sự có quyền ghi cho con tải lên;
-- xem: admin, người tải lên, phụ huynh của con
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reward-proofs', 'reward-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "reward proofs: nhân sự tải lên" on storage.objects for insert to authenticated
  with check (bucket_id = 'reward-proofs' and public.reward_can_record(public.storage_first_uuid(name), array['admin', 'head_coach', 'coach']));
create policy "reward proofs: xem" on storage.objects for select to authenticated
  using (bucket_id = 'reward-proofs' and (public.is_admin() or owner = auth.uid() or public.is_guardian_of(public.storage_first_uuid(name))));

do $$
begin
  revoke execute on function public.reward_is_class_coach_of(uuid) from public, anon, authenticated;
  revoke execute on function public.reward_sync_level(uuid) from public, anon, authenticated;
  revoke execute on function public.level_records_reward() from public, anon, authenticated;
  revoke execute on function public.reward_can_record(uuid, text[]) from public, anon;
  revoke execute on function public.reward_rules_manual() from public, anon;
  revoke execute on function public.reward_classes() from public, anon;
  revoke execute on function public.reward_class_roster(uuid) from public, anon;
  revoke execute on function public.reward_find_students(text) from public, anon;
  revoke execute on function public.reward_record(uuid[], uuid, text, int, text, text) from public, anon;
  revoke execute on function public.reward_void(uuid, text) from public, anon;
  revoke execute on function public.reward_recent_records(int) from public, anon;
  revoke execute on function public.reward_admin_ledger(uuid, text, date, int) from public, anon;
  grant execute on function public.reward_can_record(uuid, text[]), public.reward_rules_manual(), public.reward_classes(),
    public.reward_class_roster(uuid), public.reward_find_students(text), public.reward_record(uuid[], uuid, text, int, text, text),
    public.reward_void(uuid, text), public.reward_recent_records(int), public.reward_admin_ledger(uuid, text, date, int) to authenticated;
end $$;
