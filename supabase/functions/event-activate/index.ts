// Edge Function: kích hoạt tài khoản từ thẻ Trải nghiệm sự kiện (module 10, E6) — xác thực qua EMAIL (ngoại lệ tạm
// thời, chưa dùng OTP Zalo/SMS). Không cần đăng nhập.
//
//   send_code          { code, phone, email, lang }  → kiểm tra SĐT đã ghi khi nhận thẻ (E-R3), gửi mã 6 số qua email
//   verify_and_create  { otp_id, code_digits, password, full_name?, contact_consent, photo_consent }
//                      → tạo tài khoản (email đã xác minh, SĐT chưa xác minh), nối thẻ (và các thẻ cùng SĐT), trả phiên đăng nhập
// Email đã có tài khoản → { error: 'email_has_account' }: người dùng đăng nhập rồi nối thẻ (hàm event_link_card_to_me).
// Giới hạn mã lấy từ app_settings như F1 (hạn mã, số lần sai, gửi lại sau, số mã/email/ngày, số mã/IP/ngày).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
import { sendEmailOtp, type Lang } from '../_shared/messaging.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function randomDigits(n: number) {
  let out = ''
  while (out.length < n) {
    const b = crypto.getRandomValues(new Uint8Array(1))[0]
    if (b < 250) out += String(b % 10)
  }
  return out
}
const pepper = () => Deno.env.get('OTP_PEPPER') ?? serviceKey
const codeHash = (otpId: string, code: string) => sha256(`${otpId}:${code}:${pepper()}`)
const mask = (email: string) => { const [u, d] = email.split('@'); return `${u.slice(0, 2)}***@${d}` }

async function settings(db: SupabaseClient) {
  const { data } = await db.from('app_settings').select('key, value').in('key', [
    'otp.code_ttl_seconds', 'otp.max_attempts_per_code', 'otp.resend_after_seconds', 'otp.max_per_target_per_day', 'otp.max_per_ip_per_day', 'password.min_length',
  ])
  const m = new Map((data ?? []).map((r) => [r.key, r.value]))
  const num = (k: string, d: number) => (typeof m.get(k) === 'number' ? (m.get(k) as number) : d)
  return { ttl: num('otp.code_ttl_seconds', 300), maxAttempts: num('otp.max_attempts_per_code', 5), resendAfter: num('otp.resend_after_seconds', 60),
    maxPerTarget: num('otp.max_per_target_per_day', 5), maxPerIp: num('otp.max_per_ip_per_day', 20), minPassword: num('password.min_length', 8) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  try {
    if (body.action === 'send_code') return await sendCode(db, body, ip)
    if (body.action === 'verify_and_create') return await verifyAndCreate(db, body)
    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: 'server_error' }, 500)
  }
})

async function phoneCheck(db: SupabaseClient, code: string, phone: string) {
  const { data, error } = await db.rpc('event_phone_check', { p_code: code, p_phone: phone })
  if (error) throw error
  return data as { result: string; completed?: boolean; remaining?: number }
}

async function sendCode(db: SupabaseClient, body: Record<string, unknown>, ip: string | null) {
  const code = String(body.code ?? '')
  const phone = String(body.phone ?? '')
  const email = String(body.email ?? '').trim().toLowerCase()
  const lang: Lang = body.lang === 'en' ? 'en' : 'vi'
  const check = await phoneCheck(db, code, phone)
  if (check.result !== 'ok') return json({ error: `phone_${check.result}`, remaining: check.remaining }, 400)
  if (!check.completed) return json({ error: 'not_completed' }, 400)
  if (!EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400)
  const { data: existing } = await db.rpc('auth_user_id_by_email', { p_email: email })
  if (existing) return json({ error: 'email_has_account' }, 409)

  const s = await settings(db)
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const { data: last } = await db.from('otp_logs').select('created_at').eq('target', email).eq('purpose', 'event_activate')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (last) {
    const wait = s.resendAfter - Math.floor((Date.now() - Date.parse(last.created_at)) / 1000)
    if (wait > 0) return json({ error: 'resend_too_soon', retry_after: wait }, 429)
  }
  const { count: perTarget } = await db.from('otp_logs').select('id', { count: 'exact', head: true }).eq('target', email).gte('created_at', dayAgo)
  if ((perTarget ?? 0) >= s.maxPerTarget) return json({ error: 'too_many_for_target' }, 429)
  if (ip) {
    const { count: perIp } = await db.from('otp_logs').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', dayAgo)
    if ((perIp ?? 0) >= s.maxPerIp) return json({ error: 'too_many_for_ip' }, 429)
  }

  const digits = randomDigits(6)
  const otpId = crypto.randomUUID()
  const result = await sendEmailOtp(email, digits, lang, Math.round(s.ttl / 60))
  await db.from('otp_logs').insert({
    id: otpId, target: email, channel: 'email', purpose: 'event_activate', status: result.ok ? 'sent' : 'failed',
    provider: result.provider, provider_message_id: result.providerMessageId ?? null, error: result.ok ? null : result.error, cost_vnd: 0,
    ip, code_hash: await codeHash(otpId, digits), debug_code: result.mock ? digits : null,
    expires_at: new Date(Date.now() + s.ttl * 1000).toISOString(), meta: { card: code, phone, lang },
  })
  // Brevo gói miễn phí: 300 email/ngày — hết hạn mức thì gửi lỗi
  if (!result.ok) return json({ error: 'send_failed' }, 502)
  return json({ otp_id: otpId, masked: mask(email), resend_after: s.resendAfter, expires_in: s.ttl })
}

async function verifyAndCreate(db: SupabaseClient, body: Record<string, unknown>) {
  const otpId = String(body.otp_id ?? '')
  const digits = String(body.code_digits ?? '').replace(/\D/g, '')
  const password = String(body.password ?? '')
  const s = await settings(db)
  const { data: row } = await db.from('otp_logs').select('*').eq('id', otpId).eq('purpose', 'event_activate').maybeSingle()
  if (!row) return json({ error: 'otp_not_found' }, 404)
  if (row.status === 'locked') return json({ error: 'otp_locked' }, 400)
  if (row.status !== 'sent') return json({ error: 'otp_used' }, 400)
  if (Date.parse(row.expires_at) < Date.now()) {
    await db.from('otp_logs').update({ status: 'expired' }).eq('id', otpId)
    return json({ error: 'otp_expired' }, 400)
  }
  if (password.length < s.minPassword) return json({ error: 'password_too_short', min: s.minPassword }, 400)
  if ((await codeHash(otpId, digits)) !== row.code_hash) {
    const attempts = row.attempts + 1
    const locked = attempts >= s.maxAttempts
    await db.from('otp_logs').update({ attempts, status: locked ? 'locked' : 'sent' }).eq('id', otpId)
    return json({ error: locked ? 'otp_locked' : 'otp_wrong', attempts_left: Math.max(0, s.maxAttempts - attempts) }, 400)
  }

  const email = row.target as string
  const card = String(row.meta?.card ?? '')
  const phone = String(row.meta?.phone ?? '')
  // Kiểm tra lại SĐT và hoàn thành ngay trước khi tạo tài khoản
  const check = await phoneCheck(db, card, phone)
  if (check.result !== 'ok') return json({ error: `phone_${check.result}` }, 400)
  const { data: existing } = await db.rpc('auth_user_id_by_email', { p_email: email })
  if (existing) return json({ error: 'email_has_account' }, 409)

  const fullName = String(body.full_name ?? '').trim()
  const { data: created, error: ce } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName || null, preferred_language: row.meta?.lang ?? 'vi' },
  })
  if (ce || !created.user) return json({ error: 'create_failed', message: ce?.message }, 400)
  const userId = created.user.id
  const { error: le } = await db.rpc('event_link_to_user', {
    p_code: card, p_user_id: userId,
    p_data: { full_name: fullName || null, phone, contact_consent: body.contact_consent === true, photo_consent: body.photo_consent === true },
  })
  if (le) {
    await db.auth.admin.deleteUser(userId)
    return json({ error: le.message }, 400)
  }
  // Tên hiển thị của tài khoản: tên nhập vào, hoặc tên người chơi khi "Tôi chơi"
  if (!fullName) {
    const { data: g } = await db.from('guardians').select('full_name').eq('user_id', userId).maybeSingle()
    if (g?.full_name) await db.from('profiles').update({ full_name: g.full_name }).eq('user_id', userId)
  }
  await db.from('otp_logs').update({ status: 'used', verified_at: new Date().toISOString(), used_at: new Date().toISOString(), user_id: userId,
    attempts: row.attempts + 1 }).eq('id', otpId)

  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: signed } = await anon.auth.signInWithPassword({ email, password })
  return json({ ok: true, access_token: signed.session?.access_token, refresh_token: signed.session?.refresh_token })
}
