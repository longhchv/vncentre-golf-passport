-- Spec 19 · Module điểm thưởng — bước 2: dữ liệu. Bản đối chiếu và Q1–Q11: docs/spec/19-mapping.md (anh Long duyệt 10/11/2026).
-- Chỉ thêm: giá trị reason mới, cột mới, bảng mới. Không xoá / đổi tên bảng, cột, dữ liệu cũ.
-- Chưa có hàm ghi nào ở bước này (phần A, B, C là bước 3, 4, 5).

-------------------------------------------------------------------------------
-- reward_ledger: reason mới, cột mới
-------------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.reward_ledger'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%partner_visit_void%'
  loop
    execute format('alter table public.reward_ledger drop constraint %I', c);
  end loop;
end $$;
alter table public.reward_ledger add constraint reward_ledger_reason_check check (reason in (
  -- spec 18
  'partner_visit', 'partner_visit_void', 'admin_adjust',
  -- phần A: kết quả giải
  'tournament_result', 'tournament_result_adjust',
  -- phần B: nguồn trong reward_rules + huỷ ghi tay
  'school_award', 'attendance', 'attendance_full_month', 'skill_passed', 'level_up', 'conduct', 'theory_test', 'practice_test',
  'manual_void',
  -- phần C: đổi quà
  'gift_order', 'gift_order_refund',
  -- Q4: gộp hồ sơ chuyển số dư
  'merge_transfer'));

alter table public.reward_ledger add column if not exists expires_at timestamptz;          -- D59: để trống, chưa trừ điểm hết hạn
alter table public.reward_ledger add column if not exists rule_id uuid;                     -- nguồn trong reward_rules (ghi tay / tự động)
alter table public.reward_ledger add column if not exists attachment_path text;             -- ảnh giấy khen (Q9)
alter table public.reward_ledger add column if not exists voids_id uuid references public.reward_ledger(id);  -- dòng manual_void trỏ dòng bị huỷ

create index if not exists reward_ledger_source_idx on public.reward_ledger (source_type, source_id);
-- Mỗi dòng chỉ bị huỷ một lần
create unique index if not exists reward_ledger_voids_one on public.reward_ledger (voids_id) where voids_id is not null;
-- Nguyên tắc 5: mỗi nguồn tự động chỉ một dòng gốc cho mỗi (source_type, source_id, reason)
create unique index if not exists reward_ledger_origin_one on public.reward_ledger (source_type, source_id, reason)
  where reason in ('tournament_result', 'gift_order', 'gift_order_refund', 'level_up', 'partner_visit');

-- Nguyên tắc 2: không sửa, không xoá dòng sổ. Q3: riêng is_frozen / cycle_no được đổi (cơ chế treo gói Free về sau)
create or replace function public.reward_ledger_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ledger_immutable' using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - 'is_frozen' - 'cycle_no' - 'updated_at') <> (to_jsonb(old) - 'is_frozen' - 'cycle_no' - 'updated_at') then
    raise exception 'ledger_immutable' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger reward_ledger_immutable before update or delete on public.reward_ledger
  for each row execute function public.reward_ledger_immutable();

-------------------------------------------------------------------------------
-- Giải đấu: hệ số điểm thưởng, cờ bật điểm thưởng theo chặng
-------------------------------------------------------------------------------
-- Không dùng ranking_coefficient cho điểm thưởng. SNAG Golf League = 1
alter table public.tournament_series add column if not exists reward_coefficient numeric(4, 2) not null default 1
  check (reward_coefficient >= 0);

-- Q1: các chặng đang có = false (chờ D60, cộng bù bằng hàm riêng); chặng tạo sau = true.
-- Thêm cột với default false rồi mới đổi default → không phải update dòng nào.
alter table public.tournaments add column if not exists reward_enabled boolean not null default false;
alter table public.tournaments alter column reward_enabled set default true;

-------------------------------------------------------------------------------
-- Danh mục nguồn điểm thưởng (phụ lục C1; admin chỉnh)
-------------------------------------------------------------------------------
create table public.reward_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  -- code dùng làm reward_ledger.reason → chỉ nhận các giá trị CHECK của sổ
  code text not null unique check (code in ('school_award', 'attendance', 'attendance_full_month', 'skill_passed', 'level_up',
                                            'conduct', 'theory_test', 'practice_test')),
  name_vi text not null,
  name_en text not null,
  description_vi text,
  description_en text,
  default_points int not null check (default_points > 0),
  min_points int not null check (min_points > 0),
  max_points int not null,
  -- vai được ghi tay: admin / head_coach (HLV trưởng) / coach (HLV lớp, chỉ học viên lớp mình)
  allowed_roles text[] not null default '{}' check (allowed_roles <@ array['admin', 'head_coach', 'coach']),
  note_required boolean not null default false,
  photo_allowed boolean not null default false,
  mode text not null default 'manual' check (mode in ('manual', 'auto', 'both')),
  first_pass_only boolean not null default false,          -- bài kiểm tra: chỉ lần đạt đầu
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_points <= default_points and default_points <= max_points)
);

alter table public.reward_ledger add constraint reward_ledger_rule_fk foreign key (rule_id) references public.reward_rules(id);

insert into public.reward_rules (code, name_vi, name_en, default_points, min_points, max_points, allowed_roles, note_required, photo_allowed, mode, first_pass_only, sort_order) values
  ('school_award',          'Khen thưởng ở trường',          'School award',                 100, 50, 500, '{admin,head_coach,coach}', true,  true,  'manual', false, 10),
  ('conduct',               'Ứng xử tốt',                    'Good conduct',                  20, 10,  30, '{admin,head_coach,coach}', false, false, 'manual', false, 20),
  ('theory_test',           'Đạt bài kiểm tra lý thuyết level', 'Passed level theory test',  50, 50,  50, '{admin,head_coach,coach}', false, false, 'both',   true,  30),
  ('practice_test',         'Đạt bài kiểm tra thực hành level', 'Passed level practice test', 100, 100, 100, '{admin,head_coach,coach}', false, false, 'both', true,  40),
  ('level_up',              'Lên level',                     'Level up',                     200, 200, 200, '{}',                      false, false, 'auto',   true,  50),
  ('attendance',            'Có mặt 1 buổi',                 'Attended a session',            10, 10,  10, '{}',                      false, false, 'auto',   false, 60),
  ('attendance_full_month', 'Đi đủ buổi trong tháng',        'Full attendance for the month', 50, 50,  50, '{}',                      false, false, 'auto',   false, 70),
  ('skill_passed',          '1 kỹ năng đạt',                 'Skill passed',                  20, 20,  20, '{}',                      false, false, 'auto',   false, 80)
on conflict (code) do nothing;

-------------------------------------------------------------------------------
-- Kho quà, nhập / xuất kho, đơn quà
-------------------------------------------------------------------------------
create table public.gift_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  name_vi text not null check (btrim(name_vi) <> ''),
  name_en text,
  kind text not null default 'other' check (kind in ('equipment', 'apparel', 'accessory', 'voucher', 'premium', 'other')),
  description_vi text,
  description_en text,
  photo_path text,
  points int not null check (points > 0),
  is_active boolean not null default true,
  per_student_limit int check (per_student_limit is null or per_student_limit > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gift_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  gift_id uuid not null references public.gift_items(id),
  qty int not null default 1 check (qty > 0),
  points int not null check (points > 0),                   -- điểm trừ, chốt lúc đặt (đơn giá × qty)
  pickup text not null check (pickup in ('league', 'school', 'office', 'post')),
  ship_address jsonb,                                       -- chỉ khi pickup = 'post'
  ship_fee_vnd bigint check (ship_fee_vnd is null or ship_fee_vnd >= 0),   -- Q8: admin nhập sau khi đặt
  ship_order_id uuid references public.orders(id),          -- đơn payOS thu phí ship
  status text not null default 'placed' check (status in ('placed', 'prepared', 'delivered', 'shipped', 'completed', 'cancelled')),
  note text,
  cancel_reason text,
  created_by uuid references public.profiles(user_id) on delete set null,
  prepared_at timestamptz,
  handed_at timestamptz,                                    -- đã giao / đã gửi
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pickup <> 'post' or ship_address is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);
create index gift_orders_student_idx on public.gift_orders (student_id, created_at desc);
create index gift_orders_status_idx on public.gift_orders (status, created_at);

create table public.gift_stock_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  gift_id uuid not null references public.gift_items(id),
  qty int not null check (qty <> 0),                        -- + nhập / − xuất. Tồn = sum(qty)
  reason text not null check (reason in ('restock', 'order', 'order_cancel', 'adjust')),
  order_id uuid references public.gift_orders(id),
  note text,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reason not in ('order', 'order_cancel') or order_id is not null)
);
create index gift_stock_moves_gift_idx on public.gift_stock_moves (gift_id);

-- updated_at + nhật ký + RLS mặc định từ chối
do $$
declare t text;
begin
  foreach t in array array['reward_rules', 'gift_items', 'gift_orders', 'gift_stock_moves'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  -- Danh mục nguồn điểm, quà: admin sửa thẳng. Đơn, kho: admin chỉ xem, ghi qua hàm (bước 5)
  foreach t in array array['reward_rules', 'gift_items'] loop
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  foreach t in array array['gift_orders', 'gift_stock_moves'] loop
    execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;

revoke execute on function public.reward_ledger_immutable() from public, anon, authenticated;
