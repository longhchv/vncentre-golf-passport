// Spec 26 · A8 Hồ sơ hãng máy (bảng sim_brands, thay brands.js của trang web sân tập)
import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Chip, Section } from '@/features/courses/parts'
import { BRAND_GROUPS, useBrands, useSaveBrand, useVenues, venueErr, type Brand } from './api'
import { linesToList, pairsToText, textToPairs } from './parts'

const BADGES = ['tour', 'plate', 'ai', 'vi'] as const

const blank = (): Brand => ({
  key: '', group: 'screen', origin_vi: '', origin_en: '', badges: [], sum_vi: '', sum_en: '', tech_vi: '', tech_en: null,
  fit_vi: '', fit_en: null, models: [], feats: [], apps: [], sources: [], sort: 100, active: true,
})

export function BrandsPage() {
  const { t } = useTranslation()
  const brands = useBrands()
  const venues = useVenues()
  const [edit, setEdit] = useState<{ brand: Brand; isNew: boolean } | null>(null)
  if (brands.isPending) return <FullPageSpinner />
  const count = (k: string) => (venues.data ?? []).filter((v) => v.machine === k).length

  if (edit) return <BrandForm key={edit.brand.key || 'new'} brand={edit.brand} isNew={edit.isNew} onDone={() => setEdit(null)} />

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="-mx-4 -mt-6 flex items-center gap-1 bg-navy py-3 pr-4 pl-2 text-white lg:mx-0 lg:mt-0 lg:rounded-2xl">
        <Link to="/admin/venues" aria-label={t('venues.backToList')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold">{t('venues.brands.title')}</h1>
      </div>
      <FormError message={brands.error ? venueErr(brands.error, t) : null} />
      {BRAND_GROUPS.map((g) => (
        <Section key={g} title={t(`venues.brands.group.${g}`)}>
          <div className="grid gap-2 sm:grid-cols-2">
            {(brands.data ?? []).filter((b) => b.group === g).map((b) => (
              <button key={b.key} type="button" onClick={() => setEdit({ brand: b, isNew: false })}
                className="flex flex-col items-start gap-0.5 rounded-xl border border-navy/10 bg-cream px-3 py-2.5 text-left hover:border-bronze/50">
                <b className={b.active ? '' : 'text-navy/45 line-through'}>{b.key}</b>
                <span className="text-xs text-navy/65">{b.origin_vi} · {t('venues.brands.venuesN', { n: count(b.key) })}</span>
              </button>
            ))}
          </div>
        </Section>
      ))}
      <Button size="full" onClick={() => setEdit({ brand: blank(), isNew: true })}><Plus className="h-5 w-5" /> {t('venues.brands.add')}</Button>
    </div>
  )
}

function BrandForm({ brand, isNew, onDone }: { brand: Brand; isNew: boolean; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const save = useSaveBrand()
  const [b, setB] = useState<Brand>(brand)
  const [models, setModels] = useState(pairsToText(brand.models))
  const [apps, setApps] = useState(pairsToText(brand.apps))
  const [feats, setFeats] = useState((brand.feats ?? []).join('\n'))
  const [sources, setSources] = useState((brand.sources ?? []).join('\n'))
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => setB((x) => ({ ...x, [k]: v }))

  async function submit() {
    setError(null)
    if (!b.key.trim()) return setError(t('venues.brands.needKey'))
    try {
      await save.mutateAsync({
        isNew,
        brand: { ...b, key: b.key.trim(), models: textToPairs(models), apps: textToPairs(apps), feats: linesToList(feats), sources: linesToList(sources) },
      })
      toast(t('common.saved'))
      onDone()
    } catch (e) {
      setError(venueErr(e, t))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="-mx-4 -mt-6 flex items-center gap-1 bg-navy py-3 pr-4 pl-2 text-white lg:mx-0 lg:mt-0 lg:rounded-2xl">
        <button type="button" onClick={onDone} aria-label={t('common.back')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-lg font-bold">{isNew ? t('venues.brands.add') : b.key}</h1>
      </div>
      <FormError message={error} />
      <Section title={t('venues.brands.basic')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('venues.brands.key')} hint={isNew ? t('venues.brands.keyHint') : undefined}>
            <Input value={b.key} disabled={!isNew} onChange={(e) => set('key', e.target.value)} />
          </Field>
          <Field label={t('venues.brands.groupLabel')}>
            <Select value={b.group} onChange={(e) => set('group', e.target.value as Brand['group'])}>
              {BRAND_GROUPS.map((g) => <option key={g} value={g}>{t(`venues.brands.group.${g}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('venues.brands.originVi')}><Input value={b.origin_vi ?? ''} onChange={(e) => set('origin_vi', e.target.value)} /></Field>
          <Field label={t('venues.brands.originEn')}><Input value={b.origin_en ?? ''} onChange={(e) => set('origin_en', e.target.value)} /></Field>
          <Field label={t('venues.brands.sort')}><Input value={String(b.sort)} inputMode="numeric" onChange={(e) => set('sort', parseInt(e.target.value, 10) || 100)} /></Field>
          <div className="flex items-end"><Checkbox label={t('venues.brands.active')} checked={b.active} onChange={(e) => set('active', e.target.checked)} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {BADGES.map((k) => {
            const on = b.badges.includes(k)
            return <Chip key={k} on={on} className="min-h-9 px-3 text-xs" onClick={() => set('badges', on ? b.badges.filter((x) => x !== k) : [...b.badges, k])}>{t(`venues.brands.badge.${k}`)}</Chip>
          })}
        </div>
      </Section>
      <Section title={t('venues.brands.content')}>
        <Field label={t('venues.brands.sumVi')}><Textarea value={b.sum_vi ?? ''} onChange={(e) => set('sum_vi', e.target.value)} /></Field>
        <Field label={t('venues.brands.sumEn')}><Textarea value={b.sum_en ?? ''} onChange={(e) => set('sum_en', e.target.value)} /></Field>
        <Field label={t('venues.brands.tech')}><Textarea value={b.tech_vi ?? ''} onChange={(e) => set('tech_vi', e.target.value)} /></Field>
        <Field label={t('venues.brands.models')} hint={t('venues.brands.pairsHint')}><Textarea value={models} rows={5} onChange={(e) => setModels(e.target.value)} /></Field>
        <Field label={t('venues.brands.feats')} hint={t('venues.brands.linesHint')}><Textarea value={feats} rows={4} onChange={(e) => setFeats(e.target.value)} /></Field>
        <Field label={t('venues.brands.apps')} hint={t('venues.brands.pairsHint')}><Textarea value={apps} rows={5} onChange={(e) => setApps(e.target.value)} /></Field>
        <Field label={t('venues.brands.fit')}><Textarea value={b.fit_vi ?? ''} onChange={(e) => set('fit_vi', e.target.value)} /></Field>
        <Field label={t('venues.brands.sources')} hint={t('venues.brands.linesHint')}><Textarea value={sources} rows={3} onChange={(e) => setSources(e.target.value)} /></Field>
      </Section>
      <Button size="full" onClick={submit} disabled={save.isPending}>{save.isPending ? t('venues.saving') : t('venues.save')}</Button>
    </div>
  )
}
