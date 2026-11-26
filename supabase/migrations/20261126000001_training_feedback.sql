-- Spec 25 · chạy thử: góp ý trong mục Tập luyện. Người dùng gửi góp ý kèm trang đang xem; admin xem, đổi trạng thái, ghi chú.
-- Chỉ thêm mới.

create table if not exists public.training_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  user_id uuid not null default auth.uid(),
  student_id uuid references public.students(id),
  page text not null default '',
  category text not null default 'other' check (category in ('bug', 'idea', 'content', 'other')),
  message text not null check (char_length(btrim(message)) between 3 and 2000),
  user_agent text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'wont_fix')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists training_feedback_status_idx on public.training_feedback (status, created_at desc);
create index if not exists training_feedback_user_idx on public.training_feedback (user_id, created_at desc);

alter table public.training_feedback enable row level security;
revoke all on public.training_feedback from anon;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.training_feedback'::regclass) then
    create trigger set_updated_at before update on public.training_feedback for each row execute function public.set_updated_at();
    create trigger audit_row after insert or update or delete on public.training_feedback for each row execute function public.audit_row();
  end if;
end $$;

-- Người gửi xem góp ý của mình; admin xem và sửa tất cả. Gửi mới chỉ qua hàm bên dưới.
drop policy if exists training_feedback_read on public.training_feedback;
create policy training_feedback_read on public.training_feedback for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists training_feedback_admin on public.training_feedback;
create policy training_feedback_admin on public.training_feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.training_send_feedback(p_page text, p_category text, p_message text, p_student_id uuid default null, p_user_agent text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_message, ''))) < 3 then raise exception 'feedback_too_short' using errcode = '22023'; end if;
  -- Chặn gửi dồn: tối đa 20 góp ý mỗi ngày mỗi tài khoản
  if (select count(*) from public.training_feedback where user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'feedback_rate_limited' using errcode = '22023';
  end if;
  -- Chỉ gắn học viên khi người gửi xem được học viên đó
  if p_student_id is not null and not coalesce(public.training_can_view(p_student_id), false) then p_student_id := null; end if;
  insert into public.training_feedback (user_id, student_id, page, category, message, user_agent)
  values (auth.uid(), p_student_id, left(coalesce(p_page, ''), 300),
          case when p_category in ('bug', 'idea', 'content', 'other') then p_category else 'other' end,
          left(btrim(p_message), 2000), left(p_user_agent, 300))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.training_send_feedback(text, text, text, uuid, text) from public, anon;
grant execute on function public.training_send_feedback(text, text, text, uuid, text) to authenticated;

-- Danh sách cho admin, kèm tên và email người gửi
create or replace function public.training_feedback_admin_list(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'created_at', f.created_at, 'page', f.page, 'category', f.category, 'message', f.message,
      'status', f.status, 'admin_note', f.admin_note, 'user_agent', f.user_agent,
      'sender', coalesce(p.full_name, u.email), 'email', u.email, 'student', s.full_name) order by f.created_at desc)
    from public.training_feedback f
    left join auth.users u on u.id = f.user_id
    left join public.profiles p on p.user_id = f.user_id
    left join public.students s on s.id = f.student_id
    where p_status is null or f.status = p_status), '[]');
end $$;
revoke execute on function public.training_feedback_admin_list(text) from public, anon;
grant execute on function public.training_feedback_admin_list(text) to authenticated;
