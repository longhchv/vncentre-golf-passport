// Mảnh giao diện dùng chung trong khu Sân tập & phòng 3D.
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { VenueStatus } from './api'

const TONE: Record<VenueStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  draft: 'bg-navy/8 text-navy/75',
  closed_temp: 'bg-amber-100 text-amber-900',
  closed: 'bg-red-100 text-red-800',
}

export function StatusPill({ status }: { status: VenueStatus }) {
  const { t } = useTranslation()
  return <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', TONE[status])}>{t(`venues.status.${status}`)}</span>
}

/** "Tên | mô tả" mỗi dòng ↔ [[tên, mô tả], …] cho dòng máy và phần mềm của hãng. */
export function pairsToText(p: [string, string][] | null | undefined): string {
  return (p ?? []).map(([a, b]) => (b ? `${a} | ${b}` : a)).join('\n')
}
export function textToPairs(s: string): [string, string][] {
  return s.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf('|')
    return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  })
}
export function linesToList(s: string): string[] {
  return s.split('\n').map((l) => l.trim()).filter(Boolean)
}
