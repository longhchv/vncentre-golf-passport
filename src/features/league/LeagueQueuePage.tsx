import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, GitMerge, Link2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { formatDate, formatDateTime } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { Mascot } from '@/components/Mascot'
import { MergeStudentsDialog } from '@/features/admin/MergeStudents'

interface StudentCard {
  id: string
  student_code: string
  full_name: string
  date_of_birth: string | null
  birth_year: number | null
  gender: string | null
  verification_status: string
  created_at: string
  merged_into: string | null
  deleted: boolean
  school: string | null
  event_age: number | null
  event_year: number | null
  guardians: number
  league_stages: number
}
interface QueueItem {
  id: string
  source: 'issue' | 'results' | 'import'
  reason: string
  status: 'pending' | 'merged' | 'linked' | 'kept_new' | 'dismissed'
  note: string | null
  created_at: string
  resolved_at: string | null
  payload: { name?: string; dob?: string; birth_year?: string | number | null; club?: string; school?: string; group?: string; stage?: number }
  new_student: StudentCard | null
  result: { id: string; stage_no: number; played_on: string; raw_name: string; club: string | null; group: string | null; points: number; student_id: string | null } | null
  league_ref: string | null
  candidates: StudentCard[]
}
type Action = 'merged' | 'linked' | 'kept_new' | 'dismissed'

/** Admin · "Ghép VĐV SNAG League" (spec 13 mục 6.3): xử lý hàng chờ nghi trùng / chưa ghép. Gộp hồ sơ dùng công cụ gộp học viên có sẵn. */
export function LeagueQueuePage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'pending' | 'all'>('pending')
  const q = useQuery({
    queryKey: ['admin_league_queue', status],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('admin_league_queue', { p_status: status })
      if (error) throw error
      return data as QueueItem[]
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('league.queue.title')}</h1>
          <p className="text-navy/70">{t('league.queue.intro')}</p>
        </div>
        <div className="flex gap-2">
          {(['pending', 'all'] as const).map((s) => (
            <Button key={s} size="sm" variant={status === s ? 'primary' : 'outline'} onClick={() => setStatus(s)}>
              {t(`league.queue.filter.${s}`)}
            </Button>
          ))}
        </div>
      </div>
      {q.isPending && <p className="text-navy/60">{t('common.loading')}</p>}
      {q.isError && <p className="text-red-700">{errorMessage(q.error, t)}</p>}
      {q.data && q.data.length === 0 && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Mascot className="h-20 w-20" />
          <p className="font-semibold">{t('league.queue.empty')}</p>
        </Card>
      )}
      {q.data?.map((item) => <QueueCard key={item.id} item={item} />)}
    </div>
  )
}

function QueueCard({ item }: { item: QueueItem }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const qc = useQueryClient()
  const toast = useToast()
  const [merging, setMerging] = useState(false)
  const resolve = useMutation({
    mutationFn: async ({ action, studentId }: { action: Action; studentId?: string }) => {
      const { error } = await supabase!.rpc('admin_league_resolve', { p_id: item.id, p_action: action, p_student_id: studentId ?? null, p_note: null })
      if (error) throw error
    },
    onSuccess: () => {
      toast(t('league.queue.done'))
      qc.invalidateQueries({ queryKey: ['admin_league_queue'] })
    },
    onError: (e) => toast(t(`league.queue.errors.${String((e as { message?: string }).message ?? '').split(':')[0]}`, { defaultValue: errorMessage(e, t) }), 'error'),
  })
  const pending = item.status === 'pending'
  const name = item.payload.name ?? item.result?.raw_name ?? item.new_student?.full_name ?? ''
  const fileYear = item.payload.birth_year ?? (item.payload.dob ? item.payload.dob.slice(0, 4) : null)

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold">{name}</p>
          <p className="text-sm text-navy/65">
            {[
              t(`league.queue.source.${item.source}`),
              item.result && `${t('league.stageNo', { no: item.result.stage_no })} · ${formatDate(item.result.played_on, lang)}`,
              item.payload.club || item.payload.school,
              item.payload.group,
              fileYear && t('league.queue.birthYear', { year: fileYear }),
            ].filter(Boolean).join(' · ')}
          </p>
          <p className="text-xs text-navy/55">{formatDateTime(item.created_at, lang)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="warn">{t(`league.queue.reason.${item.reason}`, { defaultValue: item.reason })}</Badge>
          {!pending && <Badge tone="good">{t(`league.queue.status.${item.status}`)}</Badge>}
        </div>
      </div>

      {item.new_student && (
        <div className="rounded-xl border border-dashed border-navy/20 p-3">
          <p className="text-sm font-semibold text-navy/70">{t('league.queue.newProfile')}</p>
          <StudentLine s={item.new_student} />
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-navy/70">{t('league.queue.candidates')}</p>
        {item.candidates.length === 0 && <p className="text-sm text-navy/60">{t('league.queue.noCandidates')}</p>}
        {item.candidates.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-navy/5 p-3">
            <StudentLine s={c} />
            {pending && !c.merged_into && !c.deleted && !item.new_student && (
              <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate({ action: 'linked', studentId: c.id })}>
                <Link2 className="h-4 w-4" aria-hidden /> {t('league.queue.link')}
              </Button>
            )}
          </div>
        ))}
      </div>

      {pending && (
        <div className="flex flex-wrap gap-2 border-t border-navy/10 pt-3">
          {item.new_student && !item.new_student.merged_into && (
            <>
              <Button size="sm" onClick={() => setMerging(true)}>
                <GitMerge className="h-4 w-4" aria-hidden /> {t('league.queue.merge')}
              </Button>
              <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate({ action: 'kept_new' })}>
                <Check className="h-4 w-4" aria-hidden /> {t('league.queue.keepNew')}
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate({ action: 'dismissed' })}>
            <X className="h-4 w-4" aria-hidden /> {t('league.queue.dismiss')}
          </Button>
        </div>
      )}

      {item.new_student && merging && (
        <MergeStudentsDialog
          student={{ id: item.new_student.id, full_name: item.new_student.full_name }}
          open={merging}
          onClose={() => setMerging(false)}
          onMerged={() => {
            setMerging(false)
            resolve.mutate({ action: 'merged' })
          }}
        />
      )}
    </Card>
  )
}

function StudentLine({ s }: { s: StudentCard }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const estYear = s.event_age != null && s.event_year != null ? s.event_year - s.event_age : null
  return (
    <div className="min-w-0 text-sm">
      <p className="font-semibold">
        <Link className="underline decoration-navy/30 underline-offset-2" to={`/admin/students?open=${s.id}`}>{s.student_code}</Link>
        {' · '}{s.full_name}
        {s.merged_into && <span className="text-navy/55"> · {t('league.queue.mergedAway')}</span>}
      </p>
      <p className="text-navy/65">
        {[
          s.date_of_birth ? formatDate(s.date_of_birth, lang) : s.birth_year && t('league.queue.birthYear', { year: s.birth_year }),
          s.school,
          t(`verification.${s.verification_status}`, { defaultValue: s.verification_status }),
          estYear != null && t('league.queue.eventAge', { age: s.event_age, year: estYear }),
          t('league.queue.guardians', { count: s.guardians }),
          t('league.queue.stages', { count: s.league_stages }),
        ].filter(Boolean).join(' · ')}
      </p>
    </div>
  )
}
