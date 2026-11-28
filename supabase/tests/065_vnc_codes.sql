-- Kiểm thử mã VNC và kho số đẹp (migration 20261127000080, docs/spec/12-ma-vnc-so-dep-dang-nhap.md mục 3–4):
-- classify_vnc từng nhóm; tạo 1.000 hồ sơ mới không trúng kho số đẹp, đúng dải đang mở, mỗi người đúng một mã chính;
-- tra bằng mã phụ (hồ sơ đã gộp) ra hồ sơ đích; mã không đổi tay được, không cấp lại.
-- Quy ước: chạy trong một khối DO; thành công thì raise 'ALL_OK' để toàn bộ dữ liệu thử bị huỷ.

do $$
declare
  r record;
  j jsonb;
  n int;
  a uuid; b uuid;
  ok boolean;
  v_year int := extract(year from now())::int;
begin
  -- 1. Phân loại: (mã, nhóm phải có, hạng)
  for r in select * from (values
    ('777777', 'luc_quy', 'kim_cuong'),
    ('033333', 'ngu_quy', 'kim_cuong'),
    ('088888', 'ngu_quy', 'kim_cuong'),
    ('012345', 'sanh_6', 'kim_cuong'),
    ('987654', 'sanh_6', 'kim_cuong'),
    ('041234', 'sanh_4', 'bac'),
    ('059876', 'sanh_4', 'bac'),
    ('300000', 'so_tron', 'kim_cuong'),
    ('051111', 'tu_quy', 'vang'),
    ('121212', 'taxi', 'vang'),
    ('045045', 'taxi', 'vang'),
    ('012210', 'dao_ganh_6', 'vang'),
    ('071221', 'dao_ganh_4', 'dong'),
    ('727272', 'so_golf', 'vang'),
    ('181818', 'so_golf', 'vang'),
    ('545454', 'so_golf', 'vang'),
    ('000072', 'so_golf', 'vang'),
    ('000018', 'so_golf', 'vang'),
    ('037272', 'so_golf_duoi', 'bac'),
    ('041818', 'so_golf_duoi', 'bac'),
    ('026868', 'loc_phat', 'bac'),
    ('038686', 'loc_phat', 'bac'),
    ('053939', 'loc_phat', 'bac'),
    ('067979', 'loc_phat', 'bac'),
    ('012888', 'tam_hoa', 'dong'),
    ('041985', 'nam_sinh', 'nam_sinh'),
    ('150307', 'nam_sinh', 'nam_sinh'),
    ('012467', null, 'thuong')
  ) as t(code, cat, tier) loop
    j := public.classify_vnc(r.code);
    if j ->> 'tier' <> r.tier or (r.cat is not null and not (j -> 'categories') ? r.cat)
       or (r.cat is null and jsonb_array_length(j -> 'categories') <> 0) then
      raise exception 'FAIL: classify_vnc(%) = %, mong đợi nhóm % hạng %', r.code, j, r.cat, r.tier;
    end if;
  end loop;
  -- Khớp nhiều nhóm: giữ mọi nhóm, lấy hạng cao nhất
  j := public.classify_vnc('VNC-055555');
  if j ->> 'tier' <> 'kim_cuong' or not (j -> 'categories') ?& array['ngu_quy', 'tu_quy', 'tam_hoa'] then
    raise exception 'FAIL: nhiều nhóm %', j;
  end if;
  -- Năm sinh: 1940–năm hiện tại; ngày tháng không hợp lệ thì không tính
  if public.classify_vnc('03' || (v_year + 1)::text) ->> 'tier' = 'nam_sinh' then raise exception 'FAIL: năm sinh tương lai'; end if;
  if public.classify_vnc('310224') ->> 'tier' = 'nam_sinh' then raise exception 'FAIL: 31/02 không hợp lệ'; end if;
  if public.classify_vnc('290224') ->> 'tier' <> 'nam_sinh' then raise exception 'FAIL: 29/02/24 hợp lệ'; end if;

  -- 2. Kho số đẹp: số đẹp chưa cấp đều có trong kho; năm sinh không khoá trước
  if exists (select 1 from public.vnc_codes where status = 'available' and not public.vnc_is_premium_tier(tier)) then
    raise exception 'FAIL: kho có số không phải số đẹp';
  end if;
  if not exists (select 1 from public.vnc_codes where code = '088888' and (status = 'available' or owner_id is not null)) then
    raise exception 'FAIL: 088888 không có trong sổ';
  end if;

  -- 3. Tạo 1.000 hồ sơ mới: mã đúng dải đầu 0, không trúng số đẹp, mỗi người đúng một mã chính khớp student_code
  insert into public.students (full_name) select 'Test VNC ' || g from generate_series(1, 1000) g;
  select count(*) into n from public.students s join public.vnc_codes v on v.owner_id = s.id and v.is_primary
  where s.full_name like 'Test VNC %' and v.code = substr(s.student_code, 5, 6) and v.status = 'assigned'
    and v.code like '0%' and not public.vnc_is_premium_tier(v.tier);
  if n <> 1000 then raise exception 'FAIL: chỉ % / 1000 hồ sơ mới có mã chính hợp lệ (dải 0, không phải số đẹp)', n; end if;
  if exists (select 1 from public.students s where s.full_name like 'Test VNC %'
             and public.vnc_is_premium_tier(public.vnc_tier_of(public.vnc_categories(substr(s.student_code, 5, 6))))) then
    raise exception 'FAIL: có hồ sơ mới trúng số đẹp';
  end if;

  -- 4. Tra bằng bất kỳ mã nào: gộp a vào b → mã của a là mã phụ của b, tra mã a ra b
  select id into a from public.students where full_name = 'Test VNC 1';
  select id into b from public.students where full_name = 'Test VNC 2';
  update public.students set merged_into_student_id = b where id = a;
  if public.vnc_student_id((select student_code from public.students where id = a)) is distinct from b then
    raise exception 'FAIL: tra mã của hồ sơ đã gộp không ra hồ sơ đích';
  end if;
  if public.vnc_student_id(substr((select student_code from public.students where id = b), 5, 6)) is distinct from b then
    raise exception 'FAIL: tra mã chính dạng 6 số';
  end if;
  if (select count(*) from public.vnc_codes where owner_id = b and is_primary) <> 1
     or (select count(*) from public.vnc_codes where owner_id = b) <> 2 then
    raise exception 'FAIL: hồ sơ đích phải có 1 mã chính + 1 mã phụ';
  end if;
  -- Hoàn tác gộp: mã trở lại làm mã chính của a
  update public.students set merged_into_student_id = null where id = a;
  if public.vnc_student_id((select student_code from public.students where id = a)) is distinct from a then
    raise exception 'FAIL: hoàn tác gộp';
  end if;

  -- 5. Không đổi tay mã VNC; không lấy mã của người khác
  ok := false;
  begin update public.students set student_code = 'VNC-088888' where id = a;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: đổi tay được mã VNC'; end if;
  ok := false;
  begin insert into public.students (full_name, student_code) values ('Test VNC trùng', (select student_code from public.students where id = b));
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL: cấp lại mã đã có chủ'; end if;

  raise exception 'ALL_OK';
end $$;
