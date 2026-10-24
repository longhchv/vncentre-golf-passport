// Mảnh giao diện dùng chung trong khu quản trị sân (theo bản mẫu docs/mockups/quan-tri-san).
import { useEffect, type ComponentProps, type ReactNode } from 'react'
import { useBlocker } from 'react-router'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GcCourse } from '@/lib/types'
import { useTranslation } from 'react-i18next'

/** Nút chọn dạng viên (bộ lọc, tiện ích). */
export function Chip({ on, className, ...props }: ComponentProps<'button'> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        'inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors',
        on ? 'border-navy bg-navy text-white' : 'border-navy/15 bg-white text-navy hover:bg-navy/5',
        className,
      )}
      {...props}
    />
  )
}

/** Nút chọn trong nhóm (yd/m, 1–9/10–18). */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'min-h-9 min-w-10 rounded-lg border px-2.5 text-sm font-semibold',
            value === o.v ? 'border-navy bg-navy text-white' : 'border-navy/15 bg-white text-navy',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function KindTag({ kind }: { kind: GcCourse['kind'] }) {
  const { t } = useTranslation()
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', kind === 'rated' ? 'bg-[#E8EEF8] text-[#1F3A6B]' : 'bg-[#FBEBDD] text-[#7A4518]')}>
      {t(`courses.kind.${kind}`)}
    </span>
  )
}

export function StatusTag({ status }: { status: GcCourse['status'] }) {
  const { t } = useTranslation()
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-navy/8 text-navy/75')}>
      {t(`courses.status.${status}`)}
    </span>
  )
}

/** Khối có tiêu đề nhỏ, nền trắng. */
export function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3 rounded-2xl border border-navy/10 bg-white p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Thanh nút cố định cuối màn hình điện thoại. */
export function StickyActions({ children, aboveTabs }: { children: ReactNode; aboveTabs?: boolean }) {
  return (
    <div
      className="sticky z-[5] -mx-4 border-t border-navy/10 bg-cream/95 px-4 py-3 backdrop-blur lg:mx-0"
      style={aboveTabs ? { bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' } : { bottom: 0, paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex gap-2">{children}</div>
    </div>
  )
}

export function fmtDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Lỗi Supabase → câu dễ hiểu. */
export function errText(e: unknown, t: (k: string, o?: Record<string, unknown>) => string): string {
  const m = (e as { message?: string })?.message || String(e)
  if (/row-level security|permission denied|not authorized/i.test(m)) return t('courses.err.permission')
  if (/duplicate key.*slug/i.test(m)) return t('courses.err.slug')
  if (/duplicate key.*csr_course_id/i.test(m)) return t('courses.err.csrDup')
  if (/Failed to fetch|NetworkError|network/i.test(m)) return t('courses.err.network')
  if (m === 'photo_type') return t('courses.err.photoType')
  if (m === 'photo_too_large') return t('courses.err.photoLarge')
  return t('courses.err.generic', { msg: m })
}

/** Hỏi lại khi rời màn hình (đổi mục, quay lại, đóng tab) mà còn thay đổi chưa lưu. */
export function UnsavedGuard({ dirty }: { dirty: boolean }) {
  const { t } = useTranslation()
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
  return (
    <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title={t('courses.unsaved.title')}>
      <p className="mb-4 text-base">{t('courses.unsaved.body')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={() => blocker.reset?.()}>{t('courses.unsaved.stay')}</Button>
        <Button variant="ghost" className="text-red-700" onClick={() => blocker.proceed?.()}>{t('courses.unsaved.leave')}</Button>
      </div>
    </Dialog>
  )
}

/** Câu gợi ý / cảnh báo dưới ô "Link Google Maps". */
export function mapsMessage(state: string, coords: { lat: number; lng: number } | null, t: (k: string, o?: Record<string, unknown>) => string, approx?: boolean): { hint?: string; warn?: string | null } {
  if (state === 'ok' && coords) return { hint: t(approx ? 'courses.f.coordsApprox' : 'courses.f.coordsOk', { lat: coords.lat, lon: coords.lng }) }
  if (state === 'resolving') return { hint: t('courses.f.mapsResolving') }
  if (state === 'shortFail') return { warn: t('courses.f.mapsShortFail') }
  if (state === 'bad') return { warn: t('courses.f.mapsBad') }
  return { hint: t('courses.f.mapsHint') }
}
