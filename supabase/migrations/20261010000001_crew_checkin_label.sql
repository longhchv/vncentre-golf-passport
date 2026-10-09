-- Nhân sự sự kiện: vai trò Check-in là Ban tổ chức, không phải Tình nguyện viên (anh Long, 10/10/2026).
-- Áp cho mọi ô Check-in (E1, E2, E3 và ô E4… thêm sau khi bộ phận đầy).
update public.event_crew_slots set badge_label = 'Ban tổ chức' where role_code = 'E' and badge_label is distinct from 'Ban tổ chức';
