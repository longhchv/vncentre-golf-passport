// Edge Function: chứng nhận (F9).
//   pdf          { certificate_id }                         → link tải PDF có hạn (phụ huynh có email, nhân viên)
//   preview_pdf  { template_id, student_ids, data }         → PDF xem trước của học viên đầu tiên (admin/HLV trưởng)
//   notify_email { certificate_ids }                        → email báo phụ huynh có chứng nhận mới
// PDF tạo một lần rồi lưu ở kho riêng tư "certificates"; tài sản (nền, chữ ký, logo, font) ở "certificate-assets".

import { createClient } from 'npm:@supabase/supabase-js@2'
import { LineCapStyle, PDFDocument, rgb, setCharacterSpacing } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'
import QRCode from 'npm:qrcode@1.5.4'
import { corsHeaders, json } from '../_shared/cors.ts'
import { brandedEmail, sendEmailHtml } from '../_shared/messaging.ts'
import { renderCertificatePdf, type CertAssets } from '../_shared/certificatePdf.ts'
import type { CertificateData } from '../_shared/certificateLayout.ts'

const lib = { PDFDocument, rgb, setCharacterSpacing, LineCapStyle, fontkit, QRCode }

// Vùng logo xanh navy trong trang PDF vector (trang 2267.72 pt, đo trên ảnh 1092 px)
const RA_S = 2267.72 / 1092
const RA_BOX = { left: 250 * RA_S, right: 880 * RA_S, top: (1092 - 138) * RA_S, bottom: (1092 - 482) * RA_S }
const FONT_FILES = {
  serif: 'fonts/NotoSerif-Regular.ttf', serifBold: 'fonts/NotoSerif-Bold.ttf', serifItalic: 'fonts/NotoSerif-Italic.ttf',
  script: 'fonts/GreatVibes-Regular.ttf', sans: 'fonts/Montserrat-Regular.ttf', sansMedium: 'fonts/Montserrat-Medium.ttf',
} as const

// deno-lint-ignore no-explicit-any
type Db = any
const cache = new Map<string, Uint8Array>()
async function asset(db: Db, path: string): Promise<Uint8Array> {
  const hit = cache.get(path)
  if (hit) return hit
  const { data, error } = await db.storage.from('certificate-assets').download(path)
  if (error || !data) throw new Error(`asset_missing:${path}`)
  const bytes = new Uint8Array(await data.arrayBuffer())
  cache.set(path, bytes)
  return bytes
}

async function render(db: Db, data: CertificateData) {
  const fonts = Object.fromEntries(await Promise.all(Object.entries(FONT_FILES).map(async ([k, p]) => [k, await asset(db, p)])))
  const assets: CertAssets = {
    background: await asset(db, data.background_path || 'templates/default/background.jpg'),
    signature: await asset(db, data.signature_path || 'signatures/default.png'),
    logoVnCentre: await asset(db, 'assets/logo-vncentre.png'),
    raVgaPdf: await asset(db, 'assets/ra-vga.pdf'),
    raVgaBox: RA_BOX,
    fonts: fonts as CertAssets['fonts'],
  }
  return renderCertificatePdf(lib, data, assets)
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
    if (body.action === 'pdf') {
      const { data: c, error } = await caller.rpc('certificate_view', { p_id: String(body.certificate_id ?? '') })
      if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400)
      if (c.status !== 'valid') return json({ error: 'revoked' }, 400)
      if (c.needs_email) return json({ error: 'email_required' }, 400)
      if (!c.can_download) return json({ error: 'forbidden' }, 403)

      let path: string | null = c.pdf_path
      if (!path) {
        const bytes = await render(db, c.data)
        path = `${c.student_id}/${c.id}.pdf`
        const up = await db.storage.from('certificates').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
        if (up.error) throw up.error
        await db.from('certificates').update({ pdf_path: path }).eq('id', c.id)
      }
      const { data: ttl } = await db.from('app_settings').select('value').eq('key', 'certificate.pdf_link_ttl_seconds').maybeSingle()
      const { data: signed, error: se } = await db.storage.from('certificates')
        .createSignedUrl(path, Number(ttl?.value ?? 300), { download: `Certificate-${slug(c.data.student_name)}-${c.verify_code}.pdf` })
      if (se) throw se
      return json({ url: signed.signedUrl })
    }

    if (body.action === 'preview_pdf') {
      const { data: items, error } = await caller.rpc('certificate_issue_preview', {
        p_template_id: body.template_id, p_student_ids: body.student_ids, p_data: body.data,
      })
      if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400)
      const first = (items as { data: CertificateData }[])[0]
      if (!first) return json({ error: 'no_students' }, 400)
      const bytes = await render(db, first.data)
      return new Response(bytes, { headers: { ...corsHeaders, 'Content-Type': 'application/octet-stream' } })
    }

    if (body.action === 'notify_email') {
      const { data: staff } = await caller.rpc('is_center_staff')
      if (!staff) return json({ error: 'forbidden' }, 403)
      const ids = (Array.isArray(body.certificate_ids) ? body.certificate_ids : []).slice(0, 200)
      const { data: base } = await db.from('app_settings').select('value').eq('key', 'app.public_base_url').maybeSingle()
      const baseUrl = String(base?.value ?? 'https://app.vncentre.net').replace(/\/+$/, '')
      const { data: certs } = await db.from('certificates').select('id, student_id, title_vi, title_en, data').in('id', ids).eq('status', 'valid')
      let sent = 0, failed = 0
      for (const c of certs ?? []) {
        const { data: links } = await db.from('student_guardians')
          .select('guardian:guardians(user_id, deleted_at, profile:profiles(email))')
          .eq('student_id', c.student_id).eq('status', 'active').is('deleted_at', null)
        const emails = new Set<string>()
        for (const l of links ?? []) {
          const g = l.guardian as { user_id: string | null; deleted_at: string | null; profile: { email: string | null } | null } | null
          if (g?.user_id && !g.deleted_at && g.profile?.email) emails.add(g.profile.email.toLowerCase())
        }
        const name = c.data.student_name as string
        const link = `${baseUrl}/app/children/${c.student_id}?tab=certificates`
        for (const to of emails) {
          const r = await sendEmailHtml(to, `Chứng nhận mới của ${name} / New certificate`, brandedEmail({
            viTitle: `${name} vừa nhận chứng nhận: ${c.title_vi?.replace('Chứng nhận hoàn thành – ', '') ?? ''}`,
            viBody: 'Mở hồ sơ golf của con để xem và tải chứng nhận (PDF). Chứng nhận có mã QR để bất kỳ ai cũng xác thực được.',
            enBody: `${name} has received a new certificate. Open your child's golf record to view and download the PDF. The QR code on the certificate lets anyone verify it.`,
            button: 'Xem chứng nhận / View certificate', link,
          }), 'certificate')
          if (r.ok) sent++
          else failed++
          await db.from('otp_logs').insert({
            target: to, channel: 'email', purpose: 'notification', status: r.ok ? 'sent' : 'failed', provider: r.provider,
            provider_message_id: r.providerMessageId ?? null, error: r.ok ? null : r.error, cost_vnd: 0,
            meta: { certificate_id: c.id },
          })
        }
      }
      return json({ sent, failed })
    }
    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message ?? 'failed' }, 500)
  }
})
