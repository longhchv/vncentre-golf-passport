// Spec 26 · A1 Tổng quan + A2 Danh sách địa điểm (bản thử: artboard Admin, "Quản trị sân tập – Golf Passport")
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Download, Plus, Tags, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormError, Select } from '@/components/ui/form'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Chip, StickyActions, fmtDate } from '@/features/courses/parts'
import { usePendingCounts } from './contribute/api'
import { REGIONS, VENUE_STATUS, VENUE_TYPES, gaps, useBrands, useVenues, venueErr, type Gap, type Venue } from './api'
import { StatusPill } from './parts'

type GapF = 'all' | Gap

export function VenuesPage() {
  const { t, i18n } = useTranslation()
  const venues = useVenues()
  const brands = useBrands()
  const pending = usePendingCounts()
  const [region, setRegion] = useState<string>('all')
  const [type, setType] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [machine, setMachine] = useState<string>('all')
  const [gap, setGap] = useState<GapF>('all')
  const [q, setQ] = useState('')

  const all = useMemo(() => venues.data ?? [], [venues.data])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return all
      .filter((v) => region === 'all' || v.region === region)
      .filter((v) => type === 'all' || v.type === type)
      .filter((v) => status === 'all' || v.status === status)
      .filter((v) => machine === 'all' || (machine === 'none' ? !v.machine : v.machine === machine))
      .filter((v) => gap === 'all' || gaps(v).includes(gap))
      .filter((v) => !s || [v.id, v.name, v.district, v.address].some((x) => x?.toLowerCase().includes(s)))
  }, [all, region, type, status, machine, gap, q])

  if (venues.isPending) return <FullPageSpinner />

  const shown = all.filter((v) => v.status === 'active' || v.status === 'closed_temp')
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
  const sims = shown.filter((v) => v.type === '3d' || v.type === 'academy')
  const coverage = [
    { k: 'machine', n: sims.filter((v) => v.machine).length, d: sims.length },
    { k: 'price', n: shown.filter((v) => v.prices?.length).length, d: shown.length },
    { k: 'phone', n: shown.filter((v) => v.phone).length, d: shown.length },
    { k: 'fb', n: shown.filter((v) => v.fb_url || v.fb_chain_url).length, d: shown.length },
  ]

  async function exportXlsx() {
    const XLSX = await import('xlsx')
    const rowsX = list.map((v: Venue) => ({
      [t('venues.f.id')]: v.id, [t('venues.f.name')]: v.name, [t('venues.f.region')]: t(`venues.region.${v.region}`),
      [t('venues.f.type')]: t(`venues.type.${v.type}`), [t('venues.f.district')]: v.district ?? '', [t('venues.f.address')]: v.address ?? '',
      [t('venues.f.phone')]: v.phone ?? '', [t('venues.f.machine')]: v.machine ?? '', [t('venues.f.hours')]: v.hours ?? '',
      [t('venues.f.fb')]: v.fb_url ?? v.fb_chain_url ?? '', [t('venues.f.status')]: t(`venues.status.${v.status}`),
      [t('venues.f.lat')]: v.lat ?? '', [t('venues.f.lng')]: v.lng ?? '', [t('venues.updatedCol')]: fmtDate(v.updated_at, i18n.language),
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsX), 'Venues')
    XLSX.writeFile(wb, `san-tap-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="-mx-4 -mt-6 bg-navy px-5 pt-5 pb-4 text-white lg:mx-0 lg:mt-0 lg:rounded-2xl">
        <p className="text-xs font-semibold tracking-wider text-gold uppercase">{t('venues.eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold">{t('venues.title')}</h1>
        <p className="mt-1 text-sm text-white/75">{t('venues.count', { n: all.length, s: shown.length })}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/admin/venues/queue" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-bold text-navy hover:bg-gold/90">{t('venues.q.nav', { n: pending.data?.subs ?? 0 })}</Link>
          <Link to="/admin/venues/photos" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-bold text-navy hover:bg-gold/90">{t('venues.q.navPhotos', { n: pending.data?.photos ?? 0 })}</Link>
          <Link to="/admin/venues/brands" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold hover:bg-white/20"><Tags className="h-4 w-4" /> {t('venues.brands.title')}</Link>
          <Link to="/admin/venues/import" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold hover:bg-white/20"><Upload className="h-4 w-4" /> {t('venues.import.title')}</Link>
        </div>
      </div>

      <FormError message={venues.error ? venueErr(venues.error, t) : null} />

      {!!all.length && (
        <section className="space-y-3 rounded-2xl border border-navy/10 bg-white p-4">
          <h2 className="text-base font-bold">{t('venues.coverage', { n: shown.length })}</h2>
          {coverage.map((c) => (
            <div key={c.k} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0">{t(`venues.cov.${c.k}`)}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-navy/8">
                <div className="h-full rounded-full bg-bronze" style={{ width: `${pct(c.n, c.d)}%` }} />
              </div>
              <b className="w-28 shrink-0 text-right whitespace-nowrap">{c.n}/{c.d} · {pct(c.n, c.d)}%</b>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2 pt-1 sm:grid-cols-6">
            {REGIONS.map((r) => (
              <button key={r} type="button" onClick={() => setRegion(region === r ? 'all' : r)} aria-pressed={region === r}
                className={'flex min-h-14 flex-col items-center justify-center rounded-xl border text-sm ' + (region === r ? 'border-navy bg-navy text-white' : 'border-navy/10 bg-cream')}>
                <b className="text-lg">{all.filter((v) => v.region === r).length}</b>
                <span className="text-xs">{t(`venues.region.${r}`)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(['all', 'machine', 'price', 'phone', 'fb'] as GapF[]).map((k) => (
            <Chip key={k} on={gap === k} onClick={() => setGap(k)} className="min-h-9 px-3 text-xs">{t(`venues.gap.${k}`)}</Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select aria-label={t('venues.f.type')} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">{t('venues.allTypes')}</option>
            {VENUE_TYPES.map((k) => <option key={k} value={k}>{t(`venues.type.${k}`)}</option>)}
          </Select>
          <Select aria-label={t('venues.f.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">{t('venues.allStatus')}</option>
            {VENUE_STATUS.map((k) => <option key={k} value={k}>{t(`venues.status.${k}`)}</option>)}
          </Select>
          <Select aria-label={t('venues.f.machine')} value={machine} onChange={(e) => setMachine(e.target.value)}>
            <option value="all">{t('venues.allMachines')}</option>
            <option value="none">{t('venues.noMachine')}</option>
            {(brands.data ?? []).map((b) => <option key={b.key} value={b.key}>{b.key}</option>)}
          </Select>
          <Select aria-label={t('venues.f.region')} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="all">{t('venues.allRegions')}</option>
            {REGIONS.map((r) => <option key={r} value={r}>{t(`venues.region.${r}`)}</option>)}
          </Select>
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('venues.searchPh')} aria-label={t('common.search')}
          className="min-h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-base" />
        <p className="text-sm text-navy/60">{t('venues.matchN', { n: list.length })}</p>
      </div>

      <div className="space-y-2">
        {list.slice(0, 300).map((v) => {
          const g = gaps(v)
          return (
            <Link key={v.id} to={`/admin/venues/${v.id}`} className="flex flex-col gap-1 rounded-2xl border border-navy/10 bg-white px-4 py-3 shadow-sm hover:border-bronze/50">
              <span className="flex flex-wrap items-center gap-1.5 text-xs">
                <StatusPill status={v.status} />
                <span className="rounded-md bg-navy/6 px-2 py-0.5 font-semibold">{t(`venues.type.${v.type}`)}</span>
                <span className="text-navy/60">{v.id} · {[v.district, t(`venues.region.${v.region}`)].filter(Boolean).join(', ')}</span>
              </span>
              <span className="text-[17px] font-semibold">{v.name}</span>
              <span className="text-sm text-navy/65">
                {v.machine ? t('venues.machineIs', { m: v.machine }) : (v.type === '3d' || v.type === 'academy') ? t('venues.noMachine') : ''}
                {g.length ? <span className="text-red-800"> · {t('venues.missing', { list: g.map((x) => t(`venues.gapShort.${x}`)).join(', ') })}</span> : null}
              </span>
            </Link>
          )
        })}
        {list.length > 300 && <p className="text-center text-sm text-navy/60">{t('venues.narrow')}</p>}
        {!list.length && (
          <p className="rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-navy/60">
            {all.length ? t('venues.noMatch') : t('venues.empty')}
          </p>
        )}
      </div>

      <StickyActions>
        <Button variant="outline" onClick={exportXlsx} disabled={!list.length}><Download className="h-5 w-5" /> {t('venues.export')}</Button>
        <Button asChild size="full"><Link to="/admin/venues/new"><Plus className="h-5 w-5" /> {t('venues.add')}</Link></Button>
      </StickyActions>
    </div>
  )
}
