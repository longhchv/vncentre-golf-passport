import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Gift, Package, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { formatDateTime, formatVnd, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { pointsLabel } from '@/features/league/format'
import { callRpc } from '@/features/partners/shared'

// Spec 19 phần C (bước 5): kho quà, đổi quà (trừ điểm thưởng ngay khi đặt, hoàn khi huỷ), trạng thái đơn, phí ship qua payOS.
// Số dư, tồn kho, giới hạn đều kiểm lại trên máy chủ trong một giao dịch (gift_order_place).

type Pickup = 'league' | 'school' | 'office' | 'post'
type GiftStatus = 'placed' | 'prepared' | 'delivered' | 'shipped' | 'completed' | 'cancelled'
const PICKUPS: Pickup[] = ['league', 'school', 'office', 'post']

interface CatalogItem {
  id: string
  name_vi: string
  name_en: string | null
  kind: string
  description_vi: string | null
  description_en: string | null
  photo_path: string | null
  points: number
  stock: number
  per_student_limit: number | null
  ordered: number
}
interface Catalog {
  available: number
  frozen: number
  can_redeem: boolean
  items: CatalogItem[]
}
export interface GiftOrder {
  id: string
  student_id: string
  gift_vi: string
  gift_en: string | null
  photo_path: string | null
  qty: number
  points: number
  pickup: Pickup
  ship_address: { name: string; phone: string; address: string } | null
  ship_fee_vnd: number | null
  ship_order_id: string | null
  ship_order_status: string | null
  status: GiftStatus
  note: string | null
  cancel_reason: string | null
  created_at: string
  can_cancel: boolean
  full_name?: string
  student_code?: string
}

const STATUS_TONE: Record<GiftStatus, 'neutral' | 'good' | 'warn' | 'bad'> = {
  placed: 'warn',
  prepared: 'warn',
  delivered: 'good',
  shipped: 'good',
  completed: 'good',
  cancelled: 'bad',
}

const GIFT_ERRORS = [
  'insufficient_points',
  'out_of_stock',
  'limit_reached',
  'gift_unavailable',
  'address_required',
  'invalid_qty',
  'not_cancellable',
  'ship_fee_paid',
  'ship_fee_required',
  'ship_fee_unpaid',
  'invalid_transition',
  'invalid_fee',
  'note_required',
  'forbidden',
]
function useGiftError() {
  const { t } = useTranslation()
  return (e: unknown) => {
    const msg = (e as { message?: string } | null)?.message ?? ''
    return GIFT_ERRORS.includes(msg) ? t(`rewards.gifts.errors.${msg}`) : t('errors.generic')
  }
}

export function giftPhotoUrl(path: string | null) {
  return path ? supabase!.storage.from('gift-photos').getPublicUrl(path).data.publicUrl : null
}

function GiftThumb({ path, className }: { path: string | null; className?: string }) {
  const url = giftPhotoUrl(path)
  return url ? (
    <img src={url} alt="" loading="lazy" className={cn('rounded-xl bg-navy/5 object-cover', className)} />
  ) : (
    <div className={cn('flex items-center justify-center rounded-xl bg-navy/5 text-navy/30', className)}>
      <Gift className="h-8 w-8" />
    </div>
  )
}

/** Phụ huynh · Đổi quà cho một con: số dư khả dụng, danh mục quà, đơn quà của con. */
export function GiftShopPage() {
  const { studentId = '' } = useParams()
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const catalog = useQuery({
    queryKey: ['gift_catalog', studentId],
    enabled: Boolean(studentId),
    queryFn: () => callRpc<Catalog>('gift_catalog', { p_student_id: studentId }),
  })
  const [pick, setPick] = useState<CatalogItem | null>(null)
  const lang = i18n.language

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to={`/app/children/${studentId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
        <ArrowLeft className="h-4 w-4" /> {t('rewards.gifts.backToChild')}
      </Link>
      <h1 className="text-2xl font-bold">{t('rewards.gifts.title')}</h1>
      {catalog.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : catalog.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <>
          <Card className="p-4">
            <p className="text-sm font-semibold text-navy/70">{t('rewards.gifts.available')}</p>
            <p className="text-3xl font-bold">{pointsLabel(catalog.data.available, lang)}</p>
            {catalog.data.frozen > 0 && (
              <p className="text-sm text-navy/60">{t('rewards.wallet.frozen', { points: pointsLabel(catalog.data.frozen, lang) })}</p>
            )}
            {!catalog.data.can_redeem && <p className="mt-1 text-sm text-navy/60">{t('rewards.gifts.viewOnly')}</p>}
          </Card>
          {catalog.data.items.length === 0 ? (
            <p className="text-navy/60">{t('rewards.gifts.empty')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {catalog.data.items.map((g) => {
                const limitLeft = g.per_student_limit == null ? null : g.per_student_limit - Number(g.ordered)
                const blocked = g.stock <= 0 || limitLeft === 0 || g.points > catalog.data.available || !catalog.data.can_redeem
                return (
                  <Card key={g.id} className="flex gap-3 p-3">
                    <GiftThumb path={g.photo_path} className="h-24 w-24 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="font-semibold">{loc(g, 'name')}</p>
                      <p className="text-sm font-bold text-bronze">{t('rewards.gifts.points', { points: pointsLabel(g.points, lang) })}</p>
                      <p className="text-xs text-navy/60">
                        {g.stock > 0 ? t('rewards.gifts.inStock', { count: g.stock }) : t('rewards.gifts.outOfStock')}
                        {limitLeft != null ? ` · ${t('rewards.gifts.limitLeft', { count: Math.max(limitLeft, 0) })}` : ''}
                      </p>
                      <Button size="sm" className="mt-auto self-start" disabled={blocked} onClick={() => setPick(g)}>
                        {g.points > catalog.data.available && g.stock > 0 ? t('rewards.gifts.notEnough') : t('rewards.gifts.redeem')}
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
          <Dialog open={Boolean(pick)} onClose={() => setPick(null)} title={pick ? loc(pick, 'name') : ''}>
            {pick && <RedeemForm studentId={studentId} item={pick} available={catalog.data.available} onDone={() => setPick(null)} />}
          </Dialog>
        </>
      )}
      <ChildGiftOrders studentId={studentId} />
    </div>
  )
}

function RedeemForm({ studentId, item, available, onDone }: { studentId: string; item: CatalogItem; available: number; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const toast = useToast()
  const qc = useQueryClient()
  const errorText = useGiftError()
  const [qty, setQty] = useState(1)
  const [pickup, setPickup] = useState<Pickup>('league')
  const [addr, setAddr] = useState({ name: '', phone: '', address: '' })
  const [error, setError] = useState<string | null>(null)
  const lang = i18n.language
  const cost = item.points * qty
  const maxQty = Math.max(1, Math.min(item.stock, item.per_student_limit == null ? 20 : item.per_student_limit - Number(item.ordered), 20))
  const addrBad = pickup === 'post' && (!addr.name.trim() || !addr.address.trim() || !/^\+?[0-9 .]{9,15}$/.test(addr.phone.trim()))

  const place = useMutation({
    mutationFn: () =>
      callRpc('gift_order_place', {
        p_student_id: studentId,
        p_gift_id: item.id,
        p_qty: qty,
        p_pickup: pickup,
        p_ship_address: pickup === 'post' ? addr : null,
        p_note: null,
      }),
    onSuccess: () => {
      toast(t('rewards.gifts.placed'))
      void qc.invalidateQueries({ queryKey: ['gift_catalog', studentId] })
      void qc.invalidateQueries({ queryKey: ['gift_my_orders', studentId] })
      void qc.invalidateQueries({ queryKey: ['reward_balance', studentId] })
      onDone()
    },
    onError: (e) => setError(errorText(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <GiftThumb path={item.photo_path} className="h-20 w-20 shrink-0" />
        <p className="text-sm text-navy/70">{loc(item, 'description') || loc(item, 'name')}</p>
      </div>
      <Field label={t('rewards.gifts.qty')}>
        <Select value={qty} onChange={(e) => setQty(Number(e.target.value))}>
          {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('rewards.gifts.pickup')}>
        <Select value={pickup} onChange={(e) => setPickup(e.target.value as Pickup)}>
          {PICKUPS.map((p) => (
            <option key={p} value={p}>
              {t(`rewards.gifts.pickupOpt.${p}`)}
            </option>
          ))}
        </Select>
      </Field>
      {pickup === 'post' && (
        <div className="space-y-3 rounded-xl bg-navy/5 p-3">
          <p className="text-sm text-navy/70">{t('rewards.gifts.postHint')}</p>
          <Field label={t('rewards.gifts.addrName')}>
            <Input value={addr.name} onChange={(e) => setAddr({ ...addr, name: e.target.value })} autoComplete="name" />
          </Field>
          <Field label={t('rewards.gifts.addrPhone')}>
            <Input value={addr.phone} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} inputMode="tel" autoComplete="tel" />
          </Field>
          <Field label={t('rewards.gifts.addrAddress')}>
            <Textarea value={addr.address} onChange={(e) => setAddr({ ...addr, address: e.target.value })} autoComplete="street-address" />
          </Field>
        </div>
      )}
      <div className="space-y-1 rounded-xl ring-1 ring-navy/10 p-3 text-sm">
        <p className="flex justify-between"><span>{t('rewards.gifts.available')}</span><span className="font-semibold">{pointsLabel(available, lang)}</span></p>
        <p className="flex justify-between"><span>{t('rewards.gifts.willDeduct')}</span><span className="font-semibold text-red-700">−{pointsLabel(cost, lang)}</span></p>
        <p className="flex justify-between border-t border-navy/10 pt-1"><span>{t('rewards.gifts.after')}</span><span className="font-bold">{pointsLabel(available - cost, lang)}</span></p>
      </div>
      <p className="text-xs text-navy/60">{t('rewards.gifts.rankingUnchanged')}</p>
      <FormError message={error} />
      <Button size="full" disabled={cost > available || addrBad || place.isPending} onClick={() => place.mutate()}>
        {t('rewards.gifts.confirm', { points: pointsLabel(cost, lang) })}
      </Button>
    </div>
  )
}

function ChildGiftOrders({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const errorText = useGiftError()
  const orders = useQuery({
    queryKey: ['gift_my_orders', studentId],
    enabled: Boolean(studentId),
    queryFn: () => callRpc<GiftOrder[]>('gift_my_orders', { p_student_id: studentId }),
  })
  const [error, setError] = useState<string | null>(null)
  const cancel = useMutation({
    mutationFn: (id: string) => callRpc('gift_order_cancel', { p_order_id: id, p_reason: null }),
    onSuccess: () => {
      toast(t('rewards.gifts.cancelled'))
      setError(null)
      void qc.invalidateQueries({ queryKey: ['gift_my_orders', studentId] })
      void qc.invalidateQueries({ queryKey: ['gift_catalog', studentId] })
      void qc.invalidateQueries({ queryKey: ['reward_balance', studentId] })
    },
    onError: (e) => setError(errorText(e)),
  })
  if (!orders.data || orders.data.length === 0) return null
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-lg font-bold">{t('rewards.gifts.myOrders')}</h2>
      <FormError message={error} />
      <ul className="divide-y divide-navy/10">
        {orders.data.map((o) => (
          <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {loc({ name_vi: o.gift_vi, name_en: o.gift_en }, 'name')}
                {o.qty > 1 ? ` × ${o.qty}` : ''} · −{pointsLabel(o.points, i18n.language)}
              </p>
              <p className="text-xs text-navy/60">
                {formatDateTime(o.created_at, i18n.language)} · {t(`rewards.gifts.pickupOpt.${o.pickup}`)}
              </p>
              <Badge tone={STATUS_TONE[o.status]}>{t(`rewards.gifts.status.${o.status}`)}</Badge>
              {o.ship_order_id && o.ship_order_status === 'pending' && (
                <Link to={`/app/orders/${o.ship_order_id}`} className="ml-2 text-sm font-semibold text-bronze">
                  {t('rewards.gifts.payShip', { fee: formatVnd(Number(o.ship_fee_vnd), i18n.language) })}
                </Link>
              )}
            </div>
            {o.can_cancel && (
              <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(o.id)}>
                {t('rewards.gifts.cancel')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Admin · Kho quà
// ---------------------------------------------------------------------------------------------------------------
interface AdminGift {
  id: string
  name_vi: string
  name_en: string | null
  kind: string
  description_vi: string | null
  description_en: string | null
  photo_path: string | null
  points: number
  is_active: boolean
  per_student_limit: number | null
  sort_order: number
  stock: number
  open_orders: number
}
const KINDS = ['equipment', 'apparel', 'accessory', 'voucher', 'premium', 'other']
const emptyGift = {
  id: '',
  name_vi: '',
  name_en: '',
  kind: 'other',
  description_vi: '',
  description_en: '',
  photo_path: null as string | null,
  points: 100,
  is_active: true,
  per_student_limit: null as number | null,
  sort_order: 0,
}

export function GiftItemsPanel() {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const items = useQuery({ queryKey: ['gift_admin_items'], queryFn: () => callRpc<AdminGift[]>('gift_admin_items') })
  const [edit, setEdit] = useState<typeof emptyGift | null>(null)
  const [stockFor, setStockFor] = useState<AdminGift | null>(null)
  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setEdit({ ...emptyGift })}>
        <Plus className="h-4 w-4" /> {t('rewards.gifts.admin.add')}
      </Button>
      {items.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : items.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : items.data.length === 0 ? (
        <p className="text-navy/60">{t('rewards.gifts.admin.empty')}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.data.map((g) => (
            <Card key={g.id} className={cn('flex gap-3 p-3', !g.is_active && 'opacity-60')}>
              <GiftThumb path={g.photo_path} className="h-20 w-20 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold">{loc(g, 'name')}</p>
                <p className="text-sm">
                  {t('rewards.gifts.points', { points: pointsLabel(g.points, i18n.language) })} · {t('rewards.gifts.admin.stock', { count: g.stock })}
                  {g.open_orders > 0 ? ` · ${t('rewards.gifts.admin.openOrders', { count: g.open_orders })}` : ''}
                </p>
                {!g.is_active && <Badge>{t('rewards.gifts.admin.inactive')}</Badge>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setEdit({ ...emptyGift, ...g, name_en: g.name_en ?? '', description_vi: g.description_vi ?? '', description_en: g.description_en ?? '' })}>
                    {t('rewards.gifts.admin.edit')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStockFor(g)}>
                    <Package className="h-4 w-4" /> {t('rewards.gifts.admin.stockMove')}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? t('rewards.gifts.admin.edit') : t('rewards.gifts.admin.add')}>
        {edit && <GiftForm initial={edit} onDone={() => setEdit(null)} />}
      </Dialog>
      <Dialog open={Boolean(stockFor)} onClose={() => setStockFor(null)} title={t('rewards.gifts.admin.stockMove')}>
        {stockFor && <StockForm gift={stockFor} onDone={() => setStockFor(null)} />}
      </Dialog>
    </div>
  )
}

function GiftForm({ initial, onDone }: { initial: typeof emptyGift; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [f, setF] = useState(initial)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: async () => {
      let photo = f.photo_path
      if (file) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        photo = `${crypto.randomUUID()}.${ext}`
        const { error: e } = await supabase!.storage.from('gift-photos').upload(photo, file, { contentType: file.type })
        if (e) throw e
      }
      const row = {
        name_vi: f.name_vi.trim(),
        name_en: f.name_en.trim() || null,
        kind: f.kind,
        description_vi: f.description_vi.trim() || null,
        description_en: f.description_en.trim() || null,
        photo_path: photo,
        points: f.points,
        is_active: f.is_active,
        per_student_limit: f.per_student_limit || null,
        sort_order: f.sort_order,
      }
      const q = f.id ? supabase!.from('gift_items').update(row).eq('id', f.id) : supabase!.from('gift_items').insert(row)
      const { error: e } = await q
      if (e) throw e
    },
    onSuccess: () => {
      toast(t('common.saved'))
      void qc.invalidateQueries({ queryKey: ['gift_admin_items'] })
      onDone()
    },
    onError: () => setError(t('errors.generic')),
  })
  const bad = !f.name_vi.trim() || !(f.points > 0)
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('rewards.rules.nameVi')}>
          <Input value={f.name_vi} onChange={(e) => setF({ ...f, name_vi: e.target.value })} />
        </Field>
        <Field label={t('rewards.rules.nameEn')}>
          <Input value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
        </Field>
        <Field label={t('rewards.gifts.admin.kind')}>
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`rewards.gifts.kind.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('rewards.gifts.admin.pointsLabel')}>
          <Input type="number" inputMode="numeric" value={f.points} onChange={(e) => setF({ ...f, points: Number(e.target.value) })} />
        </Field>
        <Field label={t('rewards.gifts.admin.limit')} hint={t('rewards.gifts.admin.limitHint')}>
          <Input
            type="number"
            inputMode="numeric"
            value={f.per_student_limit ?? ''}
            onChange={(e) => setF({ ...f, per_student_limit: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <Field label={t('rewards.gifts.admin.sort')}>
          <Input type="number" inputMode="numeric" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label={t('rewards.gifts.admin.descVi')}>
        <Textarea value={f.description_vi} onChange={(e) => setF({ ...f, description_vi: e.target.value })} />
      </Field>
      <Field label={t('rewards.gifts.admin.descEn')}>
        <Textarea value={f.description_en} onChange={(e) => setF({ ...f, description_en: e.target.value })} />
      </Field>
      <Field label={t('rewards.gifts.admin.photo')}>
        <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <Checkbox label={t('rewards.gifts.admin.active')} checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
      <FormError message={error} />
      <Button size="full" disabled={bad || save.isPending} onClick={() => save.mutate()}>
        {t('common.save')}
      </Button>
    </div>
  )
}

function StockForm({ gift, onDone }: { gift: AdminGift; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const errorText = useGiftError()
  const [mode, setMode] = useState<'restock' | 'adjust'>('restock')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const n = Number(qty)
  const save = useMutation({
    mutationFn: () => callRpc<number>('gift_stock_add', { p_gift_id: gift.id, p_qty: n, p_reason: mode, p_note: note }),
    onSuccess: (stock) => {
      toast(t('rewards.gifts.admin.stockNow', { count: stock }))
      void qc.invalidateQueries({ queryKey: ['gift_admin_items'] })
      onDone()
    },
    onError: (e) => setError(errorText(e)),
  })
  const bad = !Number.isInteger(n) || n === 0 || (mode === 'restock' && n < 0) || (mode === 'adjust' && !note.trim())
  return (
    <div className="space-y-3">
      <p className="text-sm">{t('rewards.gifts.admin.stock', { count: gift.stock })}</p>
      <Field label={t('rewards.gifts.admin.moveType')}>
        <Select value={mode} onChange={(e) => setMode(e.target.value as 'restock' | 'adjust')}>
          <option value="restock">{t('rewards.gifts.admin.restock')}</option>
          <option value="adjust">{t('rewards.gifts.admin.adjust')}</option>
        </Select>
      </Field>
      <Field label={t('rewards.gifts.qty')} hint={mode === 'adjust' ? t('rewards.gifts.admin.adjustHint') : undefined}>
        <Input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
      <Field label={mode === 'adjust' ? t('rewards.record.noteRequired') : t('rewards.record.note')}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormError message={error} />
      <Button size="full" disabled={bad || save.isPending} onClick={() => save.mutate()}>
        {t('common.save')}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Admin · Đơn quà
// ---------------------------------------------------------------------------------------------------------------
const NEXT: Record<GiftStatus, GiftStatus[]> = {
  placed: ['prepared', 'delivered', 'shipped'],
  prepared: ['delivered', 'shipped'],
  delivered: ['completed'],
  shipped: ['completed'],
  completed: [],
  cancelled: [],
}

export function GiftOrdersPanel() {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const errorText = useGiftError()
  const [filter, setFilter] = useState('open')
  const orders = useQuery({
    queryKey: ['gift_admin_orders', filter],
    queryFn: () => callRpc<GiftOrder[]>('gift_admin_orders', { p_status: filter || null }),
  })
  const [error, setError] = useState<string | null>(null)
  const [feeFor, setFeeFor] = useState<GiftOrder | null>(null)
  const [fee, setFee] = useState('')
  const [cancelFor, setCancelFor] = useState<GiftOrder | null>(null)
  const [reason, setReason] = useState('')
  const refresh = () => void qc.invalidateQueries({ queryKey: ['gift_admin_orders'] })
  const done = (msg: string) => {
    toast(msg)
    setError(null)
    refresh()
    void qc.invalidateQueries({ queryKey: ['gift_admin_items'] })
  }
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: GiftStatus }) => callRpc('gift_order_set_status', { p_order_id: v.id, p_status: v.status }),
    onSuccess: () => done(t('common.saved')),
    onError: (e) => setError(errorText(e)),
  })
  const setShip = useMutation({
    mutationFn: () => callRpc('gift_order_set_ship_fee', { p_order_id: feeFor!.id, p_fee_vnd: Number(fee) }),
    onSuccess: () => {
      setFeeFor(null)
      setFee('')
      done(t('rewards.gifts.admin.feeSaved'))
    },
    onError: (e) => setError(errorText(e)),
  })
  const cancel = useMutation({
    mutationFn: () => callRpc('gift_order_cancel', { p_order_id: cancelFor!.id, p_reason: reason }),
    onSuccess: () => {
      setCancelFor(null)
      setReason('')
      done(t('rewards.gifts.cancelled'))
    },
    onError: (e) => setError(errorText(e)),
  })

  return (
    <div className="space-y-3">
      <Field label={t('rewards.gifts.admin.filter')} className="max-w-xs">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="open">{t('rewards.gifts.admin.open')}</option>
          <option value="">{t('rewards.ledger.all')}</option>
          {(['placed', 'prepared', 'delivered', 'shipped', 'completed', 'cancelled'] as GiftStatus[]).map((s) => (
            <option key={s} value={s}>
              {t(`rewards.gifts.status.${s}`)}
            </option>
          ))}
        </Select>
      </Field>
      <FormError message={error} />
      {orders.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : orders.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : orders.data.length === 0 ? (
        <p className="text-navy/60">{t('rewards.gifts.admin.noOrders')}</p>
      ) : (
        orders.data.map((o) => (
          <Card key={o.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">
                  {loc({ name_vi: o.gift_vi, name_en: o.gift_en }, 'name')}
                  {o.qty > 1 ? ` × ${o.qty}` : ''} · {pointsLabel(o.points, i18n.language)}
                </p>
                <p className="text-sm text-navy/70">
                  {o.full_name} · {o.student_code} · {formatDateTime(o.created_at, i18n.language)}
                </p>
                <p className="text-sm">{t(`rewards.gifts.pickupOpt.${o.pickup}`)}</p>
                {o.ship_address && (
                  <p className="text-sm text-navy/70">
                    {o.ship_address.name} · {o.ship_address.phone} · {o.ship_address.address}
                  </p>
                )}
                {o.pickup === 'post' && (
                  <p className="text-sm text-navy/70">
                    {o.ship_fee_vnd == null
                      ? t('rewards.gifts.admin.feeMissing')
                      : o.ship_fee_vnd === 0
                        ? t('rewards.gifts.admin.feeFree')
                        : t('rewards.gifts.admin.feeState', {
                            fee: formatVnd(Number(o.ship_fee_vnd), i18n.language),
                            status: t(`orders.status.${o.ship_order_status ?? 'pending'}`),
                          })}
                  </p>
                )}
                {o.cancel_reason && <p className="text-sm text-navy/60">{o.cancel_reason}</p>}
              </div>
              <Badge tone={STATUS_TONE[o.status]}>{t(`rewards.gifts.status.${o.status}`)}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {NEXT[o.status]
                .filter((s) => (s === 'delivered' ? o.pickup !== 'post' : s === 'shipped' ? o.pickup === 'post' : true))
                .map((s) => (
                  <Button key={s} size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: o.id, status: s })}>
                    {t(`rewards.gifts.admin.to.${s}`)}
                  </Button>
                ))}
              {o.pickup === 'post' && (o.status === 'placed' || o.status === 'prepared') && o.ship_order_status !== 'paid' && (
                <Button size="sm" variant="outline" onClick={() => setFeeFor(o)}>
                  {t('rewards.gifts.admin.setFee')}
                </Button>
              )}
              {(o.status === 'placed' || o.status === 'prepared') && (
                <Button size="sm" variant="ghost" onClick={() => setCancelFor(o)}>
                  {t('rewards.gifts.cancel')}
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
      <Dialog open={Boolean(feeFor)} onClose={() => setFeeFor(null)} title={t('rewards.gifts.admin.setFee')}>
        <div className="space-y-3">
          <p className="text-sm text-navy/70">{t('rewards.gifts.admin.feeHint')}</p>
          <Field label={t('rewards.gifts.admin.feeLabel')}>
            <Input type="number" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
          <Button size="full" disabled={fee === '' || Number(fee) < 0 || setShip.isPending} onClick={() => setShip.mutate()}>
            {t('common.save')}
          </Button>
        </div>
      </Dialog>
      <Dialog open={Boolean(cancelFor)} onClose={() => setCancelFor(null)} title={t('rewards.gifts.admin.cancelTitle')}>
        <div className="space-y-3">
          <p className="text-sm text-navy/70">{t('rewards.gifts.admin.cancelHint')}</p>
          <Field label={t('rewards.void.reason')}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button size="full" disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate()}>
            {t('rewards.gifts.cancel')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
