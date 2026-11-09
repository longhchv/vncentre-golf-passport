-- Spec 22 · tiêu chí 1–3: chạy NGAY SAU 20261109000001_scholarship_v2.sql, trên dữ liệu dựng bởi scholarship_v2_before.sql.
do $$
declare
  id_ jsonb := (select jsonb_object_agg(k, id) from sv2_ids);
  v_c4 uuid := (select id from public.scholarship_checklist_items where code = 'C4');
  v_c13 uuid := (select id from public.scholarship_checklist_items where code = 'C13');
  n int;
  st text; nt text;
begin
  -- id dòng giữ không đổi
  if v_c4 <> (id_ ->> 'P2')::uuid or v_c13 <> (id_ ->> 'P6')::uuid then raise exception 'FAIL C4/C13 phải giữ id của P2/P6'; end if;
  if exists (select 1 from public.scholarship_checklist_items where id in ((id_ ->> 'P4')::uuid, (id_ ->> 'P11')::uuid) and is_active) then
    raise exception 'FAIL P4/P11 phải tắt';
  end if;

  -- tiêu chí 1: s1 có P4 done → C4 done (Q2-A: trạng thái lưu được tính dù C4 là mục tự động), P4 không còn hiện
  select status, note into st, nt from public.scholarship_checklist_status where student_id = (id_ ->> 's1')::uuid and item_id = v_c4;
  if st is distinct from 'done' or nt is distinct from 'VGA' then raise exception 'FAIL tiêu chí 1: C4 = % / %', st, nt; end if;

  -- tiêu chí 2: P6 in_progress + P11 done → C13 done, ghi chú nối theo thứ tự P6 · P11
  select status, note into st, nt from public.scholarship_checklist_status where student_id = (id_ ->> 's2')::uuid and item_id = v_c13;
  if st <> 'done' or nt <> 'Movers · IELTS 6.5' then raise exception 'FAIL tiêu chí 2: C13 = % / %', st, nt; end if;
  if (select status from public.scholarship_checklist_status where student_id = (id_ ->> 's3')::uuid and item_id = v_c13) <> 'in_progress'
     or (select status from public.scholarship_checklist_status where student_id = (id_ ->> 's4')::uuid and item_id = v_c13) <> 'done' then
    raise exception 'FAIL gộp P6 + P11 cho s3 / s4';
  end if;

  -- tiêu chí 3 (và 9): không mất / đổi dòng trạng thái nào có từ trước
  -- (dòng của C4 / C13 = P2 / P6 được gộp có chủ đích, đã kiểm ở tiêu chí 1–2)
  select count(*) into n from sv2_before b
  where b.item_id not in (v_c4, v_c13) and not exists (select 1 from public.scholarship_checklist_status s
                    where s.student_id = b.student_id and s.item_id = b.item_id and s.status = b.status
                      and s.note is not distinct from b.note);
  if n <> 0 then raise exception 'FAIL tiêu chí 3: % dòng cũ bị mất hoặc đổi', n; end if;
  -- dòng mới chỉ là dòng gộp vào C4 / C13
  if exists (select 1 from public.scholarship_checklist_status s
             where not exists (select 1 from sv2_before b where b.student_id = s.student_id and b.item_id = s.item_id)
               and s.item_id not in (v_c4, v_c13)) then
    raise exception 'FAIL có dòng trạng thái lạ';
  end if;
  -- mục 1–1: giữ id, đã có mã đúng
  if (select string_agg(i.code, ',' order by x.k) from sv2_ids x join public.scholarship_checklist_items i on i.id = x.id
      where x.k in ('P1', 'P10', 'P12', 'P13', 'P14', 'P17')) <> 'C3,US-C2,C12,US-D1,US-A1,US-E1' then
    raise exception 'FAIL mã của mục thay 1–1';
  end if;

  -- Q5: học viên có dữ liệu → hướng 'us'; không có dữ liệu → không gán
  if (select count(*) from public.student_scholarship_tracks t join sv2_ids x on x.id = t.student_id
      where x.k in ('s1', 's2', 's3', 's4') and t.track = 'us' and t.chosen_by is null and t.removed_at is null) <> 4
     or exists (select 1 from public.student_scholarship_tracks where student_id = (id_ ->> 's5')::uuid) then
    raise exception 'FAIL tự gán hướng us';
  end if;
  if (select (after ->> 'students_assigned_us')::int from public.audit_logs where action = 'scholarship_v2_migrate') < 4 then
    raise exception 'FAIL audit nâng cấp';
  end if;

  raise exception 'ALL_OK';
end $$;
