// Khung chung màn 3–7: đầu trang tên sân + thanh 5 mục dưới cùng (bản mẫu Thong-tin.dc.html, Anh.dc.html).
import { Link, Navigate, NavLink, Outlet, useOutletContext, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Camera, Check, ChevronLeft, List, MapPin, Star } from 'lucide-react'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { FormError } from '@/components/ui/form'
import type { GcCourse } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCourse } from './api'
import { countryName } from './meta'
import { errText } from './parts'

export interface CourseCtx { course: GcCourse }
export const useCourseCtx = () => useOutletContext<CourseCtx>()

const TABS = [
  { to: 'info', key: 'info', Icon: List },
  { to: 'photos', key: 'photos', Icon: Camera },
  { to: 'review', key: 'review', Icon: Star },
  { to: 'places', key: 'places', Icon: MapPin },
  { to: 'publish', key: 'publish', Icon: Check },
] as const

export function CourseShell() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const course = useCourse(id)

  if (course.isPending) return <FullPageSpinner />
  if (course.error || !course.data) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <FormError message={course.error ? errText(course.error, t) : t('common.notFound')} />
        <Link to="/admin/courses" className="font-semibold underline">{t('courses.backToList')}</Link>
      </div>
    )
  }
  const c = course.data

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col">
      <div className="-mx-4 -mt-6 flex items-center gap-1 bg-navy py-3 pr-4 pl-2 text-white lg:mx-0 lg:mt-0 lg:rounded-2xl">
        <Link to="/admin/courses" aria-label={t('courses.backToList')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-gold">
            {t(`courses.kind.${c.kind}`)} · {[c.province, countryName(c.country, i18n.language)].filter(Boolean).join(', ')}
          </p>
          <h1 className="truncate text-lg leading-tight font-bold">{c.name}</h1>
        </div>
      </div>

      <div className="flex-1 pt-4 pb-4">
        <Outlet context={{ course: c } satisfies CourseCtx} />
      </div>

      <nav
        aria-label={t('courses.tabsLabel')}
        className="sticky bottom-0 z-10 -mx-4 grid grid-cols-5 border-t border-navy/10 bg-white lg:mx-0 lg:rounded-t-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {TABS.map(({ to, key, Icon }) => (
          <NavLink
            key={to}
            to={`/admin/courses/${c.id}/${to}`}
            className={({ isActive }) =>
              cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-bronze' : 'text-navy/60')
            }
          >
            <Icon className="h-5 w-5" aria-hidden />
            {t(`courses.tab.${key}`)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/** /admin/courses/:id → sân trải nghiệm mở Thông tin, sân đo mở Ảnh. */
export function CourseIndexRedirect() {
  const { course } = useCourseCtx()
  return <Navigate to={course.kind === 'rated' ? 'photos' : 'info'} replace />
}
