// Spec 26 · A3 Sửa địa điểm (và Thêm địa điểm) · 5 mục: Thông tin · Máy & dịch vụ · Giá · Trạng thái · Lịch sử
import { useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { cn } from '@/lib/utils'
import { Chip, Section, StickyActions, UnsavedGuard, fmtDate, mapsMessage } from '@/features/courses/parts'
import { useMapsCoords } from '@/features/courses/useMapsCoords'
import {
  PARKING, REGIONS, SVC, VENUE_STATUS, VENUE_TYPES, changedFields, useBrands, useHistory, useRestore, useSaveVenue, useVenue, venueErr,
  type HistoryRow, type PriceRow, type Venue,
} from './api'
import { StatusPill } from './parts'

type Tab = 'info' | 'machine' | 'prices' | 'status' | 'history'
const TABS: Tab[] = ['info', 'machine', 'prices', 'status', 'history']

interface Draft {
  region: string; name: string; type: string; district: string; address: string; maps: string
  phone: string; email: string; web: string; fb_url: string; fb_chain_url: string; fb_chain_name: string; videos: string
  hours: string; late: boolean; machine: string; model: string; software: string; machineNote: string; bays: string
  svc: string[]; parking: string; parking_note: string; residents_only: boolean; prices: PriceRow[]; status: string
  google_rating: string; google_reviews: string
}

const s = (x: unknown) => (x == null ? '' : String(x))

function draftOf(v: Venue | null): Draft {
  return {
    region: v?.region ?? 'hn', name: s(v?.name), type: v?.type ?? '3d', district: s(v?.district), address: s(v?.address),
    maps: v?.lat != null && v?.lng != null ? `${v.lat}, ${v.lng}` : '',
    phone: s(v?.phone), email: s(v?.email), web: s(v?.web), fb_url: s(v?.fb_url), fb_chain_url: s(v?.fb_chain_url), fb_chain_name: s(v?.fb_chain_name),
    videos: (v?.videos ?? []).join('\n'), hours: s(v?.hours), late: !!v?.late, machine: s(v?.machine),
    model: s(v?.machine_detail?.model), software: s(v?.machine_detail?.software), machineNote: s(v?.machine_detail?.note), bays: s(v?.bays),
    svc: [...(v?.svc ?? [])], parking: v?.parking ?? 'unknown', parking_note: s(v?.parking_note), residents_only: !!v?.residents_only,
    prices: (v?.prices ?? []).map((p) => ({ ...p })), status: v?.status ?? 'draft',
    google_rating: s(v?.google_rating), google_reviews: s(v?.google_reviews),
  }
}

const isUrl = (x: string) => /^https?:\/\//i.test(x.trim())

export function VenueEditPage() {
  const { id = '' } = useParams()
  const isNew = id === 'new' || !id
  const venue = useVenue(isNew ? '' : id)
  const { t } = useTranslation()
  if (!isNew && venue.isPending) return <FullPageSpinner />
  if (!isNew && (venue.error || !venue.data)) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <FormError message={venue.error ? venueErr(venue.error, t) : t('common.notFound')} />
        <Link to="/admin/venues" className="font-semibold underline">{t('venues.backToList')}</Link>
      </div>
    )
  }
  return <EditForm key={isNew ? 'new' : venue.dataUpdatedAt} venue={isNew ? null : venue.data!} />
}

function EditForm({ venue }: { venue: Venue | null }) {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const toast = useToast()
  const brands = useBrands()
  const save = useSaveVenue()
  const initial = useMemo(() => draftOf(venue), [venue])
  const [d, setD] = useState<Draft>(initial)
  const [tab, setTab] = useState<Tab>('info')
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const { coords, state: mapsState, approx } = useMapsCoords(d.maps)
  const mapsMsg = mapsMessage(mapsState, coords, t, approx)
  const dirty = !justSaved && JSON.stringify(d) !== JSON.stringify(initial)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))

  async function submit() {
    setError(null)
    if (!d.name.trim()) { setTab('info'); return setError(t('venues.err.needName')) }
    for (const u of [d.web, d.fb_url, d.fb_chain_url]) if (u.trim() && !isUrl(u)) { setTab('info'); return setError(t('venues.err.badUrl')) }
    const videos = d.videos.split('\n').map((x) => x.trim()).filter(Boolean)
    if (videos.length > 4) { setTab('info'); return setError(t('venues.err.tooManyVideos')) }
    if (videos.some((x) => !isUrl(x))) { setTab('info'); return setError(t('venues.err.badUrl')) }
    const bays = d.bays.trim() ? parseInt(d.bays, 10) : null
    if (bays != null && (!Number.isFinite(bays) || bays < 0 || bays > 500)) { setTab('machine'); return setError(t('venues.err.badBays')) }
    const rating = d.google_rating.trim() ? parseFloat(d.google_rating.replace(',', '.')) : null
    const keepCoords = mapsState !== 'ok' && venue && d.maps === initial.maps
    const values: Partial<Venue> = {
      region: d.region as Venue['region'], name: d.name.trim(), type: d.type as Venue['type'], district: d.district.trim() || null, address: d.address.trim() || null,
      lat: keepCoords ? venue!.lat : coords?.lat ?? null, lng: keepCoords ? venue!.lng : coords?.lng ?? null,
      phone: d.phone.trim() || null, email: d.email.trim() || null, web: d.web.trim() || null,
      fb_url: d.fb_url.trim() || null, fb_chain_url: d.fb_chain_url.trim() || null, fb_chain_name: d.fb_chain_name.trim() || null, videos,
      hours: d.hours.trim() || null, late: d.late, machine: d.machine || null,
      machine_detail: Object.fromEntries(Object.entries({ model: d.model.trim(), software: d.software.trim(), note: d.machineNote.trim() }).filter(([, v]) => v)),
      bays, svc: d.svc, parking: d.parking as Venue['parking'], parking_note: d.parking_note.trim() || null, residents_only: d.residents_only,
      prices: d.prices.filter((p) => p.item_vi.trim() || p.price.trim()).map((p) => ({ ...p, item_vi: p.item_vi.trim(), price: p.price.trim() })),
      status: d.status as Venue['status'],
      google_rating: rating != null && Number.isFinite(rating) ? rating : null,
      google_reviews: d.google_reviews.trim() ? parseInt(d.google_reviews, 10) || null : null,
    }
    if (venue && values.region !== venue.region) values.region = venue.region // mã gắn với vùng: không đổi vùng khi đã có mã
    try {
      const v = await save.mutateAsync({ id: venue?.id, values })
      toast(t('common.saved'))
      flushSync(() => setJustSaved(true))
      if (!venue) nav(`/admin/venues/${v.id}`, { replace: true })
    } catch (e) {
      setError(venueErr(e, t))
    }
  }

  const busy = save.isPending || mapsState === 'resolving'

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <UnsavedGuard dirty={dirty} />
      <div className="-mx-4 -mt-6 flex items-center gap-1 bg-navy py-3 pr-4 pl-2 text-white lg:mx-0 lg:mt-0 lg:rounded-2xl">
        <Link to="/admin/venues" aria-label={t('venues.backToList')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-gold">
            {venue ? `${venue.id} · ${t(`venues.type.${venue.type}`)} · ${t(`venues.region.${venue.region}`)}` : t('venues.add')}
          </p>
          <h1 className="truncate text-lg leading-tight font-bold">{d.name || t('venues.newTitle')}</h1>
        </div>
        {venue && <span className="ml-auto"><StatusPill status={venue.status} /></span>}
      </div>

      <div role="tablist" aria-label={t('venues.tabsLabel')} className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.filter((k) => venue || k !== 'history').map((k) => (
          <Chip key={k} role="tab" aria-selected={tab === k} on={tab === k} onClick={() => setTab(k)} className="shrink-0">{t(`venues.tab.${k}`)}</Chip>
        ))}
      </div>

      <FormError message={error} />

      {tab === 'info' && (
        <Section title={t('venues.tab.info')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('venues.f.name')} className="sm:col-span-2"><Input value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label={t('venues.f.type')}>
              <Select value={d.type} onChange={(e) => set('type', e.target.value)}>
                {VENUE_TYPES.map((k) => <option key={k} value={k}>{t(`venues.type.${k}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('venues.f.region')} hint={venue ? t('venues.regionLocked') : undefined}>
              <Select value={d.region} disabled={!!venue} onChange={(e) => set('region', e.target.value)}>
                {REGIONS.map((r) => <option key={r} value={r}>{t(`venues.region.${r}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('venues.f.district')}><Input value={d.district} onChange={(e) => set('district', e.target.value)} /></Field>
            <Field label={t('venues.f.address')}><Input value={d.address} onChange={(e) => set('address', e.target.value)} /></Field>
            <Field label={t('venues.f.maps')} hint={mapsMsg.hint} error={mapsMsg.warn} className="sm:col-span-2">
              <Input value={d.maps} onChange={(e) => set('maps', e.target.value)} inputMode="url" />
            </Field>
            <Field label={t('venues.f.phone')}><Input value={d.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" /></Field>
            <Field label={t('venues.f.email')}><Input value={d.email} onChange={(e) => set('email', e.target.value)} inputMode="email" /></Field>
            <Field label={t('venues.f.web')} className="sm:col-span-2"><Input value={d.web} onChange={(e) => set('web', e.target.value)} inputMode="url" /></Field>
            <Field label={t('venues.f.fb')} className="sm:col-span-2"><Input value={d.fb_url} onChange={(e) => set('fb_url', e.target.value)} inputMode="url" /></Field>
            <Field label={t('venues.f.fbChain')}><Input value={d.fb_chain_url} onChange={(e) => set('fb_chain_url', e.target.value)} inputMode="url" /></Field>
            <Field label={t('venues.f.fbChainName')}><Input value={d.fb_chain_name} onChange={(e) => set('fb_chain_name', e.target.value)} /></Field>
            <Field label={t('venues.f.videos')} hint={t('venues.f.videosHint')} className="sm:col-span-2">
              <Textarea value={d.videos} onChange={(e) => set('videos', e.target.value)} rows={3} />
            </Field>
            <Field label={t('venues.f.googleRating')}><Input value={d.google_rating} onChange={(e) => set('google_rating', e.target.value)} inputMode="decimal" /></Field>
            <Field label={t('venues.f.googleReviews')}><Input value={d.google_reviews} onChange={(e) => set('google_reviews', e.target.value)} inputMode="numeric" /></Field>
          </div>
        </Section>
      )}

      {tab === 'machine' && (
        <Section title={t('venues.tab.machine')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('venues.f.machine')}>
              <Select value={d.machine} onChange={(e) => set('machine', e.target.value)}>
                <option value="">{t('venues.noMachine')}</option>
                {(brands.data ?? []).map((b) => <option key={b.key} value={b.key}>{b.key}</option>)}
              </Select>
            </Field>
            <Field label={t('venues.f.bays')}><Input value={d.bays} onChange={(e) => set('bays', e.target.value)} inputMode="numeric" /></Field>
            <Field label={t('venues.f.model')}><Input value={d.model} onChange={(e) => set('model', e.target.value)} placeholder="Trackman iO, GCQuad, Two Vision NX…" /></Field>
            <Field label={t('venues.f.software')}><Input value={d.software} onChange={(e) => set('software', e.target.value)} placeholder="TPS, FSX Play, GSPro…" /></Field>
            <Field label={t('venues.f.machineNote')} className="sm:col-span-2"><Input value={d.machineNote} onChange={(e) => set('machineNote', e.target.value)} /></Field>
            <Field label={t('venues.f.hours')}><Input value={d.hours} onChange={(e) => set('hours', e.target.value)} placeholder="06:00–22:00 / 24h" /></Field>
            <div className="flex flex-col justify-end">
              <Checkbox label={t('venues.f.late')} checked={d.late} onChange={(e) => set('late', e.target.checked)} />
            </div>
            <Field label={t('venues.f.parking')}>
              <Select value={d.parking} onChange={(e) => set('parking', e.target.value)}>
                {PARKING.map((k) => <option key={k} value={k}>{t(`venues.parking.${k}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('venues.f.parkingNote')}><Input value={d.parking_note} onChange={(e) => set('parking_note', e.target.value)} /></Field>
            <div className="sm:col-span-2">
              <Checkbox label={t('venues.f.residentsOnly')} checked={d.residents_only} onChange={(e) => set('residents_only', e.target.checked)} />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-navy/80">{t('venues.f.svc')}</p>
            <div className="flex flex-wrap gap-2">
              {[...SVC, ...d.svc.filter((x) => !(SVC as readonly string[]).includes(x))].map((k) => {
                const on = d.svc.includes(k)
                return (
                  <Chip key={k} on={on} className="min-h-9 px-3 text-xs" onClick={() => set('svc', on ? d.svc.filter((x) => x !== k) : [...d.svc, k])}>
                    {t(`venues.svc.${k}`, { defaultValue: k })}
                  </Chip>
                )
              })}
            </div>
          </div>
        </Section>
      )}

      {tab === 'prices' && (
        <Section title={t('venues.tab.prices')} aside={<span className="text-sm text-navy/60">{t('venues.pricesHint')}</span>}>
          {d.prices.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-navy/10 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Input aria-label={t('venues.p.item')} placeholder={t('venues.p.item')} value={p.item_vi}
                onChange={(e) => set('prices', d.prices.map((x, j) => (j === i ? { ...x, item_vi: e.target.value } : x)))} />
              <Input aria-label={t('venues.p.price')} placeholder={t('venues.p.price')} value={p.price}
                onChange={(e) => set('prices', d.prices.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
              <Input aria-label={t('venues.p.unit')} placeholder={t('venues.p.unit')} value={p.unit ?? ''}
                onChange={(e) => set('prices', d.prices.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
              <Button variant="ghost" aria-label={t('venues.p.remove')} className="text-red-700" onClick={() => set('prices', d.prices.filter((_, j) => j !== i))}>
                <Trash2 className="h-5 w-5" />
              </Button>
              <Input aria-label={t('venues.p.note')} placeholder={t('venues.p.note')} value={p.note ?? ''} className="sm:col-span-2"
                onChange={(e) => set('prices', d.prices.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
              <Input type="date" aria-label={t('venues.p.verified')} value={p.verified_at ?? ''} className="sm:col-span-2"
                onChange={(e) => set('prices', d.prices.map((x, j) => (j === i ? { ...x, verified_at: e.target.value } : x)))} />
            </div>
          ))}
          {!d.prices.length && <p className="text-sm text-navy/60">{t('venues.noPrices')}</p>}
          <Button variant="outline" onClick={() => set('prices', [...d.prices, { item_vi: '', price: '', unit: t('venues.p.unitDefault'), verified_at: new Date().toISOString().slice(0, 10) }])}>
            <Plus className="h-5 w-5" /> {t('venues.p.add')}
          </Button>
        </Section>
      )}

      {tab === 'status' && (
        <Section title={t('venues.tab.status')}>
          <div className="flex flex-col gap-2">
            {VENUE_STATUS.map((k) => (
              <label key={k} className={cn('flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3', d.status === k ? 'border-bronze bg-gold/10' : 'border-navy/10')}>
                <input type="radio" name="status" className="mt-1 h-5 w-5 accent-bronze" checked={d.status === k} onChange={() => set('status', k)} />
                <span><b>{t(`venues.status.${k}`)}</b><br /><span className="text-sm text-navy/65">{t(`venues.statusHint.${k}`)}</span></span>
              </label>
            ))}
          </div>
        </Section>
      )}

      {tab === 'history' && venue && <HistoryTab venueId={venue.id} lang={i18n.language} />}

      {tab !== 'history' && (
        <StickyActions>
          <Button size="full" onClick={submit} disabled={busy || (!!venue && !dirty)}>
            {save.isPending ? t('venues.saving') : venue ? t('venues.save') : t('venues.create')}
          </Button>
        </StickyActions>
      )}
    </div>
  )
}

function HistoryTab({ venueId, lang }: { venueId: string; lang: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const hist = useHistory(venueId)
  const restore = useRestore(venueId)
  const [ask, setAsk] = useState<HistoryRow | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (hist.isPending) return <FullPageSpinner />
  const list = hist.data ?? []
  return (
    <Section title={t('venues.tab.history')} aside={<span className="text-sm text-navy/60">{t('venues.historyN', { n: list.length })}</span>}>
      <FormError message={err ?? (hist.error ? venueErr(hist.error, t) : null)} />
      <ol className="space-y-2">
        {list.map((h) => {
          const f = h.before ? changedFields(h.before, h.after) : []
          return (
            <li key={h.id} className="flex flex-col gap-1 rounded-xl border border-navy/10 p-3 text-sm">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <b>{t(`venues.src.${h.source}`, { defaultValue: h.source })} · {fmtDate(h.changed_at, lang)} {new Date(h.changed_at).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'vi-VN', { hour: '2-digit', minute: '2-digit' })}</b>
                {h.before && (
                  <Button variant="outline" size="sm" onClick={() => setAsk(h)}><RotateCcw className="h-4 w-4" /> {t('venues.restore')}</Button>
                )}
              </span>
              <span className="text-navy/65">
                {h.before ? (f.length ? f.map((k) => t(`venues.f.${k}`, { defaultValue: k })).join(', ') : t('venues.noFieldChange')) : t('venues.created')}
              </span>
              {f.slice(0, 4).map((k) => (
                <span key={k} className="text-xs text-navy/60">
                  {t(`venues.f.${k}`, { defaultValue: k })}: <s>{short((h.before as Record<string, unknown>)[k])}</s> → <b>{short((h.after as Record<string, unknown> | null)?.[k])}</b>
                </span>
              ))}
            </li>
          )
        })}
      </ol>
      <Dialog open={!!ask} onClose={() => setAsk(null)} title={t('venues.restoreTitle')}>
        <p className="mb-4 text-base">{t('venues.restoreBody')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setAsk(null)}>{t('common.cancel')}</Button>
          <Button disabled={restore.isPending} onClick={async () => {
            setErr(null)
            try { await restore.mutateAsync(ask!.id); toast(t('venues.restored')); setAsk(null) } catch (e) { setErr(venueErr(e, t)); setAsk(null) }
          }}>{t('venues.restore')}</Button>
        </div>
      </Dialog>
    </Section>
  )
}

function short(v: unknown): string {
  if (v == null || v === '') return '∅'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 60 ? s.slice(0, 57) + '…' : s
}
