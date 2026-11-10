import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Gift, Medal, Star } from 'lucide-react'
import { formatDate, useLocalized } from '@/lib/i18nField'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { pointsLabel } from '@/features/league/format'
import { useAthleteCard } from '@/features/profile/AthleteCard'
import { callRpc } from '@/features/partners/shared'

// Spec 19 mục 6: ví điểm trên app phụ huynh — hai ô tách riêng: Điểm thưởng (đổi quà) và Điểm xếp hạng (chỉ xem).
// Bảo vệ trẻ em (nguyên tắc 7): chỉ số của chính con, không tên người khác, không so sánh giữa các con.

interface Named {
  name_vi: string
  name_en: string | null
}
export interface RewardLine {
  id: string
  delta: number
  reason: string
  created_at: string
  is_frozen: boolean
  note: string | null
  partner_name: string | null
  tournament: { series_vi: string; series_en: string; stage_no: number; season: string; played_on: string } | null
  tournament_note: string | null
  rule: Named | null
  gift?: (Named & { qty: number }) | null
  event?: (Named & { gift_label: string | null }) | null
}
export interface RewardWalletData {
  balance: number
  available: number
  frozen: number
  recent: RewardLine[]
}

export function useRewardWallet(studentId: string) {
  return useQuery({
    queryKey: ['reward_balance', studentId],
    enabled: Boolean(studentId),
    queryFn: () => callRpc<RewardWalletData>('reward_balance', { p_student_id: studentId }),
  })
}

const KNOWN_REASONS = [
  'tournament_result',
  'tournament_result_adjust',
  'partner_visit',
  'partner_visit_void',
  'admin_adjust',
  'manual_void',
  'gift_order',
  'gift_order_refund',
  'merge_transfer',
  'level_up',
  'level_up_adjust',
  'event_points',
  'event_redemption',
]

/** Tên nguồn của một dòng sổ (giải + chặng / đối tác / nguồn điểm / loại giao dịch). */
export function useRewardSource() {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  return (l: RewardLine): string => {
    if (l.tournament) {
      return t('rewards.source.tournament', {
        series: i18n.language === 'en' ? l.tournament.series_en : l.tournament.series_vi,
        stage: l.tournament.stage_no,
        season: l.tournament.season,
      })
    }
    if (l.tournament_note) return l.tournament_note
    if (l.event) {
      const what = l.reason === 'event_points' ? t('rewards.reason.event_points') : l.event.gift_label || t('rewards.reason.event_redemption')
      return `${loc(l.event, 'name')} · ${what}`
    }
    if (l.gift) return `${t('rewards.reason.gift_order')} · ${loc(l.gift, 'name')}${l.gift.qty > 1 ? ` × ${l.gift.qty}` : ''}`
    if (l.partner_name) return l.partner_name
    if (l.rule) return loc(l.rule, 'name')
    return KNOWN_REASONS.includes(l.reason) ? t(`rewards.reason.${l.reason}`) : l.reason
  }
}

export function RewardWallet({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation()
  const wallet = useRewardWallet(studentId)
  const card = useAthleteCard(studentId)
  const source = useRewardSource()
  const [all, setAll] = useState(false)
  const lang = i18n.language
  const league = card.data?.league ?? null
  const lines = wallet.data?.recent ?? []
  const shown = all ? lines : lines.slice(0, 5)

  return (
    <Card className="space-y-4 p-4">
      <h2 className="text-lg font-bold">{t('rewards.wallet.title')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-bronze/30 bg-bronze/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-navy/70">
            <Star className="h-4 w-4 text-bronze" /> {t('rewards.wallet.rewardTitle')}
          </p>
          <p className="mt-1 text-2xl font-bold">
            {wallet.isPending ? '…' : wallet.isError ? '—' : pointsLabel(Number(wallet.data.available ?? wallet.data.balance), lang)}
          </p>
          <p className="text-xs text-navy/60">{t('rewards.wallet.rewardHint')}</p>
          {wallet.data && Number(wallet.data.frozen) > 0 && (
            <p className="mt-1 text-xs font-semibold text-navy/70">
              {t('rewards.wallet.frozen', { points: pointsLabel(Number(wallet.data.frozen), lang) })}
            </p>
          )}
          <Button asChild size="sm" className="mt-2">
            <Link to={`/app/children/${studentId}/gifts`}>
              <Gift className="h-4 w-4" /> {t('rewards.wallet.redeem')}
            </Link>
          </Button>
        </div>
        <div className="rounded-xl border border-navy/15 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-navy/70">
            <Medal className="h-4 w-4 text-navy/60" /> {t('rewards.wallet.rankingTitle')}
          </p>
          <p className="mt-1 text-2xl font-bold">{league ? pointsLabel(league.total_points, lang) : '—'}</p>
          <p className="text-xs text-navy/60">
            {league
              ? t('rewards.wallet.rankingSeason', { season: (lang === 'en' ? league.season_en : league.season_vi) || league.season })
              : t('rewards.wallet.rankingNone')}
          </p>
          <p className="text-xs text-navy/60">{t('rewards.wallet.rankingHint')}</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">{t('rewards.wallet.historyTitle')}</h3>
        {wallet.isError ? (
          <p className="mt-1 text-sm text-red-700">{t('errors.loadFailed')}</p>
        ) : lines.length === 0 ? (
          <p className="mt-1 text-sm text-navy/60">{wallet.isPending ? t('common.loading') : t('rewards.wallet.historyEmpty')}</p>
        ) : (
          <ul className="mt-1 divide-y divide-navy/10">
            {shown.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium break-words">
                    {source(l)}
                    {(l.reason.endsWith('_adjust') || l.reason.endsWith('_void') || l.reason === 'gift_order_refund') && (
                      <span className="text-navy/60"> · {t(`rewards.reason.${l.reason}`)}</span>
                    )}
                  </p>
                  <p className="text-xs text-navy/60">
                    {formatDate(l.created_at.slice(0, 10), lang)}
                    {l.note ? ` · ${l.note}` : ''}
                    {l.is_frozen ? ` · ${t('rewards.wallet.frozenTag')}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${l.delta < 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {l.delta > 0 ? '+' : '−'}
                  {pointsLabel(Math.abs(l.delta), lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {lines.length > 5 && (
          <button type="button" className="mt-1 text-sm font-semibold text-bronze" onClick={() => setAll((v) => !v)}>
            {all ? t('rewards.wallet.showLess') : t('rewards.wallet.showAll', { count: lines.length })}
          </button>
        )}
      </div>
    </Card>
  )
}
