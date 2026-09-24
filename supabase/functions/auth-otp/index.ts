// Edge Function: OTP cho đăng ký, quên mật khẩu, thêm SĐT, xác minh email (F1).
//
// Quy tắc (F1):
//   - Số Việt Nam (+84): gửi Zalo trước, thất bại thì tự gửi SMS.
//   - Số nước ngoài: gửi mã qua email; SĐT vẫn lưu nhưng chưa xác minh.
//   - Giới hạn lấy từ app_settings (R13): hạn mã, số lần nhập sai, gửi lại sau, số mã/SĐT/ngày, số mã/IP/ngày.
//   - Mỗi lần gửi ghi otp_logs kèm chi phí ước tính. Mã chỉ lưu dạng băm.
//
// Hành động:
//   send     { purpose, phone?, email?, lang }        → { otp_id, channel, masked, resend_after, expires_in, mock }
//   verify   { otp_id, code }                         → { ticket }
//   complete { ticket, password?, full_name?, email?, lang? } → { ok, login }
//   set_foreign_phone { phone } (đã đăng nhập)          → lưu SĐT nước ngoài chưa xác minh

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
import { sendEmailOtp, sendSmsOtp, sendZaloOtp, type Lang, type SendResult } from '../_shared/messaging.ts'

type Purpose = 'signup' | 'reset_password' | 'add_phone' | 'verify_email'
const PURPOSES: Purpose[] = ['signup', 'reset_password', 'add_phone', 'verify_email']
const E164 = /^\+[1-9]\d{6,14}$/
const VN = /^\+84\d{9,10}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const TICKET_MINUTES = 15

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
    if (b < 250) out += String(b % 10) // bỏ 250–255 để phân bố đều
  }
  return out
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const pepper = () => Deno.env.get('OTP_PEPPER') ?? serviceKey
const codeHash = (otpId: string, code: string) => sha256(`${otpId}:${code}:${pepper()}`)
const ticketHash = (ticket: string) => sha256(`ticket:${ticket}:${pepper()}`)

function mask(target: string) {
  if (target.includes('@')) {
    const [u, d] = target.split('@')
    return `${u.slice(0, 2)}***@${d}`
  }
  return `${target.slice(0, 4)}****${target.slice(-3)}`
}

async function settings(db: SupabaseClient) {
  const { data } = await db.from('app_settings').select('key, value').in('key', [
    'otp.code_ttl_seconds', 'otp.max_attempts_per_code', 'otp.resend_after_seconds',
    'otp.max_per_target_per_day', 'otp.max_per_ip_per_day', 'password.min_length', 'messaging.unit_price_vnd',
  ])
  const m = new Map((data ?? []).map((r) => [r.key, r.value]))
  const num = (k: string, d: number) => (typeof m.get(k) === 'number' ? (m.get(k) as number) : d)
  const prices = (m.get('messaging.unit_price_vnd') ?? {}) as Record<string, number | null>
  return {
    ttl: num('otp.code_ttl_seconds', 300),
    maxAttempts: num('otp.max_attempts_per_code', 5),
    resendAfter: num('otp.resend_after_seconds', 60),
    maxPerTarget: num('otp.max_per_target_per_day', 5),
    maxPerIp: num('otp.max_per_ip_per_day', 20),
    minPassword: num('password.min_length', 8),
    price: (channel: string) => (channel === 'zalo' ? prices.zalo_otp : channel === 'sms' ? prices.sms : prices.email) ?? 0,
  }
}

async function callerUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth || auth === `Bearer ${anonKey}`) return null
  const c = createClient(url, anonKey, { global: { headers: { Authorization: auth } } })
  const { data } = await c.auth.getUser()
  return data.user?.id ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  const lang: Lang = body.lang === 'en' ? 'en' : 'vi'

  try {
    switch (body.action) {
      case 'send':
        return await handleSend(db, req, body, ip, lang)
      case 'verify':
        return await handleVerify(db, body)
      case 'complete':
        return await handleComplete(db, req, body, lang)
      case 'set_foreign_phone':
        return await handleForeignPhone(db, req, body)
      default:
        return json({ error: 'unknown_action' }, 400)
    }
  } catch (e) {
    console.error(e)
    return json({ error: 'server_error' }, 500)
  }
})

async function handleSend(db: SupabaseClient, req: Request, body: Record<string, unknown>, ip: string | null, lang: Lang) {
  const purpose = body.purpose as Purpose
  if (!PURPOSES.includes(purpose)) return json({ error: 'invalid_purpose' }, 400)
  const phone = body.phone ? String(body.phone).trim() : ''
  const email = body.email ? String(body.email).trim().toLowerCase() : ''
  if (phone && !E164.test(phone)) return json({ error: 'invalid_phone' }, 400)
  if (email && !EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400)

  let target = ''
  let channel: 'zalo' | 'email' = 'email'
  let userId: string | null = null
  const meta: Record<string, unknown> = { lang }

  if (purpose === 'signup') {
    if (!phone) return json({ error: 'phone_required' }, 400)
    const { data: existingPhone } = await db.rpc('auth_user_id_by_phone', { p_phone: phone })
    if (existingPhone) return json({ error: 'phone_exists' }, 409)
    if (VN.test(phone)) {
      target = phone
      channel = 'zalo'
    } else {
      // Số nước ngoài: mã gửi qua email (F1 bước 2)
      if (!email) return json({ error: 'email_required_for_foreign' }, 400)
      const { data: existingEmail } = await db.rpc('auth_user_id_by_email', { p_email: email })
      if (existingEmail) return json({ error: 'email_exists' }, 409)
      target = email
      meta.phone = phone
    }
  } else if (purpose === 'reset_password') {
    if (phone) {
      const { data: uid } = await db.rpc('auth_user_id_by_phone', { p_phone: phone })
      if (!uid) return json({ error: 'account_not_found' }, 404)
      userId = uid
      const { data: u } = await db.auth.admin.getUserById(uid)
      if (VN.test(phone) && u.user?.phone_confirmed_at) {
        target = phone
        channel = 'zalo'
      } else if (u.user?.email && u.user.email_confirmed_at) {
        // Số nước ngoài (chưa xác minh) → gửi về email đã xác minh
        target = u.user.email
      } else {
        return json({ error: 'no_verified_channel' }, 400)
      }
    } else if (email) {
      const { data: uid } = await db.rpc('auth_user_id_by_email', { p_email: email })
      if (!uid) return json({ error: 'account_not_found' }, 404)
      userId = uid
      target = email
    } else {
      return json({ error: 'phone_or_email_required' }, 400)
    }
  } else if (purpose === 'add_phone') {
    userId = await callerUserId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)
    if (!phone || !VN.test(phone)) return json({ error: 'vn_phone_required' }, 400)
    const { data: owner } = await db.rpc('auth_user_id_by_phone', { p_phone: phone })
    if (owner && owner !== userId) return json({ error: 'phone_exists' }, 409)
    target = phone
    channel = 'zalo'
  } else if (purpose === 'verify_email') {
    userId = await callerUserId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)
    if (!email) return json({ error: 'email_required' }, 400)
    const { data: owner } = await db.rpc('auth_user_id_by_email', { p_email: email })
    if (owner && owner !== userId) return json({ error: 'email_exists' }, 409)
    target = email
  }

  const s = await settings(db)
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()

  // Gửi lại sau N giây
  const { data: last } = await db.from('otp_logs').select('created_at').eq('target', target).eq('purpose', purpose)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (last) {
    const wait = s.resendAfter - Math.floor((Date.now() - Date.parse(last.created_at)) / 1000)
    if (wait > 0) return json({ error: 'resend_too_soon', retry_after: wait }, 429)
  }
  const { count: perTarget } = await db.from('otp_logs').select('id', { count: 'exact', head: true })
    .eq('target', target).gte('created_at', dayAgo)
  if ((perTarget ?? 0) >= s.maxPerTarget) return json({ error: 'too_many_for_target' }, 429)
  if (ip) {
    const { count: perIp } = await db.from('otp_logs').select('id', { count: 'exact', head: true })
      .eq('ip', ip).gte('created_at', dayAgo)
    if ((perIp ?? 0) >= s.maxPerIp) return json({ error: 'too_many_for_ip' }, 429)
  }

  const code = randomDigits(6)
  const otpId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + s.ttl * 1000).toISOString()

  // Gửi: VN → Zalo, lỗi thì SMS; còn lại → email
  let result: SendResult
  let finalChannel: 'zalo' | 'sms' | 'email' = channel
  let fallbackFrom: string | null = null
  if (channel === 'zalo') {
    result = await sendZaloOtp(target, code)
    if (!result.ok) {
      fallbackFrom = `zalo:${result.error}`
      finalChannel = 'sms'
      result = await sendSmsOtp(target, code)
    }
  } else {
    result = await sendEmailOtp(target, code, lang, Math.round(s.ttl / 60))
  }

  await db.from('otp_logs').insert({
    id: otpId,
    target,
    channel: finalChannel,
    purpose,
    status: result.ok ? 'sent' : 'failed',
    provider: result.provider,
    provider_message_id: result.providerMessageId ?? null,
    fallback_from: fallbackFrom,
    error: result.ok ? null : result.error,
    cost_vnd: result.ok ? s.price(finalChannel) : 0,
    ip,
    code_hash: await codeHash(otpId, code),
    debug_code: result.mock ? code : null,
    expires_at: expiresAt,
    user_id: userId,
    meta,
  })

  if (!result.ok) return json({ error: 'send_failed' }, 502)
  return json({
    otp_id: otpId,
    channel: finalChannel,
    masked: mask(target),
    resend_after: s.resendAfter,
    expires_in: s.ttl,
    mock: Boolean(result.mock),
  })
}

async function handleVerify(db: SupabaseClient, body: Record<string, unknown>) {
  const otpId = String(body.otp_id ?? '')
  const code = String(body.code ?? '').replace(/\D/g, '')
  const { data: row } = await db.from('otp_logs').select('*').eq('id', otpId).maybeSingle()
  if (!row) return json({ error: 'otp_not_found' }, 404)
  if (row.status === 'locked') return json({ error: 'otp_locked' }, 400)
  if (row.status !== 'sent') return json({ error: 'otp_used' }, 400)
  if (Date.parse(row.expires_at) < Date.now()) {
    await db.from('otp_logs').update({ status: 'expired' }).eq('id', otpId)
    return json({ error: 'otp_expired' }, 400)
  }
  const s = await settings(db)
  if ((await codeHash(otpId, code)) !== row.code_hash) {
    const attempts = row.attempts + 1
    const locked = attempts >= s.maxAttempts
    await db.from('otp_logs').update({ attempts, status: locked ? 'locked' : 'sent' }).eq('id', otpId)
    return json({ error: locked ? 'otp_locked' : 'otp_wrong', attempts_left: Math.max(0, s.maxAttempts - attempts) }, 400)
  }
  const ticket = randomToken()
  await db.from('otp_logs').update({
    status: 'verified',
    verified_at: new Date().toISOString(),
    ticket_hash: await ticketHash(ticket),
    ticket_expires_at: new Date(Date.now() + TICKET_MINUTES * 60_000).toISOString(),
    attempts: row.attempts + 1,
  }).eq('id', otpId)
  return json({ ticket, purpose: row.purpose })
}

/** Nối tài khoản với người giám hộ: dùng dòng có sẵn (nhập từ danh sách trường) nếu trùng SĐT/email đã xác minh. */
async function attachGuardian(db: SupabaseClient, userId: string, opts: { verifiedPhone?: string; verifiedEmail?: string; fullName?: string; phone?: string; email?: string }) {
  const { data: mine } = await db.from('guardians').select('id').eq('user_id', userId).is('deleted_at', null).maybeSingle()
  let existing: { id: string } | null = null
  if (!mine && opts.verifiedPhone) {
    const { data } = await db.from('guardians').select('id').eq('phone', opts.verifiedPhone).is('user_id', null).is('deleted_at', null)
      .order('created_at').limit(1).maybeSingle()
    existing = data
  }
  if (!mine && !existing && opts.verifiedEmail) {
    const { data } = await db.from('guardians').select('id').ilike('email', opts.verifiedEmail).is('user_id', null).is('deleted_at', null)
      .order('created_at').limit(1).maybeSingle()
    existing = data
  }
  const target = mine ?? existing
  if (target) {
    const patch: Record<string, unknown> = { user_id: userId }
    if (opts.fullName) patch.full_name = opts.fullName
    if (opts.phone) patch.phone = opts.phone
    if (opts.email) patch.email = opts.email
    await db.from('guardians').update(patch).eq('id', target.id)
    return target.id
  }
  const { data } = await db.from('guardians').insert({
    user_id: userId, full_name: opts.fullName ?? null, phone: opts.phone ?? null, email: opts.email ?? null,
  }).select('id').single()
  return data?.id
}

async function handleComplete(db: SupabaseClient, req: Request, body: Record<string, unknown>, lang: Lang) {
  const ticket = String(body.ticket ?? '')
  const { data: row } = await db.from('otp_logs').select('*').eq('ticket_hash', await ticketHash(ticket)).maybeSingle()
  if (!row || row.status !== 'verified' || row.used_at) return json({ error: 'ticket_invalid' }, 400)
  if (Date.parse(row.ticket_expires_at) < Date.now()) return json({ error: 'ticket_expired' }, 400)
  const s = await settings(db)
  const password = body.password ? String(body.password) : ''
  const markUsed = () => db.from('otp_logs').update({ status: 'used', used_at: new Date().toISOString() }).eq('id', row.id)

  if (row.purpose === 'signup') {
    const fullName = String(body.full_name ?? '').trim()
    if (!fullName) return json({ error: 'missing_name' }, 400)
    if (password.length < s.minPassword) return json({ error: 'password_too_short', min: s.minPassword }, 400)
    const isForeign = row.channel === 'email'
    const phone = isForeign ? String(row.meta?.phone ?? '') : row.target
    const email = isForeign ? row.target : (body.email ? String(body.email).trim().toLowerCase() : '')
    if (email && !EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400)
    if (email) {
      const { data: owner } = await db.rpc('auth_user_id_by_email', { p_email: email })
      if (owner) return json({ error: 'email_exists' }, 409)
    }
    const { data: phoneOwner } = await db.rpc('auth_user_id_by_phone', { p_phone: phone })
    if (phoneOwner) return json({ error: 'phone_exists' }, 409)

    const { data: created, error } = await db.auth.admin.createUser({
      phone,
      phone_confirm: !isForeign,
      email: email || undefined,
      email_confirm: isForeign, // email của số nước ngoài đã xác minh bằng OTP
      password,
      user_metadata: { full_name: fullName, preferred_language: body.lang === 'en' ? 'en' : lang },
    })
    if (error || !created.user) return json({ error: 'create_failed', message: error?.message }, 400)
    const userId = created.user.id
    await attachGuardian(db, userId, {
      verifiedPhone: isForeign ? undefined : phone,
      verifiedEmail: isForeign ? email : undefined,
      fullName, phone, email: email || undefined,
    })
    await markUsed()
    await db.from('otp_logs').update({ user_id: userId }).eq('id', row.id)
    return json({ ok: true, login: isForeign ? { email } : { phone } })
  }

  if (row.purpose === 'reset_password') {
    if (password.length < s.minPassword) return json({ error: 'password_too_short', min: s.minPassword }, 400)
    const { error } = await db.auth.admin.updateUserById(row.user_id, { password })
    if (error) return json({ error: 'update_failed', message: error.message }, 400)
    await markUsed()
    const { data: u } = await db.auth.admin.getUserById(row.user_id)
    const login = u.user?.phone && u.user.phone_confirmed_at ? { phone: `+${u.user.phone}` } : { email: u.user?.email }
    return json({ ok: true, login })
  }

  // Hai mục đích còn lại cần đúng người đang đăng nhập
  const caller = await callerUserId(req)
  if (!caller || caller !== row.user_id) return json({ error: 'unauthorized' }, 401)

  if (row.purpose === 'add_phone') {
    const { error } = await db.auth.admin.updateUserById(caller, { phone: row.target, phone_confirm: true })
    if (error) return json({ error: 'update_failed', message: error.message }, 400)
    const { data: p } = await db.from('profiles').select('full_name, email').eq('user_id', caller).single()
    await attachGuardian(db, caller, { verifiedPhone: row.target, fullName: p?.full_name ?? undefined, phone: row.target })
    await markUsed()
    return json({ ok: true })
  }

  if (row.purpose === 'verify_email') {
    const { error } = await db.auth.admin.updateUserById(caller, { email: row.target, email_confirm: true })
    if (error) return json({ error: 'update_failed', message: error.message }, 400)
    await db.from('guardians').update({ email: row.target }).eq('user_id', caller).is('deleted_at', null)
    await markUsed()
    return json({ ok: true })
  }

  return json({ error: 'ticket_invalid' }, 400)
}

/** SĐT nước ngoài không xác minh được bằng tin nhắn → lưu chưa xác minh (F1 bước 2). */
async function handleForeignPhone(db: SupabaseClient, req: Request, body: Record<string, unknown>) {
  const caller = await callerUserId(req)
  if (!caller) return json({ error: 'unauthorized' }, 401)
  const phone = String(body.phone ?? '').trim()
  if (!E164.test(phone) || VN.test(phone)) return json({ error: 'invalid_phone' }, 400)
  const { data: owner } = await db.rpc('auth_user_id_by_phone', { p_phone: phone })
  if (owner && owner !== caller) return json({ error: 'phone_exists' }, 409)
  const { error } = await db.auth.admin.updateUserById(caller, { phone, phone_confirm: false })
  if (error) return json({ error: 'update_failed', message: error.message }, 400)
  await db.from('guardians').update({ phone }).eq('user_id', caller).is('deleted_at', null)
  return json({ ok: true })
}
