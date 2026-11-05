import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Phone, QrCode, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { FormError, Input } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { QrScanner } from '@/features/passports/QrScanner'
import { LeagueAchievementsCard, type LeagueProfile } from './LeagueAchievements'
import { StudentCodeRedirect, isStudentCode } from './studentCode'

// Khu BTC giải (spec 14 mục 1.3). Chỉ xem; quyền thực thi ở hàm SQL league_staff_search / league_staff_student
// (migration 20261105000005): chỉ VĐV đã thi SNAG hoặc có yêu cầu cấp mã từ app giải, mỗi lần mở hồ sơ ghi audit.

interface LeagueStaffRow {
  id: string
  student_code: string
  full_name: string
  birth_year: number | null
  school_name: string | null
  stages_count: number
}

interface LeagueStaffStudent {
  id: string
  student_code: string
  full_name: string
  birth_year: number | null
  school: string | null
  passports: { passport_code: string; status: string; tier_code: string; tier_vi: string; tier_en: string }[]
  guardians: { full_name: string | null; phone: string | null; relationship: string | null; is_primary: boolean }[]
  league: LeagueProfile | null
}

async function search(q: string) {
  const { data, error } = await supabase!.rpc('league_staff_search', { p_query: q || null, p_limit: 50 })
  if (error) throw error
  return data as LeagueStaffRow[]
}

/** /league · tìm VĐV theo mã VNC, tên, SĐT phụ huynh hoặc mã sổ. */
export function LeagueStaffHome() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const submitted = params.get('q') ?? ''
  const [query, setQuery] = useState(submitted)
  const results = useQuery({
    queryKey: ['league_staff_search', submitted],
    enabled: submitted.length > 0,
    queryFn: () => search(submitted),
  })

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('leagueStaff.title')}</h1>
        <Button asChild size="sm" variant="outline">
          <Link to="/league/scan">
            <QrCode className="h-4 w-4" /> {t('leagueStaff.nav.scan')}
          </Link>
        </Button>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const q = query.trim()
          setParams(q ? { q } : {}, { replace: true })
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('leagueStaff.searchPlaceholder')} />
        <Button type="submit" aria-label={t('common.search')}>
          <Search className="h-5 w-5" />
        </Button>
      </form>

      {!submitted ? (
        <p className="text-navy/60">{t('leagueStaff.searchHint')}</p>
      ) : results.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : results.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : results.data.length === 0 ? (
        <p className="text-navy/60">{t('leagueStaff.noResult')}</p>
      ) : (
        <ul className="space-y-2">
          {results.data.map((s) => (
            <li key={s.id}>
              <Link to={`/league/students/${s.id}`}>
                <Card className="flex items-center justify-between gap-3 p-4 hover:bg-navy/3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.full_name}</p>
                    <p className="text-sm text-navy/60">
                      {[s.student_code, s.birth_year ? t('leagueStaff.birthYear', { year: s.birth_year }) : null, s.school_name]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Badge>{t('leagueStaff.stages', { count: s.stages_count })}</Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** /league/scan · quét QR thẻ / sổ → mở thẳng hồ sơ VĐV nếu nằm trong phạm vi BTC được xem. */
export function LeagueStaffScanPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState(0)

  const onCode = useCallback(
    async (code: string) => {
      setError(null)
      try {
        const rows = await search(code)
        if (rows.length === 1) {
          navigate(`/league/students/${rows[0].id}`)
          return
        }
        setError(rows.length === 0 ? t('leagueStaff.scanNotFound') : t('leagueStaff.scanMany'))
      } catch {
        setError(t('errors.generic'))
      }
      setKey((k) => k + 1)
    },
    [navigate, t],
  )

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t('leagueStaff.nav.scan')}</h1>
      <QrScanner key={key} onCode={onCode} />
      <FormError message={error} />
    </div>
  )
}

/** /league/students/:id · hồ sơ rút gọn: tên, năm sinh, trường, mã VNC, sổ, phụ huynh (gọi được), thành tích SNAG. */
export function LeagueStaffStudentPage() {
  const { studentId = '' } = useParams()
  // App giải mở bằng mã VNC: /league/students/VNC-002279 (spec 14 bước 4); ngoài phạm vi BTC → không tìm thấy
  if (isStudentCode(studentId))
    return (
      <StudentCodeRedirect
        code={studentId}
        base="/league/students"
        resolve={async (code) => (await search(code)).find((r) => r.student_code === code)?.id ?? null}
      />
    )
  return <LeagueStaffStudent studentId={studentId} />
}

function LeagueStaffStudent({ studentId }: { studentId: string }) {
  const { t } = useTranslation()
  const localized = useLocalized()
  const q = useQuery({
    queryKey: ['league_staff_student', studentId],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('league_staff_student', { p_student_id: studentId })
      if (error) throw error
      return data as LeagueStaffStudent
    },
  })

  const back = (
    <Link to="/league" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
      <ArrowLeft className="h-4 w-4" /> {t('leagueStaff.title')}
    </Link>
  )
  if (q.isPending) return <div className="mx-auto max-w-lg space-y-4">{back}<p className="text-navy/60">{t('common.loading')}</p></div>
  if (q.isError)
    return (
      <div className="mx-auto max-w-lg space-y-4">
        {back}
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <Mascot />
          <p className="font-semibold">{t('leagueStaff.noAccess')}</p>
        </Card>
      </div>
    )

  const s = q.data
  return (
    <div className="mx-auto max-w-lg space-y-4">
      {back}
      <Card className="space-y-2 p-4">
        <h1 className="text-xl font-bold">{s.full_name}</h1>
        <p className="text-navy/70">
          {[s.student_code, s.birth_year ? t('leagueStaff.birthYear', { year: s.birth_year }) : null, s.school].filter(Boolean).join(' · ')}
        </p>
        {s.passports.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {s.passports.map((p) => (
              <Badge key={p.passport_code}>
                <span className="font-mono">{p.passport_code}</span> · {localized(p, 'tier')} · {t(`passportStatus.${p.status}`, { defaultValue: p.status })}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-bold">{t('leagueStaff.guardians')}</h2>
        {s.guardians.length === 0 ? (
          <p className="text-navy/60">{t('students.noGuardians')}</p>
        ) : (
          <ul className="divide-y divide-navy/10">
            {s.guardians.map((g, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{g.full_name || '—'}</p>
                  <p className="text-sm text-navy/60">
                    {[g.relationship ? t(`relationship.${g.relationship}`) : null, g.is_primary ? t('students.primary') : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {g.phone && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`tel:${g.phone}`}>
                      <Phone className="h-4 w-4" /> {g.phone}
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {s.league ? <LeagueAchievementsCard profile={s.league} className="w-full" /> : <p className="text-navy/60">{t('leagueStaff.noStages')}</p>}
    </div>
  )
}
