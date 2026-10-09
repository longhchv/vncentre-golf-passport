-- Module Nhân sự sự kiện (spec 11, bản đồ dữ liệu 11-mapping.md) · bước 2: bảng mẫu + phân công + việc của người.
-- Chỉ thêm: không xoá, không đổi tên bảng/cột cũ. Seed từ docs/spec/data/*.csv (20 ô vai, 70 việc mẫu, 26 vật dụng).

-- Hạng sổ "Thẻ nhân sự" (11-mapping mục 3.2): không tính vào "một sổ hiệu lực", không gắn level, hiệu lực 12 tháng
insert into public.passport_tiers (code, name_vi, name_en, level_from, level_to, validity_months, counts_toward_single_active)
values ('staff', 'Thẻ nhân sự', 'Staff card', null, null, 12, false)
on conflict (code) do nothing;

-- Ô vai (mẫu dùng lại nhiều sự kiện): vai A…K, ô A, B, C1…C4, D1…D5, E1…E3, F1, F2, G1…G3, K1
create table public.event_crew_slots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  role_code text not null check (role_code ~ '^[A-Z]$'),
  role_name_vi text not null,
  role_name_en text,
  slot_code text not null check (slot_code ~ '^[A-Z][0-9]*$'),
  default_position text,
  badge_color text check (badge_color ~ '^#[0-9A-Fa-f]{6}$'),
  badge_label text,
  note text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slot_code)
);

-- Việc mẫu theo vai (giờ, khu vực là chữ: "16h00–17h45", "Liên tục", "Trong 48h")
create table public.event_crew_task_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  role_code text not null check (role_code ~ '^[A-Z]$'),
  sort_order int not null,
  phase_no int not null check (phase_no between 1 and 6),
  phase_label text not null,
  time_label text,
  area text,
  task_text text not null check (btrim(task_text) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, role_code, sort_order)
);

-- Thùng đồ mẫu (trạng thái đóng thùng / thu hồi theo sự kiện làm sau)
create table public.event_crew_supplies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  box text not null,
  item text not null,
  quantity int check (quantity >= 0),
  role_code text check (role_code ~ '^[A-Z]$'),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phân công: một người (hồ sơ students, mã VNC-… trọn đời) vào một ô của một sự kiện; passport_id là sổ in trên thẻ đeo
create table public.event_crew_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  event_id uuid not null references public.events(id),
  slot_id uuid not null references public.event_crew_slots(id),
  student_id uuid not null references public.students(id),
  passport_id uuid references public.passports(id),
  position text,
  badge_status text not null default 'not_printed' check (badge_status in ('not_printed', 'printed', 'received')),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, slot_id)
);
create index event_crew_assignments_student_idx on public.event_crew_assignments (student_id);
create index event_crew_assignments_passport_idx on public.event_crew_assignments (passport_id);

-- Việc của người: chép từ việc mẫu khi phân công (sửa giờ / thêm việc cho một sự kiện không đổi mẫu).
-- Vướng bắt buộc ghi lý do. status_by null = tích qua link /p/<mã> không đăng nhập (phương án a cho 10/10)
create table public.event_crew_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  assignment_id uuid not null references public.event_crew_assignments(id),
  template_id uuid references public.event_crew_task_templates(id),
  sort_order int not null default 0,
  phase_no int not null check (phase_no between 1 and 6),
  phase_label text not null,
  time_label text,
  area text,
  task_text text not null check (btrim(task_text) <> ''),
  status text not null default 'open' check (status in ('open', 'done', 'blocked')),
  note text,
  status_by uuid references public.profiles(user_id) on delete set null,
  status_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'blocked' or btrim(coalesce(note, '')) <> '')
);
create index event_crew_tasks_assignment_idx on public.event_crew_tasks (assignment_id);

-- updated_at + nhật ký + RLS mặc định từ chối: chỉ admin đọc/ghi thẳng; người làm việc đi qua hàm (bước 3–4)
do $$
declare t text;
begin
  foreach t in array array['event_crew_slots', 'event_crew_task_templates', 'event_crew_supplies', 'event_crew_assignments', 'event_crew_tasks'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Seed: data/vai_tro.csv (20 ô)
insert into public.event_crew_slots (role_code, role_name_vi, slot_code, default_position, badge_color, badge_label, note, sort_order) values
  ('A', 'Điều phối chung', 'A', null, '#1D3A8F', 'Ban tổ chức', 'Cầm timeline, phát lệnh, xử lý phát sinh', 1),
  ('B', 'Phổ biến an toàn và văn hóa golf', 'B', null, '#2E5BD8', 'Huấn luyện viên', 'Phổ biến cho người chơi trước khi vào trạm', 2),
  ('C', 'Huấn luyện viên tại các trạm', 'C1', 'Trạm Putting', '#0F7F6E', 'Huấn luyện viên', 'Mỗi trạm tích riêng một cột', 3),
  ('C', 'Huấn luyện viên tại các trạm', 'C2', 'Trạm Chipping', '#0F7F6E', 'Huấn luyện viên', 'Mỗi trạm tích riêng một cột', 4),
  ('C', 'Huấn luyện viên tại các trạm', 'C3', 'Trạm Pitching', '#0F7F6E', 'Huấn luyện viên', 'Mỗi trạm tích riêng một cột', 5),
  ('C', 'Huấn luyện viên tại các trạm', 'C4', 'Trạm Full swing', '#0F7F6E', 'Huấn luyện viên', 'Mỗi trạm tích riêng một cột', 6),
  ('D', 'Đại sứ truyền thông Golf', 'D1', null, '#F2B705', 'Đại sứ', 'Các con nghỉ uống nước khoảng 30 phút một lần', 7),
  ('D', 'Đại sứ truyền thông Golf', 'D2', null, '#F2B705', 'Đại sứ', 'Các con nghỉ uống nước khoảng 30 phút một lần', 8),
  ('D', 'Đại sứ truyền thông Golf', 'D3', null, '#F2B705', 'Đại sứ', 'Các con nghỉ uống nước khoảng 30 phút một lần', 9),
  ('D', 'Đại sứ truyền thông Golf', 'D4', null, '#F2B705', 'Đại sứ', 'Các con nghỉ uống nước khoảng 30 phút một lần', 10),
  ('D', 'Đại sứ truyền thông Golf', 'D5', null, '#F2B705', 'Đại sứ', 'Các con nghỉ uống nước khoảng 30 phút một lần', 11),
  ('E', 'Check-in (thầy cô)', 'E1', null, '#2E5BD8', 'Tình nguyện viên', 'Mỗi người tích riêng một cột', 12),
  ('E', 'Check-in (thầy cô)', 'E2', null, '#2E5BD8', 'Tình nguyện viên', 'Mỗi người tích riêng một cột', 13),
  ('E', 'Check-in (thầy cô)', 'E3', null, '#2E5BD8', 'Tình nguyện viên', 'Mỗi người tích riêng một cột', 14),
  ('F', 'Quầy đổi quà', 'F1', null, '#5B3E96', 'Ban tổ chức', 'F1 là admin nhập liệu', 15),
  ('F', 'Quầy đổi quà', 'F2', null, '#5B3E96', 'Ban tổ chức', 'F1 là admin nhập liệu', 16),
  ('G', 'Truyền thông Hiệp hội', 'G1', null, '#D9641C', 'Truyền thông', 'Ảnh cận mặt các bạn nhỏ thì xin phép phụ huynh', 17),
  ('G', 'Truyền thông Hiệp hội', 'G2', null, '#D9641C', 'Truyền thông', 'Ảnh cận mặt các bạn nhỏ thì xin phép phụ huynh', 18),
  ('G', 'Truyền thông Hiệp hội', 'G3', null, '#D9641C', 'Truyền thông', 'Ảnh cận mặt các bạn nhỏ thì xin phép phụ huynh', 19),
  ('K', 'Đón tiếp khách mời', 'K1', null, '#A61E2A', 'Ban tổ chức', null, 20)
on conflict (org_id, slot_code) do nothing;

-- Seed: data/nhiem_vu_mau.csv (70 việc)
insert into public.event_crew_task_templates (role_code, sort_order, phase_no, phase_label, time_label, area, task_text) values
  ('A', 1, 1, '1. Tối 9/10', '21h00', null, 'Chốt danh sách nhân sự, gửi link tab nhiệm vụ cho từng người'),
  ('A', 2, 1, '1. Tối 9/10', '21h00', 'App', 'Quét thử thẻ tích điểm trên app.vncentre.net: check-in, nhập điểm, hoàn thành, xác thực email'),
  ('A', 3, 1, '1. Tối 9/10', '21h30', 'Nhóm Zalo', 'Gửi toàn đội: giờ tập kết 14h30, trang phục, chỗ gửi xe, số điện thoại điều phối'),
  ('A', 4, 2, '2. Sáng 10/10', '10h00', null, 'Xác nhận với Cục TDTT: mặt bằng, điện 220V, bàn ghế, hàng rào'),
  ('A', 5, 2, '2. Sáng 10/10', '12h00', 'Kho', 'Kiểm đủ các thùng đồ theo tab Thùng đồ, giao xe chở'),
  ('A', 6, 3, '3. Setup 14h30–15h55', '14h30', 'Khu golf', 'Nhận bàn giao mặt bằng, chốt vị trí các trạm, check-in, quầy quà theo sơ đồ'),
  ('A', 7, 3, '3. Setup 14h30–15h55', '15h45', 'Khu golf', 'Họp toàn đội 10 phút: timeline, vị trí từng người, an toàn, cách chấm điểm'),
  ('A', 8, 3, '3. Setup 14h30–15h55', '15h55', 'Khu golf', 'Kiểm tra cuối: mọi vị trí sẵn sàng, mọi người đeo thẻ'),
  ('A', 9, 4, '4. Vận hành 16h00–17h55', '16h00', 'Các trạm', 'Phát lệnh mở cửa, điều phối cú đánh mở màn cùng Đại sứ'),
  ('A', 10, 4, '4. Vận hành 16h00–17h55', '16h00–17h45', 'Toàn khu', 'Đi vòng giữa các trạm, điều tiết hàng chờ, xử lý phát sinh'),
  ('A', 11, 4, '4. Vận hành 16h00–17h55', '17h45', 'Check-in', 'Phát lệnh ngừng phát thẻ'),
  ('A', 12, 5, '5. Kết thúc 17h55–18h30', '17h55', 'Khu golf', 'Phát lệnh ngừng đánh, tổ chức trao chứng nhận Đại sứ'),
  ('A', 13, 5, '5. Kết thúc 17h55–18h30', '18h00–18h30', 'Toàn khu', 'Giám sát thu dọn, kiểm đếm, bàn giao mặt bằng'),
  ('A', 14, 6, '6. Sau sự kiện', '11/10', null, 'Tổng hợp số thẻ phát, số người hoàn thành, số quà đã trao'),
  ('A', 15, 6, '6. Sau sự kiện', '11/10', null, 'Họp rút kinh nghiệm, điền tab Rút kinh nghiệm'),
  ('B', 1, 1, '1. Tối 9/10', 'Tối', null, 'Chuẩn bị lời phổ biến khoảng 2 phút: an toàn, chờ lượt, cách tích điểm, ứng xử đẹp cũng được tính điểm'),
  ('B', 2, 3, '3. Setup 14h30–15h55', '14h30', 'Lối vào', 'Dựng khu phổ biến, căng dây cảnh báo, đặt vòng an toàn'),
  ('B', 3, 3, '3. Setup 14h30–15h55', '15h45', 'Khu golf', 'Dự họp toàn đội'),
  ('B', 4, 4, '4. Vận hành 16h00–17h55', '16h00–17h45', 'Khu phổ biến', 'Phổ biến cho từng nhóm trước khi vào trạm'),
  ('B', 5, 4, '4. Vận hành 16h00–17h55', 'Liên tục', 'Toàn khu', 'Nhắc khoảng cách an toàn, không vung gậy khi có người đứng gần'),
  ('B', 6, 5, '5. Kết thúc 17h55–18h30', '18h00', 'Lối vào', 'Thu dây cảnh báo, vòng an toàn về thùng'),
  ('C', 1, 1, '1. Tối 9/10', 'Tối', null, 'Xem lại cách chấm: dấu 10 điểm, dấu 5 điểm; qua trạm khi có ít nhất 1 dấu 5 điểm'),
  ('C', 2, 2, '2. Sáng 10/10', 'Trước 14h', null, 'Chuẩn bị đồng phục CGI, giày, mũ, nước uống'),
  ('C', 3, 3, '3. Setup 14h30–15h55', '14h30', 'Trạm', 'Nhận dụng cụ trạm từ thùng Thi đấu, dựng trạm theo sơ đồ'),
  ('C', 4, 3, '3. Setup 14h30–15h55', '15h30', 'Trạm', 'Đánh thử, kiểm tra mục tiêu và khoảng cách an toàn'),
  ('C', 5, 3, '3. Setup 14h30–15h55', '15h45', 'Khu golf', 'Dự họp toàn đội'),
  ('C', 6, 3, '3. Setup 14h30–15h55', '15h55', 'Trạm', 'Nhận dấu điểm, đứng đúng vị trí'),
  ('C', 7, 4, '4. Vận hành 16h00–17h55', '16h00', 'Trạm', 'Cùng Đại sứ thực hiện cú đánh mở màn'),
  ('C', 8, 4, '4. Vận hành 16h00–17h55', '16h00–17h55', 'Trạm', 'Hướng dẫn kỹ thuật, cho đánh, đóng dấu điểm cả kỹ thuật lẫn ứng xử'),
  ('C', 9, 4, '4. Vận hành 16h00–17h55', 'Liên tục', 'Trạm', 'Giữ hàng chờ trật tự, an toàn; báo A khi quá đông'),
  ('C', 10, 5, '5. Kết thúc 17h55–18h30', '17h55', 'Trạm', 'Ngừng đánh, thu bóng'),
  ('C', 11, 5, '5. Kết thúc 17h55–18h30', '18h00', 'Trạm', 'Thu dọn, đếm dụng cụ, trả về thùng Thi đấu'),
  ('C', 12, 6, '6. Sau sự kiện', 'Trong 48h', null, 'Đăng bài theo bộ kit truyền thông nếu muốn'),
  ('D', 1, 1, '1. Tối 9/10', 'Tối', null, 'Chuẩn bị đồng phục, mũ, giày golf; đăng bài theo lịch bộ kit'),
  ('D', 2, 3, '3. Setup 14h30–15h55', '15h30', 'Khu golf', 'Có mặt, gặp người chăm sóc Đại sứ'),
  ('D', 3, 3, '3. Setup 14h30–15h55', '15h45', 'Khu golf', 'Dự họp toàn đội'),
  ('D', 4, 4, '4. Vận hành 16h00–17h55', '16h00', 'Trạm', 'Thực hiện cú đánh mở màn'),
  ('D', 5, 4, '4. Vận hành 16h00–17h55', '16h00–17h45', 'Các trạm', 'Đánh mẫu, cùng HLV chấm điểm, hướng dẫn các bạn nhỏ'),
  ('D', 6, 4, '4. Vận hành 16h00–17h55', '17h00–17h45', 'Quầy quà', 'Trao quà cho các bạn hoàn thành'),
  ('D', 7, 5, '5. Kết thúc 17h55–18h30', '17h55', 'Khu golf', 'Nhận chứng nhận Đại sứ, chụp ảnh tập thể'),
  ('D', 8, 6, '6. Sau sự kiện', 'Trong 48h', null, 'Đăng bài 4 và 5 theo bộ kit'),
  ('E', 1, 1, '1. Tối 9/10', 'Tối', 'App', 'Mở app trên điện thoại, đăng nhập tài khoản check-in, sạc đầy pin'),
  ('E', 2, 3, '3. Setup 14h30–15h55', '15h00', 'Bàn check-in', 'Nhận thẻ tích điểm, bút, sạc dự phòng; bày bàn'),
  ('E', 3, 3, '3. Setup 14h30–15h55', '15h30', 'Bàn check-in', 'Check-in thử 2 thẻ'),
  ('E', 4, 3, '3. Setup 14h30–15h55', '15h45', 'Khu golf', 'Dự họp toàn đội'),
  ('E', 5, 4, '4. Vận hành 16h00–17h55', '16h00–17h45', 'Bàn check-in', 'Quét QR thẻ, ghi họ tên và số điện thoại (dưới 30 giây), phát thẻ, chỉ đường tới khu phổ biến'),
  ('E', 6, 4, '4. Vận hành 16h00–17h55', 'Liên tục', 'Bàn check-in', 'Đăng ký hộ người không dùng điện thoại'),
  ('E', 7, 4, '4. Vận hành 16h00–17h55', '17h45', 'Bàn check-in', 'Ngừng phát thẻ, đếm thẻ còn lại, báo A'),
  ('E', 8, 5, '5. Kết thúc 17h55–18h30', '18h00', 'Bàn check-in', 'Thu dọn bàn, trả thẻ thừa vào thùng Check-in'),
  ('F', 1, 1, '1. Tối 9/10', 'Tối', 'App', 'Đăng nhập app quyền quầy quà; kiểm số lượng quà; chuẩn bị dấu ĐÃ ĐỔI QUÀ'),
  ('F', 2, 3, '3. Setup 14h30–15h55', '15h00', 'Quầy quà', 'Bày quà, treo biển Đổi quà'),
  ('F', 3, 3, '3. Setup 14h30–15h55', '15h45', 'Khu golf', 'Dự họp toàn đội'),
  ('F', 4, 4, '4. Vận hành 16h00–17h55', '16h15–17h55', 'Quầy quà', 'Quét thẻ, nhập điểm các trạm, bấm Hoàn thành, phát quà, đóng dấu ĐÃ ĐỔI QUÀ'),
  ('F', 5, 4, '4. Vận hành 16h00–17h55', '30 phút một lần', 'Quầy quà', 'Báo A số quà còn lại'),
  ('F', 6, 4, '4. Vận hành 16h00–17h55', 'Khi hết quà', 'Quầy quà', 'Treo thông báo hết quà; vẫn xác nhận hoàn thành để người chơi nhận chứng nhận số'),
  ('F', 7, 5, '5. Kết thúc 17h55–18h30', '18h00', 'Quầy quà', 'Kiểm kê quà còn lại, thu dấu, xuất danh sách hoàn thành'),
  ('F', 8, 6, '6. Sau sự kiện', 'Trong 7 ngày', 'App', 'Duyệt ảnh thẻ điểm người chơi tự gửi'),
  ('G', 1, 1, '1. Tối 9/10', 'Tối', null, 'Sạc pin máy ảnh, format thẻ nhớ, chuẩn bị điện thoại livestream'),
  ('G', 2, 1, '1. Tối 9/10', 'Tối', 'Fanpage', 'Lên lịch bài ngày 10/10 theo lịch truyền thông'),
  ('G', 3, 3, '3. Setup 14h30–15h55', '15h00', 'Khu golf', 'Chụp không khí setup, hậu trường'),
  ('G', 4, 4, '4. Vận hành 16h00–17h55', '16h00', 'Các trạm', 'Chụp và quay cú đánh mở màn'),
  ('G', 5, 4, '4. Vận hành 16h00–17h55', '16h00–17h55', 'Toàn khu', 'Livestream hoặc đăng story; chụp các trạm và khoảnh khắc người chơi'),
  ('G', 6, 5, '5. Kết thúc 17h55–18h30', '17h55', 'Khu golf', 'Chụp trao chứng nhận Đại sứ, ảnh tập thể toàn đội'),
  ('G', 7, 6, '6. Sau sự kiện', 'Trong 24h', 'Drive', 'Đổ ảnh vào thư mục chung đặt tên theo ngày; chọn ảnh gửi Đại sứ và khách mời'),
  ('G', 8, 6, '6. Sau sự kiện', 'Trong 24h', 'Fanpage', 'Đăng album và bài tổng kết'),
  ('K', 1, 1, '1. Tối 9/10', 'Tối', 'Zalo', 'Chốt danh sách khách mời, gửi thư mời, điền giờ đón'),
  ('K', 2, 3, '3. Setup 14h30–15h55', 'Trước giờ đón', 'Lối vào', 'Chuẩn bị thẻ đeo khách mời, nước uống'),
  ('K', 3, 4, '4. Vận hành 16h00–17h55', 'Theo giờ đón', 'Khu golf', 'Đón khách, giới thiệu khu golf, mời trải nghiệm cú đánh, giao lưu Đại sứ'),
  ('K', 4, 4, '4. Vận hành 16h00–17h55', 'Khi khách đến', 'Khu golf', 'Báo G chụp ảnh khách mời'),
  ('K', 5, 6, '6. Sau sự kiện', 'Trong 24h', 'Zalo', 'Gửi ảnh và lời cảm ơn khách mời')
on conflict (org_id, role_code, sort_order) do nothing;

-- Seed: data/thung_do.csv (26 vật dụng)
insert into public.event_crew_supplies (box, item, quantity, role_code, sort_order) values
  ('THI ĐẤU', 'Bộ lưới', 2, 'C', 1),
  ('THI ĐẤU', 'Gậy Putt', 4, 'C', 2),
  ('THI ĐẤU', 'Gậy Launcher', 12, 'C', 3),
  ('THI ĐẤU', 'Launch pad', 6, 'C', 4),
  ('THI ĐẤU', 'Vòng an toàn', 8, 'B', 5),
  ('THI ĐẤU', 'Rollerama', 2, 'C', 6),
  ('THI ĐẤU', 'Flagsticky', 2, 'C', 7),
  ('THI ĐẤU', 'Bull-eye', 4, 'C', 8),
  ('THI ĐẤU', 'Bóng', null, 'C', 9),
  ('AN TOÀN', 'Dây cảnh báo (mét)', 150, 'B', 10),
  ('AN TOÀN', 'Bộ sơ cứu', null, 'A', 11),
  ('AN TOÀN', 'Nước uống cho đội', null, 'A', 12),
  ('CHECK-IN', 'Thẻ tích điểm đã dán QR', 500, 'E', 13),
  ('CHECK-IN', 'Bút', null, 'E', 14),
  ('CHECK-IN', 'Sạc dự phòng', null, 'E', 15),
  ('CHECK-IN', 'Standee mã QR', null, 'E', 16),
  ('CHẤM ĐIỂM', 'Dấu 10 điểm', null, 'C', 17),
  ('CHẤM ĐIỂM', 'Dấu 5 điểm', null, 'C', 18),
  ('CHẤM ĐIỂM', 'Mực dấu', null, 'C', 19),
  ('QUÀ', 'Form 3D', null, 'F', 20),
  ('QUÀ', 'Móc khóa', null, 'F', 21),
  ('QUÀ', 'Thẻ treo quà', null, 'F', 22),
  ('QUÀ', 'Dấu ĐÃ ĐỔI QUÀ', null, 'F', 23),
  ('NHÂN SỰ', 'Thẻ đeo nhân sự và khách mời', null, 'A', 24),
  ('TRUYỀN THÔNG', 'Máy ảnh, pin, thẻ nhớ', null, 'G', 25),
  ('TRUYỀN THÔNG', 'Điện thoại livestream, chân đế', null, 'G', 26);
