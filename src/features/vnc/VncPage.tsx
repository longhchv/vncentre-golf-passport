import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, Star } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Input } from '@/components/ui/form'
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
              <div className="shrink-0 text-right">
                <TierBadge tier={c.tier} />
                <p className="mt-1 text-sm text-navy/70">{formatVnd(c.list_price, i18n.language)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-navy/60">{t('vnc.find.buySoon')}</p>
    </Card>
  )
}
