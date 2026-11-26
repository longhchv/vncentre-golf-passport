// Edge Function: gửi thông báo đẩy (Web Push) của app Handicap (hdcp.vncentre.net) về điện thoại / máy tính.
// Minh · 26/11/2026. Bảng nguồn: whs_notifications (pushed_at null), whs_push_subs (migration 20261126000001_whs_plus).
//
//   Gọi định kỳ mỗi phút bằng pg_cron + pg_net: select public.whs_push_schedule('https://<ref>.supabase.co/functions/v1/whs-push');
//   POST, header X-Push-Key = khoá ngẫu nhiên do migration tạo trong bảng whs_push_keys (lịch chạy tự đọc, không ai gõ tay).
//
// Khoá VAPID: lần chạy đầu Edge Function tự tạo cặp khoá và lưu vào whs_push_keys (chỉ máy chủ đọc được),
// khoá công khai chép sang whs_settings.vapidPublicKey để app đăng ký. Có thể ghi đè bằng secret VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
// VAPID_SUBJECT (tuỳ chọn): mailto:… của VN Centre.
//
// Mỗi thông báo chỉ gửi một lần (đánh dấu pushed_at kể cả khi người nhận chưa bật thông báo đẩy).
// Điểm nhận báo 404/410 (người dùng đã gỡ) → xoá đăng ký; lỗi khác → tăng fail_count, quá 5 lần thì xoá.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const BATCH = 200

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const key = req.headers.get('x-push-key') ?? ''
  const { data: okKey } = await db.rpc('whs_push_check', { p_key: key })
  if (okKey !== true) return json({ error: 'unauthorized' }, 401)

  // Khoá VAPID: secret nếu có, không thì lấy từ máy chủ; chưa có thì tạo một lần và lưu lại
  let pub = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  let priv = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  if (!pub || !priv) {
    const { data: k } = await db.rpc('whs_push_vapid')
    const row = Array.isArray(k) ? k[0] : k
    if (row?.vapid_public && row?.vapid_private) {
      pub = row.vapid_public
      priv = row.vapid_private
    } else {
      const gen = webpush.generateVAPIDKeys()
      const { data: saved, error: e1 } = await db.rpc('whs_push_set_vapid', { p_public: gen.publicKey, p_private: gen.privateKey })
      if (e1) return json({ error: e1.message }, 500)
      if (saved === gen.publicKey) {
        pub = gen.publicKey
        priv = gen.privateKey
      } else {
        const { data: k2 } = await db.rpc('whs_push_vapid')
        const r2 = Array.isArray(k2) ? k2[0] : k2
        pub = r2?.vapid_public ?? ''
        priv = r2?.vapid_private ?? ''
      }
    }
  }
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@vncentre.net'
  if (!pub || !priv) return json({ error: 'vapid_not_configured' }, 500)
  webpush.setVapidDetails(subject, pub, priv)

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
