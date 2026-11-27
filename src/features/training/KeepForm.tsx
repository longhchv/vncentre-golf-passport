/**
 * Spec 24 · chế độ "Giữ phong độ" cho các bạn nhỏ (anh Long chốt 27/11/2026).
 * Phụ huynh chọn mức thời gian, ngày, nơi tập → app sinh lịch tuần theo tỉ lệ phân bổ; mỗi việc có nút "đã làm".
 * Giới hạn theo tuổi chỉ cảnh báo. Kiểm tra 4 tuần một lần. Tuần thi giảm tải. Dấu hiệu quá sức giảm một nửa tuần đó.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, ChevronLeft, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, Input, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { ComingSoon } from '@/components/ComingSoon'
import { useAuth } from '@/auth/AuthProvider'
import { errorMessage } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useTrainingEnabled } from './api'
import { FeedbackButton } from './Feedback'
import { Stepper, useChallenges, useResults } from './JuniorTraining'
import {
  OPTION_PRESET, PLACES, WEEK_ORDER, ageLimitFor, buildWeek, checkDue, dateOfWeekday, planWarnings, weekHoursLimit,
  type AgeLimit, type KeepDrill, type KeepOption, type KeepSplit, type Place,
} from './keep'

const db = () => supabase!
const SIGNS = ['tired', 'no_fun', 'want_quit', 'pain'] as const
const vnToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

interface KeepPlan { option: KeepOption; days: number[]; minutes_per_day: number; places: Place[]; light_until: string | null; coach_week_hours: number | null; is_active: boolean }
interface KeepCheck { id: string; checked_on: string; test_putt: number; test_chip: number; test_long: number; nine_to_par: number | null; result: 'first' | 'up' | 'same' | 'down' }

function useKeepData(studentId: string) {
  const today = vnToday()
  const monday = dateOfWeekday(today, 1)
  return useQuery({
    queryKey: ['training_keep', studentId, monday],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const [st, lv, plan, split, drills, limits, done, checks, flags, coach, edit] = await Promise.all([
        db().from('students').select('full_name, date_of_birth, birth_year').eq('id', studentId).single(),
        db().rpc('training_current_level', { p_student_id: studentId }),
        db().from('training_keep_plans').select('option, days, minutes_per_day, places, light_until, coach_week_hours, is_active').eq('student_id', studentId).maybeSingle(),
        db().from('training_keep_split').select('*').eq('is_active', true).order('sort_order'),
        db().from('training_drills').select('id, code, title_vi, title_en, skill, contexts, minutes, level_from, level_to').eq('is_active', true).in('audience', ['all', 'junior']),
        db().from('training_age_limits').select('*').order('sort_order'),
        db().from('training_keep_done').select('day, item_key').eq('student_id', studentId).gte('day', monday),
        db().from('training_keep_checks').select('id, checked_on, test_putt, test_chip, test_long, nine_to_par, result').eq('student_id', studentId).order('checked_on', { ascending: false }).order('created_at', { ascending: false }).limit(3),
        db().from('training_overload_flags').select('flagged_on').eq('student_id', studentId).gte('flagged_on', monday).limit(1),
        db().rpc('training_is_coach_of', { p_student_id: studentId }),
        db().rpc('training_keep_can_edit', { p_student_id: studentId }),
      ])
      for (const r of [st, lv, plan, split, drills, limits, done, checks, flags]) if (r.error) throw r.error
      const s = st.data as { full_name: string; date_of_birth: string | null; birth_year: number | null }
      const born = s.date_of_birth ? new Date(s.date_of_birth) : s.birth_year ? new Date(`${s.birth_year}-07-01`) : null
      const age = born ? Math.floor((Date.parse(today) - born.getTime()) / (365.25 * 864e5)) : null
      return {
        name: s.full_name, age, level: Number(lv.data ?? 1),
        plan: plan.data as KeepPlan | null,
        split: split.data as KeepSplit[], drills: drills.data as KeepDrill[], limits: limits.data as AgeLimit[],
        done: new Set((done.data as { day: string; item_key: string }[]).map((d) => `${d.day}|${d.item_key}`)),
        checks: checks.data as KeepCheck[],
        overload: (flags.data ?? []).length > 0,
        isCoach: Boolean(coach.data), canEdit: Boolean(edit.data),
        today, monday,
      }
    },
  })
}

export function ParentKidKeepPage() {
  const { studentId = '' } = useParams()
  const enabled = useTrainingEnabled()
  const { t } = useTranslation()
  if (enabled.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (!enabled.data) return <ComingSoon title={t('training.title')} />
  return <KeepForm studentId={studentId} base={`/app/training/kid/${studentId}`} />
}

export function StudentKeepPage() {
  const { studentId } = useAuth()
  const { t } = useTranslation()
  if (!studentId) return <p className="text-navy/60">{t('errors.loadFailed')}</p>
  return <KeepForm studentId={studentId} base="/me/training" />
}

function Chip({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className={cn('min-h-10 rounded-full border-2 px-3 text-sm font-semibold disabled:opacity-70', on ? 'border-bronze bg-gold/25' : 'border-navy/15 bg-white text-navy/70')}>
      {children}
    </button>
  )
}

function KeepForm({ studentId, base }: { studentId: string; base: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const toast = useToast()
  const qc = useQueryClient()
  const q = useKeepData(studentId)
  const challenges = useChallenges()
  const results = useResults(studentId)
  const d = q.data
  const loc = (o: object, f: string) => { const r = o as Record<string, unknown>; return String((lang === 'en' && r[`${f}_en`]) || r[`${f}_vi`] || '') }

  // Thiết lập
  const [editing, setEditing] = useState(false)
  const [option, setOption] = useState<KeepOption>('daily')
  const [days, setDays] = useState<number[]>(OPTION_PRESET.daily.days)
  const [minutes, setMinutes] = useState(60)
  const [places, setPlaces] = useState<Place[]>(['home'])
  const [lightUntil, setLightUntil] = useState('')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!d) return
    const p = d.plan
    setOption(p?.option ?? 'daily'); setDays(p?.days ?? OPTION_PRESET.daily.days); setMinutes(p?.minutes_per_day ?? 60)
    setPlaces(p?.places ?? ['home']); setLightUntil(p?.light_until ?? ''); setEditing(!p)
  }, [d])
  const pickOption = (o: KeepOption) => {
    setOption(o)
    if (o !== 'custom') { setDays(OPTION_PRESET[o].days); setMinutes(OPTION_PRESET[o].minutes) }
  }
  const invalidate = () => qc.invalidateQueries({ queryKey: ['training_keep', studentId] })
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db().rpc('training_set_keep_plan', {
        p_student_id: studentId, p_option: option, p_days: days, p_minutes_per_day: minutes, p_places: places,
        p_light_until: lightUntil || null, p_active: true,
      })
      if (error) throw error
    },
    onSuccess: () => { invalidate(); setEditing(false); toast(t('common.saved')) },
    onError: (e) => setErr(errorMessage(e, t)),
  })
  const mark = useMutation({
    mutationFn: async (v: { day: string; key: string; done: boolean; minutes: number }) => {
      const { error } = await db().rpc('training_keep_mark', { p_student_id: studentId, p_day: v.day, p_item_key: v.key, p_done: v.done, p_minutes: v.minutes })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  // Kiểm tra định kỳ
  const [test, setTest] = useState({ putt: 0, chip: 0, long: 0, nine: '' })
  const [checkResult, setCheckResult] = useState<string | null>(null)
  const check = useMutation({
    mutationFn: async () => {
      const { data, error } = await db().rpc('training_keep_record_check', {
        p_student_id: studentId, p_putt: test.putt, p_chip: test.chip, p_long: test.long,
        p_nine_to_par: test.nine.trim() === '' ? null : Number(test.nine),
      })
      if (error) throw error
      return data as { result: string }
    },
    onSuccess: (r) => { setCheckResult(r.result); invalidate() },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  // Dấu hiệu quá sức
  const [flagOpen, setFlagOpen] = useState(false)
  const [signs, setSigns] = useState<string[]>([])
  const [flagNote, setFlagNote] = useState('')
  const flag = useMutation({
    mutationFn: async () => {
      const { error } = await db().rpc('training_flag_overload', { p_student_id: studentId, p_signs: signs, p_note: flagNote })
      if (error) throw error
    },
    onSuccess: () => { setFlagOpen(false); setSigns([]); setFlagNote(''); invalidate(); toast(t('training.keep.flagged')) },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  // HLV duyệt giờ (từ 15 tuổi)
  const [coachHours, setCoachHours] = useState('')
  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await db().rpc('training_keep_approve_hours', { p_student_id: studentId, p_week_hours: coachHours ? Number(coachHours) : null })
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast(t('common.saved')) },
    onError: (e) => toast((e as { message?: string }).message === 'over_coach_max' ? t('training.keep.overCoachMax') : errorMessage(e, t), 'error'),
  })

  const limit = d ? ageLimitFor(d.limits, d.age) : null
  const light = Boolean(d?.plan?.light_until && d.plan.light_until >= (d?.today ?? ''))
  const week = useMemo(() => (d?.plan ? buildWeek({
    days: d.plan.days, minutesPerDay: d.plan.minutes_per_day, places: d.plan.places, split: d.split, drills: d.drills, level: d.level,
    factor: d.overload ? 0.5 : 1, light,
  }) : []), [d, light])
  const nextCard = useMemo(() => {
    if (!d || !challenges.data) return null
    const doneIds = new Set((results.data ?? []).filter((r) => r.status === 'passed' || r.status === 'approved').map((r) => r.challenge_id))
    return challenges.data.find((c) => c.level_number === d.level && !doneIds.has(c.id)) ?? null
  }, [d, challenges.data, results.data])

  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (q.isError || !d) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  const warnings = planWarnings(days, minutes, limit, d.age, d.plan?.coach_week_hours ?? null)
  const weekLimit = weekHoursLimit(limit, d.age, d.plan?.coach_week_hours ?? null)
  const planned = week.reduce((a, x) => a + x.minutes, 0)
  const doneMin = week.reduce((a, x) => a + x.items.filter((it) => d.done.has(`${dateOfWeekday(d.today, x.dow)}|${it.key}`)).reduce((s, it) => s + it.minutes, 0), 0)
  const lastCheck = d.checks.at(0) ?? null
  const due = checkDue(lastCheck?.checked_on ?? null, d.today)
  const areaName = (code: string) => { const s = d.split.find((x) => x.code === code); return s ? loc(s, 'name') : code }
  const dayName = (dow: number) => t(`training.keep.dow.${dow}`)

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to={base} className="inline-flex items-center gap-1 text-sm font-semibold text-bronze"><ChevronLeft className="h-4 w-4" /> {t('training.back')}</Link>
      <div>
        <h1 className="text-2xl font-bold">{t('training.keep.title')}</h1>
        <p className="text-sm text-navy/60">{t('training.keep.for', { name: d.name, level: d.level })}{d.age != null ? ` · ${t('training.keep.age', { n: d.age })}` : ''}</p>
      </div>
      <p className="text-sm text-navy/70">{t('training.keep.intro')}</p>

      {/* Thiết lập */}
      {editing ? (
        <Card className="space-y-4 p-4">
          <h2 className="text-lg font-bold">{t('training.keep.setupTitle')}</h2>
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('training.keep.timeTitle')}</p>
            <div className="flex flex-wrap gap-2">
              {(['daily', 'weekend', 'custom'] as const).map((o) => <Chip key={o} on={option === o} disabled={!d.canEdit} onClick={() => pickOption(o)}>{t(`training.keep.option.${o}`)}</Chip>)}
            </div>
          </div>
          {option === 'custom' && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{t('training.keep.daysTitle')}</p>
              <div className="flex flex-wrap gap-2">
                {WEEK_ORDER.map((dow) => <Chip key={dow} on={days.includes(dow)} disabled={!d.canEdit} onClick={() => setDays(days.includes(dow) ? days.filter((x) => x !== dow) : [...days, dow])}>{dayName(dow)}</Chip>)}
              </div>
              <Field label={t('training.keep.minutesPerDay')} className="max-w-48">
                <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(Math.min(480, Number(e.target.value.replace(/\D/g, '') || 0)))} />
              </Field>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('training.keep.placesTitle')}</p>
            <div className="flex flex-wrap gap-2">
              {PLACES.map((p) => <Chip key={p} on={places.includes(p)} disabled={!d.canEdit} onClick={() => setPlaces(places.includes(p) ? places.filter((x) => x !== p) : [...places, p])}>{t(`training.keep.place.${p}`)}</Chip>)}
            </div>
          </div>
          <Field label={t('training.keep.lightUntil')} hint={t('training.keep.lightHint')} className="max-w-60">
            <Input type="date" value={lightUntil} onChange={(e) => setLightUntil(e.target.value)} />
          </Field>
          <p className="text-sm text-navy/70">{t('training.keep.weekTotal', { hours: ((days.length * minutes) / 60).toLocaleString(lang), limit: weekLimit ?? '—' })}</p>
          {warnings.map((w, i) => (
            <p key={i} className="flex gap-2 rounded-lg bg-gold/15 p-2 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-bronze" />
              {w.kind === 'week' ? t('training.keep.warn.week', { hours: w.hours.toLocaleString(lang), limit: w.limit })
                : w.kind === 'session' ? t('training.keep.warn.session', { minutes: w.minutes, limit: w.limit })
                  : t('training.keep.warn.rest', { rest: w.rest, need: w.need })}
            </p>
          ))}
          {d.age != null && d.age < 9 && <p className="text-sm text-navy/70">{t('training.keep.under9')}</p>}
          <FormError message={err} />
          {d.canEdit && (
            <Button size="full" disabled={!days.length || !places.length || minutes < 10 || save.isPending} onClick={() => { setErr(null); save.mutate() }}>
              {t('training.keep.save')}
            </Button>
          )}
        </Card>
      ) : d.plan && (
        <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="text-sm">
            <p className="font-semibold">{t(`training.keep.option.${d.plan.option}`)} · {d.plan.days.length} × {d.plan.minutes_per_day} {t('training.keep.min')}</p>
            <p className="text-navy/60">{d.plan.places.map((p) => t(`training.keep.place.${p}`)).join(', ')}</p>
          </div>
          {d.canEdit && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{t('training.keep.change')}</Button>}
        </Card>
      )}

      {/* Lịch tuần */}
      {d.plan && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-bold">{t('training.keep.weekTitle')}</h2>
            <p className="text-sm text-navy/60">{t('training.keep.progress', { done: doneMin, total: planned })}</p>
          </div>
          {light && <p className="rounded-lg bg-navy/5 p-2 text-sm">{t('training.keep.lightOn', { date: d.plan.light_until })}</p>}
          {d.overload && <p className="rounded-lg bg-gold/15 p-2 text-sm">{t('training.keep.overloadOn')}</p>}
          {nextCard && (
            <Link to={`${base}/c/${nextCard.id}`} className="block rounded-lg border border-bronze/40 p-2 text-sm">
              <span className="font-semibold">{t('training.keep.cardOfWeek')}</span> {loc(nextCard, 'title')}
            </Link>
          )}
          {week.map((day) => {
            const date = dateOfWeekday(d.today, day.dow)
            const future = date > d.today
            return (
              <Card key={day.dow} className={cn('space-y-2 p-3', date === d.today && 'border-2 border-bronze')}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{dayName(day.dow)} <span className="text-sm font-normal text-navy/55">{date.slice(8)}/{date.slice(5, 7)}</span></p>
                  <span className="text-sm text-navy/60">{day.minutes} {t('training.keep.min')}</span>
                </div>
                <ul className="space-y-1.5">
                  {day.items.map((it) => {
                    const on = d.done.has(`${date}|${it.key}`)
                    return (
                      <li key={it.key} className="flex items-start gap-2">
                        <button type="button" aria-pressed={on} aria-label={t('training.keep.markDone')} disabled={future || !d.canEdit || mark.isPending}
                          onClick={() => mark.mutate({ day: date, key: it.key, done: !on, minutes: it.minutes })}
                          className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 disabled:opacity-40', on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-navy/30')}>
                          {on && <Check className="h-4 w-4" />}
                        </button>
                        <div className="text-sm">
                          <p><span className="font-semibold">{areaName(it.area)}</span> · {it.minutes} {t('training.keep.min')}</p>
                          {it.drill && <p className="text-navy/60">{loc(it.drill, 'title')}</p>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )
          })}
          <p className="text-xs text-navy/50">{t('training.keep.scoreRule')}</p>
        </section>
      )}

      {/* Kiểm tra định kỳ */}
      {d.plan && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{t('training.keep.checkTitle')}</h2>
            {due ? <Badge tone="warn">{t('training.keep.checkDue')}</Badge> : <Badge>{t('training.keep.checkNext', { date: lastCheck ? `${lastCheck.checked_on.slice(8)}/${lastCheck.checked_on.slice(5, 7)}` : '' })}</Badge>}
          </div>
          <p className="text-sm text-navy/70">{t('training.keep.checkHint')}</p>
          {d.checks.length > 0 && (
            <ul className="space-y-1 text-sm">
              {d.checks.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>{c.checked_on.slice(8)}/{c.checked_on.slice(5, 7)}/{c.checked_on.slice(0, 4)} · {c.test_putt + c.test_chip + c.test_long}/15{c.nine_to_par != null ? ` · ${t('training.keep.nineHoles', { n: `${c.nine_to_par >= 0 ? '+' : ''}${c.nine_to_par}` })}` : ''}</span>
                  <Badge tone={c.result === 'up' ? 'good' : c.result === 'down' ? 'bad' : 'neutral'}>{t(`training.keep.result.${c.result}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
          {d.canEdit && (due || checkResult) && (
            <div className="space-y-3 border-t border-navy/10 pt-3">
              <Field label={t('training.test.putt')}><Stepper label="putt" value={test.putt} max={5} onChange={(n) => setTest({ ...test, putt: n })} /></Field>
              <Field label={t('training.test.chip')}><Stepper label="chip" value={test.chip} max={5} onChange={(n) => setTest({ ...test, chip: n })} /></Field>
              <Field label={t('training.test.long')}><Stepper label="long" value={test.long} max={5} onChange={(n) => setTest({ ...test, long: n })} /></Field>
              <Field label={t('training.keep.nineToPar')} className="max-w-48">
                <Input inputMode="numeric" value={test.nine} onChange={(e) => setTest({ ...test, nine: e.target.value.replace(/[^\d-]/g, '') })} />
              </Field>
              {checkResult && <p className="font-semibold">{t(`training.keep.resultLine.${checkResult}`)}</p>}
              <Button disabled={check.isPending} onClick={() => check.mutate()}>{t('training.keep.saveCheck')}</Button>
            </div>
          )}
        </Card>
      )}

      {/* HLV duyệt giờ cho bạn từ 15 tuổi */}
      {d.isCoach && limit?.coach_week_max != null && d.plan && (
        <Card className="space-y-2 p-4">
          <h2 className="font-bold">{t('training.keep.coachTitle')}</h2>
          <p className="text-sm text-navy/70">{t('training.keep.coachHint', { max: limit.coach_week_max })}</p>
          <div className="flex items-end gap-2">
            <Field label={t('training.keep.coachHours')} className="max-w-40">
              <Input inputMode="decimal" placeholder={String(d.plan.coach_week_hours ?? '')} value={coachHours} onChange={(e) => setCoachHours(e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
            <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>{t('training.keep.approve')}</Button>
          </div>
        </Card>
      )}

      {d.plan && d.canEdit && (
        <Button variant="outline" onClick={() => setFlagOpen(true)}><Flag className="h-4 w-4" /> {t('training.keep.flagButton')}</Button>
      )}
      <Dialog open={flagOpen} onClose={() => setFlagOpen(false)} title={t('training.keep.flagTitle')}>
        <div className="space-y-3 p-4">
          <p className="text-sm text-navy/70">{t('training.keep.flagIntro')}</p>
          {SIGNS.map((s) => (
            <Checkbox key={s} label={t(`training.keep.sign.${s}`)} checked={signs.includes(s)} onChange={() => setSigns(signs.includes(s) ? signs.filter((x) => x !== s) : [...signs, s])} />
          ))}
          <Textarea rows={2} placeholder={t('training.keep.flagNote')} value={flagNote} onChange={(e) => setFlagNote(e.target.value)} />
          {signs.includes('pain') && <p className="text-sm font-semibold text-red-700">{t('training.keep.painNote')}</p>}
          <Button size="full" disabled={!signs.length || flag.isPending} onClick={() => flag.mutate()}>{t('training.keep.flagSend')}</Button>
        </div>
      </Dialog>

      {limit && <p className="text-xs text-navy/50">{t('training.keep.limitNote', { rest: limit.rest_days, sleep: loc(limit, 'sleep') })}</p>}
      <FeedbackButton studentId={studentId} />
    </div>
  )
}
