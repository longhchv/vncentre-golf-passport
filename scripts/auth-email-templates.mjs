// Đặt nội dung email của Supabase Auth: tiếng Việt trước, tiếng Anh sau, có logo VN Centre.
//   · Đăng nhập (magic link), xác nhận đăng ký, đổi email, xác thực lại: MÃ OTP 6 SỐ ({{ .Token }}), không có link
//     (spec 12 mục 7c — đăng nhập bằng email OTP, giai đoạn 3).
//   · Mời nhân viên, đặt lại mật khẩu: giữ nút link vì luồng hiện tại đang dùng link.
// Đồng thời đặt độ dài mã 6 số và hạn 10 phút.
// Chạy: node scripts/auth-email-templates.mjs   (cần SUPABASE_ACCESS_TOKEN; --dry-run để chỉ in nội dung, không gửi)

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const dryRun = process.argv.includes('--dry-run')
const LOGO = 'https://app.vncentre.net/logo.png'
const OTP_MINUTES = 10

const style = 'font-family:Arial,sans-serif;color:#080634;max-width:520px;margin:0 auto;padding:24px'
const btn =
  'display:inline-block;background:#B06829;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold'
const head = `<img src="${LOGO}" width="96" height="96" alt="VN Centre Golf Passport" style="display:block;border-radius:16px;margin:0 0 16px">
  <h2 style="margin:0 0 16px">VN Centre Golf Passport</h2>`
const small = 'color:#555;font-size:14px'

/** Email có nút link (mời, đặt lại mật khẩu). */
const linkLayout = (viIntro, button, viNote, enText) => `<div style="${style}">
  ${head}
  <p>Xin chào,</p>
  <p>${viIntro}</p>
  <p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="${btn}">${button}</a></p>
  <p style="${small}">${viNote}</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
  <p>Hello,</p>
  <p>${enText}</p>
</div>`

/** Email mã OTP 6 số. */
const otpLayout = (viIntro, enIntro) => `<div style="${style}">
  ${head}
  <p>Xin chào,</p>
  <p>${viIntro}</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">{{ .Token }}</p>
  <p style="${small}">Mã có hiệu lực trong ${OTP_MINUTES} phút. Không chia sẻ mã này với bất kỳ ai, kể cả người tự nhận là nhân viên VN Centre.
  Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
  <p>Hello,</p>
  <p>${enIntro} <b>{{ .Token }}</b>. It is valid for ${OTP_MINUTES} minutes. Do not share it with anyone. If you did not request it, ignore this email.</p>
</div>`

const body = {
  mailer_otp_length: 6,
  mailer_otp_exp: OTP_MINUTES * 60,

  mailer_subjects_magic_link: '{{ .Token }} là mã đăng nhập VN Centre Golf Passport',
  mailer_templates_magic_link_content: otpLayout('Mã đăng nhập VN Centre Golf Passport của bạn là:', 'Your sign-in code is'),

  mailer_subjects_confirmation: '{{ .Token }} là mã xác nhận đăng ký VN Centre Golf Passport',
  mailer_templates_confirmation_content: otpLayout(
    'Cảm ơn bạn đã đăng ký VN Centre Golf Passport. Mã xác nhận của bạn là:',
    'Thanks for signing up. Your confirmation code is',
  ),

  mailer_subjects_email_change: '{{ .Token }} là mã xác nhận đổi email VN Centre Golf Passport',
  mailer_templates_email_change_content: otpLayout(
    'Bạn đang đổi email đăng nhập VN Centre Golf Passport. Mã xác nhận của bạn là:',
    'You are changing your sign-in email. Your confirmation code is',
  ),

  mailer_subjects_reauthentication: '{{ .Token }} là mã xác thực VN Centre Golf Passport',
  mailer_templates_reauthentication_content: otpLayout('Mã xác thực của bạn là:', 'Your verification code is'),

  mailer_subjects_invite: 'Lời mời tham gia VN Centre Golf Passport / Invitation',
  mailer_templates_invite_content: linkLayout(
    'Bạn được mời sử dụng <b>VN Centre Golf Passport</b> với vai trò nhân viên. Bấm nút dưới đây để đặt mật khẩu và đăng nhập.',
    'Đặt mật khẩu / Set password',
    'Link chỉ dùng được một lần. Nếu bạn không chờ lời mời này, hãy bỏ qua email.',
    'You have been invited to use <b>VN Centre Golf Passport</b> as a staff member. Use the button above to set your password and sign in. The link can be used once; if you were not expecting it, please ignore this email.',
  ),
  mailer_subjects_recovery: 'Đặt lại mật khẩu VN Centre Golf Passport / Reset your password',
  mailer_templates_recovery_content: linkLayout(
    'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Bấm nút dưới đây để đặt mật khẩu mới.',
    'Đặt lại mật khẩu / Reset password',
    'Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu hiện tại vẫn giữ nguyên.',
    'We received a request to reset your password. Use the button above to choose a new one. If you did not request this, you can ignore this email.',
  ),
}

if (dryRun) {
  console.log(JSON.stringify(body, null, 2))
  process.exit(0)
}

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  (process.platform === 'win32'
    ? execSync(`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')"`)
        .toString()
        .trim()
    : '')

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const saved = await res.json()
console.log(res.status, saved.mailer_otp_length, saved.mailer_otp_exp, '|', saved.mailer_subjects_magic_link, '|', saved.mailer_subjects_recovery)
