// Spec 27 · U1–U4, U6: người dùng Golf Passport góp thông tin sân tập & phòng 3D (tapgolf.vncentre.net)
import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Camera, ChevronLeft, ExternalLink, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/compressImage'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { Chip, Section, fmtDate, mapsMessage } from '@/features/courses/parts'
import { useMapsCoords } from '@/features/courses/useMapsCoords'
import { PARKING, REGIONS, VENUE_TYPES, useBrands, type PriceRow } from '../api'
import {
  PHOTO_TAGS, contribErr, uploadPhotos, useMyPoints, useMySubmissions, usePublicVenue, useSubmit, useVenueNames,
  type PhotoTag, type PublicVenue, type SubStatus,
} from './api'

export const TAPGOLF = 'https://tapgolf.vncentre.net'

/** Bắt buộc đăng nhập Golf Passport; quay lại đúng trang sau khi đăng nhập. */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}

export function Shell({ title, sub, back, children }: { title: string; sub?: string; back?: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-dvh bg-cream">
      <div className="bg-navy text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-1 px-2 py-3">
          <a href={back ?? TAPGOLF} aria-label={t('venues.c.back')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
            <ChevronLeft className="h-6 w-6" />
          </a>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-gold uppercase">VNC Golf Passport · TapGolf</p>
            <h1 className="truncate text-lg leading-tight font-bold">{title}</h1>
            {sub && <p className="truncate text-sm text-white/75">{sub}</p>}
          </div>
        </div>
      </div>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5">{children}</main>
    </div>
  )
}

function Done({ text }: { text: string }) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-navy/10 bg-white px-5 py-8 text-center">
      <p className="text-lg font-bold">{t('venues.c.sentTitle')}</p>
      <p className="text-navy/70">{text}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline"><Link to="/venues/mine">{t('venues.c.mine')}</Link></Button>
        <Button asChild variant="ghost"><a href={TAPGOLF}>{t('venues.c.backToSite')}</a></Button>
      </div>
    </section>
  )
}

// ── Ảnh kèm theo (dùng chung) ───────────────────────────────────────────
interface Pick { file: File; tag: PhotoTag; url: string }
function PhotoPicker({ items, onChange, defaultTag = 'other', max = 10 }: { items: Pick[]; onChange: (p: Pick[]) => void; defaultTag?: PhotoTag; max?: number }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy/20 bg-white px-4 text-sm font-semibold text-navy/80">
        <Camera className="h-5 w-5" /> {t('venues.c.pickPhotos', { n: max })}
        <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => {
          const fs = [...(e.target.files ?? [])].slice(0, max - items.length)
          onChange([...items, ...fs.map((file) => ({ file, tag: defaultTag, url: URL.createObjectURL(file) }))])
          e.target.value = ''
        }} />
      </label>
      {!!items.length && (
        <div className="grid grid-cols-3 gap-2">
          {items.map((p, i) => (
            <div key={p.url} className="flex flex-col gap-1">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-navy/5">
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button type="button" aria-label={t('venues.c.removePhoto')} onClick={() => onChange(items.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-red-700"><Trash2 className="h-4 w-4" /></button>
              </div>
              <Select aria-label={t('venues.c.photoTag')} value={p.tag} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, tag: e.target.value as PhotoTag } : x)))} className="min-h-9 text-xs">
                {PHOTO_TAGS.map((k) => <option key={k} value={k}>{t(`venues.c.tag.${k}`)}</option>)}
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
function Consent({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-gold/40 bg-gold/10 p-3">
      <Checkbox label={t('venues.c.consent')} checked={on} onChange={(e) => set(e.target.checked)} />
    </div>
  )
}

// ── U3 · Đề xuất sửa / báo đóng cửa ─────────────────────────────────────
interface SDraft { phone: string; hours: string; address: string; district: string; web: string; fb_url: string; machine: string; model: string; software: string; bays: string; parking: string; priceItem: string; priceValue: string; priceUnit: string }
function sdraft(v: PublicVenue): SDraft {
  return {
    phone: v.phone ?? '', hours: v.hours ?? '', address: v.address ?? '', district: v.district ?? '', web: v.web ?? '', fb_url: v.fb_url ?? '',
    machine: v.machine ?? '', model: v.machine_detail?.model ?? '', software: v.machine_detail?.software ?? '', bays: v.bays == null ? '' : String(v.bays),
    parking: v.parking ?? 'unknown', priceItem: '', priceValue: '', priceUnit: '',
  }
}

export function SuggestPage() {
  return <RequireSignIn><SuggestInner /></RequireSignIn>
}
function SuggestInner() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const v = usePublicVenue(id)
  if (v.isPending) return <FullPageSpinner />
  if (!v.data) return <Shell title={t('venues.c.suggestTitle')}><FormError message={contribErr(v.error ?? 'venue_not_found', t)} /></Shell>
  return <SuggestForm v={v.data} />
}
function SuggestForm({ v }: { v: PublicVenue }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const brands = useBrands()
  const submit = useSubmit()
  const init = useMemo(() => sdraft(v), [v])
  const [d, setD] = useState(init)
  const [closed, setClosed] = useState<'' | 'closed_temp' | 'closed'>('')
  const [evidence, setEvidence] = useState('')
  const [photos, setPhotos] = useState<Pick[]>([])
  const [consent, setConsent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const set = (k: keyof SDraft, val: string) => setD((x) => ({ ...x, [k]: val }))
  const ch = (k: keyof SDraft) => d[k] !== init[k]
  const hl = (k: keyof SDraft) => (ch(k) ? 'border-2 border-gold bg-gold/10' : '')

  function payload() {
    const p: Record<string, unknown> = {}
    for (const k of ['phone', 'hours', 'address', 'district', 'web', 'fb_url', 'machine', 'parking'] as const) if (ch(k)) p[k] = d[k].trim() || null
    if (ch('bays')) p.bays = d.bays.trim() ? parseInt(d.bays, 10) : null
    if (ch('model') || ch('software')) p.machine_detail = { ...(v.machine_detail ?? {}), model: d.model.trim() || undefined, software: d.software.trim() || undefined }
    if (d.priceItem.trim() && d.priceValue.trim()) {
      const row: PriceRow = { item_vi: d.priceItem.trim(), price: d.priceValue.trim(), unit: d.priceUnit.trim() || undefined, verified_at: new Date().toISOString().slice(0, 10) }
      p.prices = [...(v.prices ?? []), row]
    }
    return p
  }
  const changed = Object.keys(payload()).length

  async function send() {
    setErr(null)
    if (!changed && !closed) return setErr(t('venues.c.err.nothing_changed'))
    if (photos.length && !consent) return setErr(t('venues.c.needConsent'))
    if (d.bays.trim() && !/^\d{1,3}$/.test(d.bays.trim())) return setErr(t('venues.err.badBays'))
    setBusy(true)
    try {
      let subId: string | null = null
      if (changed) subId = await submit.mutateAsync({ kind: 'edit', venueId: v.id, payload: payload(), evidence })
      if (closed) await submit.mutateAsync({ kind: 'report_closed', venueId: v.id, payload: { status: closed }, evidence })
      if (photos.length) await uploadPhotos(session!.user.id, v.id, photos, subId ?? undefined)
      setDone(true)
    } catch (e) { setErr(contribErr(e, t)) } finally { setBusy(false) }
  }

  if (done) return <Shell title={t('venues.c.suggestTitle')} sub={v.name}><Done text={t('venues.c.sentBody')} /></Shell>
  return (
    <Shell title={t('venues.c.suggestTitle')} sub={v.name} back={`${TAPGOLF}/#/${v.id}`}>
      <p className="text-sm text-navy/70">{t('venues.c.suggestHint')}</p>
      <Section title={t('venues.tab.info')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('venues.f.phone')}><Input className={hl('phone')} value={d.phone} inputMode="tel" onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label={t('venues.f.hours')}><Input className={hl('hours')} value={d.hours} onChange={(e) => set('hours', e.target.value)} placeholder="06:00–22:00" /></Field>
          <Field label={t('venues.f.address')} className="sm:col-span-2"><Input className={hl('address')} value={d.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label={t('venues.f.district')}><Input className={hl('district')} value={d.district} onChange={(e) => set('district', e.target.value)} /></Field>
          <Field label={t('venues.f.parking')}>
            <Select className={hl('parking')} value={d.parking} onChange={(e) => set('parking', e.target.value)}>
              {PARKING.map((k) => <option key={k} value={k}>{t(`venues.parking.${k}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('venues.f.web')}><Input className={hl('web')} value={d.web} inputMode="url" onChange={(e) => set('web', e.target.value)} /></Field>
          <Field label={t('venues.f.fb')}><Input className={hl('fb_url')} value={d.fb_url} inputMode="url" onChange={(e) => set('fb_url', e.target.value)} /></Field>
        </div>
      </Section>
      <Section title={t('venues.tab.machine')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('venues.f.machine')}>
            <Select className={hl('machine')} value={d.machine} onChange={(e) => set('machine', e.target.value)}>
              <option value="">{t('venues.noMachine')}</option>
              {(brands.data ?? []).map((b) => <option key={b.key} value={b.key}>{b.key}</option>)}
            </Select>
          </Field>
          <Field label={t('venues.f.bays')}><Input className={hl('bays')} value={d.bays} inputMode="numeric" onChange={(e) => set('bays', e.target.value)} /></Field>
          <Field label={t('venues.f.model')}><Input className={hl('model')} value={d.model} onChange={(e) => set('model', e.target.value)} /></Field>
          <Field label={t('venues.f.software')}><Input className={hl('software')} value={d.software} onChange={(e) => set('software', e.target.value)} /></Field>
        </div>
        <p className="text-xs text-navy/60">{t('venues.c.machinePhotoHint')}</p>
      </Section>
      <Section title={t('venues.c.addPrice')}>
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <Input aria-label={t('venues.p.item')} placeholder={t('venues.p.item')} value={d.priceItem} onChange={(e) => set('priceItem', e.target.value)} />
          <Input aria-label={t('venues.p.price')} placeholder={t('venues.p.price')} value={d.priceValue} onChange={(e) => set('priceValue', e.target.value)} />
          <Input aria-label={t('venues.p.unit')} placeholder={t('venues.p.unit')} value={d.priceUnit} onChange={(e) => set('priceUnit', e.target.value)} />
        </div>
        {!!v.prices?.length && <p className="text-xs text-navy/60">{t('venues.c.currentPrices', { list: v.prices.map((p) => `${p.item_vi}: ${p.price}`).join(' · ') })}</p>}
      </Section>
      <Section title={t('venues.c.statusTitle')}>
        <div className="flex flex-wrap gap-2">
          {(['', 'closed_temp', 'closed'] as const).map((k) => (
            <Chip key={k || 'open'} on={closed === k} onClick={() => setClosed(k)}>{t(`venues.c.closed.${k || 'open'}`)}</Chip>
          ))}
        </div>
      </Section>
      <Section title={t('venues.c.photosTitle')}>
        <PhotoPicker items={photos} onChange={setPhotos} defaultTag="simulator" max={5} />
        {!!photos.length && <Consent on={consent} set={setConsent} />}
      </Section>
      <Field label={t('venues.c.evidence')} hint={t('venues.c.evidenceHint')}>
        <Textarea value={evidence} rows={2} onChange={(e) => setEvidence(e.target.value)} />
      </Field>
      <FormError message={err} />
      <Button size="full" onClick={send} disabled={busy}>{busy ? t('venues.c.sending') : t('venues.c.send', { n: changed + (closed ? 1 : 0) })}</Button>
    </Shell>
  )
}

// ── U2 · Thêm địa điểm mới ──────────────────────────────────────────────
export function NewVenuePage() {
  return <RequireSignIn><NewVenueForm /></RequireSignIn>
}
function NewVenueForm() {
  const { t } = useTranslation()
  const brands = useBrands()
  const submit = useSubmit()
  const [d, setD] = useState({ name: '', type: '3d', region: 'hn', district: '', address: '', maps: '', phone: '', fb_url: '', machine: '', hours: '' })
  const [evidence, setEvidence] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const { coords, state, approx } = useMapsCoords(d.maps)
  const mm = mapsMessage(state, coords, t, approx)
  const set = (k: keyof typeof d, val: string) => setD((x) => ({ ...x, [k]: val }))

  async function send() {
    setErr(null)
    if (!d.name.trim()) return setErr(t('venues.err.needName'))
    if (!coords) return setErr(t('venues.c.needMap'))
    setBusy(true)
    try {
      const payload: Record<string, unknown> = { name: d.name.trim(), type: d.type, region: d.region, lat: coords.lat, lng: coords.lng }
      for (const k of ['district', 'address', 'phone', 'fb_url', 'machine', 'hours'] as const) if (d[k].trim()) payload[k] = d[k].trim()
      await submit.mutateAsync({ kind: 'new_venue', venueId: null, payload, evidence })
      setDone(true)
    } catch (e) { setErr(contribErr(e, t)) } finally { setBusy(false) }
  }

  if (done) return <Shell title={t('venues.c.newTitle')}><Done text={t('venues.c.newSent')} /></Shell>
  return (
    <Shell title={t('venues.c.newTitle')}>
      <p className="text-sm text-navy/70">{t('venues.c.newHint')}</p>
      <Section title={t('venues.tab.info')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('venues.f.name')} className="sm:col-span-2"><Input value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label={t('venues.f.type')}>
            <Select value={d.type} onChange={(e) => set('type', e.target.value)}>{VENUE_TYPES.map((k) => <option key={k} value={k}>{t(`venues.type.${k}`)}</option>)}</Select>
          </Field>
          <Field label={t('venues.f.region')}>
            <Select value={d.region} onChange={(e) => set('region', e.target.value)}>{REGIONS.map((r) => <option key={r} value={r}>{t(`venues.region.${r}`)}</option>)}</Select>
          </Field>
          <Field label={t('venues.f.maps')} hint={mm.hint ?? t('venues.c.mapHint')} error={mm.warn} className="sm:col-span-2">
            <Input value={d.maps} inputMode="url" onChange={(e) => set('maps', e.target.value)} />
          </Field>
          <Field label={t('venues.f.district')}><Input value={d.district} onChange={(e) => set('district', e.target.value)} /></Field>
          <Field label={t('venues.f.address')}><Input value={d.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label={t('venues.f.phone')}><Input value={d.phone} inputMode="tel" onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label={t('venues.f.hours')}><Input value={d.hours} onChange={(e) => set('hours', e.target.value)} /></Field>
          <Field label={t('venues.f.fb')}><Input value={d.fb_url} inputMode="url" onChange={(e) => set('fb_url', e.target.value)} /></Field>
          <Field label={t('venues.f.machine')}>
            <Select value={d.machine} onChange={(e) => set('machine', e.target.value)}>
              <option value="">{t('venues.noMachine')}</option>
              {(brands.data ?? []).map((b) => <option key={b.key} value={b.key}>{b.key}</option>)}
            </Select>
          </Field>
        </div>
      </Section>
      <Field label={t('venues.c.evidence')} hint={t('venues.c.evidenceHint')}>
        <Textarea value={evidence} rows={2} onChange={(e) => setEvidence(e.target.value)} />
      </Field>
      <p className="text-xs text-navy/60">{t('venues.c.newPhotosLater')}</p>
      <FormError message={err} />
      <Button size="full" onClick={send} disabled={busy || state === 'resolving'}>{busy ? t('venues.c.sending') : t('venues.c.sendNew')}</Button>
    </Shell>
  )
}

// ── U4 · Gửi ảnh ────────────────────────────────────────────────────────
export function PhotosPage() {
  return <RequireSignIn><PhotosInner /></RequireSignIn>
}
function PhotosInner() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { session } = useAuth()
  const v = usePublicVenue(id)
  const [photos, setPhotos] = useState<Pick[]>([])
  const [consent, setConsent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  if (v.isPending) return <FullPageSpinner />
  if (!v.data) return <Shell title={t('venues.c.photosTitle')}><FormError message={contribErr(v.error ?? 'venue_not_found', t)} /></Shell>
  async function send() {
    setErr(null)
    if (!photos.length) return setErr(t('venues.c.needPhoto'))
    if (!consent) return setErr(t('venues.c.needConsent'))
    setBusy(true)
    try { await uploadPhotos(session!.user.id, id, photos); setDone(true) } catch (e) { setErr(contribErr(e, t)) } finally { setBusy(false) }
  }
  if (done) return <Shell title={t('venues.c.photosTitle')} sub={v.data.name}><Done text={t('venues.c.photosSent', { n: photos.length })} /></Shell>
  return (
    <Shell title={t('venues.c.photosTitle')} sub={v.data.name} back={`${TAPGOLF}/#/${id}`}>
      <PhotoPicker items={photos} onChange={setPhotos} />
      <Consent on={consent} set={setConsent} />
      <FormError message={err} />
      <Button size="full" onClick={send} disabled={busy}>{busy ? t('venues.c.sending') : t('venues.c.sendPhotos', { n: photos.length })}</Button>
    </Shell>
  )
}

// ── Nhận trang (chủ sân) ────────────────────────────────────────────────
export function ClaimPage() {
  return <RequireSignIn><ClaimInner /></RequireSignIn>
}
function ClaimInner() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { session } = useAuth()
  const v = usePublicVenue(id)
  const submit = useSubmit()
  const [f, setF] = useState({ business_name: '', role: '', contact_phone: '' })
  const [evidence, setEvidence] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  if (v.isPending) return <FullPageSpinner />
  if (!v.data) return <Shell title={t('venues.c.claimTitle')}><FormError message={contribErr(v.error ?? 'venue_not_found', t)} /></Shell>
  async function send() {
    setErr(null)
    if (!f.business_name.trim() || !f.contact_phone.trim()) return setErr(t('venues.c.claimNeed'))
    if (!file && !evidence.trim()) return setErr(t('venues.c.err.claim_needs_evidence'))
    setBusy(true)
    try {
      let path: string | null = null
      if (file) {
        const blob = await compressImage(file, 1_000_000, 1600)
        path = `${session!.user.id}/claim-${crypto.randomUUID()}.jpg`
        const { error } = await supabase!.storage.from('venue-private').upload(path, blob, { contentType: 'image/jpeg' })
        if (error) throw error
      }
      await submit.mutateAsync({ kind: 'claim', venueId: id, payload: f, evidence, evidencePath: path })
      setDone(true)
    } catch (e) { setErr(contribErr(e, t)) } finally { setBusy(false) }
  }
  if (done) return <Shell title={t('venues.c.claimTitle')} sub={v.data.name}><Done text={t('venues.c.claimSent')} /></Shell>
  return (
    <Shell title={t('venues.c.claimTitle')} sub={v.data.name} back={`${TAPGOLF}/#/${id}`}>
      {v.data.claimed && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('venues.c.alreadyClaimed')}</p>}
      <p className="text-sm text-navy/70">{t('venues.c.claimHint')}</p>
      <Section title={t('venues.c.claimTitle')}>
        <Field label={t('venues.c.businessName')}><Input value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} /></Field>
        <Field label={t('venues.c.yourRole')}><Input value={f.role} placeholder={t('venues.c.rolePh')} onChange={(e) => setF({ ...f, role: e.target.value })} /></Field>
        <Field label={t('venues.c.contactPhone')}><Input value={f.contact_phone} inputMode="tel" onChange={(e) => setF({ ...f, contact_phone: e.target.value })} /></Field>
        <Field label={t('venues.c.licence')} hint={t('venues.c.licenceHint')}>
          <input type="file" accept="image/*" className="min-h-12 text-base" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label={t('venues.c.evidence')} hint={t('venues.c.claimEvidenceHint')}>
          <Textarea value={evidence} rows={2} onChange={(e) => setEvidence(e.target.value)} />
        </Field>
      </Section>
      <FormError message={err} />
      <Button size="full" onClick={send} disabled={busy}>{busy ? t('venues.c.sending') : t('venues.c.sendClaim')}</Button>
    </Shell>
  )
}

// ── U6 · Đóng góp của tôi ───────────────────────────────────────────────
const TONE: Record<SubStatus | 'rejected_photo', string> = {
  pending: 'bg-amber-100 text-amber-900', approved: 'bg-emerald-100 text-emerald-800', partly_approved: 'bg-sky-100 text-sky-900',
  rejected: 'bg-red-100 text-red-800', duplicate: 'bg-navy/8 text-navy/70', rejected_photo: 'bg-red-100 text-red-800',
}
export function MinePage() {
  return <RequireSignIn><MineInner /></RequireSignIn>
}
function MineInner() {
  const { t, i18n } = useTranslation()
  const mine = useMySubmissions()
  const pts = useMyPoints()
  const { hasRole } = useAuth()
  const names = useVenueNames([...(mine.data?.subs ?? []).map((s) => s.result_venue_id ?? s.venue_id ?? ''), ...(mine.data?.photos ?? []).map((p) => p.venue_id)])
  if (mine.isPending) return <FullPageSpinner />
  const total = (pts.data ?? []).reduce((a, p) => a + p.points, 0)
  const nm = (id: string | null) => (id && names.data?.[id]) || id || ''
  const photoGroups = Object.values((mine.data?.photos ?? []).filter((p) => !p.submission_id).reduce<Record<string, { venue: string; n: number; ok: number; pending: number }>>((acc, p) => {
    const g = (acc[p.venue_id] ??= { venue: p.venue_id, n: 0, ok: 0, pending: 0 })
    g.n++; if (p.status === 'approved') g.ok++; if (p.status === 'pending') g.pending++
    return acc
  }, {}))
  return (
    <Shell title={t('venues.c.mine')}>
      <FormError message={mine.error ? contribErr(mine.error, t) : null} />
      <section className="rounded-2xl bg-navy p-4 text-white">
        <p className="text-xs font-semibold tracking-wider text-gold uppercase">{t('venues.c.pointsTitle')}</p>
        <p className="text-3xl font-bold">{total} <span className="text-base font-medium text-white/75">{t('venues.c.pointsUnit')}</span></p>
        <p className="text-sm text-white/75">{t('venues.c.pointsHint')}</p>
      </section>
      {(hasRole('venue_surveyor') || hasRole('admin')) && <Button asChild><Link to="/venues/survey">{t('venues.s.myTitle')}</Link></Button>}
      {(mine.data?.subs ?? []).map((s) => (
        <div key={s.id} className="flex flex-col gap-1 rounded-2xl border border-navy/10 bg-white px-4 py-3">
          <span className="flex items-center justify-between gap-2">
            <b>{t(`venues.c.kind.${s.kind}`)}</b>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[s.status]}`}>{t(`venues.c.st.${s.status}`)}</span>
          </span>
          <span className="text-sm text-navy/70">{nm(s.result_venue_id ?? s.venue_id) || String(s.payload.name ?? '')} · {fmtDate(s.submitted_at, i18n.language)}</span>
          {s.status === 'partly_approved' && <span className="text-xs text-navy/60">{t('venues.c.applied', { list: s.applied_fields.map((k) => t(`venues.f.${k}`, { defaultValue: k })).join(', ') })}</span>}
          {s.review_note && <span className="rounded-lg bg-cream px-3 py-2 text-sm">{t('venues.c.note')}: {s.review_note}</span>}
        </div>
      ))}
      {photoGroups.map((g) => (
        <div key={g.venue} className="flex items-center justify-between gap-2 rounded-2xl border border-navy/10 bg-white px-4 py-3 text-sm">
          <span><b>{t('venues.c.photoBatch', { n: g.n })}</b> · {nm(g.venue)}</span>
          <span className="text-navy/70">{t('venues.c.photoStat', { ok: g.ok, pending: g.pending })}</span>
        </div>
      ))}
      {!mine.data?.subs.length && !photoGroups.length && (
        <p className="rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-navy/60">{t('venues.c.mineEmpty')}</p>
      )}
      <Button asChild variant="outline"><a href={TAPGOLF}><ExternalLink className="h-4 w-4" /> {t('venues.c.backToSite')}</a></Button>
    </Shell>
  )
}

