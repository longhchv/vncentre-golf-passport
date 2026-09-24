// Edge Function: gửi lời mời kích hoạt tới SĐT/email phụ huynh có trong danh sách trường (F3).
//   { student_ids: uuid[], channel: 'zalo' | 'email', dry_run: boolean }
// dry_run → ước tính số tin, chi phí, số em bỏ qua (F3 bước 6: xác nhận trước khi gửi hàng loạt).
// Gửi thật: tạo invitations (token, hạn N ngày), gửi Zalo (lỗi → email nếu có), ghi otp_logs kèm chi phí.
// Trình duyệt gọi theo từng nhóm ≤ 50 em để không quá thời gian chạy của hàm và giới hạn tốc độ của nhà cung cấp.
//
// Mời người giám hộ thứ hai (F6) — phụ huynh có quyền quản lý gọi:
//   { purpose: 'second_guardian', student_id, target: SĐT VN (+84…) | email, relationship }
// Người được mời vào với can_manage = false (invitation_complete).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
import { brandedEmail, sendEmailHtml, sendZaloInvite, type SendResult } from '../_shared/messaging.ts'

const VN = /^\+84\d{9,10}$/
const MAX_PER_CALL = 50

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: u } = await caller.auth.getUser()
  if (!u.user) return json({ error: 'unauthorized' }, 401)
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))
  if (body.purpose === 'second_guardian') return inviteSecondGuardian(caller, db, u.user, body)

  const { data: isAdmin } = await caller.rpc('is_admin')
  if (!isAdmin) return json({ error: 'forbidden' }, 403)
  const ids: string[] = Array.isArray(body.student_ids) ? body.student_ids.slice(0, MAX_PER_CALL) : []
  const preferred: 'zalo' | 'email' = body.channel === 'email' ? 'email' : 'zalo'
  const dryRun = body.dry_run !== false
  if (!ids.length) return json({ error: 'no_students' }, 400)

  const { data: settings } = await db.from('app_settings').select('key, value')
    .in('key', ['app.public_base_url', 'invitation.expiry_days', 'messaging.unit_price_vnd'])
  const cfg = new Map((settings ?? []).map((s) => [s.key, s.value]))
  const baseUrl = String(cfg.get('app.public_base_url') ?? 'https://app.vncentre.net').replace(/\/+$/, '')
  const days = Number(cfg.get('invitation.expiry_days') ?? 30)
  const prices = (cfg.get('messaging.unit_price_vnd') ?? {}) as Record<string, number | null>
  const price = (ch: string) => (ch === 'zalo' ? prices.zalo_other ?? 0 : 0)

  // Học viên + người giám hộ có liên hệ
  const { data: students } = await db.from('students')
    .select('id, full_name, activated_at, student_guardians(status, deleted_at, guardian:guardians(id, full_name, phone, email, user_id, deleted_at))')
    .in('id', ids).is('deleted_at', null)

  type Target = { studentId: string; studentName: string; guardianId: string; channel: 'zalo' | 'email'; target: string; email: string | null }
  const targets: Target[] = []
  const skipped = { already_active: 0, no_contact: 0 }
  for (const s of students ?? []) {
    const links = (s.student_guardians ?? []).filter((l: { deleted_at: string | null }) => !l.deleted_at)
    // Đã có phụ huynh có tài khoản liên kết → không cần mời
    if (links.some((l: { status: string; guardian: { user_id: string | null } | null }) => l.status === 'active' && l.guardian?.user_id)) {
      skipped.already_active++
      continue
    }
    let any = false
    for (const l of links) {
      const g = l.guardian as { id: string; phone: string | null; email: string | null; user_id: string | null; deleted_at: string | null } | null
      if (!g || g.deleted_at) continue
      if (preferred === 'zalo' && g.phone && VN.test(g.phone)) {
        targets.push({ studentId: s.id, studentName: s.full_name, guardianId: g.id, channel: 'zalo', target: g.phone, email: g.email })
        any = true
      } else if (g.email) {
        targets.push({ studentId: s.id, studentName: s.full_name, guardianId: g.id, channel: 'email', target: g.email.toLowerCase(), email: null })
        any = true
      }
    }
    if (!any) skipped.no_contact++
  }

  const byChannel = { zalo: targets.filter((t) => t.channel === 'zalo').length, email: targets.filter((t) => t.channel === 'email').length }
  const estimate = byChannel.zalo * price('zalo')
  if (dryRun) {
    return json({ recipients: targets.length, by_channel: byChannel, cost_vnd: estimate, unit_price_zalo: price('zalo'), skipped })
  }

  let sent = 0
  let failed = 0
  let cost = 0
  for (const t of targets) {
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('')
    const link = `${baseUrl}/i/${token}`
    const { data: inv } = await db.from('invitations').insert({
      guardian_id: t.guardianId, student_id: t.studentId, channel: t.channel, target: t.target, token,
      purpose: 'activation', invited_by: u.user.id,
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString(), status: 'pending',
    }).select('id').single()

    let channel = t.channel
    let result: SendResult
    let fallbackFrom: string | null = null
    if (t.channel === 'zalo') {
      result = await sendZaloInvite(t.target, t.studentName, link)
      if (!result.ok && t.email) {
        fallbackFrom = `zalo:${result.error}`
        channel = 'email'
        result = await sendInviteEmail(t.email, t.studentName, link)
      }
    } else {
      result = await sendInviteEmail(t.target, t.studentName, link)
    }
    const c = result.ok ? price(channel) : 0
    cost += c
    if (result.ok) sent++
    else failed++
    await db.from('invitations').update({
      status: result.ok ? 'sent' : 'failed', sent_at: new Date().toISOString(), channel,
      target: channel === 'email' && t.channel === 'zalo' ? t.email : t.target,
    }).eq('id', inv!.id)
    await db.from('otp_logs').insert({
      target: channel === 'email' && t.channel === 'zalo' ? t.email : t.target, channel, purpose: 'invite',
      status: result.ok ? 'sent' : 'failed', provider: result.provider, provider_message_id: result.providerMessageId ?? null,
      fallback_from: fallbackFrom, error: result.ok ? null : result.error, cost_vnd: c,
      // Chế độ thử: lưu link để admin bấm thử (Tin nhắn và chi phí)
      debug_code: result.mock ? link : null, meta: { student_id: t.studentId, invitation_id: inv!.id },
    })
    // Tôn trọng giới hạn tốc độ của nhà cung cấp (thật): ~5 tin/giây
    if (!result.mock) await new Promise((r) => setTimeout(r, 200))
  }
  return json({ sent, failed, cost_vnd: cost, skipped })
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// deno-lint-ignore no-explicit-any
async function inviteSecondGuardian(caller: any, db: any, user: { id: string; phone?: string; email?: string }, body: Record<string, unknown>) {
  const studentId = String(body.student_id ?? '')
  const raw = String(body.target ?? '').trim()
  const relationship = ['father', 'mother', 'guardian', 'other'].includes(String(body.relationship)) ? String(body.relationship) : null
  const { data: canManage } = await caller.rpc('can_manage_student', { p_student_id: studentId })
  if (!canManage) return json({ error: 'forbidden' }, 403)

  const isEmail = raw.includes('@')
  const target = isEmail ? raw.toLowerCase() : raw.replace(/[\s.-]/g, '')
  if (isEmail ? !EMAIL_RE.test(target) : !VN.test(target)) return json({ error: 'invalid_target' }, 400)
  const own = [user.email?.toLowerCase(), user.phone ? '+' + user.phone.replace(/^\+/, '') : null]
  if (own.includes(target)) return json({ error: 'self' }, 400)

  const { data: settings } = await db.from('app_settings').select('key, value')
    .in('key', ['app.public_base_url', 'invitation.expiry_days', 'messaging.unit_price_vnd', 'invitation.max_second_guardian_per_day'])
  const cfg = new Map((settings ?? []).map((s: { key: string; value: unknown }) => [s.key, s.value]))
  const maxPerDay = Number(cfg.get('invitation.max_second_guardian_per_day') ?? 5)
  const { count } = await db.from('invitations').select('id', { count: 'exact', head: true })
    .eq('student_id', studentId).eq('purpose', 'second_guardian').gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
  if ((count ?? 0) >= maxPerDay) return json({ error: 'too_many' }, 429)

  const baseUrl = String(cfg.get('app.public_base_url') ?? 'https://app.vncentre.net').replace(/\/+$/, '')
  const days = Number(cfg.get('invitation.expiry_days') ?? 30)
  const prices = (cfg.get('messaging.unit_price_vnd') ?? {}) as Record<string, number | null>
  const { data: s } = await db.from('students').select('full_name').eq('id', studentId).single()
  const { data: me } = await db.from('profiles').select('full_name').eq('user_id', user.id).single()

  const token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('')
  const link = `${baseUrl}/i/${token}`
  const channel = isEmail ? 'email' : 'zalo'
  const { data: inv } = await db.from('invitations').insert({
    student_id: studentId, channel, target, token, purpose: 'second_guardian', relationship, invited_by: user.id,
    expires_at: new Date(Date.now() + days * 86_400_000).toISOString(), status: 'pending',
  }).select('id').single()

  const result: SendResult = isEmail
    ? await sendEmailHtml(target, `Mời cùng theo dõi hồ sơ golf của ${s.full_name} / Golf record invitation`, brandedEmail({
        viTitle: `${me?.full_name ?? 'Phụ huynh'} mời bạn cùng theo dõi hồ sơ golf của ${s.full_name}.`,
        viBody: 'Bấm nút dưới đây, xác thực email này rồi làm theo hướng dẫn. Link dùng một lần.',
        enBody: `${me?.full_name ?? 'A parent'} invited you to follow ${s.full_name}'s golf record at VN Centre. Use the button above and verify this email address. The link can be used once.`,
        button: 'Nhận lời mời / Accept', link,
      }), 'invite')
    : await sendZaloInvite(target, s.full_name, link)
  const cost = result.ok && channel === 'zalo' ? prices.zalo_other ?? 0 : 0
  await db.from('invitations').update({ status: result.ok ? 'sent' : 'failed', sent_at: new Date().toISOString() }).eq('id', inv.id)
  await db.from('otp_logs').insert({
    target, channel, purpose: 'invite', status: result.ok ? 'sent' : 'failed', provider: result.provider,
    provider_message_id: result.providerMessageId ?? null, error: result.ok ? null : result.error, cost_vnd: cost,
    debug_code: result.mock ? link : null, meta: { student_id: studentId, invitation_id: inv.id, second_guardian: true },
  })
  if (!result.ok) return json({ error: channel === 'zalo' ? 'zalo_failed' : 'send_failed' }, 502)
  return json({ ok: true, channel })
}

function sendInviteEmail(to: string, studentName: string, link: string) {
  return sendEmailHtml(
    to,
    `Hồ sơ golf của con ${studentName} đã sẵn sàng / Golf record ready`,
    brandedEmail({
      viTitle: `Chứng nhận và hồ sơ golf của con ${studentName} đã sẵn sàng.`,
      viBody: 'Bấm nút dưới đây để kích hoạt VN Centre Golf Passport, theo dõi level, các khoá đã học và nhận chứng nhận của con. Link dùng một lần.',
      enBody: `${studentName}'s golf certificate and record are ready. Use the button above to activate VN Centre Golf Passport and follow your child's level, courses and certificates. The link can be used once.`,
      button: 'Kích hoạt / Activate',
      link,
    }),
    'invite',
  )
}
