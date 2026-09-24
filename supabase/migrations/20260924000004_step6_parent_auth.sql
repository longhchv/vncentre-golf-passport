-- Bước 6 · Tài khoản phụ huynh (F1): OTP tự làm qua Edge Function auth-otp.
-- Mã OTP chỉ lưu dạng băm. Chế độ thử (Zalo/SMS chưa có tài khoản) lưu mã ở debug_code để admin xem.

alter table public.otp_logs
  drop constraint if exists otp_logs_purpose_check,
  add constraint otp_logs_purpose_check
    check (purpose in ('signup', 'reset_password', 'activation', 'invite', 'verify_email', 'add_phone')),
  drop constraint if exists otp_logs_status_check,
  add constraint otp_logs_status_check
    check (status in ('sent', 'failed', 'verified', 'expired', 'locked', 'used')),
  add column if not exists provider text,
  add column if not exists fallback_from text,
  add column if not exists error text,
  add column if not exists debug_code text,
  add column if not exists user_id uuid references public.profiles(user_id) on delete set null,
  add column if not exists meta jsonb not null default '{}',
  add column if not exists ticket_hash text,
  add column if not exists ticket_expires_at timestamptz,
  add column if not exists used_at timestamptz;

create index if not exists otp_logs_ip_idx on public.otp_logs (ip, created_at desc);

-------------------------------------------------------------------------------
-- Tìm tài khoản Auth theo SĐT / email — chỉ Edge Function (service role) gọi
-------------------------------------------------------------------------------
create or replace function public.auth_user_id_by_phone(p_phone text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where phone = ltrim(p_phone, '+') limit 1
$$;

create or replace function public.auth_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;

revoke execute on function public.auth_user_id_by_phone(text) from public, anon, authenticated;
revoke execute on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_phone(text) to service_role;
grant execute on function public.auth_user_id_by_email(text) to service_role;

-------------------------------------------------------------------------------
-- Phụ huynh đọc được dòng người giám hộ của chính mình (để app biết có không gian Phụ huynh)
-------------------------------------------------------------------------------
create policy own_read on public.guardians for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

-- Chi phí tin nhắn theo tháng cho trang admin "Tin nhắn và chi phí" (F16)
create or replace view public.message_costs_monthly with (security_invoker = true) as
select date_trunc('month', created_at at time zone 'Asia/Ho_Chi_Minh')::date as month,
       channel,
       count(*) as messages,
       count(*) filter (where status <> 'failed') as delivered,
       sum(cost_vnd) as cost_vnd
from public.otp_logs
group by 1, 2;
