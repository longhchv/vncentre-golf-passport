// Edge Function: thanh toán đơn hàng (F15).
//   checkout      { order_id } → tạo (hoặc dùng lại) link thanh toán payOS, lưu QR và thông tin chuyển khoản vào đơn
//   simulate_paid { order_id } → CHẾ ĐỘ THỬ, chỉ admin: gửi webhook "đã nhận tiền" có chữ ký tới payos-webhook
// Trạng thái "đã thanh toán" chỉ do payos-webhook đặt sau khi kiểm tra chữ ký (R10).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
import { createPaymentLink, hmacHex, payosConfig, signingString } from '../_shared/payos.ts'

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
  const orderId = String(body.order_id ?? '')

  // Quyền: người xem được đơn (người trả / người giám hộ quản lý / admin)
  const { data: detail, error: de } = await caller.rpc('order_detail', { p_order_id: orderId })
  if (de) return json({ error: de.code === '42501' ? 'forbidden' : de.message }, de.code === '42501' ? 403 : 400)
  const cfg = payosConfig()

  try {
    if (body.action === 'checkout') {
      if (detail.status !== 'pending') return json({ error: `order_${detail.status}` }, 400)
      if (detail.qr_code) return json({ ok: true, mode: cfg.mode })
      const { data: base } = await db.from('app_settings').select('value').eq('key', 'app.public_base_url').maybeSingle()
      const baseUrl = String(base?.value ?? 'https://app.vncentre.net').replace(/\/+$/, '')
      const back = `${baseUrl}/app/orders/${orderId}`
      const { data: payer } = await db.from('profiles').select('full_name').eq('user_id', u.user.id).maybeSingle()
      const link = await createPaymentLink(cfg, {
        orderCode: Number(detail.order_code), amount: Number(detail.amount_vnd),
        // Nội dung chuyển khoản ngắn (tài khoản ngân hàng không liên kết payOS chỉ nhận 9 ký tự)
        description: `VNC${detail.order_code}`.slice(0, 9),
        returnUrl: back, cancelUrl: back,
        expiredAt: Math.floor(Date.parse(detail.expires_at) / 1000),
        buyerName: payer?.full_name ?? undefined,
      })
      await db.from('orders').update({
        provider_ref: link.paymentLinkId, checkout_url: link.checkoutUrl, qr_code: link.qrCode,
        payment_info: { bin: link.bin, account_number: link.accountNumber, account_name: link.accountName, description: link.description, mode: cfg.mode },
      }).eq('id', orderId)
      return json({ ok: true, mode: cfg.mode })
    }

    if (body.action === 'simulate_paid') {
      const { data: isAdmin } = await caller.rpc('is_admin')
      if (!isAdmin) return json({ error: 'forbidden' }, 403)
      if (cfg.mode !== 'mock') return json({ error: 'not_mock_mode' }, 400)
      const data = {
        orderCode: Number(detail.order_code), amount: Number(detail.amount_vnd), description: `VNC${detail.order_code}`,
        accountNumber: '0000000000', reference: `MOCK${Date.now()}`, transactionDateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        currency: 'VND', paymentLinkId: `mock-${detail.order_code}`, code: '00', desc: 'success',
        counterAccountBankId: '', counterAccountBankName: '', counterAccountName: '', counterAccountNumber: '', virtualAccountName: '', virtualAccountNumber: '',
      }
      const payload = { code: '00', desc: 'success', success: true, data, signature: await hmacHex(cfg.checksumKey, signingString(data)) }
      const res = await fetch(`${url}/functions/v1/payos-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      return json(await res.json())
    }
    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
