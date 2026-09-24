// Edge Function: tài khoản học viên — tên đăng nhập + PIN 6 số (F7).
//
// Hành động:
//   login      { username, pin }                    → phiên đăng nhập (không cần đăng nhập trước)
//   suggest    { student_id }                       → gợi ý tên đăng nhập còn trống
//   create     { student_id, username, pin }        → phụ huynh (can_manage) tạo tài khoản; R14 ≥ 8 tuổi
//   set_pin    { student_id, pin }                  → đổi PIN (mở khoá luôn)
//   set_active { student_id, active }               → khoá / mở tài khoản con
//
// Mật khẩu Supabase Auth của học viên = HMAC(STUDENT_PIN_PEPPER, id tài khoản : PIN), chỉ máy chủ biết.
// Vì vậy chỉ đăng nhập được qua hàm này, nơi đếm số lần sai: sai PIN 5 lần → khoá 15 phút (app_settings).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const PIN_RE = /^\d{6}$/
const USERNAME_RE = /^[a-z0-9._]{3,32}$/

async function derivePassword(accountId: string, pin: string) {
  const pepper = Deno.env.get('STUDENT_PIN_PEPPER')
  if (!pepper) throw new Error('missing STUDENT_PIN_PEPPER')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${accountId}:${pin}`))
  return 'S1.' + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const studentEmail = (accountId: string) => `${accountId}@students.vncentre.net`

// PIN quá dễ đoán: 6 số giống nhau hoặc dãy tăng/giảm liên tiếp
function weakPin(pin: string) {
  if (/^(\d)\1{5}$/.test(pin)) return true
  const d = [...pin].map(Number)
  const step = d[1] - d[0]
  return Math.abs(step) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === step)
}

function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const { data: settings } = await db.from('app_settings').select('key, value')
    .in('key', ['student_account.max_pin_failures', 'student_account.pin_lock_minutes'])
  const cfg = new Map((settings ?? []).map((s) => [s.key, Number(s.value)]))
  const maxFailures = cfg.get('student_account.max_pin_failures') || 5
  const lockMinutes = cfg.get('student_account.pin_lock_minutes') || 15

  // ------------------------------------------------------------------ Đăng nhập (chưa có phiên)
  if (body.action === 'login') {
    const username = String(body.username ?? '').trim().toLowerCase()
    const pin = String(body.pin ?? '').trim()
    if (!USERNAME_RE.test(username) || !PIN_RE.test(pin)) return json({ error: 'invalid_credentials' })
    const { data: acc } = await db.from('student_accounts')
      .select('id, user_id, is_active, failed_attempts, locked_until').eq('username', username).maybeSingle()
    // Không cho biết tên đăng nhập có tồn tại hay không
    if (!acc?.user_id) return json({ error: 'invalid_credentials' })
    if (acc.locked_until && Date.parse(acc.locked_until) > Date.now()) return json({ error: 'locked', locked_until: acc.locked_until })
    if (!acc.is_active) return json({ error: 'disabled' })

    const anon = createClient(url, anonKey, { auth: { persistSession: false } })
    const { data: signed, error } = await anon.auth.signInWithPassword({ email: studentEmail(acc.id), password: await derivePassword(acc.id, pin) })
    if (error || !signed.session) {
      const fails = acc.failed_attempts + 1
      if (fails >= maxFailures) {
        const until = new Date(Date.now() + lockMinutes * 60_000).toISOString()
        await db.from('student_accounts').update({ failed_attempts: 0, locked_until: until }).eq('id', acc.id)
        return json({ error: 'locked', locked_until: until })
      }
      await db.from('student_accounts').update({ failed_attempts: fails }).eq('id', acc.id)
      return json({ error: 'invalid_credentials', remaining: maxFailures - fails })
    }
    await db.from('student_accounts').update({ failed_attempts: 0, locked_until: null }).eq('id', acc.id)
    return json({ access_token: signed.session.access_token, refresh_token: signed.session.refresh_token })
  }

  // ------------------------------------------------------------------ Các hành động của phụ huynh
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: u } = await caller.auth.getUser()
  if (!u.user) return json({ error: 'unauthorized' }, 401)
  const studentId = String(body.student_id ?? '')
  const { data: info, error: infoErr } = await caller.rpc('student_account_info', { p_student_id: studentId })
  if (infoErr || !info?.can_manage) return json({ error: 'forbidden' }, 403)

  const audit = (action: string, entityId: string, after: unknown) =>
    db.from('audit_logs').insert({ actor_user_id: u.user!.id, action, entity_type: 'student_accounts', entity_id: entityId, after })

  switch (body.action) {
    case 'suggest': {
      const { data: s } = await db.from('students').select('full_name, date_of_birth').eq('id', studentId).single()
      const words = slug(s!.full_name).split(/\s+/).filter(Boolean)
      const given = words.at(-1) ?? 'hocvien'
      const initials = words.slice(0, -1).map((w) => w[0]).join('')
      const year = s!.date_of_birth ? String(s!.date_of_birth).slice(2, 4) : ''
      const bases = [`${given}${initials}${year}`, `${given}.${initials}`, `${given}${year}`].map((b) => b.slice(0, 28))
      const out: string[] = []
      for (const b of bases) {
        for (let i = 0; i < 20 && out.length < 3; i++) {
          const cand = i === 0 && b.length >= 3 ? b : `${b}${Math.floor(10 + Math.random() * 90)}`
          if (out.includes(cand) || !USERNAME_RE.test(cand)) continue
          const { count } = await db.from('student_accounts').select('id', { count: 'exact', head: true }).eq('username', cand)
          if (!count) { out.push(cand); break }
        }
      }
      return json({ suggestions: out })
    }

    case 'create': {
      const username = String(body.username ?? '').trim().toLowerCase()
      const pin = String(body.pin ?? '')
      if (!PIN_RE.test(pin)) return json({ error: 'invalid_pin' }, 400)
      if (weakPin(pin)) return json({ error: 'weak_pin' }, 400)
      // Kiểm tra quyền, R14, tên đăng nhập bằng chính quyền của phụ huynh
      const { error: checkErr } = await caller.rpc('student_account_check', { p_student_id: studentId, p_username: username })
      if (checkErr) return json({ error: checkErr.message }, 400)

      const { data: guardian } = await db.from('guardians').select('id').eq('user_id', u.user.id).maybeSingle()
      const { data: acc, error: insErr } = await db.from('student_accounts')
        .insert({ student_id: studentId, username, created_by_guardian_id: guardian?.id ?? null }).select('id').single()
      if (insErr) return json({ error: insErr.code === '23505' ? 'username_taken' : insErr.message }, 400)

      const { data: s } = await db.from('students').select('full_name').eq('id', studentId).single()
      const { data: created, error: authErr } = await db.auth.admin.createUser({
        email: studentEmail(acc.id), password: await derivePassword(acc.id, pin), email_confirm: true,
        user_metadata: { full_name: s?.full_name ?? '', is_student: true },
      })
      if (authErr || !created.user) {
        await db.from('student_accounts').delete().eq('id', acc.id)
        return json({ error: authErr?.message ?? 'create_failed' }, 500)
      }
      await db.from('student_accounts').update({ user_id: created.user.id }).eq('id', acc.id)
      await audit('student_account.create', acc.id, { student_id: studentId, username })
      return json({ ok: true, username })
    }

    case 'set_pin': {
      const pin = String(body.pin ?? '')
      if (!PIN_RE.test(pin)) return json({ error: 'invalid_pin' }, 400)
      if (weakPin(pin)) return json({ error: 'weak_pin' }, 400)
      const { data: acc } = await db.from('student_accounts').select('id, user_id').eq('student_id', studentId).maybeSingle()
      if (!acc?.user_id) return json({ error: 'not_found' }, 404)
      const { error } = await db.auth.admin.updateUserById(acc.user_id, { password: await derivePassword(acc.id, pin) })
      if (error) return json({ error: error.message }, 500)
      await db.from('student_accounts').update({ failed_attempts: 0, locked_until: null }).eq('id', acc.id)
      await audit('student_account.set_pin', acc.id, {})
      return json({ ok: true })
    }

    case 'set_active': {
      const active = body.active === true
      const { data: acc } = await db.from('student_accounts').select('id, user_id').eq('student_id', studentId).maybeSingle()
      if (!acc?.user_id) return json({ error: 'not_found' }, 404)
      // Khoá: chặn đăng nhập và làm mất hiệu lực phiên đang mở
      const { error } = await db.auth.admin.updateUserById(acc.user_id, { ban_duration: active ? 'none' : '876000h' })
      if (error) return json({ error: error.message }, 500)
      await db.from('student_accounts').update({ is_active: active, failed_attempts: 0, locked_until: null }).eq('id', acc.id)
      await audit(active ? 'student_account.unlock' : 'student_account.lock', acc.id, {})
      return json({ ok: true })
    }
  }
  return json({ error: 'unknown_action' }, 400)
})
