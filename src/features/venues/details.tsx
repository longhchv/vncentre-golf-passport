// Spec 29 · GĐ1 Thông tin chi tiết sân tập / phòng 3D — kiểu dữ liệu + bộ nhập dùng chung cho admin, khảo sát viên, chủ sân.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Chip } from '@/features/courses/parts'
import { cn } from '@/lib/utils'

export const SLOTS = ['early', 'morning', 'noon', 'afternoon', 'evening', 'late'] as const
export const FIT_TAGS = ['noon', 'early', 'after_work', 'kids_mall', 'group', 'foreigners'] as const
export const LANGS = ['en', 'ko', 'ja', 'zh'] as const
export const SIM_UNITS = ['hour_room', 'hour_person', 'round', 'other'] as const
export const RANGE_KINDS = ['balls', 'hour', 'unlimited', 'month', 'lesson', 'other'] as const
export const SURFACES = ['unknown', 'mat', 'grass', 'both'] as const

type Tri = boolean | null | undefined
export interface SimRate { brand: string; model?: string; bays?: number | null; unit?: (typeof SIM_UNITS)[number]; weekday?: number | null; weekend?: number | null; note?: string }
export interface RangeRate { kind: (typeof RANGE_KINDS)[number]; label?: string; balls?: number | null; weekday?: number | null; weekend?: number | null; note?: string }
export interface Promo { title: string; detail?: string; until?: string; url?: string }
export interface Coach { name: string; title?: string; src: string }
export interface VenueDetails {
  highlight_vi: string | null; highlight_en: string | null
  sim_rates: SimRate[]; range_rates: RangeRate[]
  club_rental: { available?: Tri; price?: number | null; note?: string }
  promos: Promo[]
  academy: { has?: Tri; name?: string; note?: string }
  coaches: Coach[]
  busy: { quiet?: string[]; busy?: string[]; note?: string }
  kids: { junior_clubs?: Tri; junior_class?: Tri; min_age?: number | null; note?: string }
  shop: { apparel?: Tri; accessories?: Tri; clubs?: Tri; fitting?: Tri; note?: string }
  facilities: { waiting_area?: Tri; vip_room?: Tri; surface?: (typeof SURFACES)[number]; covered?: Tri; note?: string }
  languages: string[]; fit_tags: string[]
}
/** Trường nội bộ chỉ admin thấy (không lên web). */
export interface VenueInternal { needs_survey: string[]; info_sources: Record<string, { src?: string; url?: string; at?: string }> }

export const DETAIL_FIELDS = ['highlight_vi', 'highlight_en', 'sim_rates', 'range_rates', 'club_rental', 'promos', 'academy', 'coaches',
  'busy', 'kids', 'shop', 'facilities', 'languages', 'fit_tags'] as const
export type DetailField = (typeof DETAIL_FIELDS)[number]

export function detailsOf(v: Partial<VenueDetails> | null | undefined): VenueDetails {
  return {
    highlight_vi: v?.highlight_vi ?? null, highlight_en: v?.highlight_en ?? null,
    sim_rates: v?.sim_rates ?? [], range_rates: v?.range_rates ?? [], club_rental: v?.club_rental ?? {}, promos: v?.promos ?? [],
    academy: v?.academy ?? {}, coaches: v?.coaches ?? [], busy: v?.busy ?? {}, kids: v?.kids ?? {}, shop: v?.shop ?? {},
    facilities: v?.facilities ?? {}, languages: v?.languages ?? [], fit_tags: v?.fit_tags ?? [],
  }
}

const str = (s?: string | null) => (s ?? '').trim() || undefined
const obj = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined && x !== null && x !== '')) as T

/** Chuẩn hoá trước khi lưu: bỏ dòng trống, bỏ khoá rỗng. */
export function cleanDetails(d: VenueDetails): VenueDetails {
  return {
    highlight_vi: str(d.highlight_vi) ?? null, highlight_en: str(d.highlight_en) ?? null,
    sim_rates: d.sim_rates.filter((r) => r.brand.trim()).map((r) => obj({ ...r, brand: r.brand.trim(), model: str(r.model), note: str(r.note) })),
    range_rates: d.range_rates.filter((r) => r.label?.trim() || r.weekday != null || r.weekend != null).map((r) => obj({ ...r, label: str(r.label), note: str(r.note) })),
    club_rental: obj({ ...d.club_rental, note: str(d.club_rental.note) }),
    promos: d.promos.filter((p) => p.title.trim()).map((p) => obj({ title: p.title.trim(), detail: str(p.detail), until: str(p.until), url: str(p.url) })),
    academy: obj({ ...d.academy, name: str(d.academy.name), note: str(d.academy.note) }),
    coaches: d.coaches.filter((c) => c.name.trim()).map((c) => obj({ name: c.name.trim(), title: str(c.title), src: c.src.trim() })),
    busy: obj({ quiet: d.busy.quiet?.length ? d.busy.quiet : undefined, busy: d.busy.busy?.length ? d.busy.busy : undefined, note: str(d.busy.note) }),
    kids: obj({ ...d.kids, note: str(d.kids.note) }),
    shop: obj({ ...d.shop, note: str(d.shop.note) }),
    facilities: obj({ ...d.facilities, surface: d.facilities.surface === 'unknown' ? undefined : d.facilities.surface, note: str(d.facilities.note) }),
    languages: [...d.languages], fit_tags: [...d.fit_tags],
  }
}

/** Kiểm tra phía giao diện (cùng luật với trigger pv_validate_details). Trả khoá lỗi i18n hoặc null. */
export function detailsError(d: VenueDetails): string | null {
  if ((d.highlight_vi ?? '').length > 160 || (d.highlight_en ?? '').length > 160) return 'venues.d.err.highlight'
  if (d.coaches.some((c) => c.name.trim() && !/^https?:\/\//.test(c.src.trim()))) return 'venues.d.err.coachSrc'
  if (d.sim_rates.some((r) => !r.brand.trim() && (r.weekday != null || r.weekend != null))) return 'venues.d.err.simBrand'
  return null
}

/** Các trường chi tiết khác giữa hai bản (để khảo sát / đề xuất chỉ gửi phần đổi). */
export function changedDetailFields(a: VenueDetails, b: VenueDetails): DetailField[] {
  const ca = cleanDetails(a), cb = cleanDetails(b)
  return DETAIL_FIELDS.filter((k) => JSON.stringify(ca[k]) !== JSON.stringify(cb[k]))
}

/** "600k", "600.000", "1,2tr", "1.2 triệu" → số đồng. */
export function parseMoney(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  const m = t.match(/^([\d.,]+)(k|nghìn|ngàn|tr|triệu|m)?đ?$/)
  if (!m) return NaN
  const unit = m[2]
  let n: number
  if (unit) n = parseFloat(m[1].replace(',', '.'))
  else n = parseInt(m[1].replace(/[.,]/g, ''), 10)
  if (!Number.isFinite(n)) return NaN
  if (unit === 'k' || unit === 'nghìn' || unit === 'ngàn') n *= 1000
  if (unit === 'tr' || unit === 'triệu' || unit === 'm') n *= 1_000_000
  return Math.round(n)
}
export const fmtMoney = (n?: number | null) => (n == null ? '' : n.toLocaleString('vi-VN'))

// ── Bộ nhập ────────────────────────────────────────────────────────────────
function MoneyInput(p: { value?: number | null; onChange: (n: number | null) => void; label: string }) {
  return <MoneyBox key={String(p.value ?? '')} {...p} />
}
function MoneyBox({ value, onChange, label }: { value?: number | null; onChange: (n: number | null) => void; label: string }) {
  const { t } = useTranslation()
  return (
    <Input inputMode="numeric" aria-label={label} placeholder={label} defaultValue={fmtMoney(value)}
      onBlur={(e) => {
        const n = parseMoney(e.target.value)
        if (Number.isNaN(n)) { e.target.setCustomValidity(t('venues.d.err.money')); e.target.reportValidity(); return }
        e.target.setCustomValidity('')
        onChange(n)
        e.target.value = fmtMoney(n)
      }} />
  )
}

function TriPick({ label, value, onChange }: { label: string; value: Tri; onChange: (v: Tri) => void }) {
  const { t } = useTranslation()
  const opts: [Tri, string][] = [[true, t('venues.d.yes')], [false, t('venues.d.no')], [undefined, t('venues.d.unknown')]]
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="w-full text-sm font-semibold text-navy/80 sm:w-auto sm:min-w-44">{label}</span>
      {opts.map(([v, l]) => (
        <Chip key={l} on={(value ?? undefined) === v} onClick={() => onChange(v)} className="min-h-11 px-3">{l}</Chip>
      ))}
    </div>
  )
}

function MultiPick({ label, all, value, onChange, prefix }: { label: string; all: readonly string[]; value: string[]; onChange: (v: string[]) => void; prefix: string }) {
  const { t } = useTranslation()
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-semibold text-navy/80">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {all.map((k) => (
          <Chip key={k} on={value.includes(k)} className="min-h-11 px-3"
            onClick={() => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k])}>{t(`${prefix}.${k}`)}</Chip>
        ))}
      </div>
    </fieldset>
  )
}

function Group({ title, hint, open, children, filled }: { title: string; hint?: string; open?: boolean; children: ReactNode; filled?: boolean }) {
  return (
    <details className="group rounded-2xl border border-navy/10 bg-white" open={open}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-base font-bold">
        <span>{title}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', filled ? 'bg-emerald-100 text-emerald-900' : 'bg-navy/6 text-navy/60')}>{filled ? '●' : '○'}</span>
      </summary>
      <div className="space-y-3 border-t border-navy/10 px-4 py-3">
        {hint && <p className="text-sm text-navy/65">{hint}</p>}
        {children}
      </div>
    </details>
  )
}

export function DetailsEditor({ value: d, onChange, brands, venueType, internal, onInternal }: {
  value: VenueDetails; onChange: (d: VenueDetails) => void; brands: string[]; venueType?: string
  internal?: VenueInternal; onInternal?: (i: VenueInternal) => void
}) {
  const { t } = useTranslation()
  const set = <K extends keyof VenueDetails>(k: K, v: VenueDetails[K]) => onChange({ ...d, [k]: v })
  const isSim = venueType === '3d' || venueType === 'academy' || venueType === 'mini'
  const isRange = venueType === 'range' || venueType === 'course' || venueType === 'academy'
  const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v)

  return (
    <div className="space-y-3">
      <Group title={t('venues.d.g.highlight')} hint={t('venues.d.h.highlight')} open filled={!!d.highlight_vi}>
        <Field label={t('venues.d.highlightVi')} hint={`${(d.highlight_vi ?? '').length}/160`}>
          <Input maxLength={160} value={d.highlight_vi ?? ''} onChange={(e) => set('highlight_vi', e.target.value)} placeholder={t('venues.d.highlightPh')} />
        </Field>
        <Field label={t('venues.d.highlightEn')}>
          <Input maxLength={160} value={d.highlight_en ?? ''} onChange={(e) => set('highlight_en', e.target.value)} />
        </Field>
      </Group>

      <Group title={t('venues.d.g.sim')} hint={t('venues.d.h.sim')} open={isSim} filled={filled(d.sim_rates)}>
        {d.sim_rates.map((r, i) => {
          const up = (p: Partial<SimRate>) => set('sim_rates', d.sim_rates.map((x, j) => (j === i ? { ...x, ...p } : x)))
          return (
            <div key={i} className="grid gap-2 rounded-xl bg-cream p-3 sm:grid-cols-2">
              <Select aria-label={t('venues.d.brand')} value={r.brand} onChange={(e) => up({ brand: e.target.value })}>
                <option value="">{t('venues.d.brand')}</option>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                <option value="Khác">{t('venues.d.otherBrand')}</option>
              </Select>
              <Input aria-label={t('venues.f.model')} placeholder={t('venues.f.model')} value={r.model ?? ''} onChange={(e) => up({ model: e.target.value })} />
              <Input aria-label={t('venues.d.bays')} placeholder={t('venues.d.bays')} inputMode="numeric" value={r.bays ?? ''}
                onChange={(e) => up({ bays: /^\d{1,3}$/.test(e.target.value) ? parseInt(e.target.value, 10) : null })} />
              <Select aria-label={t('venues.d.unit')} value={r.unit ?? 'hour_room'} onChange={(e) => up({ unit: e.target.value as SimRate['unit'] })}>
                {SIM_UNITS.map((u) => <option key={u} value={u}>{t(`venues.d.simUnit.${u}`)}</option>)}
              </Select>
              <MoneyInput label={t('venues.d.weekday')} value={r.weekday} onChange={(n) => up({ weekday: n })} />
              <MoneyInput label={t('venues.d.weekend')} value={r.weekend} onChange={(n) => up({ weekend: n })} />
              <Input className="sm:col-span-2" aria-label={t('venues.d.note')} placeholder={t('venues.d.notePh')} value={r.note ?? ''} onChange={(e) => up({ note: e.target.value })} />
              <Button variant="ghost" className="justify-self-start text-red-700" onClick={() => set('sim_rates', d.sim_rates.filter((_, j) => j !== i))}><Trash2 className="h-5 w-5" /> {t('venues.p.remove')}</Button>
            </div>
          )
        })}
        <Button variant="outline" onClick={() => set('sim_rates', [...d.sim_rates, { brand: '', unit: 'hour_room' }])}><Plus className="h-5 w-5" /> {t('venues.d.addSim')}</Button>
      </Group>

      <Group title={t('venues.d.g.range')} hint={t('venues.d.h.range')} open={isRange} filled={filled(d.range_rates) || filled(d.club_rental)}>
        {d.range_rates.map((r, i) => {
          const up = (p: Partial<RangeRate>) => set('range_rates', d.range_rates.map((x, j) => (j === i ? { ...x, ...p } : x)))
          return (
            <div key={i} className="grid gap-2 rounded-xl bg-cream p-3 sm:grid-cols-2">
              <Select aria-label={t('venues.d.kind')} value={r.kind} onChange={(e) => up({ kind: e.target.value as RangeRate['kind'] })}>
                {RANGE_KINDS.map((k) => <option key={k} value={k}>{t(`venues.d.rangeKind.${k}`)}</option>)}
              </Select>
              <Input aria-label={t('venues.d.label')} placeholder={t('venues.d.labelPh')} value={r.label ?? ''} onChange={(e) => up({ label: e.target.value })} />
              {r.kind === 'balls' && (
                <Input aria-label={t('venues.d.balls')} placeholder={t('venues.d.balls')} inputMode="numeric" value={r.balls ?? ''}
                  onChange={(e) => up({ balls: /^\d{1,4}$/.test(e.target.value) ? parseInt(e.target.value, 10) : null })} />
              )}
              <MoneyInput label={t('venues.d.weekday')} value={r.weekday} onChange={(n) => up({ weekday: n })} />
              <MoneyInput label={t('venues.d.weekend')} value={r.weekend} onChange={(n) => up({ weekend: n })} />
              <Input className="sm:col-span-2" aria-label={t('venues.d.note')} placeholder={t('venues.d.notePh')} value={r.note ?? ''} onChange={(e) => up({ note: e.target.value })} />
              <Button variant="ghost" className="justify-self-start text-red-700" onClick={() => set('range_rates', d.range_rates.filter((_, j) => j !== i))}><Trash2 className="h-5 w-5" /> {t('venues.p.remove')}</Button>
            </div>
          )
        })}
        <Button variant="outline" onClick={() => set('range_rates', [...d.range_rates, { kind: 'balls' }])}><Plus className="h-5 w-5" /> {t('venues.d.addRange')}</Button>
        <TriPick label={t('venues.d.clubRental')} value={d.club_rental.available} onChange={(v) => set('club_rental', { ...d.club_rental, available: v })} />
        {d.club_rental.available && (
          <div className="grid gap-2 sm:grid-cols-2">
            <MoneyInput label={t('venues.d.rentalPrice')} value={d.club_rental.price} onChange={(n) => set('club_rental', { ...d.club_rental, price: n })} />
            <Input aria-label={t('venues.d.note')} placeholder={t('venues.d.rentalPh')} value={d.club_rental.note ?? ''} onChange={(e) => set('club_rental', { ...d.club_rental, note: e.target.value })} />
          </div>
        )}
      </Group>

      <Group title={t('venues.d.g.promos')} hint={t('venues.d.h.promos')} filled={filled(d.promos)}>
        {d.promos.map((p, i) => {
          const up = (x: Partial<Promo>) => set('promos', d.promos.map((y, j) => (j === i ? { ...y, ...x } : y)))
          return (
            <div key={i} className="grid gap-2 rounded-xl bg-cream p-3 sm:grid-cols-2">
              <Input aria-label={t('venues.d.promoTitle')} placeholder={t('venues.d.promoTitle')} value={p.title} onChange={(e) => up({ title: e.target.value })} />
              <Field label={t('venues.d.until')}><Input type="date" value={p.until ?? ''} onChange={(e) => up({ until: e.target.value })} /></Field>
              <Input className="sm:col-span-2" aria-label={t('venues.d.promoDetail')} placeholder={t('venues.d.promoDetail')} value={p.detail ?? ''} onChange={(e) => up({ detail: e.target.value })} />
              <Input className="sm:col-span-2" inputMode="url" aria-label={t('venues.d.srcUrl')} placeholder={t('venues.d.srcUrl')} value={p.url ?? ''} onChange={(e) => up({ url: e.target.value })} />
              <Button variant="ghost" className="justify-self-start text-red-700" onClick={() => set('promos', d.promos.filter((_, j) => j !== i))}><Trash2 className="h-5 w-5" /> {t('venues.p.remove')}</Button>
            </div>
          )
        })}
        <Button variant="outline" onClick={() => set('promos', [...d.promos, { title: '' }])}><Plus className="h-5 w-5" /> {t('venues.d.addPromo')}</Button>
      </Group>

      <Group title={t('venues.d.g.academy')} hint={t('venues.d.h.academy')} filled={filled(d.academy) || filled(d.coaches)}>
        <TriPick label={t('venues.d.hasAcademy')} value={d.academy.has} onChange={(v) => set('academy', { ...d.academy, has: v })} />
        {d.academy.has && <Input aria-label={t('venues.d.academyName')} placeholder={t('venues.d.academyName')} value={d.academy.name ?? ''} onChange={(e) => set('academy', { ...d.academy, name: e.target.value })} />}
        {d.coaches.map((c, i) => {
          const up = (x: Partial<Coach>) => set('coaches', d.coaches.map((y, j) => (j === i ? { ...y, ...x } : y)))
          return (
            <div key={i} className="grid gap-2 rounded-xl bg-cream p-3 sm:grid-cols-2">
              <Input aria-label={t('venues.d.coachName')} placeholder={t('venues.d.coachName')} value={c.name} onChange={(e) => up({ name: e.target.value })} />
              <Input aria-label={t('venues.d.coachTitle')} placeholder={t('venues.d.coachTitle')} value={c.title ?? ''} onChange={(e) => up({ title: e.target.value })} />
              <Field label={t('venues.d.coachSrc')} hint={t('venues.d.coachSrcHint')} className="sm:col-span-2">
                <Input inputMode="url" placeholder="https://" value={c.src} onChange={(e) => up({ src: e.target.value })} />
              </Field>
              <Button variant="ghost" className="justify-self-start text-red-700" onClick={() => set('coaches', d.coaches.filter((_, j) => j !== i))}><Trash2 className="h-5 w-5" /> {t('venues.p.remove')}</Button>
            </div>
          )
        })}
        <Button variant="outline" onClick={() => set('coaches', [...d.coaches, { name: '', src: '' }])}><Plus className="h-5 w-5" /> {t('venues.d.addCoach')}</Button>
      </Group>

      <Group title={t('venues.d.g.busy')} hint={t('venues.d.h.busy')} filled={filled(d.busy)}>
        <MultiPick label={t('venues.d.quiet')} all={SLOTS} prefix="venues.d.slot" value={d.busy.quiet ?? []} onChange={(v) => set('busy', { ...d.busy, quiet: v })} />
        <MultiPick label={t('venues.d.busyAt')} all={SLOTS} prefix="venues.d.slot" value={d.busy.busy ?? []} onChange={(v) => set('busy', { ...d.busy, busy: v })} />
        <Input aria-label={t('venues.d.note')} placeholder={t('venues.d.busyPh')} value={d.busy.note ?? ''} onChange={(e) => set('busy', { ...d.busy, note: e.target.value })} />
      </Group>

      <Group title={t('venues.d.g.kids')} filled={filled(d.kids)}>
        <TriPick label={t('venues.d.juniorClubs')} value={d.kids.junior_clubs} onChange={(v) => set('kids', { ...d.kids, junior_clubs: v })} />
        <TriPick label={t('venues.d.juniorClass')} value={d.kids.junior_class} onChange={(v) => set('kids', { ...d.kids, junior_class: v })} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Input aria-label={t('venues.d.minAge')} placeholder={t('venues.d.minAge')} inputMode="numeric" value={d.kids.min_age ?? ''}
            onChange={(e) => set('kids', { ...d.kids, min_age: /^\d{1,2}$/.test(e.target.value) ? parseInt(e.target.value, 10) : null })} />
          <Input aria-label={t('venues.d.note')} placeholder={t('venues.d.notePh')} value={d.kids.note ?? ''} onChange={(e) => set('kids', { ...d.kids, note: e.target.value })} />
        </div>
      </Group>

      <Group title={t('venues.d.g.shop')} filled={filled(d.shop)}>
        {(['apparel', 'accessories', 'clubs', 'fitting'] as const).map((k) => (
          <TriPick key={k} label={t(`venues.d.shop.${k}`)} value={d.shop[k]} onChange={(v) => set('shop', { ...d.shop, [k]: v })} />
        ))}
        <Input aria-label={t('venues.d.note')} placeholder={t('venues.d.shopPh')} value={d.shop.note ?? ''} onChange={(e) => set('shop', { ...d.shop, note: e.target.value })} />
      </Group>

      <Group title={t('venues.d.g.facilities')} filled={filled(d.facilities)}>
        <TriPick label={t('venues.d.waiting')} value={d.facilities.waiting_area} onChange={(v) => set('facilities', { ...d.facilities, waiting_area: v })} />
        <TriPick label={t('venues.d.vip')} value={d.facilities.vip_room} onChange={(v) => set('facilities', { ...d.facilities, vip_room: v })} />
        <TriPick label={t('venues.d.covered')} value={d.facilities.covered} onChange={(v) => set('facilities', { ...d.facilities, covered: v })} />
        <Field label={t('venues.d.surface')}>
          <Select value={d.facilities.surface ?? 'unknown'} onChange={(e) => set('facilities', { ...d.facilities, surface: e.target.value as VenueDetails['facilities']['surface'] })}>
            {SURFACES.map((s) => <option key={s} value={s}>{t(`venues.d.surf.${s}`)}</option>)}
          </Select>
        </Field>
        <Input aria-label={t('venues.d.note')} placeholder={t('venues.d.notePh')} value={d.facilities.note ?? ''} onChange={(e) => set('facilities', { ...d.facilities, note: e.target.value })} />
      </Group>

      <Group title={t('venues.d.g.people')} hint={t('venues.d.h.people')} open filled={filled(d.languages) || filled(d.fit_tags)}>
        <MultiPick label={t('venues.d.languages')} all={LANGS} prefix="venues.d.lang" value={d.languages} onChange={(v) => set('languages', v)} />
        <MultiPick label={t('venues.d.fitFor')} all={FIT_TAGS} prefix="venues.d.fit" value={d.fit_tags} onChange={(v) => set('fit_tags', v)} />
      </Group>

      {internal && onInternal && (
        <Group title={t('venues.d.g.internal')} hint={t('venues.d.h.internal')} open={internal.needs_survey.length > 0} filled={internal.needs_survey.length > 0}>
          <MultiPick label={t('venues.d.needsSurvey')} all={DETAIL_FIELDS.filter((k) => k !== 'highlight_en')} prefix="venues.f"
            value={internal.needs_survey} onChange={(v) => onInternal({ ...internal, needs_survey: v })} />
          <Field label={t('venues.d.sources')} hint={t('venues.d.sourcesHint')}>
            <Textarea rows={3} value={Object.entries(internal.info_sources).map(([k, s]) => `${k}: ${[s.src, s.url, s.at].filter(Boolean).join(' · ')}`).join('\n')} readOnly />
          </Field>
        </Group>
      )}
    </div>
  )
}

/** Hiển thị gọn một trường chi tiết (hàng chờ duyệt, so sánh khảo sát). */
export function fmtDetail(k: string, v: unknown, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length)) return '∅'
  const yn = (x: unknown) => (x === true ? t('venues.d.yes') : x === false ? t('venues.d.no') : '?')
  const money = (n?: number | null) => (n == null ? '—' : `${fmtMoney(n)}đ`)
  switch (k) {
    case 'sim_rates': return (v as SimRate[]).map((r) => `${r.brand}${r.model ? ' ' + r.model : ''}${r.bays ? ` ×${r.bays}` : ''}: ${money(r.weekday)} / ${money(r.weekend)} (${t(`venues.d.simUnit.${r.unit ?? 'hour_room'}`)})`).join(' · ')
    case 'range_rates': return (v as RangeRate[]).map((r) => `${r.label || t(`venues.d.rangeKind.${r.kind}`)}${r.balls ? ` (${r.balls})` : ''}: ${money(r.weekday)} / ${money(r.weekend)}`).join(' · ')
    case 'promos': return (v as Promo[]).map((p) => p.title + (p.until ? ` (→${p.until})` : '')).join(' · ')
    case 'coaches': return (v as Coach[]).map((c) => c.name + (c.title ? ` – ${c.title}` : '')).join(' · ')
    case 'languages': return (v as string[]).map((x) => t(`venues.d.lang.${x}`)).join(', ')
    case 'fit_tags': return (v as string[]).map((x) => t(`venues.d.fit.${x}`)).join(', ')
    case 'busy': { const b = v as VenueDetails['busy']; return [b.quiet?.length ? `${t('venues.d.quiet')}: ${b.quiet.map((x) => t(`venues.d.slot.${x}`)).join(', ')}` : '', b.busy?.length ? `${t('venues.d.busyAt')}: ${b.busy.map((x) => t(`venues.d.slot.${x}`)).join(', ')}` : '', b.note ?? ''].filter(Boolean).join(' · ') }
    case 'club_rental': { const c = v as VenueDetails['club_rental']; return `${yn(c.available)}${c.price != null ? ' · ' + money(c.price) : ''}${c.note ? ' · ' + c.note : ''}` }
    case 'facilities': { const f = v as VenueDetails['facilities']; return [`${t('venues.d.waiting')}: ${yn(f.waiting_area)}`, `${t('venues.d.vip')}: ${yn(f.vip_room)}`, `${t('venues.d.covered')}: ${yn(f.covered)}`, f.surface ? t(`venues.d.surf.${f.surface}`) : '', f.note ?? ''].filter(Boolean).join(' · ') }
    case 'kids': case 'shop': case 'academy': return Object.entries(v as Record<string, unknown>).map(([a, b]) => `${t(`venues.d.kv.${a}`, { defaultValue: a })}: ${typeof b === 'boolean' ? yn(b) : String(b)}`).join(' · ')
    default: return typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
}
