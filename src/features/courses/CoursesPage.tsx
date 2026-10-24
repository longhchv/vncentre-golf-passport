// Màn 1 · Danh sách sân (bản mẫu docs/mockups/quan-tri-san/Main.dc.html)
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { useCourses, useCourseStats } from './api'
import { countryName } from './meta'
import { Chip, KindTag, StatusTag, StickyActions, errText, fmtDate } from './parts'

type Scope = 'all' | 'vn' | 'intl'
type KindF = 'all' | 'rated' | 'experience'
type StatusF = 'all' | 'draft' | 'published'

export function CoursesPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const courses = useCourses()
  const stats = useCourseStats()
  const [scope, setScope] = useState<Scope>('all')
  const [kind, setKind] = useState<KindF>('all')
  const [status, setStatus] = useState<StatusF>('all')
  const [q, setQ] = useState('')

  const all = useMemo(() => courses.data ?? [], [courses.data])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return all
      .filter((c) => scope === 'all' || (scope === 'vn') === (c.country === 'VN'))
      .filter((c) => kind === 'all' || c.kind === kind)
      .filter((c) => status === 'all' || c.status === status)
      .filter((c) => !s || [c.name, c.name_en, c.province].some((x) => x?.toLowerCase().includes(s)))
  }, [all, scope, kind, status, q])

  if (courses.isPending) return <FullPageSpinner />
  const published = all.filter((c) => c.status === 'published').length

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="-mx-4 -mt-6 bg-navy px-5 pt-5 pb-4 text-white lg:mx-0 lg:mt-0 lg:rounded-2xl">
        <p className="text-xs font-semibold tracking-wider text-gold uppercase">{t('courses.eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold">{t('courses.title')}</h1>
        <p className="mt-1 text-sm text-white/75">{t('courses.count', { n: all.length, p: published })}</p>
      </div>

      <FormError message={courses.error ? errText(courses.error, t) : null} />

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(['all', 'vn', 'intl'] as Scope[]).map((k) => (
            <Chip key={k} on={scope === k} onClick={() => setScope(k)}>{t(`courses.scope.${k}`)}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'experience', 'rated'] as KindF[]).map((k) => (
            <Chip key={k} on={kind === k} onClick={() => setKind(k)} className="min-h-9 px-3 text-xs">{k === 'all' ? t('courses.allKinds') : t(`courses.kind.${k}`)}</Chip>
          ))}
          {(['all', 'draft', 'published'] as StatusF[]).map((k) => (
            <Chip key={k} on={status === k} onClick={() => setStatus(k)} className="min-h-9 px-3 text-xs">{k === 'all' ? t('courses.allStatus') : t(`courses.status.${k}`)}</Chip>
          ))}
        </div>
        {all.length > 6 && (
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('courses.searchPh')}
            aria-label={t('common.search')}
            className="min-h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-base"
          />
        )}
      </div>

      <div className="space-y-3">
        {list.map((c) => {
          const st = stats.data?.[c.id]
          const meta = [
            c.holes ? t('courses.holesN', { n: c.holes }) : null,
            st ? t('courses.photosN', { n: st.photos }) : null,
            st?.places ? t('courses.placesN', { n: st.places }) : null,
            t('courses.updated', { d: fmtDate(c.updated_at, lang) }),
          ].filter(Boolean).join(' · ')
          return (
            <Link
              key={c.id}
              to={`/admin/courses/${c.id}/${c.kind === 'rated' ? 'photos' : 'info'}`}
              className="flex flex-col gap-1.5 rounded-2xl border border-navy/10 bg-white px-4 py-3.5 shadow-sm hover:border-bronze/50"
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <KindTag kind={c.kind} />
                <StatusTag status={c.status} />
                <span className="text-xs text-navy/60">{[c.province, countryName(c.country, lang)].filter(Boolean).join(', ')}</span>
              </span>
              <span className="text-[17px] font-semibold">{c.name}</span>
              <span className="text-sm text-navy/60">{meta}</span>
            </Link>
          )
        })}
        {!list.length && (
          <p className="rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-navy/60">
            {all.length ? t('courses.noMatch') : t('courses.empty')}
          </p>
        )}
      </div>

      <StickyActions>
        <Button asChild size="full">
          <Link to="/admin/courses/new"><Plus className="h-5 w-5" /> {t('courses.add')}</Link>
        </Button>
      </StickyActions>
    </div>
  )
}
