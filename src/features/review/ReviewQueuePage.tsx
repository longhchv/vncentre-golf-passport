import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { formatDate, formatDateTime } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { Mascot } from '@/components/Mascot'
import { LinkRequestActions } from './LinkRequestActions'

type Kind = 'course_history' | 'level_record' | 'student' | 'guardian_link' | 'link_request' | 'support_request'
type Section = 'course_history' | 'level_records' | 'students' | 'guardian_links' | 'link_requests' | 'support_requests'

const SECTION_KIND: Record<Section, Kind> = {
  course_history: 'course_history',
  level_records: 'level_record',
  students: 'student',
  guardian_links: 'guardian_link',
  link_requests: 'link_request',
  support_requests: 'support_request',
}

type Item = Record<string, unknown> & { id: string; created_at: string }
type Queue = Record<Section, Item[]>

/** Hàng chờ duyệt (F12) — admin và HLV trưởng. */
export function ReviewQueuePage() {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>('course_history')
  const q = useQuery({
    queryKey: ['review_queue'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('review_queue')
      if (error) throw error
      return data as Queue
    },
  })
  const sections = Object.keys(SECTION_KIND) as Section[]

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('admin.nav.queue')}</h1>
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-2 pb-1">
          {sections.map((s) => {
            const n = q.data?.[s]?.length ?? 0
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${section === s ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15'}`}
              >
                {t(`review.section.${s}`)} {n > 0 && <span className={`ml-1 rounded-full px-2 ${section === s ? 'bg-gold text-navy' : 'bg-gold/40'}`}>{n}</span>}
              </button>
            )
          })}
        </div>
      </div>
      {q.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : q.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <SectionList key={section} section={section} items={q.data[section] ?? []} />
      )}
    </div>
  )
}

function SectionList({ section, items }: { section: Section; items: Item[] }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rejecting, setRejecting] = useState<string[] | null>(null)
  const kind = SECTION_KIND[section]
  const bulk = kind !== 'student'

  const act = useMutation({
    mutationFn: async ({ ids, action, reason }: { ids: string[]; action: 'approve' | 'reject'; reason?: string }) => {
      const { data, error } = await supabase!.rpc('review_items', { p_kind: kind, p_ids: ids, p_action: action, p_reason: reason ?? null })
      if (error) throw error
      return data as number
    },
    onSuccess: (n, v) => {
      toast(t(v.action === 'approve' ? 'review.approvedN' : 'review.rejectedN', { count: n }))
      setSelected(new Set())
      setRejecting(null)
      qc.invalidateQueries({ queryKey: ['review_queue'] })
      qc.invalidateQueries({ queryKey: ['admin_search_students'] })
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  if (!items.length) {
    return (
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <Mascot className="h-16 w-16" />
        <p className="text-navy/65">{t('review.empty')}</p>
      </Card>
    )
  }

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const ids = [...selected]

  return (
    <div className="space-y-3">
      {bulk && (
        <Card className="sticky top-16 z-[5] flex flex-wrap items-center justify-between gap-2 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-5 w-5 accent-bronze"
              checked={selected.size === items.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
            />
            {t('review.selectAll')} ({selected.size}/{items.length})
          </label>
          <div className="flex gap-2">
            {section !== 'link_requests' && (
              <Button size="sm" disabled={!ids.length || act.isPending} onClick={() => act.mutate({ ids, action: 'approve' })}>
                <Check className="h-4 w-4" /> {t('review.approve')}
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={!ids.length} onClick={() => setRejecting(ids)}>
              <X className="h-4 w-4" /> {t('review.reject')}
            </Button>
          </div>
        </Card>
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex gap-3 p-4">
              {bulk && <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-bronze" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />}
              <div className="min-w-0 flex-1 space-y-2">
                <ItemBody section={section} item={item} />
                {section === 'students' ? (
                  <StudentActions item={item} onApprove={() => act.mutate({ ids: [item.id], action: 'approve' })} onReject={() => setRejecting([item.id])} />
                ) : section === 'link_requests' ? (
                  <LinkRequestActions requestId={item.id} onDone={() => qc.invalidateQueries({ queryKey: ['review_queue'] })} />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => act.mutate({ ids: [item.id], action: 'approve' })}>
                      <Check className="h-4 w-4" /> {t(section === 'support_requests' ? 'review.markDone' : 'review.approve')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejecting([item.id])}>
                      <X className="h-4 w-4" /> {t('review.reject')}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <RejectDialog
        ids={rejecting}
        section={section}
        busy={act.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => act.mutate({ ids: rejecting!, action: 'reject', reason })}
      />
    </div>
  )
}

function Line({ children }: { children: ReactNode }) {
  return <p className="text-sm text-navy/70">{children}</p>
}

function ItemBody({ section, item }: { section: Section; item: Item }) {
  const { t, i18n } = useTranslation()
  const d = (v: unknown) => (v ? formatDate(String(v), i18n.language) : null)
  const s = (k: string) => (item[k] as string | null | undefined) ?? null
  const sr = (item.self_reported ?? null) as Record<string, string> | null
  const when = <p className="text-xs text-navy/45">{formatDateTime(item.created_at, i18n.language)}</p>

  switch (section) {
    case 'course_history':
      return (
        <>
          <p className="font-semibold">{s('student_name')} <span className="text-sm font-normal text-navy/55">{s('student_code')}</span></p>
          <Line>{[s('academic_year'), s('course_name')].filter(Boolean).join(' · ')}</Line>
          <Line>{[s('school'), s('grade_class'), item.level_number ? `Level ${item.level_number}` : null, d(item.date_of_birth)].filter(Boolean).join(' · ')}</Line>
          <Line>{t('review.submittedBy', { name: s('submitted_by') ?? '—' })} · {t(`review.source.${s('source')}`, { defaultValue: s('source') ?? '' })}</Line>
          {when}
        </>
      )
    case 'level_records':
      return (
        <>
          <p className="font-semibold">{s('student_name')} → Level {String(item.level_number)}</p>
          <Line>{[s('student_code'), s('school'), d(item.completed_at)].filter(Boolean).join(' · ')}</Line>
          <Line>{t('review.submittedBy', { name: s('proposed_by') ?? '—' })} · {t(`review.levelSource.${s('source')}`, { defaultValue: s('source') ?? '' })}</Line>
          {when}
        </>
      )
    case 'students':
      return (
        <>
          <p className="font-semibold">{s('full_name')} <Badge tone="warn">{t('verification.pending_review')}</Badge></p>
          <Line>{[s('student_code'), d(item.date_of_birth), s('school') ?? sr?.school_text, sr?.grade_class].filter(Boolean).join(' · ')}</Line>
          {sr?.passport_code && <Line>{t('review.fromPassport', { code: sr.passport_code })}</Line>}
          {when}
        </>
      )
    case 'guardian_links':
      return (
        <>
          <p className="font-semibold">{s('guardian_name') ?? '—'} → {s('student_name')}</p>
          <Line>{[s('guardian_phone'), s('relationship') ? t(`relationship.${s('relationship')}`) : null].filter(Boolean).join(' · ')}</Line>
          <Line>{t('review.studentOnFile')}: {[s('student_code'), d(item.date_of_birth), s('school')].filter(Boolean).join(' · ')}</Line>
          {sr && <Line>{t('review.parentSaid')}: {[sr.full_name, d(sr.date_of_birth), sr.grade_class].filter(Boolean).join(' · ')}</Line>}
          {when}
        </>
      )
    case 'link_requests':
      return (
        <>
          <p className="font-semibold">{s('requester') ?? '—'} · {s('requester_phone')}</p>
          <Line>{t('review.childSaid')}: {[s('child_name'), d(item.dob), s('school'), s('grade_class')].filter(Boolean).join(' · ')}</Line>
          {when}
        </>
      )
    case 'support_requests':
      return (
        <>
          <p className="font-semibold">{t(`review.supportType.${s('type')}`)} · {s('student_name') ?? '—'}</p>
          <Line>{s('requester')} · {s('requester_phone')}</Line>
          <p className="rounded-xl bg-navy/5 p-3 whitespace-pre-wrap">{s('body')}</p>
          {when}
        </>
      )
  }
}

/** Học viên phụ huynh tự khai: xác nhận là học viên mới, ghép vào học viên có sẵn, hoặc từ chối. */
function StudentActions({ item, onApprove, onReject }: { item: Item; onApprove: () => void; onReject: () => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const candidates = (item.candidates ?? []) as { id: string; student_code: string; full_name: string; date_of_birth: string | null; school: string | null }[]
  const absorb = useMutation({
    mutationFn: async (target: string) => {
      const { error } = await supabase!.rpc('absorb_pending_student', { p_pending_id: item.id, p_target_id: target })
      if (error) throw error
    },
    onSuccess: () => {
      toast(t('review.absorbed'))
      qc.invalidateQueries({ queryKey: ['review_queue'] })
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  return (
    <div className="space-y-2">
      {candidates.length > 0 && (
        <div className="space-y-1 rounded-xl bg-navy/5 p-3">
          <p className="text-sm font-semibold">{t('review.possibleMatches')}</p>
          {candidates.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                {c.full_name} · {c.student_code}{c.date_of_birth ? ` · ${formatDate(c.date_of_birth, i18n.language)}` : ''}{c.school ? ` · ${c.school}` : ''}
              </span>
              <Button size="sm" variant="outline" disabled={absorb.isPending}
                onClick={() => window.confirm(t('review.confirmAbsorb', { name: c.full_name })) && absorb.mutate(c.id)}>
                {t('review.absorb')}
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onApprove}>
          <Check className="h-4 w-4" /> {t('review.confirmNewStudent')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onReject}>
          <X className="h-4 w-4" /> {t('review.reject')}
        </Button>
      </div>
    </div>
  )
}

function RejectDialog({ ids, section, busy, onClose, onConfirm }: { ids: string[] | null; section: Section; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  return (
    <Dialog open={ids !== null} onClose={onClose} title={t('review.rejectTitle', { count: ids?.length ?? 0 })}>
      <div className="space-y-3">
        {section === 'guardian_links' && <p className="rounded-xl bg-gold/15 p-3 text-sm text-brown">{t('review.rejectLinkNote')}</p>}
        {section === 'students' && <p className="rounded-xl bg-gold/15 p-3 text-sm text-brown">{t('review.rejectStudentNote')}</p>}
        <Field label={t('review.reason') + ' *'}>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <FormError message={null} />
        <Button size="full" disabled={!reason.trim() || busy} onClick={() => onConfirm(reason.trim())}>
          {t('review.confirmReject')}
        </Button>
      </div>
    </Dialog>
  )
}
