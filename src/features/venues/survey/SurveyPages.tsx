// Spec 28 · S1–S2 Khảo sát viên VN Centre · U7 Người dùng viết đánh giá
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Flag, Star } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { Section, StickyActions, fmtDate } from '@/features/courses/parts'
import { cn } from '@/lib/utils'
import { PARKING, useBrands, type Venue } from '../api'
import { DetailsEditor, changedDetailFields, cleanDetails, detailsError, detailsOf, type VenueDetails } from '../details'
import { RequireSignIn, Shell, TAPGOLF } from '../contribute/ContributePages'
import { usePublicVenue, useVenueNames, type PublicVenue } from '../contribute/api'
import {
  SCORE_KEYS, SUB_KEYS, surveyErr, useMyReview, useMySurveys, usePublicReviews, useReportReview, useSaveReview, useSaveSurvey, useSurvey,
  type Survey, type SurveyStatus,
} from './api'

export const SURVEY_TONE: Record<SurveyStatus, string> = {
  assigned: 'bg-sky-100 text-sky-900', draft: 'bg-amber-100 text-amber-900', submitted: 'bg-violet-100 text-violet-900',
  approved: 'bg-emerald-100 text-emerald-900', rejected: 'bg-red-100 text-red-900',
}
export function SurveyPill({ s }: { s: SurveyStatus }) {
  const { t } = useTranslation()
  return <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', SURVEY_TONE[s])}>{t(`venues.s.status.${s}`)}</span>
}

/** Thang 1–10 bấm chạm (mỗi ô ≥ 44 px cao). */
export function ScoreRow({ label, value, onChange, max = 10 }: { label: string; value?: number; onChange: (v: number) => void; max?: number }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-semibold">{label}{value ? <b className="ml-2 text-bronze">{value}/{max}</b> : null}</legend>
      <div className={cn('grid gap-1', max === 10 ? 'grid-cols-10' : 'grid-cols-5')}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" aria-pressed={value === n} aria-label={`${label}: ${n}`} onClick={() => onChange(n)}
            className={cn('min-h-11 rounded-lg border text-sm font-bold', value === n ? 'border-navy bg-navy text-white' : value && n < value ? 'border-gold/40 bg-gold/20' : 'border-navy/15 bg-white')}>
            {n}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function Stars({ n, size = 'h-4 w-4' }: { n: number; size?: string }) {
  return (
    <span className="inline-flex" aria-label={`${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn(size, i <= n ? 'fill-gold text-gold' : 'text-navy/25')} />)}
    </span>
  )
}

// ── S1 Danh sách việc khảo sát của tôi ─────────────────────────────────────
export function SurveyorPage() {
  return <RequireSignIn><SurveyorInner /></RequireSignIn>
}
function SurveyorInner() {
  const { t, i18n } = useTranslation()
  const { session, hasRole } = useAuth()
  const list = useMySurveys(session?.user.id)
  const names = useVenueNames((list.data ?? []).map((s) => s.venue_id))
  const allowed = hasRole('venue_surveyor') || hasRole('admin')
  if (list.isPending) return <FullPageSpinner />
  const rows = list.data ?? []
  const open = rows.filter((s) => s.status === 'assigned' || s.status === 'draft')
  const done = rows.filter((s) => s.status !== 'assigned' && s.status !== 'draft')
  const card = (s: Survey) => (
    <Link key={s.id} to={`/venues/survey/${s.id}`} className="flex flex-col gap-1 rounded-2xl border border-navy/10 bg-white px-4 py-3 shadow-sm hover:border-bronze/50">
      <span className="flex flex-wrap items-center gap-1.5 text-xs"><SurveyPill s={s.status} /><span className="text-navy/60">{s.venue_id} · {t('venues.s.assignedOn', { d: fmtDate(s.assigned_at, i18n.language) })}</span></span>
      <span className="text-[17px] font-semibold">{names.data?.[s.venue_id] ?? s.venue_id}</span>
      {s.overall != null && <span className="text-sm text-navy/70">{t('venues.s.overall')}: <b>{s.overall}</b>/10</span>}
      {s.review_note && s.status === 'draft' && <span className="text-sm text-red-800">{t('venues.s.returned', { note: s.review_note })}</span>}
    </Link>
  )
  return (
    <Shell title={t('venues.s.myTitle')} sub={t('venues.s.mySub')}>
      <FormError message={list.error ? surveyErr(list.error, t) : null} />
      {!allowed && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('venues.s.notSurveyor')}</p>}
      <h2 className="text-base font-bold">{t('venues.s.todo', { n: open.length })}</h2>
      {open.length ? open.map(card) : <p className="rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-navy/60">{t('venues.s.noTodo')}</p>}
      {!!done.length && <h2 className="pt-2 text-base font-bold">{t('venues.s.done', { n: done.length })}</h2>}
      {done.map(card)}
    </Shell>
  )
}

// ── S2 Phiếu khảo sát ──────────────────────────────────────────────────────
export function SurveyFormPage() {
  return <RequireSignIn><SurveyFormInner /></RequireSignIn>
}
function SurveyFormInner() {
  const { sid = '' } = useParams()
  const { t } = useTranslation()
  const s = useSurvey(sid)
  const v = usePublicVenue(s.data?.venue_id ?? '')
  if (s.isPending || (s.data && v.isPending)) return <FullPageSpinner />
  if (!s.data || !v.data) return <Shell title={t('venues.s.formTitle')}><FormError message={surveyErr(s.error ?? v.error ?? 'not_allowed', t)} /></Shell>
  return <SurveyForm key={s.data.id + s.data.status} s={s.data} v={v.data} />
}

function SurveyForm({ s, v }: { s: Survey; v: PublicVenue }) {
  const { t } = useTranslation()
  const toast = useToast()
  const brands = useBrands()
  const save = useSaveSurvey()
  const editable = s.status === 'assigned' || s.status === 'draft'
  const a = s.answers as Partial<Venue>
  const [visit, setVisit] = useState(s.visit_date ?? new Date().toISOString().slice(0, 10))
  const [scores, setScores] = useState<Record<string, number>>({ ...(s.scores as Record<string, number>) })
  const [info, setInfo] = useState({
    machine: (a.machine ?? v.machine ?? '') as string, bays: String(a.bays ?? v.bays ?? ''), hours: (a.hours ?? v.hours ?? '') as string,
    phone: (a.phone ?? v.phone ?? '') as string, parking: (a.parking ?? v.parking) as Venue['parking'], late: (a.late ?? v.late) as boolean,
  })
  const baseDetails = useMemo(() => detailsOf(v), [v])
  const [det, setDet] = useState(() => detailsOf({ ...baseDetails, ...(a as Partial<VenueDetails>) }))
  const [pros, setPros] = useState(s.pros_vi ?? '')
  const [cons, setCons] = useState(s.cons_vi ?? '')
  const [err, setErr] = useState<string | null>(null)
  const filled = SCORE_KEYS.filter((k) => scores[k]).length
  const avg = filled ? Math.round((SCORE_KEYS.reduce((x, k) => x + (scores[k] ?? 0), 0) / filled) * 10) / 10 : null

  async function go(submit: boolean) {
    setErr(null)
    if (info.bays.trim() && !/^\d{1,3}$/.test(info.bays.trim())) return setErr(t('venues.err.badBays'))
    if (submit && filled < 6) return setErr(t('venues.s.err.scores_incomplete'))
    const dErr = detailsError(det)
    if (dErr) return setErr(t(dErr))
    // chỉ gửi trường khác với dữ liệu hiện có — admin sẽ thấy đúng phần thay đổi
    const cur: Record<string, unknown> = { machine: v.machine ?? '', bays: v.bays == null ? '' : String(v.bays), hours: v.hours ?? '', phone: v.phone ?? '', parking: v.parking, late: v.late }
    const ans: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(info)) {
      if (val === cur[k]) continue
      ans[k] = k === 'bays' ? (String(val).trim() ? parseInt(String(val), 10) : null) : typeof val === 'string' ? val.trim() || null : val
    }
    const cleanDet = cleanDetails(det)
    for (const k of changedDetailFields(det, baseDetails)) ans[k] = cleanDet[k]
    try {
      await save.mutateAsync({ id: s.id, visitDate: visit || null, answers: ans, scores, pros, cons, submit })
      toast(submit ? t('venues.s.submitted') : t('common.saved'))
    } catch (e) { setErr(surveyErr(e, t)) }
  }

  return (
    <Shell title={t('venues.s.formTitle')} sub={`${v.name} · ${v.id}`} back="/venues/survey">
      <p className="flex flex-wrap items-center gap-2 text-sm"><SurveyPill s={s.status} /> <a href={`${TAPGOLF}/#/${v.id}`} className="font-semibold underline">{t('venues.o.view')}</a></p>
      {s.review_note && s.status === 'draft' && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{t('venues.s.returned', { note: s.review_note })}</p>}
      {!editable && <p className="rounded-xl bg-cream px-4 py-3 text-sm">{t('venues.s.locked')}</p>}
      <fieldset disabled={!editable} className="flex flex-col gap-4">
        <Section title={t('venues.s.visit')}>
          <Field label={t('venues.s.visitDate')}><Input type="date" value={visit} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setVisit(e.target.value)} /></Field>
        </Section>
        <Section title={t('venues.s.scoresTitle')} aside={avg != null ? <b className="text-bronze">{t('venues.s.overall')}: {avg}</b> : undefined}>
          <p className="text-sm text-navy/70">{t('venues.s.scoresHint')}</p>
          {SCORE_KEYS.map((k) => <ScoreRow key={k} label={t(`venues.s.k.${k}`)} value={scores[k]} onChange={(n) => setScores({ ...scores, [k]: n })} />)}
        </Section>
        <Section title={t('venues.s.infoTitle')}>
          <p className="text-sm text-navy/70">{t('venues.s.infoHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('venues.f.machine')}>
              <Select value={info.machine} onChange={(e) => setInfo({ ...info, machine: e.target.value })}>
                <option value="">{t('venues.noMachine')}</option>
                {(brands.data ?? []).map((b) => <option key={b.key} value={b.key}>{b.key}</option>)}
              </Select>
            </Field>
            <Field label={t('venues.f.bays')}><Input value={info.bays} inputMode="numeric" onChange={(e) => setInfo({ ...info, bays: e.target.value })} /></Field>
            <Field label={t('venues.f.hours')}><Input value={info.hours} onChange={(e) => setInfo({ ...info, hours: e.target.value })} /></Field>
            <Field label={t('venues.f.phone')}><Input value={info.phone} inputMode="tel" onChange={(e) => setInfo({ ...info, phone: e.target.value })} /></Field>
            <Field label={t('venues.f.parking')}>
              <Select value={info.parking} onChange={(e) => setInfo({ ...info, parking: e.target.value as Venue['parking'] })}>{PARKING.map((k) => <option key={k} value={k}>{t(`venues.parking.${k}`)}</option>)}</Select>
            </Field>
            <div className="flex items-end"><Checkbox label={t('venues.f.late')} checked={info.late} onChange={(e) => setInfo({ ...info, late: e.target.checked })} /></div>
          </div>
        </Section>
        <Section title={t('venues.d.surveyTitle')}>
          <p className="text-sm text-navy/70">{t('venues.d.surveyHint')}</p>
          <DetailsEditor value={det} onChange={setDet} brands={(brands.data ?? []).map((b) => b.key)} venueType={v.type} />
        </Section>
        <Section title={t('venues.s.notes')}>
          <Field label={t('venues.s.pros')}><Textarea rows={3} value={pros} onChange={(e) => setPros(e.target.value)} /></Field>
          <Field label={t('venues.s.cons')}><Textarea rows={3} value={cons} onChange={(e) => setCons(e.target.value)} /></Field>
          <p className="text-xs text-navy/60">{t('venues.s.photoHint')} <Link to={`/venues/${v.id}/photos`} className="font-semibold underline">{t('venues.c.photosTitle')}</Link></p>
        </Section>
      </fieldset>
      <FormError message={err} />
      {editable && (
        <StickyActions>
          <Button variant="outline" onClick={() => go(false)} disabled={save.isPending}>{t('venues.s.saveDraft')}</Button>
          <Button size="full" onClick={() => go(true)} disabled={save.isPending}>{t('venues.s.submit')}</Button>
        </StickyActions>
      )}
    </Shell>
  )
}

// ── U7 Viết / sửa đánh giá; xem và báo cáo đánh giá của người khác ─────────
export function ReviewWritePage() {
  return <RequireSignIn><ReviewInner /></RequireSignIn>
}
function ReviewInner() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { session } = useAuth()
  const v = usePublicVenue(id)
  const mine = useMyReview(id, session?.user.id)
  if (v.isPending || mine.isPending) return <FullPageSpinner />
  if (!v.data) return <Shell title={t('venues.r.title')}><FormError message={surveyErr(v.error ?? 'venue_not_found', t)} /></Shell>
  return <ReviewForm key={mine.data?.updated_at ?? 'new'} v={v.data} mine={mine.data ?? null} />
}

function ReviewForm({ v, mine }: { v: PublicVenue; mine: import('./api').Review | null }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const save = useSaveReview()
  const report = useReportReview()
  const list = usePublicReviews(v.id)
  const [stars, setStars] = useState(mine?.stars ?? 0)
  const [sub, setSub] = useState<Record<string, number>>({ ...(mine?.sub as Record<string, number> | undefined) })
  const [body, setBody] = useState(mine?.body ?? '')
  const [month, setMonth] = useState(mine?.visit_month?.slice(0, 7) ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [reported, setReported] = useState<Record<string, boolean>>({})
  const others = useMemo(() => (list.data ?? []).filter((r) => r.id !== mine?.id), [list.data, mine?.id])

  async function submit() {
    setErr(null)
    if (!stars) return setErr(t('venues.r.needStars'))
    try {
      await save.mutateAsync({ venueId: v.id, stars, sub, body, visitMonth: month ? `${month}-01` : null })
      toast(mine ? t('venues.r.updated') : t('venues.r.posted'))
    } catch (e) { setErr(surveyErr(e, t)) }
  }
  async function flag(rid: string) {
    try { await report.mutateAsync({ id: rid, reason: '' }); setReported({ ...reported, [rid]: true }); toast(t('venues.r.reportedOk')) } catch (e) { setErr(surveyErr(e, t)) }
  }

  return (
    <Shell title={mine ? t('venues.r.editTitle') : t('venues.r.title')} sub={v.name} back={`${TAPGOLF}/#/${v.id}`}>
      {mine?.status === 'hidden' && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{t('venues.r.hiddenMine', { r: mine.hidden_reason ?? '' })}</p>}
      <Section title={t('venues.r.yours')}>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-semibold">{t('venues.r.overall')}</legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={t('venues.r.starsN', { n })} aria-pressed={stars === n} onClick={() => setStars(n)} className="flex h-12 w-12 items-center justify-center rounded-lg hover:bg-gold/10">
                <Star className={cn('h-9 w-9', n <= stars ? 'fill-gold text-gold' : 'text-navy/25')} />
              </button>
            ))}
          </div>
        </fieldset>
        <details className="rounded-xl border border-navy/10 px-3 py-2" open={Object.keys(sub).length > 0}>
          <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">{t('venues.r.detail')}</summary>
          <div className="space-y-3 pt-2">
            {SUB_KEYS.map((k) => <ScoreRow key={k} max={5} label={t(`venues.s.k.${k}`)} value={sub[k]} onChange={(n) => setSub({ ...sub, [k]: n })} />)}
          </div>
        </details>
        <Field label={t('venues.r.body')} hint={t('venues.r.bodyHint')}><Textarea rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Field label={t('venues.r.month')}><Input type="month" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} /></Field>
        <p className="text-xs text-navy/60">{t('venues.r.rules')}</p>
        <FormError message={err} />
        <Button size="full" onClick={submit} disabled={save.isPending}>{mine ? t('venues.r.update') : t('venues.r.post')}</Button>
      </Section>
      <Section title={t('venues.r.others', { n: others.length })}>
        {!others.length && <p className="text-sm text-navy/60">{t('venues.r.none')}</p>}
        {others.map((r) => (
          <article key={r.id} className="space-y-1 border-t border-navy/10 pt-3 first:border-0 first:pt-0">
            <p className="flex flex-wrap items-center gap-2 text-sm"><Stars n={r.stars} /> <b>{r.author}</b> <span className="text-navy/60">{fmtDate(r.created_at, i18n.language)}</span></p>
            {r.body && <p className="text-sm whitespace-pre-line">{r.body}</p>}
            {r.owner_reply && <p className="rounded-lg bg-cream px-3 py-2 text-sm"><b>{t('venues.r.ownerReply')}:</b> {r.owner_reply}</p>}
            <button type="button" disabled={reported[r.id]} onClick={() => flag(r.id)} className="inline-flex min-h-11 items-center gap-1 text-xs text-navy/60 underline disabled:no-underline">
              <Flag className="h-3.5 w-3.5" /> {reported[r.id] ? t('venues.r.reported') : t('venues.r.report')}
            </button>
          </article>
        ))}
      </Section>
    </Shell>
  )
}
