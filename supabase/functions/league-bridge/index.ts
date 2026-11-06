// Edge Function: cổng kết nối app giải SNAG Golf League (league.vncentre.net, Cloudflare Worker) ↔ Golf Passport.
// Spec 13 mục 4. Máy chủ gọi máy chủ, không dùng từ trình duyệt.
//
//   POST JSON, header X-League-Key: <LEAGUE_API_KEY> (Supabase secret, Worker giữ cùng giá trị)
//   { action: 'lookup',  code }                                  → 4.1 (header X-Client-IP: IP phụ huynh, giới hạn mỗi phút)
//   { action: 'issue',   child, guardian, consents, league_ref } → 4.2
//   { action: 'results', event, rows }                           → 4.3
//   { action: 'staff_history', event, rows }                     → spec 17 mục 4: lịch sử BTC của chặng (chờ admin xác nhận)
//
// Sai / thiếu khoá → 401. Logic và nhật ký nằm trong các hàm SQL league_* (chỉ service_role gọi được).

import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_BODY = 512 * 1024

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// So sánh an toàn thời gian: băm cả hai rồi so từng byte (không lộ độ dài, không thoát sớm)
async function sameKey(given: string, expected: string) {
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([given, expected].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))))
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

function errorCode(message: string) {
  return message.split(':')[0].trim()
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const expected = Deno.env.get('LEAGUE_API_KEY') ?? ''
  if (expected.length < 32) {
    console.error('LEAGUE_API_KEY chưa đặt hoặc quá ngắn')
    return json({ error: 'not_configured' }, 503)
  }
  if (!(await sameKey(req.headers.get('x-league-key') ?? '', expected))) return json({ error: 'unauthorized' }, 401)

  const raw = await req.text()
  if (raw.length > MAX_BODY) return json({ error: 'body_too_large' }, 413)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_json' }, 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  try {
    switch (body.action) {
      case 'lookup': {
        const ip = (req.headers.get('x-client-ip') ?? '').trim().slice(0, 64)
        const { data, error } = await db.rpc('league_lookup', { p_code: String(body.code ?? ''), p_ip: ip })
        if (error) return json({ error: errorCode(error.message) }, 400)
        if ((data as { error?: string })?.error === 'rate_limited') return json(data, 429)
        return json(data)
      }
      case 'issue': {
        const { data, error } = await db.rpc('league_issue', { p: body })
        if (error) return json({ error: errorCode(error.message) }, 400)
        return json(data)
      }
      case 'results': {
        const { data, error } = await db.rpc('league_results', { p: body })
        if (error) return json({ error: errorCode(error.message) }, 400)
        return json(data)
      }
      case 'staff_history': {
        const { data, error } = await db.rpc('league_staff_history', { p: body })
        if (error) return json({ error: errorCode(error.message) }, 400)
        return json(data)
      }
      default:
        return json({ error: 'unknown_action' }, 400)
    }
  } catch (e) {
    console.error(e)
    return json({ error: 'server_error' }, 500)
  }
})
