-- Bước 15 · Bảng điều khiển admin (F16), quản lý đồng ý và đồng ý lại khi đổi phiên bản (F18), yêu cầu xoá dữ liệu.

-------------------------------------------------------------------------------
-- Bảng điều khiển
-------------------------------------------------------------------------------
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', now())::date;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'students', (select count(*) from public.students where deleted_at is null and merged_into_student_id is null),
    'activated', (select count(*) from public.students where deleted_at is null and merged_into_student_id is null and activated_at is not null),
    'guardian_accounts', (select count(*) from public.guardians where user_id is not null and deleted_at is null),
    -- Liên hệ thu được: SĐT / email của phụ huynh đã có tài khoản
    'contacts_phone', (select count(distinct p.phone) from public.guardians g join public.profiles p on p.user_id = g.user_id where g.deleted_at is null and p.phone is not null),
    'contacts_email', (select count(distinct lower(p.email)) from public.guardians g join public.profiles p on p.user_id = g.user_id where g.deleted_at is null and p.email is not null),
    'by_school', coalesce((select jsonb_agg(x order by x ->> 'name') from (
      select jsonb_build_object('id', sc.id, 'name', coalesce(sc.short_name, sc.name),
        'students', count(s.id), 'activated', count(s.id) filter (where s.activated_at is not null)) x
      from public.schools sc join public.students s on s.current_school_id = sc.id and s.deleted_at is null and s.merged_into_student_id is null
      group by sc.id) q), '[]'),
    'by_class', coalesce((select jsonb_agg(x order by (x ->> 'students')::int desc) from (
      select jsonb_build_object('id', c.id, 'name', c.name, 'students', count(s.id), 'activated', count(s.id) filter (where s.activated_at is not null)) x
      from public.classes c join public.enrollments e on e.class_id = c.id and e.status = 'active'
      join public.students s on s.id = e.student_id and s.deleted_at is null and s.merged_into_student_id is null
      where c.deleted_at is null and c.status = 'active'
      group by c.id limit 200) q), '[]'),
    'queue', jsonb_build_object(
      'course_history', (select count(*) from public.course_history where status = 'pending_review' and deleted_at is null),
      'level_records', (select count(*) from public.level_records where approval_status = 'pending'),
      'students', (select count(*) from public.students where verification_status = 'pending_review' and deleted_at is null and merged_into_student_id is null),
      'guardian_links', (select count(*) from public.student_guardians where status = 'pending_confirmation' and deleted_at is null),
      'link_requests', (select count(*) from public.link_requests where status = 'pending'),
      'support_requests', (select count(*) from public.support_requests where status = 'pending')),
    'orders_need_passport', (select count(*) from public.orders o where o.status = 'paid'
                              and not exists (select 1 from public.passports np where np.replaced_passport_id = o.related_passport_id)),
    'orders_pending', (select count(*) from public.orders where status = 'pending' and expires_at > now()),
    'invoices_requested', (select count(*) from public.invoice_requests where status = 'requested'),
    'message_cost_month', (select coalesce(sum(cost_vnd), 0) from public.otp_logs where created_at >= v_month),
    'messages_month', (select count(*) from public.otp_logs where created_at >= v_month and channel in ('zalo', 'sms')),
    'certificates', (select count(*) from public.certificates where status = 'valid'));
end $$;

-------------------------------------------------------------------------------
-- F18 · Đồng ý
-------------------------------------------------------------------------------
-- Trạng thái đồng ý của người đang đăng nhập (phụ huynh): cần đồng ý lại khi Điều khoản / Chính sách có phiên bản mới
create or replace function public.my_consent_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_guardian uuid := public.my_guardian_id();
  v jsonb;
  v_terms text;
  v_privacy text;
begin
  select value into v from public.app_settings where key = 'legal.versions';
  if v_guardian is null then return jsonb_build_object('is_guardian', false, 'needs_reconsent', false); end if;
  -- Phiên bản đã đồng ý: ưu tiên phiên bản hiện hành nếu đã đồng ý, không thì phiên bản gần nhất
  select c.version into v_terms from public.consents c where c.guardian_id = v_guardian and c.type = 'terms' and c.granted
  order by (c.version = v ->> 'terms') desc, c.granted_at desc limit 1;
  select c.version into v_privacy from public.consents c where c.guardian_id = v_guardian and c.type = 'privacy' and c.granted
  order by (c.version = v ->> 'privacy') desc, c.granted_at desc limit 1;
  return jsonb_build_object(
    'is_guardian', true,
    'versions', v,
    'accepted', jsonb_build_object('terms', v_terms, 'privacy', v_privacy),
    -- Chỉ hỏi lại khi đã từng đồng ý phiên bản cũ (người chưa đồng ý lần nào sẽ đồng ý ở bước kích hoạt)
    'needs_reconsent', (v_terms is not null and v_terms is distinct from v ->> 'terms')
                       or (v_privacy is not null and v_privacy is distinct from v ->> 'privacy'));
end $$;

create or replace function public.accept_legal()
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_guardian uuid := public.my_guardian_id();
  v jsonb;
begin
  if v_guardian is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into v from public.app_settings where key = 'legal.versions';
  insert into public.consents (guardian_id, student_id, type, version, granted) values
    (v_guardian, null, 'terms', coalesce(v ->> 'terms', 'v0'), true),
    (v_guardian, null, 'privacy', coalesce(v ->> 'privacy', 'v0'), true);
end $$;

-- Đồng ý tuỳ chọn theo từng con: hiện tên trên bảng xếp hạng, ảnh (nếu trường yêu cầu)
create or replace function public.my_consents()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_guardian uuid := public.my_guardian_id();
begin
  if v_guardian is null then return '[]'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'student_id', s.id, 'full_name', s.full_name, 'can_manage', sg.can_manage,
      'photo_required', coalesce(sc.requires_photo_consent, false),
      'leaderboard_name', (select jsonb_build_object('granted', c.granted, 'at', c.granted_at) from public.consents c
                           where c.guardian_id = v_guardian and c.student_id = s.id and c.type = 'leaderboard_name' order by c.granted_at desc limit 1),
      'photo', (select jsonb_build_object('granted', c.granted, 'at', c.granted_at) from public.consents c
                where c.guardian_id = v_guardian and c.student_id = s.id and c.type = 'photo' order by c.granted_at desc limit 1))
      order by s.full_name)
    from public.student_guardians sg join public.students s on s.id = sg.student_id
    left join public.schools sc on sc.id = s.current_school_id
    where sg.guardian_id = v_guardian and sg.status = 'active' and sg.deleted_at is null and s.deleted_at is null), '[]');
end $$;

-- Đổi đồng ý tuỳ chọn: ghi thêm một dòng (giữ lịch sử đồng ý / rút đồng ý)
create or replace function public.set_consent(p_student_id uuid, p_type text, p_granted boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  if p_type not in ('leaderboard_name', 'photo') then raise exception 'invalid_type' using errcode = '22023'; end if;
  if not public.can_manage_student(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into v from public.app_settings where key = 'legal.versions';
  -- clock_timestamp: mỗi lần đổi có thời điểm riêng (kể cả nhiều lần trong một giao dịch)
  insert into public.consents (guardian_id, student_id, type, version, granted, granted_at)
  values (public.my_guardian_id(), p_student_id, p_type, coalesce(v ->> 'terms', 'v0'), p_granted, clock_timestamp());
end $$;

-------------------------------------------------------------------------------
-- F18 · Yêu cầu xoá dữ liệu của con → hàng chờ admin (xử lý thủ công, có nhật ký)
-------------------------------------------------------------------------------
create or replace function public.request_data_deletion(p_student_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.can_manage_student(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.support_requests where student_id = p_student_id and type = 'data_deletion' and status = 'pending') then
    raise exception 'already_requested' using errcode = '22023';
  end if;
  insert into public.support_requests (student_id, requester_user_id, type, body)
  values (p_student_id, auth.uid(), 'data_deletion', coalesce(nullif(btrim(p_reason), ''), '—'));
end $$;

create or replace function public.data_deletion_pending(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_guardian_of(p_student_id, false)
     and exists (select 1 from public.support_requests where student_id = p_student_id and type = 'data_deletion' and status = 'pending')
$$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_dashboard()', 'public.my_consent_status()', 'public.accept_legal()', 'public.my_consents()',
                           'public.set_consent(uuid, text, boolean)', 'public.request_data_deletion(uuid, text)', 'public.data_deletion_pending(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
