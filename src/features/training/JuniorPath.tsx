/**
 * Spec 24 · đợt 2b: lộ trình cho các bạn nhỏ — tư vấn theo nhu cầu, các bước nhỏ (các con được gì → cơ hội → cần làm),
 * 4 phương án tài chính chỉ tính theo tháng (anh Long chốt 27/11/2026: không hiện tổng tiền đến mục tiêu).
 * Mọi con số là chi phí ước tính, admin sửa trong /admin/training.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronLeft, ChevronUp, ClipboardList, ExternalLink, Flag, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { FormError } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { ComingSoon } from '@/components/ComingSoon'
import { useAuth } from '@/auth/AuthProvider'
import { errorMessage } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useTrainingEnabled } from './api'
import { FeedbackButton } from './Feedback'
import {
  PHASE_INDEX, SNAG_PLACES, applyPlace, formatMonths, formatRange, goalIndex, hasPending, monthlyCost, pathMonths, planLines, stepIndexForLevel,
  type CostItem, type FinancePlan, type Need, type PathStep, type PlanCode, type SnagPlace,
} from './path'

const db = () => supabase!
const HDCP_URL = 'https://hdcp.vncentre.net'

interface IndexInfo { idx: number | null; holes?: number | null; need?: number | null; rounds?: number | null }
interface PathContext { school_type: string | null; snag_place: SnagPlace; snag: IndexInfo | null; junior: IndexInfo | null; whs: IndexInfo | null }

export function usePathData(studentId: string) {
  return useQuery({
    queryKey: ['training_path', studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const [items, steps, plans, needs, fam, lv, st, enter, ctx] = await Promise.all([
        db().from('training_cost_items').select('*').eq('is_active', true).order('sort_order'),
        db().from('training_path_steps').select('*').eq('is_active', true).order('sort_order'),
        db().from('training_finance_plans').select('*').eq('is_active', true).order('sort_order'),
        db().from('training_needs').select('*').eq('is_active', true).order('sort_order'),
        db().from('training_family_plans').select('needs, plan_code, snag_place').eq('student_id', studentId).maybeSingle(),
        db().rpc('training_current_level', { p_student_id: studentId }),
        db().from('students').select('full_name').eq('id', studentId).single(),
        db().rpc('training_can_enter', { p_student_id: studentId }),
        db().rpc('training_path_context', { p_student_id: studentId }),
      ])
      for (const r of [items, steps, plans, needs, fam, lv, st]) if (r.error) throw r.error
      return {
        items: items.data as CostItem[],
        steps: steps.data as PathStep[],
        plans: plans.data as FinancePlan[],
        needs: needs.data as Need[],
        family: (fam.data as { needs: string[]; plan_code: PlanCode | null; snag_place: SnagPlace | null } | null) ?? null,
        level: Number(lv.data ?? 1),
        name: (st.data as { full_name: string }).full_name,
        canEnter: Boolean(enter.data),
        ctx: (ctx.error ? null : (ctx.data as PathContext | null)) ?? null,
      }
    },
  })
}

export function ParentKidPathPage() {
  const { studentId = '' } = useParams()
  const enabled = useTrainingEnabled()
  const { t } = useTranslation()
  if (enabled.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (!enabled.data) return <ComingSoon title={t('training.title')} />
  return <JuniorPath studentId={studentId} back={`/app/training/kid/${studentId}`} guardian />
}

export function StudentPathPage() {
  const { studentId } = useAuth()
  const { t } = useTranslation()
  if (!studentId) return <p className="text-navy/60">{t('errors.loadFailed')}</p>
  return <JuniorPath studentId={studentId} back="/me/training" />
}

function Chip({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className={cn('min-h-10 rounded-full border-2 px-3 text-sm font-semibold disabled:opacity-70',
        on ? 'border-bronze bg-gold/25' : 'border-navy/15 bg-white text-navy/70')}>
      {children}
    </button>
  )
}

function JuniorPath({ studentId, back, guardian }: { studentId: string; back: string; guardian?: boolean }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const toast = useToast()
  const qc = useQueryClient()
  const q = usePathData(studentId)
  const [needs, setNeeds] = useState<string[]>([])
  const [plan, setPlan] = useState<PlanCode>('balanced')
  const [place, setPlace] = useState<SnagPlace>('outside')
  const [open, setOpen] = useState<PlanCode | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const loc = (o: object, f: string) => {
    const r = o as Record<string, unknown>
    return String((lang === 'en' && r[`${f}_en`]) || r[`${f}_vi`] || '')
  }

  useEffect(() => {
    if (!q.data) return
    setNeeds(q.data.family?.needs ?? [])
    setPlan(q.data.family?.plan_code ?? 'balanced')
    setPlace(q.data.family?.snag_place ?? q.data.ctx?.snag_place ?? 'outside')
  }, [q.data])

  const canEdit = Boolean(guardian || q.data?.canEnter)
  const save = useMutation({
    mutationFn: async (v: { needs: string[]; plan: PlanCode; place: SnagPlace }) => {
      const { error } = await db().rpc('training_set_family_plan', { p_student_id: studentId, p_needs: v.needs, p_plan_code: v.plan, p_snag_place: v.place })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['training_path', studentId] }); toast(t('common.saved')) },
    onError: (e) => setErr(errorMessage(e, t)),
  })

  const d = q.data
  const cur = d ? stepIndexForLevel(d.steps, d.level) : -1
  const goal = d ? goalIndex(d.steps, d.needs, needs, cur) : -1
  const phase = d?.steps[cur]?.phase ?? 'snag'
  const selectedPlan = d?.plans.find((p) => p.code === plan) ?? d?.plans[0]
  const cards = useMemo(
    () => (d ? d.plans.map((raw) => {
      const p = applyPlace(raw, place)
      const lines = planLines(p, d.items, phase)
      return {
        plan: p,
        monthly: monthlyCost(p, d.items, phase),
        months: pathMonths(p, d.steps, cur, goal),
        recurring: lines.filter((l) => l.per !== 'once'),
        once: lines.filter((l) => l.per === 'once'),
        pending: hasPending(lines),
      }
    }) : []),
    [d, cur, goal, phase, place],
  )

  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (q.isError || !d) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  const savedPlace = d.family?.snag_place ?? d.ctx?.snag_place ?? 'outside'
  const dirty = JSON.stringify([...needs].sort()) !== JSON.stringify([...(d.family?.needs ?? [])].sort())
    || plan !== (d.family?.plan_code ?? 'balanced') || place !== savedPlace
  const toggle = (c: string) => setNeeds((n) => (n.includes(c) ? n.filter((x) => x !== c) : [...n, c]))
  const goalStep = d.steps[goal]
  const indexKind = PHASE_INDEX[phase]
  const index = d.ctx?.[indexKind] ?? null
  const price = (l: { cost?: CostItem; total: { min: number; max: number } }) =>
    l.cost?.price_pending ? t('training.path.pricePending') : formatRange(l.total, lang)

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to={back} className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
        <ChevronLeft className="h-4 w-4" /> {t('training.back')}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t('training.path.title')}</h1>
        <p className="text-sm text-navy/60">{t('training.path.for', { name: d.name, level: d.level })}</p>
      </div>

      {/* Chỉ số theo giai đoạn */}
      <Card className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-navy/70">{t(`training.path.index.${indexKind}`)}</p>
          <p className="text-2xl font-bold">{index?.idx != null ? Number(index.idx).toFixed(1) : '—'}</p>
          <p className="text-xs text-navy/60">
            {index?.idx != null ? t('training.path.index.note') : t('training.path.index.none', { holes: index?.holes ?? 0 })}
          </p>
        </div>
        <a href={HDCP_URL} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-sm font-semibold text-bronze">
          hdcp.vncentre.net <ExternalLink className="h-4 w-4" />
        </a>
      </Card>

      <p className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm text-navy/80">{t('training.path.estimateNote')}</p>

      {/* 1. Nhu cầu */}
      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-bold">{t('training.path.needsTitle')}</h2>
        <p className="text-sm text-navy/70">{t('training.path.needsHint')}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('training.path.needsTitle')}>
          {d.needs.map((n) => <Chip key={n.code} on={needs.includes(n.code)} disabled={!canEdit} onClick={() => toggle(n.code)}>{loc(n, 'title')}</Chip>)}
        </div>
        {d.needs.filter((n) => needs.includes(n.code)).map((n) => (
          <div key={n.code} className="rounded-lg bg-navy/5 p-3 text-sm">
            <p className="font-semibold">{loc(n, 'title')}</p>
            <p className="text-navy/80">{loc(n, 'advice')}</p>
          </div>
        ))}
        {needs.includes('scholarship') && guardian && (
          <Link to={`/app/children/${studentId}`} className="flex items-center gap-2 text-sm font-semibold text-bronze">
            <ClipboardList className="h-4 w-4" /> {t('training.path.checklist')}
          </Link>
        )}
        {goalStep && <p className="text-sm font-semibold">{t('training.path.goalLine', { step: goal + 1, title: loc(goalStep, 'title') })}</p>}
      </Card>

      {/* 2. Các bước */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t('training.path.stepsTitle')}</h2>
        <p className="text-sm text-navy/70">{t('training.path.stepsHint')}</p>
        <ol className="space-y-2">
          {d.steps.map((s, i) => {
            const past = i < cur
            const here = i === cur
            const beyond = i > goal
            return (
              <li key={s.id}>
                <Card className={cn('space-y-1 p-3', here && 'border-2 border-bronze', (past || beyond) && 'opacity-60')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-navy/50">{t('training.path.stepN', { n: i + 1 })}</span>
                    <span className="font-semibold">{loc(s, 'title')}</span>
                    {here && <Badge tone="good"><MapPin className="h-3 w-3" /> {t('training.path.here')}</Badge>}
                    {i === goal && i !== cur && <Badge><Flag className="h-3 w-3" /> {t('training.path.goal')}</Badge>}
                    {past && <Badge tone="neutral">{t('training.path.done')}</Badge>}
                  </div>
                  <p className="text-xs text-navy/60">
                    {s.level_from === s.level_to ? t('training.path.level1', { n: s.level_from }) : t('training.path.levels', { a: s.level_from, b: s.level_to })}
                    {s.hcp_note_vi ? ` · ${loc(s, 'hcp_note')}` : ''}
                  </p>
                  {s.benefit_vi && <p className="text-sm"><span className="font-semibold">{t('training.path.benefit')}</span> {loc(s, 'benefit')}</p>}
                  {s.opportunity_vi && <p className="text-sm"><span className="font-semibold">{t('training.path.opens')}</span> {loc(s, 'opportunity')}</p>}
                  {s.focus_vi && <p className="text-sm"><span className="font-semibold">{t('training.path.focus')}</span> {loc(s, 'focus')}</p>}
                  {!past && selectedPlan && (
                    <p className="text-xs text-navy/60">
                      {t('training.path.stepTime', { time: formatMonths(Number(s.months?.[selectedPlan.code] ?? 0), lang), plan: loc(selectedPlan, 'name') })}
                    </p>
                  )}
                </Card>
              </li>
            )
          })}
        </ol>
      </section>

      {/* 3. Nơi học SNAG (chỉ khi đang ở giai đoạn SNAG) */}
      {phase === 'snag' && (
        <Card className="space-y-2 p-4">
          <h2 className="text-lg font-bold">{t('training.path.placeTitle')}</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('training.path.placeTitle')}>
            {SNAG_PLACES.map((p) => <Chip key={p} on={place === p} disabled={!canEdit} onClick={() => setPlace(p)}>{t(`training.path.place.${p}`)}</Chip>)}
          </div>
          <p className="text-sm text-navy/70">{t(`training.path.placeNote.${place}`)}</p>
          {d.ctx?.snag_place && !d.family?.snag_place && <p className="text-xs text-navy/50">{t('training.path.placeAuto')}</p>}
        </Card>
      )}

      {/* 4. Phương án tài chính: theo tháng, các con được gì */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t('training.path.plansTitle', { n: d.plans.length })}</h2>
        <p className="text-sm text-navy/70">{t('training.path.plansHint')}</p>
        {cards.map(({ plan: p, monthly, months, recurring, once, pending }) => {
          const on = p.code === plan
          return (
            <Card key={p.id} className={cn('space-y-2 p-4', on && 'border-2 border-bronze')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-lg font-bold">{loc(p, 'name')}</p>
                {on ? <Badge tone="good">{t('training.path.chosen')}</Badge>
                  : canEdit && <Button size="sm" variant="outline" onClick={() => setPlan(p.code)}>{t('training.path.choose')}</Button>}
              </div>
              {p.summary_vi && <p className="text-sm">{loc(p, 'summary')}</p>}
              <div className="rounded-lg bg-navy/5 p-3 text-sm">
                <p className="font-semibold">{t('training.path.gets')}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {recurring.filter((l) => l.cost?.gain_vi).map((l, k) => (
                    <li key={k}><span className="font-semibold">{loc(l.cost!, 'name')}</span> ({t(`training.path.per.${l.per}`, { n: l.qty, unit: loc(l.cost!, 'unit') })}): {loc(l.cost!, 'gain')}</li>
                  ))}
                </ul>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-navy/5 p-2">
                  <dt className="text-xs text-navy/60">{t('training.path.perMonth')}</dt>
                  <dd className="font-bold">{t('training.path.about', { cost: formatRange(monthly, lang) })}</dd>
                  {pending && <dd className="text-xs text-navy/60">{t('training.path.plusPending')}</dd>}
                </div>
                <div className="rounded-lg bg-navy/5 p-2">
                  <dt className="text-xs text-navy/60">{t('training.path.toGoal', { step: goal + 1 })}</dt>
                  <dd className="font-bold">{t('training.path.aboutTime', { time: formatMonths(months, lang) })}</dd>
                </div>
              </dl>
              {once.length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold">{t('training.path.once')}</span>{' '}
                  {once.map((l) => `${loc(l.cost!, 'name')} (${price(l)})`).join(', ')}
                </p>
              )}
              {p.tradeoff_vi && <p className="text-sm text-navy/70"><span className="font-semibold">{t('training.path.tradeoff')}</span> {loc(p, 'tradeoff')}</p>}
              <button type="button" className="flex items-center gap-1 text-sm font-semibold text-bronze" onClick={() => setOpen(open === p.code ? null : p.code)}>
                {open === p.code ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {t('training.path.details')}
              </button>
              {open === p.code && (
                <ul className="divide-y divide-navy/10 text-sm">
                  {[...recurring, ...once].map((l, k) => (
                    <li key={k} className="py-1.5">
                      <div className="flex justify-between gap-3">
                        <span>
                          {loc(l.cost!, 'name')}
                          <span className="text-navy/60"> · {t(`training.path.per.${l.per}`, { n: l.qty, unit: loc(l.cost!, 'unit') })}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">{price(l)}</span>
                      </div>
                      {l.cost?.note_vi && <p className="text-xs text-navy/55">{loc(l.cost, 'note')}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </section>

      {canEdit && (
        <div className="space-y-2">
          <FormError message={err} />
          <Button size="full" disabled={!dirty || save.isPending} onClick={() => { setErr(null); save.mutate({ needs, plan, place }) }}>
            {t('training.path.save')}
          </Button>
        </div>
      )}
      <p className="text-xs text-navy/50">{t('training.path.disclaimer')}</p>
      <FeedbackButton studentId={studentId} />
    </div>
  )
}
