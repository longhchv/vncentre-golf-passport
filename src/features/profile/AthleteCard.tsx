import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, HeartHandshake, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, useLocalized } from '@/lib/i18nField'
import { Badge, Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { StageBar } from '@/features/parent/ParentHomePage'
import { pointsLabel, rankLabel } from '@/features/league/format'
import { Avatar } from './StudentProfileView'

// Spec 15 mục 3.1 / 4: Thẻ VĐV và Giải thưởng & danh hiệu, dữ liệu từ student_athlete_card (máy chủ kiểm quyền:
// phụ huynh đã xác nhận, chính học viên, admin). Không có ngày sinh đầy đủ, liên hệ phụ huynh.

interface Named {
  name_vi: string
  name_en: string
}
export interface AthleteAward extends Named {
  played_on: string
  stage_no: number
  season: string
  kind: 'rank' | 'culture'
  code: string
}
export interface AthleteCardData {
  id: string
  student_code: string
  full_name: string
  avatar_path: string | null
  birth_year: number | null
  school: string | null
  level: (Named & { id: string; number: number }) | null
  stage: (Named & { number: number; color: string }) | null
  passport_tier: (Named & { code: string }) | null
  league: {
    season: string
    season_vi: string | null
    season_en: string | null
    total_points: number
    rank: number
    tied: boolean
    players: number
    stages_played: number
  } | null
  counts: { best_gross: number; winner: number; runner_up: number; culture_awards: number }
  graduated: boolean
  awards: AthleteAward[]
}

export function useAthleteCard(studentId: string) {
  return useQuery({
    queryKey: ['student_athlete_card', studentId],
    enabled: Boolean(studentId),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('student_athlete_card', { p_student_id: studentId })
      if (error) throw error
      return data as AthleteCardData | null
    },
  })
}

/** Khối 1 · Thẻ VĐV: ảnh, tên, mã VNC (bấm sao chép) · Level, 5 giai đoạn, hạng sổ · (đã thi) điểm, hạng, số chặng mùa, huy hiệu. */
export function AthleteCardView({ card }: { card: AthleteCardData }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const toast = useToast()
  const lg = card.league
  const c = card.counts

  async function copy() {
    try {
      await navigator.clipboard.writeText(card.student_code)
      toast(t('common.copied'))
    } catch {
      toast(card.student_code)
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center gap-4">
        <Avatar path={card.avatar_path} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold break-words">{card.full_name}</h1>
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-8 items-center gap-1.5 font-mono text-sm font-semibold text-bronze"
            aria-label={t('athlete.copyCode', { code: card.student_code })}
          >
            {card.student_code} <Copy className="h-3.5 w-3.5" aria-hidden />
          </button>
          {(card.school || card.birth_year) && (
            <p className="text-sm text-navy/60">
              {[card.school, card.birth_year ? t('leagueStaff.birthYear', { year: card.birth_year }) : null].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-navy/10 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">
            {card.level ? `Level ${card.level.number} · ${loc(card.level, 'name')}` : t('athlete.noLevel')}
          </p>
          {card.passport_tier && <Badge>{loc(card.passport_tier, 'name')}</Badge>}
        </div>
        <StageBar current={card.stage?.number ?? null} />
        {card.stage && (
          <p className="text-sm text-navy/65">
            {t('parent.stage', { n: card.stage.number })}: {loc(card.stage, 'name')}
          </p>
        )}
      </div>

      {lg && (
        <div className="space-y-2 border-t border-navy/10 pt-3">
          <p className="text-sm font-semibold text-navy/60">
            SNAG Golf League · {loc({ name_vi: lg.season_vi ?? lg.season, name_en: lg.season_en ?? lg.season }, 'name')}
          </p>
          <p className="text-lg font-bold">
            {t('athlete.points', { points: pointsLabel(lg.total_points, i18n.language) })} ·{' '}
            {t('athlete.rank', { rank: rankLabel(lg.rank, lg.tied), players: lg.players })} ·{' '}
            {t('athlete.stagesPlayed', { count: lg.stages_played })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {c.best_gross > 0 && <Badge tone="good">×{c.best_gross} Best Gross</Badge>}
            {c.winner > 0 && <Badge tone="good">×{c.winner} Winner</Badge>}
            {c.culture_awards > 0 && <Badge tone="good">{t('athlete.cultureBadge', { count: c.culture_awards })}</Badge>}
            {card.graduated && <Badge tone="warn">{t('league.graduated')}</Badge>}
          </div>
        </div>
      )}
    </Card>
  )
}

/** Khối 3 · Giải thưởng & danh hiệu: danh hiệu thi đấu và giải văn hoá ngang hàng (cùng cỡ chữ, cùng màu nhấn). */
export function AthleteAwards({ awards }: { awards: AthleteAward[] }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  if (awards.length === 0) return null
  return (
    <Card className="space-y-2 p-4">
      <h2 className="text-lg font-bold">{t('athlete.awardsTitle')}</h2>
      <ul className="divide-y divide-navy/10">
        {awards.map((a, i) => {
          const Icon = a.kind === 'rank' ? Trophy : HeartHandshake
          return (
            <li key={`${a.season}-${a.stage_no}-${a.kind}-${i}`} className="flex items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/25 text-brown">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-brown">{loc(a, 'name')}</p>
                <p className="text-sm text-navy/60">
                  {formatDate(a.played_on, i18n.language)} · {t('league.stageNo', { no: a.stage_no })}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
