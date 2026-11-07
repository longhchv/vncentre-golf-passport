import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileSpreadsheet, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { EntityForm, type FieldSpec } from '@/features/admin/EntityForm'
import { errorMessage, useSaveRow, useTable } from '@/lib/db'
import { formatDate, formatDateTime, formatVnd, useLocalized } from '@/lib/i18nField'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// Admin · Golf Passport Partners giai đoạn 1 (spec 18 mục 5). Đối tác, ưu đãi ghi thẳng bảng (RLS admin);
// nhân viên quầy, lượt, đối soát, thưởng đi qua hàm SQL (migration 20261107000001).

type PartnerKind = 'golf_course' | 'driving_range' | 'restaurant' | 'cafe' | 'other'
type PartnerStatus = 'draft' | 'active' | 'paused' | 'ended'

interface Partner {
  id: string
  name: string
  kind: PartnerKind
  address: string | null
  lat: number | null
  lng: number | null
  photo_url: string | null
  description_vi: string | null
  description_en: string | null
  status: PartnerStatus
  fee_rate: number | string
  trial_start: string | null
  trial_end: string | null
  sales_owner_user_id: string | null
  contract_note: string | null
}

interface Offer {
  id: string
  partner_id: string
  name_vi: string
  name_en: string | null
  kind: 'percent' | 'bonus_item'
  percent: number | null
  bonus_vi: string | null
  bonus_en: string | null
  service_vi: string | null
  service_en: string | null
  conditions_vi: string | null
  conditions_en: string | null
  points_mode: 'per_amount' | 'fixed'
  fixed_points: number | null
  valid_from: string | null
  valid_to: string | null
  is_active: boolean
}

interface StaffRow {
  user_id: string
  role: 'cashier' | 'manager'
  full_name: string | null
  phone: string | null
  email: string | null
}

interface VisitRow {
  id: string
  created_at: string
  partner_id: string
  partner_name: string
  student_id: string
  student_name: string
  student_code: string | null
  offer_vi: string | null
  list_amount: number
  paid_amount: number
  invoice_no: string | null
  points: number
  status: 'recorded' | 'flagged' | 'void'
  void_reason: string | null
  cashier_name: string | null
  referral_amount: number | null
  referral_status: string | null
}

type SettlementStatus = 'draft' | 'sent' | 'confirmed' | 'paid'
interface Settlement {
  id: string
  partner_id: string
  month: string
  visits_count: number
  paid_total: number
  fee_rate: number | string
  fee_amount: number
  status: SettlementStatus
  confirmed_at: string | null
  partners: { name: string } | null
}

interface SettlementLine {
  created_at: string
  name: string
  offer_vi: string | null
  invoice_no: string | null
  list_amount: number
  paid_amount: number
  status: string
}

interface RewardsData {
  referrals: { user_id: string; full_name: string | null; visits: number; provisional_total: number; referred_count: number }[]
  commissions: {
    id: string
    full_name: string | null
    partner_name: string
    period: string
    basis_amount: number
    rate: number | string
    amount: number
    status: string
  }[]
  payouts_enabled: boolean
}

const KINDS: PartnerKind[] = ['golf_course', 'driving_range', 'restaurant', 'cafe', 'other']
const STATUSES: PartnerStatus[] = ['draft', 'active', 'paused', 'ended']
const TABS = ['partners', 'offers', 'staff', 'visits', 'settlements', 'rewards'] as const
type Tab = (typeof TABS)[number]

const NEXT_STATUS: Record<SettlementStatus, SettlementStatus[]> = {
  draft: ['sent'],
  sent: ['confirmed', 'draft'],
  confirmed: ['paid'],
  paid: [],
}

const KNOWN_ERRORS = ['user_not_found', 'settled', 'invalid_transition', 'reason_required', 'not_found', 'forbidden', 'invalid_role']

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) throw error
  return data as T
}

function useRpcError() {
  const { t } = useTranslation()
  return (err: unknown) => {
    const msg = (err as { message?: string })?.message ?? ''
    const known = KNOWN_ERRORS.find((k) => msg.includes(k))
    return known ? t(`partnersAdmin.errors.${known}`) : errorMessage(err, t)
  }
}

const pct = (rate: number | string | null | undefined) => `${Math.round(Number(rate ?? 0) * 1000) / 10}%`
const monthLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const thisMonth = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const PARTNER_TONE: Record<PartnerStatus, 'neutral' | 'good' | 'warn' | 'bad'> = { draft: 'neutral', active: 'good', paused: 'warn', ended: 'bad' }
const VISIT_TONE = { recorded: 'good', flagged: 'warn', void: 'bad' } as const
const SETTLEMENT_TONE: Record<SettlementStatus, 'neutral' | 'good' | 'warn'> = { draft: 'neutral', sent: 'warn', confirmed: 'good', paid: 'good' }

/** /admin/partners — đối tác, ưu đãi, nhân viên quầy, lượt, đối soát, thưởng tạm tính. */
export function PartnersAdminPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('partners')
  const partners = useTable<Partner>('partners', { order: 'name' })
  const [partnerId, setPartnerId] = useState('')
  const list = partners.data ?? []
  // Tab theo từng đối tác: mặc định đối tác đầu tiên
  const selected = partnerId || list[0]?.id || ''

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('partnersAdmin.title')}</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold',
              tab === k ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15',
            )}
          >
            {t(`partnersAdmin.tab.${k}`)}
          </button>
        ))}
      </div>
      {partners.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : partners.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <>
          {tab === 'partners' && <PartnersSection partners={list} />}
          {(tab === 'offers' || tab === 'staff') && (
            list.length === 0 ? (
              <p className="text-navy/60">{t('partnersAdmin.noPartners')}</p>
            ) : (
              <div className="space-y-4">
                <PartnerPicker partners={list} value={selected} onChange={setPartnerId} />
                {tab === 'offers' && <OffersSection partnerId={selected} />}
                {tab === 'staff' && <StaffSection partnerId={selected} />}
              </div>
            )
          )}
          {tab === 'visits' && <VisitsSection partners={list} />}
          {tab === 'settlements' && <SettlementsSection partners={list} />}
          {tab === 'rewards' && <RewardsSection />}
        </>
      )}
    </div>
  )
}

function PartnerPicker({
  partners,
  value,
  onChange,
  allowAll,
  className,
}: {
  partners: Partner[]
  value: string
  onChange: (id: string) => void
  allowAll?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <Field label={t('partnersAdmin.partner')} className={cn('max-w-sm', className)}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {allowAll && <option value="">{t('common.all')}</option>}
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}

// ---------------------------------------------------------------------------
// a. Đối tác
// ---------------------------------------------------------------------------
function PartnersSection({ partners }: { partners: Partner[] }) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState<Partner | 'new' | null>(null)
  const ownerIds = [...new Set(partners.map((p) => p.sales_owner_user_id).filter(Boolean))] as string[]
  const owners = useProfileNames(ownerIds)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t('partnersAdmin.tab.partners')}</h2>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> {t('common.add')}
        </Button>
      </div>
      <TableWrap>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>{t('partnersAdmin.fields.name')}</th>
              <th className={th}>{t('partnersAdmin.fields.kind')}</th>
              <th className={th}>{t('partnersAdmin.fields.status')}</th>
              <th className={th}>{t('partnersAdmin.fields.feeRate')}</th>
              <th className={th}>{t('partnersAdmin.fields.trial')}</th>
              <th className={th}>{t('partnersAdmin.fields.salesOwner')}</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/10">
            {partners.map((p) => (
              <tr key={p.id}>
                <td className={td}>
                  <span className="font-semibold">{p.name}</span>
                  {p.address && <span className="block text-sm text-navy/60">{p.address}</span>}
                </td>
                <td className={td}>{t(`partnersAdmin.kind.${p.kind}`)}</td>
                <td className={td}>
                  <Badge tone={PARTNER_TONE[p.status]}>{t(`partnersAdmin.status.${p.status}`)}</Badge>
                </td>
                <td className={td}>{pct(p.fee_rate)}</td>
                <td className={`${td} whitespace-nowrap text-sm`}>
                  {p.trial_start || p.trial_end
                    ? `${p.trial_start ? formatDate(p.trial_start, i18n.language) : '…'} – ${p.trial_end ? formatDate(p.trial_end, i18n.language) : '…'}`
                    : '—'}
                </td>
                <td className={td}>{(p.sales_owner_user_id && owners.data?.[p.sales_owner_user_id]) || '—'}</td>
                <td className={`${td} text-right`}>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label={t('common.edit')}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {partners.length === 0 && (
              <tr>
                <td className={`${td} text-navy/50`} colSpan={7}>
                  {t('common.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('partnersAdmin.addPartner') : t('partnersAdmin.editPartner')}
      >
        {editing !== null && <PartnerForm partner={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </section>
  )
}

function useProfileNames(ids: string[]) {
  return useQuery({
    queryKey: ['profile_names', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase!.from('profiles').select('user_id, full_name, email').in('user_id', ids)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((p) => [p.user_id, p.full_name || p.email || p.user_id])) as Record<string, string>
    },
  })
}

function PartnerForm({ partner, onDone }: { partner: Partner | null; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const save = useSaveRow('partners')
  const [owner, setOwner] = useState<string | null>(partner?.sales_owner_user_id ?? null)
  const opts = (prefix: string, values: string[]) => values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }))
  const fields: FieldSpec[] = [
    { name: 'name', labelKey: 'partnersAdmin.fields.name', required: true },
    { name: 'kind', labelKey: 'partnersAdmin.fields.kind', type: 'select', required: true, options: opts('partnersAdmin.kind', KINDS) },
    { name: 'status', labelKey: 'partnersAdmin.fields.status', type: 'select', required: true, options: opts('partnersAdmin.status', STATUSES) },
    { name: 'fee_pct', labelKey: 'partnersAdmin.fields.feeRate', type: 'number', required: true, hintKey: 'partnersAdmin.fields.feeRateHint' },
    { name: 'trial_start', labelKey: 'partnersAdmin.fields.trialStart', type: 'date' },
    { name: 'trial_end', labelKey: 'partnersAdmin.fields.trialEnd', type: 'date' },
    { name: 'address', labelKey: 'partnersAdmin.fields.address' },
    { name: 'lat', labelKey: 'partnersAdmin.fields.lat', type: 'number' },
    { name: 'lng', labelKey: 'partnersAdmin.fields.lng', type: 'number' },
    { name: 'photo_url', labelKey: 'partnersAdmin.fields.photoUrl' },
    { name: 'description_vi', labelKey: 'partnersAdmin.fields.descriptionVi', type: 'textarea' },
    { name: 'description_en', labelKey: 'partnersAdmin.fields.descriptionEn', type: 'textarea' },
    { name: 'contract_note', labelKey: 'partnersAdmin.fields.contractNote', type: 'textarea' },
  ]
  const initial = partner
    ? { ...partner, fee_pct: Math.round(Number(partner.fee_rate) * 1000) / 10 }
    : { kind: 'golf_course', status: 'draft', fee_pct: 5 }

  return (
    <div className="space-y-4">
      <SalesOwnerPicker value={owner} onChange={setOwner} />
      <EntityForm
        fields={fields}
        initial={initial}
        isEdit={Boolean(partner)}
        busy={save.isPending}
        onSubmit={(values) => {
          const { fee_pct, ...rest } = values
          const fee = Number(fee_pct)
          if (!(fee >= 5 && fee <= 10)) return toast(t('partnersAdmin.errors.feeRange'), 'error')
          const row = { ...rest, fee_rate: Math.round(fee * 10) / 1000, sales_owner_user_id: owner }
          save.mutate(partner ? { ...row, id: partner.id } : row, { onSuccess: onDone })
        }}
      />
    </div>
  )
}

/** Người chốt deal: tìm trong profiles theo tên / SĐT / email (admin đọc được profiles). */
function SalesOwnerPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const current = useProfileNames(value ? [value] : [])
  const results = useQuery({
    queryKey: ['profile_search', submitted],
    enabled: submitted.length >= 2,
    queryFn: async () => {
      const s = submitted.replace(/[,()%*]/g, ' ').trim()
      const { data, error } = await supabase!
        .from('profiles')
        .select('user_id, full_name, phone, email')
        .or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`)
        .order('full_name')
        .limit(10)
      if (error) throw error
      return data as { user_id: string; full_name: string | null; phone: string | null; email: string | null }[]
    },
  })

  return (
    <Card className="space-y-2 p-3">
      <p className="text-sm font-semibold text-navy/80">{t('partnersAdmin.fields.salesOwner')}</p>
      {value ? (
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold break-words">{current.data?.[value] ?? '…'}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)} aria-label={t('common.remove')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-navy/55">{t('partnersAdmin.salesOwnerNone')}</p>
      )}
      <div className="flex gap-2">
        <Input
          value={q}
          placeholder={t('partnersAdmin.salesOwnerSearch')}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              setSubmitted(q.trim())
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => setSubmitted(q.trim())} aria-label={t('common.search')}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
      {results.data && (
        <ul className="divide-y divide-navy/10">
          {results.data.map((p) => (
            <li key={p.user_id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-1 py-2 text-left hover:bg-navy/5"
                onClick={() => {
                  onChange(p.user_id)
                  setSubmitted('')
                  setQ('')
                }}
              >
                <span className="font-semibold">{p.full_name || '—'}</span>
                <span className="text-sm text-navy/60">{[p.phone, p.email].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
          {results.data.length === 0 && <li className="py-2 text-sm text-navy/55">{t('common.empty')}</li>}
        </ul>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// b. Ưu đãi
// ---------------------------------------------------------------------------
function OffersSection({ partnerId }: { partnerId: string }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const toast = useToast()
  const save = useSaveRow('partner_offers', ['partner_offers_of'])
  const [editing, setEditing] = useState<Offer | 'new' | null>(null)
  const offers = useQuery({
    queryKey: ['partner_offers_of', partnerId],
    queryFn: async () => {
      const { data, error } = await supabase!.from('partner_offers').select('*').eq('partner_id', partnerId).order('created_at')
      if (error) throw error
      return data as Offer[]
    },
  })
  const opts = (prefix: string, values: string[]) => values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }))
  const fields: FieldSpec[] = [
    { name: 'name_vi', labelKey: 'partnersAdmin.offer.nameVi', required: true },
    { name: 'name_en', labelKey: 'partnersAdmin.offer.nameEn' },
    { name: 'kind', labelKey: 'partnersAdmin.offer.kind', type: 'select', required: true, options: opts('partnersAdmin.offerKind', ['percent', 'bonus_item']) },
    { name: 'percent', labelKey: 'partnersAdmin.offer.percent', type: 'number', hintKey: 'partnersAdmin.offer.percentHint' },
    { name: 'bonus_vi', labelKey: 'partnersAdmin.offer.bonusVi', hintKey: 'partnersAdmin.offer.bonusHint' },
    { name: 'bonus_en', labelKey: 'partnersAdmin.offer.bonusEn' },
    { name: 'service_vi', labelKey: 'partnersAdmin.offer.serviceVi' },
    { name: 'service_en', labelKey: 'partnersAdmin.offer.serviceEn' },
    { name: 'conditions_vi', labelKey: 'partnersAdmin.offer.conditionsVi', type: 'textarea' },
    { name: 'conditions_en', labelKey: 'partnersAdmin.offer.conditionsEn', type: 'textarea' },
    { name: 'points_mode', labelKey: 'partnersAdmin.offer.pointsMode', type: 'select', required: true, options: opts('partnersAdmin.pointsMode', ['per_amount', 'fixed']) },
    { name: 'fixed_points', labelKey: 'partnersAdmin.offer.fixedPoints', type: 'number', hintKey: 'partnersAdmin.offer.fixedPointsHint' },
    { name: 'valid_from', labelKey: 'partnersAdmin.offer.validFrom', type: 'date' },
    { name: 'valid_to', labelKey: 'partnersAdmin.offer.validTo', type: 'date' },
    { name: 'is_active', labelKey: 'partnersAdmin.offer.isActive', type: 'checkbox' },
  ]

  function submit(values: Record<string, unknown>) {
    if (values.kind === 'percent') {
      const p = Number(values.percent)
      if (values.percent === null || !(p >= 10 && p <= 50)) return toast(t('partnersAdmin.errors.percentRange'), 'error')
    } else if (!values.bonus_vi) {
      return toast(t('partnersAdmin.errors.bonusRequired'), 'error')
    }
    if (values.points_mode === 'fixed' && (values.fixed_points === null || Number(values.fixed_points) < 0)) {
      return toast(t('partnersAdmin.errors.fixedPointsRequired'), 'error')
    }
    // Ưu đãi tặng kèm không mang phần trăm
    const row = { ...values, percent: values.kind === 'percent' ? values.percent : null }
    save.mutate(editing && editing !== 'new' ? { ...row, id: editing.id } : { ...row, partner_id: partnerId }, {
      onSuccess: () => setEditing(null),
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t('partnersAdmin.tab.offers')}</h2>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> {t('common.add')}
        </Button>
      </div>
      {offers.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : offers.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : offers.data.length === 0 ? (
        <p className="text-navy/60">{t('common.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {offers.data.map((o) => (
            <li key={o.id}>
              <Card className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold break-words">{loc(o, 'name')}</span>
                    <Badge tone={o.is_active ? 'good' : 'neutral'}>{o.is_active ? t('common.active') : t('common.inactive')}</Badge>
                  </div>
                  <p className="text-sm text-navy/70">
                    {o.kind === 'percent' ? t('partnersAdmin.offer.percentShort', { percent: o.percent }) : loc(o, 'bonus')}
                    {' · '}
                    {o.points_mode === 'fixed'
                      ? t('partnersAdmin.offer.fixedShort', { points: o.fixed_points })
                      : t('partnersAdmin.pointsMode.per_amount')}
                  </p>
                  {(o.valid_from || o.valid_to) && (
                    <p className="text-sm text-navy/55">
                      {o.valid_from ? formatDate(o.valid_from, i18n.language) : '…'} – {o.valid_to ? formatDate(o.valid_to, i18n.language) : '…'}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(o)} aria-label={t('common.edit')}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? t('partnersAdmin.addOffer') : t('partnersAdmin.editOffer')}>
        {editing !== null && (
          <EntityForm
            fields={fields}
            initial={editing === 'new' ? { kind: 'percent', points_mode: 'per_amount', is_active: true } : (editing as unknown as Record<string, unknown>)}
            isEdit={editing !== 'new'}
            busy={save.isPending}
            onSubmit={submit}
          />
        )}
      </Dialog>
    </section>
  )
}

// ---------------------------------------------------------------------------
// c. Nhân viên quầy
// ---------------------------------------------------------------------------
function StaffSection({ partnerId }: { partnerId: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const rpcError = useRpcError()
  const qc = useQueryClient()
  const [login, setLogin] = useState('')
  const [role, setRole] = useState<'cashier' | 'manager'>('cashier')
  const [error, setError] = useState<string | null>(null)
  const staff = useQuery({
    queryKey: ['partner_staff_list', partnerId],
    queryFn: () => rpc<StaffRow[]>('partner_staff_list', { p_partner_id: partnerId }),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['partner_staff_list', partnerId] })
  const add = useMutation({
    mutationFn: () => rpc('partner_staff_set', { p_partner_id: partnerId, p_login: login.trim(), p_role: role }),
    onSuccess: () => {
      setLogin('')
      setError(null)
      refresh()
      toast(t('common.saved'))
    },
    onError: (e) => setError(rpcError(e)),
  })
  const remove = useMutation({
    mutationFn: (userId: string) => rpc('partner_staff_set', { p_partner_id: partnerId, p_login: userId, p_remove: true }),
    onSuccess: () => {
      refresh()
      toast(t('common.saved'))
    },
    onError: (e) => toast(rpcError(e), 'error'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!login.trim()) return
    add.mutate()
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{t('partnersAdmin.tab.staff')}</h2>
      <Card className="p-4">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <Field label={t('partnersAdmin.staff.login')} hint={t('partnersAdmin.staff.loginHint')}>
              <Input value={login} onChange={(e) => setLogin(e.target.value)} required />
            </Field>
            <Field label={t('partnersAdmin.staff.role')}>
              <Select value={role} onChange={(e) => setRole(e.target.value as 'cashier' | 'manager')}>
                <option value="cashier">{t('partnersAdmin.staffRole.cashier')}</option>
                <option value="manager">{t('partnersAdmin.staffRole.manager')}</option>
              </Select>
            </Field>
          </div>
          <FormError message={error} />
          <Button type="submit" size="sm" disabled={add.isPending}>
            <Plus className="h-4 w-4" /> {t('partnersAdmin.staff.add')}
          </Button>
        </form>
      </Card>
      {staff.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : staff.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : staff.data.length === 0 ? (
        <p className="text-navy/60">{t('partnersAdmin.staff.none')}</p>
      ) : (
        <ul className="space-y-2">
          {staff.data.map((s) => (
            <li key={s.user_id}>
              <Card className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words">{s.full_name || '—'}</p>
                  <p className="text-sm break-words text-navy/60">{[s.phone, s.email].filter(Boolean).join(' · ')}</p>
                </div>
                <Badge>{t(`partnersAdmin.staffRole.${s.role}`)}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remove.isPending}
                  aria-label={t('common.remove')}
                  onClick={() => window.confirm(t('partnersAdmin.staff.confirmRemove', { name: s.full_name || s.email || '' })) && remove.mutate(s.user_id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// d. Lượt
// ---------------------------------------------------------------------------
function VisitsSection({ partners }: { partners: Partner[] }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const rpcError = useRpcError()
  const qc = useQueryClient()
  const [partnerId, setPartnerId] = useState('')
  const [status, setStatus] = useState('')
  const [month, setMonth] = useState(thisMonth())
  const [voiding, setVoiding] = useState<VisitRow | null>(null)
  const [reason, setReason] = useState('')
  const key = ['partner_admin_visits', partnerId, status, month]
  const visits = useQuery({
    queryKey: key,
    queryFn: () =>
      rpc<VisitRow[]>('partner_admin_visits', {
        p_partner_id: partnerId || null,
        p_status: status || null,
        p_month: month ? `${month}-01` : null,
      }),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['partner_admin_visits'] })
  const review = useMutation({
    mutationFn: (id: string) => rpc('partner_visit_review', { p_visit_id: id }),
    onSuccess: () => {
      refresh()
      toast(t('partnersAdmin.visits.reviewed'))
    },
    onError: (e) => toast(rpcError(e), 'error'),
  })
  const voidVisit = useMutation({
    mutationFn: () => rpc('partner_void_visit', { p_visit_id: voiding!.id, p_reason: reason.trim() }),
    onSuccess: () => {
      setVoiding(null)
      setReason('')
      refresh()
      toast(t('partnersAdmin.visits.voided'))
    },
    onError: (e) => toast(rpcError(e), 'error'),
  })
  const rows = visits.data ?? []

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{t('partnersAdmin.tab.visits')}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <PartnerPicker partners={partners} value={partnerId} onChange={setPartnerId} allowAll />
        <Field label={t('partnersAdmin.fields.status')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {(['flagged', 'recorded', 'void'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`partnersAdmin.visitStatus.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('partnersAdmin.month')}>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
      </div>
      {visits.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : visits.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <>
          <p className="text-sm text-navy/65">
            {t('partnersAdmin.visits.summary', {
              count: rows.length,
              paid: formatVnd(rows.filter((r) => r.status !== 'void').reduce((s, r) => s + Number(r.paid_amount), 0), i18n.language),
            })}
          </p>
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>{t('partnersAdmin.visits.time')}</th>
                  <th className={th}>{t('partnersAdmin.partner')}</th>
                  <th className={th}>{t('partnersAdmin.visits.customer')}</th>
                  <th className={th}>{t('partnersAdmin.visits.offer')}</th>
                  <th className={th}>{t('partnersAdmin.visits.listAmount')}</th>
                  <th className={th}>{t('partnersAdmin.visits.paidAmount')}</th>
                  <th className={th}>{t('partnersAdmin.visits.invoice')}</th>
                  <th className={th}>{t('partnersAdmin.visits.points')}</th>
                  <th className={th}>{t('partnersAdmin.fields.status')}</th>
                  <th className={th}>{t('partnersAdmin.visits.cashier')}</th>
                  <th className={th}>{t('partnersAdmin.visits.referral')}</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/10">
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td className={`${td} whitespace-nowrap text-sm`}>{formatDateTime(v.created_at, i18n.language)}</td>
                    <td className={td}>{v.partner_name}</td>
                    <td className={td}>
                      <span className="block">{v.student_name}</span>
                      {v.student_code && <span className="block font-mono text-sm text-navy/55">{v.student_code}</span>}
                    </td>
                    <td className={td}>{v.offer_vi || '—'}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatVnd(Number(v.list_amount), i18n.language)}</td>
                    <td className={`${td} whitespace-nowrap font-semibold`}>{formatVnd(Number(v.paid_amount), i18n.language)}</td>
                    <td className={td}>{v.invoice_no || '—'}</td>
                    <td className={td}>{v.points}</td>
                    <td className={td}>
                      <Badge tone={VISIT_TONE[v.status]}>{t(`partnersAdmin.visitStatus.${v.status}`)}</Badge>
                      {v.void_reason && <span className="mt-1 block text-sm text-navy/60">{v.void_reason}</span>}
                    </td>
                    <td className={td}>{v.cashier_name || '—'}</td>
                    <td className={`${td} whitespace-nowrap text-sm`}>
                      {v.referral_amount != null
                        ? `${formatVnd(Number(v.referral_amount), i18n.language)} · ${t(`partnersAdmin.rewardStatus.${v.referral_status}`, { defaultValue: v.referral_status ?? '' })}`
                        : '—'}
                    </td>
                    <td className={`${td} whitespace-nowrap text-right`}>
                      {v.status === 'flagged' && (
                        <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate(v.id)}>
                          <Check className="h-4 w-4" /> {t('partnersAdmin.visits.confirm')}
                        </Button>
                      )}
                      {v.status !== 'void' && (
                        <Button size="sm" variant="ghost" onClick={() => setVoiding(v)}>
                          {t('partnersAdmin.visits.void')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className={`${td} text-navy/50`} colSpan={12}>
                      {t('common.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}
      <Dialog open={voiding !== null} onClose={() => setVoiding(null)} title={t('partnersAdmin.visits.voidTitle')}>
        {voiding && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (reason.trim()) voidVisit.mutate()
            }}
          >
            <p className="text-navy/75">
              {voiding.partner_name} · {voiding.student_name} · {formatVnd(Number(voiding.paid_amount), i18n.language)}
            </p>
            <Field label={t('partnersAdmin.visits.voidReason') + ' *'} hint={t('partnersAdmin.visits.voidHint')}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
            </Field>
            <Button type="submit" size="full" disabled={voidVisit.isPending || !reason.trim()}>
              {t('partnersAdmin.visits.void')}
            </Button>
          </form>
        )}
      </Dialog>
    </section>
  )
}

// ---------------------------------------------------------------------------
// e. Đối soát
// ---------------------------------------------------------------------------
function SettlementsSection({ partners }: { partners: Partner[] }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const rpcError = useRpcError()
  const qc = useQueryClient()
  const [partnerId, setPartnerId] = useState('')
  const [month, setMonth] = useState(thisMonth())
  const settlements = useQuery({
    queryKey: ['partner_settlements', partnerId],
    queryFn: async () => {
      let q = supabase!.from('partner_settlements').select('*, partners(name)').order('month', { ascending: false })
      if (partnerId) q = q.eq('partner_id', partnerId)
      const { data, error } = await q
      if (error) throw error
      return data as unknown as Settlement[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['partner_settlements'] })
  const build = useMutation({
    mutationFn: () => rpc<string>('partner_settlement_build', { p_partner_id: partnerId, p_month: `${month}-01` }),
    onSuccess: () => {
      refresh()
      toast(t('partnersAdmin.settlements.built'))
    },
    onError: (e) => toast(rpcError(e), 'error'),
  })
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: SettlementStatus }) => rpc('partner_settlement_set_status', { p_id: v.id, p_status: v.status }),
    onSuccess: () => {
      refresh()
      toast(t('common.saved'))
    },
    onError: (e) => toast(rpcError(e), 'error'),
  })
  const [busyExport, setBusyExport] = useState<string | null>(null)

  async function withLines(s: Settlement, fn: (lines: SettlementLine[]) => void | Promise<void>) {
    setBusyExport(s.id)
    try {
      const lines = await rpc<SettlementLine[]>('partner_settlement_lines', { p_id: s.id })
      await fn(lines)
    } catch (e) {
      toast(rpcError(e), 'error')
    } finally {
      setBusyExport(null)
    }
  }

  const summaryRows = (s: Settlement): [string, string | number][] => [
    [t('partnersAdmin.partner'), s.partners?.name ?? ''],
    [t('partnersAdmin.month'), monthLabel(s.month)],
    [t('partnersAdmin.settlements.visits'), s.visits_count],
    [t('partnersAdmin.settlements.paidTotal'), Number(s.paid_total)],
    [t('partnersAdmin.fields.feeRate'), pct(s.fee_rate)],
    [t('partnersAdmin.settlements.feeAmount'), Number(s.fee_amount)],
    [t('partnersAdmin.fields.status'), t(`partnersAdmin.settlementStatus.${s.status}`)],
  ]
  const lineHeaders = [
    t('partnersAdmin.visits.time'),
    t('partnersAdmin.visits.customer'),
    t('partnersAdmin.visits.offer'),
    t('partnersAdmin.visits.invoice'),
    t('partnersAdmin.visits.listAmount'),
    t('partnersAdmin.visits.paidAmount'),
    t('partnersAdmin.fields.status'),
  ]
  const lineCells = (l: SettlementLine) => [
    formatDateTime(l.created_at, i18n.language),
    l.name,
    l.offer_vi ?? '',
    l.invoice_no ?? '',
    Number(l.list_amount),
    Number(l.paid_amount),
    t(`partnersAdmin.visitStatus.${l.status}`, { defaultValue: l.status }),
  ]
  const fileBase = (s: Settlement) =>
    `doi-soat-${(s.partners?.name ?? 'doi-tac')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .replace(/[^\w]+/g, '-')
      .toLowerCase()}-${s.month.slice(0, 7)}`

  const exportExcel = (s: Settlement) =>
    withLines(s, async (lines) => {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows(s)), t('partnersAdmin.settlements.sheetSummary').slice(0, 31))
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([lineHeaders, ...lines.map(lineCells)]),
        t('partnersAdmin.settlements.sheetLines').slice(0, 31),
      )
      XLSX.writeFile(wb, `${fileBase(s)}.xlsx`, { compression: true })
    })

  const printView = (s: Settlement) =>
    withLines(s, (lines) => {
      const w = window.open('', '_blank')
      if (!w) return toast(t('partnersAdmin.settlements.popupBlocked'), 'error')
      const money = (n: number) => formatVnd(n, i18n.language)
      const cell = (v: string | number, isMoney = false) => `<td${isMoney ? ' class="num"' : ''}>${esc(typeof v === 'number' && isMoney ? money(v) : String(v))}</td>`
      const summary = summaryRows(s)
        .map(([k, v], i) => `<tr><th>${esc(k)}</th>${cell(v, i === 3 || i === 5)}</tr>`)
        .join('')
      const body = lines
        .map((l) => `<tr>${lineCells(l).map((c, i) => cell(c, i === 4 || i === 5)).join('')}</tr>`)
        .join('')
      w.document.write(`<!doctype html><html lang="${i18n.language}"><head><meta charset="utf-8"><title>${esc(fileBase(s))}</title>
<style>body{font-family:system-ui,sans-serif;color:#13294b;margin:24px}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin:12px 0 24px}
th,td{border:1px solid #cfd6e0;padding:6px 8px;text-align:left;font-size:13px}th{background:#f2f4f7}.num{text-align:right;white-space:nowrap}
.summary{width:auto}.note{font-size:12px;color:#555}</style></head><body>
<h1>${esc(t('partnersAdmin.settlements.printTitle', { name: s.partners?.name ?? '', month: monthLabel(s.month) }))}</h1>
<table class="summary">${summary}</table>
<table><thead><tr>${lineHeaders.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
<p class="note">${esc(t('partnersAdmin.settlements.printNote'))}</p>
<script>window.onload=function(){window.print()}</script></body></html>`)
      w.document.close()
    })

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{t('partnersAdmin.tab.settlements')}</h2>
      <Card className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <PartnerPicker partners={partners} value={partnerId} onChange={setPartnerId} allowAll />
          <Field label={t('partnersAdmin.month')}>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
        </div>
        <p className="text-sm text-navy/60">{t('partnersAdmin.settlements.hint')}</p>
        <Button size="sm" disabled={!partnerId || !month || build.isPending} onClick={() => build.mutate()}>
          {t('partnersAdmin.settlements.build')}
        </Button>
      </Card>
      {settlements.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : settlements.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : settlements.data.length === 0 ? (
        <p className="text-navy/60">{t('common.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {settlements.data.map((s) => (
            <li key={s.id}>
              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {s.partners?.name} · {monthLabel(s.month)}
                  </p>
                  <Badge tone={SETTLEMENT_TONE[s.status]}>{t(`partnersAdmin.settlementStatus.${s.status}`)}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <Stat label={t('partnersAdmin.settlements.visits')} value={s.visits_count} />
                  <Stat label={t('partnersAdmin.settlements.paidTotal')} value={formatVnd(Number(s.paid_total), i18n.language)} />
                  <Stat label={t('partnersAdmin.fields.feeRate')} value={pct(s.fee_rate)} />
                  <Stat label={t('partnersAdmin.settlements.feeAmount')} value={formatVnd(Number(s.fee_amount), i18n.language)} strong />
                </dl>
                <div className="flex flex-wrap gap-2">
                  {NEXT_STATUS[s.status].map((next) => (
                    <Button
                      key={next}
                      size="sm"
                      variant={next === 'draft' ? 'ghost' : 'outline'}
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: s.id, status: next })}
                    >
                      {t(`partnersAdmin.settlements.to.${next}`)}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" disabled={busyExport === s.id} onClick={() => exportExcel(s)}>
                    <FileSpreadsheet className="h-4 w-4" /> Excel
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyExport === s.id} onClick={() => printView(s)}>
                    <Printer className="h-4 w-4" /> {t('partnersAdmin.settlements.print')}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function Stat({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div>
      <dt className="text-navy/55">{label}</dt>
      <dd className={cn('text-base', strong && 'font-bold')}>{value}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// f. Thưởng / hoa hồng tạm tính (chỉ xem)
// ---------------------------------------------------------------------------
function RewardsSection() {
  const { t, i18n } = useTranslation()
  const q = useQuery({ queryKey: ['partner_admin_rewards'], queryFn: () => rpc<RewardsData>('partner_admin_rewards') })
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">{t('partnersAdmin.tab.rewards')}</h2>
      <div className="rounded-2xl border-2 border-gold bg-gold/15 px-4 py-3">
        <p className="font-bold text-brown">{t('partnersAdmin.rewards.provisionalNote')}</p>
        <p className="text-sm text-brown/80">
          {q.data?.payouts_enabled ? t('partnersAdmin.rewards.payoutsOn') : t('partnersAdmin.rewards.payoutsOff')}
        </p>
      </div>
      {q.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : q.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <>
          <h3 className="text-lg font-bold">{t('partnersAdmin.rewards.referrals')}</h3>
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>{t('partnersAdmin.rewards.referrer')}</th>
                  <th className={th}>{t('partnersAdmin.rewards.referredCount')}</th>
                  <th className={th}>{t('partnersAdmin.rewards.visits')}</th>
                  <th className={th}>{t('partnersAdmin.rewards.provisionalTotal')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/10">
                {q.data.referrals.map((r) => (
                  <tr key={r.user_id}>
                    <td className={td}>{r.full_name || '—'}</td>
                    <td className={td}>{r.referred_count}</td>
                    <td className={td}>{r.visits}</td>
                    <td className={`${td} whitespace-nowrap font-semibold`}>{formatVnd(Number(r.provisional_total), i18n.language)}</td>
                  </tr>
                ))}
                {q.data.referrals.length === 0 && (
                  <tr>
                    <td className={`${td} text-navy/50`} colSpan={4}>
                      {t('common.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableWrap>
          <h3 className="text-lg font-bold">{t('partnersAdmin.rewards.commissions')}</h3>
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>{t('partnersAdmin.fields.salesOwner')}</th>
                  <th className={th}>{t('partnersAdmin.partner')}</th>
                  <th className={th}>{t('partnersAdmin.month')}</th>
                  <th className={th}>{t('partnersAdmin.rewards.basis')}</th>
                  <th className={th}>{t('partnersAdmin.rewards.rate')}</th>
                  <th className={th}>{t('partnersAdmin.rewards.amount')}</th>
                  <th className={th}>{t('partnersAdmin.fields.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/10">
                {q.data.commissions.map((c) => (
                  <tr key={c.id}>
                    <td className={td}>{c.full_name || '—'}</td>
                    <td className={td}>{c.partner_name}</td>
                    <td className={td}>{monthLabel(c.period)}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatVnd(Number(c.basis_amount), i18n.language)}</td>
                    <td className={td}>{pct(c.rate)}</td>
                    <td className={`${td} whitespace-nowrap font-semibold`}>{formatVnd(Number(c.amount), i18n.language)}</td>
                    <td className={td}>
                      <Badge tone={c.status === 'void' ? 'bad' : 'warn'}>
                        {t(`partnersAdmin.rewardStatus.${c.status}`, { defaultValue: c.status })}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {q.data.commissions.length === 0 && (
                  <tr>
                    <td className={`${td} text-navy/50`} colSpan={7}>
                      {t('common.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}
    </section>
  )
}
