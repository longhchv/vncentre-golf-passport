// Edge Function: tự xác nhận hoàn thành bằng ảnh thẻ điểm (module 10, E5). Không cần đăng nhập.
//
//   POST multipart/form-data { code, photo }  → kiểm tra thẻ (đã ghi tên, chưa hoàn thành, còn hạn, chưa quá số yêu cầu),
//   lưu ảnh vào kho riêng tư event-claims/{event_id}/{mã thẻ}/{uuid}.jpg, tạo yêu cầu chờ admin duyệt.
// Ảnh đã được nén trên máy người dùng (dưới 1 MB); ở đây chặn trên 1,5 MB và chỉ nhận JPEG/PNG/WebP.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const MAX_BYTES = 1_572_864
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  try {
    const form = await req.formData().catch(() => null)
    const code = String(form?.get('code') ?? '')
    const photo = form?.get('photo')
    if (!(photo instanceof File)) return json({ error: 'photo_required' }, 400)
    const ext = TYPES[photo.type]
    if (!ext) return json({ error: 'photo_type' }, 400)
    if (photo.size > MAX_BYTES) return json({ error: 'photo_too_large' }, 400)

    const { data: check, error: ce } = await db.rpc('event_claim_check', { p_code: code })
    if (ce) return json({ error: ce.message.split(':')[0] }, 400)
    const { event_id, code: cardCode } = check as { event_id: string; code: string }

    const path = `${event_id}/${cardCode}/${crypto.randomUUID()}.${ext}`
    const { error: ue } = await db.storage.from('event-claims').upload(path, photo, { contentType: photo.type, upsert: false })
    if (ue) {
      console.error(ue)
      return json({ error: 'upload_failed' }, 500)
    }
    const { error: se } = await db.rpc('event_submit_claim', { p_code: cardCode, p_photo_path: path })
    if (se) {
      await db.storage.from('event-claims').remove([path])
      return json({ error: se.message.split(':')[0] }, 400)
    }
    return json({ ok: true })
  } catch (e) {
    console.error(e)
    return json({ error: 'server_error' }, 500)
  }
})
