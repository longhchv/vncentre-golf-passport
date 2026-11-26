// Edge Function: gửi thông báo đẩy (Web Push) của app Handicap (hdcp.vncentre.net) về điện thoại / máy tính.
// Minh · 26/11/2026. Bảng nguồn: whs_notifications (pushed_at null), whs_push_subs (migration 20261126000001_whs_plus).
//
//   Gọi định kỳ (Supabase Cron mỗi 1–2 phút, hoặc Database Webhook khi có thông báo mới):
//   POST, header X-Push-Key: <PUSH_CRON_KEY>
//
// Secret cần đặt (supabase secrets set …):
//   PUSH_CRON_KEY      chuỗi ngẫu nhiên ≥ 32 ký tự, cron giữ cùng giá trị
//   VAPID_PUBLIC_KEY   khoá công khai (cũng ghi vào whs_settings.vapidPublicKey để app đăng ký)
//   VAPID_PRIVATE_KEY  khoá bí mật
//   VAPID_SUBJECT      mailto:… của VN Centre
// Tạo cặp khoá VAPID: npx web-push generate-vapid-keys
//
// Mỗi thông báo chỉ gửi một lần (đánh dấu pushed_at kể cả khi người nhận chưa bật thông báo đẩy).
// Điểm nhận báo 404/410 (người dùng đã gỡ) → xoá đăng ký; lỗi khác → tăng fail_count, quá 5 lần thì xoá.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const BATCH = 200

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function sameKey(given: string, expected: string) {
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([given, expected].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))))
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const expected = Deno.env.get('PUSH_CRON_KEY') ?? ''
  if (expected.length < 32) return json({ error: 'not_configured' }, 500)
  if (!(await sameKey(req.headers.get('x-push-key') ?? '', expected))) return json({ error: 'unauthorized' }, 401)

  const pub = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const priv = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@vncentre.net'
  if (!pub || !priv) return json({ error: 'vapid_not_configured' }, 500)
  webpush.setVapidDetails(subject, pub, priv)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // Chỉ gửi thông báo trong 2 ngày gần nhất (tránh dồn tin cũ khi mới bật)
  const since = new Date(Date.now() - 2 * 864e5).toISOString()
  const { data: notes, error } = await db
    .from('whs_notifications')
    .select('id,user_id,kind,title,body,data,created_at')
    .is('pushed_at', null)
    .gte('created_at', since)
    .order('id')
    .limit(BATCH)
  if (error) return json({ error: error.message }, 500)
  if (!notes?.length) return json({ sent: 0, notes: 0 })

  const users = [...new Set(notes.map((n) => n.user_id))]
  const { data: subs } = await db.from('whs_push_subs').select('id,user_id,endpoint,p256dh,auth,fail_count').in('user_id', users)
  const byUser = new Map<string, typeof subs>()
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

  let sent = 0
  const drop: string[] = []
  const fails = new Map<string, number>()
  const oks: string[] = []
  for (const n of notes) {
    const payload = JSON.stringify({
      title: n.title,
      body: n.body ?? '',
      tag: 'whs-' + n.id,
      url: '/#srv',
      data: { id: n.id, kind: n.kind, ...(n.data ?? {}) },
    })
    for (const s of byUser.get(n.user_id) ?? []) {
      if (drop.includes(s.id)) continue
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 })
        sent++
        oks.push(s.id)
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) drop.push(s.id)
        else fails.set(s.id, (fails.get(s.id) ?? s.fail_count ?? 0) + 1)
      }
    }
  }

  await db.from('whs_notifications').update({ pushed_at: new Date().toISOString() }).in('id', notes.map((n) => n.id))
  if (drop.length) await db.from('whs_push_subs').delete().in('id', drop)
  for (const [id, f] of fails) {
    if (f > 5) await db.from('whs_push_subs').delete().eq('id', id)
    else await db.from('whs_push_subs').update({ fail_count: f }).eq('id', id)
  }
  if (oks.length) await db.from('whs_push_subs').update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).in('id', [...new Set(oks)])

  return json({ notes: notes.length, sent, dropped: drop.length })
})
