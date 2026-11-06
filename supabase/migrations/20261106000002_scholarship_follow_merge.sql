-- Spec 15 · việc mở trong B23: gộp học viên thì trạng thái Hành trang học bổng đi theo hồ sơ giữ lại; hoàn tác gộp thì trả về.
-- Cùng cách với kết quả giải (league_follow_student_merge) và lớp học trong merge_students:
--   · Mục chỉ hồ sơ bị gộp có → chuyển sang hồ sơ giữ lại, ghi vết vào merge_trail.
--   · Mục cả hai hồ sơ đều có → giữ bản của hồ sơ giữ lại; bản của hồ sơ bị gộp nằm nguyên chỗ cũ (hiện lại khi hoàn tác).
-- Migration chỉ thêm: cột mới, hàm và trigger mới. Không sửa merge_students / undo_student_merge.

alter table public.scholarship_checklist_status add column if not exists merge_trail uuid[] not null default '{}';

create or replace function public.scholarship_follow_student_merge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.merged_into_student_id is null and new.merged_into_student_id is not null then
    update public.scholarship_checklist_status s
    set student_id = new.merged_into_student_id, merge_trail = s.merge_trail || old.id
    where s.student_id = old.id
      and not exists (select 1 from public.scholarship_checklist_status k
                      where k.student_id = new.merged_into_student_id and k.item_id = s.item_id);
  elsif old.merged_into_student_id is not null and new.merged_into_student_id is null then
    update public.scholarship_checklist_status
    set student_id = old.id, merge_trail = merge_trail[1:cardinality(merge_trail) - 1]
    where merge_trail[cardinality(merge_trail)] = old.id;
  end if;
  return null;
end $$;

create trigger scholarship_follow_student_merge after update of merged_into_student_id on public.students
  for each row execute function public.scholarship_follow_student_merge();

revoke execute on function public.scholarship_follow_student_merge() from public, anon, authenticated;
