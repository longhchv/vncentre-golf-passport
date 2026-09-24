// Các "bộ chuyển" gửi tin: Zalo ZNS, SMS, email (Brevo).
// Zalo/SMS chưa có tài khoản (phụ lục D, D7, D8) → chế độ thử (mock) mặc định.
//   ZALO_MODE=live cần ZALO_ACCESS_TOKEN, ZALO_OTP_TEMPLATE_ID (mẫu tin đã được Zalo duyệt)
//   SMS_MODE=live: chưa chọn nhà cung cấp → chưa hỗ trợ
// Chế độ thử: số kết thúc bằng "99" giả lập "không dùng Zalo" để thử chuyển sang SMS (kịch bản nghiệm thu 3).

export interface SendResult {
  ok: boolean
  provider: string
  providerMessageId?: string
  error?: string
  mock?: boolean
}

export type Lang = 'vi' | 'en'

export async function sendZaloOtp(phoneE164: string, code: string): Promise<SendResult> {
  const mode = Deno.env.get('ZALO_MODE') ?? 'mock'
  if (mode !== 'live') {
    if (phoneE164.endsWith('99')) return { ok: false, provider: 'zalo_mock', error: 'mock_not_on_zalo', mock: true }
    return { ok: true, provider: 'zalo_mock', mock: true }
  }
  try {
    const res = await fetch('https://business.openapi.zalo.me/message/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: Deno.env.get('ZALO_ACCESS_TOKEN') ?? '' },
      body: JSON.stringify({
        phone: phoneE164.replace(/^\+/, ''),
        template_id: Deno.env.get('ZALO_OTP_TEMPLATE_ID'),
        template_data: { otp: code },
        tracking_id: crypto.randomUUID(),
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.error === 0) return { ok: true, provider: 'zalo', providerMessageId: body.data?.msg_id }
    return { ok: false, provider: 'zalo', error: `zalo_${body.error ?? res.status}` }
  } catch (e) {
    return { ok: false, provider: 'zalo', error: String(e) }
  }
}

export async function sendSmsOtp(_phoneE164: string, _code: string): Promise<SendResult> {
  const mode = Deno.env.get('SMS_MODE') ?? 'mock'
  if (mode !== 'live') return { ok: true, provider: 'sms_mock', mock: true }
  return { ok: false, provider: 'sms', error: 'sms_provider_not_configured' }
}

const EMAIL_COPY = {
  vi: {
    subject: (code: string) => `${code} là mã xác thực VN Centre Golf Passport`,
    intro: 'Mã xác thực của bạn là:',
    note: 'Mã có hiệu lực trong 5 phút. Không chia sẻ mã này với bất kỳ ai, kể cả người tự nhận là nhân viên VN Centre.',
  },
  en: {
    subject: (code: string) => `${code} is your VN Centre Golf Passport verification code`,
    intro: 'Your verification code is:',
    note: 'The code is valid for 5 minutes. Do not share it with anyone, including people claiming to be VN Centre staff.',
  },
}

export async function sendEmailOtp(email: string, code: string, lang: Lang, ttlMinutes: number): Promise<SendResult> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  if (!apiKey) return { ok: false, provider: 'brevo', error: 'missing_BREVO_API_KEY' }
  const c = EMAIL_COPY[lang]
  const note = c.note.replace('5', String(ttlMinutes))
  const html = `<div style="font-family:Arial,sans-serif;color:#080634;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 16px">VN Centre Golf Passport</h2>
  <p>${c.intro}</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">${code}</p>
  <p style="color:#555;font-size:14px">${note}</p>
</div>`
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: 'VN Centre Golf Passport', email: Deno.env.get('EMAIL_FROM') ?? 'no-reply@vncentre.net' },
        to: [{ email }],
        subject: c.subject(code),
        htmlContent: html,
        tags: ['otp'],
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, provider: 'brevo', providerMessageId: body.messageId }
    return { ok: false, provider: 'brevo', error: `brevo_${res.status}_${body.code ?? ''}` }
  } catch (e) {
    return { ok: false, provider: 'brevo', error: String(e) }
  }
}

/** Tin mời kích hoạt qua Zalo ZNS (mẫu tin phải được Zalo duyệt trước — F17). */
export async function sendZaloInvite(phoneE164: string, studentName: string, link: string): Promise<SendResult> {
  const mode = Deno.env.get('ZALO_MODE') ?? 'mock'
  if (mode !== 'live') {
    if (phoneE164.endsWith('99')) return { ok: false, provider: 'zalo_mock', error: 'mock_not_on_zalo', mock: true }
    return { ok: true, provider: 'zalo_mock', mock: true }
  }
  try {
    const res = await fetch('https://business.openapi.zalo.me/message/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: Deno.env.get('ZALO_ACCESS_TOKEN') ?? '' },
      body: JSON.stringify({
        phone: phoneE164.replace(/^\+/, ''),
        template_id: Deno.env.get('ZALO_INVITE_TEMPLATE_ID'),
        template_data: { student_name: studentName, link },
        tracking_id: crypto.randomUUID(),
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.error === 0) return { ok: true, provider: 'zalo', providerMessageId: body.data?.msg_id }
    return { ok: false, provider: 'zalo', error: `zalo_${body.error ?? res.status}` }
  } catch (e) {
    return { ok: false, provider: 'zalo', error: String(e) }
  }
}

/** Email HTML qua Brevo (thông báo, lời mời). */
export async function sendEmailHtml(to: string, subject: string, html: string, tag: string): Promise<SendResult> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  if (!apiKey) return { ok: false, provider: 'brevo', error: 'missing_BREVO_API_KEY' }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: 'VN Centre Golf Passport', email: Deno.env.get('EMAIL_FROM') ?? 'no-reply@vncentre.net' },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        tags: [tag],
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, provider: 'brevo', providerMessageId: body.messageId }
    return { ok: false, provider: 'brevo', error: `brevo_${res.status}_${body.code ?? ''}` }
  } catch (e) {
    return { ok: false, provider: 'brevo', error: String(e) }
  }
}

/** Khung email thương hiệu, nội dung song ngữ, một nút bấm. */
export function brandedEmail(opts: { viTitle: string; viBody: string; enBody: string; button: string; link: string }) {
  const btn = 'display:inline-block;background:#B06829;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold'
  return `<div style="font-family:Arial,sans-serif;color:#080634;max-width:520px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 16px">VN Centre Golf Passport</h2>
  <p style="font-size:17px;font-weight:bold">${opts.viTitle}</p>
  <p>${opts.viBody}</p>
  <p style="margin:24px 0"><a href="${opts.link}" style="${btn}">${opts.button}</a></p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
  <p>${opts.enBody}</p>
  <p style="color:#777;font-size:12px">${opts.link}</p>
</div>`
}
