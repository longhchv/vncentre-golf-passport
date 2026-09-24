import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { invokeFunction } from '@/lib/functions'
import { formatDate, formatDateTime, formatVnd, useLocalized } from '@/lib/i18nField'
import { formatCode } from '@/lib/codes'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Checkbox, Field, FormError, Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { Mascot } from '@/components/Mascot'

export interface OrderDetail {
  id: string
  order_code: number
  status: 'pending' | 'paid' | 'cancelled' | 'expired' | 'refunded'
  amount_vnd: number
  product_vi: string
  product_en: string
  student_id: string | null
  student_name: string | null
  passport_code: string | null
  related_passport_id: string | null
  qr_code: string | null
  checkout_url: string | null
  payment_info: { bin?: string; account_number?: string; account_name?: string; description?: string; mode?: 'mock' | 'payos' } | null
  expires_at: string | null
  paid_at: string | null
  created_at: string
  note: string | null
  invoice: { buyer_type: 'individual' | 'company'; buyer_name: string; tax_code: string | null; address: string | null; email: string | null; status: 'requested' | 'issued'; issued_invoice_no: string | null } | null
  new_passport_code: string | null
}

// Mã BIN ngân hàng (VietQR) → tên ngắn
const BANKS: Record<string, string> = {
  '970422': 'MB Bank', '970436': 'Vietcombank', '970415': 'VietinBank', '970418': 'BIDV', '970405': 'Agribank', '970407': 'Techcombank',
  '970432': 'VPBank', '970423': 'TPBank', '970416': 'ACB', '970403': 'Sacombank', '970437': 'HDBank', '970441': 'VIB', '970448': 'OCB',
}

export const ORDER_TONE = { pending: 'warn', paid: 'good', cancelled: 'neutral', expired: 'bad', refunded: 'neutral' } as const

export function useOrder(orderId: string, poll = false) {
  return useQuery({
    queryKey: ['order', orderId],
    refetchInterval: (q) => (poll && q.state.data?.status === 'pending' ? 5000 : false),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('order_detail', { p_order_id: orderId })
      if (error) throw error
      return data as OrderDetail
    },
  })
}

function useCountdown(until: string | null) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!until) return null
  const ms = Math.max(0, Date.parse(until) - now)
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return { d, h, m, s, done: ms === 0 }
}

/** F15 bước 3–5: trang thanh toán phí cấp lại sổ — QR chuyển khoản payOS, đếm ngược, hoá đơn; tự cập nhật khi đã nhận tiền. */
export function OrderPage() {
  const { orderId = '' } = useParams()
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const order = useOrder(orderId, true)
  const o = order.data
  const cd = useCountdown(o?.status === 'pending' ? o.expires_at : null)

  // Chưa có QR → tạo link thanh toán payOS
  const checkout = useMutation({
    mutationFn: () => invokeFunction('payments', { action: 'checkout', order_id: orderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order', orderId] }),
  })
  useEffect(() => {
    if (o?.status === 'pending' && !o.qr_code && checkout.isIdle) checkout.mutate()
  }, [o, checkout])

  const qrSvg = useMemo(() => {
    if (!o?.qr_code) return null
    const qr = QRCode.create(o.qr_code, { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) d += `M${c + 1} ${r + 1}h1v1h-1z`
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2} ${n + 2}" shape-rendering="crispEdges" style="display:block;width:100%;height:auto"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#080634"/></svg>`
  }, [o?.qr_code])

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('common.copied'))
    } catch { /* bỏ qua */ }
  }

  if (order.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (order.isError || !o) return <p className="text-red-700">{t('orders.notFound')}</p>
  const info = o.payment_info

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link to={o.student_id ? `/app/children/${o.student_id}?tab=passport` : '/account'} className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
        <ArrowLeft className="h-4 w-4" /> {t('common.back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('orders.orderN', { code: o.order_code })}</h1>
        <Badge tone={ORDER_TONE[o.status]}>{t(`orders.status.${o.status}`)}</Badge>
      </div>
      <Card className="space-y-1 p-4">
        <p className="font-semibold">{loc({ name_vi: o.product_vi, name_en: o.product_en }, 'name')}</p>
        <p className="text-sm text-navy/65">{[o.student_name, o.passport_code ? t('orders.lostPassport', { code: formatCode(o.passport_code) }) : null].filter(Boolean).join(' · ')}</p>
        <p className="text-3xl font-bold">{formatVnd(o.amount_vnd, i18n.language)}</p>
      </Card>

      {o.status === 'paid' && (
        <Card className="flex flex-col items-center gap-2 border-emerald-600 p-5 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          <p className="text-xl font-bold text-emerald-700">{t('orders.paidTitle')}</p>
          {o.paid_at && <p className="text-sm text-navy/60">{formatDateTime(o.paid_at, i18n.language)}</p>}
          <p className="text-navy/70">{o.new_passport_code ? t('orders.newPassportIssued', { code: formatCode(o.new_passport_code) }) : t('orders.waitingNewPassport')}</p>
        </Card>
      )}
      {o.status === 'expired' && (
        <Card className="space-y-2 p-4">
          <p className="font-semibold">{t('orders.expiredTitle')}</p>
          <p className="text-sm text-navy/65">{t('orders.expiredHint')}</p>
          {o.related_passport_id && <RecreateOrder passportId={o.related_passport_id} />}
        </Card>
      )}
      {o.status === 'refunded' && o.note && <p className="rounded-xl bg-navy/5 p-3 text-sm">{o.note}</p>}

      {o.status === 'pending' && (
        <Card className="space-y-4 p-4">
          <p className="font-semibold">{t('orders.scanToPay')}</p>
          {info?.mode === 'mock' && <p className="rounded-xl bg-gold/20 p-3 text-sm text-brown">{t('orders.mockNotice')}</p>}
          {qrSvg ? (
            <div className="mx-auto w-full max-w-[280px] rounded-2xl bg-white p-2 shadow ring-1 ring-navy/10" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          ) : (
            <div className="mx-auto aspect-square w-full max-w-[280px] animate-pulse rounded-2xl bg-navy/5" />
          )}
          <FormError message={checkout.isError ? t('orders.checkoutFailed') : null} />
          {info && (
            <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 text-sm">
              <dt className="text-navy/60">{t('orders.bank')}</dt>
              <dd className="font-semibold">{BANKS[info.bin ?? ''] ?? info.bin}</dd><span />
              <dt className="text-navy/60">{t('orders.accountNumber')}</dt>
              <dd className="font-mono font-semibold">{info.account_number}</dd>
              <button type="button" onClick={() => copy(info.account_number ?? '')} aria-label={t('common.copy')}><Copy className="h-4 w-4 text-bronze" /></button>
              <dt className="text-navy/60">{t('orders.accountName')}</dt>
              <dd className="font-semibold">{info.account_name}</dd><span />
              <dt className="text-navy/60">{t('orders.amount')}</dt>
              <dd className="font-semibold">{formatVnd(o.amount_vnd, i18n.language)}</dd>
              <button type="button" onClick={() => copy(String(o.amount_vnd))} aria-label={t('common.copy')}><Copy className="h-4 w-4 text-bronze" /></button>
              <dt className="text-navy/60">{t('orders.transferNote')}</dt>
              <dd className="font-mono font-semibold">{info.description}</dd>
              <button type="button" onClick={() => copy(info.description ?? '')} aria-label={t('common.copy')}><Copy className="h-4 w-4 text-bronze" /></button>
            </dl>
          )}
          {cd && (
            <p className="text-center text-sm text-navy/65">
              {t('orders.expiresIn')}{' '}
              <span className="font-mono font-semibold text-navy">
                {cd.d > 0 ? `${cd.d}${t('orders.dayShort')} ` : ''}{String(cd.h).padStart(2, '0')}:{String(cd.m).padStart(2, '0')}:{String(cd.s).padStart(2, '0')}
              </span>
              {o.expires_at && <> · {formatDate(o.expires_at, i18n.language)}</>}
            </p>
          )}
          {o.checkout_url && info?.mode === 'payos' && (
            <Button asChild variant="outline" size="full">
              <a href={o.checkout_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> {t('orders.openPayos')}</a>
            </Button>
          )}
          <p className="text-center text-sm text-navy/55">{t('orders.autoUpdate')}</p>
        </Card>
      )}

      {o.status !== 'cancelled' && o.status !== 'expired' && <InvoiceCard order={o} />}
    </div>
  )
}

function RecreateOrder({ passportId }: { passportId: string }) {
  const { t } = useTranslation()
  const [newId, setNewId] = useState<string | null>(null)
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase!.rpc('report_lost_passport', { p_passport_id: passportId })
      if (error) throw error
      return data as string
    },
    onSuccess: setNewId,
  })
  if (newId) return <Button asChild size="full"><Link to={`/app/orders/${newId}`}>{t('orders.goToNewOrder')}</Link></Button>
  return <Button size="full" disabled={m.isPending} onClick={() => m.mutate()}>{t('orders.recreate')}</Button>
}

/** "Xuất hoá đơn" → thông tin người mua (invoice_requests); hiện trạng thái hoá đơn. */
function InvoiceCard({ order }: { order: OrderDetail }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const inv = order.invoice
  const [want, setWant] = useState(Boolean(inv))
  const [form, setForm] = useState({
    buyer_type: inv?.buyer_type ?? 'individual', buyer_name: inv?.buyer_name ?? '', tax_code: inv?.tax_code ?? '', address: inv?.address ?? '', email: inv?.email ?? '',
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('request_invoice', { p_order_id: order.id, p_data: form })
      if (error) throw error
    },
    onSuccess: () => { toast(t('orders.invoiceSaved')); qc.invalidateQueries({ queryKey: ['order', order.id] }) },
  })

  if (inv?.status === 'issued') {
    return (
      <Card className="flex items-center gap-3 p-4">
        <Receipt className="h-6 w-6 text-emerald-600" />
        <p>{t('orders.invoiceIssued', { no: inv.issued_invoice_no })}</p>
      </Card>
    )
  }
  return (
    <Card className="space-y-3 p-4">
      <Checkbox label={t('orders.wantInvoice')} checked={want} onChange={(e) => setWant(e.target.checked)} />
      {inv && <p className="text-sm text-navy/60">{t('orders.invoiceRequested')}</p>}
      {want && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(['individual', 'company'] as const).map((k) => (
              <Button key={k} type="button" variant={form.buyer_type === k ? 'primary' : 'outline'} onClick={() => setForm((f) => ({ ...f, buyer_type: k }))}>
                {t(`orders.buyer.${k}`)}
              </Button>
            ))}
          </div>
          <Field label={t(form.buyer_type === 'company' ? 'orders.companyName' : 'orders.buyerName') + ' *'}>
            <Input value={form.buyer_name} onChange={set('buyer_name')} />
          </Field>
          {form.buyer_type === 'company' && (
            <Field label={t('orders.taxCode') + ' *'} hint={t('orders.taxCodeHint')}>
              <Input value={form.tax_code} onChange={set('tax_code')} inputMode="numeric" />
            </Field>
          )}
          <Field label={t('orders.address')}><Input value={form.address} onChange={set('address')} /></Field>
          <Field label={t('orders.invoiceEmail')}><Input type="email" value={form.email} onChange={set('email')} /></Field>
          <FormError message={save.isError ? t(`orders.errors.${String((save.error as { message?: string })?.message)}`, { defaultValue: t('errors.generic') }) : null} />
          <Button size="full" disabled={!form.buyer_name.trim() || save.isPending} onClick={() => save.mutate()}>{t('orders.saveInvoice')}</Button>
        </>
      )}
    </Card>
  )
}

/** Tài khoản → Đơn hàng và hoá đơn. */
export function MyOrders() {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const q = useQuery({
    queryKey: ['my_orders'],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('my_orders')
      if (error) throw error
      return data as OrderDetail[]
    },
  })
  return (
    <Card className="space-y-3 p-4">
      <p className="font-semibold">{t('orders.myOrders')}</p>
      {q.data?.length === 0 && (
        <div className="flex items-center gap-3 text-navy/60"><Mascot className="h-12 w-12" /> {t('orders.none')}</div>
      )}
      <ul className="space-y-2">
        {q.data?.map((o) => (
          <li key={o.id}>
            <Link to={`/app/orders/${o.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-navy/5 p-3 hover:bg-navy/10">
              <span className="min-w-0">
                <span className="block font-semibold">{loc({ name_vi: o.product_vi, name_en: o.product_en }, 'name')}</span>
                <span className="block text-sm text-navy/60">#{o.order_code} · {o.student_name} · {formatDate(o.created_at, i18n.language)}</span>
                {o.invoice && <span className="block text-xs text-navy/55">{o.invoice.status === 'issued' ? t('orders.invoiceIssued', { no: o.invoice.issued_invoice_no }) : t('orders.invoiceRequested')}</span>}
              </span>
              <span className="text-right">
                <span className="block font-semibold">{formatVnd(o.amount_vnd, i18n.language)}</span>
                <Badge tone={ORDER_TONE[o.status]}>{t(`orders.status.${o.status}`)}</Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
