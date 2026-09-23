// Chạy các file kiểm thử SQL trong supabase/tests trên dự án Supabase đã liên kết (staging).
// Mỗi file là một khối DO kết thúc bằng raise 'ALL_OK' → mọi dữ liệu thử bị huỷ.
// Cần biến môi trường SUPABASE_ACCESS_TOKEN (Windows: đặt ở mức User).
//   npm run test:db

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const PROJECT_REF = readFileSync('supabase/.temp/project-ref', 'utf8').trim()

function token() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  if (process.platform === 'win32') {
    return execSync(
      `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')"`,
    ).toString().trim()
  }
  return ''
}

const accessToken = token()
if (!accessToken) {
  console.error('Thiếu SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}

const dir = 'supabase/tests'
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
let failed = 0

for (const file of files) {
  const sql = readFileSync(join(dir, file), 'utf8')
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (text.includes('ALL_OK')) {
    console.log(`✓ ${file}`)
  } else {
    failed++
    let msg = text
    try {
      msg = JSON.parse(text).message ?? text
    } catch {
      // giữ nguyên nội dung trả về
    }
    console.log(`✗ ${file}\n  ${msg.slice(0, 800)}`)
  }
}

console.log(failed ? `\n${failed}/${files.length} file lỗi` : `\n${files.length} file đạt`)
process.exitCode = failed ? 1 : 0
