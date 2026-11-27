-- Spec 24 · đợt 2b: các bạn nhỏ — tư vấn theo nhu cầu, lộ trình chia bước nhỏ (cơ hội → trình độ → lộ trình),
-- 4 phương án tài chính (siêu tiết kiệm, tiết kiệm, vừa phải, nhanh nhất). Checklist hồ sơ học bổng 78 mục đã có (spec 22), ở đây chỉ dẫn link.
-- Anh Long chốt 27/11/2026:
--   · Không hiện tổng tiền đến mục tiêu. Mỗi bước nói các con được gì trước; chi phí chỉ theo tháng, kèm "bỏ khoản này thì có gì" (gain_vi).
--   · Gậy: mọi phương án dùng bộ cơ bản; chọn gậy vừa với từng bạn, gậy đắt không làm các con tiến bộ nhanh hơn.
--   · Nơi học SNAG: trường công miễn phí; trường tư / quốc tế có phí do trường thu (admin nhập); ngoài trường theo giá lớp SNAG.
--     App chọn sẵn theo trường hiện tại của các con, phụ huynh sửa được.
--   · Phương án "siêu tiết kiệm": mua một lần lồng lưới, thảm, 1–2 cây gậy; tự tập ở nhà theo app, thỉnh thoảng đi kiểm tra / đánh giải.
--   · Chỉ số theo giai đoạn, không theo tuổi: SNAG → SNAG Handicap; gậy sắt → Junior Handicap (app Handicap tính, ở đây chỉ đọc);
--     giải 18 hố, tee đỏ → Handicap Index WHS.
-- Mọi con số là CHI PHÍ ƯỚC TÍNH, admin sửa được. Giá từng khoản: anh Long đưa (24 và 27/11/2026). Số buổi, số tháng: Minh đề xuất, chờ anh chỉnh.
-- Chỉ thêm bảng, hàm, dữ liệu mẫu.

-------------------------------------------------------------------------------
-- 1. Bảng
-------------------------------------------------------------------------------
create table public.training_cost_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  grp text not null check (grp in ('class', 'practice', 'tournament', 'equipment', 'home')),
  name_vi text not null check (btrim(name_vi) <> ''),
  name_en text not null default '',
  unit_vi text not null default 'buổi',
  unit_en text not null default 'session',
  min_vnd bigint not null default 0 check (min_vnd >= 0),
  max_vnd bigint not null default 0,
  price_pending boolean not null default false,   -- chưa có giá: app hiện "chờ cập nhật giá"
  gain_vi text,                                    -- bỏ khoản này thì các con có gì
  gain_en text,
  note_vi text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_vnd >= min_vnd)
);

-- Các bước lộ trình. phase quyết định công thức chi phí và chỉ số handicap hiện cho các con.
-- months: thời gian ước tính theo từng phương án {"super_saving":15,"saving":12,"balanced":9,"fast":6}
create table public.training_path_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  phase text not null check (phase in ('snag', 'iron9', 'iron18')),
  level_from int not null check (level_from between 1 and 20),
  level_to int not null check (level_to between 1 and 20),
  title_vi text not null check (btrim(title_vi) <> ''),
  title_en text not null default '',
  benefit_vi text,       -- các con được gì
  hcp_note_vi text,
  opportunity_vi text,   -- mở ra cơ hội gì
  focus_vi text,         -- cần làm gì
  months jsonb not null default '{"super_saving":15,"saving":12,"balanced":9,"fast":6}' check (jsonb_typeof(months) = 'object'),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (level_to >= level_from)
);

-- items: [{"item":"snag_group","qty":4,"per":"month"|"year"|"once","phase":"snag"|"iron9"|"iron18"|"all"}]
-- Khoản "snag_group" được thay theo nơi học SNAG của từng gia đình (trường công / trường tư, quốc tế / ngoài trường).
create table public.training_finance_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique check (code in ('super_saving', 'saving', 'balanced', 'fast')),
  name_vi text not null,
  name_en text not null default '',
  summary_vi text,
  tradeoff_vi text,
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nhu cầu của gia đình. goal_step: bước lộ trình nên hướng tới khi chọn nhu cầu này.
create table public.training_needs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  title_vi text not null,
  title_en text not null default '',
  advice_vi text,
  goal_step text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lựa chọn của gia đình cho từng bạn nhỏ
create table public.training_family_plans (
  student_id uuid primary key references public.students(id),
  id uuid not null default gen_random_uuid() unique,
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  needs text[] not null default '{}',
  plan_code text check (plan_code in ('super_saving', 'saving', 'balanced', 'fast')),
  snag_place text check (snag_place in ('public_school', 'private_school', 'outside')),  -- null = theo trường hiện tại
  updated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['training_cost_items', 'training_path_steps', 'training_finance_plans', 'training_needs', 'training_family_plans'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  foreach t in array array['training_cost_items', 'training_path_steps', 'training_finance_plans', 'training_needs'] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
end $$;

create policy training_family_plans_read on public.training_family_plans for select to authenticated
  using (public.is_admin() or coalesce(public.training_can_view(student_id), false));

-------------------------------------------------------------------------------
-- 2. Lưu lựa chọn: phụ huynh quản lý hồ sơ, các bạn tự nhập được (từ 11 tuổi), admin
-------------------------------------------------------------------------------
create or replace function public.training_set_family_plan(p_student_id uuid, p_needs text[], p_plan_code text default null,
                                                           p_snag_place text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_needs text[];
begin
  if not (public.is_admin() or (coalesce(public.can_manage_student(p_student_id), false) and public.training_enabled())
          or coalesce(public.training_can_enter(p_student_id), false)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_plan_code is not null and p_plan_code not in ('super_saving', 'saving', 'balanced', 'fast') then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  if p_snag_place is not null and p_snag_place not in ('public_school', 'private_school', 'outside') then
    raise exception 'invalid_place' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct n order by n), '{}') into v_needs
  from unnest(coalesce(p_needs, '{}')) n where exists (select 1 from public.training_needs x where x.code = n and x.is_active);
  insert into public.training_family_plans (student_id, needs, plan_code, snag_place, updated_by)
  values (p_student_id, v_needs, p_plan_code, p_snag_place,
          case when exists (select 1 from public.profiles where user_id = auth.uid()) then auth.uid() end)
  on conflict (student_id) do update
  set needs = excluded.needs, plan_code = excluded.plan_code, snag_place = excluded.snag_place, updated_by = excluded.updated_by;
  return jsonb_build_object('needs', v_needs, 'plan_code', p_plan_code, 'snag_place', p_snag_place);
end $$;
revoke execute on function public.training_set_family_plan(uuid, text[], text, text) from public, anon;
grant execute on function public.training_set_family_plan(uuid, text[], text, text) to authenticated;

-------------------------------------------------------------------------------
-- 3. Bối cảnh của các con: loại trường hiện tại (chọn sẵn nơi học SNAG) và 3 chỉ số theo giai đoạn.
--    Chỉ đọc: SNAG Handicap (snag_handicaps, từ SNAG Golf League), Junior Handicap (whs_youth_index, app Handicap tính),
--    Handicap Index WHS (whs_current_index). Không tính lại ở đây.
-------------------------------------------------------------------------------
create or replace function public.training_path_context(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_school text; v_snag jsonb; v_junior jsonb; v_whs jsonb;
begin
  if not coalesce(public.is_admin() or public.training_can_view(p_student_id) or public.is_guardian_of(p_student_id), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select sc.type into v_school from public.students s left join public.schools sc on sc.id = s.current_school_id where s.id = p_student_id;
  select jsonb_build_object('idx', h.idx, 'holes', h.holes, 'need', h.need_holes, 'as_of', h.as_of) into v_snag
  from public.snag_handicaps h where h.student_id = p_student_id;
  select jsonb_build_object('idx', y.idx, 'holes', y.holes, 'rounds', y.n_rounds, 'need', y.need, 'as_of', y.as_of) into v_junior
  from public.whs_youth_index y join public.whs_members m on m.id = y.member_id
  where m.student_id = p_student_id and y.kind = 'junior'
  order by y.computed_at desc limit 1;
  select jsonb_build_object('idx', w.handicap_index, 'holes', w.holes_posted, 'need', w.min_holes_required) into v_whs
  from public.whs_current_index(p_student_id) w limit 1;
  return jsonb_build_object(
    'school_type', v_school,
    'snag_place', case when v_school = 'public' then 'public_school'
                       when v_school in ('private', 'international') then 'private_school'
                       else 'outside' end,
    'snag', v_snag, 'junior', v_junior, 'whs', v_whs);
end $$;
revoke execute on function public.training_path_context(uuid) from public, anon;
grant execute on function public.training_path_context(uuid) to authenticated;

-------------------------------------------------------------------------------
-- 4. Dữ liệu mẫu
-------------------------------------------------------------------------------
insert into public.training_cost_items (code, grp, name_vi, name_en, unit_vi, unit_en, min_vnd, max_vnd, price_pending, gain_vi, note_vi, sort_order) values
  ('home',                'home',       'Tự tập tại nhà theo app',               'Home practice with the app',         'buổi', 'session',        0,        0, false,
   'Bài tập, thử thách và AI xem cú đánh ngay trên điện thoại; tự giác mỗi ngày là tiến bộ.', 'Quan trọng nhất là cách tập và sự tự giác, không phải tiền.', 10),
  ('snag_school_public',  'class',      'Lớp SNAG tại trường công',              'SNAG class at public school',        'buổi', 'session',        0,        0, false,
   'Học với HLV ngay ở trường, cùng các bạn trong lớp; miễn phí.', 'Các con học miễn phí tại trường', 20),
  ('snag_school_private', 'class',      'Lớp SNAG tại trường tư, quốc tế',       'SNAG class at private / international school', 'buổi', 'session', 0, 0, true,
   'Học với HLV ngay ở trường, cùng các bạn trong lớp.', 'Phí do trường thu; admin nhập theo từng trường khi có', 21),
  ('snag_group',          'class',      'Lớp SNAG nhóm (ngoài trường)',          'SNAG group class (outside school)',  'buổi', 'session',   200000,   200000, false,
   'Học kỹ thuật và luật với HLV, chơi cùng các bạn.', 'Mỗi bạn mỗi buổi', 22),
  ('snag_1on1',           'class',      'Lớp SNAG 1 kèm 1',                      'SNAG 1-on-1',                        'buổi', 'session',   350000,   350000, false,
   'HLV sửa riêng từng điểm yếu, các con lên level nhanh hơn.', null, 30),
  ('pga_group',           'class',      'Lớp HLV PGA nhóm',                      'PGA coach group class',              'buổi', 'session',   500000,   500000, false,
   'Học gậy sắt với HLV chuyên nghiệp, có bạn cùng tập.', 'Mỗi bạn mỗi buổi', 40),
  ('pga_1on1',            'class',      'Lớp HLV PGA 1 kèm 1',                   'PGA coach 1-on-1',                   'buổi', 'session',  1000000,  1000000, false,
   'HLV chuyên nghiệp kèm riêng, có kế hoạch riêng cho từng giải.', null, 50),
  ('range',               'practice',   'Sân tập (1 giờ hoặc 100 bóng)',         'Driving range (1 hour or 100 balls)', 'lần', 'visit',     100000,   200000, false,
   'Đánh bóng thật đủ xa, quen khoảng cách từng gậy.', null, 60),
  ('room3d',              'practice',   'Phòng golf 3D',                         'Golf simulator room',                'buổi', 'session',   200000,   500000, false,
   'Chơi trên sân ảo, máy đo từng cú đánh, tập cả khi mưa nắng.', 'Tuỳ loại máy', 70),
  ('fee_snag',            'tournament', 'Phí giải SNAG',                         'SNAG tournament fee',                'giải', 'event',     150000,   150000, false,
   'Thi đấu cùng các bạn, có kết quả được ghi nhận và SNAG Handicap.', null, 80),
  ('fee_9',               'tournament', 'Phí giải 9 hố',                         '9-hole tournament fee',              'giải', 'event',     700000,   800000, false,
   'Ra sân thật, có kết quả tính Junior Handicap.', null, 90),
  ('fee_18',              'tournament', 'Phí giải 18 hố',                        '18-hole tournament fee',             'giải', 'event',    1500000,  2000000, false,
   'Giải chính thức, có điểm Handicap Index và thành tích cho hồ sơ.', null, 100),
  ('net_cage',            'equipment',  'Lồng lưới tập tại nhà',                 'Home practice net',                  'cái',  'unit',     1500000,  2800000, false,
   'Đánh bóng thật ngay ở nhà, mỗi ngày đều tập được.', 'Lồng tam giác cơ bản khoảng 1,5 triệu; loại tốt khoảng 2,8 triệu', 110),
  ('mat',                 'equipment',  'Thảm tập',                              'Hitting mat',                        'tấm',  'unit',     1000000,  5000000, false,
   'Tập an toàn ở nhà, không hỏng sàn.', 'Thường khoảng 1 triệu là dùng được', 120),
  ('club_single',         'equipment',  '1–2 cây gậy tập',                       '1–2 practice clubs',                 'bộ',   'set',            0,        0, true,
   'Đủ để tập swing và đánh bóng ở nhà.', 'Chờ anh Long cho giá', 130),
  ('clubs_basic',         'equipment',  'Bộ gậy trẻ em cơ bản',                  'Junior club set (basic)',            'bộ',   'set',      2500000,  3000000, false,
   'Đủ gậy cho giải 9 và 18 hố.', 'Chọn gậy vừa với từng bạn; gậy đắt không làm các con tiến bộ nhanh hơn. Lớn lên chỉ cần đổi cán.', 140)
on conflict (code) do nothing;

insert into public.training_path_steps (code, phase, level_from, level_to, title_vi, title_en, benefit_vi, hcp_note_vi, opportunity_vi, focus_vi, months, sort_order) values
  ('s1', 'snag',   1,  3, 'Làm quen golf với SNAG',     'Getting started with SNAG',
   'Vận động ngoài trời, tự tin, kết bạn mới, biết chờ lượt và lịch sự trên sân.',
   'Chỉ số: SNAG Handicap',
   'Chơi giải SNAG Golf League đầu tiên.',
   'Đi lớp đều mỗi tuần, đạt thẻ level 1–3, tham gia 1 giải SNAG.', '{"super_saving":15,"saving":12,"balanced":9,"fast":6}', 10),
  ('s2', 'snag',   4,  9, 'SNAG nâng cao',               'Advanced SNAG',
   'Kiên nhẫn, trung thực khi tự đếm gậy, tập trung; có nhóm bạn cùng đam mê.',
   'Chỉ số: SNAG Handicap',
   'Thi đấu SNAG Golf League thường xuyên, bảng nâng cao, SNAG Golf Tour.',
   'Đạt thẻ level 4–9, nắm công thức các cú đánh, luật và phép lịch sự trên sân.', '{"super_saving":30,"saving":24,"balanced":18,"fast":12}', 20),
  ('s3', 'iron9',  10, 11, 'Lên gậy sắt, giải 6–9 hố',   'Full clubs, 6–9 hole events',
   'Ra sân golf thật cùng bố mẹ, tự lập hơn khi tự xử lý từng cú đánh.',
   'Chỉ số: Junior Handicap',
   'Đánh giải 6–9 hố, có Junior Handicap.',
   'Tập gậy sắt, ra sân tập đều, đạt thẻ level 10–11.', '{"super_saving":15,"saving":12,"balanced":9,"fast":6}', 30),
  ('s4', 'iron18', 12, 14, 'Tee đỏ, giải 18 hố',         'Red tees and 18-hole events',
   'Bản lĩnh thi đấu, biết đặt mục tiêu và tự đánh giá; được giao lưu với các bạn khắp nơi.',
   'Chỉ số: Handicap Index WHS (tham khảo 25 → 18)',
   'Giải 18 hố, giải trẻ cấp thành phố và toàn quốc.',
   'Có Handicap Index chính thức, ra sân thường xuyên, ghi thống kê từng vòng.', '{"super_saving":24,"saving":18,"balanced":12,"fast":9}', 40),
  ('s5', 'iron18', 15, 17, 'Giải nhiều ngày, đội tuyển', 'Multi-day events, school team',
   'Thành tích thể thao cho hồ sơ cấp 3 và đại học, kỹ năng lãnh đạo khi vào đội tuyển.',
   'Chỉ số: Handicap Index WHS (tham khảo 16 → 12)',
   'Giải 2–3 ngày có handicap, đội tuyển trường, trường cấp 3 có golf.',
   'Lịch thi đấu cả năm, tập thể lực và tâm lý thi đấu, bắt đầu hồ sơ học bổng.', '{"super_saving":30,"saving":24,"balanced":18,"fast":12}', 50),
  ('s6', 'iron18', 18, 20, 'Hồ sơ học bổng đại học',     'University scholarship profile',
   'Lợi thế rõ rệt khi xin vào đại học danh giá trong và ngoài nước; mạng lưới bạn bè quốc tế.',
   'Chỉ số: Handicap Index WHS (tham khảo 10 → dưới 5)',
   'Điểm WAGR, liên hệ HLV các trường đại học, học bổng golf.',
   'Thi đấu giải có điểm WAGR, video kỹ năng, hoàn thiện checklist hồ sơ học bổng.', '{"super_saving":30,"saving":24,"balanced":18,"fast":12}', 60)
on conflict (code) do nothing;

insert into public.training_finance_plans (code, name_vi, name_en, summary_vi, tradeoff_vi, items, sort_order) values
  ('super_saving', 'Siêu tiết kiệm', 'Lowest cost',
   'Mua một lần lồng lưới, thảm và 1–2 cây gậy; các con tự tập ở nhà theo bài tập, thử thách trong app, có AI hỗ trợ xem cú đánh. Thỉnh thoảng đi kiểm tra với HLV hoặc đánh giải để có kết quả được xác nhận.',
   'Gần như không tốn tiền hằng tháng. Đổi lại các con phải rất tự giác, bố mẹ đồng hành nhiều; ít được HLV sửa trực tiếp nên thời gian lâu hơn.',
   '[{"item":"net_cage","qty":1,"per":"once","phase":"snag"},{"item":"mat","qty":1,"per":"once","phase":"snag"},{"item":"club_single","qty":1,"per":"once","phase":"snag"},
     {"item":"home","qty":20,"per":"month","phase":"all"},
     {"item":"snag_group","qty":4,"per":"year","phase":"snag"},{"item":"fee_snag","qty":2,"per":"year","phase":"snag"},
     {"item":"club_single","qty":1,"per":"once","phase":"iron9"},{"item":"pga_group","qty":4,"per":"year","phase":"iron9"},{"item":"range","qty":1,"per":"month","phase":"iron9"},{"item":"fee_9","qty":2,"per":"year","phase":"iron9"},
     {"item":"clubs_basic","qty":1,"per":"once","phase":"iron18"},{"item":"pga_group","qty":4,"per":"year","phase":"iron18"},{"item":"range","qty":2,"per":"month","phase":"iron18"},{"item":"fee_18","qty":2,"per":"year","phase":"iron18"}]', 5),
  ('saving', 'Tiết kiệm', 'Affordable',
   'Lớp nhóm, tự tập ở nhà theo app mỗi ngày, ít giải.',
   'Chi phí thấp. Các con cần tự giác tập ở nhà nhiều, bố mẹ đồng hành; thời gian lâu hơn.',
   '[{"item":"snag_group","qty":4,"per":"month","phase":"snag"},{"item":"home","qty":12,"per":"month","phase":"all"},{"item":"fee_snag","qty":6,"per":"year","phase":"snag"},
     {"item":"pga_group","qty":4,"per":"month","phase":"iron9"},{"item":"range","qty":4,"per":"month","phase":"iron9"},{"item":"fee_9","qty":4,"per":"year","phase":"iron9"},
     {"item":"pga_group","qty":4,"per":"month","phase":"iron18"},{"item":"range","qty":8,"per":"month","phase":"iron18"},{"item":"fee_18","qty":4,"per":"year","phase":"iron18"},
     {"item":"clubs_basic","qty":1,"per":"once","phase":"iron9"}]', 10),
  ('balanced', 'Vừa phải', 'Balanced',
   'Lớp nhóm kèm vài buổi 1 kèm 1, sân tập và phòng 3D đều đặn, giải thường xuyên.',
   'Cân bằng chi phí và tốc độ. Vẫn cần tự tập ở nhà để giữ nhịp.',
   '[{"item":"snag_group","qty":8,"per":"month","phase":"snag"},{"item":"snag_1on1","qty":2,"per":"month","phase":"snag"},{"item":"room3d","qty":2,"per":"month","phase":"snag"},{"item":"home","qty":8,"per":"month","phase":"all"},{"item":"fee_snag","qty":8,"per":"year","phase":"snag"},
     {"item":"pga_group","qty":4,"per":"month","phase":"iron9"},{"item":"pga_1on1","qty":2,"per":"month","phase":"iron9"},{"item":"range","qty":8,"per":"month","phase":"iron9"},{"item":"room3d","qty":2,"per":"month","phase":"iron9"},{"item":"fee_9","qty":6,"per":"year","phase":"iron9"},
     {"item":"pga_group","qty":4,"per":"month","phase":"iron18"},{"item":"pga_1on1","qty":4,"per":"month","phase":"iron18"},{"item":"range","qty":8,"per":"month","phase":"iron18"},{"item":"room3d","qty":2,"per":"month","phase":"iron18"},{"item":"fee_18","qty":6,"per":"year","phase":"iron18"},
     {"item":"clubs_basic","qty":1,"per":"once","phase":"iron9"}]', 20),
  ('fast', 'Nhanh nhất', 'Fastest',
   'Học 1 kèm 1 với HLV giỏi, tập nhiều ở sân tập và phòng 3D, thi đấu dày.',
   'Rút ngắn thời gian nhiều nhất nhưng chi phí cao nhất. Các con vẫn cần tự giác; tiền không thay được giờ tập.',
   '[{"item":"snag_1on1","qty":8,"per":"month","phase":"snag"},{"item":"room3d","qty":4,"per":"month","phase":"snag"},{"item":"home","qty":8,"per":"month","phase":"all"},{"item":"fee_snag","qty":10,"per":"year","phase":"snag"},
     {"item":"pga_1on1","qty":8,"per":"month","phase":"iron9"},{"item":"range","qty":12,"per":"month","phase":"iron9"},{"item":"room3d","qty":4,"per":"month","phase":"iron9"},{"item":"fee_9","qty":10,"per":"year","phase":"iron9"},
     {"item":"pga_1on1","qty":8,"per":"month","phase":"iron18"},{"item":"range","qty":16,"per":"month","phase":"iron18"},{"item":"room3d","qty":4,"per":"month","phase":"iron18"},{"item":"fee_18","qty":10,"per":"year","phase":"iron18"},
     {"item":"clubs_basic","qty":1,"per":"once","phase":"iron9"}]', 30)
on conflict (code) do nothing;

insert into public.training_needs (code, title_vi, title_en, advice_vi, goal_step, sort_order) values
  ('health',      'Sức khoẻ, vận động',               'Health and activity',
   'Golf cho các con vận động ngoài trời đều đặn. Chỉ cần đi lớp đều và tự tập ở nhà theo app; chưa cần chi phí lớn.', 's2', 10),
  ('character',   'Tính cách, kỷ luật, phép lịch sự', 'Character and discipline',
   'Golf rèn tính trung thực (tự đếm gậy), kiên nhẫn và phép lịch sự. Các thẻ level 1–9 có phần văn hoá golf; giải SNAG là nơi các con thực hành.', 's2', 20),
  ('social',      'Kết bạn, gắn kết gia đình',        'Friends and family time',
   'Các giải SNAG Golf League hằng tháng là dịp gặp bạn và cả nhà cùng đi. Bố mẹ có thể chơi cùng các con.', 's2', 30),
  ('compete',     'Thi đấu',                          'Competition',
   'Đi từng bước: giải SNAG → giải 6–9 hố → giải 18 hố. Mỗi bước có mục tiêu level và chỉ số handicap riêng.', 's4', 40),
  ('scholarship', 'Học bổng, du học',                 'Scholarships and study abroad',
   'Golf là lợi thế cho hồ sơ năng lực khi vào cấp 3 và đại học danh giá. Đi từng bước nhỏ, song song với checklist hồ sơ học bổng theo lớp của các con.', 's6', 50),
  ('career',      'Nghề nghiệp trong ngành golf',     'Careers in golf',
   'HLV, trọng tài, quản lý sân, tổ chức giải… Nền tảng là chơi tốt và hiểu luật; các khoá nghề mở từ tuổi 16.', 's4', 60)
on conflict (code) do nothing;
