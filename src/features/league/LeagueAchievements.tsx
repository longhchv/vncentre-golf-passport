import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Award, Download, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { formatDate, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { pointsLabel, rankLabel, toParLabel } from './format'

export interface LeagueStage {
  stage_no: number
  played_on: string
  venue: string | null
  season: string
  counts_for_ranking: boolean
  group: string | null
  to_par: number | null
  title_code: string | null
  title_vi: string | null
  title_en: string | null
  culture_code: string | null
  culture_vi: string | null
  culture_en: string | null
  points: number
}
export interface LeagueProfile {
  name: string | null
  anonymous: boolean
  season: string | null
  season_vi: string | null
  season_en: string | null
  total_points: number | null
  rank: number | null
  tied: boolean | null
  players: number | null
  stages_count: number
  best_gross_count: number
  graduated: boolean
  stages: LeagueStage[]
  certificates: { verify_code: string; title_vi: string | null; title_en: string | null; issued_at: string }[] | null
}

/**
 * Mục "Thành tích SNAG Golf League" trên /p/{mã} (spec 13 mục 6.1–6.2).
 * Máy chủ không gửi ngày sinh, trường, phụ huynh; tên theo quy tắc BXH. Không có thành tích thì không hiện gì.
 */
export function LeagueAchievements({ code }: { code: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const localized = useLocalized()
  const { session } = useAuth()
  const q = useQuery({
    queryKey: ['league_public_profile', code, session?.user.id ?? 'anon'],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('league_public_profile', { p_code: code })
      if (error) throw error
      return data as LeagueProfile | null
    },
  })
  const p = q.data
  if (!p) return null

  const stat = (label: string, value: string) => (
    <div className="rounded-xl bg-navy/5 px-3 py-2 text-center">
      <p className="text-xl font-bold text-navy">{value}</p>
      <p className="text-sm text-navy/65">{label}</p>
    </div>
  )

  return (
    <Card className="mx-auto w-full max-w-md space-y-4 p-4 text-left">
      <div className="flex items-start gap-3">
        <Trophy className="mt-0.5 h-6 w-6 shrink-0 text-bronze" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{t('league.title')}</h2>
          <p className="truncate text-navy/75">{p.anonymous ? t('league.anonymous') : p.name}</p>
          {p.season && <p className="text-sm text-navy/55">{localized(p, 'season')}</p>}
        </div>
        {p.graduated && <Badge tone="good">{t('league.graduated')}</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat(t('league.stages'), String(p.stages_count))}
        {stat(t('league.totalPoints'), pointsLabel(p.total_points, lang))}
        {stat(t('league.rank'), p.rank != null ? `${rankLabel(p.rank, p.tied)}/${p.players}` : '—')}
        {stat(t('league.bestGross'), String(p.best_gross_count))}
      </div>

      <ul className="divide-y divide-navy/10">
        {p.stages.map((s) => (
          <li key={`${s.season}-${s.stage_no}`} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="font-semibold">
                {t('league.stageNo', { no: s.stage_no })} · {formatDate(s.played_on, lang)}
              </p>
              <p className="text-sm text-navy/70">
                {[s.group, `${t('league.toPar')} ${toParLabel(s.to_par)}`].filter(Boolean).join(' · ')}
              </p>
              {(s.title_code || s.culture_code) && (
                <p className="flex flex-wrap items-center gap-1.5 pt-1 text-sm">
                  {s.title_code && (
                    <span className="inline-flex items-center gap-1 font-semibold text-brown">
                      <Award className="h-4 w-4" aria-hidden /> {localized(s, 'title')}
                    </span>
                  )}
                  {s.culture_code && <Badge tone="warn" className="text-xs">{localized(s, 'culture')}</Badge>}
                </p>
              )}
              {!s.counts_for_ranking && <p className="text-xs text-navy/55">{t('league.notRanked')}</p>}
            </div>
            <p className="shrink-0 text-right font-bold">{pointsLabel(s.points, lang)}</p>
          </li>
        ))}
      </ul>

      {p.certificates && p.certificates.length > 0 && (
        <div className="space-y-2 border-t border-navy/10 pt-3">
          {p.certificates.map((c) => (
            <Button key={c.verify_code} asChild variant="outline" size="full">
              <Link to={`/verify/${c.verify_code}`}>
                <Download className="h-4 w-4" aria-hidden /> {localized(c, 'title') || t('league.certificate')}
              </Link>
            </Button>
          ))}
        </div>
      )}
    </Card>
  )
}
