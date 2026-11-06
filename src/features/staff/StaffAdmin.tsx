import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, FileText, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { formatDate, formatDateTime } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { Mascot } from '@/components/Mascot'
import { CV_TYPES, openStaffFile, reviewStaffItem, staffErrorMessage, useStaffMutation, type CvType, type StaffScale } from './api'
import { RejectDialog } from './StaffDialogs'

type QueueEngagement = {
  id: string; user_id: string; full_name: string | null; cv_type: CvType | null; project_name_vi: string; project_name_en: string | null
  position_vi: string | null; staff_group: string; started_on: string | null; ended_on: string | null; hours: number | null
  scale: StaffScale; outcome_vi: string | null; created_at: string
}
type QueueCredential = {
  id: string; user_id: string; full_name: string | null; cv_type: CvType | null; type: string; title_vi: string; title_en: string | null
  issuer: string | null; issued_on: string | null; expires_on: string | null; years: number | null; file_path: string | null; created_at: string
}

/** S4 · Hàng chờ "Hồ sơ nhân sự chờ duyệt" của admin — tách khỏi hàng chờ F12 của học viên (S-R12) */
export function StaffQueuePage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [rejecting, setRejecting] = useState<{ entity: 'engagement' | 'credential'; id: string } | null>(null)
  const q = useQuery({
    queryKey: ['staff_review_queue'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('staff_review_queue')
      if (error) throw error
      return data as { engagements: QueueEngagement[]; credentials: QueueCredential[] }
    },
  })
  const act = useStaffMutation(reviewStaffItem, { onDone: () => setRejecting(null) })
  const lang = i18n.language
  const who = (r: { user_id: string; full_name: string | null; cv_type: CvType | null }) => (
    <p className="text-sm text-navy/60">
      <Link to={`/staff/u/${r.user_id}`} className="font-semibold text-bronze">{r.full_name || '—'}</Link>
      {r.cv_type && ` · ${t(`staff.cvType.${r.cv_type}`)}`}
    </p>
  )
  const buttons = (entity: 'engagement' | 'credential', id: string) => (
    <div className="flex gap-2">
      <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ entity, id, approve: true })}>
        <Check className="h-4 w-4" /> {t('review.approve')}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setRejecting({ entity, id })}>
        <X className="h-4 w-4" /> {t('review.reject')}
      </Button>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('staff.queue.title')}</h1>
        <p className="text-navy/65">{t('staff.queue.hint')}</p>
      </div>
      {q.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : q.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : !q.data.engagements.length && !q.data.credentials.length ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Mascot className="h-16 w-16" />
          <p className="text-navy/65">{t('review.empty')}</p>
        </Card>
      ) : (
        <>
          {q.data.credentials.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xl font-bold">{t('staff.credentials')} ({q.data.credentials.length})</h2>
              <ul className="space-y-2">
                {q.data.credentials.map((c) => (
                  <li key={c.id}>
                    <Card className="space-y-2 p-4">
                      {who(c)}
                      <p className="text-sm font-semibold text-bronze">{t(`staff.credentialType.${c.type}`)}</p>
                      <p className="font-semibold">{c.title_vi}{c.title_en && <span className="font-normal text-navy/60"> · {c.title_en}</span>}</p>
                      <p className="text-sm text-navy/65">
                        {[c.issuer, c.issued_on && formatDate(c.issued_on, lang),
                          c.expires_on && t('staff.expiresOn', { date: formatDate(c.expires_on, lang) }),
                          c.years !== null && t('staff.yearsN', { count: Number(c.years) }),
                          t('staff.queue.submittedAt', { at: formatDateTime(c.created_at, lang) })].filter(Boolean).join(' · ')}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {c.file_path ? (
                          <Button size="sm" variant="ghost" onClick={() => openStaffFile(c.file_path!).catch((e) => toast(staffErrorMessage(e, t), 'error'))}>
                            <FileText className="h-4 w-4" /> {t('staff.viewFile')}
                          </Button>
                        ) : <Badge tone="warn">{t('staff.queue.noFile')}</Badge>}
                        {buttons('credential', c.id)}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {q.data.engagements.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xl font-bold">{t('staff.engagements')} ({q.data.engagements.length})</h2>
              <ul className="space-y-2">
                {q.data.engagements.map((e) => (
                  <li key={e.id}>
                    <Card className="space-y-2 p-4">
                      {who(e)}
                      <p className="font-semibold">{e.project_name_vi}{e.project_name_en && <span className="font-normal text-navy/60"> · {e.project_name_en}</span>}</p>
                      <p className="text-sm text-navy/65">
                        {[e.position_vi, t(`staff.group.${e.staff_group}`),
                          [e.started_on, e.ended_on].filter(Boolean).map((d) => formatDate(d!, lang)).join(' – '),
                          e.hours !== null && t('staff.hoursN', { count: Number(e.hours) }),
                          e.scale?.participants && `${t('staff.scale.participants')}: ${e.scale.participants}`].filter(Boolean).join(' · ')}
                      </p>
                      {e.outcome_vi && <p className="text-sm">{e.outcome_vi}</p>}
                      <div className="flex justify-end">{buttons('engagement', e.id)}</div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <RejectDialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        busy={act.isPending}
        onSubmit={(reason) => rejecting && act.mutate({ ...rejecting, approve: false, reason })}
      />
    </div>
  )
}

/** Admin bật người phụ trách hồ sơ nhân sự cho một sự kiện (D52) */
export function EventManagers({ eventId }: { eventId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const list = useQuery({
    queryKey: ['event_manager_list', eventId],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('event_manager_list', { p_event_id: eventId })
      if (error) throw error
      return data as { user_id: string; full_name: string | null; email: string | null }[]
    },
  })
  const setManager = useMutation({
    mutationFn: async (v: { userId?: string; on: boolean }) => {
      let userId = v.userId
      if (!userId) {
        const { data, error } = await supabase!.from('profiles').select('user_id').eq('email', email.trim().toLowerCase()).maybeSingle()
        if (error) throw error
        if (!data) throw new Error(t('staff.managers.notFound'))
        userId = data.user_id as string
      }
      const { error } = await supabase!.rpc('admin_set_event_manager', { p_event_id: eventId, p_user_id: userId, p_on: v.on })
      if (error) throw error
    },
    onSuccess: () => {
      setEmail('')
      qc.invalidateQueries({ queryKey: ['event_manager_list', eventId] })
      qc.invalidateQueries({ queryKey: ['staff_scope'] })
      toast(t('common.saved'))
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  return (
    <Card className="space-y-3 p-4">
      <p className="font-semibold">{t('staff.managers.title')}</p>
      <p className="text-sm text-navy/60">{t('staff.managers.hint')}</p>
      <ul className="space-y-1">
        {list.data?.map((m) => (
          <li key={m.user_id} className="flex items-center justify-between gap-2 rounded-xl bg-navy/5 px-3 py-2">
            <span><span className="font-semibold">{m.full_name || '—'}</span> <span className="text-sm text-navy/55">{m.email}</span></span>
            <Button size="sm" variant="ghost" aria-label={t('common.remove')} onClick={() => setManager.mutate({ userId: m.user_id, on: false })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
        {list.data?.length === 0 && <li className="text-sm text-navy/55">{t('common.empty')}</li>}
      </ul>
      <form className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); setManager.mutate({ on: true }) }}>
        <Field label={t('auth.email')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button type="submit" disabled={!email.includes('@') || setManager.isPending}><Plus className="h-4 w-4" /> {t('staff.managers.add')}</Button>
      </form>
    </Card>
  )
}

/** Admin gán mẫu CV (mỗi người một loại, D48) và ngày tham gia VN Centre */
export function StaffCvTypeEditor({ userId, value }: { userId: string; value: { cv_type: CvType | null; joined_vncentre_on: string | null } }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const save = useMutation({
    mutationFn: async (v: { cv_type?: CvType | null; joined_vncentre_on?: string | null }) => {
      const { error } = await supabase!.from('profiles').update(v).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile_staff_fields'] })
      qc.invalidateQueries({ queryKey: ['staff_profile'] })
      toast(t('common.saved'))
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label={t('staff.cvTypeLabel')}>
        <Select value={value.cv_type ?? ''} onChange={(e) => save.mutate({ cv_type: (e.target.value || null) as CvType | null })}>
          <option value="">{t('staff.noCvType')}</option>
          {CV_TYPES.map((c) => <option key={c} value={c}>{t(`staff.cvType.${c}`)}</option>)}
        </Select>
      </Field>
      <Field label={t('staff.joinedLabel')}>
        <Input type="date" defaultValue={value.joined_vncentre_on ?? ''} onBlur={(e) => {
          const v = e.target.value || null
          if (v !== value.joined_vncentre_on) save.mutate({ joined_vncentre_on: v })
        }} />
      </Field>
      <Button asChild size="sm" variant="ghost"><Link to={`/staff/u/${userId}`}>{t('staff.viewProfile')}</Link></Button>
    </div>
  )
}
