-- Giai đoạn 3 (docs/spec/12-ma-vnc-so-dep-dang-nhap.md mục 7b, 7c): đăng nhập nhiều cách, tự sinh mã VNC đúng một lần,
-- link giới thiệu bằng mã VNC.
--
-- Mã VNC sinh ở bước "Chào mừng" sau lần đăng nhập đầu (auth_onboard), KHÔNG sinh ngay trong trigger auth.users vì:
--   · Google / Apple / Facebook / Microsoft chưa cho họ tên, năm sinh;
--   · tài khoản con (tên + PIN) cũng là auth.users — không được sinh hồ sơ thứ hai cho con;
--   · đăng ký bằng SĐT (auth-otp) tự nối với dòng phụ huynh nhập từ trường — trigger sẽ tạo dòng phụ huynh trùng.
-- auth_onboard khoá theo tài khoản và kiểm tra hồ sơ self trước khi tạo → gọi lại / đăng nhập lại không sinh thêm mã.
-- Cùng email đã xác thực: Supabase Auth tự gộp các cách đăng nhập vào một auth.users → một hồ sơ, một mã.
-- Chỉ thêm: cột, cài đặt, hàm, trigger; thay thân guard_profile_update, handle_new_auth_user, handle_auth_user_updated,
-- referral_claim (giữ nguyên hành vi cũ, thêm phần mới).

-------------------------------------------------------------------------------
-- 1. Hồ sơ tối thiểu sau đăng nhập, SĐT chưa xác thực
-------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists birth_year int check (birth_year between 1900 and 2100),
  add column if not exists account_kind text check (account_kind in ('student', 'adult')),
  add column if not exists phone_verified boolean not null default false,
  add column if not exists onboarded_at timestamptz;

-- SĐT đã xác thực = Supabase Auth đã xác nhận SĐT (OTP SMS / Zalo). Đăng ký qua email (spec 16): chưa xác thực.
update public.profiles p set phone_verified = (u.phone_confirmed_at is not null and coalesce(u.phone, '') <> '')
from auth.users u where u.id = p.user_id and p.phone_verified is distinct from (u.phone_confirmed_at is not null and coalesce(u.phone, '') <> '');

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, phone, full_name, preferred_language, phone_verified)
  values (
    new.id,
    new.email,
    case when new.phone is null or new.phone = '' then null else '+' || ltrim(new.phone, '+') end,
    -- OAuth: Google / Microsoft / Facebook gửi full_name hoặc name
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ''),
    case when new.raw_user_meta_data ->> 'preferred_language' = 'en' then 'en' else 'vi' end,
    new.phone_confirmed_at is not null and coalesce(new.phone, '') <> ''
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

create or replace function public.handle_auth_user_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email or new.phone is distinct from old.phone
     or new.phone_confirmed_at is distinct from old.phone_confirmed_at then
    update public.profiles
      set email = new.email,
          phone = case when new.phone is null or new.phone = '' then null else '+' || ltrim(new.phone, '+') end,
          phone_verified = new.phone_confirmed_at is not null and coalesce(new.phone, '') <> ''
      where user_id = new.id;
  end if;
  return new;
end $$;

-- Người dùng tự sửa tên, ngôn ngữ, ảnh…; năm sinh, loại tài khoản, ngày hoàn tất chỉ qua auth_onboard; SĐT đã xác thực chỉ hệ thống đặt
create or replace function public.guard_profile_update()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status
       or new.user_id is distinct from old.user_id
       or new.email is distinct from old.email
       or new.phone is distinct from old.phone
       or new.org_id is distinct from old.org_id
       or new.cv_type is distinct from old.cv_type
       or new.joined_vncentre_on is distinct from old.joined_vncentre_on
       or new.phone_verified is distinct from old.phone_verified
       or ((new.birth_year is distinct from old.birth_year or new.account_kind is distinct from old.account_kind
            or new.onboarded_at is distinct from old.onboarded_at)
           and coalesce(current_setting('app.auth_onboarding', true), '') <> 'on') then
      raise exception 'Không có quyền sửa trường này' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-------------------------------------------------------------------------------
-- 2. Cài đặt: cách đăng nhập đang bật (đọc công khai để trang đăng nhập hiện nút), mốc áp dụng bước Chào mừng
-------------------------------------------------------------------------------
insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('auth.providers', '{"email_otp": true, "google": false, "apple": false, "facebook": false, "azure": false}',
   'Cách đăng nhập hiện trên app: email_otp (mã qua email), google, apple, facebook, azure (Microsoft). Chỉ bật sau khi đã cấu hình nhà cung cấp trong Supabase Auth',
   'Sign-in methods shown in the app (enable only after configuring the provider in Supabase Auth)', true),
  ('auth.onboarding_from', to_jsonb(now()::text),
   'Tài khoản tạo từ thời điểm này phải qua bước Chào mừng (họ tên, năm sinh, loại tài khoản) và được sinh mã VNC; tài khoản cũ không bị hỏi lại',
   'Accounts created from this time go through onboarding and get a VNC code', false)
on conflict do nothing;

-------------------------------------------------------------------------------
-- 3. Hồ sơ golfer của chính tài khoản (quan hệ self) và trạng thái đăng nhập
-------------------------------------------------------------------------------
create or replace function public.auth_self_student()
returns uuid language sql stable security definer set search_path = public as $$
  select sg.student_id from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id
  join public.students s on s.id = sg.student_id
  where g.user_id = auth.uid() and g.deleted_at is null and sg.deleted_at is null
    and sg.relationship = 'self' and sg.status = 'active'
    and s.deleted_at is null and s.merged_into_student_id is null
  order by sg.linked_at nulls last, sg.created_at
  limit 1
$$;

-- Trạng thái của tài khoản đang đăng nhập: cần qua bước Chào mừng không, mã VNC, SĐT đã xác thực chưa
create or replace function public.auth_my_identity()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  v_student uuid;
  v_child boolean;
  v_from timestamptz;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.profiles where user_id = auth.uid();
  v_student := public.auth_self_student();
  v_child := exists (select 1 from public.student_accounts a where a.user_id = auth.uid());
  begin
    v_from := (select (value #>> '{}')::timestamptz from public.app_settings where key = 'auth.onboarding_from');
  exception when others then v_from := null;
  end;
  return jsonb_build_object(
    'needs_onboarding', not v_child and p.user_id is not null and p.onboarded_at is null and v_student is null
                        and v_from is not null and p.created_at >= v_from,
    'is_student_account', v_child,
    'self_student_id', v_student,
    'student_code', (select student_code from public.students where id = v_student),
    'full_name', p.full_name, 'birth_year', p.birth_year, 'account_kind', p.account_kind,
    'email', p.email, 'phone', p.phone, 'phone_verified', coalesce(p.phone_verified, false));
end $$;

-- Bước Chào mừng: họ tên, năm sinh, học viên hay phụ huynh/người lớn. Tạo hồ sơ golfer self (mã VNC sinh tự động
-- qua next_student_code — một lần) nếu chưa có. Gọi lại nhiều lần chỉ cập nhật thông tin, không sinh mã mới.
create or replace function public.auth_onboard(p_full_name text, p_birth_year int, p_kind text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_year int := extract(year from now())::int;
  v_student uuid;
  v_guardian uuid;
  v_created boolean := false;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.student_accounts where user_id = auth.uid()) then
    raise exception 'student_account' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'name_required' using errcode = '22023'; end if;
  if p_birth_year is null or p_birth_year < v_year - 100 or p_birth_year > v_year then raise exception 'birth_year_invalid' using errcode = '22023'; end if;
  if p_kind not in ('student', 'adult') then raise exception 'kind_invalid' using errcode = '22023'; end if;

  -- Một tài khoản một lúc: hai lần bấm / hai thiết bị cùng lúc không tạo hai hồ sơ
  perform pg_advisory_xact_lock(hashtext('auth_onboard:' || auth.uid()::text));
  perform set_config('app.auth_onboarding', 'on', true);
  update public.profiles set full_name = v_name, birth_year = p_birth_year, account_kind = p_kind,
         onboarded_at = coalesce(onboarded_at, now())
  where user_id = auth.uid();
  perform set_config('app.auth_onboarding', 'off', true);

  v_student := public.auth_self_student();
  if v_student is null then
    v_guardian := public.ensure_my_guardian();
    update public.guardians set full_name = coalesce(full_name, v_name) where id = v_guardian;
    insert into public.students (full_name, birth_year, verification_status, self_reported)
    values (v_name, p_birth_year, 'pending_review',
            jsonb_build_object('source', 'onboarding', 'submitted_at', now(), 'full_name', v_name,
                               'birth_year', p_birth_year, 'kind', p_kind))
    returning id into v_student;
    insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_manage, linked_via, status, linked_at)
    values (v_student, v_guardian, 'self', true, true, 'onboarding', 'active', now());
    v_created := true;
  else
    -- Hồ sơ self đã có: chỉ bổ sung năm sinh nếu còn trống, không đổi tên / mã
    update public.students set birth_year = coalesce(birth_year, p_birth_year) where id = v_student;
  end if;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'auth.onboard', 'student', v_student, jsonb_build_object('created', v_created, 'kind', p_kind));
  return jsonb_build_object('student_id', v_student, 'created', v_created,
    'student_code', (select student_code from public.students where id = v_student));
end $$;

alter table public.student_guardians drop constraint if exists student_guardians_linked_via_check;
alter table public.student_guardians add constraint student_guardians_linked_via_check
  check (linked_via in ('passport', 'claim_code', 'invite', 'class_code', 'admin', 'import', 'event_card', 'league', 'training', 'onboarding'));

-------------------------------------------------------------------------------
-- 4. Link giới thiệu app.vncentre.net/r/<mã VNC>. Giữ mã giới thiệu cũ (8 ký tự, spec 18); thêm mã VNC
--    (mã chính, mã phụ, hồ sơ đã gộp đều được — vnc_student_id). Ghi một lần, không sửa (referral_links unique theo người mới).
-------------------------------------------------------------------------------
create or replace function public.referral_claim(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_ref uuid;
  v_created timestamptz;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_student uuid;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.referral_links where referred_user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'already_linked');
  end if;
  if v_code ~ '^(VNC-?)?\d{6}$' then
    -- Mã VNC → hồ sơ golfer → tài khoản đang giữ hồ sơ đó (quan hệ self)
    v_student := public.vnc_student_id(v_code);
    select u into v_ref from public.staff_self_users(v_student) as x(u) limit 1;
    v_code := 'VNC-' || right(regexp_replace(v_code, '\D', '', 'g'), 6);
  else
    select user_id into v_ref from public.referral_codes where code = v_code;
  end if;
  if v_ref is null then return jsonb_build_object('ok', false, 'reason', 'code_not_found'); end if;
  if v_ref = auth.uid() then return jsonb_build_object('ok', false, 'reason', 'own_code'); end if;
  select created_at into v_created from auth.users where id = auth.uid();
  if v_created < now() - make_interval(days => public.setting_int('referral.claim_window_days', 7)) then
    return jsonb_build_object('ok', false, 'reason', 'account_too_old');
  end if;
  insert into public.referral_links (referred_user_id, referrer_user_id, code) values (auth.uid(), v_ref, v_code);
  return jsonb_build_object('ok', true);
end $$;

-- Không cho sửa / xoá người giới thiệu đã ghi (kể cả gọi thẳng bảng)
create or replace function public.referral_links_immutable()
returns trigger language plpgsql as $$
begin
  -- Xoá theo tài khoản (cascade khi xoá người dùng ở Supabase Auth) không bị chặn: không có auth.uid()
  if auth.uid() is not null and (tg_op = 'DELETE' or new.referrer_user_id is distinct from old.referrer_user_id
     or new.code is distinct from old.code or new.referred_user_id is distinct from old.referred_user_id) then
    raise exception 'referral_locked' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists referral_links_immutable on public.referral_links;
create trigger referral_links_immutable before update or delete on public.referral_links
  for each row execute function public.referral_links_immutable();

do $$
begin
  revoke execute on function public.auth_self_student() from public, anon, authenticated;
  revoke execute on function public.auth_my_identity() from public, anon;
  revoke execute on function public.auth_onboard(text, int, text) from public, anon;
  revoke execute on function public.referral_claim(text) from public, anon;
  grant execute on function public.auth_my_identity(), public.auth_onboard(text, int, text), public.referral_claim(text) to authenticated;
end $$;
