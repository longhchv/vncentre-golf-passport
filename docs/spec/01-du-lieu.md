# 01 · Dữ liệu

Tài liệu này mô tả **dữ liệu cần lưu** và **quan hệ** giữa chúng. Tên bảng và tên trường dùng tiếng Anh để đặt trong code; phần giải thích bằng tiếng Việt. Claude Code được chọn kiểu dữ liệu chi tiết, nhưng phải giữ đúng ý nghĩa, ràng buộc và quy tắc ở đây.

Cột "Đợt" cho biết bảng cần có từ đợt nào. Bảng của đợt sau **không cần tạo ngay**, nhưng thiết kế đợt 1 phải không cản trở việc thêm chúng.

## 1. Quy ước chung

- Mọi bảng có `id` (UUID), `created_at`, `updated_at`.
- Bảng quan trọng có `deleted_at` (xoá mềm), không xoá cứng dữ liệu học viên.
- Trường có bản song ngữ đặt tên `*_vi` và `*_en`.
- Thời gian lưu theo UTC; hiển thị theo giờ Việt Nam (UTC+7).
- Tiền lưu bằng số nguyên, đơn vị đồng (VND).
- Số điện thoại lưu dạng quốc tế E.164, ví dụ `+84912345678`.
- Mọi bảng có cột `org_id` trỏ tới bảng `organizations`. Bản 1 chỉ có một tổ chức là VN Centre. Cột này để sẵn cho gói Diamond ở bản 2.

## 2. Định dạng mã

| Mã | Định dạng | Bí mật? | Ghi chú |
|---|---|---|---|
| Mã học viên `student_code` | `VNC-` + 6 chữ số tăng dần, ví dụ `VNC-000123` | Không | Vĩnh viễn, không đổi |
| Mã sổ `passport_code` | 8 ký tự ngẫu nhiên, hiển thị `XXXX-XXXX` | Có (trước khi kích hoạt) | Bảng chữ: `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (bỏ 0, 1, I, O). Sinh ngẫu nhiên an toàn, không tuần tự. QR trỏ tới `https://app.vncentre.net/p/{passport_code}` |
| Mã kích hoạt học viên `claim_code` | 8 ký tự, cùng bảng chữ | Có | Mỗi học viên có 1 mã, in trên chứng nhận giấy/phiếu kết quả. Dùng một lần. Admin tạo lại được. QR trỏ tới `https://app.vncentre.net/c/{claim_code}` |
| Mã lớp `class_join_code` | 6 ký tự, cùng bảng chữ | Có (trong phạm vi lớp) | HLV gửi trong nhóm Zalo lớp. Admin/HLV đổi mã được |
| Mã xác thực chứng nhận `verify_code` | 10 ký tự, cùng bảng chữ | Không (công khai trên chứng nhận) | Trang xác thực `https://app.vncentre.net/verify/{verify_code}` |
| Mã đơn thanh toán `order_code` | Số nguyên tăng dần, tối đa 15 chữ số | Không | Dùng làm nội dung chuyển khoản |

Người dùng gõ mã có thể viết thường, có dấu gạch hoặc không. App tự chuẩn hoá: in hoa, bỏ dấu gạch và khoảng trắng. Nếu mã có ký tự không thuộc bảng chữ (0, 1, I, O), báo: "Mã không hợp lệ. Lưu ý mã không có số 0, số 1, chữ I và chữ O."

## 3. Tổ chức, trường, năm học

| Bảng | Đợt | Trường chính | Ghi chú |
|---|---|---|---|
| `organizations` | 1 | name, legal_name, tax_code, logo_url | Bản 1: 1 dòng VN Centre / HCHV |
| `schools` | 1 | name, short_name, type (`public`, `private`, `international`, `center`, `club`, `other`), city, address, requires_photo_consent (bool), is_active | Trường học, cơ sở, CLB, học viện đối tác |
| `academic_years` | 1 | name (ví dụ `2026-2027`), start_date, end_date, is_current | |

## 4. Người dùng và vai trò

| Bảng | Đợt | Trường chính | Ghi chú |
|---|---|---|---|
| `users` | 1 | Tài khoản đăng nhập (do hệ thống xác thực quản lý): phone, email, password, phone_verified_at, email_verified_at | |
| `profiles` | 1 | user_id, full_name, preferred_language (`vi`/`en`), avatar_url, status (`active`, `suspended`) | |
| `user_roles` | 1 | user_id, role, school_id (nullable), class_id (nullable), granted_by | role ∈ `admin`, `head_coach`, `coach`, `assistant`, `school_manager`, `pe_teacher`, `partner`, `event_staff`. Phụ huynh không cần dòng ở đây, xác định qua `student_guardians` |
| `guardians` | 1 | user_id, full_name, phone, email, relationship_default | Thông tin phụ huynh. Có thể tồn tại **trước** khi có tài khoản (nhập từ danh sách trường) → `user_id` null |
| `student_guardians` | 1 | student_id, guardian_id, relationship (`father`, `mother`, `guardian`, `other`), is_primary, can_manage (bool), share_academic_with_coaches (bool), linked_via (`passport`, `claim_code`, `invite`, `class_code`, `admin`), status (`active`, `pending_confirmation`), linked_at | Nhiều–nhiều |
| `student_accounts` | 1 | student_id (duy nhất), **user_id** (tài khoản Supabase Auth tương ứng, duy nhất), username (duy nhất toàn hệ thống; chữ thường không dấu, số, dấu chấm, gạch dưới; 3–32 ký tự), created_by_guardian_id, is_active, **failed_attempts**, **locked_until**, org_id | Tài khoản cho học viên từ 8 tuổi, phụ huynh tạo. **Không có cột `pin_hash` — PIN không lưu ở bất cứ đâu.** Xem ô dưới |

### 4b. Tài khoản học viên hoạt động thế nào (cập nhật 07/10/2026 theo bản đã build — xem quyết định **B4** ở `phu-luc-D`)

**PIN không bao giờ được lưu.** Mỗi tài khoản học viên có một tài khoản Supabase Auth đi kèm, dùng **email nội bộ không có hộp thư thật** dạng `<mã tài khoản>@students.vncentre.net`. Mật khẩu của tài khoản đó được tính từ **PIN cộng một khoá bí mật chỉ máy chủ biết**, rồi Supabase băm như mọi mật khẩu khác. Hệ quả:

- PIN không nằm trong cơ sở dữ liệu, không nằm trong log, không ở đâu cả.
- Không ai đăng nhập thẳng vào Supabase bằng PIN được.
- Mọi lần đăng nhập đều đi qua máy chủ của app, nơi đếm số lần nhập sai.

**Luồng đăng nhập.** Học viên vào `/login` → tab "Học viên" → nhập tên đăng nhập và **PIN 6 số**. Edge Function `student-accounts` xử lý:

1. Kiểm tra tài khoản có đang tạm khoá (`locked_until`) hoặc bị phụ huynh khoá (`is_active = false`) không.
2. Đúng PIN → đăng nhập và đặt lại `failed_attempts` về 0.
3. Sai PIN → tăng `failed_attempts`. Sai 5 lần thì khoá 15 phút, ghi vào `locked_until`.

**Chỉ người giám hộ có `can_manage` được quản lý tài khoản của con:**

- Tạo tài khoản cho con **từ 8 tuổi trở lên**, tính theo ngày sinh (R14). Chưa có ngày sinh thì phải nhập trước.
- App gợi ý tên đăng nhập từ tên con cộng số.
- PIN **không được** là 6 số giống nhau hoặc dãy số liên tiếp (B13).
- Phụ huynh đổi PIN được; đổi PIN đồng thời mở khoá ngay.
- Phụ huynh khoá hoặc mở khoá tài khoản của con bất cứ lúc nào.
- Học viên **chỉ xem** hồ sơ của mình ở `/me`: không sửa gì, không tải PDF, **không có trang Tài khoản**.

**Các con số nằm trong `app_settings`, admin chỉnh được (R13):**

| Khoá | Mặc định |
|---|---|
| `student_account.min_age` | 8 |
| `student_account.max_pin_failures` | 5 |
| `student_account.pin_lock_minutes` | 15 |

## 5. Học viên

| Bảng | Đợt | Trường chính | Ghi chú |
|---|---|---|---|
| `students` | 1 | student_code, full_name, full_name_normalized (bỏ dấu, in thường để tìm và dò trùng), date_of_birth (nullable), gender (nullable), nationality (nullable), current_school_id, current_grade_class (text, ví dụ "3A2"), avatar_url, golf_goals (danh sách, xem mục 5.1), current_level_id, activated_at (ngày kích hoạt tài khoản học viên lần đầu, dùng cho chu kỳ điểm), verification_status (`verified`, `pending_review`), claim_code, claim_code_used_at, merged_into_student_id (nullable) | `pending_review` khi học viên do phụ huynh tự khai, chưa khớp danh sách |
| `student_school_history` | 1 | student_id, school_id, academic_year_id, grade_class | Lịch sử trường, lớp theo năm học |
| `student_merges` | 1 | from_student_id, to_student_id, merged_by, merged_at, snapshot (JSON) | Nhật ký gộp học viên trùng |

### 5.1 Mục tiêu golf (theo trang 4 Passport, chọn nhiều)

`know_how_to_play` Chỉ để biết cách chơi · `health` Rèn sức khoẻ, tinh thần · `family` Gắn kết gia đình · `life_skills` Kỹ năng sống, ứng xử, lãnh đạo · `local_tournaments` Thi đấu giải phong trào · `college_scholarship` Xin học bổng du học Mỹ · `athlete` Trở thành vận động viên · `golf_industry` Hoạt động trong ngành golf · `other` Khác (kèm ô chữ)

## 6. Chương trình, level, giai đoạn, hộ chiếu

| Bảng | Đợt | Trường chính | Ghi chú |
|---|---|---|---|
| `programs` | 1 | code (`core20`, `summer_camp`), name_vi, name_en, description_vi/en, is_official_level_track (bool) | `core20` là lộ trình chính thức; `summer_camp` là chương trình độc lập |
| `levels` | 1 | program_id, number, name_vi, name_en, group_name_vi/en, summary_vi/en, target_handicap (nullable), passport_stage_id, passport_tier_id, content_detail (JSON: 18 dòng nội dung, xem `phu-luc-B`) | Seed đủ 20 level `core20`; chi tiết nội dung L1–3 |
| `passport_stages` | 1 | number (1–5), name_vi/en, color, level_from, level_to | Admin chỉnh |
| `passport_tiers` | 1 | code (`first`, `player`, `elite`), name_vi/en, level_from, level_to, validity_months (mặc định 12) | Admin chỉnh |
| `class_types` | 1 | code (`pe_core`, `elective`, `club_large`, `club_small`, `after_school`, `academy_weekend`, `summer_camp`), name_vi/en, session_minutes_min/max, sessions_per_level_min/max, default_scoring_mode | Theo bảng mục 6.5 của `00-tong-quan.md`. Admin chỉnh |
| `level_records` | 1 | student_id, level_id, status (`in_progress`, `completed`), completed_at, source (`legacy_import`, `school_entry`, `assessment`, `admin`), proposed_by, approved_by, approved_at, approval_status (`pending`, `approved`, `rejected`), note | Mỗi lần lên level là một bản ghi. `students.current_level_id` = level cao nhất đã `completed` + `approved`, cộng 1 (đang học). Nếu chưa có bản ghi nào: Level 1 đang học |

## 7. Lớp, khoá học, lịch sử

| Bảng | Đợt | Trường chính | Ghi chú |
|---|---|---|---|
| `classes` | 1 (cơ bản) | name, school_id, academic_year_id, program_id, class_type_id, target_level_id, scoring_mode (`pass_fail`, `scale_1_5`, `measured`), class_join_code, schedule_rule (JSON, đợt 2), start_date, end_date, status | Đợt 1 chỉ cần tạo lớp và gán học viên, HLV |
| `class_staff` | 1 | class_id, user_id, role (`coach`, `head_coach`, `assistant`, `pe_teacher`) | Một lớp nhiều HLV |
| `enrollments` | 1 | student_id, class_id, status (`active`, `completed`, `dropped`), joined_at, left_at, result (`completed_program`, `completed_level`, `incomplete`), sessions_attended (đợt 2 tính tự động) | |
| `course_history` | 1 | student_id, school_id (nullable), school_name_text (khi trường chưa có trong hệ thống), grade_class, academic_year_text, program_id, course_name, sessions_count (nullable), level_achieved_id (nullable), source (`import`, `school_entry`, `admin`, `system`), status (`pending_review`, `approved`, `rejected`), submitted_by, reviewed_by, reviewed_at | Hiển thị trong mục "Các khoá đã học". `system` = tự sinh khi `enrollments` hoàn thành |

## 8. Sổ Passport

| Bảng | Đợt | Trường chính | Ghi chú |
|---|---|---|---|
| `passport_batches` | 1 | name, tier_id, quantity, print_method (`variable_print`, `decal`), created_by, exported_at | Một lô mã in |
| `passports` | 1 | passport_code, batch_id, tier_id, student_id (nullable), status, issued_at, expires_at, activated_at, activated_by_guardian_id, replaced_passport_id (sổ cũ mà sổ này thay thế), note | |

**Trạng thái sổ:**

```
unassigned ──(admin gán học viên)──▶ assigned ──(phụ huynh kích hoạt)──▶ active
unassigned ──(phụ huynh kích hoạt sổ chưa gán, tự khai học viên)──▶ active (học viên pending_review)
active ──(báo mất)──▶ lost        assigned/unassigned ──(huỷ)──▶ void
active ──(lên cấp hộ chiếu mới, sổ mới được cấp)──▶ retired
```

- Một học viên có nhiều sổ theo thời gian, nhưng **chỉ một sổ `active`** tại một thời điểm.
- Sổ `lost`, `void`, `retired` quét vào vẫn nhận ra học viên (nếu có), nhưng không kích hoạt được. Sổ `lost`/`void` hiện cảnh báo cho nhân viên.

## 9. Chứng nhận

| Bảng | Đợt | Trường chính | Ghi chú |
|---|---|---|---|
| `certificate_templates` | 1 | code, name_vi/en, type (`summer_camp`, `course_completion`, `level_completion`, `tournament`), background_image_url, layout (JSON: vị trí, cỡ chữ, font của từng trường), language (`en`, `vi`, `bilingual`), signer_name, signer_title, signature_image_url, is_active | Bản 1: cài sẵn 3 mẫu (Trại hè, Hoàn thành khoá, Hoàn thành level). Chưa cần trình chỉnh sửa mẫu kéo thả |
| `certificates` | 1 | verify_code, student_id, template_id, type, title_vi/en, data (JSON snapshot: tên học viên, lớp, trường, chương trình, level, ngày), issued_at, issued_by, class_id (nullable), level_record_id (nullable), status (`valid`, `revoked`), revoked_reason | Snapshot để chứng nhận không đổi nội dung khi hồ sơ học viên thay đổi |

## 10. Nhập dữ liệu, thông báo, đồng ý, nhật ký

| Bảng | Đợt | Trường chính | Ghi chú |
|---|---|---|---|
| `import_batches` | 1 | type (`student_list`, `course_history`), file_name, school_id, academic_year_id, class_id (nullable), program_id, status (`uploaded`, `validated`, `committed`, `cancelled`), totals (JSON), created_by | |
| `import_rows` | 1 | batch_id, row_number, raw (JSON), normalized (JSON), status (`ok`, `warning`, `error`, `duplicate_suspect`), messages, matched_student_id | Xem trước trước khi ghi vào hệ thống |
| `invitations` | 1 | guardian_id, student_id, channel (`zalo`, `sms`, `email`), token, sent_at, opened_at, used_at, expires_at, status | Lời mời kích hoạt gửi tới SĐT/email có trong danh sách trường |
| `link_requests` | 1 | requester_user_id, student_id (nullable), submitted_child_name, submitted_dob, submitted_school, method (`class_code`, `manual_review`), status (`pending`, `approved`, `rejected`), reviewed_by | Phụ huynh tự tìm con |
| `otp_logs` | 1 | phone/email, channel, purpose (`signup`, `reset_password`, `activation`), status, provider_message_id, cost_vnd, created_at | Theo dõi chi phí tin nhắn |
| `notifications` | 1 | user_id, notification_code, student_id (nullable), type, title_vi/en, body_vi/en, link, channels_sent (JSON), grouped_count, read_at | Hộp thông báo trong app. **Mọi thông báo đều ghi vào đây, kể cả khi gửi thất bại ở mọi kênh** |
| `notification_types` | 1 | code, group, name_vi/en, description_vi/en, default_channels (JSON), mandatory (bool), min_role, audience | Danh mục các loại thông báo, nạp bằng file seed từ `phu-luc-F` mục 4. Thêm loại mới là thêm dòng, không sửa code |
| `notification_preferences` | 1 | user_id, student_id (nullable), notification_code, channel (`push`, `email`, `zalo`, `in_app`), enabled | Người dùng bật/tắt từng loại. Thiếu dòng thì lấy mặc định trong `notification_types` |
| `notification_templates` | 1 | code, channel, lang, subject, body, zalo_template_id (nullable), version, approved_at | Mẫu tin song ngữ. Tin Zalo phải lưu mã mẫu Zalo đã duyệt |
| `push_subscriptions` | 2 | user_id, endpoint, keys (JSON), device_label, user_agent, created_at, last_success_at, failed_count, revoked_at | Thông báo đẩy Web Push. Mỗi thiết bị một dòng; thất bại 5 lần liên tiếp thì thu hồi |
| `consents` | 1 | guardian_id, student_id (nullable), type (`terms`, `privacy`, `leaderboard_name`, `photo`), version, granted (bool), granted_at, revoked_at | Lưu cả phiên bản văn bản đã đồng ý |
| `audit_logs` | 1 | actor_user_id, action, entity_type, entity_id, before (JSON), after (JSON), ip, created_at | Không cho sửa/xoá |
| `support_requests` | 1 | student_id (nullable), requester_user_id, type (`history_update`, `data_deletion`, `other`), **body**, status (`pending`, `resolved`, `rejected`), handled_by, handled_at, **resolution_note** | Chỗ lưu cho nút "Con đã từng học golf?" (F8) và "Yêu cầu xoá dữ liệu của con" (F18). Hiện trong hàng chờ của admin. Yêu cầu xoá dữ liệu xử lý thủ công và **phải ghi nhật ký**. Tên cột lấy theo bảng đã build (B3) |
| `app_settings` | 1 | key, value (JSON), updated_by | Cấu hình chung: giá cấp lại sổ, giới hạn OTP, kênh thông báo, các khoá `student_account.*`… |

## 11. Thanh toán (đợt 1: chỉ phí cấp lại sổ)

| Bảng | Đợt | Trường chính | Ghi chú |
|---|---|---|---|
| `products` | 1 | code (`passport_replacement`, sau thêm `premium_annual`, `tournament_fee`, `gift_shipping`…), name_vi/en, price_vnd, is_active | Admin chỉnh giá. Mặc định `passport_replacement` = 200.000 đ |
| `orders` | 1 | order_code, payer_user_id, student_id, product_id, amount_vnd, status (`pending`, `paid`, `cancelled`, `expired`, `refunded`), payment_provider (`payos`), provider_ref, paid_at, expires_at | |
| `payment_events` | 1 | order_id, provider, payload (JSON), signature_valid (bool), received_at | Lưu nguyên dữ liệu webhook |
| `invoice_requests` | 1 | order_id, buyer_type (`individual`, `company`), buyer_name, tax_code, address, email, status (`requested`, `issued`), issued_invoice_no, issued_by | Kế toán xuất hoá đơn trên MISA rồi đánh dấu đã xuất |

## 11b. Module Trải nghiệm sự kiện (ngoại lệ đợt 1, v0.8 — xem `10-module-trai-nghiem-su-kien.md`)

| Thay đổi | Nội dung |
|---|---|
| `passport_tiers` | Thêm hạng `event_experience` ("Trải nghiệm sự kiện"). `level_from`, `level_to` cho phép trống (hạng này không gắn dải level). Thêm cột **counts_toward_single_active** (bool, mặc định true; hạng sự kiện = false) |
| `passports` | Thêm trạng thái `event_registered` (thẻ đã ghi tên + SĐT, chưa có tài khoản). Thêm cột **counts_toward_single_active** sao chép từ hạng (trigger), để chỉ mục "một sổ active mỗi học viên" (R2) bỏ qua thẻ sự kiện (E-R5) |
| `passport_batches` | Thêm `event_id` (lô thẻ của sự kiện) |
| `students.verification_status` | Thêm `event_guest` (hồ sơ người trải nghiệm; không vào hàng chờ F12) |
| `student_guardians` | `relationship` thêm `self`; `linked_via` thêm `event_card` |
| `consents.type` | Thêm `contact_by_vncentre` (tuỳ chọn, mặc định không tick) |
| `programs`, `class_types` | Thêm dòng `event_experience` (lớp của sự kiện không lẫn vào lộ trình 20 level) |
| `events` | class_id (duy nhất), name_vi, name_en, event_date, venue, registration_opens_at, registration_closes_at, self_claim_closes_at, status (`draft`/`open`/`closed`/`archived`), zalo_oa_url |
| `event_stations` | event_id, code (`putt`, `chip`, `pitch`, `full_swing`), name_vi, name_en, sort_order, **max_score (trống = không giới hạn)**, score_step (mặc định 5), min_score_to_complete (mặc định 5) |
| `event_participations` | Một dòng mỗi thẻ đã ghi tên: event_id, passport_id (duy nhất), student_id, player_type (`self`/`child`), age_at_registration, residence, registered_by (trống = tự ghi tên), completion_status (`registered`/`pending_review`/`completed`/`rejected`), completed_via (`counter`/`self_claim`), completed_at, completed_by, phone_check_failures, locked_until |
| `event_scores` | event_id, passport_id, station_id, score (nguyên, ≥ 0), entered_by, updated_by. Duy nhất theo (passport_id, station_id). **Gắn theo thẻ, không theo học viên** |
| `event_completion_claims` | participation_id, photo_path (kho riêng tư), status (`pending`/`approved`/`rejected`), reviewed_by, reviewed_at, reject_reason |
| `event_redemptions` | **Đổi quà bằng điểm** (quyết định B18): passport_id, event_id (đợt đổi quà), points (> 0), gift_label, redeemed_by, redeemed_at. Đổi nhiều lần, tổng không vượt điểm tích luỹ |
| Điểm | Tổng tích luỹ = tổng `event_scores` của thẻ; còn lại = tổng tích luỹ − tổng `event_redemptions`. Không lưu cứng |
| Vai trò `event_staff` | Gán theo sự kiện qua `user_roles.class_id` = lớp của sự kiện. Không thấy SĐT, email người chơi (E-R12) |
| `app_settings` | `event.max_open_claims` (3), `event.phone_check_max_failures` (5), `event.phone_check_lock_hours` (24), `passport_decal.layout_event` (tem 25 × 30 mm, 7 × 8 tem/tờ A4) |

## 12. Khung dữ liệu cho đợt 2–7 (chưa cần tạo)

| Nhóm | Bảng dự kiến | Đợt |
|---|---|---|
| Buổi học | `sessions` (class_id, date, start_time, status, topic_level_row), `attendance` (session_id, student_id, status `present`/`absent`/`excused`, marked_by, method `list`/`qr`) | 2 |
| Kỹ năng | `skill_areas` (5 mảng + văn hoá/luật), `skills` (level_id, area_id, name_vi/en, measure_type, threshold), `skill_assessments` (student_id, skill_id, class_id, session_id, mode, value, is_passed, assessed_by) | 2 |
| Passport checklist | `passport_items` (tier_id, page, name_vi/en, who_ticks `coach`/`student`, points), `passport_item_ticks` (student_id, item_id, ticked_by, confirmed_by) | 2 |
| Văn hoá | `behavior_logs` (session_id, student_id, type `praise`/`reminder`, criteria, note, points) | 2 |
| Mốc thành tích | `milestones` (level_id, course_type `snag`/`real`, holes, tee, target_vs_par), `milestone_results` | 2 |
| Nhận xét, ảnh | `coach_comments` (student_id, class_id, period `session`/`month`/`course`, body, visibility `premium`), `media` (class_id, session_id, url hoặc youtube_url, uploaded_by, requires_consent) | 2 |
| Skills check, scorecard | `skills_checks`, `scorecards`, `scorecard_holes` | 2 |
| Kiểm tra lý thuyết | `question_banks` (theo level), `questions` (dạng `image_choice`, `audio`, `text`; song ngữ), `quiz_attempts` (điểm, đạt/chưa, người mở bài), `quiz_answers` | 2 |
| Kiểm tra thực hành | `practical_exams` (level, mảng kỹ thuật), `exam_submissions` (video link YouTube, người nộp), `exam_results` (chấm theo mảng, người chấm) | 2 |
| Đủ điều kiện lên level | `level_eligibility` (tính tự động từ 3 trụ + 2 bài thi + số buổi; trạng thái `eligible`, `approved`, `rejected`) | 2 |
| Bài tập tự luyện | `drills` (level, mảng, dụng cụ, không gian, cách làm, video, tiêu chí, điểm), `drill_assignments` (giao cho lớp hoặc học viên), `drill_logs` (tự khai hay có bằng chứng, trạng thái xác nhận, người xác nhận), `drill_evidence` (ảnh, video, số liệu), `practice_streaks` | 3 |
| Buổi tập có dẫn dắt | `workouts` (tên, nhóm tuổi 6–8/9–12/13+, thời lượng, mức độ, trạng thái `draft`/`approved`, người duyệt), `workout_blocks` (thứ tự, loại, thời gian hoặc số lần, ảnh/video, link YouTube), `workout_assignments` (app gợi ý hoặc HLV giao), `workout_sessions` (học viên, giờ bắt đầu/kết thúc, trạng thái, nguồn giao), `workout_block_logs` (thời gian thực tế, hoàn thành hay bỏ qua, có được tính điểm không) | 3 |
| Mã tặng và đổi Premium | `promo_codes` (loại `gift_premium`, số tháng, hạn dùng, người cấp), `promo_redemptions`, `point_redemptions` (đổi điểm lấy Premium) | 4 |
| Thư viện trò chơi | `games` (đầy đủ trường theo `07-dot-5`), `game_media`, `game_usages` (HLV đã dùng, chấm sao, ghi chú), `game_collections`, `game_contributions` (HLV đóng góp, chờ duyệt) | 5 |
| Điểm thưởng | `reward_rules`, `reward_ledger` (student_id, delta, reason, source_type/id, cycle_no, is_frozen), `reward_cycles` | 3 |
| Quà | `gift_items` (tên, mô tả, ảnh, điểm, tồn kho), `gift_orders` (điểm nhận `league_event`/`school`/`hq`/`post`, trạng thái), `gift_pickup_windows` | 3 |
| Đối tác | `partners`, `partner_activities` (điểm cố định), `partner_stamps` (quét mã động), giới hạn ngày/tháng | 3 |
| Giải đấu | `seasons` (start_date, end_date do admin đặt), `tournament_series` (League, Tour, mini trường; hệ số), `tournaments` (chặng), `tournament_entries` (bảng tuổi, đơn vị đăng ký), `tournament_results` (gross, thứ hạng, danh hiệu, giải văn hoá), `ranking_points_ledger` | 3 |
| Đơn vị thi đấu | `competition_units` + `unit_transfer_requests` (đơn xin chuyển đơn vị, VN Centre duyệt) | 3 |
| Gói | `subscriptions` (student_id, plan `premium`, start, end, status) | 4 |
| Hồ sơ học bổng | `academic_records` (học bạ, GPA, chứng chỉ; file riêng tư; nhãn tự khai), `activities`, `recommendation_letters`, `external_results` (giải ngoài, VGA; duyệt), `scholarship_exports` | 4 |
| Chương trình 1-1 | `coaching_programs` (học viên, HLV, mục tiêu, số buổi, thời hạn, có tính vào level không), `profile_access_grants` (mức `summary`/`full`, phụ huynh đồng ý, admin duyệt, thu hồi) | 6 |
| Giáo án riêng | `lesson_plans` (trạng thái nháp/chờ duyệt/đã duyệt), `lesson_plan_items` (thứ tự, mục tiêu buổi, kỹ năng, có tính vào level không) | 6 |
| Lịch và đặt buổi | `coach_availability` (khung rảnh theo tuần và ngoại lệ), `bookings` (yêu cầu, xác nhận, đổi, hủy, chuyển hàng chờ admin), `booking_substitutions` (HLV thay thế, cần đủ 3 xác nhận) | 6 |
| Buổi 1-1 | `sessions_1to1` (giờ bắt đầu/kết thúc thật, điểm danh, đúng điểm hẹn), `session_notes` (**`coach_written_text` bắt buộc không rỗng**), `session_media` (chỉ gia đình em đó và HLV của chương trình xem được) | 6 |
| Bài tập giao riêng | `assignments` (hạn nộp, cần bằng chứng, điểm, người duyệt khi HLV tự soạn), `assignment_attempts` (bấm giờ, nộp, chấm, điểm khích lệ, gia hạn) | 6 |
| Đánh giá buổi | `session_feedback` (phụ huynh chấm 1–5 và nhận xét; học viên chỉ chọn biểu tượng cảm xúc), `reliability_events` (lỗi hẹn: hủy muộn, không đến) | 6 |
| Hồ sơ HLV | `coach_profiles` (nhóm HLV, khu vực, chuyên môn, giới thiệu), `coach_credentials` (chứng chỉ, trạng thái xác minh, hạn), `coach_achievements`, `coach_verifications` (người xác minh, checklist, thời điểm) | 7 |
| Giá và khuyến mãi | `coach_pricing` (buổi lẻ, combo; trạng thái duyệt), `coach_coupons` (mức giảm, số lượng, hạn, trạng thái duyệt) | 7 |
| Hạng tài khoản HLV | `coach_plan` (trường trên hồ sơ HLV: `standard` / `coach`, nguồn `paid`/`partnership`, ngày hết hạn) — **tạo từ đợt 6**, HLV VN Centre mặc định `coach`; `plan_features` (bật/tắt từng tính năng theo hạng, admin chỉnh); `plan_limits` (số học viên, số lớp, dung lượng — mặc định Standard 50/5/100 MB); `plan_usage` (đang dùng bao nhiêu) | 6 (trường) · 7 (thu phí, chặn hạn mức) |
| Gói Coach | `coach_subscriptions` (kỳ, giá, tự động cho HLV hợp tác, ngày hết hạn), dùng chung `products`/`orders`/`payment_events` của đợt 1 | 7 |
| Testimonial | `testimonials` (nguồn từ `session_feedback`, phụ huynh đồng ý công khai, HLV chọn hiện/ẩn, rút lại được) | 7 |
| AI viết bài | `coach_bio_drafts` (3 bản: dài, ngắn, đoạn hồ sơ; phiên bản hồ sơ nguồn, người bấm sinh, trạng thái HLV đã xem, đánh dấu đã cũ) | 7 |

## 13. Phân quyền dữ liệu

Nguyên tắc: **mặc định từ chối**. Chỉ mở đúng các quyền dưới đây. "Học viên liên quan" nghĩa là:
- với **phụ huynh**: học viên được liên kết qua `student_guardians`;
- với **HLV / trợ giảng / GV thể chất**: học viên có `enrollments` đang học trong lớp mình được gán ở `class_staff`;
- với **quản lý trường**: học viên có `current_school_id` hoặc `enrollments` thuộc trường mình.

| Dữ liệu | Admin | HLV trưởng | HLV | Quản lý trường | Phụ huynh | Học viên |
|---|---|---|---|---|---|---|
| Thông tin cơ bản học viên | Toàn quyền | Xem, sửa | Xem (học viên liên quan) | Xem (học viên liên quan) | Xem, sửa một số trường (ngày sinh, giới tính, mục tiêu, ảnh) | Xem của mình |
| SĐT, email phụ huynh | Xem, sửa | Xem | **Không** | **Không** | Của chính mình | Không |
| Level, lịch sử khoá học | Toàn quyền | Duyệt | Xem, đề xuất (đợt 2) | Xem, nhập lịch sử (chờ duyệt) | Xem | Xem |
| Chứng nhận | Phát hành, thu hồi | Phát hành | Xem | Xem | Xem, tải PDF | Xem |
| Sổ Passport | Toàn quyền | Xem | Xem | Xem | Xem sổ của con | Xem |
| Học bạ, GPA, chứng chỉ (đợt 4) | Xem | Chỉ khi được Trung tâm chỉ định **và** phụ huynh bật chia sẻ | Như HLV trưởng | Không | Toàn quyền | Xem |
| Đơn hàng, hoá đơn | Toàn quyền | Không | Không | Không | Của mình | Không |
| Nhật ký hệ thống | Xem | Không | Không | Không | Không | Không |

Trang công khai không cần đăng nhập, chỉ hiện đúng các thông tin sau:
- **Trang xác thực chứng nhận:** tên học viên, loại chứng nhận, chương trình/level, ngày cấp, đơn vị cấp, trạng thái hợp lệ.
- **Trang quét mã sổ khi chưa đăng nhập:** tên học viên che bớt, ví dụ `Nguyễn Đ. A.`, và tên trường.
