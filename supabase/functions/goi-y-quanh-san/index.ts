// Edge Function: goi-y-quanh-san — Claude viết chữ cho khu quản trị sân (Golf Passport, app CSR).
// KHÔNG dùng bất kỳ API nào của Google Maps Platform (Việt Nam là vùng bị cấm theo điều khoản Google).
// Chỉ admin Golf Passport hoặc admin CSR gọi được (hàm SQL gc_is_admin). Khoá: secret ANTHROPIC_API_KEY.
//
// Hành động:
//   viet-cam-nhan { course, country, y, scores }        → { vi, en }  đoạn cảm nhận theo giọng anh Long, chỉ dựa vào ý được đưa
//   viet-mo-ta    { course, places: [{key,name,cat,area}] } → { items: [{ key, vi, en }] }  mô tả ngắn từng địa điểm

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const MODEL = 'claude-haiku-5-5'
const CAT_VI: Record<string, string> = {
  lodging: 'lưu trú', food: 'ăn uống', cafe: 'cà phê', kids: 'khu vui chơi trẻ em', heritage: 'di tích – di sản',
  nature: 'thiên nhiên – biển', fun: 'giải trí – spa', shop: 'mua sắm – đặc sản', move: 'di chuyển',
}

const REVIEW_SYSTEM = `Bạn viết đoạn "Cảm nhận của VN Centre" về một sân golf cho website courses.vncentre.net, thay lời anh Long (người sáng lập VN Centre, huấn luyện viên golf).
Giọng: chân thật, gọn, như người chơi kể lại cho bạn golf; xưng "Long" hoặc "mình", không bao giờ xưng "tôi". Không khen sáo rỗng, không dùng "tuyệt vời", "hoàn hảo", "đẳng cấp".
CHỈ dựa vào các ý và điểm chấm được đưa. Không bịa thêm chi tiết về sân (số hố, giá, tiện ích, cảnh quan) nếu ý không nói tới.
Viết 2 bản: "vi" tiếng Việt (80–140 chữ) và "en" tiếng Anh tương ứng (ngôi thứ nhất "I", tự nhiên với golfer quốc tế).
Chỉ trả về JSON {"vi":"...","en":"..."}, không thêm chữ nào khác.`

const NOTE_SYSTEM = `Bạn viết mô tả ngắn cho địa điểm gợi ý quanh một sân golf trên website VN Centre.
Chỉ dùng thông tin được cung cấp (tên, nhóm, khu vực). Không bịa món ăn, giá, giờ mở cửa, tiện ích nếu không có trong dữ liệu.
Mỗi địa điểm: "vi" tiếng Việt và "en" tiếng Anh, mỗi câu tối đa 110 ký tự, giọng trung tính, không quảng cáo, không dùng chữ "tuyệt vời", "hoàn hảo".
Chỉ trả về JSON dạng {"items":[{"key":"...","vi":"...","en":"..."}]}, không thêm chữ nào khác.`

async function claude(key: string, system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(`claude_${res.status}`)
  const j = await res.json()
  return (j.content ?? []).map((c: { text?: string }) => c.text ?? '').join('')
}
function pickJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return json({ error: 'unauthorized' }, 401)
  const { data: ok } = await caller.rpc('gc_is_admin')
  if (!ok) return json({ error: 'forbidden' }, 403)

  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ error: 'missing_anthropic_key' }, 500)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  try {
    switch (body.action) {
      case 'viet-cam-nhan': {
        const y = clip(body.y, 2000)
        if (!y) return json({ error: 'missing_notes' }, 400)
        const scores = (body.scores && typeof body.scores === 'object') ? body.scores : {}
        const user = `Sân: ${clip(body.course, 200)} (quốc gia ${clip(body.country, 2) || 'VN'})\nĐiểm chấm (1–10): ${JSON.stringify(scores)}\nÝ của anh Long: ${y}`
        const out = pickJson(await claude(key, REVIEW_SYSTEM, user, 1200))
        if (!out?.vi || !out?.en) return json({ error: 'bad_output' }, 502)
        return json({ vi: clip(out.vi, 2000), en: clip(out.en, 2000) })
      }
      case 'viet-mo-ta': {
        const list = Array.isArray(body.places) ? (body.places as Record<string, unknown>[]).slice(0, 120) : []
        if (!list.length) return json({ error: 'missing_places' }, 400)
        const items: { key: string; vi: string; en: string }[] = []
        for (let i = 0; i < list.length; i += 30) {
          const chunk = list.slice(i, i + 30).map((p) => ({ key: clip(p.key, 80), name: clip(p.name, 160), cat: CAT_VI[String(p.cat)] ?? clip(p.cat, 20), area: clip(p.area, 80) }))
          const out = pickJson(await claude(key, NOTE_SYSTEM, `Sân: ${clip(body.course, 200)}\nĐịa điểm:\n${JSON.stringify(chunk)}`, 4000))
          for (const it of (out?.items as Record<string, unknown>[] | undefined) ?? []) {
            if (it?.key) items.push({ key: clip(it.key, 80), vi: clip(it.vi, 160), en: clip(it.en, 160) })
          }
        }
        return json({ items })
      }
      default:
        return json({ error: 'unknown_action' }, 400)
    }
  } catch (e) {
    return json({ error: (e as Error).message || 'failed' }, 502)
  }
})
