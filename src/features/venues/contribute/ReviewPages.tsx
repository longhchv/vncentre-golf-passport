// Spec 27 · A4 Hàng chờ duyệt đề xuất (so sánh từng trường) · A5 Duyệt ảnh
import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Check, ChevronLeft, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormError, Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Section, fmtDate } from '@/features/courses/parts'
import { contribErr, evidenceUrl, photoUrl, useModeratePhoto, usePhotoQueue, useQueue, useReview, useVenueNames, type Photo, type Submission } from './api'
import type { Venue } from '../api'
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

const show = (v: unknown): string => {
  if (v == null || v === '') return '∅'
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? Object.values(x as object).filter(Boolean).join(' ') : String(x))).join(' · ')
  if (typeof v === 'object') return Object.entries(v as object).filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join(', ')
  return String(v)
}

export function QueuePage() {
  const { t } = useTranslation()
  const q = useQueue()
  if (q.isPending) return <FullPageSpinner />
  const subs = q.data?.subs ?? []
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Header title={t('venues.q.title', { n: subs.length })} />
      <FormError message={q.error ? contribErr(q.error, t) : null} />
      {!subs.length && <p className="rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-navy/60">{t('venues.q.empty')}</p>}
      {subs.map((s) => <SubCard key={s.id} s={s} venue={s.venue_id ? q.data!.venues[s.venue_id] : undefined} photos={q.data!.photos.filter((p) => p.submission_id === s.id)} />)}
    </div>
  )
}

function SubCard({ s, venue, photos }: { s: Submission; venue?: Venue; photos: Photo[] }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const review = useReview()
  const keys = Object.keys(s.payload).filter((k) => k !== 'region')
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(keys.map((k) => [k, true])))
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const picked = keys.filter((k) => on[k])
  async function act(action: 'approve' | 'reject' | 'duplicate') {
    setErr(null)
    if (action !== 'approve' && !note.trim()) return setErr(t('venues.c.err.note_required'))
    try {
      const r = await review.mutateAsync({ id: s.id, action, fields: s.kind === 'edit' || s.kind === 'new_venue' ? picked : null, note })
      toast(r ? t('venues.q.approved', { p: r.points }) : t('venues.q.rejected'))
    } catch (e) { setErr(contribErr(e, t)) }
  }
  const diffable = s.kind === 'edit' || s.kind === 'new_venue'
  const label = (k: string, v: unknown) =>
    (DETAIL_FIELDS as readonly string[]).includes(k) ? fmtDetail(k, v, t) : k === 'type' && v ? t(`venues.type.${v}`) : k === 'parking' && v ? t(`venues.parking.${v}`) : k === 'late' || k === 'residents_only' ? (v ? '✓' : '—') : show(v)
  return (
    <Section title={`${t(`venues.c.kind.${s.kind}`)} · ${venue ? `${venue.name} (${venue.id})` : String(s.payload.name ?? '')}`}
      aside={<span className="text-xs text-navy/60">{fmtDate(s.submitted_at, i18n.language)}</span>}>
      {s.evidence && <p className="rounded-lg bg-cream px-3 py-2 text-sm">{t('venues.c.evidence')}: {s.evidence}</p>}
      {diffable && (
        <div className="overflow-hidden rounded-xl border border-navy/10">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)] gap-2 bg-navy/5 px-3 py-2 text-xs font-bold text-navy/70 uppercase">
            <span>{t('venues.q.take')}</span><span>{t('venues.q.field')}</span><span>{t('venues.q.current')}</span><span>{t('venues.q.proposed')}</span>
          </div>
          {s.kind === 'new_venue' && <p className="border-t border-navy/10 px-3 py-2 text-xs text-navy/60">{t('venues.q.newRegion', { r: t(`venues.region.${String(s.payload.region)}`) })}</p>}
          {keys.map((k) => (
            <label key={k} className="grid min-h-11 cursor-pointer grid-cols-[44px_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)] items-center gap-2 border-t border-navy/10 px-3 py-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-bronze" checked={!!on[k]} onChange={() => setOn({ ...on, [k]: !on[k] })} />
              <b className="font-semibold">{t(`venues.f.${k}`, { defaultValue: k })}</b>
              <span className="break-words text-navy/60 line-through">{label(k, venue ? (venue as unknown as Record<string, unknown>)[k] : null)}</span>
              <span className="break-words rounded-md bg-gold/15 px-2 py-0.5 font-semibold">{label(k, s.payload[k])}</span>
            </label>
          ))}
        </div>
      )}
      {s.kind === 'report_closed' && <p className="text-sm">{t('venues.q.closedTo', { s: t(`venues.status.${String(s.payload.status)}`) })}</p>}
      {s.kind === 'claim' && (
        <div className="space-y-1 text-sm">
          <p>{t('venues.c.businessName')}: <b>{show(s.payload.business_name)}</b> · {t('venues.c.yourRole')}: {show(s.payload.role)} · {t('venues.c.contactPhone')}: <b>{show(s.payload.contact_phone)}</b></p>
          {s.evidence_path && <button type="button" className="min-h-11 font-semibold underline" onClick={async () => { const w = window.open('', '_blank'); const u = await evidenceUrl(s.evidence_path!); if (w) w.location.href = u; else window.location.href = u }}>{t('venues.q.viewLicence')}</button>}
          <p className="text-xs text-navy/60">{t('venues.q.claimEffect')}</p>
        </div>
      )}
      {!!photos.length && (
        <div className="grid grid-cols-4 gap-2">
          {photos.map((p) => <a key={p.id} href={photoUrl(p.path)} target="_blank" rel="noreferrer"><img src={photoUrl(p.path)} alt={t(`venues.c.tag.${p.tag}`)} className="aspect-square w-full rounded-lg object-cover" /></a>)}
        </div>
      )}
      <Input aria-label={t('venues.q.note')} placeholder={t('venues.q.note')} value={note} onChange={(e) => setNote(e.target.value)} />
      <FormError message={err} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => act('approve')} disabled={review.isPending || (diffable && !picked.length)}>
          <Check className="h-5 w-5" /> {diffable ? t('venues.q.approveN', { n: picked.length, total: keys.length }) : t('venues.q.approve')}
        </Button>
        <Button variant="outline" className="text-red-800" onClick={() => act('reject')} disabled={review.isPending}><X className="h-5 w-5" /> {t('venues.q.reject')}</Button>
        <Button variant="ghost" onClick={() => act('duplicate')} disabled={review.isPending}>{t('venues.q.duplicate')}</Button>
      </div>
    </Section>
  )
}

export function PhotoQueuePage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const q = usePhotoQueue()
  const mod = useModeratePhoto()
  const names = useVenueNames((q.data ?? []).map((p) => p.venue_id))
  const [err, setErr] = useState<string | null>(null)
  if (q.isPending) return <FullPageSpinner />
  const list = q.data ?? []
  async function act(p: Photo, status: 'approved' | 'rejected', cover = false) {
    setErr(null)
    try { const pts = await mod.mutateAsync({ id: p.id, status, cover }); toast(status === 'approved' ? t('venues.q.photoOk', { p: pts }) : t('venues.q.rejected')) } catch (e) { setErr(contribErr(e, t)) }
  }
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Header title={t('venues.q.photosTitle', { n: list.length })} />
      <FormError message={err ?? (q.error ? contribErr(q.error, t) : null)} />
      {!list.length && <p className="rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-navy/60">{t('venues.q.empty')}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <div key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-navy/10 bg-white">
            <a href={photoUrl(p.path)} target="_blank" rel="noreferrer"><img src={photoUrl(p.path)} alt={t(`venues.c.tag.${p.tag}`)} className="aspect-[4/3] w-full object-cover" /></a>
            <div className="space-y-2 p-3">
              <p className="text-sm"><b>{names.data?.[p.venue_id] ?? p.venue_id}</b><br /><span className="text-navy/60">{t(`venues.c.tag.${p.tag}`)} · {fmtDate(p.uploaded_at, i18n.language)}</span></p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => act(p, 'approved')} disabled={mod.isPending}><Check className="h-4 w-4" /> {t('venues.q.approve')}</Button>
                <Button size="sm" variant="outline" onClick={() => act(p, 'approved', true)} disabled={mod.isPending}><Star className="h-4 w-4" /> {t('venues.q.cover')}</Button>
                <Button size="sm" variant="ghost" className="text-red-800" onClick={() => act(p, 'rejected')} disabled={mod.isPending}><X className="h-4 w-4" /> {t('venues.q.reject')}</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
