// payOS (https://payos.vn/docs): tạo link thanh toán (QR VietQR) và kiểm tra chữ ký webhook.
// Chưa có tài khoản (thiếu PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY) → chế độ thử:
// tạo QR giả, admin "giả lập đã nhận tiền" bằng webhook ký với PAYOS_MOCK_CHECKSUM_KEY — vẫn đi qua
// đúng bước kiểm tra chữ ký (R10).

const API = 'https://api-merchant.payos.vn'

export interface PayosConfig {
  mode: 'payos' | 'mock'
  clientId?: string
  apiKey?: string
  checksumKey: string
}

export function payosConfig(): PayosConfig {
  const clientId = Deno.env.get('PAYOS_CLIENT_ID')
  const apiKey = Deno.env.get('PAYOS_API_KEY')
  const checksumKey = Deno.env.get('PAYOS_CHECKSUM_KEY')
  if (clientId && apiKey && checksumKey) return { mode: 'payos', clientId, apiKey, checksumKey }
  const mock = Deno.env.get('PAYOS_MOCK_CHECKSUM_KEY')
  if (!mock) throw new Error('missing PAYOS_MOCK_CHECKSUM_KEY')
  return { mode: 'mock', checksumKey: mock }
}

export async function hmacHex(key: string, message: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Chuỗi ký của payOS: các trường xếp theo tên (a→z), dạng key=value nối bằng &; null → rỗng. */
export function signingString(data: Record<string, unknown>) {
  return Object.keys(data).sort().map((k) => {
    const v = data[k]
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return `${k}=${s === 'null' || s === 'undefined' ? '' : s}`
  }).join('&')
}

/** So sánh chữ ký thời gian cố định */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export async function verifyWebhook(cfg: PayosConfig, body: { data?: Record<string, unknown>; signature?: string }) {
  if (!body?.data || typeof body.signature !== 'string') return false
  return safeEqual(await hmacHex(cfg.checksumKey, signingString(body.data)), body.signature.toLowerCase())
}

export interface PaymentLink {
  paymentLinkId: string
  checkoutUrl: string
  qrCode: string
  bin?: string
  accountNumber?: string
  accountName?: string
  description: string
}

export async function createPaymentLink(cfg: PayosConfig, p: {
  orderCode: number; amount: number; description: string; returnUrl: string; cancelUrl: string; expiredAt: number; buyerName?: string
}): Promise<PaymentLink> {
  if (cfg.mode === 'mock') {
    return {
      paymentLinkId: `mock-${p.orderCode}`,
      checkoutUrl: p.returnUrl,
      // Chuỗi QR thử (không chuyển tiền được)
      qrCode: `MOCK-PAYOS|${p.orderCode}|${p.amount}|${p.description}`,
      bin: '970422', accountNumber: '0000000000', accountName: 'VN CENTRE (THU NGHIEM)', description: p.description,
    }
  }
  const signature = await hmacHex(cfg.checksumKey,
    `amount=${p.amount}&cancelUrl=${p.cancelUrl}&description=${p.description}&orderCode=${p.orderCode}&returnUrl=${p.returnUrl}`)
  const res = await fetch(`${API}/v2/payment-requests`, {
    method: 'POST',
    headers: { 'x-client-id': cfg.clientId!, 'x-api-key': cfg.apiKey!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...p, signature }),
  })
  const j = await res.json()
  if (j.code !== '00' || !j.data) throw new Error(`payos_error:${j.code}:${j.desc}`)
  return {
    paymentLinkId: j.data.paymentLinkId, checkoutUrl: j.data.checkoutUrl, qrCode: j.data.qrCode,
    bin: j.data.bin, accountNumber: j.data.accountNumber, accountName: j.data.accountName, description: j.data.description,
  }
}
