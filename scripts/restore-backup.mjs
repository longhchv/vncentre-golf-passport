// Khôi phục một bản sao lưu (scripts/backup.mjs) vào một dự án Supabase ĐÃ CHẠY ĐỦ MIGRATION.
//
//   node scripts/restore-backup.mjs --zip <file.zip> --ref <project_ref đích> --yes-xoa-du-lieu-dich
//
// Các bước: (1) xoá sạch dữ liệu trong các bảng public của dự án đích (dữ liệu tham chiếu do migration tạo cũng bị
// thay bằng bản sao lưu); (2) nạp tài khoản đăng nhập (auth.users, auth.identities); (3) nạp dữ liệu public
// (tắt trigger trong lúc nạp để không sinh nhật ký giả); (4) tải lại file vào các kho; (5) đối chiếu số dòng.
// Không khôi phục vào chính dự án nguồn trừ khi thêm --cung-du-an (ví dụ khôi phục sau sự cố trên staging).
// Cần SUPABASE_ACCESS_TOKEN và pg_restore/psql 17 ở C:\dev\tools\pgsql\bin (hoặc PG_BIN).

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const flag = (n) => process.argv.includes(`--${n}`)
const zip = arg('zip')
const ref = arg('ref')
if (!zip || !ref || !flag('yes-xoa-du-lieu-dich')) {
  console.error('Cách dùng: node scripts/restore-backup.mjs --zip <file.zip> --ref <project_ref> --yes-xoa-du-lieu-dich')
  process.exit(1)
}
const pgBin = process.env.PG_BIN ?? 'C:/dev/tools/pgsql/bin'
const token = process.env.SUPABASE_ACCESS_TOKEN || (process.platform === 'win32'
  ? execSync(`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')"`).toString().trim() : '')
const api = async (path, init = {}) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  if (!r.ok) throw new Error(`API ${path}: ${r.status} ${await r.text()}`)
  return r.json()
}
const sql = (query) => api('/database/query', { method: 'POST', body: JSON.stringify({ query }) })
const log = (...a) => console.log(new Date().toLocaleTimeString('vi-VN'), ...a)

const dir = mkdtempSync(join(tmpdir(), 'gp-restore-'))
execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zip}' -DestinationPath '${dir}' -Force"`)
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
if (manifest.project_ref === ref && !flag('cung-du-an')) throw new Error('Đích trùng dự án nguồn — thêm --cung-du-an nếu thật sự muốn ghi đè')
log(`Khôi phục bản ${manifest.created_at} (dự án ${manifest.project_ref}) → ${ref}`)

// ---------------------------------------------------------------- 1. Xoá dữ liệu public ở đích
const tables = (await sql(`select string_agg(format('public.%I', tablename), ', ') as t from pg_tables where schemaname = 'public'`))[0].t
await sql(`truncate ${tables} restart identity cascade`)
log('Đã xoá dữ liệu các bảng public ở đích')

// ---------------------------------------------------------------- 2. Tài khoản đăng nhập
const auth = readFileSync(join(dir, 'auth.json'), 'utf8')
await sql(`delete from auth.identities; delete from auth.users;
  insert into auth.users select * from json_populate_recordset(null::auth.users, ($a$${auth}$a$::json) -> 'users');
  insert into auth.identities select * from json_populate_recordset(null::auth.identities, ($a$${auth}$a$::json) -> 'identities');`)
log('Đã nạp tài khoản đăng nhập')

// ---------------------------------------------------------------- 3. Dữ liệu public
const role = await api('/cli/login-role', { method: 'POST', body: JSON.stringify({ read_only: false }) })
const host = new URL(readFileSync('supabase/.temp/pooler-url', 'utf8').trim()).hostname
const env = { ...process.env, PGPASSWORD: role.password, PGSSLMODE: 'require' }
const dataSql = join(dir, 'data.sql')
execFileSync(join(pgBin, 'pg_restore'), ['--data-only', '--no-owner', '-f', dataSql, join(dir, 'db.dump')])
execFileSync(join(pgBin, 'psql'), ['-h', host, '-p', '5432', '-U', `${role.role}.${ref}`, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
  '-c', 'set role postgres', '-c', 'set session_replication_role = replica', '-f', dataSql], { env, stdio: 'inherit' })
log('Đã nạp dữ liệu public')

// ---------------------------------------------------------------- 4. File trong kho
const keys = await api('/api-keys?reveal=true')
const svc = keys.find((k) => k.name === 'service_role').api_key
const base = `https://${ref}.supabase.co/storage/v1`
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
let up = 0
if (existsSync(join(dir, 'storage'))) {
  for (const file of walk(join(dir, 'storage'))) {
    const [bucket, ...rest] = relative(join(dir, 'storage'), file).split(sep)
    const r = await fetch(`${base}/object/${bucket}/${rest.map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers: { Authorization: `Bearer ${svc}`, apikey: svc, 'x-upsert': 'true' }, body: readFileSync(file),
    })
    if (!r.ok) throw new Error(`Tải lên lỗi ${bucket}/${rest.join('/')}: ${await r.text()}`)
    up++
  }
}
log(`Đã tải lại ${up} file vào kho`)

// ---------------------------------------------------------------- 5. Đối chiếu số dòng
const expected = JSON.parse(readFileSync(join(dir, 'counts.json'), 'utf8'))
let bad = 0
for (const [t, n] of Object.entries(expected)) {
  if (!t.startsWith('public.')) continue
  const got = (await sql(`select count(*)::bigint as n from ${t}`))[0].n
  if (Number(got) !== Number(n)) { bad++; console.log(`LỆCH ${t}: sao lưu ${n}, khôi phục ${got}`) }
}
const users = (await sql('select count(*)::int as n from auth.users'))[0].n
log(bad ? `XONG NHƯNG CÓ ${bad} BẢNG LỆCH` : `XONG: mọi bảng public khớp số dòng; ${users} tài khoản đăng nhập`)
process.exit(bad ? 1 : 0)
