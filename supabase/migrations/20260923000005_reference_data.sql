-- Bước 2 · Dữ liệu cấu hình mặc định (cần cho cả staging và production). Admin chỉnh được sau.
-- Nguồn: 00-tong-quan mục 6, 02 mục 8, phụ lục B (bản nháp), phụ lục C mục 4.

insert into public.organizations (name, legal_name)
values ('VN Centre', 'Công ty Cổ phần Phát triển và Đầu tư HCHV');

-------------------------------------------------------------------------------
-- Chương trình
-------------------------------------------------------------------------------
insert into public.programs (code, name_vi, name_en, description_vi, description_en, is_official_level_track) values
  ('core20', 'Lộ trình 20 level', '20-Level Pathway',
   '12 level trường học, 5 level nghề golf, 3 level thi đấu – quản lý golf. SNAG Golf ở các level đầu, chuyển sang gậy tiêu chuẩn từ Level 10.',
   '12 school levels, 5 golf-career levels and 3 competition and golf-management levels. SNAG Golf in the early levels, standard clubs from Level 10.',
   true),
  ('summer_camp', 'Trại hè (Summer Camp)', 'Summer Camp',
   'Chương trình độc lập. Mỗi hành trình 6 buổi = hoàn thành 1 level trại hè; không phải level chính thức trong 20 level.',
   'Standalone programme. Each 6-session journey completes one summer-camp level; not an official level of the 20-level pathway.',
   false);

-------------------------------------------------------------------------------
-- Giai đoạn Passport, cấp hộ chiếu
-- Màu: tài liệu ghi "Vàng, Cam, Đỏ" cho 5 giai đoạn → tạm phối 5 sắc độ (phụ lục D)
-- Tên giai đoạn 2: tạm dùng "Làm chủ kỹ thuật cơ bản với SNAG Golf" (phụ lục D, D14)
-------------------------------------------------------------------------------
insert into public.passport_stages (number, name_vi, name_en, color, level_from, level_to) values
  (1, 'Khơi dậy đam mê', 'Igniting the passion', '#F9C74F', 1, 4),
  (2, 'Làm chủ kỹ thuật cơ bản với SNAG Golf', 'Mastering the basics with SNAG Golf', '#F4A340', 5, 9),
  (3, 'Chuyển tiếp golf truyền thống', 'Transition to traditional golf', '#EE7B30', 10, 10),
  (4, 'Làm chủ short game', 'Mastering the short game', '#E0502B', 11, 12),
  (5, 'Nâng cao trình độ', 'Advancing performance', '#C0262D', 13, 20);

insert into public.passport_tiers (code, name_vi, name_en, level_from, level_to, validity_months) values
  ('first', 'First Golf Passport', 'First Golf Passport', 1, 10, 12),
  ('player', 'Player Passport', 'Player Passport', 11, 17, 12),
  ('elite', 'Elite Passport', 'Elite Passport', 18, 20, 12);

-------------------------------------------------------------------------------
-- 20 level core20. Tên riêng từng level chưa có → tạm "Level N" (phụ lục D). Handicap mục tiêu theo 00 mục 6.2.
-------------------------------------------------------------------------------
with grp(n_from, n_to, gvi, gen, svi, sen) as (values
  (1, 4, 'Basic SNAG – New Starter', 'Basic SNAG – New Starter',
   'Yêu thích golf, đạt 100% văn hoá golf.', 'Loves golf and meets 100% of golf etiquette.'),
  (5, 9, 'Advance SNAG – Master SNAG Golf', 'Advance SNAG – Master SNAG Golf',
   'Phong thái golfer, sẵn sàng chơi golf truyền thống.', 'Plays with a golfer''s manner, ready for traditional golf.'),
  (10, 12, 'Golf Intermediate Basic (HDC ≤ 26)', 'Golf Intermediate Basic (HDC ≤ 26)',
   'Handicap mục tiêu 38 / 30 / 25; Luật Level 1 trên 80%.', 'Target handicap 38 / 30 / 25; Rules Level 1 above 80%.'),
  (13, 17, 'Golf Intermediate Advance', 'Golf Intermediate Advance',
   'Handicap mục tiêu 20 / 18 / 16 / 15 / 12; SNAG Coach L1, US Kids L1, Luật L2.',
   'Target handicap 20 / 18 / 16 / 15 / 12; SNAG Coach L1, US Kids L1, Rules L2.'),
  (18, 20, 'Athlete', 'Athlete',
   'Handicap mục tiêu 10 / 8 / < 5; Luật L3; HLV L1.', 'Target handicap 10 / 8 / < 5; Rules L3; Coach L1.')
),
hdc(hn, h) as (values
  (10, '38'), (11, '30'), (12, '25'), (13, '20'), (14, '18'), (15, '16'), (16, '15'), (17, '12'),
  (18, '10'), (19, '8'), (20, '< 5')
)
insert into public.levels (program_id, number, name_vi, name_en, group_name_vi, group_name_en,
                           summary_vi, summary_en, target_handicap, passport_stage_id, passport_tier_id)
select
  (select id from public.programs where code = 'core20'),
  n, 'Level ' || n, 'Level ' || n, grp.gvi, grp.gen, grp.svi, grp.sen, hdc.h,
  (select id from public.passport_stages s where n between s.level_from and s.level_to),
  (select id from public.passport_tiers t where n between t.level_from and t.level_to)
from generate_series(1, 20) n
join grp on n between grp.n_from and grp.n_to
left join hdc on hdc.hn = n;

insert into public.levels (program_id, number, name_vi, name_en, summary_vi, summary_en)
values ((select id from public.programs where code = 'summer_camp'), 1, 'Hành trình 1', 'Journey 1',
        'Hoàn thành 6 buổi của hành trình trại hè.', 'Completed the 6 sessions of the summer-camp journey.');

-------------------------------------------------------------------------------
-- Nội dung chi tiết Level 1–3 (phụ lục B, mục B1 và B3 — BẢN NHÁP chờ anh Long duyệt)
-- Mỗi dòng: key, group (technique/culture/rules/knowledge/life_skills/other), nhãn và nội dung L1–L3.
-------------------------------------------------------------------------------
with src(j) as (values ($json$
{"rows": [
 {"key":"course","group":"knowledge","label_vi":"Sân golf và cách chơi","label_en":"The golf course and how to play",
  "vi":["Nhận diện sân 18 hố; mô tả 1 hố bằng hình ảnh; thể thức đấu gậy, bảng điểm cơ bản",
        "Các thành phần chi tiết của 1 hố (3–5 bộ tee, khu vực chung, bẫy, khu vực giải thoát không phạt gậy, loại cỏ trên green); thể thức Match Play đơn",
        "Vẽ tổng quan 1 sân golf với 5 khu vực; vẽ mục tiêu đơn giản; thể thức Foursome"],
  "en":["Recognise an 18-hole course; describe a hole with pictures; stroke play and a basic scorecard",
        "Detailed parts of a hole (3–5 sets of tees, general area, bunkers, free-relief areas, green grass types); singles match play",
        "Draw an overview of a course with its 5 areas; draw simple targets; foursome format"]},
 {"key":"etiquette","group":"culture","label_vi":"Văn hoá và phép lịch sự","label_en":"Etiquette and courtesy",
  "vi":["\"3 từ\" + văn hoá cơ bản nhất + Grip & Setup",
        "Trang phục trên sân golf; trang phục lịch sự là ngôn ngữ không lời của sự tôn trọng",
        "Chủ động chào hỏi; giao tiếp lịch sự: biết nói cảm ơn, xin lỗi khi chơi golf"],
  "en":["The \"3 words\" + the most basic etiquette + Grip & Setup",
        "Golf course attire; neat attire is the silent language of respect",
        "Greet others first; polite communication: saying thank you and sorry during play"]},
 {"key":"knowledge","group":"knowledge","label_vi":"Kiến thức golf","label_en":"Golf knowledge",
  "vi":["Chuyển trạm, cách tập; đọc và ghi bảng điểm, cầm gậy, việc sau khi chơi",
        "Thuật ngữ: Back, Down, Follow, Finish",
        "Nên và không nên với bạn cùng chơi"],
  "en":["Rotating stations and how to practise; reading and filling in a scorecard, holding the club, what to do after play",
        "Terms: Back, Down, Follow, Finish",
        "Dos and don'ts with playing partners"]},
 {"key":"shots","group":"technique","label_vi":"Các cú đánh","label_en":"The shots",
  "vi":["Nhận diện 4 cú cơ bản: Putting, Chipping, Pitching, Full swing","Công thức chi tiết 4 cú cơ bản","Linh động trong 4 cú cơ bản"],
  "en":["Recognise the 4 basic shots: putting, chipping, pitching, full swing","Detailed formula for the 4 basic shots","Flexibility across the 4 basic shots"]},
 {"key":"putt","group":"technique","label_vi":"Kỹ thuật Putt","label_en":"Putting technique",
  "vi":["Công thức Putt + công cụ SNAG-Brush","Putt đều từ 7h đến 5h","Putt gần (putt thẳng)"],
  "en":["Putting formula + SNAG-Brush tool","Even putting stroke from 7 to 5 o'clock","Short putts (straight putts)"]},
 {"key":"life1","group":"life_skills","label_vi":"Kỹ năng sống (1)","label_en":"Life skills (1)",
  "vi":["Văn hoá trên green + kỹ năng","Tính cẩn thận, cẩn trọng","Khả năng quan sát"],
  "en":["Etiquette on the green + skills","Carefulness and caution","Observation skills"]},
 {"key":"chip","group":"technique","label_vi":"Kỹ thuật Chip","label_en":"Chipping technique",
  "vi":["Công thức Chip chữ Y từ 8h đến 4h","Grip, tư thế setup nâng cao","Hướng đánh với chip"],
  "en":["Y-shaped chipping formula from 8 to 4 o'clock","Advanced grip and setup","Chipping direction"]},
 {"key":"chip_tool","group":"technique","label_vi":"Công cụ Chip","label_en":"Chipping tool",
  "vi":["SNAG-O-Matic","Thành thạo công cụ + bài tập chip với bóng SNAG","Như Level 2"],
  "en":["SNAG-O-Matic","Tool mastery + chipping drills with SNAG balls","Same as Level 2"]},
 {"key":"life2","group":"life_skills","label_vi":"Kỹ năng sống (2)","label_en":"Life skills (2)",
  "vi":["Văn hoá quanh green: chịu trách nhiệm","Tính quyết đoán","Tính kiên trì"],
  "en":["Etiquette around the green: taking responsibility","Decisiveness","Perseverance"]},
 {"key":"rules1","group":"rules","label_vi":"Luật (1)","label_en":"Rules (1)",
  "vi":["Luật 18.2: OB cơ bản","Luật 18.2: OB chi tiết và đầy đủ","Luật 5 & 6: bắt đầu một vòng đấu và một hố"],
  "en":["Rule 18.2: out of bounds (basics)","Rule 18.2: out of bounds (full detail)","Rules 5 & 6: starting a round and playing a hole"]},
 {"key":"pitch","group":"technique","label_vi":"Kỹ thuật Pitch","label_en":"Pitching technique",
  "vi":["Công thức Pitch + công cụ (SNAG-Azoo)","Chuẩn chỉnh động tác pitching","Hướng đánh"],
  "en":["Pitching formula + tool (SNAG-Azoo)","Refining the pitching motion","Shot direction"]},
 {"key":"life3","group":"life_skills","label_vi":"Kỹ năng sống (3)","label_en":"Life skills (3)",
  "vi":["Văn hoá khu vực chung + ra quyết định","Phân tích rủi ro","Kiểm soát cảm xúc 1"],
  "en":["Etiquette in the general area + decision making","Risk analysis","Emotional control 1"]},
 {"key":"rules2","group":"rules","label_vi":"Luật (2)","label_en":"Rules (2)",
  "vi":["Luật 17.1: Penalty cơ bản","Luật 17.1: Penalty chi tiết","Luật 18: mất bóng"],
  "en":["Rule 17.1: penalty areas (basics)","Rule 17.1: penalty areas (detailed)","Rule 18: lost ball"]},
 {"key":"fullswing","group":"technique","label_vi":"Kỹ thuật Full swing","label_en":"Full swing technique",
  "vi":["Công thức Full swing","Công thức Full swing + Finish","Setup: tư thế chuẩn bị"],
  "en":["Full swing formula","Full swing formula + finish","Setup: address position"]},
 {"key":"fullswing_tool","group":"technique","label_vi":"Công cụ Full swing","label_en":"Full swing tool",
  "vi":["Snapper","Snapper","Snapper"],"en":["Snapper","Snapper","Snapper"]},
 {"key":"goal","group":"life_skills","label_vi":"Đặt mục tiêu (Goal setting)","label_en":"Goal setting",
  "vi":["Văn hoá trên tee + đặt mục tiêu","Goal setting","Goal setting"],
  "en":["Etiquette on the tee + goal setting","Goal setting","Goal setting"]},
 {"key":"review","group":"other","label_vi":"Ôn tập","label_en":"Review",
  "vi":["Ôn tập, tổng kết","Ôn tập, tổng kết","Ôn tập, tổng kết"],"en":["Review and wrap-up","Review and wrap-up","Review and wrap-up"]},
 {"key":"competition","group":"other","label_vi":"Thi đấu","label_en":"Competition",
  "vi":["Giải SNAG Golf mini","Giải SNAG Golf mini","Giải SNAG Golf mini"],
  "en":["Mini SNAG Golf tournament","Mini SNAG Golf tournament","Mini SNAG Golf tournament"]},
 {"key":"culture_required","group":"culture","label_vi":"Văn hoá, ứng xử bắt buộc","label_en":"Required etiquette and conduct",
  "vi":["7 văn hoá trước thi đấu (trang 15 Passport); 5 văn hoá trên green (trang 8); an toàn là số 1",
        "5 văn hoá quanh green (trang 10); trang phục lịch sự",
        "5 văn hoá khu vực chung (trang 12); chủ động chào hỏi, cảm ơn, xin lỗi"],
  "en":["7 pre-competition etiquette points (Passport p.15); 5 etiquette points on the green (p.8); safety first",
        "5 etiquette points around the green (p.10); neat attire",
        "5 etiquette points in the general area (p.12); greeting, thanking and apologising"]},
 {"key":"rules_test","group":"rules","label_vi":"Luật, kiến thức (kiểm tra ngắn)","label_en":"Rules and knowledge (short test)",
  "vi":["Luật 18.2 OB cơ bản; Luật 17.1 penalty cơ bản; đọc bảng điểm, par, 4 cú đánh",
        "Luật 18.2 OB chi tiết; Luật 17.1 penalty chi tiết; thuật ngữ Back / Down / Follow / Finish; match play đơn",
        "Luật 5 & 6; Luật 18 mất bóng; nên và không nên với bạn chơi; foursome"],
  "en":["Rule 18.2 OB basics; Rule 17.1 penalty basics; reading a scorecard, par, the 4 shots",
        "Rule 18.2 OB in detail; Rule 17.1 penalty in detail; terms Back / Down / Follow / Finish; singles match play",
        "Rules 5 & 6; Rule 18 lost ball; dos and don'ts with playing partners; foursome"]}
]}
$json$::jsonb))
update public.levels l
set content_detail = jsonb_build_object(
  'draft', true,
  'source', 'phu-luc-B',
  'rows', (
    select jsonb_agg(jsonb_build_object(
      'key', r ->> 'key', 'group', r ->> 'group',
      'label_vi', r ->> 'label_vi', 'label_en', r ->> 'label_en',
      'vi', r -> 'vi' ->> (l.number - 1), 'en', r -> 'en' ->> (l.number - 1)) order by ord)
    from src, jsonb_array_elements(src.j -> 'rows') with ordinality as t(r, ord)))
where l.program_id = (select id from public.programs where code = 'core20') and l.number between 1 and 3;

-------------------------------------------------------------------------------
-- Loại lớp (00 mục 6.5)
-------------------------------------------------------------------------------
insert into public.class_types (code, name_vi, name_en, session_minutes_min, session_minutes_max,
                                sessions_per_level_min, sessions_per_level_max, default_scoring_mode) values
  ('pe_core', 'GDTC chính khoá (trường công)', 'Core PE (public school)', 35, 45, 30, 40, 'pass_fail'),
  ('elective', 'Ngoại khoá tự chọn', 'Elective extracurricular', 35, 45, 30, 40, 'pass_fail'),
  ('club_large', 'CLB trong trường (đông học sinh)', 'School club (large)', 60, 90, 20, 24, 'scale_1_5'),
  ('club_small', 'CLB ít học sinh', 'Small club', 60, 90, 20, 24, 'measured'),
  ('after_school', 'Golf ngoài trường cuối ngày', 'After-school golf', 60, 90, 20, 24, 'measured'),
  ('academy_weekend', 'Học viện / trung tâm cuối tuần', 'Weekend academy / centre', 60, 90, 20, 24, 'measured'),
  ('summer_camp', 'Trại hè', 'Summer camp', null, null, 6, 6, 'pass_fail');

-------------------------------------------------------------------------------
-- Sản phẩm (phụ lục C mục 4)
-------------------------------------------------------------------------------
insert into public.products (code, name_vi, name_en, price_vnd)
values ('passport_replacement', 'Phí cấp lại sổ Passport', 'Passport replacement fee', 200000);

-------------------------------------------------------------------------------
-- Mẫu chứng nhận (chưa có ảnh nền — chờ file của VN Centre)
-------------------------------------------------------------------------------
insert into public.certificate_templates (code, name_vi, name_en, type, language) values
  ('summer_camp', 'Chứng nhận hoàn thành trại hè', 'Summer camp completion', 'summer_camp', 'en'),
  ('course_completion', 'Chứng nhận hoàn thành khoá học', 'Course completion', 'course_completion', 'en'),
  ('level_completion', 'Chứng nhận hoàn thành level', 'Level completion', 'level_completion', 'en');

-------------------------------------------------------------------------------
-- Cấu hình (R13: mọi giới hạn lấy từ đây)
-------------------------------------------------------------------------------
insert into public.app_settings (key, value, description_vi, description_en, is_public) values
  ('otp.code_ttl_seconds', '300', 'Mã OTP hết hạn sau (giây)', 'OTP expiry (seconds)', false),
  ('otp.max_attempts_per_code', '5', 'Số lần nhập sai tối đa mỗi mã OTP', 'Max wrong attempts per OTP', false),
  ('otp.resend_after_seconds', '60', 'Được gửi lại mã sau (giây)', 'Resend allowed after (seconds)', true),
  ('otp.max_per_target_per_day', '5', 'Tối đa mã/số điện thoại hoặc email/ngày', 'Max codes per phone or email per day', false),
  ('otp.max_per_ip_per_day', '20', 'Tối đa mã/địa chỉ IP/ngày', 'Max codes per IP per day', false),
  ('code_entry.max_failures_per_ip_per_hour', '10', 'Nhập mã sổ/mã kích hoạt sai tối đa mỗi giờ (theo IP)', 'Max wrong passport/claim codes per hour per IP', false),
  ('code_entry.lock_minutes', '60', 'Khoá nhập mã sau khi sai quá giới hạn (phút)', 'Code-entry lock duration (minutes)', false),
  ('activation.max_identity_failures', '5', 'Xác nhận ngày sinh/họ tên sai tối đa trước khi khoá mã', 'Max wrong date-of-birth/name checks before locking', false),
  ('activation.identity_lock_hours', '24', 'Thời gian khoá mã khi xác nhận sai (giờ)', 'Code lock after failed identity checks (hours)', false),
  ('class_code.max_failures_per_day', '5', 'Nhập mã lớp sai tối đa mỗi ngày mỗi tài khoản', 'Max wrong class codes per account per day', false),
  ('link_confirmation.target_hours', '48', 'Mục tiêu xử lý liên kết chờ xác nhận (giờ)', 'Target time to confirm pending links (hours)', false),
  ('student_account.min_age', '8', 'Tuổi tối thiểu để tạo tài khoản học viên', 'Minimum age for a student account', true),
  ('student_account.max_pin_failures', '5', 'Nhập PIN sai tối đa', 'Max wrong PIN attempts', false),
  ('student_account.pin_lock_minutes', '15', 'Khoá đăng nhập học viên sau khi sai PIN (phút)', 'Student lock after wrong PINs (minutes)', false),
  ('password.min_length', '8', 'Độ dài mật khẩu tối thiểu', 'Minimum password length', true),
  ('invitation.expiry_days', '30', 'Hạn link mời kích hoạt (ngày)', 'Invitation link validity (days)', false),
  ('order.expiry_days', '7', 'Hạn thanh toán đơn hàng (ngày)', 'Order payment deadline (days)', false),
  ('merge.undo_days', '30', 'Được hoàn tác gộp học viên trong (ngày)', 'Student merge can be undone within (days)', false),
  ('messaging.unit_price_vnd', '{"zalo_otp": 300, "zalo_other": 200, "sms": null, "email": 0}',
   'Đơn giá tin nhắn để ước tính chi phí (đồng/tin; null = chưa có giá)', 'Message unit prices for cost estimates (VND; null = unknown)', false),
  ('messaging.invite_template',
   '{"vi": "VN Centre Golf Passport: Chứng nhận và hồ sơ golf của con {student_name} đã sẵn sàng. Kích hoạt tại: {link}", "en": "VN Centre Golf Passport: {student_name}''s golf certificate and record are ready. Activate at: {link}"}',
   'Nội dung tin mời kích hoạt (email/SMS; tin Zalo dùng mẫu đã được Zalo duyệt)', 'Activation invitation text (email/SMS; Zalo uses its approved template)', false),
  ('passport_decal.layout', '{"width_mm": 35, "height_mm": 45, "columns": 5, "rows": 6, "margin_mm": 10, "gap_mm": 3}',
   'Bố cục tờ decal mã sổ', 'Passport decal sheet layout', false),
  ('legal.versions', '{"terms": "v0-draft", "privacy": "v0-draft"}',
   'Phiên bản Điều khoản và Chính sách hiện hành', 'Current Terms and Privacy versions', true);
