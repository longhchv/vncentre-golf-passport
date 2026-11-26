// Spec 28 · A6 Giao việc & duyệt phiếu khảo sát VN Centre · A7 Kiểm duyệt đánh giá người dùng
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, Check, ChevronLeft, EyeOff, RotateCcw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Chip, Section, fmtDate } from '@/features/courses/parts'
import { REGIONS, useVenues, type Venue } from '../api'
import { SCORE_KEYS, surveyErr, useAllSurveys, useAssignSurvey, useChangeSurvey, useDecideSurvey, useModerateReview, useReviewsAdmin, useSurveyors, type Survey, type SurveyStatus } from './api'
import { Stars, SurveyPill } from './SurveyPages'
import { DETAIL_FIELDS, fmtDetail } from '../details'

function Header({ title }: { title: string }) {
  const { t } = useTranslation()
  return (
    <div className="-mx-4 -mt-6 flex items-center gap-1 bg-navy py-3 pr-4 pl-2 text-white lg:mx-0 lg:mt-0 lg:rounded-2xl">
      <Link to="/admin/venues" aria-label={t('venues.backToList')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10"><ChevronLeft className="h-6 w-6" /></Link>
      <h1 className="text-lg font-bold">{title}</h1>
    </div>
  )
}

const showVal = (k: string, v: unknown, t: (k: string) => string) =>
  (DETAIL_FIELDS as readonly string[]).includes(k) ? fmtDetail(k, v, t) : v == null || v === '' ? '∅' : k === 'parking' ? t(`venues.parking.${v}`) : k === 'late' ? (v ? '✓' : '—') : String(v)

// ── A6 ─────────────────────────────────────────────────────────────────────
export function AdminSurveysPage() {
  const { t, i18n } = useTranslation()
  const venues = useVenues()
  const surveys = useAllSurveys()
  const people = useSurveyors()
  const [tab, setTab] = useState<SurveyStatus | 'open'>('submitted')
  const [who, setWho] = useState('all')
  if (surveys.isPending || venues.isPending) return <FullPageSpinner />
  const vmap = Object.fromEntries((venues.data ?? []).map((v) => [v.id, v])) as Record<string, Venue>
  const pname = Object.fromEntries((people.data ?? []).map((p) => [p.user_id, p.full_name || p.email || p.user_id.slice(0, 8)]))
  const all = surveys.data ?? []
  const list = all.filter((s) => (tab === 'open' ? s.status === 'assigned' || s.status === 'draft' : s.status === tab)).filter((s) => who === 'all' || s.surveyor_id === who)
  const n = (k: SurveyStatus | 'open') => all.filter((s) => (k === 'open' ? s.status === 'assigned' || s.status === 'draft' : s.status === k)).length
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Header title={t('venues.s.adminTitle')} />
      <FormError message={surveys.error ? surveyErr(surveys.error, t) : people.error ? surveyErr(people.error, t) : null} />
      <AssignBox venues={venues.data ?? []} />
      <div className="flex flex-wrap gap-2">
        {(['submitted', 'open', 'approved'] as const).map((k) => (
          <Chip key={k} on={tab === k} onClick={() => setTab(k)} className="min-h-10 px-3 text-sm">{t(`venues.s.tab.${k}`, { n: n(k) })}</Chip>
        ))}
      </div>
      <Select aria-label={t('venues.s.surveyor')} value={who} onChange={(e) => setWho(e.target.value)}>
        <option value="all">{t('venues.s.allSurveyors')}</option>
        {(people.data ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}
      </Select>
      {!list.length && <p className="rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-navy/60">{t('venues.q.empty')}</p>}
      {list.map((s) => tab === 'submitted'
        ? <SurveyReview key={s.id} s={s} v={vmap[s.venue_id]} who={pname[s.surveyor_id]} />
        : (
          <div key={s.id} className="flex flex-col gap-1 rounded-2xl border border-navy/10 bg-white px-4 py-3">
            <span className="flex flex-wrap items-center gap-1.5 text-xs"><SurveyPill s={s.status} />{s.published && <span className="rounded-md bg-gold/20 px-2 py-0.5 font-semibold">{t('venues.s.published')}</span>}<span className="text-navy/60">{s.venue_id} · {pname[s.surveyor_id] ?? '—'} · {fmtDate(s.assigned_at, i18n.language)}</span></span>
            <b>{vmap[s.venue_id]?.name ?? s.venue_id}</b>
            {s.overall != null && <span className="text-sm">{t('venues.s.overall')}: <b>{s.overall}</b>/10</span>}
            {(s.status === 'assigned' || s.status === 'draft') && <ChangeRow s={s} people={people.data ?? []} />}
          </div>
        ))}
    </div>
  )
}

function AssignBox({ venues }: { venues: Venue[] }) {
  const { t } = useTranslation()
  const toast = useToast()
  const people = useSurveyors()
  const assign = useAssignSurvey()
  const [who, setWho] = useState('')
  const [q, setQ] = useState('')
  const [region, setRegion] = useState('all')
  const [picked, setPicked] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s && region === 'all') return []
    return venues.filter((v) => v.status === 'active' || v.status === 'closed_temp')
      .filter((v) => region === 'all' || v.region === region)
      .filter((v) => !s || [v.id, v.name, v.district].some((x) => x?.toLowerCase().includes(s)))
      .slice(0, 30)
  }, [venues, q, region])
  async function go() {
    setErr(null)
    if (!who || !picked.length) return setErr(t('venues.s.assignNeed'))
    try { const n = await assign.mutateAsync({ venueIds: picked, surveyor: who }); toast(t('venues.s.assignedN', { n })); setPicked([]) } catch (e) { setErr(surveyErr(e, t)) }
  }
  return (
    <Section title={t('venues.s.assignTitle')}>
      {!people.isPending && !people.data?.length && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('venues.s.noSurveyors')} <Link to="/admin/users" className="font-semibold underline">{t('admin.nav.users', { defaultValue: 'Users' })}</Link></p>}
      <Field label={t('venues.s.surveyor')}>
        <Select value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">{t('venues.s.pickSurveyor')}</option>
          {(people.data ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email} · {t('venues.s.openN', { n: p.open_tasks })}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Select aria-label={t('venues.f.region')} value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="all">{t('venues.allRegions')}</option>
          {REGIONS.map((r) => <option key={r} value={r}>{t(`venues.region.${r}`)}</option>)}
        </Select>
        <Input type="search" aria-label={t('common.search')} placeholder={t('venues.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!!hits.length && (
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-navy/10 p-2">
          {hits.map((v) => (
            <Checkbox key={v.id} label={`${v.name} (${v.id})${v.vnc_score != null ? ` · VNC ${v.vnc_score}` : ''}`} checked={picked.includes(v.id)}
              onChange={() => setPicked(picked.includes(v.id) ? picked.filter((x) => x !== v.id) : [...picked, v.id])} />
          ))}
        </div>
      )}
      {!!picked.length && <p className="text-sm">{t('venues.s.pickedN', { n: picked.length })}: {picked.join(', ')}</p>}
      <FormError message={err} />
      <Button onClick={go} disabled={assign.isPending}>{t('venues.s.assign')}</Button>
    </Section>
  )
}

function SurveyReview({ s, v, who }: { s: Survey; v?: Venue; who?: string }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const decide = useDecideSurvey()
  const keys = Object.keys(s.answers)
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(keys.map((k) => [k, true])))
  const [publish, setPublish] = useState(true)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  async function act(approve: boolean) {
    setErr(null)
    if (!approve && !note.trim()) return setErr(t('venues.c.err.note_required'))
    try {
      await decide.mutateAsync({ id: s.id, approve, fields: keys.filter((k) => on[k]), publish, note })
      toast(approve ? t('venues.s.approvedOk') : t('venues.s.returnedOk'))
    } catch (e) { setErr(surveyErr(e, t)) }
  }
  return (
    <Section title={`${v?.name ?? s.venue_id} (${s.venue_id})`} aside={<span className="text-xs text-navy/60">{who} · {fmtDate(s.submitted_at, i18n.language)}</span>}>
      <p className="text-sm">{t('venues.s.visitDate')}: <b>{fmtDate(s.visit_date, i18n.language)}</b> · {t('venues.s.overall')}: <b className="text-bronze">{s.overall}</b>/10
        {v?.vnc_score != null && <span className="text-navy/60"> · {t('venues.s.prev', { n: v.vnc_score })}</span>}</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {SCORE_KEYS.map((k) => <div key={k} className="rounded-lg bg-cream px-3 py-2 text-sm">{t(`venues.s.k.${k}`)}: <b>{s.scores[k] ?? '—'}</b></div>)}
      </div>
      {s.pros_vi && <p className="text-sm"><b>{t('venues.s.pros')}:</b> {s.pros_vi}</p>}
      {s.cons_vi && <p className="text-sm"><b>{t('venues.s.cons')}:</b> {s.cons_vi}</p>}
      {!!keys.length && (
        <div className="overflow-hidden rounded-xl border border-navy/10">
          <p className="bg-navy/5 px-3 py-2 text-xs font-bold text-navy/70 uppercase">{t('venues.s.infoChanges')}</p>
          {keys.map((k) => (
            <label key={k} className="grid min-h-11 cursor-pointer grid-cols-[44px_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)] items-center gap-2 border-t border-navy/10 px-3 py-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-bronze" checked={!!on[k]} onChange={() => setOn({ ...on, [k]: !on[k] })} />
              <b>{t(`venues.f.${k}`, { defaultValue: k })}</b>
              <span className="break-words text-navy/60 line-through">{showVal(k, v ? (v as unknown as Record<string, unknown>)[k] : null, t)}</span>
              <span className="break-words rounded-md bg-gold/15 px-2 py-0.5 font-semibold">{showVal(k, s.answers[k], t)}</span>
            </label>
          ))}
        </div>
      )}
      <Checkbox label={t('venues.s.publish')} checked={publish} onChange={(e) => setPublish(e.target.checked)} />
      <Input aria-label={t('venues.q.note')} placeholder={t('venues.s.notePh')} value={note} onChange={(e) => setNote(e.target.value)} />
      <FormError message={err} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => act(true)} disabled={decide.isPending}><Check className="h-5 w-5" /> {t('venues.s.approve')}</Button>
        <Button variant="outline" className="text-red-800" onClick={() => act(false)} disabled={decide.isPending}><X className="h-5 w-5" /> {t('venues.s.return')}</Button>
      </div>
    </Section>
  )
}

// ── A7 ─────────────────────────────────────────────────────────────────────
export function AdminReviewsPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [mode, setMode] = useState<'flagged' | 'recent' | 'hidden'>('flagged')
  const list = useReviewsAdmin(mode)
  const venues = useVenues()
  const mod = useModerateReview()
  const [reason, setReason] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const vname = Object.fromEntries((venues.data ?? []).map((v) => [v.id, v.name]))
  async function act(id: string, hide: boolean) {
    setErr(null)
    if (hide && !reason[id]?.trim()) return setErr(t('venues.r.hideNeed'))
    try { await mod.mutateAsync({ id, hide, reason: reason[id] ?? '' }); toast(hide ? t('venues.r.hiddenOk') : t('venues.r.restoredOk')) } catch (e) { setErr(surveyErr(e, t)) }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Header title={t('venues.r.adminTitle')} />
      <p className="text-sm text-navy/70">{t('venues.r.adminHint')}</p>
      <div className="flex flex-wrap gap-2">
        {(['flagged', 'recent', 'hidden'] as const).map((k) => <Chip key={k} on={mode === k} onClick={() => setMode(k)} className="min-h-10 px-3 text-sm">{t(`venues.r.tab.${k}`)}</Chip>)}
      </div>
      <FormError message={err ?? (list.error ? surveyErr(list.error, t) : null)} />
      {list.isPending ? <FullPageSpinner /> : !list.data?.length ? <p className="rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-navy/60">{t('venues.q.empty')}</p> : null}
      {(list.data ?? []).map((r) => (
        <div key={r.id} className="space-y-2 rounded-2xl border border-navy/10 bg-white p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm"><Stars n={r.stars} /> <b>{vname[r.venue_id] ?? r.venue_id}</b>
            <span className="text-navy/60">{fmtDate(r.created_at, i18n.language)}</span>
            {r.report_count > 0 && <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">{t('venues.r.reportsN', { n: r.report_count })}</span>}</p>
          {r.body && <p className="text-sm whitespace-pre-line">{r.body}</p>}
          {r.owner_reply && <p className="rounded-lg bg-cream px-3 py-2 text-sm"><b>{t('venues.r.ownerReply')}:</b> {r.owner_reply}</p>}
          {r.status === 'hidden' ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-red-800">{t('venues.r.hiddenBecause', { r: r.hidden_reason ?? '' })}</span>
              <Button size="sm" variant="outline" onClick={() => act(r.id, false)} disabled={mod.isPending}><RotateCcw className="h-4 w-4" /> {t('venues.r.restore')}</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Input className="min-w-0 flex-1" aria-label={t('venues.r.hideReason')} placeholder={t('venues.r.hideReason')} value={reason[r.id] ?? ''} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} />
              <Button variant="outline" className="text-red-800" onClick={() => act(r.id, true)} disabled={mod.isPending}><EyeOff className="h-5 w-5" /> {t('venues.r.hide')}</Button>
              {r.report_count > 0 && <Button variant="ghost" onClick={() => act(r.id, false)} disabled={mod.isPending}>{t('venues.r.keep')}</Button>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Chuyển việc sang khảo sát viên khác hoặc huỷ việc chưa gửi (huỷ cần bấm xác nhận lần hai). */
function ChangeRow({ s, people }: { s: Survey; people: { user_id: string; full_name: string | null; email: string | null }[] }) {
  const { t } = useTranslation()
  const toast = useToast()
  const change = useChangeSurvey()
  const [to, setTo] = useState('')
  const [sure, setSure] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function go(target: string | null) {
    setErr(null)
    try { await change.mutateAsync({ id: s.id, to: target }); toast(target ? t('venues.s.movedOk') : t('venues.s.cancelledOk')) } catch (e) { setErr(surveyErr(e, t)); setSure(false) }
  }
  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="min-w-0 flex-1" aria-label={t('venues.s.moveTo')} value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">{t('venues.s.moveTo')}</option>
          {people.filter((p) => p.user_id !== s.surveyor_id).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}
        </Select>
        <Button variant="outline" onClick={() => go(to)} disabled={!to || change.isPending}><ArrowRightLeft className="h-5 w-5" /> {t('venues.s.move')}</Button>
        {sure
          ? <Button variant="outline" className="text-red-800" onClick={() => go(null)} disabled={change.isPending}><Trash2 className="h-5 w-5" /> {t('venues.s.cancelSure')}</Button>
          : <Button variant="ghost" className="text-red-800" onClick={() => setSure(true)} disabled={change.isPending}>{t('venues.s.cancel')}</Button>}
      </div>
      {s.status === 'draft' && <p className="text-xs text-navy/60">{t('venues.s.draftKept')}</p>}
      <FormError message={err} />
    </div>
  )
}
