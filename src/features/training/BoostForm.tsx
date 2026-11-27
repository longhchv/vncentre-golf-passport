/**
 * Spec 24 · chế độ "Tăng tốc trước giải" cho các bạn nhỏ (đợt 2, anh Long chốt 27/11/2026).
 * Phụ huynh nhập giải, ngày thi, thời gian, nơi tập, 2 phần yếu → app gợi ý gói theo tuổi và số ngày còn lại,
 * xếp việc từng ngày theo chặng: đo trình độ → tập phần yếu → mô phỏng thi đấu → giảm tải. Sổ sân ghi chiến thuật từng hố.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, ChevronLeft, Flag, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FormError, Input, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { ComingSoon } from '@/components/ComingSoon'
import { useAuth } from '@/auth/AuthProvider'
import { errorMessage } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useTrainingEnabled } from './api'
import { FeedbackButton } from './Feedback'
import { PLACES, WEEK_ORDER, ageLimitFor, dateOfWeekday, planWarnings, type AgeLimit, type KeepDrill, type KeepSplit, type Place } from './keep'
import { addDays, boostDay, daysBetween, packageDays, phaseRanges, suggestPackage, type BoostPackage, type BoostPlan, type Phase } from './boost'

const db = () => supabase!
const vnToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`
const PHASE_COLOR: Record<Phase, string> = {
  fun: 'bg-emerald-200 border-emerald-500', test: 'bg-sky-200 border-sky-500', weak: 'bg-orange-200 border-orange-500',
  sim: 'bg-teal-200 border-teal-500', taper: 'bg-slate-300 border-slate-500',
}

function useBoostData(studentId: string) {
  const today = vnToday()
  return useQuery({
    queryKey: ['training_boost', studentId, today],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const monday = dateOfWeekday(today, 1)
      const [st, lv, plan, pkgs, split, drills, limits, done, flags, keep, edit] = await Promise.all([
        db().from('students').select('full_name, date_of_birth, birth_year').eq('id', studentId).single(),
        db().rpc('training_current_level', { p_student_id: studentId }),
        db().from('training_boost_plans').select('package_code, event_name, event_date, course_name, holes, days, minutes_per_day, places, weak_areas, hole_notes, status').eq('student_id', studentId).maybeSingle(),
        db().from('training_boost_packages').select('*').eq('is_active', true).order('sort_order'),
        db().from('training_keep_split').select('*').eq('is_active', true).order('sort_order'),
        db().from('training_drills').select('id, code, title_vi, title_en, skill, contexts, minutes, level_from, level_to').eq('is_active', true).in('audience', ['all', 'junior']),
        db().from('training_age_limits').select('*').order('sort_order'),
        db().from('training_keep_done').select('day, item_key').eq('student_id', studentId).gte('day', addDays(today, -14)),
        db().from('training_overload_flags').select('flagged_on').eq('student_id', studentId).gte('flagged_on', monday).limit(1),
        db().from('training_keep_plans').select('coach_week_hours').eq('student_id', studentId).maybeSingle(),
        db().rpc('training_keep_can_edit', { p_student_id: studentId }),
      ])
      for (const r of [st, lv, plan, pkgs, split, drills, limits, done, flags, keep]) if (r.error) throw r.error
      const s = st.data as { full_name: string; date_of_birth: string | null; birth_year: number | null }
      const born = s.date_of_birth ? new Date(s.date_of_birth) : s.birth_year ? new Date(`${s.birth_year}-07-01`) : null
      const age = born ? Math.floor((Date.parse(today) - born.getTime()) / (365.25 * 864e5)) : null
      const p = plan.data as BoostPlan | null
      return {
        today, name: s.full_name, age, level: Number(lv.data ?? 1),
        plan: p && p.status === 'active' && daysBetween(p.event_date, today) <= 7 ? p : null,
        pkgs: pkgs.data as BoostPackage[], split: split.data as KeepSplit[], drills: drills.data as KeepDrill[], limits: limits.data as AgeLimit[],
        done: new Set((done.data as { day: string; item_key: string }[]).map((x) => `${x.day}|${x.item_key}`)),
        overload: (flags.data ?? []).length > 0,
        coachHours: (keep.data as { coach_week_hours: number | null } | null)?.coach_week_hours ?? null,
        canEdit: Boolean(edit.data),
      }
    },
  })
}

export function ParentKidBoostPage() {
  const { studentId = '' } = useParams()
  const enabled = useTrainingEnabled()
  const { t } = useTranslation()
  if (enabled.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (!enabled.data) return <ComingSoon title={t('training.title')} />
  return <BoostForm studentId={studentId} base={`/app/training/kid/${studentId}`} />
}

export function StudentBoostPage() {
  const { studentId } = useAuth()
  const { t } = useTranslation()
  if (!studentId) return <p className="text-navy/60">{t('errors.loadFailed')}</p>
  return <BoostForm studentId={studentId} base="/me/training" />
}

function Chip({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className={cn('min-h-10 rounded-full border-2 px-3 text-sm font-semibold disabled:opacity-50', on ? 'border-bronze bg-gold/25' : 'border-navy/15 bg-white text-navy/70')}>
      {children}
    </button>
  )
}

function BoostForm({ studentId, base }: { studentId: string; base: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const toast = useToast()
  const qc = useQueryClient()
  const q = useBoostData(studentId)
  const d = q.data
  const loc = (o: object, f: string) => { const r = o as Record<string, unknown>; return String((lang === 'en' && r[`${f}_en`]) || r[`${f}_vi`] || '') }
  const invalidate = () => qc.invalidateQueries({ queryKey: ['training_boost', studentId] })

  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ name: '', date: '', course: '', holes: 18, days: [1, 2, 3, 4, 5, 6] as number[], minutes: 90, places: ['home', 'range'] as Place[], weak: ['putting', 'short_game'] as string[], pkg: '' })
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!d) return
    const p = d.plan
    if (p) setF({ name: p.event_name, date: p.event_date, course: p.course_name ?? '', holes: p.holes, days: p.days, minutes: p.minutes_per_day, places: p.places, weak: p.weak_areas, pkg: p.package_code })
    // Dưới 9 tuổi: mặc định 5 ngày × 45 phút ở nhà (anh Long chốt 27/11/2026)
    else if (d.age != null && d.age < 9) setF((x) => ({ ...x, days: [1, 2, 3, 4, 5], minutes: 45, places: ['home'] }))
    setEditing(!p)
  }, [d])

  const daysLeft = d && f.date ? daysBetween(d.today, f.date) : 0
  const eligible = useMemo(() => (d ? d.pkgs.filter((p) => d.age == null || (d.age >= p.min_age && d.age <= p.max_age)) : []), [d])
  const suggested = d && f.date && daysLeft > 0 ? suggestPackage(d.pkgs, d.age, daysLeft) : null
  useEffect(() => { if (editing && suggested && !eligible.some((p) => p.code === f.pkg)) setF((x) => ({ ...x, pkg: suggested.code })) }, [editing, suggested, eligible, f.pkg])

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db().rpc('training_set_boost_plan', {
        p_student_id: studentId, p_package: f.pkg, p_event_name: f.name, p_event_date: f.date, p_course_name: f.course || null,
        p_holes: f.holes, p_days: f.days, p_minutes_per_day: f.minutes, p_places: f.places, p_weak_areas: f.weak,
      })
      if (error) throw error
    },
    onSuccess: () => { invalidate(); setEditing(false); toast(t('common.saved')) },
    onError: (e) => {
      const m = (e as { message?: string }).message ?? ''
      setErr(['package_not_for_age', 'event_in_past', 'invalid_area', 'invalid_package'].includes(m) ? t(`training.boost.err.${m}`) : errorMessage(e, t))
    },
  })
  const cancel = useMutation({
    mutationFn: async () => { const { error } = await db().rpc('training_cancel_boost', { p_student_id: studentId }); if (error) throw error },
    onSuccess: () => { invalidate(); toast(t('training.boost.cancelled')) },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  const mark = useMutation({
    mutationFn: async (v: { day: string; key: string; done: boolean; minutes: number }) => {
      const { error } = await db().rpc('training_keep_mark', { p_student_id: studentId, p_day: v.day, p_item_key: v.key, p_done: v.done, p_minutes: v.minutes })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  const note = useMutation({
    mutationFn: async (v: { hole: number; text: string }) => {
      const { error } = await db().rpc('training_boost_note', { p_student_id: studentId, p_hole: v.hole, p_note: v.text })
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast(t('common.saved')) },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [notesOpen, setNotesOpen] = useState<boolean | null>(null)

  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (q.isError || !d) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  const limit = ageLimitFor(d.limits, d.age)
  const warnings = planWarnings(f.days, f.minutes, limit, d.age, d.coachHours)
  const plan = d.plan
  const pkg = plan ? d.pkgs.find((p) => p.code === plan.package_code) ?? null : null
  const effPlan = plan && d.overload ? { ...plan, minutes_per_day: Math.max(10, Math.round(plan.minutes_per_day / 10) * 5) } : plan
  const days = plan && pkg && effPlan ? Array.from({ length: 8 }, (_, i) => boostDay(addDays(d.today, i), effPlan, pkg, d.split, d.drills, d.level)) : []
  const today = days.at(0)
  const ranges = plan && pkg ? phaseRanges(pkg, plan.event_date) : []
  const total = pkg ? packageDays(pkg) : 0
  const inSim = Boolean(today && today.kind === 'train' && today.phase === 'sim')
  const showNotes = notesOpen ?? inSim
  const areaName = (code: string) => {
    if (code === 'test' || code === 'game' || code === 'warmup') return t(`training.boost.area.${code}`)
    const s = d.split.find((x) => x.code === code); return s ? loc(s, 'name') : code
  }
  const selectedPkg = d.pkgs.find((p) => p.code === f.pkg)

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to={base} className="inline-flex items-center gap-1 text-sm font-semibold text-bronze"><ChevronLeft className="h-4 w-4" /> {t('training.back')}</Link>
      <div>
        <h1 className="text-2xl font-bold">{t('training.boost.title')}</h1>
        <p className="text-sm text-navy/60">{d.name} · level {d.level}{d.age != null ? ` · ${t('training.keep.age', { n: d.age })}` : ''}</p>
      </div>
      <p className="text-sm text-navy/70">{t('training.boost.intro')}</p>

      {editing ? (
        <Card className="space-y-4 p-4">
          <h2 className="text-lg font-bold">{t('training.boost.setupTitle')}</h2>
          <Field label={t('training.boost.eventName')}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('training.boost.eventPh')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('training.boost.eventDate')}><Input type="date" min={addDays(d.today, 1)} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label={t('training.boost.course')}><Input value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} /></Field>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('training.boost.holes')}</p>
            <div className="flex gap-2">{[6, 9, 18].map((h) => <Chip key={h} on={f.holes === h} onClick={() => setF({ ...f, holes: h })}>{h}</Chip>)}</div>
          </div>
          {f.date && daysLeft > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{t('training.boost.package', { n: daysLeft })}</p>
              <div className="flex flex-wrap gap-2">
                {eligible.map((p) => (
                  <Chip key={p.code} on={f.pkg === p.code} onClick={() => setF({ ...f, pkg: p.code })}>
                    {loc(p, 'name')}{suggested?.code === p.code ? ` · ${t('training.boost.suggested')}` : ''}
                  </Chip>
                ))}
              </div>
              {selectedPkg && packageDays(selectedPkg) > daysLeft && <p className="text-sm text-navy/70">{t('training.boost.lateStart', { n: packageDays(selectedPkg) - daysLeft })}</p>}
              {d.age != null && d.age < 9 && <p className="text-sm text-navy/70">{t('training.boost.funOnly')}</p>}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('training.keep.daysTitle')}</p>
            <div className="flex flex-wrap gap-2">
              {WEEK_ORDER.map((dow) => <Chip key={dow} on={f.days.includes(dow)} onClick={() => setF({ ...f, days: f.days.includes(dow) ? f.days.filter((x) => x !== dow) : [...f.days, dow] })}>{t(`training.keep.dow.${dow}`)}</Chip>)}
            </div>
          </div>
          <Field label={t('training.keep.minutesPerDay')} className="max-w-48">
            <Input inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: Math.min(480, Number(e.target.value.replace(/\D/g, '') || 0)) })} />
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('training.keep.placesTitle')}</p>
            <div className="flex flex-wrap gap-2">
              {PLACES.map((p) => <Chip key={p} on={f.places.includes(p)} onClick={() => setF({ ...f, places: f.places.includes(p) ? f.places.filter((x) => x !== p) : [...f.places, p] })}>{t(`training.keep.place.${p}`)}</Chip>)}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('training.boost.weakTitle')}</p>
            <div className="flex flex-wrap gap-2">
              {d.split.filter((s) => s.code !== 'on_course').map((s) => (
                <Chip key={s.code} on={f.weak.includes(s.code)} disabled={!f.weak.includes(s.code) && f.weak.length >= 2}
                  onClick={() => setF({ ...f, weak: f.weak.includes(s.code) ? f.weak.filter((x) => x !== s.code) : [...f.weak, s.code] })}>{loc(s, 'name')}</Chip>
              ))}
            </div>
            <p className="text-xs text-navy/55">{t('training.boost.weakHint')}</p>
          </div>
          {warnings.map((w, i) => (
            <p key={i} className="flex gap-2 rounded-lg bg-gold/15 p-2 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-bronze" />
              {w.kind === 'week' ? t('training.keep.warn.week', { hours: w.hours.toLocaleString(lang), limit: w.limit })
                : w.kind === 'session' ? t('training.keep.warn.session', { minutes: w.minutes, limit: w.limit })
                  : t('training.keep.warn.rest', { rest: w.rest, need: w.need })}
            </p>
          ))}
          <FormError message={err} />
          {d.canEdit && (
            <div className="flex gap-2">
              <Button className="flex-1" disabled={f.name.trim().length < 2 || !f.date || daysLeft < 1 || !f.pkg || !f.days.length || !f.places.length || !f.weak.length || f.minutes < 10 || save.isPending}
                onClick={() => { setErr(null); save.mutate() }}>{t('training.boost.save')}</Button>
              {plan && <Button variant="outline" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>}
            </div>
          )}
        </Card>
      ) : plan && pkg && (
        <>
          <Card className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-lg font-bold"><Trophy className="h-5 w-5 text-bronze" /> {plan.event_name}</p>
                <p className="text-sm text-navy/60">{dm(plan.event_date)}{plan.course_name ? ` · ${plan.course_name}` : ''} · {plan.holes} {t('training.boost.holesShort')} · {loc(pkg, 'name')}</p>
              </div>
              {d.canEdit && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{t('training.keep.change')}</Button>}
            </div>
            {daysBetween(d.today, plan.event_date) > 0
              ? <p className="font-semibold">{t('training.boost.daysLeft', { n: daysBetween(d.today, plan.event_date) })}</p>
              : plan.event_date === d.today ? <p className="font-semibold">{t('training.boost.eventToday')}</p>
                : <p className="text-sm">{t('training.boost.after')} <Link to={`${base}/keep`} className="font-semibold text-bronze">{t('training.keep.title')}</Link></p>}
            <div className="flex h-7 w-full overflow-hidden rounded-md" role="img" aria-label={t('training.boost.phasesLabel')}>
              {ranges.map((r) => (
                <div key={r.phase} style={{ width: `${(r.days / total) * 100}%` }} title={`${t(`training.boost.phase.${r.phase}`)} ${dm(r.from)}–${dm(r.to)}`}
                  className={cn('relative border-r-2 border-white text-center text-[11px] leading-7', PHASE_COLOR[r.phase], d.today >= r.from && d.today <= r.to && 'font-bold ring-2 ring-inset ring-navy')}>
                  <span className="truncate px-1">{r.days}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-navy/70">
              {ranges.map((r) => <span key={r.phase} className="flex items-center gap-1"><span className={cn('inline-block h-3 w-3 rounded-sm border', PHASE_COLOR[r.phase])} />{t(`training.boost.phase.${r.phase}`)} {dm(r.from)}–{dm(r.to)}</span>)}
            </div>
            {d.overload && <p className="rounded-lg bg-gold/15 p-2 text-sm">{t('training.keep.overloadOn')}</p>}
          </Card>

          {today && today.kind === 'train' && (
            <Card className="space-y-2 border-2 border-bronze p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold">{t('training.boost.today')} · {t(`training.boost.phase.${today.phase}`)}</p>
                <span className="text-sm text-navy/60">{today.minutes} {t('training.keep.min')}</span>
              </div>
              <p className="text-sm text-navy/70">{today.eve ? t('training.boost.eveHint') : t(`training.boost.phaseHint.${today.phase}`)}</p>
              <ul className="space-y-1.5">
                {today.items.map((it) => {
                  const on = d.done.has(`${today.date}|${it.key}`)
                  return (
                    <li key={it.key} className="flex items-start gap-2">
                      <button type="button" aria-pressed={on} aria-label={t('training.keep.markDone')} disabled={!d.canEdit || mark.isPending}
                        onClick={() => mark.mutate({ day: today.date, key: it.key, done: !on, minutes: it.minutes })}
                        className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border-2', on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-navy/30')}>
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
          )}
          {today && today.kind === 'rest' && <Card className="p-4 text-sm">{t('training.boost.restToday')}</Card>}
          {today && today.kind === 'before' && plan.event_date > d.today && <Card className="p-4 text-sm">{t('training.boost.notStarted', { date: ranges.at(0) ? dm(ranges.at(0)!.from) : '' })} <Link to={`${base}/keep`} className="font-semibold text-bronze">{t('training.keep.title')}</Link></Card>}

          {days.slice(1).some((x) => x.kind === 'train' || x.kind === 'event') && (
            <section className="space-y-1">
              <h2 className="font-bold">{t('training.boost.next')}</h2>
              <ul className="divide-y divide-navy/10 text-sm">
                {days.slice(1).map((x) => (
                  <li key={x.date} className="flex justify-between gap-2 py-1.5">
                    <span>{t(`training.keep.dow.${new Date(`${x.date}T00:00:00Z`).getUTCDay()}`)} {dm(x.date)}</span>
                    <span className="text-navy/70">
                      {x.kind === 'train' ? `${x.eve ? t('training.boost.eve') : t(`training.boost.phase.${x.phase}`)} · ${x.minutes} ${t('training.keep.min')}`
                        : t(`training.boost.kind.${x.kind}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Card className="space-y-2 p-4">
            <button type="button" className="flex w-full items-center justify-between text-left" aria-expanded={showNotes} onClick={() => setNotesOpen(!showNotes)}>
              <h2 className="font-bold">{t('training.boost.notesTitle')}</h2>
              <span className="text-sm font-semibold text-bronze">{showNotes ? t('training.boost.notesHide') : t('training.boost.notesShow', { n: Object.keys(plan.hole_notes).length })}</span>
            </button>
            {showNotes && <p className="text-sm text-navy/70">{t('training.boost.notesHint')}</p>}
            {showNotes && <div className="space-y-2">
              {Array.from({ length: plan.holes }, (_, i) => i + 1).map((h) => {
                const cur = notes[String(h)] ?? plan.hole_notes[String(h)] ?? ''
                return (
                  <div key={h} className="flex items-start gap-2">
                    <span className="w-14 shrink-0 pt-2 text-sm font-semibold">{t('training.boost.hole', { n: h })}</span>
                    <Textarea rows={1} className="flex-1" value={cur} disabled={!d.canEdit}
                      onChange={(e) => setNotes({ ...notes, [String(h)]: e.target.value })}
                      onBlur={() => { if (notes[String(h)] !== undefined && notes[String(h)] !== (plan.hole_notes[String(h)] ?? '')) note.mutate({ hole: h, text: notes[String(h)] }) }} />
                  </div>
                )
              })}
            </div>}
          </Card>

          {d.canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild><Link to={`${base}/keep`}><Flag className="h-4 w-4" /> {t('training.keep.flagButton')}</Link></Button>
              <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{t('training.boost.cancel')}</Button>
            </div>
          )}
        </>
      )}
      {!editing && !plan && d.canEdit && <Button onClick={() => setEditing(true)}>{t('training.boost.start')}</Button>}
      {limit && <p className="text-xs text-navy/50">{t('training.keep.limitNote', { rest: limit.rest_days, sleep: loc(limit, 'sleep') })}</p>}
      <FeedbackButton studentId={studentId} />
    </div>
  )
}
