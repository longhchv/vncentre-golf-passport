import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, Star } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { callRpc } from '@/features/partners/shared'
import { TIERS, TIER_STYLE, digitsOnly, formatCode, formatVnd, type Tier, type VncCode } from './shared'

interface Person {
  student_id: string
  full_name: string
  student_code: string
  is_self: boolean
}

/**
 * Mã VNC của tôi (spec 12 mục 5–6): mã chính và các mã phụ của mình / của con, kèm hạng, nhóm, giá niêm yết hiện tại;
 * đổi mã chính; tìm số đẹp còn trống. Không có lời hứa đầu tư hay sinh lời.
 */
export function VncPage() {
  const { t } = useTranslation()
  const { session, loading } = useAuth()
  const people = useQuery({
    queryKey: ['vnc-people'],
    enabled: Boolean(session),
    queryFn: () => callRpc<Person[]>('vnc_my_people'),
  })
  const [who, setWho] = useState<string | null>(null)
  useEffect(() => {
    if (!who && people.data?.length) setWho(people.data[0].student_id)
  }, [people.data, who])

  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login?next=/vnc" replace />

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('vnc.title')}</h1>
        <p className="text-navy/70">{t('vnc.intro')}</p>
      </div>
      {people.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : !people.data?.length ? (
        <Card className="p-5 text-center text-navy/70">{t('vnc.noProfile')}</Card>
      ) : (
        <>
          {people.data.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {people.data.map((p) => (
                <button
                  key={p.student_id}
                  type="button"
                  onClick={() => setWho(p.student_id)}
                  className={cn(
                    'min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold',
                    who === p.student_id ? 'bg-navy text-white' : 'bg-white text-navy ring-1 ring-navy/15',
                  )}
                >
                  {p.is_self ? t('vnc.me') : p.full_name}
                </button>
              ))}
            </div>
          )}
          {who && <MyCodes studentId={who} />}
        </>
      )}
      <FindCodes />
    </div>
  )
}

function TierBadge({ tier }: { tier: Tier }) {
  const { t } = useTranslation()
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', TIER_STYLE[tier])}>{t(`vnc.tier.${tier}`)}</span>
}

function Categories({ list }: { list: string[] }) {
  const { t } = useTranslation()
  if (!list.length) return null
  return <p className="text-sm text-navy/65">{list.map((c) => t(`vnc.category.${c}`, { defaultValue: c })).join(' · ')}</p>
}

function MyCodes({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const codes = useQuery({ queryKey: ['vnc-my-codes', studentId], queryFn: () => callRpc<VncCode[]>('vnc_my_codes', { p_student_id: studentId }) })
  const setPrimary = useMutation({
    mutationFn: (code: string) => callRpc<string>('vnc_set_primary', { p_student_id: studentId, p_code: code }),
    onSuccess: async (code) => {
      toast(t('vnc.primaryChanged', { code }))
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['vnc-my-codes', studentId] }),
        qc.invalidateQueries({ queryKey: ['vnc-people'] }),
      ])
    },
    onError: () => toast(t('errors.generic'), 'error'),
  })

  if (codes.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (codes.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  return (
    <ul className="space-y-3">
      {codes.data.map((c) => (
        <li key={c.code}>
          <Card className={cn('space-y-2 p-4', c.is_primary && 'ring-2 ring-bronze')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-3xl font-bold tracking-wider">VNC-{formatCode(c.code)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {c.is_primary ? <Badge tone="good">{t('vnc.primary')}</Badge> : <Badge>{t('vnc.alias')}</Badge>}
                  <TierBadge tier={c.tier} />
                  {c.acquired_by && c.acquired_by !== 'cap' && <Badge tone="warn">{t(`vnc.acquired.${c.acquired_by}`)}</Badge>}
                </div>
              </div>
              {c.is_primary && <Star className="h-6 w-6 shrink-0 fill-gold text-bronze" />}
            </div>
            <Categories list={c.categories} />
            {c.tier !== 'thuong' && (
              <p className="text-sm text-navy/65">{t('vnc.listPrice', { price: formatVnd(c.list_price, i18n.language) })}</p>
            )}
            {!c.is_primary && (
              <Button variant="outline" size="sm" disabled={setPrimary.isPending} onClick={() => setPrimary.mutate(c.code)}>
                {t('vnc.makePrimary')}
              </Button>
            )}
          </Card>
        </li>
      ))}
      <p className="text-sm text-navy/60">{t('vnc.aliasHint')}</p>
    </ul>
  )
}

function FindCodes() {
  const { t, i18n } = useTranslation()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState<Tier | null>(null)
  const [buying, setBuying] = useState<VncCode | null>(null)
  const results = useQuery({
    queryKey: ['vnc-search', query, tier],
    enabled: query.length > 0 || tier !== null,
    queryFn: () => callRpc<VncCode[]>('vnc_search', { p_query: query || null, p_tier: tier, p_limit: 30 }),
  })

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold">{t('vnc.find.title')}</h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(input)
        }}
      >
        <Input inputMode="numeric" placeholder="727272" value={input} onChange={(e) => setInput(digitsOnly(e.target.value))} className="font-mono" />
        <Button type="submit" variant="outline" aria-label={t('vnc.find.search')}>
          <Search className="h-5 w-5" />
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {TIERS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTier(tier === k ? null : k)}
            className={cn('min-h-9 rounded-full px-3 text-sm font-semibold', tier === k ? 'bg-navy text-white' : 'bg-white ring-1 ring-navy/15')}
          >
            {t(`vnc.tier.${k}`)}
          </button>
        ))}
      </div>
      {results.isFetching && <p className="text-sm text-navy/60">{t('common.loading')}</p>}
      {results.data && results.data.length === 0 && <p className="text-sm text-navy/60">{t('vnc.find.none')}</p>}
      {results.data && results.data.length > 0 && (
        <ul className="divide-y divide-navy/10">
          {results.data.map((c) => (
            <li key={c.code} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="font-mono text-lg font-bold">
                  {formatCode(c.code)}
                  {c.match === 'exact' && <span className="ml-2 text-xs font-semibold text-emerald-700">{t('vnc.find.free')}</span>}
                </p>
                <Categories list={c.categories} />
              </div>
              <div className="flex shrink-0 items-center gap-2 text-right">
                <div>
                  <TierBadge tier={c.tier} />
                  <p className="mt-1 text-sm text-navy/70">{formatVnd(c.list_price, i18n.language)}</p>
                </div>
                {c.list_price != null && (
                  <Button size="sm" onClick={() => setBuying(c)}>
                    {t('vnc.buy.button')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-navy/60">{t('vnc.find.buyHint')}</p>
      <BuyDialog code={buying} onClose={() => setBuying(null)} />
    </Card>
  )
}

interface Preview {
  student_code: string
  masked_name: string
}

/** Mua số (đợt B): chọn người nhận → giữ số và tạo đơn theo giá niêm yết → trang đơn hàng (payOS). */
function BuyDialog({ code, onClose }: { code: VncCode | null; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const people = useQuery({ queryKey: ['vnc-people'], queryFn: () => callRpc<Person[]>('vnc_my_people') })
  const [target, setTarget] = useState<string>('')
  const [other, setOther] = useState('')
  const [error, setError] = useState<string | null>(null)
  const otherDigits = other.replace(/\D/g, '')
  const preview = useQuery({
    queryKey: ['vnc-recipient', otherDigits],
    enabled: target === 'other' && otherDigits.length === 6,
    queryFn: () => callRpc<Preview | null>('vnc_recipient_preview', { p_code: other }),
  })
  useEffect(() => {
    if (code) {
      setTarget(people.data?.[0]?.student_id ?? '')
      setOther('')
      setError(null)
    }
  }, [code, people.data])

  const place = useMutation({
    mutationFn: () =>
      callRpc<{ order_id: string }>('vnc_order_place', {
        p_code: code!.code,
        p_recipient: target === 'other' ? other : target || null,
      }),
    onSuccess: (r) => navigate(`/app/orders/${r.order_id}`),
    onError: (e) => {
      const m = (e as { message?: string }).message ?? ''
      setError(['code_not_available', 'recipient_not_found', 'not_for_sale'].includes(m) ? t(`vnc.buy.errors.${m}`) : t('errors.generic'))
    },
  })
  const ready = target === 'other' ? Boolean(preview.data) : Boolean(target)

  return (
    <Dialog open={Boolean(code)} onClose={onClose} title={t('vnc.buy.title')}>
      {code && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="font-mono text-3xl font-bold tracking-wider">VNC-{formatCode(code.code)}</p>
            <div className="mt-2 flex justify-center"><TierBadge tier={code.tier} /></div>
            <Categories list={code.categories} />
            <p className="mt-2 text-2xl font-bold">{formatVnd(code.list_price, i18n.language)}</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 font-semibold">{t('vnc.buy.for')}</legend>
            {(people.data ?? []).map((p) => (
              <label key={p.student_id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-navy/10">
                <input type="radio" name="vnc-target" checked={target === p.student_id} onChange={() => setTarget(p.student_id)} />
                <span>{p.is_self ? t('vnc.buy.myself') : p.full_name} <span className="text-sm text-navy/55">· {p.student_code}</span></span>
              </label>
            ))}
            <label className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-navy/10">
              <input type="radio" name="vnc-target" checked={target === 'other'} onChange={() => setTarget('other')} />
              <span>{t('vnc.buy.someoneElse')}</span>
            </label>
            {target === 'other' && (
              <Field label={t('vnc.buy.recipientCode')} hint={t('vnc.buy.recipientHint')}>
                <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="VNC-012467" className="font-mono" />
              </Field>
            )}
            {target === 'other' && otherDigits.length === 6 && !preview.isFetching && (
              <p className={cn('text-sm', preview.data ? 'text-emerald-700' : 'text-red-700')}>
                {preview.data ? t('vnc.buy.recipientFound', { name: preview.data.masked_name, code: preview.data.student_code }) : t('vnc.buy.errors.recipient_not_found')}
              </p>
            )}
          </fieldset>
          <p className="text-sm text-navy/60">{t('vnc.buy.holdHint')}</p>
          <FormError message={error} />
          <Button size="full" disabled={!ready || place.isPending} onClick={() => place.mutate()}>
            {place.isPending ? t('common.loading') : t('vnc.buy.confirm', { price: formatVnd(code.list_price, i18n.language) })}
          </Button>
        </div>
      )}
    </Dialog>
  )
}
