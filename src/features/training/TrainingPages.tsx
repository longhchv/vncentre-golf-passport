import { useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CalendarDays, ChevronLeft, ClipboardList, Dumbbell, Flag, Ruler, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { ComingSoon } from '@/components/ComingSoon'
import { Mascot } from '@/components/Mascot'
import { errorMessage } from '@/lib/db'
import { useLocalized } from '@/lib/i18nField'
import { cn } from '@/lib/utils'
import {
  addClub, cursorOf, deleteRound, saveIntake, saveRound, useBenchmarks, useClubs, useGoal, useMe, usePracticeDays, useProgram,
  usePrograms, useRounds, useRpc, useTrainingEnabled, useTrainingSettings, useUpdateGoal, type Goal, type Me,
} from './api'
import {
  addDays, calendarWeek, dow, exerciseLineIndexes, fixedTable, isFinished, lineCoverage, minutesLeft, mondayOf, nextChunks,
  planDays, programForTarget, realisticMonths, sessionMinutesFor, totalMinutes, vnToday, weeksNeeded, type Chunk, type Program,
} from './planner'
import { PersonSwitcher } from './JuniorTraining'
import { averageStats, benchmark, estimateFromIntake, roundStats, weakestArea, type Area, type HoleRow } from './stats'

const BASE = '/app/training'
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const CLUBS = ['dr', '3w', '5w', '7w', 'h3', 'h4', 'h5', '3i', '4i', '5i', '6i', '7i', '8i', '9i', 'pw', 'gw', 'sw', 'lw']

// ---------------------------------------------------------------- dùng chung

function useFmt() {
  const { t } = useTranslation()
  return (mins: number) => {
    const m = Math.round(mins)
    if (m < 60) return t('training.fmt.min', { n: m })
    return m % 60 ? t('training.fmt.hourMin', { h: Math.floor(m / 60), m: m % 60 }) : t('training.fmt.hour', { h: m / 60 })
  }
}

function ageOn(dob: string | null, today: string) {
  if (!dob) return null
  const [y, m, d] = dob.split('-').map(Number)
  const [ty, tm, td2] = today.split('-').map(Number)
  return ty - y - (tm < m || (tm === m && td2 < d) ? 1 : 0)
}

function trainingError(err: unknown, t: (k: string) => string) {
  const msg = (err as { message?: string })?.message ?? ''
  const known = ['under_min_age', 'dob_required', 'name_required', 'out_of_order', 'goal_not_active', 'training_disabled', 'no_profile']
  return known.includes(msg) ? t(`training.err.${msg}`) : errorMessage(err, t)
}

function Chips<T extends string | number>({ options, value, onToggle, label }: {
  options: readonly T[]; value: T[]; onToggle: (v: T) => void; label: (v: T) => string
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          aria-pressed={value.includes(o)}
          onClick={() => onToggle(o)}
          className={cn(
            'min-h-10 rounded-full border-2 px-3 text-sm font-semibold transition-colors',
            value.includes(o) ? 'border-bronze bg-gold/25 text-navy' : 'border-navy/15 bg-white text-navy/70 hover:bg-navy/5',
          )}
        >
          {label(o)}
        </button>
      ))}
    </div>
  )
}

function Back({ to = BASE }: { to?: string }) {
  const { t } = useTranslation()
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
      <ChevronLeft className="h-4 w-4" /> {t('training.back')}
    </Link>
  )
}

function Shell({ title, back, children }: { title: string; back?: string | false; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-lg space-y-5">
      {back !== false && <Back to={back || BASE} />}
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
      <p className="text-sm text-navy/50">{t('training.sourceNote')}</p>
    </div>
  )
}

/** Điều kiện vào mục Tập luyện: được bật, có hồ sơ golfer, đủ tuổi. Trả về hồ sơ cho trang con. */
function Gate({ children }: { children: (me: Me) => ReactNode }) {
  const { t } = useTranslation()
  const enabled = useTrainingEnabled()
  const me = useMe()
  const s = useTrainingSettings()
  if (enabled.isPending || (enabled.data && me.isPending)) return <p className="text-navy/60">{t('common.loading')}</p>
  if (!enabled.data) return <ComingSoon title={t('training.title')} />
  if (!me.data) return <CreateProfile />
  const age = ageOn(me.data.date_of_birth, vnToday())
  if (age != null && age < s.minAge) {
    return (
      <Shell title={t('training.title')} back={false}>
        <Card className="space-y-2 p-5">
          <p className="font-semibold">{t('training.junior.title')}</p>
          <p className="text-navy/70">{t('training.junior.body', { age: s.minAge })}</p>
        </Card>
      </Shell>
    )
  }
  return <>{children(me.data)}</>
}

/** Cách B: người lớn tự tạo hồ sơ golfer, luôn là hồ sơ mới chờ xác minh. */
function CreateProfile() {
  const { t } = useTranslation()
  const toast = useToast()
  const s = useTrainingSettings()
  const create = useRpc<{ p_full_name: string; p_date_of_birth: string; p_gender: string | null }, { student_code: string }>('training_create_self_profile')
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const age = ageOn(dob || null, vnToday())

  return (
    <Shell title={t('training.title')} back={false}>
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Mascot className="h-14 w-14 shrink-0" />
          <div>
            <p className="font-semibold">{t('training.create.title')}</p>
            <p className="text-sm text-navy/65">{t('training.create.body')}</p>
          </div>
        </div>
        <Field label={t('training.create.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label={t('training.create.dob')} error={age != null && age < s.minAge ? t('training.err.under_min_age') : null}>
          <Input type="date" value={dob} max={vnToday()} onChange={(e) => setDob(e.target.value)} />
        </Field>
        <Field label={t('training.create.gender')}>
          <Select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">{t('training.create.genderNone')}</option>
            <option value="male">{t('training.create.male')}</option>
            <option value="female">{t('training.create.female')}</option>
            <option value="other">{t('training.create.other')}</option>
          </Select>
        </Field>
        <p className="text-sm text-navy/60">{t('training.create.note')}</p>
        <FormError message={err} />
        <Button
          size="full"
          disabled={!name.trim() || !dob || (age != null && age < s.minAge) || create.isPending}
          onClick={() => {
            setErr(null)
            create.mutate(
              { p_full_name: name.trim(), p_date_of_birth: dob, p_gender: gender || null },
              { onSuccess: (r) => toast(t('training.create.done', { code: r.student_code })), onError: (e) => setErr(trainingError(e, t)) },
            )
          }}
        >
          {t('training.create.submit')}
        </Button>
      </Card>
    </Shell>
  )
}

/** Mục tiêu đang chạy + giáo án của nó. */
function useGoalProgram(me: Me) {
  const goal = useGoal(me.id)
  const program = useProgram(goal.data?.program_id, goal.data?.program)
  const days = usePracticeDays(goal.data?.id)
  return { goal, program, days, loading: goal.isPending || (goal.data && (program.isPending || days.isPending)) }
}

function schedule(g: Goal, s: ReturnType<typeof useTrainingSettings>) {
  return {
    mode: g.schedule_mode, days: g.days_of_week, sessionMinutes: g.session_minutes, startDate: g.start_date,
    maxSessionMinutes: s.maxSession, blockMinutes: s.blockMinutes,
  }
}

// ---------------------------------------------------------------- Trang chủ Tập luyện

export function TrainingHomePage() {
  return (
    <div className="space-y-4">
      <PersonSwitcher current="me" />
      <Gate>{(me) => <Home me={me} />}</Gate>
    </div>
  )
}

function Home({ me }: { me: Me }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const fmt = useFmt()
  const s = useTrainingSettings()
  const { goal, program, days, loading } = useGoalProgram(me)
  const today = vnToday()

  if (loading) return <p className="text-navy/60">{t('common.loading')}</p>
  const g = goal.data
  const links = (
    <div className="grid grid-cols-2 gap-3">
      {[
        { to: `${BASE}/plan`, icon: CalendarDays, label: t('training.nav.plan'), show: Boolean(g) },
        { to: `${BASE}/rounds`, icon: Flag, label: t('training.nav.rounds'), show: true },
        { to: `${BASE}/clubs`, icon: Ruler, label: t('training.nav.clubs'), show: true },
        { to: `${BASE}/test`, icon: ClipboardList, label: t('training.nav.test'), show: true },
        { to: `${BASE}/goal`, icon: Target, label: g ? t('training.nav.changeGoal') : t('training.nav.setGoal'), show: true },
      ].filter((x) => x.show).map((x) => (
        <Link key={x.to} to={x.to}>
          <Card className="flex min-h-16 items-center gap-2 p-3 font-semibold hover:border-bronze">
            <x.icon className="h-5 w-5 shrink-0 text-bronze" /> {x.label}
          </Card>
        </Link>
      ))}
    </div>
  )

  const header = (
    <div className="flex items-center gap-3">
      <Dumbbell className="h-10 w-10 shrink-0 text-bronze" />
      <div>
        <h1 className="text-2xl font-bold">{t('training.title')}</h1>
        <p className="text-sm text-navy/60">
          {me.full_name} · {me.student_code}
          {me.verification_status === 'pending_review' && <Badge tone="warn" className="ml-2">{t('training.pendingProfile')}</Badge>}
        </p>
      </div>
    </div>
  )

  if (!g || !program.data) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        {header}
        <Card className="space-y-3 p-5">
          <p className="text-lg font-semibold">{t('training.noGoal.title')}</p>
          <p className="text-navy/70">{t('training.noGoal.body')}</p>
          <Button asChild size="full"><Link to={`${BASE}/goal`}>{t('training.nav.setGoal')}</Link></Button>
          <Button asChild size="full" variant="outline"><Link to={`${BASE}/test`}>{t('training.noGoal.test')}</Link></Button>
        </Card>
        {links}
      </div>
    )
  }

  const p = program.data
  const c = cursorOf(g)
  const sch = schedule(g, s)
  const done = days.data?.days ?? new Set<string>()
  const doneToday = done.has(today)
  const scheduledToday = g.days_of_week.includes(dow(today))
  const finished = isFinished(p, c)
  const mins = sessionMinutesFor(p, c, sch, today, (d) => d < today || done.has(d))
  const plan = nextChunks(p, c, mins, s.blockMinutes)
  const behind = g.schedule_mode === 'fixed_12_weeks' && !finished ? calendarWeek(g.start_date, today) - c.week : 0
  const realistic = realisticMonths(g.hcp_start, g.hcp_target, g.months, s.maxDrop)
  const left = minutesLeft(p, c)
  const progress = Math.round((1 - left / totalMinutes(p)) * 100)

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {header}
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-navy/60">
            {loc(g.program, 'name')} · {t('training.goalLine', { from: g.hcp_start ?? '–', to: g.hcp_target, months: g.months })}
          </p>
          <Badge>{t('training.progress', { n: progress })}</Badge>
        </div>
        <div className="h-2 rounded-full bg-navy/10"><div className="h-2 rounded-full bg-bronze" style={{ width: `${progress}%` }} /></div>
        {finished ? (
          <>
            <p className="text-xl font-bold">{t('training.finished.title')}</p>
            <p className="text-navy/70">{t('training.finished.body')}</p>
          </>
        ) : doneToday ? (
          <p className="text-xl font-bold">{t('training.today.done')}</p>
        ) : scheduledToday ? (
          <>
            <p className="text-xl font-bold">{t('training.today.title', { mins: fmt(plan.chunks.reduce((a, x) => a + x.minutes, 0)) })}</p>
            <ul className="space-y-1">
              {plan.chunks.map((x, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-navy/80">
                  <span>
                    {loc(x.block, 'title')}
                    {!x.whole && <span className="text-navy/50"> · {t('training.partial')}</span>}
                  </span>
                  {g.weak_area === x.block.area && <Badge tone="warn">{t('training.priority')}</Badge>}
                </li>
              ))}
            </ul>
            <p className="text-sm text-navy/55">{t('training.weekDay', { w: plan.chunks[0]?.week, d: plan.chunks[0]?.day })}</p>
            <Button asChild size="full"><Link to={`${BASE}/session`}>{t('training.today.start')}</Link></Button>
          </>
        ) : (
          <>
            <p className="text-xl font-bold">{t('training.today.rest')}</p>
            <p className="text-navy/70">{t('training.today.restBody')}</p>
            <Button asChild size="full" variant="outline"><Link to={`${BASE}/session?extra=1`}>{t('training.today.extra')}</Link></Button>
          </>
        )}
        {behind > 0 && <p className="rounded-xl bg-gold/15 px-3 py-2 text-sm text-brown">{t('training.behind', { n: behind })}</p>}
        {realistic && <p className="rounded-xl bg-gold/15 px-3 py-2 text-sm text-brown">{t('training.unrealistic', { n: realistic })}</p>}
      </Card>
      {links}
      <p className="text-sm text-navy/50">{t('training.sourceNote')}</p>
    </div>
  )
}

// ---------------------------------------------------------------- Đặt mục tiêu

export function TrainingGoalPage() {
  return <Gate>{(me) => <GoalForm me={me} />}</Gate>
}

function GoalForm({ me }: { me: Me }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const toast = useToast()
  const nav = useNavigate()
  const location = useLocation() as { state?: { hcp?: number; weak?: Area } }
  const s = useTrainingSettings()
  const current = useGoal(me.id).data
  const programs = usePrograms()
  const start = useRpc<{ p_data: Record<string, unknown> }, string>('training_start_goal')

  const [noHcp, setNoHcp] = useState(false)
  const [hcpNow, setHcpNow] = useState(String(location.state?.hcp ?? current?.hcp_start ?? ''))
  const [target, setTarget] = useState(String(current?.hcp_target ?? ''))
  const [months, setMonths] = useState(current?.months ?? 6)
  const [mode, setMode] = useState<Goal['schedule_mode']>(current?.schedule_mode ?? 'fixed_12_weeks')
  const [daysOfWeek, setDays] = useState<number[]>(current?.days_of_week ?? [1, 2, 3, 4, 5, 6])
  const [minutes, setMinutes] = useState(current?.session_minutes ?? 60)
  const [err, setErr] = useState<string | null>(null)

  const tgt = target === '' ? null : Number(target)
  const now = noHcp || hcpNow === '' ? null : Number(hcpNow)
  const code = tgt == null ? null : programForTarget(tgt)
  const prog = programs.data?.find((p) => p.code === code)
  const program = useProgram(prog?.id, prog)
  const realistic = tgt == null ? null : realisticMonths(now, tgt, months, s.maxDrop)

  return (
    <Shell title={current ? t('training.nav.changeGoal') : t('training.nav.setGoal')}>
      <Card className="space-y-4 p-5">
        <Field label={t('training.goal.now')} hint={t('training.goal.nowHint')}>
          <Input type="number" inputMode="decimal" step="0.1" min={-10} max={54} value={noHcp ? '' : hcpNow} disabled={noHcp} onChange={(e) => setHcpNow(e.target.value)} />
        </Field>
        <Checkbox label={t('training.goal.noHcp')} checked={noHcp} onChange={(e) => setNoHcp(e.target.checked)} />
        {noHcp && (
          <p className="text-sm text-navy/65">
            {t('training.goal.noHcpHint')} <Link className="font-semibold text-bronze" to={`${BASE}/test`}>{t('training.nav.test')}</Link>
          </p>
        )}
        <Field label={t('training.goal.target')}>
          <Input type="number" inputMode="decimal" step="0.1" min={-10} max={54} value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label={t('training.goal.months')}>
          <Chips options={[3, 6, 9, 12]} value={[months]} onToggle={setMonths} label={(m) => t('training.goal.monthN', { n: m })} />
        </Field>
        {prog && <p className="rounded-xl bg-navy/5 px-3 py-2 text-sm">{t('training.goal.program', { name: loc(prog, 'name') })}</p>}
        {realistic && <p className="rounded-xl bg-gold/15 px-3 py-2 text-sm text-brown">{t('training.unrealistic', { n: realistic })}</p>}
      </Card>

      <Card className="space-y-4 p-5">
        <ScheduleFields
          program={program.data}
          mode={mode} setMode={setMode}
          days={daysOfWeek} setDays={setDays}
          minutes={minutes} setMinutes={setMinutes}
          goalMonths={months}
        />
      </Card>

      <FormError message={err} />
      <Button
        size="full"
        disabled={tgt == null || !daysOfWeek.length || start.isPending || (now != null && tgt != null && tgt >= now)}
        onClick={() => {
          setErr(null)
          start.mutate(
            {
              p_data: {
                hcp_start: now, hcp_start_source: now == null ? 'none' : location.state?.hcp != null && Number(hcpNow) === location.state.hcp ? 'intake_test' : 'self_declared',
                hcp_target: tgt, months, schedule_mode: mode, days_of_week: daysOfWeek, session_minutes: minutes,
                weak_area: location.state?.weak ?? current?.weak_area ?? null,
              },
            },
            { onSuccess: () => { toast(t('training.goal.saved')); nav(BASE) }, onError: (e) => setErr(trainingError(e, t)) },
          )
        }}
      >
        {current ? t('training.goal.replace') : t('training.goal.submit')}
      </Button>
      {current && <p className="text-sm text-navy/55">{t('training.goal.replaceNote')}</p>}
      {now != null && tgt != null && tgt >= now && <p className="text-sm text-red-700">{t('training.goal.targetLower')}</p>}
    </Shell>
  )
}

/** Chọn cách xếp lịch, ngày tập, thời lượng; kèm ước tính thời gian hoàn thành. */
function ScheduleFields({ program, mode, setMode, days, setDays, minutes, setMinutes, goalMonths }: {
  program: Program | undefined
  mode: Goal['schedule_mode']; setMode: (m: Goal['schedule_mode']) => void
  days: number[]; setDays: (d: number[]) => void
  minutes: number; setMinutes: (m: number) => void
  goalMonths: number
}) {
  const { t } = useTranslation()
  const fmt = useFmt()
  const s = useTrainingSettings()
  const table = program ? fixedTable(program, s.blockMinutes) : null
  const weeks = program ? weeksNeeded(program, days.length, minutes) : null
  return (
    <>
      <Field label={t('training.sched.mode')}>
        <Chips
          options={['fixed_12_weeks', 'flexible'] as Goal['schedule_mode'][]}
          value={[mode]}
          onToggle={setMode}
          label={(m) => t(`training.sched.${m}`)}
        />
      </Field>
      <p className="text-sm text-navy/60">{t(`training.sched.${mode}Hint`)}</p>
      <Field label={t('training.sched.days')}>
        <Chips
          options={WEEK_ORDER}
          value={days}
          onToggle={(d) => {
            const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]
            if (next.length) setDays(next.sort())
          }}
          label={(d) => t(`training.dow.${d}`)}
        />
      </Field>
      {mode === 'flexible' ? (
        <>
          <Field label={t('training.sched.minutes')}>
            <Chips options={s.options} value={[minutes]} onToggle={setMinutes} label={fmt} />
          </Field>
          {program && weeks != null && (
            <p className="text-sm">
              {t('training.sched.estimate', { total: fmt(totalMinutes(program)), weeks })}
              {weeks > Math.round(goalMonths * 4.35) && <span className="block text-brown">{t('training.sched.tooLong', { months: goalMonths })}</span>}
            </p>
          )}
        </>
      ) : (
        table && (
          <div className="space-y-2">
            <p className="text-sm">{t('training.sched.fixedIntro', { min: fmt(table.min), max: fmt(table.max) })}</p>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr><th className={th}>{t('training.sched.perWeek')}</th><th className={th}>{t('training.sched.avg')}</th><th className={th}>{t('training.sched.heaviest')}</th></tr>
                </thead>
                <tbody>
                  {table.rows.map((r) => (
                    <tr key={r.n} className={cn(r.n === days.length && 'bg-gold/15 font-semibold')}>
                      <td className={td}>{t('training.sched.nSessions', { n: r.n })}</td><td className={td}>{fmt(r.avg)}</td><td className={td}>{fmt(r.max)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {days.length < 3 && <p className="text-sm text-brown">{t('training.sched.fewDays')}</p>}
          </div>
        )
      )}
    </>
  )
}

// ---------------------------------------------------------------- Bài test đầu vào

export function TrainingTestPage() {
  return <Gate>{(me) => <IntakeTest me={me} />}</Gate>
}

function IntakeTest({ me }: { me: Me }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const toast = useToast()
  const s = useTrainingSettings()
  const goal = useGoal(me.id).data
  const [v, setV] = useState<Record<'putt' | 'chip' | 'long', number | null>>({ putt: null, chip: null, long: null })
  const [saved, setSaved] = useState<ReturnType<typeof estimateFromIntake> | null>(null)
  const [busy, setBusy] = useState(false)
  const ready = v.putt != null && v.chip != null && v.long != null

  return (
    <Shell title={t('training.nav.test')}>
      <p className="text-navy/70">{t('training.test.intro')}</p>
      {(['putt', 'chip', 'long'] as const).map((k) => (
        <Card key={k} className="space-y-3 p-4">
          <p className="font-semibold">{t(`training.test.${k}`)}</p>
          <Chips options={[0, 1, 2, 3, 4, 5]} value={v[k] == null ? [] : [v[k]!]} onToggle={(n) => setV({ ...v, [k]: n })} label={(n) => `${n}/5`} />
        </Card>
      ))}
      {!saved ? (
        <Button
          size="full"
          disabled={!ready || busy}
          onClick={async () => {
            const e = estimateFromIntake(s.intake, v.putt!, v.chip!, v.long!)
            setBusy(true)
            try {
              await saveIntake({
                student_id: me.id, goal_id: goal?.id ?? null, putt_made: v.putt, chip_close: v.chip, tee_fairway: v.long,
                est_hcp_putt: e.putt, est_hcp_chip: e.chip, est_hcp_long: e.long, weak_area: e.weak,
              })
              setSaved(e)
            } catch (err) {
              toast(trainingError(err, t), 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('training.test.submit')}
        </Button>
      ) : (
        <Card className="space-y-3 border-bronze p-5">
          <p className="text-sm text-navy/60">{t('training.test.result')}</p>
          <p className="text-3xl font-bold">{t('training.test.hcp', { n: saved.hcp })}</p>
          <p className="text-sm text-navy/70">{t('training.test.weak', { area: t(`training.area.${saved.weak}`) })}</p>
          <p className="text-sm text-navy/60">{t('training.test.note')}</p>
          <Button size="full" onClick={() => nav(`${BASE}/goal`, { state: { hcp: saved.hcp, weak: saved.weak } })}>{t('training.test.useIt')}</Button>
        </Card>
      )}
    </Shell>
  )
}

// ---------------------------------------------------------------- Buổi tập

export function TrainingSessionPage() {
  return <Gate>{(me) => <Session me={me} />}</Gate>
}

function ChunkCard({ chunk, weak, done, setDone, result, setResult }: {
  chunk: Chunk; weak: boolean; done: boolean; setDone: (v: boolean) => void; result: string; setResult: (v: string) => void
}) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const fmt = useFmt()
  const ex = exerciseLineIndexes(chunk.block)
  return (
    <Card className={cn('space-y-3 p-4', weak && 'border-bronze')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">{loc(chunk.block, 'title')}</h2>
          <p className="text-sm text-navy/55">
            {t('training.weekDay', { w: chunk.week, d: chunk.day })} · {fmt(chunk.minutes)}
            {!chunk.whole && ` · ${t('training.partialHint')}`}
          </p>
        </div>
        {weak && <Badge tone="warn">{t('training.priority')}</Badge>}
      </div>
      <ul className="space-y-1.5">
        {chunk.block.lines.map((l, i) => {
          const text = (i18n.language === 'en' && l.en) || l.vi
          const li = ex.indexOf(i)
          if (li >= 0) {
            const n = lineCoverage(chunk, li)
            return (
              <li key={i} className={cn('flex gap-2', l.t === 's' && 'pl-4', n === 0 && 'opacity-40')}>
                <span aria-hidden>•</span>
                <span>
                  {text}
                  {n > 0 && n < chunk.perLine && <Badge tone="warn" className="ml-1 text-xs">{t('training.lineShare', { n, of: chunk.perLine })}</Badge>}
                </span>
              </li>
            )
          }
          if (l.t === 'h') return <li key={i} className="pt-2 font-semibold">{text}</li>
          if (l.t === 'o') return <li key={i} className="text-sm text-navy/65">◦ {text}</li>
          return <li key={i} className={cn('text-sm', /^(Hướng dẫn|Bài \d)/.test(text) ? 'text-navy/60' : 'text-navy/75')}>{text}</li>
        })}
      </ul>
      <Checkbox label={t('training.session.doneBlock')} checked={done} onChange={(e) => setDone(e.target.checked)} />
      <Field label={t('training.session.result')} hint={t('training.session.resultHint')}>
        <Input value={result} onChange={(e) => setResult(e.target.value)} placeholder="32/50" />
      </Field>
    </Card>
  )
}

function Session({ me }: { me: Me }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const toast = useToast()
  const fmt = useFmt()
  const loc = useLocalized()
  const s = useTrainingSettings()
  const { goal, program, days, loading } = useGoalProgram(me)
  const save = useRpc<Record<string, unknown>, { completed_items: number; done_minutes: number; program_completed: boolean }>('training_save_session')
  const today = vnToday()
  const g = goal.data
  const plan = useMemo(() => {
    if (!g || !program.data) return null
    const sch = schedule(g, s)
    const done = days.data?.days ?? new Set<string>()
    const scheduled = g.days_of_week.includes(dow(today))
    const mins = scheduled ? sessionMinutesFor(program.data, cursorOf(g), sch, today, (d) => d < today || done.has(d)) : g.session_minutes
    return { mins, ...nextChunks(program.data, cursorOf(g), mins, s.blockMinutes) }
  }, [g, program.data, days.data, s, today])
  const [state, setState] = useState<Record<number, { done: boolean; result: string }>>({})

  if (loading) return <p className="text-navy/60">{t('common.loading')}</p>
  if (!g || !plan) return <Shell title={t('training.title')}><Button asChild size="full"><Link to={`${BASE}/goal`}>{t('training.nav.setGoal')}</Link></Button></Shell>
  if (!plan.chunks.length) return <Shell title={t('training.finished.title')}><p>{t('training.finished.body')}</p></Shell>

  const get = (i: number) => state[i] ?? { done: true, result: '' }
  const set = (i: number, v: Partial<{ done: boolean; result: string }>) => setState({ ...state, [i]: { ...get(i), ...v } })

  return (
    <Shell title={t('training.session.title', { name: loc(g.program, 'name') })}>
      <p className="text-navy/70">{t('training.session.intro', { mins: fmt(plan.chunks.reduce((a, x) => a + x.minutes, 0)) })}</p>
      {plan.chunks.map((c, i) => (
        <ChunkCard
          key={i} chunk={c} weak={g.weak_area === c.block.area}
          done={get(i).done} setDone={(v) => set(i, { done: v })}
          result={get(i).result} setResult={(v) => set(i, { result: v })}
        />
      ))}
      <Button
        size="full"
        disabled={save.isPending}
        onClick={() =>
          save.mutate(
            {
              p_goal_id: g.id, p_practiced_on: today, p_planned_minutes: Math.round(plan.mins), p_note: null,
              p_items: plan.chunks.map((c, i) => ({
                block_id: c.block.id, unit_from: c.unitFrom, unit_to: c.unitTo, unit_total: c.unitTotal, completed: get(i).done, result_text: get(i).result || null,
              })),
            },
            {
              onSuccess: (r) => {
                toast(r.program_completed ? t('training.finished.title') : t('training.session.saved', { n: r.completed_items, mins: fmt(r.done_minutes) }))
                nav(BASE)
              },
              onError: (e) => toast(trainingError(e, t), 'error'),
            },
          )
        }
      >
        {t('training.session.save')}
      </Button>
      <p className="text-sm text-navy/55">{t('training.session.saveNote')}</p>
    </Shell>
  )
}

// ---------------------------------------------------------------- Kế hoạch tuần

export function TrainingPlanPage() {
  return <Gate>{(me) => <Plan me={me} />}</Gate>
}

function Plan({ me }: { me: Me }) {
  const { t } = useTranslation()
  const fmt = useFmt()
  const loc = useLocalized()
  const toast = useToast()
  const s = useTrainingSettings()
  const { goal, program, days, loading } = useGoalProgram(me)
  const update = useUpdateGoal()
  const today = vnToday()
  if (loading) return <p className="text-navy/60">{t('common.loading')}</p>
  const g = goal.data
  if (!g || !program.data) return <Shell title={t('training.nav.plan')}><Button asChild size="full"><Link to={`${BASE}/goal`}>{t('training.nav.setGoal')}</Link></Button></Shell>
  const p = program.data
  const done = days.data?.days ?? new Set<string>()
  const week = planDays(p, cursorOf(g), schedule(g, s), mondayOf(today), 7, today, done)
  const change = (v: Parameters<typeof update.mutate>[0]) => update.mutate(v, { onSuccess: () => toast(t('common.saved')), onError: (e) => toast(trainingError(e, t), 'error') })
  const milestones = Array.from({ length: g.months }, (_, i) => {
    const hcp = g.hcp_start == null ? null : Math.round((g.hcp_start - ((g.hcp_start - g.hcp_target) * (i + 1)) / g.months) * 10) / 10
    return { month: i + 1, hcp }
  })

  return (
    <Shell title={t('training.nav.plan')}>
      <Card className="divide-y divide-navy/10">
        {week.map((d) => (
          <div key={d.date} className={cn('space-y-1 p-3', d.date === today && 'bg-gold/10')}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{t(`training.dow.${dow(d.date)}`)} {d.date.slice(8)}/{d.date.slice(5, 7)}</span>
              {d.done ? <Badge tone="good">{t('training.plan.done')}</Badge>
                : d.chunks ? <Badge>{fmt(d.minutes)}</Badge>
                : d.scheduled && d.date < today ? <span className="text-sm text-navy/50">{t('training.plan.past')}</span>
                : <span className="text-sm text-navy/50">{t('training.plan.rest')}</span>}
            </div>
            {d.chunks && <p className="text-sm text-navy/65">{d.chunks.map((c) => loc(c.block, 'title') + (c.whole ? '' : ` (${t('training.partial')})`)).join(' · ')}</p>}
          </div>
        ))}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-bold">{t('training.plan.schedule')}</h2>
        <ScheduleFields
          program={p}
          mode={g.schedule_mode} setMode={(m) => change({ id: g.id, schedule_mode: m })}
          days={g.days_of_week} setDays={(d) => change({ id: g.id, days_of_week: d })}
          minutes={g.session_minutes} setMinutes={(m) => change({ id: g.id, session_minutes: m })}
          goalMonths={g.months}
        />
        <p className="text-sm text-navy/65">{t('training.plan.left', { w: Math.min(cursorOf(g).week, p.weeks), mins: fmt(minutesLeft(p, cursorOf(g))) })}</p>
        <Checkbox label={t('training.plan.reminders')} checked={g.reminders_on} onChange={(e) => change({ id: g.id, reminders_on: e.target.checked })} />
      </Card>

      {g.hcp_start != null && (
        <Card className="space-y-2 p-5">
          <h2 className="text-lg font-bold">{t('training.plan.milestones')}</h2>
          <ul className="space-y-1">
            {milestones.map((m) => (
              <li key={m.month} className="flex justify-between text-navy/80">
                <span>{t('training.plan.month', { n: m.month, date: addDays(g.start_date, Math.round(m.month * 30.4)).split('-').reverse().join('/') })}</span>
                <span className="font-semibold">{m.hcp}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-navy/55">{t('training.plan.milestoneNote')}</p>
        </Card>
      )}
    </Shell>
  )
}

// ---------------------------------------------------------------- Vòng đấu

export function TrainingRoundsPage() {
  return <Gate>{(me) => <Rounds me={me} />}</Gate>
}

function Rounds({ me }: { me: Me }) {
  const { t } = useTranslation()
  const toast = useToast()
  const rounds = useRounds(me.id)
  const goal = useGoal(me.id).data
  const bench = useBenchmarks()
  const update = useUpdateGoal()
  const [adding, setAdding] = useState(false)
  const stats = (rounds.data ?? []).map((r) => ({ r, s: roundStats(r.holes) }))
  const avg = averageStats(stats.slice(0, 5).map((x) => x.s))
  const target = goal?.hcp_target ?? null
  const weak = target != null && bench.data && avg.count ? weakestArea(avg, bench.data, target) : null

  if (adding) return <NewRound me={me} onDone={() => setAdding(false)} />
  const row = (label: string, value: number | null, std: number | null, suffix = '%', lowerBetter = false) => (
    <tr>
      <td className={td}>{label}</td>
      <td className={cn(td, 'font-semibold')}>{value == null ? '–' : `${value}${suffix}`}</td>
      <td className={td}>{std == null ? '–' : `${std}${suffix}`}</td>
      <td className={td}>
        {value != null && std != null && ((lowerBetter ? value <= std : value >= std) ? <Badge tone="good">{t('training.rounds.ok')}</Badge> : <Badge tone="warn">{t('training.rounds.below')}</Badge>)}
      </td>
    </tr>
  )

  return (
    <Shell title={t('training.nav.rounds')}>
      <Button size="full" onClick={() => setAdding(true)}>{t('training.rounds.add')}</Button>
      {avg.count > 0 && (
        <Card className="space-y-3 p-4">
          <p className="font-semibold">{t('training.rounds.summary', { n: avg.count })}</p>
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className={th} /><th className={th}>{t('training.rounds.you')}</th><th className={th}>{target != null ? t('training.rounds.std', { h: target }) : t('training.rounds.stdNone')}</th><th className={th} /></tr></thead>
              <tbody>
                {row('FIR', avg.firPct, target != null && bench.data ? benchmark(bench.data, 'fir_pct', target) : null)}
                {row('GIR', avg.girPct, target != null && bench.data ? benchmark(bench.data, 'gir_pct', target) : null)}
                {row(t('training.area.scr'), avg.scramblePct, target != null && bench.data ? benchmark(bench.data, 'scramble_pct', target) : null)}
                {row(t('training.rounds.putts18'), avg.putts18, target != null && bench.data ? benchmark(bench.data, 'putts_per_18', target) : null, '', true)}
              </tbody>
            </table>
          </TableWrap>
          {weak && goal && (
            <div className="space-y-2 rounded-xl bg-gold/15 p-3">
              <p className="text-sm text-brown">{t('training.rounds.weak', { area: t(`training.area.${weak}`) })}</p>
              {goal.weak_area !== weak && (
                <Button size="sm" variant="outline" onClick={() => update.mutate({ id: goal.id, weak_area: weak }, { onSuccess: () => toast(t('common.saved')) })}>
                  {t('training.rounds.setWeak')}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}
      {rounds.isPending ? <p className="text-navy/60">{t('common.loading')}</p> : !stats.length ? (
        <Card className="p-5 text-center text-navy/65">{t('training.rounds.none')}</Card>
      ) : (
        <ul className="space-y-3">
          {stats.map(({ r, s }) => (
            <li key={r.id}>
              <Card className="space-y-1 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{r.course_name || t('training.rounds.noCourse')}</p>
                  <span className="text-sm text-navy/55">{r.played_on.split('-').reverse().join('/')}</span>
                </div>
                <p className="text-2xl font-bold">
                  {s.strokes} <span className="text-base font-normal text-navy/60">({s.strokes - s.par >= 0 ? '+' : ''}{s.strokes - s.par}, {t('training.rounds.holes', { n: s.holes })})</span>
                </p>
                <p className="text-sm text-navy/70">
                  FIR {s.firPct ?? '–'}% · GIR {s.girPct ?? '–'}% · {t('training.area.scr')} {s.scramblePct ?? '–'}% · {t('training.rounds.putts', { n: s.putts })}
                  {s.missLeft + s.missRight > 0 && ` · ${t('training.rounds.miss', { l: s.missLeft, r: s.missRight })}`}
                </p>
                <button
                  type="button"
                  className="text-sm font-semibold text-red-700"
                  onClick={() => deleteRound(r.id).then(() => rounds.refetch(), (e) => toast(trainingError(e, t), 'error'))}
                >
                  {t('training.rounds.delete')}
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}

function NewRound({ me, onDone }: { me: Me; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const rounds = useRounds(me.id)
  const [n, setN] = useState<9 | 18>(18)
  const [course, setCourse] = useState('')
  const [date, setDate] = useState(vnToday())
  const [holes, setHoles] = useState<HoleRow[]>(() =>
    Array.from({ length: 18 }, (_, i) => ({ hole_no: i + 1, par: 4, strokes: null, fairway: null, gir: null, putts: null })),
  )
  const [busy, setBusy] = useState(false)
  const shown = holes.slice(0, n)
  const set = (i: number, v: Partial<HoleRow>) => setHoles(holes.map((h, j) => (j === i ? { ...h, ...v, fairway: (v.par ?? h.par) === 3 ? 'na' : v.fairway ?? h.fairway } : h)))
  const complete = shown.every((h) => h.strokes != null)
  const s = roundStats(shown)

  return (
    <Shell title={t('training.rounds.add')} back={false}>
      <button type="button" onClick={onDone} className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
        <ChevronLeft className="h-4 w-4" /> {t('training.back')}
      </button>
      <Card className="space-y-4 p-5">
        <Field label={t('training.rounds.course')}><Input value={course} onChange={(e) => setCourse(e.target.value)} /></Field>
        <Field label={t('training.rounds.date')}><Input type="date" value={date} max={vnToday()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Chips options={[9, 18] as (9 | 18)[]} value={[n]} onToggle={setN} label={(x) => t('training.rounds.holes', { n: x })} />
      </Card>
      {shown.map((h, i) => (
        <Card key={h.hole_no} className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="font-bold">{t('training.rounds.hole', { n: h.hole_no })}</p>
            <Chips options={[3, 4, 5]} value={[h.par]} onToggle={(p) => set(i, { par: p })} label={(p) => `Par ${p}`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('training.rounds.strokes')}>
              <Input type="number" inputMode="numeric" min={1} max={20} value={h.strokes ?? ''} onChange={(e) => set(i, { strokes: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label={t('training.rounds.puttsLabel')}>
              <Input type="number" inputMode="numeric" min={0} max={10} value={h.putts ?? ''} onChange={(e) => set(i, { putts: e.target.value ? Number(e.target.value) : null })} />
            </Field>
          </div>
          {h.par > 3 && (
            <Field label={t('training.rounds.fairway')}>
              <Chips options={['left', 'hit', 'right'] as const} value={h.fairway && h.fairway !== 'na' ? [h.fairway] : []} onToggle={(f) => set(i, { fairway: f })} label={(f) => t(`training.rounds.fw.${f}`)} />
            </Field>
          )}
          <Field label="GIR">
            <Chips options={['yes', 'no']} value={h.gir == null ? [] : [h.gir ? 'yes' : 'no']} onToggle={(x) => set(i, { gir: x === 'yes' })} label={(x) => t(`training.rounds.${x}`)} />
          </Field>
        </Card>
      ))}
      <Card className="p-4 text-sm">{t('training.rounds.preview', { strokes: s.strokes, putts: s.putts })}</Card>
      <Button
        size="full"
        disabled={!complete || busy}
        onClick={async () => {
          setBusy(true)
          try {
            await saveRound(
              { student_id: me.id, played_on: date, course_name: course.trim() || null, holes_played: n, total_strokes: s.strokes },
              shown.map((h) => ({ ...h, fairway: h.par === 3 ? 'na' : h.fairway })),
            )
            toast(t('common.saved'))
            await rounds.refetch()
            onDone()
          } catch (e) {
            toast(trainingError(e, t), 'error')
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('training.rounds.save')}
      </Button>
      {!complete && <p className="text-sm text-navy/55">{t('training.rounds.needStrokes')}</p>}
    </Shell>
  )
}

// ---------------------------------------------------------------- Khoảng cách gậy

export function TrainingClubsPage() {
  return <Gate>{(me) => <Clubs me={me} />}</Gate>
}

function Clubs({ me }: { me: Me }) {
  const { t } = useTranslation()
  const toast = useToast()
  const clubs = useClubs(me.id)
  const [club, setClub] = useState('7i')
  const [carry, setCarry] = useState('')
  const [total, setTotal] = useState('')
  const [busy, setBusy] = useState(false)
  const latest = CLUBS.map((c) => ({ c, row: clubs.data?.find((r) => r.club_code === c) })).filter((x) => x.row)

  return (
    <Shell title={t('training.nav.clubs')}>
      <Card className="space-y-4 p-5">
        <Field label={t('training.clubs.club')}>
          <Select value={club} onChange={(e) => setClub(e.target.value)}>
            {CLUBS.map((c) => <option key={c} value={c}>{t(`training.clubs.code.${c}`)}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('training.clubs.carry')}><Input type="number" inputMode="numeric" min={1} max={400} value={carry} onChange={(e) => setCarry(e.target.value)} /></Field>
          <Field label={t('training.clubs.total')}><Input type="number" inputMode="numeric" min={1} max={450} value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
        </div>
        <p className="text-sm text-navy/60">{t('training.clubs.hint')}</p>
        <Button
          size="full"
          disabled={(!carry && !total) || busy}
          onClick={async () => {
            setBusy(true)
            try {
              await addClub({ student_id: me.id, club_code: club, carry_yards: carry ? Number(carry) : null, total_yards: total ? Number(total) : null })
              setCarry('')
              setTotal('')
              await clubs.refetch()
              toast(t('common.saved'))
            } catch (e) {
              toast(trainingError(e, t), 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('training.clubs.save')}
        </Button>
      </Card>
      {latest.length > 0 ? (
        <TableWrap>
          <table className="w-full">
            <thead><tr><th className={th}>{t('training.clubs.club')}</th><th className={th}>{t('training.clubs.carry')}</th><th className={th}>{t('training.clubs.total')}</th><th className={th}>{t('training.clubs.measured')}</th></tr></thead>
            <tbody>
              {latest.map(({ c, row }) => (
                <tr key={c}>
                  <td className={td}>{t(`training.clubs.code.${c}`)}</td>
                  <td className={td}>{row!.carry_yards ?? '–'}</td>
                  <td className={td}>{row!.total_yards ?? '–'}</td>
                  <td className={td}>{row!.measured_on.split('-').reverse().join('/')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <Card className="p-5 text-center text-navy/65">{t('training.clubs.none')}</Card>
      )}
    </Shell>
  )
}

