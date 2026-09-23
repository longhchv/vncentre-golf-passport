// Đặt nội dung email song ngữ cho Supabase Auth (mời nhân viên, đặt lại mật khẩu).
// Chạy: node scripts/auth-email-templates.mjs   (cần SUPABASE_ACCESS_TOKEN)

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  (process.platform === 'win32'
    ? execSync(`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')"`)
        .toString()
        .trim()
    : '')

const style = 'font-family:Arial,sans-serif;color:#080634;max-width:520px;margin:0 auto;padding:24px'
const btn =
  'display:inline-block;background:#B06829;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold'

const layout = (viIntro, button, viNote, enText) => `<div style="${style}">
  <h2 style="margin:0 0 16px">VN Centre Golf Passport</h2>
  <p>Xin chào,</p>
  <p>${viIntro}</p>
  <p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="${btn}">${button}</a></p>
  <p style="color:#555;font-size:14px">${viNote}</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
  <p>Hello,</p>
  <p>${enText}</p>
</div>`

const body = {
  mailer_subjects_invite: 'Lời mời tham gia VN Centre Golf Passport / Invitation',
  mailer_templates_invite_content: layout(
    'Bạn được mời sử dụng <b>VN Centre Golf Passport</b> với vai trò nhân viên. Bấm nút dưới đây để đặt mật khẩu và đăng nhập.',
    'Đặt mật khẩu / Set password',
    'Link chỉ dùng được một lần. Nếu bạn không chờ lời mời này, hãy bỏ qua email.',
    'You have been invited to use <b>VN Centre Golf Passport</b> as a staff member. Use the button above to set your password and sign in. The link can be used once; if you were not expecting it, please ignore this email.',
  ),
  mailer_subjects_recovery: 'Đặt lại mật khẩu VN Centre Golf Passport / Reset your password',
  mailer_templates_recovery_content: layout(
    'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Bấm nút dưới đây để đặt mật khẩu mới.',
    'Đặt lại mật khẩu / Reset password',
    'Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu hiện tại vẫn giữ nguyên.',
    'We received a request to reset your password. Use the button above to choose a new one. If you did not request this, you can ignore this email.',
  ),
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const saved = await res.json()
console.log(res.status, saved.mailer_subjects_invite, '|', saved.mailer_subjects_recovery)
