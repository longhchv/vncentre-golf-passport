import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, TableWrap, td, th } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { formatDate, formatDateTime } from '@/lib/i18nField'
import { cn } from '@/lib/utils'
import { callRpc } from '@/features/partners/shared'
import { CATEGORIES, TIERS, TIER_STYLE, digitsOnly, formatCode, formatVnd, type Tier } from './shared'

// Admin · Kho mã VNC (spec 12 mục 7): xem kho theo hạng / trạng thái, khoá hoặc mở số, tặng số, sửa bảng giá, nhật ký.

const STATUSES = ['available', 'reserved', 'assigned', 'gifted', 'sold', 'retired_alias'] as const

interface StockRow {
  code: string
  status: string
  tier: Tier
  categories: string[]
  is_primary: boolean
  list_price: number | null
  owner_name: string | null
  owner_code: string | null
  note: string | null
}
interface Stock {
  counts: { status: string; tier: Tier; n: number }[]
  rows: StockRow[]
}
interface PriceRow {
  tier: Tier
  price_from: number
  price_to: number | null
  valid_from: string
  valid_to: string | null
  current: boolean
}
interface EventRow {
  created_at: string
  code: string | null
  action: string
  detail: Record<string, unknown>
  student_name: string | null
  student_code: string | null
  actor_name: string | null
}

const tabClass = (on: boolean) =>
  cn('min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold', on ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15')

const ERRORS = ['code_not_available', 'code_not_locked', 'recipient_not_found', 'code_invalid', 'price_invalid', 'tier_invalid']

export function AdminVncPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'stock' | 'prices' | 'events'>('stock')
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('vncAdmin.title')}</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['stock', 'prices', 'events'] as const).map((k) => (
          <button key={k} type="button" className={tabClass(tab === k)} onClick={() => setTab(k)}>
            {t(`vncAdmin.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'stock' && <StockPanel />}
      {tab === 'prices' && <PricesPanel />}
      {tab === 'events' && <EventsPanel />}
    </div>
  )
}

function useErr() {
  const { t } = useTranslation()
  return (e: unknown) => {
    const m = (e as { message?: string } | null)?.message ?? ''
    return ERRORS.includes(m) ? t(`vncAdmin.errors.${m}`) : t('errors.generic')
  }
}

function StockPanel() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const err = useErr()
  const [status, setStatus] = useState('available')
  const [tier, setTier] = useState('')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [gifting, setGifting] = useState<string | null>(null)
  const size = 50
  const stock = useQuery({
    queryKey: ['vnc-admin-stock', status, tier, category, query, page],
    queryFn: () =>
      callRpc<Stock>('vnc_admin_stock', {
        p_status: status || null,
        p_tier: tier || null,
        p_category: category || null,
        p_query: query || null,
        p_limit: size,
        p_offset: page * size,
      }),
  })
  const lock = useMutation({
    mutationFn: (v: { code: string; locked: boolean }) => callRpc('vnc_admin_set_lock', { p_code: v.code, p_locked: v.locked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vnc-admin-stock'] }),
    onError: (e) => toast(err(e), 'error'),
  })

  const count = (s: string, tr: Tier) => stock.data?.counts.find((c) => c.status === s && c.tier === tr)?.n ?? 0
  const tiers: Tier[] = [...TIERS, 'thuong']

  return (
    <div className="space-y-4">
      {stock.data && (
        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>{t('vncAdmin.status')}</th>
                {tiers.map((tr) => (
                  <th key={tr} className={th}>{t(`vnc.tier.${tr}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10">
              {STATUSES.map((s) => (
                <tr key={s}>
                  <td className={td}>{t(`vncAdmin.statusName.${s}`)}</td>
                  {tiers.map((tr) => (
                    <td key={tr} className={cn(td, 'tabular-nums')}>{count(s, tr).toLocaleString(i18n.language)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <div className="grid gap-2 sm:grid-cols-4">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }}>
          <option value="">{t('vncAdmin.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(`vncAdmin.statusName.${s}`)}</option>
          ))}
        </Select>
        <Select value={tier} onChange={(e) => { setTier(e.target.value); setPage(0) }}>
          <option value="">{t('vncAdmin.allTiers')}</option>
          {tiers.map((tr) => (
            <option key={tr} value={tr}>{t(`vnc.tier.${tr}`)}</option>
          ))}
        </Select>
        <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(0) }}>
          <option value="">{t('vncAdmin.allCategories')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(`vnc.category.${c}`)}</option>
          ))}
        </Select>
        <Input inputMode="numeric" placeholder={t('vncAdmin.searchCode')} value={query}
          onChange={(e) => { setQuery(digitsOnly(e.target.value)); setPage(0) }} className="font-mono" />
      </div>
      {stock.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : stock.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>{t('vncAdmin.code')}</th>
                <th className={th}>{t('vncAdmin.tier')}</th>
                <th className={th}>{t('vncAdmin.status')}</th>
                <th className={th}>{t('vncAdmin.owner')}</th>
                <th className={th}>{t('vncAdmin.price')}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10">
              {stock.data.rows.map((r) => (
                <tr key={r.code}>
                  <td className={cn(td, 'font-mono font-bold whitespace-nowrap')}>{formatCode(r.code)}</td>
                  <td className={td}>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', TIER_STYLE[r.tier])}>{t(`vnc.tier.${r.tier}`)}</span>
                    <p className="mt-1 text-xs text-navy/60">{r.categories.map((c) => t(`vnc.category.${c}`, { defaultValue: c })).join(' · ')}</p>
                  </td>
                  <td className={td}>
                    {t(`vncAdmin.statusName.${r.status}`)}
                    {r.note && <p className="text-xs text-navy/60">{r.note}</p>}
                  </td>
                  <td className={td}>
                    {r.owner_name ? (
                      <>
                        {r.owner_name}
                        <p className="text-xs text-navy/60">{r.owner_code}{r.is_primary ? ` · ${t('vnc.primary')}` : ''}</p>
                      </>
                    ) : '—'}
                  </td>
                  <td className={cn(td, 'whitespace-nowrap')}>{formatVnd(r.list_price, i18n.language)}</td>
                  <td className={cn(td, 'whitespace-nowrap')}>
                    {(r.status === 'available' || r.status === 'reserved') && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" disabled={lock.isPending}
                          onClick={() => lock.mutate({ code: r.code, locked: r.status === 'available' })}>
                          {r.status === 'available' ? t('vncAdmin.lock') : t('vncAdmin.unlock')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setGifting(r.code)}>
                          {t('vncAdmin.gift')}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <div className="flex justify-between">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('vncAdmin.prev')}</Button>
        <Button variant="outline" size="sm" disabled={(stock.data?.rows.length ?? 0) < size} onClick={() => setPage(page + 1)}>{t('vncAdmin.next')}</Button>
      </div>
      <GiftDialog code={gifting} onClose={() => setGifting(null)} />
    </div>
  )
}

function GiftDialog({ code, onClose }: { code: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const err = useErr()
  const [recipient, setRecipient] = useState('')
  const [note, setNote] = useState('')
  const gift = useMutation({
    mutationFn: () => callRpc<{ full_name: string }>('vnc_admin_gift', { p_code: code, p_recipient: recipient, p_note: note || null }),
    onSuccess: (r) => {
      toast(t('vncAdmin.gifted', { code: code ? formatCode(code) : '', name: r.full_name }))
      qc.invalidateQueries({ queryKey: ['vnc-admin-stock'] })
      setRecipient('')
      setNote('')
      onClose()
    },
  })
  return (
    <Dialog open={Boolean(code)} onClose={onClose} title={t('vncAdmin.giftTitle', { code: code ? formatCode(code) : '' })}>
      <div className="space-y-4">
        <Field label={t('vncAdmin.recipient')} hint={t('vncAdmin.recipientHint')}>
          <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="VNC-012467" className="font-mono" />
        </Field>
        <Field label={t('vncAdmin.note')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('vncAdmin.notePlaceholder')} />
        </Field>
        <FormError message={gift.isError ? err(gift.error) : null} />
        <Button size="full" disabled={!recipient.trim() || gift.isPending} onClick={() => gift.mutate()}>
          {t('vncAdmin.giftConfirm')}
        </Button>
      </div>
    </Dialog>
  )
}

function PricesPanel() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const err = useErr()
  const prices = useQuery({ queryKey: ['vnc-admin-prices'], queryFn: () => callRpc<PriceRow[]>('vnc_admin_prices') })
  const [tier, setTier] = useState<string>('vang')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const save = useMutation({
    mutationFn: () =>
      callRpc('vnc_admin_set_price', {
        p_tier: tier,
        p_price_from: Number(from),
        p_price_to: to ? Number(to) : null,
        p_valid_from: validFrom || null,
      }),
    onSuccess: () => {
      toast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['vnc-admin-prices'] })
      setFrom('')
      setTo('')
    },
    onError: (e) => toast(err(e), 'error'),
  })
  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-5 sm:items-end">
        <Field label={t('vncAdmin.tier')}>
          <Select value={tier} onChange={(e) => setTier(e.target.value)}>
            {TIERS.map((k) => (
              <option key={k} value={k}>{t(`vnc.tier.${k}`)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('vncAdmin.priceFrom')}>
          <Input inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label={t('vncAdmin.priceTo')}>
          <Input inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label={t('vncAdmin.validFrom')}>
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </Field>
        <Button disabled={!from || save.isPending} onClick={() => save.mutate()}>{t('vncAdmin.savePrice')}</Button>
      </Card>
      <p className="text-sm text-navy/60">{t('vncAdmin.priceHint')}</p>
      {prices.data && (
        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>{t('vncAdmin.tier')}</th>
                <th className={th}>{t('vncAdmin.priceFrom')}</th>
                <th className={th}>{t('vncAdmin.priceTo')}</th>
                <th className={th}>{t('vncAdmin.validRange')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10">
              {prices.data.map((p, i) => (
                <tr key={i} className={p.current ? 'font-semibold' : 'text-navy/55'}>
                  <td className={td}>{t(`vnc.tier.${p.tier}`)}</td>
                  <td className={td}>{formatVnd(p.price_from, i18n.language)}</td>
                  <td className={td}>{p.price_to ? formatVnd(p.price_to, i18n.language) : '—'}</td>
                  <td className={td}>
                    {formatDate(p.valid_from, i18n.language)} – {p.valid_to ? formatDate(p.valid_to, i18n.language) : t('vncAdmin.now')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  )
}

function EventsPanel() {
  const { t, i18n } = useTranslation()
  const events = useQuery({ queryKey: ['vnc-admin-events'], queryFn: () => callRpc<EventRow[]>('vnc_admin_events', { p_limit: 200 }) })
  if (events.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (events.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  return (
    <TableWrap>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>{t('vncAdmin.time')}</th>
            <th className={th}>{t('vncAdmin.action')}</th>
            <th className={th}>{t('vncAdmin.code')}</th>
            <th className={th}>{t('vncAdmin.owner')}</th>
            <th className={th}>{t('vncAdmin.by')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy/10">
          {events.data.map((e, i) => (
            <tr key={i}>
              <td className={cn(td, 'whitespace-nowrap text-sm')}>{formatDateTime(e.created_at, i18n.language)}</td>
              <td className={td}>
                {t(`vncAdmin.actionName.${e.action}`)}
                {typeof e.detail?.note === 'string' && <p className="text-xs text-navy/60">{e.detail.note}</p>}
                {e.action === 'price' && (
                  <p className="text-xs text-navy/60">
                    {t(`vnc.tier.${String(e.detail.tier)}`)}: {formatVnd(Number(e.detail.price_from), i18n.language)}
                  </p>
                )}
              </td>
              <td className={cn(td, 'font-mono')}>{e.code ? formatCode(e.code) : '—'}</td>
              <td className={td}>{e.student_name ? `${e.student_name} (${e.student_code})` : '—'}</td>
              <td className={td}>{e.actor_name ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}
