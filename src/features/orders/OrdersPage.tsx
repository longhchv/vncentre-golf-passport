import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookMarked, FileSpreadsheet, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { invokeFunction } from '@/lib/functions'
import { formatDateTime, formatVnd } from '@/lib/i18nField'
import { formatCode } from '@/lib/codes'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { AssignPassportDialog } from '@/features/passports/AssignPassportDialog'
import { ORDER_TONE } from './OrderPage'

interface AdminOrder {
  id: string
  order_code: number
  status: keyof typeof ORDER_TONE
  amount_vnd: number
  created_at: string
  paid_at: string | null
  expires_at: string | null
  note: string | null
  provider_ref: string | null
  student_id: string | null
  student_name: string | null
  student_code: string | null
  passport_code: string | null
  payer_name: string | null
  payer_phone: string | null
  payer_email: string | null
  needs_passport: boolean
  new_passport_code: string | null
  invoice: { buyer_type: string; buyer_name: string; tax_code: string | null; address: string | null; email: string | null; status: 'requested' | 'issued'; issued_invoice_no: string | null } | null
}

type View = 'all' | 'needs_passport' | 'invoices'

/** Admin · Đơn hàng và hoá đơn (F15): lọc trạng thái, "Cần cấp sổ", hoá đơn, hoàn tiền, xuất Excel. */
export function OrdersPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [view, setView] = useState<View>('all')
  const [status, setStatus] = useState('')
  const [assignFor, setAssignFor] = useState<{ id: string; full_name: string } | null>(null)
  const [refund, setRefund] = useState<AdminOrder | null>(null)
  const [invoiceFor, setInvoiceFor] = useState<AdminOrder | null>(null)
  const [text, setText] = useState('')

  const list = useQuery({
    queryKey: ['admin_orders', view, status],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('admin_orders', { p_status: status || null, p_needs_passport: view === 'needs_passport' })
      if (error) throw error
      const rows = data as AdminOrder[]
      return view === 'invoices' ? rows.filter((o) => o.invoice) : rows
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin_orders'] })

  const simulate = useMutation({
    mutationFn: (id: string) => invokeFunction<{ result?: string }>('payments', { action: 'simulate_paid', order_id: id }),
    onSuccess: (r) => { toast(r.result === 'paid' ? t('orders.status.paid') : String(r.result)); refresh() },
    onError: (e) => toast(String((e as Error).message) === 'not_mock_mode' ? t('orders.notMock') : errorMessage(e, t), 'error'),
  })
  const doRefund = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('refund_order', { p_order_id: refund!.id, p_note: text.trim() })
      if (error) throw error
    },
    onSuccess: () => { toast(t('orders.refunded')); setRefund(null); setText(''); refresh() },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  const markInvoice = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('invoice_mark_issued', { p_order_id: invoiceFor!.id, p_invoice_no: text.trim() })
      if (error) throw error
    },
    onSuccess: () => { toast(t('common.saved')); setInvoiceFor(null); setText(''); refresh() },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const rows = (list.data ?? []).map((o) => ({
      [t('orders.orderCode')]: o.order_code,
      [t('fields.status')]: t(`orders.status.${o.status}`),
      [t('orders.amount')]: o.amount_vnd,
      [t('fields.studentName')]: o.student_name,
      [t('orders.studentCode')]: o.student_code,
      [t('orders.lostCode')]: o.passport_code,
      [t('orders.newCode')]: o.new_passport_code,
      [t('orders.payer')]: o.payer_name,
      [t('auth.phone')]: o.payer_phone,
      [t('auth.email')]: o.payer_email,
      [t('orders.createdAt')]: formatDateTime(o.created_at, i18n.language),
      [t('orders.paidAt')]: o.paid_at ? formatDateTime(o.paid_at, i18n.language) : '',
      [t('orders.providerRef')]: o.provider_ref,
      [t('orders.invoiceBuyer')]: o.invoice?.buyer_name ?? '',
      [t('orders.taxCode')]: o.invoice?.tax_code ?? '',
      [t('orders.address')]: o.invoice?.address ?? '',
      [t('orders.invoiceEmail')]: o.invoice?.email ?? '',
      [t('orders.invoiceNo')]: o.invoice?.issued_invoice_no ?? '',
      [t('orders.note')]: o.note ?? '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Orders')
    XLSX.writeFile(wb, `don-hang-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('admin.nav.orders')}</h1>
        <Button variant="outline" size="sm" disabled={!list.data?.length} onClick={exportExcel}>
          <FileSpreadsheet className="h-4 w-4" /> {t('orders.exportExcel')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['all', 'needs_passport', 'invoices'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setView(k)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${view === k ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15'}`}>
            {t(`orders.view.${k}`)}
          </button>
        ))}
        {view === 'all' && (
          <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {(Object.keys(ORDER_TONE) as (keyof typeof ORDER_TONE)[]).map((s) => <option key={s} value={s}>{t(`orders.status.${s}`)}</option>)}
          </Select>
        )}
      </div>

      {list.data?.length === 0 && <p className="text-navy/60">{t('common.empty')}</p>}
      <ul className="space-y-2">
        {list.data?.map((o) => (
          <li key={o.id}>
            <Card className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">#{o.order_code} · {o.student_name} <span className="text-sm font-normal text-navy/55">{o.student_code}</span></p>
                  <p className="text-sm text-navy/65">
                    {o.passport_code && t('orders.lostPassport', { code: formatCode(o.passport_code) })}
                    {o.new_passport_code && ` → ${formatCode(o.new_passport_code)}`}
                  </p>
                  <p className="text-sm text-navy/65">{[o.payer_name, o.payer_phone, o.payer_email].filter(Boolean).join(' · ')}</p>
                  <p className="text-xs text-navy/50">
                    {formatDateTime(o.created_at, i18n.language)}
                    {o.paid_at && ` · ${t('orders.paidAt')}: ${formatDateTime(o.paid_at, i18n.language)}`}
                  </p>
                  {o.note && <p className="text-sm text-navy/70">{o.note}</p>}
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatVnd(o.amount_vnd, i18n.language)}</p>
                  <Badge tone={ORDER_TONE[o.status]}>{t(`orders.status.${o.status}`)}</Badge>
                  {o.needs_passport && <div><Badge tone="warn">{t('orders.view.needs_passport')}</Badge></div>}
                </div>
              </div>
              {o.invoice && (
                <p className="rounded-xl bg-navy/5 p-2 text-sm">
                  <Receipt className="mr-1 inline h-4 w-4" />
                  {[o.invoice.buyer_name, o.invoice.tax_code, o.invoice.address, o.invoice.email].filter(Boolean).join(' · ')}
                  {' · '}{o.invoice.status === 'issued' ? t('orders.invoiceIssued', { no: o.invoice.issued_invoice_no }) : t('orders.invoiceRequested')}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {o.needs_passport && o.student_id && (
                  <Button size="sm" onClick={() => setAssignFor({ id: o.student_id!, full_name: o.student_name ?? '' })}>
                    <BookMarked className="h-4 w-4" /> {t('orders.assignNew')}
                  </Button>
                )}
                {o.status === 'pending' && (
                  <Button size="sm" variant="outline" disabled={simulate.isPending}
                    onClick={() => window.confirm(t('orders.confirmSimulate')) && simulate.mutate(o.id)}>
                    {t('orders.simulatePaid')}
                  </Button>
                )}
                {o.invoice && o.invoice.status !== 'issued' && (
                  <Button size="sm" variant="outline" onClick={() => { setText(''); setInvoiceFor(o) }}>{t('orders.markInvoice')}</Button>
                )}
                {o.status === 'paid' && (
                  <Button size="sm" variant="ghost" onClick={() => { setText(''); setRefund(o) }}>{t('orders.refund')}</Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <AssignPassportDialog student={assignFor} onClose={() => setAssignFor(null)} onAssigned={() => { setAssignFor(null); refresh() }} />
      <Dialog open={refund !== null} onClose={() => setRefund(null)} title={t('orders.refund')}>
        <div className="space-y-3">
          <p>#{refund?.order_code} · {refund && formatVnd(refund.amount_vnd, i18n.language)}</p>
          <p className="rounded-xl bg-gold/15 p-3 text-sm text-brown">{t('orders.refundHint')}</p>
          <Field label={t('orders.note') + ' *'}><Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <Button size="full" disabled={!text.trim() || doRefund.isPending} onClick={() => doRefund.mutate()}>{t('orders.confirmRefund')}</Button>
        </div>
      </Dialog>
      <Dialog open={invoiceFor !== null} onClose={() => setInvoiceFor(null)} title={t('orders.markInvoice')}>
        <div className="space-y-3">
          <p className="text-sm">{invoiceFor?.invoice && [invoiceFor.invoice.buyer_name, invoiceFor.invoice.tax_code, invoiceFor.invoice.address, invoiceFor.invoice.email].filter(Boolean).join(' · ')}</p>
          <Field label={t('orders.invoiceNo') + ' *'} hint={t('orders.invoiceNoHint')}><Input value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <Button size="full" disabled={!text.trim() || markInvoice.isPending} onClick={() => markInvoice.mutate()}>{t('common.save')}</Button>
        </div>
      </Dialog>
    </div>
  )
}
