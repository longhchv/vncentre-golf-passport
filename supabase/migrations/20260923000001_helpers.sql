-- Bước 2 · Hàm dùng chung: sinh mã, chuẩn hoá tên, cập nhật updated_at.
-- Tài liệu: 01-du-lieu.md mục 1–2.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Bảng chữ cho mọi mã bí mật/công khai: bỏ 0, 1, I, O
create or replace function public.code_alphabet()
returns text language sql immutable as $$ select '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' $$;

-- Sinh chuỗi ngẫu nhiên an toàn (gen_random_bytes), không tuần tự.
-- 32 ký tự → mỗi byte lấy 5 bit thấp, phân bố đều.
create or replace function public.random_code(len int)
returns text language plpgsql volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := public.code_alphabet();
  bytes bytea := extensions.gen_random_bytes(len);
  result text := '';
begin
  for i in 0 .. len - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end $$;

-- Chuẩn hoá mã người dùng gõ: in hoa, bỏ gạch và khoảng trắng
create or replace function public.normalize_code(input text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(input, ''), '[\s\-]', '', 'g'))
$$;

-- Tên chuẩn hoá để tìm và dò trùng: bỏ dấu, đ→d, in thường, gộp khoảng trắng
create or replace function public.normalize_name(input text)
returns text language sql stable
set search_path = public, extensions
as $$
  select trim(regexp_replace(
    lower(extensions.unaccent(translate(coalesce(input, ''), 'đĐ', 'dD'))),
    '\s+', ' ', 'g'))
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
