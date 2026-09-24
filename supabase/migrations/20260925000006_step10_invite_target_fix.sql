-- Sửa lỗi F3: so khớp SĐT/email được mời bị lọt khi người mở link chưa có email (NULL trong SQL
-- làm biểu thức "not (a or b)" thành NULL → không chặn). Dùng coalesce để NULL luôn là "không khớp".
create or replace function public.invitation_for_caller(p_token text)
returns public.invitations language plpgsql stable security definer set search_path = public, auth as $$
declare
  i public.invitations;
  v_phone text;
  v_email text;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into i from public.invitations where token = p_token;
  if i.id is null then raise exception 'invite_not_found' using errcode = 'P0002'; end if;
  if i.used_at is not null or i.status = 'used' then raise exception 'invite_used' using errcode = '22023'; end if;
  if i.status = 'cancelled' then raise exception 'invite_cancelled' using errcode = '22023'; end if;
  if i.expires_at < now() then raise exception 'invite_expired' using errcode = '22023'; end if;
  select case when phone_confirmed_at is not null then '+' || phone end,
         case when email_confirmed_at is not null then lower(email) end
    into v_phone, v_email
  from auth.users where id = auth.uid();
  if not (coalesce(i.target = v_phone, false) or coalesce(lower(i.target) = v_email, false)) then
    raise exception 'invite_other_target' using errcode = '22023';
  end if;
  return i;
end $$;
revoke execute on function public.invitation_for_caller(text) from public, anon, authenticated;
