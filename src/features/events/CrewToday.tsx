import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, ChevronDown, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCode } from '@/lib/codes'
import { formatDate, formatDateTime } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { FormError, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'

interface CrewTask { id: string; phase_no: number; phase_label: string; time_label: string | null; area: string | null; task_text: string
  status: 'open' | 'done' | 'blocked'; note: string | null; status_at: string | null }
export interface CrewTodayData {
  result: 'crew' | 'none'
  code: string
  full_name: string
  student_code: string
  event: { id: string; name_vi: string; name_en: string; event_date: string; venue: string | null; status: string }
  slot: { slot_code: string; role_code: string; role_name: string; badge_label: string | null; badge_color: string | null; position: string | null; note: string | null }
  editable: boolean
  tasks: CrewTask[]
  summary: { slot_code: string; role_name: string; full_name: string; total: number; done: number; blocked: number }[] | null
  blocked: { slot_code: string; full_name: string; task_text: string; note: string; status_at: string }[] | null
}

export function useCrewToday(code: string, enabled: boolean) {
  return useQuery({
    queryKey: ['crew_today', code],
    enabled,
    staleTime: 0,
    // Vai A (điều phối): làm mới tổng mỗi 30 giây
    refetchInterval: (q) => (q.state.data?.slot?.role_code === 'A' ? 30_000 : false),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('crew_today', { p_code: code })
      if (error) throw error
      return data as CrewTodayData
    },
  })
}

/**
 * /p/<mã sổ> của nhân sự sự kiện (spec 11 mục 4.4, phần checklist): tên, vai, vị trí, việc tiếp theo;
 * checklist 6 giai đoạn, mỗi việc Xong / Vướng (Vướng bắt buộc lý do). Vai A thấy tổng từng ô và các mục Vướng.
 */
export function CrewTodayPage({ data }: { data: CrewTodayData }) {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id) }, [])

  const tasks = data.tasks
  const next = tasks.find((x) => x.status !== 'done')
  const done = tasks.filter((x) => x.status === 'done').length
  const blocked = tasks.filter((x) => x.status === 'blocked').length
  const phases = [...new Map(tasks.map((x) => [x.phase_no, x.phase_label])).entries()].sort((a, b) => a[0] - b[0])
  const color = data.slot.badge_color ?? '#080634'

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 text-white" style={{ background: color }}>
          <p className="text-sm font-semibold uppercase tracking-wide opacity-90">{data.slot.badge_label}</p>
          <p className="text-3xl font-bold">{data.slot.slot_code} · {data.full_name}</p>
          <p className="text-sm opacity-90">{data.slot.role_name}{data.slot.position ? ` · ${data.slot.position}` : ''}</p>
        </div>
        <div className="space-y-1 p-4">
          <p className="text-sm text-navy/65">
            {i18n.language === 'en' ? data.event.name_en : data.event.name_vi} · {formatDate(data.event.event_date, i18n.language)}{data.event.venue ? ` · ${data.event.venue}` : ''}
          </p>
          <p className="text-sm text-navy/65">{t('crewToday.now', { time: now.toLocaleTimeString(i18n.language === 'en' ? 'en-GB' : 'vi-VN', { hour: '2-digit', minute: '2-digit' }) })} · {data.student_code} · {formatCode(data.code)}</p>
          {data.slot.note && <p className="rounded-lg bg-gold/15 px-3 py-2 text-sm text-brown">{data.slot.note}</p>}
        </div>
      </Card>

      {next && (
        <Card className="space-y-1 border-bronze p-4">
          <p className="text-sm font-semibold text-bronze">{t('crewToday.next')}</p>
          <p className="text-lg font-semibold">{next.task_text}</p>
          <p className="text-sm text-navy/60">{[next.time_label, next.area].filter(Boolean).join(' · ')}</p>
        </Card>
      )}
      <div className="flex items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-navy/10">
          <div className="h-full bg-emerald-600" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} />
        </div>
        <p className="shrink-0 text-sm font-semibold">{t('crewToday.progress', { done, total: tasks.length })}</p>
        {blocked > 0 && <Badge tone="bad">{t('crew.blockedN', { n: blocked })}</Badge>}
      </div>
      {!data.editable && <p className="rounded-xl bg-navy/5 p-3 text-sm text-navy/70">{t('crewToday.closed')}</p>}

      {data.summary && <CoordinatorPanel data={data} />}

      {phases.map(([no, label]) => (
        <Phase key={no} label={label} tasks={tasks.filter((x) => x.phase_no === no)} code={data.code} editable={data.editable}
          defaultOpen={!next || next.phase_no === no || tasks.some((x) => x.phase_no === no && x.status === 'blocked')} />
      ))}
      <p className="pb-4 text-center text-xs text-navy/45">{t('crewToday.openLinkNote')}</p>
    </div>
  )
}

function Phase({ label, tasks, code, editable, defaultOpen }: { label: string; tasks: CrewTask[]; code: string; editable: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const done = tasks.filter((x) => x.status === 'done').length
  return (
    <Card className="p-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-14 w-full items-center justify-between gap-2 px-4 text-left">
        <span className="font-bold">{label}</span>
        <span className="flex items-center gap-2 text-sm text-navy/60">{done}/{tasks.length}<ChevronDown className={`h-5 w-5 transition ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open && <ul className="divide-y divide-navy/10 border-t border-navy/10">{tasks.map((x) => <TaskItem key={x.id} task={x} code={code} editable={editable} />)}</ul>}
    </Card>
  )
}

function TaskItem({ task, code, editable }: { task: CrewTask; code: string; editable: boolean }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const set = useMutation({
    mutationFn: async (v: { status: CrewTask['status']; note?: string }) => {
      const { error } = await supabase!.rpc('crew_set_task', { p_code: code, p_task_id: task.id, p_status: v.status, p_note: v.note ?? null })
      if (error) throw error
    },
    onSuccess: () => { setAsking(false); setNote(''); qc.invalidateQueries({ queryKey: ['crew_today', code] }) },
    onError: (e) => toast(t(`crewToday.errors.${(e as Error).message}`, { defaultValue: t('errors.generic') }), 'error'),
  })
  const tone = task.status === 'done' ? 'bg-emerald-50' : task.status === 'blocked' ? 'bg-red-50' : ''
  return (
    <li className={`space-y-2 px-4 py-3 ${tone}`}>
      <div>
        {(task.time_label || task.area) && <p className="text-sm font-semibold text-bronze">{[task.time_label, task.area].filter(Boolean).join(' · ')}</p>}
        <p className={`text-base ${task.status === 'done' ? 'text-navy/50 line-through' : ''}`}>{task.task_text}</p>
        {task.status === 'blocked' && task.note && <p className="mt-1 flex items-start gap-1 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {task.note}</p>}
        {task.status !== 'open' && task.status_at && <p className="text-xs text-navy/45">{formatDateTime(task.status_at, i18n.language)}</p>}
      </div>
      {editable && !asking && (
        <div className="flex gap-2">
          {task.status === 'done' ? (
            <Button size="sm" variant="ghost" disabled={set.isPending} onClick={() => set.mutate({ status: 'open' })}><RotateCcw className="h-4 w-4" /> {t('crewToday.undo')}</Button>
          ) : (
            <Button className="flex-1" disabled={set.isPending} onClick={() => set.mutate({ status: 'done' })}><Check className="h-5 w-5" /> {t('crewToday.done')}</Button>
          )}
          {task.status !== 'done' && (
            <Button variant="outline" className="flex-1" disabled={set.isPending} onClick={() => { setAsking(true); setNote(task.status === 'blocked' ? task.note ?? '' : '') }}>
              <AlertTriangle className="h-5 w-5" /> {t('crewToday.blocked')}
            </Button>
          )}
        </div>
      )}
      {asking && (
        <div className="space-y-2">
          <Textarea rows={2} value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder={t('crewToday.reasonPlaceholder')} />
          <FormError message={set.isError && (set.error as Error).message === 'note_required' ? t('crewToday.errors.note_required') : null} />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setAsking(false)}>{t('common.cancel')}</Button>
            <Button className="flex-1" disabled={!note.trim() || set.isPending} onClick={() => set.mutate({ status: 'blocked', note })}>{t('crewToday.sendBlocked')}</Button>
          </div>
        </div>
      )}
    </li>
  )
}

/** Vai A: tổng Xong / Vướng từng ô + các mục Vướng mới nhất. */
function CoordinatorPanel({ data }: { data: CrewTodayData }) {
  const { t, i18n } = useTranslation()
  const rows = data.summary ?? []
  const total = rows.reduce((s, r) => s + r.total, 0)
  const done = rows.reduce((s, r) => s + r.done, 0)
  return (
    <Card className="space-y-3 p-4">
      <p className="font-bold">{t('crewToday.coordinator', { done, total })}</p>
      {(data.blocked?.length ?? 0) > 0 && (
        <ul className="space-y-2">
          {data.blocked!.map((b, i) => (
            <li key={i} className="rounded-lg bg-red-50 p-2 text-sm">
              <p className="font-semibold text-red-800">{b.slot_code} · {b.full_name} · {formatDateTime(b.status_at, i18n.language)}</p>
              <p>{b.task_text}</p>
              <p className="text-red-800">{b.note}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.slot_code} className={`rounded-lg p-2 ${r.blocked ? 'bg-red-50' : r.done === r.total ? 'bg-emerald-50' : 'bg-navy/5'}`}>
            <p className="text-sm font-bold">{r.slot_code} <span className="font-normal text-navy/60">{r.full_name}</span></p>
            <p className="text-sm">{t('crewToday.progress', { done: r.done, total: r.total })}{r.blocked ? ` · ${t('crew.blockedN', { n: r.blocked })}` : ''}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
