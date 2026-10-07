import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Gift, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCode } from '@/lib/codes'
import { formatDate, formatDateTime, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Mascot } from '@/components/Mascot'

interface EventProfile {
  events: {
    event_name_vi: string; event_name_en: string; event_date: string; venue: string | null; zalo_oa_url: string | null
    code: string; completion_status: 'registered' | 'pending_review' | 'completed' | 'rejected'; completed_at: string | null
    scores: { name_vi: string; name_en: string; score: number | null }[]
    points: { total: number; redeemed: number; balance: number }
    redemptions: { points: number; gift_label: string | null; redeemed_at: string }[]
  }[]
  total_points: number
  balance: number
}

/** Hồ sơ trải nghiệm (E6): sự kiện đã chơi, điểm từng trạm, điểm tích luỹ, đổi quà (B18), mời học tiếp. */
export function EventExperience({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const q = useQuery({
    queryKey: ['event_profile', studentId],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('event_profile', { p_student_id: studentId })
      if (error) throw error
      return data as EventProfile
    },
  })
  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (q.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  const p = q.data
  const zalo = p.events.find((e) => e.zalo_oa_url)?.zalo_oa_url

  return (
    <div className="space-y-4">
      <Card className="space-y-1 bg-navy p-5 text-white">
        <p className="text-sm text-white/70">{t('eventExperience.balance')}</p>
        <p className="text-5xl font-bold text-gold">{p.balance}</p>
        <p className="text-sm text-white/70">{t('eventExperience.totalPoints', { total: p.total_points })}</p>
        <p className="text-xs text-white/60">{t('eventCard.pointsJourney')}</p>
      </Card>

      {p.events.map((e) => (
        <Card key={e.code} className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold">{loc(e, 'event_name')}</p>
              <p className="text-sm text-navy/60">{[formatDate(e.event_date, i18n.language), e.venue, formatCode(e.code)].filter(Boolean).join(' · ')}</p>
            </div>
            <Badge tone={e.completion_status === 'completed' ? 'good' : e.completion_status === 'rejected' ? 'bad' : 'warn'}>
              {t(`eventCard.completion.${e.completion_status}`)}
            </Badge>
          </div>
          <ul className="grid grid-cols-2 gap-2">
            {e.scores.map((s) => (
              <li key={s.name_vi} className="rounded-xl bg-gold/15 p-3">
                <p className="text-sm text-navy/65">{loc(s, 'name')}</p>
                <p className="text-2xl font-bold">{s.score ?? '—'}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-navy/70">
            {t('eventExperience.cardPoints', { total: e.points.total, balance: e.points.balance })}
          </p>
          {e.redemptions.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-sm font-semibold"><Gift className="h-4 w-4 text-bronze" /> {t('eventExperience.redeemed', { balance: e.points.balance })}</p>
              <ul className="space-y-0.5 text-sm text-navy/65">
                {e.redemptions.map((r) => (
                  <li key={r.redeemed_at}>{formatDateTime(r.redeemed_at, i18n.language)} · −{r.points}{r.gift_label ? ` · ${r.gift_label}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ))}

      <Card className="flex items-center gap-4 border-gold bg-gold/10 p-4">
        <Mascot className="h-16 w-16 shrink-0" />
        <div className="min-w-0 space-y-2">
          <p className="font-bold">{t('eventExperience.learnMore')}</p>
          <p className="text-sm text-navy/70">{t('eventExperience.learnMoreBody')}</p>
          {zalo && (
            <Button asChild size="sm" variant="outline">
              <a href={zalo} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> {t('eventCard.followZalo')}</a>
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
