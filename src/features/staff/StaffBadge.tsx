import { useTranslation } from 'react-i18next'
import { Clock, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StaffBadgeKind } from './api'

/**
 * Hai loại dấu khác nhau cả hình lẫn màu (mục 5), in đen trắng vẫn phân biệt:
 * Đã xác thực = chấm tròn navy đặc, dấu tích gold · Đã duyệt = vòng tròn viền đồng, dấu tích đồng.
 */
export function StaffMark({ kind, className }: { kind: 'verified' | 'approved'; className?: string }) {
  return kind === 'verified' ? (
    <svg viewBox="0 0 20 20" aria-hidden className={cn('h-4 w-4 shrink-0', className)}>
      <circle cx="10" cy="10" r="9" fill="var(--color-navy)" />
      <path d="M5.5 10.5l3 3 6-6.5" fill="none" stroke="var(--color-gold)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" aria-hidden className={cn('h-4 w-4 shrink-0', className)}>
      <circle cx="10" cy="10" r="8" fill="none" stroke="var(--color-bronze)" strokeWidth="2" />
      <path d="M6 10.5l2.7 2.7 5.3-5.7" fill="none" stroke="var(--color-bronze)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function StaffBadge({ kind, className }: { kind: StaffBadgeKind; className?: string }) {
  const { t } = useTranslation()
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold'
  if (kind === 'verified' || kind === 'approved') {
    return (
      <span className={cn(base, kind === 'verified' ? 'bg-navy/8 text-navy' : 'bg-bronze/10 text-brown', className)}>
        <StaffMark kind={kind} /> {t(`staff.badge.${kind}`)}
      </span>
    )
  }
  return (
    <span className={cn(base, kind === 'pending' ? 'bg-gold/30 text-brown' : 'bg-red-100 text-red-800', className)}>
      {kind === 'pending' ? <Clock className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {t(`staff.badge.${kind}`)}
    </span>
  )
}

/** Chú thích hai loại dấu (cột phụ trên CV, cuối trang hồ sơ) */
export function StaffMarkLegend() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-navy/70">
      <span className="inline-flex items-center gap-1.5"><StaffMark kind="verified" /> {t('staff.legend.verified')}</span>
      <span className="inline-flex items-center gap-1.5"><StaffMark kind="approved" /> {t('staff.legend.approved')}</span>
    </div>
  )
}
