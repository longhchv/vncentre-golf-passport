-- Spec 22 · bước 2: Lộ trình học bổng v2 — danh mục 78 mục nhiều hướng, chuyển 17 mục cũ, bảng hướng đi của học viên.
-- Mapping: docs/spec/22-mapping.md (anh Long duyệt 09/11/2026, Q1–Q7 theo đề xuất).
--   · Q2-A: mục tự động = "tự động HOẶC tay": done nếu nguồn tự động có, không thì lấy trạng thái đã lưu;
--           phụ huynh ghi được cả mục tự động (C4 gộp P2 tự động + P4 tay — tiêu chí 1).
--   · Q4: thêm start_note_en, has_deadline (seed đặt theo chữ trong start_note_vi, admin sửa được).
--   · Q5: học viên có ít nhất một dòng trạng thái đã lưu → tự gán hướng 'us'.
--   · Q7: bỏ chọn hướng = removed_at, không xoá dòng; hướng đi theo khi gộp học viên.
-- Migration chỉ thêm: cột, bảng, hàm, trigger mới; hai CHECK chỉ nới thêm giá trị. Không xoá / đổi tên bảng, cột, dòng nào.
-- Lớp hiện tại dạng số, lịch sử lớp, tự lên lớp 05/9: bước 3–4 (migration sau).

-------------------------------------------------------------------------------
-- 1. Danh mục: cột mới, nới CHECK, stage tự suy từ start_grade
-------------------------------------------------------------------------------
alter table public.scholarship_checklist_items
  add column if not exists code text check (code is null or btrim(code) <> ''),
  add column if not exists track text not null default 'common'
    check (track in ('common', 'us', 'uk', 'au', 'asia', 'vn', 'hs', 'career')),
  add column if not exists start_grade smallint check (start_grade between 1 and 13),
  add column if not exists start_note_vi text,
  add column if not exists start_note_en text,
  add column if not exists has_deadline boolean not null default false,
  add column if not exists source_ref text,
  add column if not exists is_verified boolean not null default true;
alter table public.scholarship_checklist_items add constraint scholarship_checklist_items_code_key unique (code);

alter table public.scholarship_checklist_items drop constraint scholarship_checklist_items_stage_check;
alter table public.scholarship_checklist_items add constraint scholarship_checklist_items_stage_check
  check (stage in ('primary', 'lower_secondary', 'upper_secondary', 'post_graduation'));
alter table public.scholarship_checklist_items drop constraint scholarship_checklist_items_item_group_check;
alter table public.scholarship_checklist_items add constraint scholarship_checklist_items_item_group_check
  check (item_group in ('golf', 'academic', 'personal', 'admission'));

-- 1–5 tiểu học · 6–9 THCS · 10–12 THPT · 13 sau tốt nghiệp. Có start_grade thì stage luôn theo start_grade.
create or replace function public.scholarship_stage_of(p_grade int)
returns text language sql immutable as $$
  select case when p_grade is null then null when p_grade <= 5 then 'primary' when p_grade <= 9 then 'lower_secondary'
              when p_grade <= 12 then 'upper_secondary' else 'post_graduation' end
$$;
create or replace function public.scholarship_item_set_stage()
returns trigger language plpgsql as $$
begin
  if new.start_grade is not null then new.stage := public.scholarship_stage_of(new.start_grade); end if;
  return new;
end $$;
create trigger scholarship_item_set_stage before insert or update on public.scholarship_checklist_items
  for each row execute function public.scholarship_item_set_stage();

-------------------------------------------------------------------------------
-- 2. Hướng đi của học viên (chọn nhiều). Không ai ghi thẳng; admin đọc. Hàm chọn hướng: bước 3.
-------------------------------------------------------------------------------
create table public.student_scholarship_tracks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_org_id() references public.organizations(id),
  student_id uuid not null references public.students(id),
  track text not null check (track in ('us', 'uk', 'au', 'asia', 'vn', 'hs', 'career')),
  chosen_at timestamptz not null default now(),
  chosen_by uuid references public.profiles(user_id) on delete set null,  -- null = hệ thống (tự gán khi nâng cấp)
  removed_at timestamptz,                                                  -- bỏ chọn: đánh dấu, không xoá
  merge_trail uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, track)
);
create trigger set_updated_at before update on public.student_scholarship_tracks for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.student_scholarship_tracks for each row execute function public.audit_row();
alter table public.student_scholarship_tracks enable row level security;
create policy admin_read on public.student_scholarship_tracks for select to authenticated using (public.is_admin());
revoke all on public.student_scholarship_tracks from anon;

-- Gộp học viên: như scholarship_follow_student_merge — hướng chỉ hồ sơ bị gộp có thì chuyển sang, hoàn tác thì trả về.
create or replace function public.scholarship_tracks_follow_student_merge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.merged_into_student_id is null and new.merged_into_student_id is not null then
    update public.student_scholarship_tracks s
    set student_id = new.merged_into_student_id, merge_trail = s.merge_trail || old.id
    where s.student_id = old.id
      and not exists (select 1 from public.student_scholarship_tracks k
                      where k.student_id = new.merged_into_student_id and k.track = s.track);
  elsif old.merged_into_student_id is not null and new.merged_into_student_id is null then
    update public.student_scholarship_tracks
    set student_id = old.id, merge_trail = merge_trail[1:cardinality(merge_trail) - 1]
    where merge_trail[cardinality(merge_trail)] = old.id;
  end if;
  return null;
end $$;
create trigger scholarship_tracks_follow_student_merge after update of merged_into_student_id on public.students
  for each row execute function public.scholarship_tracks_follow_student_merge();
revoke execute on function public.scholarship_tracks_follow_student_merge() from public, anon, authenticated;

-------------------------------------------------------------------------------
-- 3. Nâng cấp dữ liệu: 17 mục cũ → v2, nạp 63 mục mới (docs/spec/data/scholarship-checklist-v2.csv), gán hướng 'us'.
-- Chạy một lần (đã có mã C1 thì bỏ qua). Thiếu dòng cũ nào (tiêu đề đã bị sửa) → dừng cả migration, không làm dở.
-------------------------------------------------------------------------------
do $$
declare
  m record; v_id uuid; v_keep uuid; v_drop uuid;
  v_missing text[] := '{}';
  v_moved int := 0; v_merged int := 0; v_new int; v_tracks int;
begin
  if exists (select 1 from public.scholarship_checklist_items where code = 'C1') then return; end if;

  create temp table v2_items (code text, track text, item_group text, start_grade int, start_note_vi text, has_deadline boolean,
                              title_vi text, title_en text, auto_source text, source_ref text, is_verified boolean, sort_order int)
    on commit drop;
  insert into v2_items values
  ('C1', 'common', 'personal', 5, 'Lớp 5–6, xem lại mỗi năm', false, 'Gia đình chọn hướng đi', 'Family chooses target pathways', null, 'Mới', true, 1),
  ('C2', 'common', 'academic', 6, 'Lớp 6–8', false, 'Chốt chương trình THPT: Việt Nam, quốc tế hay THPT Mỹ trực tuyến', 'Choose high-school programme: Vietnamese, international or US online', null, 'NCAA', true, 2),
  ('C3', 'common', 'golf', 1, null, false, 'Lộ trình chương trình golf đã học, level', 'Golf programmes completed and level', 'courses', 'App P1', true, 3),
  ('C4', 'common', 'golf', 1, 'Từ giải đầu tiên', false, 'Nhật ký thi đấu đầy đủ (giải VN Centre và giải ngoài)', 'Complete competition log (VN Centre and external events)', 'competitions', 'App P2, P4 · NCAA B1', true, 4),
  ('C5', 'common', 'golf', 1, null, false, 'Giải văn hoá – tinh thần', 'Spirit and etiquette awards', 'culture_awards', 'App P3', true, 5),
  ('C6', 'common', 'personal', 1, null, false, 'Hiểu luật golf, tự chấm điểm trung thực', 'Knows the Rules of Golf and scores honestly', null, 'Mới', true, 6),
  ('C7', 'common', 'golf', 6, null, false, 'Handicap chính thức (WHS)', 'Official handicap (WHS)', null, 'App P8', true, 7),
  ('C8', 'common', 'golf', 9, null, false, 'Điểm trung bình mỗi vòng đấu có xác minh', 'Verified scoring average', null, 'NCAA C2', true, 8),
  ('C9', 'common', 'golf', 6, '6 tháng/lần; bản chuẩn tuyển sinh xong trước 15/6 sau lớp 10', true, 'Video swing định kỳ', 'Regular swing videos', null, 'App P9 · NCAA C3, C4', true, 9),
  ('C10', 'common', 'golf', 10, 'Xong trước 15/6 sau lớp 10', true, 'Golf resume 1 trang', 'One-page golf resume', null, 'App P16 · NCAA C5', true, 10),
  ('C11', 'common', 'academic', 1, 'NCAA tính từ lớp 9', false, 'Học bạ từng năm, bản gốc', 'School reports for each year (originals)', null, 'App P5 · NCAA A5', true, 11),
  ('C12', 'common', 'academic', 9, 'Dịch xong trước hết lớp 10', true, 'Bản dịch học bạ tiếng Anh có công chứng', 'Certified English translation of school reports', null, 'App P12 · NCAA A6', true, 12),
  ('C13', 'common', 'academic', 3, 'Đạt mức yêu cầu trước hè lớp 11', true, 'Chứng chỉ tiếng Anh theo cấp (Cambridge → IELTS / TOEFL)', 'English certificates by stage (Cambridge → IELTS / TOEFL)', null, 'App P6, P11 · NCAA D2', true, 13),
  ('C14', 'common', 'personal', 1, null, false, 'Ngoại khoá, thiện nguyện, vai trò lãnh đạo', 'Extracurricular, volunteer and leadership roles', null, 'App P7 · Mới', true, 14),
  ('C15', 'common', 'personal', 10, 'Viết xong trong hè trước lớp 12', true, 'Câu chuyện cá nhân, bài luận', 'Personal story and essays', null, 'NCAA D3 · Mới', true, 15),
  ('C16', 'common', 'personal', 11, null, false, 'Thư giới thiệu của HLV và giáo viên', 'Recommendation letters (coach, teacher)', null, 'App P15 · NCAA C8, D4', true, 16),
  ('C17', 'common', 'personal', 5, 'Khi chọn hướng', false, 'Kế hoạch chi phí theo mức thoải mái / vừa phải / tiết kiệm', 'Cost plan by budget level', null, 'Mới', true, 17),
  ('C18', 'common', 'personal', 6, null, false, 'Giữ mạng xã hội sạch, rà soát trước khi nộp hồ sơ', 'Keep social media clean; review before applying', null, 'NCAA F6', true, 18),
  ('US-Q1', 'us', 'personal', 1, 'Luôn luôn', false, 'Không để các con học chậm tuổi (đồng hồ 5 năm thi đấu)', 'Stay on an age-appropriate grade (5-year clock)', null, 'NCAA', true, 19),
  ('US-Q2', 'us', 'admission', 12, null, false, 'Không nhập học đại học nào khác trước, kể cả ở Việt Nam', 'Do not enrol at another university first', null, 'NCAA', true, 20),
  ('US-Q3', 'us', 'personal', 8, null, false, 'Chốt bậc nhắm: D1, D2, D3, NAIA, NJCAA', 'Choose target level: D1, D2, D3, NAIA, NJCAA', null, 'NCAA', true, 21),
  ('US-A1', 'us', 'admission', 9, 'Lớp 9: Profile Page miễn phí · Lớp 10: tài khoản chứng nhận', false, 'Tài khoản NCAA Eligibility Center và NCAA ID', 'NCAA Eligibility Center account and NCAA ID', null, 'App P14 · NCAA A1', true, 22),
  ('US-A2', 'us', 'academic', 9, 'Đầu lớp 9', true, 'Trường THPT có danh sách môn cốt lõi ở trạng thái Cleared', 'High school core-course list is Cleared', null, 'NCAA A2', true, 23),
  ('US-A3', 'us', 'academic', 9, 'Cập nhật mỗi học kỳ', false, 'Bảng theo dõi 16 môn cốt lõi', '16 core-course tracker', null, 'NCAA A3', true, 24),
  ('US-A4', 'us', 'academic', 11, 'Hạn: khai giảng lớp 12', true, 'Quy tắc 10/7 (D1)', '10/7 rule (D1)', null, 'NCAA A4', true, 25),
  ('US-A5', 'us', 'academic', 9, null, false, 'Điểm trung bình môn cốt lõi theo cách NCAA tính', 'Core GPA as NCAA calculates it', null, 'NCAA A10', true, 26),
  ('US-A6', 'us', 'academic', 10, 'Hết lớp 10', true, 'Nộp học bạ lần 1 (sau 4 học kỳ)', 'Transcript upload 1 (after 4 semesters)', null, 'NCAA A7', true, 27),
  ('US-A7', 'us', 'academic', 11, 'Hết lớp 11', true, 'Nộp học bạ lần 2 (sau 6 học kỳ)', 'Transcript upload 2 (after 6 semesters)', null, 'NCAA A8', true, 28),
  ('US-A8', 'us', 'academic', 13, 'Sau tốt nghiệp', false, 'Học bạ cuối cùng và bằng tốt nghiệp THPT', 'Final transcript and proof of graduation', null, 'NCAA A9', true, 29),
  ('US-B1', 'us', 'golf', 6, 'Sau mỗi giải có thưởng', false, 'Bảng kê tiền thưởng và chi phí đối ứng', 'Prize money and expense log', null, 'NCAA B2', true, 30),
  ('US-B2', 'us', 'golf', 6, null, false, 'Không ký với agent hay công ty quản lý', 'No agent or management agreements', null, 'NCAA B3', true, 31),
  ('US-B3', 'us', 'golf', 12, 'Từ 01/4 lớp 12', true, 'Chứng nhận tư cách nghiệp dư cuối cùng', 'Final amateurism certification', null, 'NCAA B4', true, 32),
  ('US-B4', 'us', 'golf', 13, 'Sau tốt nghiệp', false, 'Khai báo các giải đấu sau ngày tốt nghiệp', 'Report competition after graduation', null, 'NCAA B5', true, 33),
  ('US-C1', 'us', 'golf', 9, null, false, 'Thứ hạng Junior Golf Scoreboard', 'Junior Golf Scoreboard ranking', null, 'NCAA C1', true, 34),
  ('US-C2', 'us', 'golf', 10, null, false, 'Thứ hạng WAGR', 'WAGR ranking', null, 'App P10 · NCAA C6', true, 35),
  ('US-C3', 'us', 'golf', 10, null, false, 'Sao AJGA (Performance Stars)', 'AJGA Performance Stars', null, 'NCAA C7', true, 36),
  ('US-D1', 'us', 'academic', 11, 'Thi 2 lần', false, 'SAT / ACT (nếu trường yêu cầu)', 'SAT / ACT (if required)', null, 'App P13 · NCAA D1', true, 37),
  ('US-D2', 'us', 'admission', 12, 'Theo hạn từng trường', true, 'Đơn nộp và lệ phí', 'Applications and fees', null, 'NCAA D5', true, 38),
  ('US-D3', 'us', 'admission', 12, 'Sau thư mời', false, 'Hồ sơ chứng minh tài chính cho trường', 'Financial documents for the college', null, 'NCAA D6', true, 39),
  ('US-E1', 'us', 'admission', 10, null, false, 'Danh sách 20–30 trường mục tiêu', 'List of 20–30 target colleges', null, 'App P17 · NCAA E1', true, 40),
  ('US-E2', 'us', 'admission', 9, null, false, 'Recruiting questionnaire của từng trường', 'College recruiting questionnaires', null, 'NCAA E2', true, 41),
  ('US-E3', 'us', 'admission', 9, 'HLV D1, D2 liên lạc lại từ 15/6 sau lớp 10', true, 'Email giới thiệu gửi HLV', 'Introduction emails to coaches', null, 'NCAA E3', true, 42),
  ('US-E4', 'us', 'admission', 9, null, false, 'Lịch theo đuổi các trường có hệ thống', 'Systematic follow-up schedule', null, 'NCAA E4', true, 43),
  ('US-E5', 'us', 'admission', 10, 'Từ 15/6 sau lớp 10', true, 'Cung cấp NCAA ID cho các trường đang tuyển', 'Share NCAA ID with recruiting colleges', null, 'NCAA E5', true, 44),
  ('US-E6', 'us', 'admission', 11, 'D1: từ 01/8 trước lớp 11', true, 'Chuyến thăm trường', 'Campus visits', null, 'NCAA E6', true, 45),
  ('US-E7', 'us', 'admission', 12, 'Trường được gửi từ 01/8 lớp 12; ký từ thứ Tư tuần thứ hai của tháng 11', true, 'Văn bản đề nghị học bổng thể thao (written offer)', 'Written offer of athletics aid', null, 'NCAA E7', true, 46),
  ('US-F1', 'us', 'admission', 12, null, false, 'Thư mời nhập học', 'Letter of admission', null, 'NCAA F1', true, 47),
  ('US-F2', 'us', 'admission', 12, 'Sau thư mời', false, 'Form I-20', 'Form I-20', null, 'NCAA F2', true, 48),
  ('US-F3', 'us', 'admission', 12, 'Trước khi đặt lịch phỏng vấn', true, 'Phí SEVIS I-901', 'SEVIS I-901 fee', null, 'NCAA F3', true, 49),
  ('US-F4', 'us', 'admission', 12, null, false, 'Đơn DS-160', 'DS-160 form', null, 'NCAA F4', true, 50),
  ('US-F5', 'us', 'admission', 12, 'Sau khi có I-20', false, 'Lệ phí visa và lịch hẹn', 'Visa fee and appointment', null, 'NCAA F5', true, 51),
  ('US-F6', 'us', 'admission', 12, 'Trước phỏng vấn', true, 'Hồ sơ mang theo phỏng vấn', 'Documents for the visa interview', null, 'NCAA F7', true, 52),
  ('US-F7', 'us', 'admission', 13, 'Sau khi có visa', false, 'Kế hoạch nhập cảnh', 'Arrival plan', null, 'NCAA F8', true, 53),
  ('UK-1', 'uk', 'academic', 10, null, false, 'Chọn đường vào: A-level, IB hay học dự bị', 'Choose entry route: A-level, IB or foundation', null, 'Mới', true, 54),
  ('UK-2', 'uk', 'academic', 11, 'Xong trước hè lớp 11', true, 'IELTS đạt mức trường và visa yêu cầu', 'IELTS at the level required', null, 'Mới', true, 55),
  ('UK-3', 'uk', 'admission', 11, 'Mở tháng 5 cuối lớp 11; hạn 15/10 hoặc giữa tháng 1 lớp 12', true, 'Hồ sơ UCAS và personal statement', 'UCAS application and personal statement', null, 'Mới', true, 56),
  ('UK-4', 'uk', 'admission', 12, 'Ví dụ: ĐH Stirling có học bổng thể thao, golf là môn trọng điểm, mọi quốc tịch; nộp đơn riêng trước kỳ tháng 9', true, 'Đơn học bổng thể thao của trường', 'University sports scholarship application', null, 'Mới', true, 57),
  ('UK-5', 'uk', 'admission', 12, 'Sau thư mời', false, 'Visa du học Anh (cần CAS)', 'UK Student visa (CAS required)', null, 'Mới', false, 58),
  ('AU-1', 'au', 'academic', 10, null, false, 'Chọn đường vào: IB, chương trình tương đương hay học dự bị', 'Choose entry route: IB, equivalent or foundation', null, 'Mới', true, 59),
  ('AU-2', 'au', 'academic', 11, null, false, 'IELTS hoặc PTE đạt mức trường yêu cầu', 'IELTS or PTE at the level required', null, 'Mới', true, 60),
  ('AU-3', 'au', 'admission', 12, 'Mạng lưới trường hỗ trợ VĐV ưu tú của AIS chủ yếu dành cho VĐV được Úc công nhận; VĐV quốc tế hỏi từng trường', false, 'Hồ sơ chương trình hỗ trợ vận động viên ưu tú của trường', 'University elite athlete programme application', null, 'Mới', true, 61),
  ('AU-4', 'au', 'admission', 12, 'Sau thư mời', false, 'Visa du học Úc (cần CoE)', 'Australian student visa (CoE required)', null, 'Mới', false, 62),
  ('AS-1', 'asia', 'academic', 6, null, false, 'Ngoại ngữ nước đến (JLPT, TOPIK) hoặc tiếng Anh', 'Destination language (JLPT, TOPIK) or English', null, 'Mới', true, 63),
  ('AS-2', 'asia', 'admission', 11, null, false, 'Hồ sơ tuyển sinh diện thể thao của từng trường', 'Sports admission application per university', null, 'Mới', false, 64),
  ('AS-3', 'asia', 'admission', 12, 'GKS: tháng 9–10 lớp 12', true, 'Học bổng chính phủ (GKS, MEXT)', 'Government scholarships (GKS, MEXT)', null, 'Mới', false, 65),
  ('AS-4', 'asia', 'academic', 12, null, false, 'Kỳ thi đầu vào nếu có (ví dụ EJU)', 'Entrance exam where required (e.g. EJU)', null, 'Mới', false, 66),
  ('VN-1', 'vn', 'golf', 9, 'Giải chỉ tính trong 3–4 năm trước xét tuyển', false, 'Huy chương giải thể thao cấp quốc gia, giải trẻ quốc gia và quốc tế', 'Medals at national and international junior events', null, 'Mới', true, 67),
  ('VN-2', 'vn', 'admission', 11, null, false, 'Đối chiếu quy chế xét tuyển thẳng, ưu tiên thể thao năm tuyển sinh', 'Check direct-admission rules for athletes', null, 'Mới', true, 68),
  ('VN-3', 'vn', 'academic', 11, null, false, 'Chương trình liên kết quốc tế trong nước: IELTS và hồ sơ', 'Joint international programmes in Vietnam', null, 'Mới', true, 69),
  ('HS-1', 'hs', 'admission', 7, null, false, 'Danh sách trường nội trú có học viện golf', 'Boarding schools with golf academies', null, 'Mới', false, 70),
  ('HS-2', 'hs', 'academic', 8, null, false, 'Bài thi đầu vào và tiếng Anh theo từng trường', 'Entrance tests and English per school', null, 'Mới', false, 71),
  ('HS-3', 'hs', 'admission', 8, null, false, 'Phỏng vấn, video, thư HLV cho hồ sơ cấp 3', 'Interview, video and coach letter', null, 'Mới', false, 72),
  ('HS-4', 'hs', 'admission', 9, null, false, 'Visa du học cấp 3 và người giám hộ', 'Secondary-school visa and guardian', null, 'Mới', false, 73),
  ('CR-1', 'career', 'personal', 8, null, false, 'Tình nguyện tại các giải', 'Volunteering at events', null, 'Mới', true, 74),
  ('CR-2', 'career', 'golf', 10, null, false, 'Chứng chỉ trọng tài luật golf (R&A)', 'Rules officiating certificates (R&A)', null, 'Mới', false, 75),
  ('CR-3', 'career', 'golf', 11, null, false, 'Chứng chỉ HLV cộng đồng (CGI) và kinh nghiệm hỗ trợ dạy', 'Community Golf Instructor certificate', null, 'Mới', false, 76),
  ('CR-4', 'career', 'personal', 11, null, false, 'Thực tập tại sân golf', 'Golf course internship', null, 'Mới', true, 77),
  ('CR-5', 'career', 'admission', 11, null, false, 'Chương trình cao đẳng, đại học chuyên ngành golf', 'Golf-specific college programmes', null, 'Mới', false, 78)
;

  -- P1…P17 (dòng seed v1, tìm theo stage + tiêu đề gốc) → mã v2. P4, P11 là dòng sau của mục gộp.
  create temp table v2_map (p text, old_stage text, old_title text, code text, merge_into text) on commit drop;
  insert into v2_map values
    ('P1', 'primary', 'Lộ trình chương trình golf đã học, level', 'C3', null),
    ('P2', 'primary', 'Thành tích giải trong hệ thống VN Centre', 'C4', null),
    ('P3', 'primary', 'Giải văn hoá – tinh thần', 'C5', null),
    ('P4', 'primary', 'Thành tích giải ngoài (VGA Junior Tour…)', null, 'P2'),
    ('P5', 'primary', 'Học bạ / bảng điểm từng năm', 'C11', null),
    ('P6', 'primary', 'Chứng chỉ tiếng Anh (Cambridge…)', 'C13', null),
    ('P7', 'primary', 'Hoạt động ngoại khoá, thiện nguyện', 'C14', null),
    ('P8', 'lower_secondary', 'Handicap chính thức (WHS)', 'C7', null),
    ('P9', 'lower_secondary', 'Video swing định kỳ 6 tháng (link YouTube)', 'C9', null),
    ('P10', 'lower_secondary', 'Giải tính điểm WAGR', 'US-C2', null),
    ('P11', 'lower_secondary', 'Chứng chỉ IELTS / TOEFL', null, 'P6'),
    ('P12', 'upper_secondary', 'Bảng điểm dịch thuật công chứng từ lớp 9', 'C12', null),
    ('P13', 'upper_secondary', 'SAT / ACT (nếu trường yêu cầu)', 'US-D1', null),
    ('P14', 'upper_secondary', 'Đăng ký NCAA Eligibility Center', 'US-A1', null),
    ('P15', 'upper_secondary', 'Thư giới thiệu (HLV, giáo viên)', 'C16', null),
    ('P16', 'upper_secondary', 'Golf resume 1 trang', 'C10', null),
    ('P17', 'upper_secondary', 'Danh sách trường mục tiêu, liên hệ HLV đại học', 'US-E1', null);
  alter table v2_map add column item_id uuid;
  update v2_map mp set item_id = i.id
  from public.scholarship_checklist_items i where i.stage = mp.old_stage and i.title_vi = mp.old_title and i.code is null;
  select coalesce(array_agg(p order by p), '{}') into v_missing from v2_map where item_id is null;
  if cardinality(v_missing) > 0 then
    raise exception 'scholarship_v2: không tìm thấy mục cũ % (tiêu đề đã bị sửa?) — chỉnh lại trước khi chạy', v_missing;
  end if;

  -- 3.1 Mục gộp: trạng thái dòng sau (P4, P11) dồn vào dòng giữ (P2, P6) — lấy mức cao hơn, nối ghi chú. Dòng cũ để nguyên.
  for m in select d.item_id as drop_id, k.item_id as keep_id from v2_map d join v2_map k on k.p = d.merge_into loop
    insert into public.scholarship_checklist_status (org_id, student_id, item_id, status, note, updated_by, merge_trail)
    select d.org_id, d.student_id, m.keep_id, d.status, d.note, d.updated_by, d.merge_trail
    from public.scholarship_checklist_status d where d.item_id = m.drop_id
    on conflict (student_id, item_id) do update set
      status = case when 'done' in (scholarship_checklist_status.status, excluded.status) then 'done'
                    when 'in_progress' in (scholarship_checklist_status.status, excluded.status) then 'in_progress'
                    else 'not_started' end,
      note = left(nullif(concat_ws(' · ', scholarship_checklist_status.note, excluded.note), ''), 500);
    v_merged := v_merged + (select count(*) from public.scholarship_checklist_status where item_id = m.drop_id);
    update public.scholarship_checklist_items set is_active = false, track = 'us' where id = m.drop_id;
  end loop;

  -- 3.2 Mục thay 1–1 + dòng giữ của mục gộp: cập nhật tại chỗ, giữ id (trạng thái đi theo)
  update public.scholarship_checklist_items i set
    code = n.code, track = n.track, item_group = n.item_group, start_grade = n.start_grade,
    start_note_vi = n.start_note_vi, has_deadline = n.has_deadline, title_vi = n.title_vi, title_en = n.title_en,
    auto_source = n.auto_source, source_ref = n.source_ref, is_verified = n.is_verified, sort_order = n.sort_order,
    is_active = true
  from v2_map mp join v2_items n on n.code = mp.code
  where i.id = mp.item_id;
  get diagnostics v_moved = row_count;

  -- 3.3 Mục mới
  insert into public.scholarship_checklist_items (code, track, item_group, start_grade, start_note_vi, has_deadline,
                                                  title_vi, title_en, auto_source, source_ref, is_verified, sort_order, stage)
  select n.code, n.track, n.item_group, n.start_grade, n.start_note_vi, n.has_deadline,
         n.title_vi, n.title_en, n.auto_source, n.source_ref, n.is_verified, n.sort_order, public.scholarship_stage_of(n.start_grade)
  from v2_items n where not exists (select 1 from public.scholarship_checklist_items i where i.code = n.code);
  get diagnostics v_new = row_count;

  -- 3.4 Học viên đang có dữ liệu checklist → hướng 'us' (17 mục cũ là hướng Mỹ); phụ huynh đổi được ở bước 3
  insert into public.student_scholarship_tracks (student_id, track)
  select distinct s.student_id, 'us' from public.scholarship_checklist_status s
  join public.students st on st.id = s.student_id and st.deleted_at is null and st.merged_into_student_id is null
  on conflict (student_id, track) do nothing;
  get diagnostics v_tracks = row_count;

  insert into public.audit_logs (action, entity_type, after)
  values ('scholarship_v2_migrate', 'scholarship_checklist_items',
          jsonb_build_object('updated_in_place', v_moved, 'merged_status_rows', v_merged, 'new_items', v_new,
                             'deactivated', array['P4', 'P11'], 'students_assigned_us', v_tracks));
end $$;

-------------------------------------------------------------------------------
-- 4. Hàm đọc / ghi (giữ hình dạng JSON v1, chỉ thêm trường) — giao diện v1 vẫn chạy cho tới bước 3.
--   · Mục: mục chung + các hướng đang chọn; chưa chọn hướng nào → mục chung + hướng Mỹ (như v1).
--   · stages thêm 'post_graduation'. Không trả source_ref.
--   · Q2-A: mục tự động = done nếu nguồn tự động có, không thì trạng thái đã lưu.
-------------------------------------------------------------------------------
create or replace function public.scholarship_checklist(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
  v_courses boolean; v_comp boolean; v_culture boolean;
  v_tracks text[];
  v jsonb;
begin
  if not public.can_view_athlete_profile(p_student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_id := public.league_current_student(p_student_id);
  if not exists (select 1 from public.students where id = v_id and deleted_at is null) then return null; end if;

  v_courses := exists (select 1 from public.course_history h where h.student_id = v_id and h.status = 'approved' and h.deleted_at is null);
  v_comp := exists (select 1 from public.tournament_results r where r.student_id = v_id and r.participant_kind = 'student');
  v_culture := exists (select 1 from public.tournament_results r
                       join public.tournaments t on t.id = r.tournament_id
                       join public.tournament_point_rules pr on pr.series_id = t.series_id and pr.code = r.culture_award_code
                                                            and pr.kind = 'culture' and pr.counts_as_award
                       where r.student_id = v_id and r.participant_kind = 'student');
  select coalesce(array_agg(track order by track), '{}') into v_tracks
  from public.student_scholarship_tracks where student_id = v_id and removed_at is null;

  with it as (
    select i.*,
           case when i.auto_source is not null then 'auto' else 'guardian' end as source,
           case when case i.auto_source when 'courses' then v_courses when 'competitions' then v_comp
                                        when 'culture_awards' then v_culture else false end
                then 'done' else coalesce(st.status, 'not_started') end as cur_status,
           st.note as cur_note,
           st.updated_at as cur_updated_at
    from public.scholarship_checklist_items i
    left join public.scholarship_checklist_status st on st.item_id = i.id and st.student_id = v_id
    where i.is_active
      and (i.track = 'common' or i.track = any (case when cardinality(v_tracks) = 0 then array['us'] else v_tracks end))
  ),
  stages(stage, ord) as (values ('primary', 1), ('lower_secondary', 2), ('upper_secondary', 3), ('post_graduation', 4))
  select jsonb_agg(jsonb_build_object(
           'stage', sg.stage,
           'done_count', (select count(*) from it where it.stage = sg.stage and it.cur_status = 'done'),
           'total_count', (select count(*) from it where it.stage = sg.stage),
           'items', (select coalesce(jsonb_agg(jsonb_build_object(
                        'id', it.id, 'code', it.code, 'track', it.track, 'group', it.item_group,
                        'title_vi', it.title_vi, 'title_en', it.title_en, 'help_vi', it.help_vi, 'help_en', it.help_en,
                        'start_grade', it.start_grade, 'start_note_vi', it.start_note_vi, 'start_note_en', it.start_note_en,
                        'has_deadline', it.has_deadline, 'is_verified', it.is_verified,
                        'status', it.cur_status, 'source', it.source, 'note', it.cur_note, 'updated_at', it.cur_updated_at)
                      order by it.sort_order, it.title_vi), '[]')
                     from it where it.stage = sg.stage))
         order by sg.ord)
    into v
  from stages sg;

  return jsonb_build_object('student_id', v_id, 'stages', v, 'tracks', to_jsonb(v_tracks),
                            'can_edit', public.is_guardian_of(v_id, false));
end $$;

-- Q2-A: ghi được cả mục tự động (vd. C4 — giải ngoài hệ thống). Còn lại như v1.
create or replace function public.set_scholarship_item(p_student_id uuid, p_item_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := public.league_current_student(p_student_id);
  i public.scholarship_checklist_items;
  v_before public.scholarship_checklist_status;
  v_after public.scholarship_checklist_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not public.is_guardian_of(v_id, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into i from public.scholarship_checklist_items where id = p_item_id and is_active;
  if i.id is null then raise exception 'item_not_found' using errcode = 'P0002'; end if;
  if p_status is null or p_status not in ('not_started', 'in_progress', 'done') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then raise exception 'note_too_long' using errcode = '22023'; end if;

  select * into v_before from public.scholarship_checklist_status where student_id = v_id and item_id = i.id;
  insert into public.scholarship_checklist_status (student_id, item_id, status, note, updated_by)
  values (v_id, i.id, p_status, v_note, auth.uid())
  on conflict (student_id, item_id) do update
    set status = excluded.status, note = excluded.note, updated_by = excluded.updated_by
  returning * into v_after;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'scholarship_item_set', 'scholarship_checklist_status', v_after.id,
          case when v_before.id is null then null else jsonb_build_object('status', v_before.status, 'note', v_before.note) end,
          jsonb_build_object('student_id', v_id, 'item_id', i.id, 'status', v_after.status, 'note', v_after.note));

  return jsonb_build_object('item_id', i.id, 'status', v_after.status, 'note', v_after.note, 'updated_at', v_after.updated_at);
end $$;

revoke execute on function public.scholarship_item_set_stage() from public, anon, authenticated;
