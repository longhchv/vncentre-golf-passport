// Sao lưu Golf Passport: toàn bộ cơ sở dữ liệu (pg_dump) + toàn bộ file trong kho (ảnh, PDF, tài sản chứng nhận).
// Dùng khi dự án còn ở gói Free (không có sao lưu tự động của Supabase).
//
//   node scripts/backup.mjs [--ref <project_ref>] [--out <thư mục>] [--copy-to <thư mục>] [--keep 30]
//
// - Kết nối CSDL bằng tài khoản tạm thời (5 phút; pg_dump chỉ đọc) do Supabase cấp qua Management API → không cần mật khẩu DB.
// - Cần SUPABASE_ACCESS_TOKEN (Windows: biến môi trường mức User) và pg_dump 17 ở C:\dev\tools\pgsql\bin (hoặc PG_BIN).
// - Kết quả: <out>/<thời điểm>/  db.dump (định dạng custom, khôi phục bằng pg_restore), counts.json (số dòng từng bảng
//   để đối chiếu), storage/<bucket>/… (file gốc), manifest.json. Sau đó nén thành <thời điểm>.zip, chép sang --copy-to.
// Bản sao lưu chứa dữ liệu cá nhân (tên, SĐT, email): chỉ để ở nơi riêng tư.

import { execFileSync, execSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const ref = arg('ref', readFileSync('supabase/.temp/project-ref', 'utf8').trim())
const outRoot = arg('out', 'C:/dev/backups')
const copyTo = arg('copy-to')
const keep = Number(arg('keep', '30'))
const pgBin = process.env.PG_BIN ?? 'C:/dev/tools/pgsql/bin'
const token = process.env.SUPABASE_ACCESS_TOKEN || (process.platform === 'win32'
  ? execSync(`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')"`).toString().trim() : '')
if (!token) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN')

const api = async (path, init = {}) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  if (!r.ok) throw new Error(`API ${path}: ${r.status} ${await r.text()}`)
  return r.json()
}
const sql = (query) => api('/database/query', { method: 'POST', body: JSON.stringify({ query }) })

const stamp = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-') // giờ VN
const dir = join(outRoot, `${ref}-${stamp}`)
mkdirSync(join(dir, 'storage'), { recursive: true })
const log = (...a) => console.log(new Date().toLocaleTimeString('vi-VN'), ...a)

// ---------------------------------------------------------------- 1. Cơ sở dữ liệu
log('CSDL: xin tài khoản đăng nhập tạm thời (5 phút)…')
const role = await api('/cli/login-role', { method: 'POST', body: JSON.stringify({ read_only: false }) }) // cần đọc schema auth (tài khoản đăng nhập); pg_dump chỉ đọc
const host = new URL(readFileSync('supabase/.temp/pooler-url', 'utf8').trim()).hostname
const env = { ...process.env, PGPASSWORD: role.password, PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '20' }
const conn = ['-h', host, '-p', '5432', '-U', `${role.role}.${ref}`, '-d', 'postgres']
// Toàn bộ dữ liệu app nằm ở schema public. Lịch cron và kho file tạo lại bằng migration; file kho tải riêng ở bước 2.
log('CSDL: pg_dump schema public…')
// Tài khoản tạm của CLI phải chuyển sang vai trò postgres mới đọc được bảng (Supabase CLI cũng làm vậy)
execFileSync(join(pgBin, 'pg_dump'), [...conn, '--role=postgres', '-Fc', '--no-owner', '--no-privileges', '-n', 'public', '-f', join(dir, 'db.dump')],
  { env, stdio: 'inherit' })
const dumpSize = statSync(join(dir, 'db.dump')).size
if (dumpSize < 10_000) throw new Error(`db.dump quá nhỏ (${dumpSize} byte) — sao lưu lỗi`)

// Tài khoản đăng nhập (schema auth): tài khoản tạm không được đọc → xuất qua Management API (giữ nguyên mật khẩu đã băm,
// email/SĐT đã xác minh). Phiên đăng nhập, refresh token không cần: người dùng đăng nhập lại sau khi khôi phục.
log('CSDL: tài khoản đăng nhập (auth.users, auth.identities)…')
const auth = await sql(`select json_build_object(
  'users', (select coalesce(json_agg(u), '[]') from auth.users u),
  'identities', (select coalesce(json_agg(i), '[]') from auth.identities i)) as a`)
writeFileSync(join(dir, 'auth.json'), JSON.stringify(auth[0].a))
log(`CSDL: ${auth[0].a.users.length} tài khoản đăng nhập`)

// Số dòng từng bảng tại thời điểm sao lưu (để kiểm tra sau khi khôi phục)
const counts = await sql(`select json_object_agg(schemaname || '.' || relname, n) as c from (
  select schemaname, relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', schemaname, relname), false, true, '')))[1]::text::bigint as n
  from pg_stat_user_tables where schemaname in ('public', 'auth', 'storage') order by 1, 2) t`)
writeFileSync(join(dir, 'counts.json'), JSON.stringify(counts[0].c, null, 2))
log(`CSDL: xong, ${(dumpSize / 1024).toFixed(0)} KB`)

// ---------------------------------------------------------------- 2. File trong kho (Storage)
const keys = await api('/api-keys?reveal=true')
const svc = keys.find((k) => k.name === 'service_role').api_key
const base = `https://${ref}.supabase.co/storage/v1`
const H = { Authorization: `Bearer ${svc}`, apikey: svc }
const buckets = await (await fetch(`${base}/bucket`, { headers: H })).json()
let files = 0, bytes = 0
async function walk(bucket, prefix) {
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${base}/object/list/${bucket}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }) })
    const items = await r.json()
    for (const it of items) {
      const path = prefix ? `${prefix}/${it.name}` : it.name
      if (it.id === null) { await walk(bucket, path); continue } // thư mục
      const target = join(dir, 'storage', bucket, ...path.split('/'))
      mkdirSync(dirname(target), { recursive: true })
      const f = await fetch(`${base}/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: H })
      if (!f.ok) throw new Error(`Không tải được ${bucket}/${path}: ${f.status}`)
      await pipeline(Readable.fromWeb(f.body), createWriteStream(target))
      files++; bytes += statSync(target).size
    }
    if (items.length < 1000) break
  }
}
for (const b of buckets) { log(`Kho: ${b.name}…`); await walk(b.name, '') }
log(`Kho: xong, ${files} file, ${(bytes / 1048576).toFixed(1)} MB`)

// ---------------------------------------------------------------- 3. Ghi chú, nén, chép, dọn bản cũ
writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
  project_ref: ref, created_at: new Date().toISOString(), pg_dump: execFileSync(join(pgBin, 'pg_dump'), ['--version']).toString().trim(),
  db_dump_bytes: dumpSize, storage_files: files, storage_bytes: bytes, buckets: buckets.map((b) => b.name),
  restore: 'Xem docs/van-hanh/sao-luu-khoi-phuc.md',
}, null, 2))
const zip = `${dir}.zip`
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${dir}\\*' -DestinationPath '${zip}' -Force"`)
rmSync(dir, { recursive: true, force: true })
log(`Đã tạo ${zip} (${(statSync(zip).size / 1048576).toFixed(1)} MB)`)

const prune = (folder) => {
  const zips = readdirSync(folder).filter((f) => f.startsWith(`${ref}-`) && f.endsWith('.zip')).sort()
  for (const f of zips.slice(0, Math.max(0, zips.length - keep))) rmSync(join(folder, f))
}
prune(outRoot)
if (copyTo) {
  mkdirSync(copyTo, { recursive: true })
  copyFileSync(zip, join(copyTo, zip.split(/[\\/]/).pop()))
  prune(copyTo)
  log(`Đã chép sang ${copyTo}`)
}
if (!existsSync(zip)) process.exit(1)
