import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowLeft, Clock, Plus, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/i18nField'
import { usePublicBaseUrl } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Field, FormError, Input, Select } from '@/components/ui/form'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { passportUrl } from '@/features/passports/exports'
import { CrewAdmin, useCrewDepartments, type CrewMember } from './CrewAdmin'
import { InventoryPanel } from './Inventory'
import { AddDepartmentDialog, AddPersonDialog } from './CrewDialogs'

interface Board {
  event: { id: string; name_vi: string; event_date: string; status: string }
  departments: { role_code: string; role_name: string; badge_color: string | null; people: number; total: number; done: number; blocked: number }[]
  phases: { phase_no: number; phase_label: string; total: number; done: number; blocked: number }[]
  blocked: { task_id: string; slot_code: string; role_name: string; full_name: string; task_text: string; note: string; status_at: string }[]
  overdue: { task_id: string; slot_code: string; role_name: string; full_name: string; task_text: string; time_label: string; deadline: string }[]
  badges: { not_printed: number; printed: number; received: number }
}
interface PersonTask { id: string; phase_no: number; phase_label: string; time_label: string | null; area: string | null; task_text: string
  status: string; note: string | null; kind: 'template' | 'department' | 'personal' }

const rpc = async <T,>(fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) throw error
  return data as T
}
const pct = (d: number, t: number) => (t ? Math.round((d / t) * 100) : 0)

function Bar({ done, total, blocked, color }: { done: number; total: number; blocked: number; color?: string | null }) {
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-navy/10">
      <div style={{ width: `${pct(done, total)}%`, background: color ?? '#059669' }} />
      <div className="bg-red-500" style={{ width: `${pct(blocked, total)}%` }} />
    </div>
  )
}

/** BTC sự kiện / admin · Bảng điều phối nhân sự (spec 11 mục 4.5): tiến độ, Vướng, quá giờ, thẻ đeo, thêm bớt người và việc, kho. */
export function CrewBoardPage() {
  const { eventId = '' } = useParams()
  const { t } = useTranslation()
  const board = useQuery({ queryKey: ['crew_board', eventId], refetchInterval: 20_000, queryFn: () => rpc<Board>('crew_board', { p_event_id: eventId }) })
  const [tab, setTab] = useState<'board' | 'people' | 'stock'>('board')
  const b = board.data
  const total = b?.departments.reduce((s, d) => s + d.total, 0) ?? 0
  const done = b?.departments.reduce((s, d) => s + d.done, 0) ?? 0

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to={`/event/${eventId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-bronze"><ArrowLeft className="h-4 w-4" /> {t('counter.title')}</Link>
      <div>
        <h1 className="text-2xl font-bold">{t('crewBoard.title')}</h1>
        {b && <p className="text-sm text-navy/60">{b.event.name_vi} · {t('crewToday.progress', { done, total })} ({pct(done, total)}%)</p>}
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-navy/5 p-1">
        {(['board', 'people', 'stock'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`min-h-11 rounded-lg text-sm font-semibold ${tab === k ? 'bg-white text-navy shadow' : 'text-navy/60'}`}>{t(`crewBoard.tab.${k}`)}</button>
        ))}
      </div>
      {board.isError && <FormError message={(board.error as Error).message} />}
      {tab === 'board' && b && <Overview board={b} />}
      {tab === 'people' && <People eventId={eventId} />}
      {tab === 'stock' && <InventoryPanel eventId={eventId} />}
    </div>
  )
}

function Overview({ board: b }: { board: Board }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="space-y-4">
      {b.blocked.length > 0 && (
        <Card className="space-y-2 border-red-300 p-4">
          <p className="flex items-center gap-2 font-bold text-red-800"><AlertTriangle className="h-5 w-5" /> {t('crewBoard.blocked', { n: b.blocked.length })}</p>
          <ul className="space-y-2">
            {b.blocked.map((x) => (
              <li key={x.task_id} className="rounded-lg bg-red-50 p-2 text-sm">
                <p className="font-semibold">{x.role_name} · {x.full_name} <span className="font-normal text-navy/55">· {formatDateTime(x.status_at, i18n.language)}</span></p>
                <p>{x.task_text}</p>
                <p className="text-red-800">{x.note}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {b.overdue.length > 0 && (
        <Card className="space-y-2 border-amber-300 p-4">
          <p className="flex items-center gap-2 font-bold text-amber-800"><Clock className="h-5 w-5" /> {t('crewBoard.overdue', { n: b.overdue.length })}</p>
          <ul className="space-y-1 text-sm">
            {b.overdue.slice(0, 30).map((x) => (
              <li key={x.task_id}><span className="font-semibold">{x.time_label}</span> · {x.role_name} · {x.full_name}: {x.task_text}</li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="space-y-3 p-4">
        <p className="font-bold">{t('crewBoard.byDepartment')}</p>
        {b.departments.length === 0 && <p className="text-sm text-navy/55">{t('crewBoard.noPeople')}</p>}
        {b.departments.map((d) => (
          <div key={d.role_code} className="space-y-1">
            <div className="flex justify-between gap-2 text-sm">
              <span className="font-semibold">{d.role_name} <span className="font-normal text-navy/55">· {t('crewBoard.people', { n: d.people })}</span></span>
              <span>{pct(d.done, d.total)}% · {d.done}/{d.total}{d.blocked ? ` · ${t('crew.blockedN', { n: d.blocked })}` : ''}</span>
            </div>
            <Bar done={d.done} total={d.total} blocked={d.blocked} color={d.badge_color} />
          </div>
        ))}
      </Card>
      <Card className="space-y-3 p-4">
        <p className="font-bold">{t('crewBoard.byPhase')}</p>
        {b.phases.map((p) => (
          <div key={p.phase_no} className="space-y-1">
            <div className="flex justify-between gap-2 text-sm"><span className="font-semibold">{p.phase_label}</span><span>{pct(p.done, p.total)}% · {p.done}/{p.total}</span></div>
            <Bar done={p.done} total={p.total} blocked={p.blocked} />
          </div>
        ))}
      </Card>
      <Card className="p-4 text-sm">
        <p className="font-bold">{t('crewBoard.badges')}</p>
        <p>{t('crewBoard.badgeCounts', { received: b.badges.received, other: b.badges.not_printed + b.badges.printed })}</p>
      </Card>
    </div>
  )
}

function People({ eventId }: { eventId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const baseUrl = usePublicBaseUrl()
  const roster = useQuery({ queryKey: ['crew_roster', eventId], queryFn: () => rpc<CrewMember[]>('crew_roster', { p_event_id: eventId }) })
  const [person, setPerson] = useState<CrewMember | null>(null)
  const [deptTask, setDeptTask] = useState(false)
  const [addPerson, setAddPerson] = useState(false)
  const [addDept, setAddDept] = useState(false)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crew_roster', eventId] })
    qc.invalidateQueries({ queryKey: ['crew_board', eventId] })
  }
  const badge = useMutation({
    mutationFn: (v: { id: string; status: string }) => rpc('crew_set_badge', { p_assignment_id: v.id, p_status: v.status }),
    onSuccess: refresh,
    onError: (e) => toast((e as Error).message, 'error'),
  })
  const groups = new Map<string, CrewMember[]>()
  for (const m of roster.data ?? []) groups.set(m.role_name, [...(groups.get(m.role_name) ?? []), m])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setAddPerson(true)}><UserPlus className="h-4 w-4" /> {t('crewBoard.addPerson')}</Button>
        <Button variant="outline" onClick={() => setDeptTask(true)}><Plus className="h-4 w-4" /> {t('crewBoard.addDeptTask')}</Button>
        <Button variant="outline" onClick={() => setAddDept(true)}><Plus className="h-4 w-4" /> {t('crewBoard.addDepartment')}</Button>
      </div>
      {addPerson && <AddPersonDialog eventId={eventId} onClose={() => { setAddPerson(false); refresh() }} />}
      {addDept && <AddDepartmentDialog eventId={eventId} onClose={() => setAddDept(false)} />}
      {[...groups.entries()].map(([role, members]) => (
        <Card key={role} className="space-y-2 p-4">
          <p className="font-bold">{role} <span className="font-normal text-navy/55">· {t('crewBoard.people', { n: members.length })}</span></p>
          <ul className="divide-y divide-navy/10">
            {members.map((m) => (
              <li key={m.assignment_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <button type="button" className="min-w-0 text-left" onClick={() => setPerson(m)}>
                  <span className="block font-semibold">{m.full_name}{m.is_child && <Badge className="ml-1">{t('crew.child')}</Badge>}</span>
                  <span className="block text-xs text-navy/55">{[m.position, m.slot_code, t('crew.progressValue', { done: m.done, total: m.tasks })].filter(Boolean).join(' · ')}
                    {m.blocked > 0 && <span className="text-red-700"> · {t('crew.blockedN', { n: m.blocked })}</span>}</span>
                </button>
                <div className="flex items-center gap-2">
                  {m.passport_code && <a className="text-xs text-bronze underline" href={passportUrl(baseUrl, m.passport_code)} target="_blank" rel="noreferrer">/p/{m.passport_code}</a>}
                  <Button size="sm" variant={m.badge_status === 'received' ? 'primary' : 'outline'} disabled={badge.isPending}
                    onClick={() => badge.mutate({ id: m.assignment_id, status: m.badge_status === 'received' ? 'printed' : 'received' })}>
                    {m.badge_status === 'received' ? t('crewBoard.badgeReceived') : t('crewBoard.badgeNotReceived')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <CrewAdmin eventId={eventId} onChanged={refresh} />
      {person && <PersonDialog eventId={eventId} member={person} onClose={() => { setPerson(null); refresh() }} />}
      {deptTask && <AddTaskDialog eventId={eventId} onClose={() => { setDeptTask(false); refresh() }} />}
    </div>
  )
}

function PersonDialog({ eventId, member, onClose }: { eventId: string; member: CrewMember; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const key = ['crew_person_tasks', member.assignment_id]
  const tasks = useQuery({ queryKey: key, queryFn: () => rpc<PersonTask[]>('crew_person_tasks', { p_assignment_id: member.assignment_id }) })
  const [adding, setAdding] = useState(false)
  const remove = useMutation({
    mutationFn: (v: { id: string; scope: 'one' | 'role' }) => rpc('crew_remove_task', { p_task_id: v.id, p_scope: v.scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast((e as Error).message, 'error'),
  })
  const removePerson = useMutation({
    mutationFn: () => rpc('crew_remove_assignment', { p_assignment_id: member.assignment_id }),
    onSuccess: () => { toast(t('crewBoard.personRemoved')); onClose() },
    onError: (e) => toast((e as Error).message, 'error'),
  })
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [position, setPosition] = useState(member.position ?? '')
  const savePosition = useMutation({
    mutationFn: () => rpc('crew_set_position', { p_assignment_id: member.assignment_id, p_position: position }),
    onSuccess: () => toast(t('common.saved')),
    onError: (e) => toast((e as Error).message, 'error'),
  })
  return (
    <Dialog open onClose={onClose} title={`${member.full_name} · ${member.role_name}`}>
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <Field label={t('crewBoard.position')}><Input value={position} onChange={(e) => setPosition(e.target.value)} /></Field>
          <Button size="sm" variant="outline" disabled={savePosition.isPending || position === (member.position ?? '')} onClick={() => savePosition.mutate()}>{t('common.save')}</Button>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('crewBoard.addPersonTask')}</Button>
        <ul className="max-h-[50vh] divide-y divide-navy/10 overflow-y-auto">
          {tasks.data?.map((x) => (
            <li key={x.id} className="space-y-1 py-2 text-sm">
              <p><span className="font-semibold text-bronze">{x.phase_no}. {x.time_label}</span> {x.task_text}
                {x.status === 'done' && <Badge tone="good" className="ml-1">{t('crewToday.done')}</Badge>}
                {x.status === 'blocked' && <Badge tone="bad" className="ml-1">{t('crewToday.blocked')}</Badge>}
                {x.kind !== 'template' && <Badge className="ml-1">{t(`crewBoard.kind.${x.kind}`)}</Badge>}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate({ id: x.id, scope: 'one' })}>
                  <Trash2 className="h-4 w-4" /> {t('crewBoard.removeForPerson')}
                </Button>
                {x.kind !== 'personal' && (
                  <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate({ id: x.id, scope: 'role' })}>
                    <Trash2 className="h-4 w-4" /> {t('crewBoard.removeForDept')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {!confirmRemove ? (
          <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setConfirmRemove(true)}><UserMinus className="h-4 w-4" /> {t('crewBoard.removePerson')}</Button>
        ) : (
          <div className="space-y-2 rounded-xl bg-red-50 p-3 text-sm">
            <p>{t('crewBoard.removePersonConfirm')}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmRemove(false)}>{t('common.cancel')}</Button>
              <Button size="sm" disabled={removePerson.isPending} onClick={() => removePerson.mutate()}>{t('crewBoard.removePerson')}</Button>
            </div>
          </div>
        )}
      </div>
      {adding && <AddTaskDialog eventId={eventId} assignmentId={member.assignment_id} onClose={() => { setAdding(false); qc.invalidateQueries({ queryKey: key }) }} />}
    </Dialog>
  )
}

function AddTaskDialog({ eventId, assignmentId, onClose }: { eventId: string; assignmentId?: string; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const depts = useCrewDepartments()
  const [role, setRole] = useState('')
  const [phase, setPhase] = useState('4')
  const [time, setTime] = useState('')
  const [area, setArea] = useState('')
  const [text, setText] = useState('')
  const add = useMutation({
    mutationFn: () => rpc<number>('crew_add_task', { p_event_id: eventId, p_assignment_id: assignmentId ?? null, p_role_code: assignmentId ? null : role,
      p_phase_no: Number(phase), p_time_label: time, p_area: area, p_task_text: text }),
    onSuccess: (n) => { toast(t('crewBoard.taskAdded', { n })); onClose() },
  })
  const roles = (depts.data ?? []).filter((d) => d.value === d.role_code)
  return (
    <Dialog open onClose={onClose} title={assignmentId ? t('crewBoard.addPersonTask') : t('crewBoard.addDeptTask')}>
      <div className="space-y-3">
        {!assignmentId && (
          <Field label={t('crewBoard.department')}>
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="" />
              {roles.map((d) => <option key={d.role_code} value={d.role_code}>{d.label}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('crewBoard.phase')}>
          <Select value={phase} onChange={(e) => setPhase(e.target.value)}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{t(`crewBoard.phaseN.${n}`)}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('crewBoard.time')}><Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="16h30" /></Field>
          <Field label={t('crewBoard.area')}><Input value={area} onChange={(e) => setArea(e.target.value)} /></Field>
        </div>
        <Field label={t('crewBoard.taskText')}><Input value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <FormError message={add.isError ? (add.error as Error).message : null} />
        <Button size="full" disabled={!text.trim() || (!assignmentId && !role) || add.isPending} onClick={() => add.mutate()}>{t('common.add')}</Button>
      </div>
    </Dialog>
  )
}
