import { useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, FileText, Pencil, Plus, Trash2, UsersRound } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Mascot } from '@/components/Mascot'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/i18nField'
import { formatCode } from '@/lib/codes'
import { useTable } from '@/lib/db'
import type { PassportStage } from '@/lib/types'
import {
  deleteCredential, deleteSelfEngagement, engagementTitle, openStaffFile, staffErrorMessage, useMyScopes, useStaffMutation,
  useStaffProfile, useStaffSkills, type Credential, type Engagement, type StaffProfileData,
} from './api'
import { StaffBadge, StaffMark, StaffMarkLegend } from './StaffBadge'
import { CredentialDialog, SelfEngagementDialog } from './StaffDialogs'
import { StaffCvSection } from './StaffCvSection'

/** S2 · Hồ sơ của tôi. Admin mở hồ sơ người khác ở /staff/u/:userId (chỉ xem). */
export function StaffProfilePage() {
  const { t } = useTranslation()
  const { userId } = useParams()
  const { session, loading, hasRole } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(userId ? `/staff/u/${userId}` : '/staff')}`} replace />
  if (userId && !hasRole('admin')) return <Navigate to="/staff" replace />
  return (
    <div className="space-y-5">
      {userId && (
        <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
          <ArrowLeft className="h-4 w-4" /> {t('admin.nav.users')}
        </Link>
      )}
      <StaffProfileBody userId={userId} readOnly={Boolean(userId)} />
    </div>
  )
}

function StaffProfileBody({ userId, readOnly }: { userId?: string; readOnly: boolean }) {
  const { t } = useTranslation()
  const q = useStaffProfile(userId)
  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (q.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  const d = q.data
  return (
    <>
      <ProfileHeader data={d} />
      <StatTiles data={d} />
      {!readOnly && <ManagerScopesCard />}
      <StaffCvSection data={d} userId={userId} />
      <EngagementSection data={d} readOnly={readOnly} />
      <CredentialSection data={d} readOnly={readOnly} />
      <SkillsSection data={d} />
      <StaffMarkLegend />
    </>
  )
}

function ProfileHeader({ data }: { data: StaffProfileData }) {
  const { t, i18n } = useTranslation()
  const p = data.profile
  const name = p.full_name || p.email || p.phone || ''
  const initials = name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]?.toUpperCase()).join('')
  return (
    <Card className="overflow-hidden">
      <StageStripe />
      <div className="flex items-center gap-4 bg-navy p-4 text-white">
        {p.avatar_url?.startsWith('http') ? (
          <img src={p.avatar_url} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-gold" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-gold ring-2 ring-gold">
            {initials || '?'}
          </div>
        )}
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-xl font-bold break-words">{name}</h1>
          <p className="text-gold">{p.cv_type ? t(`staff.cvType.${p.cv_type}`) : t('staff.noCvType')}</p>
          <p className="text-sm text-white/75">
            {[
              data.identity && `${t('staff.identity')}: ${data.identity.student_code}`,
              data.identity?.passport_code && formatCode(data.identity.passport_code),
              p.joined_vncentre_on && t('staff.joinedOn', { date: formatDate(p.joined_vncentre_on, i18n.language) }),
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      {!p.cv_type && <p className="p-4 text-sm text-navy/65">{t('staff.noCvTypeHint')}</p>}
    </Card>
  )
}

/** Dải 5 màu giai đoạn Passport ở mép trên (mục 5), lấy từ passport_stages (admin chỉnh được) */
export function StageStripe() {
  const stages = useTable<PassportStage>('passport_stages', { order: 'number' })
  return (
    <div className="flex h-1.5 bg-gold" aria-hidden>
      {stages.data?.map((s) => <span key={s.id} className="flex-1" style={{ background: s.color }} />)}
    </div>
  )
}

function StatTiles({ data }: { data: StaffProfileData }) {
  const { t, i18n } = useTranslation()
  // S-R8: ô thiếu nguồn dữ liệu (value null) thì ẩn, không hiện 0
  const tiles = data.stats.tiles.filter((x) => x.value !== null)
  if (!data.profile.cv_type || !tiles.length) return null
  const fmt = new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: 1 })
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((x) => (
        <Card key={x.key} className="space-y-1 p-3">
          <p className="flex items-center gap-1.5 text-2xl font-bold">
            {fmt.format(x.value!)} <StaffMark kind={x.badge} />
          </p>
          <p className="text-sm text-navy/65">{t(`staff.stats.${x.key}`)}</p>
        </Card>
      ))}
    </div>
  )
}

function ManagerScopesCard() {
  const { t } = useTranslation()
  const scopes = useMyScopes()
  if (!scopes.data?.length) return null
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-2">
        <UsersRound className="h-5 w-5 text-bronze" />
        <p className="font-semibold">{t('staff.manage.youManage', { count: scopes.data.length })}</p>
      </div>
      <Button asChild size="sm" variant="outline"><Link to="/staff/manage">{t('staff.manage.open')}</Link></Button>
    </Card>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function EngagementSection({ data, readOnly }: { data: StaffProfileData; readOnly: boolean }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<Engagement | 'new' | null>(null)
  const remove = useStaffMutation(deleteSelfEngagement)
  return (
    <Section
      title={t('staff.engagements')}
      action={!readOnly && (
        <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {t('staff.addEngagement')}</Button>
      )}
    >
      {data.engagements.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-6 text-center">
          <Mascot className="h-14 w-14" />
          <p className="text-navy/65">{t('staff.noEngagements')}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {data.engagements.map((e) => (
            <li key={e.id}>
              <EngagementCard
                e={e}
                actions={!readOnly && e.source === 'self' && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" aria-label={t('common.edit')} onClick={() => setEditing(e)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" aria-label={t('common.remove')}
                      onClick={() => window.confirm(t('staff.confirmDelete')) && remove.mutate(e.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              />
            </li>
          ))}
        </ul>
      )}
      <SelfEngagementDialog value={editing} onClose={() => setEditing(null)} />
    </Section>
  )
}

export function EngagementCard({ e, actions }: { e: Engagement; actions?: ReactNode }) {
  const { t, i18n } = useTranslation()
  const skills = useStaffSkills()
  const en = i18n.language === 'en'
  const skillName = (code: string) => {
    const s = skills.data?.find((x) => x.code === code)
    return s ? (en ? s.name_en : s.name_vi) : code
  }
  const position = (en && e.position_en) || e.position_vi
  const outcome = (en && e.outcome_en) || e.outcome_vi
  const dates = [e.started_on, e.ended_on && e.ended_on !== e.started_on ? e.ended_on : null]
    .filter(Boolean).map((d) => formatDate(d!, i18n.language)).join(' – ')
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-bronze">{t(`staff.kind.${e.kind}`)}</p>
          <p className="font-semibold">{engagementTitle(e, i18n.language)}</p>
          <p className="text-sm text-navy/65">
            {[position, e.kind === 'class' && e.school_name, e.kind === 'class' && e.academic_year, dates,
              e.hours !== null && t('staff.hoursN', { count: Number(e.hours) })].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <StaffBadge kind={e.badge} />
          {actions}
        </div>
      </div>
      {outcome && <p className="text-sm">{outcome}</p>}
      {e.skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {e.skills.map((s) => <Badge key={s}>{skillName(s)}</Badge>)}
        </div>
      )}
      {e.badge === 'verified' && e.confirmed_by_name && (
        <p className="text-sm text-navy/55">{t('staff.confirmedBy', { name: e.confirmed_by_name })}</p>
      )}
      {e.status === 'rejected' && e.rejected_reason && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{t('staff.rejectedReason', { reason: e.rejected_reason })}</p>
      )}
    </Card>
  )
}

function CredentialSection({ data, readOnly }: { data: StaffProfileData; readOnly: boolean }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [editing, setEditing] = useState<Credential | 'new' | null>(null)
  const remove = useStaffMutation(deleteCredential)
  const en = i18n.language === 'en'
  return (
    <Section
      title={t('staff.credentials')}
      action={!readOnly && (
        <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {t('staff.addCredential')}</Button>
      )}
    >
      {data.credentials.length === 0 ? (
        <p className="text-navy/60">{t('staff.noCredentials')}</p>
      ) : (
        <ul className="space-y-2">
          {data.credentials.map((c) => (
            <li key={c.id}>
              <Card className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-bronze">{t(`staff.credentialType.${c.type}`)}</p>
                    <p className="font-semibold">{(en && c.title_en) || c.title_vi}</p>
                    <p className="text-sm text-navy/65">
                      {[c.issuer, c.issued_on && formatDate(c.issued_on, i18n.language),
                        c.expires_on && t('staff.expiresOn', { date: formatDate(c.expires_on, i18n.language) }),
                        c.years !== null && t('staff.yearsN', { count: Number(c.years) })].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {c.expired && <Badge tone="bad">{t('staff.expired')}</Badge>}
                    <StaffBadge kind={c.status === 'approved' ? 'approved' : c.status === 'rejected' ? 'rejected' : 'pending'} />
                    {c.file_path && (
                      <Button size="sm" variant="ghost" aria-label={t('staff.viewFile')}
                        onClick={() => openStaffFile(c.file_path!).catch((e) => toast(staffErrorMessage(e, t), 'error'))}>
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                    {!readOnly && (
                      <>
                        <Button size="sm" variant="ghost" aria-label={t('common.edit')} onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" aria-label={t('common.remove')}
                          onClick={() => window.confirm(t('staff.confirmDelete')) && remove.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                      </>
                    )}
                  </div>
                </div>
                {c.expired && <p className="text-sm text-navy/60">{t('staff.expiredHint')}</p>}
                {c.status === 'rejected' && c.rejected_reason && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{t('staff.rejectedReason', { reason: c.rejected_reason })}</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <CredentialDialog value={editing} userId={data.profile.user_id} onClose={() => setEditing(null)} />
    </Section>
  )
}

function SkillsSection({ data }: { data: StaffProfileData }) {
  const { t, i18n } = useTranslation()
  if (!data.skills.length) return null
  return (
    <Section title={t('staff.skills')}>
      <div className="flex flex-wrap gap-2">
        {data.skills.map((s) => (
          <Badge key={s.code} className="gap-1.5">
            {i18n.language === 'en' ? s.name_en : s.name_vi} <span className="rounded-full bg-gold/50 px-1.5">{s.count}</span>
          </Badge>
        ))}
      </div>
    </Section>
  )
}
