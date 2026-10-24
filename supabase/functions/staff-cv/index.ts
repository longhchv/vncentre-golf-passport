// Edge Function: CV nhân sự (11-module-ho-so-nhan-su.md S5).
//   export   { lang, show_contact, user_id? } → chụp snapshot (staff_cv_export), tạo PDF, trả link tải có hạn
//   download { id }                           → link tải lại một bản đã xuất (đọc từ snapshot, S-R5)
// PDF lưu ở kho riêng tư "staff-files" ({user_id}/cv/{id}.pdf); font dùng chung kho "certificate-assets" như chứng nhận.
// Link hết hạn theo app_settings staff_cv.link_ttl_seconds (mặc định 24 giờ, D50).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, rgb } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'
import QRCode from 'npm:qrcode@1.5.4'
import { corsHeaders, json } from '../_shared/cors.ts'
import { renderStaffCvPdf, type StaffCvData, type Weight } from '../_shared/staffCvPdf.ts'

const lib = { PDFDocument, rgb, fontkit, QRCode }
const WEIGHTS: Record<Weight, number> = { regular: 400, semibold: 600, bold: 700 }

// deno-lint-ignore no-explicit-any
type Db = any
const cache = new Map<string, Uint8Array>()
async function download(db: Db, bucket: string, path: string): Promise<Uint8Array> {
  const key = `${bucket}/${path}`
  const hit = cache.get(key)
  if (hit) return hit
  const { data, error } = await db.storage.from(bucket).download(path)
  if (error || !data) throw new Error(`asset_missing:${key}`)
  const bytes = new Uint8Array(await data.arrayBuffer())
  if (bucket === 'certificate-assets') cache.set(key, bytes)
  return bytes
}

async function render(db: Db, data: StaffCvData) {
  const fonts = {} as Record<Weight, [Uint8Array, Uint8Array]>
  for (const [w, n] of Object.entries(WEIGHTS) as [Weight, number][]) {
    fonts[w] = [
      await download(db, 'certificate-assets', `fonts/BeVietnamPro-latin-${n}.woff`),
      await download(db, 'certificate-assets', `fonts/BeVietnamPro-vietnamese-${n}.woff`),
    ]
  }
  // Ảnh hồ sơ: ảnh của hồ sơ tự chơi trong kho student-photos; thiếu thì in chữ viết tắt
  const photo = data.person.photo_path
    ? await download(db, 'student-photos', data.person.photo_path).catch(() => null)
    : null
  return (await renderStaffCvPdf(lib, data, { fonts, photo })).bytes
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: u } = await caller.auth.getUser()
  if (!u.user) return json({ error: 'unauthorized' }, 401)
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  try {
    // Quyền và nội dung đều do hàm SQL kiểm tra (gọi bằng phiên của người dùng)
    let cv: { id: string; user_id: string; verify_code: string; status?: string; pdf_path?: string | null; data: StaffCvData }
    if (body.action === 'export') {
      const { data, error } = await caller.rpc('staff_cv_export', {
        p_lang: body.lang === 'en' ? 'en' : 'vi',
        p_show_contact: Boolean(body.show_contact),
        p_user_id: body.user_id ?? null,
      })
      if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400)
      cv = data
    } else if (body.action === 'download') {
      const { data, error } = await caller.rpc('staff_cv_get', { p_id: String(body.id ?? '') })
      if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400)
      if (data.status !== 'valid') return json({ error: 'revoked' }, 400)
      cv = data
    } else {
      return json({ error: 'unknown_action' }, 400)
    }

    let path = cv.pdf_path ?? null
    if (!path) {
      const bytes = await render(db, cv.data)
      path = `${cv.user_id}/cv/${cv.id}.pdf`
      const up = await db.storage.from('staff-files').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (up.error) throw up.error
      await db.from('staff_cv_exports').update({ pdf_path: path }).eq('id', cv.id)
    }
    const { data: ttl } = await db.from('app_settings').select('value').eq('key', 'staff_cv.link_ttl_seconds').maybeSingle()
    const { data: signed, error: se } = await db.storage.from('staff-files')
      .createSignedUrl(path, Number(ttl?.value ?? 86400), { download: `CV-${slug(cv.data.person.full_name)}-${cv.verify_code}.pdf` })
    if (se) throw se
    return json({ id: cv.id, verify_code: cv.verify_code, url: signed.signedUrl })
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message ?? 'failed' }, 500)
  }
})
