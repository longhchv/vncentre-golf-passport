// Tải tài sản chứng nhận (font, logo, nền mặc định) lên kho riêng tư "certificate-assets" của một dự án Supabase.
// Chạy một lần khi dựng môi trường mới (staging / production):
//   node scripts/upload-cert-assets.mjs --ref <project_ref> [--signature <đường dẫn PNG chữ ký>]
// Chữ ký KHÔNG nằm trong repo; truyền đường dẫn file trên máy, hoặc tải lên sau ở Admin → Chứng nhận → Mẫu.
// Cần biến môi trường SUPABASE_ACCESS_TOKEN (Windows: đặt ở mức User).

import { readFileSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
const ref = arg('ref') ?? readFileSync('supabase/.temp/project-ref', 'utf8').trim()
const signature = arg('signature')
const token = process.env.SUPABASE_ACCESS_TOKEN || (process.platform === 'win32'
  ? execSync(`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')"`).toString().trim()
  : '')
if (!token) {
  console.error('Thiếu SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}

const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })).json()
const svc = keys.find((k) => k.name === 'service_role')?.api_key
if (!svc) {
  console.error('Không lấy được service key của dự án', ref)
  process.exit(1)
}

const dir = 'supabase/assets/certificate'
const files = {
  'assets/logo-vncentre.png': [join(dir, 'logo-vncentre.png'), 'image/png'],
  'assets/ra-vga.pdf': [join(dir, 'ra-vga.pdf'), 'application/pdf'],
  'templates/default/background.jpg': [join(dir, 'background.jpg'), 'image/jpeg'],
}
for (const f of readdirSync(join(dir, 'fonts'))) files[`fonts/${f}`] = [join(dir, 'fonts', f), 'font/ttf']
if (signature) files['signatures/default.png'] = [signature, 'image/png']

let failed = 0
for (const [dest, [src, type]] of Object.entries(files)) {
  const res = await fetch(`https://${ref}.supabase.co/storage/v1/object/certificate-assets/${dest}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${svc}`, apikey: svc, 'Content-Type': type, 'x-upsert': 'true' },
    body: readFileSync(src),
  })
  if (!res.ok) failed++
  console.log(res.ok ? '✓' : '✗', dest, res.ok ? '' : await res.text())
}
if (!signature) console.log('\nChưa tải chữ ký: vào Admin → Chứng nhận → Mẫu → "Tải lên chữ ký khác" cho từng mẫu.')
process.exit(failed ? 1 : 0)
