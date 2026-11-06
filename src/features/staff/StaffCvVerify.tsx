import { useTranslation } from 'react-i18next'
import { BadgeCheck, CircleX } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatDate } from '@/lib/i18nField'
import { formatVerifyCode as formatCode } from '../../../supabase/functions/_shared/certificateLayout'
import { StaffMark, StaffMarkLegend } from './StaffBadge'

/** Snapshot đã in của một bản CV (staff_cv_exports.data), chỉ trả về cho chủ hồ sơ / admin (D55) */
export interface StaffCvSnapshot {
  lang: 'vi' | 'en'
  tiles: { key: string; value: number; badge: 'verified' | 'approved' }[]
  engagements: {
    id: string; kind: string; badge: 'verified' | 'approved'; event_name_vi?: string | null; event_name_en?: string | null
    class_name?: string | null; school_name?: string | null; project_name_vi?: string | null; project_name_en?: string | null
    position_vi?: string | null; position_en?: string | null; started_on?: string | null; hours?: number | null
    outcome_vi?: string | null; outcome_en?: string | null
  }[]
  credentials: { id: string; title_vi: string; title_en?: string | null; issuer?: string | null }[]
}

interface Props {
  r: {
    result: 'valid' | 'revoked' | 'not_found'
    verify_code?: string
    full_name?: string
    cv_type?: string
    exported_at?: string
    revoked_at?: string | null
    data?: StaffCvSnapshot
  }
}

/**
 * S6 · Kết quả xác thực CV. Công khai chỉ tên, vai trò, ngày xuất, trạng thái (S-R7).
 * Chủ hồ sơ / admin đã đăng nhập thấy thêm toàn bộ nội dung đã in (D55).
 */
export function StaffCvVerifyCard({ r }: Props) {
  const { t, i18n } = useTranslation()
  const valid = r.result === 'valid'
  return (
    <div className="space-y-4">
      <Card className={`space-y-4 border-2 p-5 ${valid ? 'border-emerald-600' : 'border-red-600'}`}>
        <div className="flex items-center gap-3">
          {valid ? <BadgeCheck className="h-12 w-12 shrink-0 text-emerald-600" /> : <CircleX className="h-12 w-12 shrink-0 text-red-600" />}
          <div>
            <p className={`text-xl font-bold ${valid ? 'text-emerald-700' : 'text-red-700'}`}>
              {valid ? t('staff.verify.valid') : t('staff.verify.revoked')}
            </p>
            {!valid && r.revoked_at && <p className="text-sm text-red-700">{t('verify.revokedOn', { date: formatDate(r.revoked_at, i18n.language) })}</p>}
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-navy/60">{t('staff.verify.name')}</dt>
          <dd className="font-semibold">{r.full_name}</dd>
          <dt className="text-navy/60">{t('staff.verify.role')}</dt>
          <dd>{r.cv_type ? t(`staff.cvType.${r.cv_type}`) : '—'}</dd>
          <dt className="text-navy/60">{t('staff.verify.exportedAt')}</dt>
          <dd>{r.exported_at ? formatDate(r.exported_at, i18n.language) : '—'}</dd>
          <dt className="text-navy/60">{t('verify.code')}</dt>
          <dd className="font-mono">{r.verify_code && formatCode(r.verify_code)}</dd>
        </dl>
      </Card>
      {r.data && <FullCopy data={r.data} />}
    </div>
  )
}

function FullCopy({ data }: { data: StaffCvSnapshot }) {
  const { t, i18n } = useTranslation()
  const en = data.lang === 'en'
  const pick = (o: Record<string, unknown>, base: string) => ((en && (o[`${base}_en`] as string)) || (o[`${base}_vi`] as string) || '') as string
  const fmt = new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: 1 })
  return (
    <Card className="space-y-4 p-5">
      <div>
        <p className="font-bold">{t('staff.verify.fullTitle')}</p>
        <p className="text-sm text-navy/60">{t('staff.verify.fullHint')}</p>
      </div>
      {data.tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {data.tiles.map((x) => (
            <div key={x.key} className="rounded-xl bg-cream p-2">
              <p className="flex items-center gap-1 font-bold">{fmt.format(x.value)} <StaffMark kind={x.badge} /></p>
              <p className="text-sm text-navy/60">{t(`staff.stats.${x.key}`)}</p>
            </div>
          ))}
        </div>
      )}
      <ul className="space-y-2">
        {data.engagements.map((e) => {
          const o = e as unknown as Record<string, unknown>
          const title = e.kind === 'event' ? pick(o, 'event_name') : e.kind === 'class' ? e.class_name : pick(o, 'project_name')
          return (
            <li key={e.id} className="flex gap-2">
              <StaffMark kind={e.badge} className="mt-1" />
              <div className="min-w-0">
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-navy/60">
                  {[pick(o, 'position'), e.kind === 'class' && e.school_name, e.started_on && formatDate(e.started_on, i18n.language),
                    e.hours !== null && e.hours !== undefined && t('staff.hoursN', { count: Number(e.hours) })].filter(Boolean).join(' · ')}
                </p>
                {pick(o, 'outcome') && <p className="text-sm">{pick(o, 'outcome')}</p>}
              </div>
            </li>
          )
        })}
      </ul>
      {data.credentials.length > 0 && (
        <ul className="space-y-1 border-t border-navy/10 pt-3">
          {data.credentials.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <StaffMark kind="approved" />
              <span className="font-semibold">{(en && c.title_en) || c.title_vi}</span>
              {c.issuer && <span className="text-sm text-navy/60">· {c.issuer}</span>}
            </li>
          ))}
        </ul>
      )}
      <StaffMarkLegend />
    </Card>
  )
}
