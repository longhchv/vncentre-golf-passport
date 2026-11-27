-- Spec 30 · Bài viết tổng quan địa điểm: quyền, kiểm tra nguồn, duyệt, view công khai. Dữ liệu thử bị huỷ ở cuối.
create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
  end if;
end $f$;

do $$
declare
  adm uuid := gen_random_uuid(); usr uuid := gen_random_uuid();
  vid text; vid2 text; a uuid; n int; ok boolean; r record;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-pva-' || x || '@example.test', now()
  from unnest(array[adm, usr]) x;
  insert into public.profiles (user_id, full_name) select x, 'Test PVA' from unnest(array[adm, usr]) x on conflict do nothing;
  insert into public.user_roles (user_id, role) values (adm, 'admin');

  vid := public.pv_next_id('south');
  insert into public.practice_venues (id, region, name, type, status) values (vid, 'south', 'Test PVA Range', 'range', 'active');
  vid2 := public.pv_next_id('south');
  insert into public.practice_venues (id, region, name, type, status) values (vid2, 'south', 'Test PVA Draft', '3d', 'draft');

  -- 1. Cột kiến thức máy đã có, mặc định là mảng rỗng
  if (select count(*) from information_schema.columns where table_name = 'sim_brands' and column_name in ('metrics', 'practice', 'knowledge_checked_at')) <> 3 then
    raise exception 'FAIL thiếu cột kiến thức máy';
  end if;

  -- 2. Người dùng thường không đọc, không ghi bảng bài viết
  perform pg_temp.act_as(usr);
  ok := false;
  begin
    insert into public.practice_venue_articles (venue_id, title, body) values (vid, 'Bài thử người dùng', 'x');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL người dùng thường ghi được bài'; end if;

  -- 3. Admin tạo nháp: slug tự điền theo mã địa điểm, nháp không lộ ra view
  perform pg_temp.act_as(adm);
  insert into public.practice_venue_articles (venue_id, title, sapo, body, sources)
  values (vid, 'Sân tập thử nghiệm', 'Sapo', '## Mở bài' || chr(10) || 'Nội dung',
          '[{"label":"Website địa điểm","url":"https://example.vn/gia","at":"2026-11-27"}]')
  returning id into a;
  if (select slug from public.practice_venue_articles where id = a) <> vid then raise exception 'FAIL slug tự điền'; end if;
  if (select created_by from public.practice_venue_articles where id = a) <> adm then raise exception 'FAIL created_by'; end if;

  perform pg_temp.act_as(null);
  set local role anon;
  if exists (select 1 from public.pv_public_articles where id = a) then raise exception 'FAIL nháp lộ ra view'; end if;
  reset role;

  -- 4. Tổng quan thứ hai cùng địa điểm, cùng ngôn ngữ bị chặn; khác ngôn ngữ thì được, slug có hậu tố
  perform pg_temp.act_as(adm);
  ok := false;
  begin
    insert into public.practice_venue_articles (venue_id, title, body) values (vid, 'Bài trùng tổng quan', 'x');
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL cho 2 bài tổng quan cùng ngôn ngữ'; end if;
  insert into public.practice_venue_articles (venue_id, lang, title, body) values (vid, 'en', 'Test overview EN', 'x');
  if not exists (select 1 from public.practice_venue_articles where slug = vid || '-en') then raise exception 'FAIL slug tiếng Anh'; end if;

  -- 5. Nguồn sai dạng bị chặn
  ok := false;
  begin
    update public.practice_venue_articles set sources = '[{"label":"","url":"https://x.vn"}]' where id = a;
  exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL nhận nguồn không tên'; end if;
  ok := false;
  begin
    update public.practice_venue_articles set sources = '[{"label":"FB","url":"javascript:alert(1)"}]' where id = a;
  exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL nhận link nguồn lạ'; end if;
  ok := false;
  begin
    update public.practice_venue_articles set cover_url = 'http://x.vn/a.jpg' where id = a;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL nhận ảnh bìa http'; end if;

  -- 6. Duyệt cần nội dung + nguồn; bài tiếng Anh chưa có nguồn thì không duyệt được
  ok := false;
  begin
    update public.practice_venue_articles set status = 'approved' where slug = vid || '-en';
  exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'FAIL duyệt bài thiếu nguồn'; end if;

  update public.practice_venue_articles set status = 'approved' where id = a;
  select approved_by, approved_at into r from public.practice_venue_articles where id = a;
  if r.approved_by is distinct from adm or r.approved_at is null then raise exception 'FAIL ghi người duyệt'; end if;

  -- Sửa bài đang hiển thị giữ nguyên ngày duyệt
  update public.practice_venue_articles set sapo = 'Sapo mới' where id = a;
  if (select approved_at from public.practice_venue_articles where id = a) is distinct from r.approved_at then raise exception 'FAIL đổi ngày duyệt khi sửa'; end if;

  -- 7. View công khai: thấy bài đã duyệt kèm tên địa điểm, không có cột người viết/duyệt
  perform pg_temp.act_as(null);
  set local role anon;
  select count(*) into n from public.pv_public_articles where id = a and venue_name = 'Test PVA Range' and sapo = 'Sapo mới';
  if n <> 1 then raise exception 'FAIL view công khai'; end if;
  reset role;
  if exists (select 1 from information_schema.columns where table_name = 'pv_public_articles' and column_name in ('approved_by', 'created_by', 'updated_by', 'status')) then
    raise exception 'FAIL view lộ cột nội bộ';
  end if;

  -- 8. Địa điểm chưa hiển thị (nháp) thì bài đã duyệt vẫn ẩn
  perform pg_temp.act_as(adm);
  insert into public.practice_venue_articles (venue_id, title, body, sources, status)
  values (vid2, 'Phòng 3D nháp', 'x', '[{"label":"Fanpage"}]', 'approved');
  perform pg_temp.act_as(null);
  set local role anon;
  if exists (select 1 from public.pv_public_articles where venue_id = vid2) then raise exception 'FAIL lộ bài của địa điểm nháp'; end if;
  reset role;

  -- 9. Gỡ bài (archived) thì biến khỏi view; xoá địa điểm thì xoá luôn bài
  perform pg_temp.act_as(adm);
  update public.practice_venue_articles set status = 'archived' where id = a;
  perform pg_temp.act_as(null);
  if exists (select 1 from public.pv_public_articles where id = a) then raise exception 'FAIL bài đã gỡ vẫn hiện'; end if;
  delete from public.practice_venues where id in (vid, vid2);
  if exists (select 1 from public.practice_venue_articles where venue_id in (vid, vid2)) then raise exception 'FAIL không xoá bài theo địa điểm'; end if;

  -- 10. pv_public_venues giữ nguyên các cột region, type, status
  if (select count(*) from information_schema.columns where table_name = 'pv_public_venues' and column_name in ('region', 'type', 'status')) <> 3 then
    raise exception 'FAIL pv_public_venues mất cột';
  end if;

  raise exception 'ALL_OK';
end $$;
