// Edge Function: lưu Bộ kit truyền thông của nhân sự sự kiện lên máy chủ để mở ở mọi thiết bị. Không cần đăng nhập.
//
//   { action: 'login', code, contact }  → kiểm tra SĐT / email đã đăng ký (sai quá số lần thì khoá) → { result, token? }
//   { action: 'load', token }           → { data, photos: { P?: signedUrl, S?: signedUrl }, updated_at } hoặc { empty: true }
//   multipart { action: 'save', token, data, P?, S? } → lưu ô nhập + ảnh (thay ảnh cũ)
// Ảnh ở kho riêng tư crew-kit/{assignment_id}/…; link xem có hạn 1 giờ.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const BUCKET = 'crew-kit'
const MAX_BYTES = 5_242_880
const MAX_DATA = 200_000
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  try {
    if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) return await save(db, await req.formData())
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    if (body.action === 'login') {
      const { data, error } = await db.rpc('crew_kit_login', { p_code: String(body.code ?? ''), p_contact: String(body.contact ?? '') })
      if (error) throw error
      return json(data)
    }
    if (body.action === 'load') return await load(db, String(body.token ?? ''))
    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: 'server_error' }, 500)
  }
})

async function resolve(db: SupabaseClient, token: string) {
  if (!token) return null
  const { data, error } = await db.rpc('crew_kit_resolve', { p_token: token })
  if (error) throw error
  return (data as string | null) ?? null
}

async function load(db: SupabaseClient, token: string) {
  const id = await resolve(db, token)
  if (!id) return json({ error: 'unauthorized' }, 401)
  const { data: row } = await db.from('crew_kit_saves').select('*').eq('assignment_id', id).maybeSingle()
  if (!row) return json({ empty: true })
  const photos: Record<string, string> = {}
  for (const [k, path] of [['P', row.photo_p_path], ['S', row.photo_s_path]] as const) {
    if (!path) continue
    const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 3600)
    if (data?.signedUrl) photos[k] = data.signedUrl
  }
  return json({ data: row.data, photos, updated_at: row.updated_at })
}

async function save(db: SupabaseClient, form: FormData) {
  const id = await resolve(db, String(form.get('token') ?? ''))
  if (!id) return json({ error: 'unauthorized' }, 401)
  const raw = String(form.get('data') ?? '{}')
  if (raw.length > MAX_DATA) return json({ error: 'data_too_large' }, 400)
  let data: unknown
  try { data = JSON.parse(raw) } catch { return json({ error: 'invalid_data' }, 400) }

  const { data: prev } = await db.from('crew_kit_saves').select('photo_p_path, photo_s_path').eq('assignment_id', id).maybeSingle()
  const patch: Record<string, unknown> = { assignment_id: id, data }
  const removeOld: string[] = []
  for (const k of ['P', 'S'] as const) {
    const f = form.get(k)
    if (!(f instanceof File)) continue
    const ext = TYPES[f.type]
    if (!ext) return json({ error: 'photo_type' }, 400)
    if (f.size > MAX_BYTES) return json({ error: 'photo_too_large' }, 400)
    const path = `${id}/${k}-${crypto.randomUUID()}.${ext}`
    const { error } = await db.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false })
    if (error) { console.error(error); return json({ error: 'upload_failed' }, 500) }
    const col = k === 'P' ? 'photo_p_path' : 'photo_s_path'
    patch[col] = path
    const old = prev?.[col as 'photo_p_path' | 'photo_s_path']
    if (old) removeOld.push(old)
  }
  const { error } = await db.from('crew_kit_saves').upsert(patch, { onConflict: 'assignment_id' })
  if (error) throw error
  if (removeOld.length) await db.storage.from(BUCKET).remove(removeOld)
  return json({ ok: true, saved_at: new Date().toISOString() })
}
