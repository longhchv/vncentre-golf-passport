import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronRight, Pencil } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { formatDate } from '@/lib/i18nField'
import { useMyScopes, useStaffScope, useStaffSkills, type Scope, type ScopeItem } from './api'
import { RecordDialog } from './StaffDialogs'

/**
 * S3 · Danh sách nhân sự của một sự kiện hoặc lớp, người phụ trách điền vị trí, số giờ, kỹ năng, kết quả.
 * Không có quyền (S-R10) thì không hiện gì: dùng chung trong màn hình sự kiện, lớp của admin và HLV.
 */
export function StaffRecordPanel({ scope, title }: { scope: Scope; title?: string }) {
  const { t, i18n } = useTranslation()
  const q = useStaffScope(scope)
  const skills = useStaffSkills()
  const [editing, setEditing] = useState<ScopeItem | null>(null)
  if (q.isError || q.isPending) return null
  const en = i18n.language === 'en'
  const skillName = (code: string) => {
    const s = skills.data?.find((x) => x.code === code)
    return s ? (en ? s.name_en : s.name_vi) : code
  }
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold">{title ?? t('staff.record.panelTitle')}</h2>
        <p className="text-sm text-navy/60">{t('staff.record.panelHint')}</p>
      </div>
      {q.data.items.length === 0 ? (
        <p className="text-navy/55">{t('staff.record.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {q.data.items.map((it) => (
            <li key={it.id}>
              <Card className="flex flex-wrap items-start justify-between gap-2 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">{it.full_name}</p>
                  <p className="text-sm text-navy/65">
                    {[t(`staff.group.${it.staff_group}`), (en && it.position_en) || it.position_vi,
                      it.hours !== null && t('staff.hoursN', { count: Number(it.hours) })].filter(Boolean).join(' · ')}
                  </p>
                  {it.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1">{it.skills.map((s) => <Badge key={s}>{skillName(s)}</Badge>)}</div>
                  )}
                  {it.confirmed_at ? (
                    <p className="text-sm text-navy/50">
                      {t('staff.record.recordedBy', { name: it.confirmed_by_name ?? '—', date: formatDate(it.confirmed_at, i18n.language) })}
                    </p>
                  ) : (
                    <Badge tone="warn">{t('staff.record.notRecorded')}</Badge>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(it)}>
                  <Pencil className="h-4 w-4" /> {t('staff.record.action')}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <RecordDialog item={editing} onClose={() => setEditing(null)} />
    </section>
  )
}

/** Những sự kiện, lớp mình phụ trách ghi nhận (người phụ trách không cần vào trang quản trị) */
export function StaffScopesPage() {
  const { t, i18n } = useTranslation()
  const { session, loading } = useAuth()
  const scopes = useMyScopes()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login?next=/staff/manage" replace />
  return (
    <div className="space-y-5">
      <Link to="/staff" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
        <ArrowLeft className="h-4 w-4" /> {t('staff.title')}
      </Link>
      <h1 className="text-2xl font-bold">{t('staff.manage.title')}</h1>
      {scopes.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : !scopes.data?.length ? (
        <p className="text-navy/60">{t('staff.manage.none')}</p>
      ) : (
        <ul className="space-y-2">
          {scopes.data.map((s) => (
            <li key={`${s.kind}-${s.id}`}>
              <Link to={`/staff/manage/${s.kind}/${s.id}`}>
                <Card className="flex items-center justify-between gap-2 p-4 hover:bg-navy/5">
                  <div>
                    <p className="text-sm font-semibold text-bronze">{t(`staff.kind.${s.kind}`)}</p>
                    <p className="font-semibold">{s.name}</p>
                    {s.date && <p className="text-sm text-navy/60">{formatDate(s.date, i18n.language)}</p>}
                  </div>
                  <ChevronRight className="h-5 w-5 text-navy/40" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function StaffScopePage() {
  const { t } = useTranslation()
  const { kind, id = '' } = useParams()
  const { session, loading } = useAuth()
  const scope: Scope = kind === 'class' ? { classId: id } : { eventId: id }
  const q = useStaffScope(scope, Boolean(session))
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(`/staff/manage/${kind}/${id}`)}`} replace />
  return (
    <div className="space-y-5">
      <Link to="/staff/manage" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
        <ArrowLeft className="h-4 w-4" /> {t('staff.manage.title')}
      </Link>
      {q.isError ? (
        <Card className="p-6 text-center font-semibold">{t('errors.forbidden')}</Card>
      ) : q.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : (
        <>
          <h1 className="text-2xl font-bold">{q.data.name}</h1>
          <StaffRecordPanel scope={scope} />
        </>
      )}
    </div>
  )
}
