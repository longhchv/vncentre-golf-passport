-- SNAG League · nhập lịch sử tìm trường theo mọi cách viết của CLB (migration 20261105000003).
do $$
declare sc uuid; s1 uuid; r jsonb;
begin
  insert into public.schools (name, type) values ('TH Thu Alias Snag', 'public') returning id into sc;
  insert into public.students (full_name, current_school_id) values ('Test Snag Alias', sc) returning id into s1;

  -- CLB đã quy đổi "TTAS" không có trong danh mục trường; cách viết đầy đủ có → ghép chắc (K8: thiếu năm sinh, cùng trường, một người trùng tên)
  r := public.league_import_history(jsonb_build_array(jsonb_build_object('no', 81, 'date', '2026-04-19', 'rows', jsonb_build_array(
    jsonb_build_object('name', 'Test Snag Alias', 'club', 'TTAS', 'school_names', jsonb_build_array('TTAS', 'TH Thu Alias Snag'),
                       'title', 'Winner bảng', 'points_participation', 50, 'points_rank', 300, 'points_bonus', 0),
    jsonb_build_object('name', 'Test Snag Alias Moi', 'club', 'TTAS', 'school_names', jsonb_build_array('TTAS', 'TH Thu Alias Snag'),
                       'points_participation', 50, 'points_rank', 0, 'points_bonus', 0)))), false);
  if (r #>> '{stages,0,matched_by_name}')::int <> 1 or (r #>> '{stages,0,created}')::int <> 1 then raise exception 'FAIL alias: %', r; end if;
  if not exists (select 1 from public.tournament_results t join public.tournaments tt on tt.id = t.tournament_id
                 where tt.stage_no = 81 and t.student_id = s1) then
    raise exception 'FAIL: không ghép vào hồ sơ có sẵn qua tên trường đầy đủ';
  end if;
  if (select current_school_id from public.students where full_name = 'Test Snag Alias Moi') is distinct from sc then
    raise exception 'FAIL: hồ sơ mới không nhận trường';
  end if;
  -- Không có school_names vẫn chạy như cũ
  r := public.league_import_history(jsonb_build_array(jsonb_build_object('no', 82, 'date', '2026-04-20', 'rows', jsonb_build_array(
    jsonb_build_object('name', 'Test Snag Khong Truong', 'points_participation', 50, 'points_rank', 0, 'points_bonus', 0)))), true);
  if (r #>> '{stages,0,created}')::int <> 1 then raise exception 'FAIL: không có school_names: %', r; end if;

  raise exception 'ALL_OK';
end $$;
