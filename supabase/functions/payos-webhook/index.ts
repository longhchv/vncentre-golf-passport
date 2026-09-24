// Edge Function (không cần đăng nhập): payOS gọi khi nhận được tiền.
// Chỉ đơn có chữ ký hợp lệ mới chuyển "đã thanh toán" (R10). Mọi lần gọi đều ghi payment_events.
// Luôn trả 200 để payOS không gửi lại mãi; lỗi được ghi lại để admin xem.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { payosConfig, verifyWebhook } from '../_shared/payos.ts'
import { sendEmailHtml, brandedEmail } from '../_shared/messaging.ts'

const ok = (extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ error: 0, message: 'ok', ...extra }), { headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok()
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const body = await req.json().catch(() => null)
  if (!body) return ok()
  const cfg = payosConfig()
  const valid = await verifyWebhook(cfg, body)
  const data = (body.data ?? {}) as Record<string, unknown>
  const orderCode = Number(data.orderCode)

  const { data: order } = await db.from('orders').select('id').eq('order_code', Number.isFinite(orderCode) ? orderCode : -1).maybeSingle()
  await db.from('payment_events').insert({ order_id: order?.id ?? null, provider: cfg.mode === 'mock' ? 'payos_mock' : 'payos', payload: body, signature_valid: valid })
  if (!valid) return ok({ ignored: 'invalid_signature' })
  // payOS gửi thử khi đăng ký webhook (orderCode 123) → chỉ cần trả 200
  if (!order) return ok({ ignored: 'order_not_found' })
  if (body.success === false || (data.code && data.code !== '00')) return ok({ ignored: 'not_success' })

  const { data: r, error } = await db.rpc('mark_order_paid', {
    p_order_code: orderCode, p_amount: Number(data.amount ?? 0), p_reference: String(data.reference ?? data.paymentLinkId ?? ''),
  })
  if (error) {
    console.error(error)
    return ok({ ignored: 'db_error' })
  }

  // F15 bước 5: email "Thanh toán thành công" cho người trả tiền
  if (r?.result === 'paid') {
    const { data: o } = await db.from('orders').select('id, order_code, amount_vnd, student:students(full_name), payer:profiles(email)').eq('id', r.order_id).single()
    const email = (o?.payer as { email: string | null } | null)?.email
    if (email) {
      const { data: base } = await db.from('app_settings').select('value').eq('key', 'app.public_base_url').maybeSingle()
      const link = `${String(base?.value ?? 'https://app.vncentre.net').replace(/\/+$/, '')}/app/orders/${o!.id}`
      const name = (o?.student as { full_name: string } | null)?.full_name ?? ''
      const amount = new Intl.NumberFormat('vi-VN').format(o!.amount_vnd)
      await sendEmailHtml(email, `Thanh toán thành công – đơn ${o!.order_code} / Payment received`, brandedEmail({
        viTitle: `VN Centre đã nhận ${amount} đ phí cấp lại sổ Passport cho ${name}.`,
        viBody: 'Sổ mới sẽ được gửi tới con. Khi nhận sổ, hãy quét mã QR trên sổ để tiếp tục dùng hồ sơ cũ, dữ liệu giữ nguyên.',
        enBody: `VN Centre received ${amount} VND for ${name}'s passport replacement. When the new passport arrives, scan its QR code to continue the same record.`,
        button: 'Xem đơn hàng / View order', link,
      }), 'order')
    }
  }
  return ok({ result: r?.result })
})
