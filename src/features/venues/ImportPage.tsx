// Spec 26 · A9 Nhập dữ liệu ban đầu: 2 file JSON (docs/spec/data/sim-brands.json, practice-venues.json) → pv_import
import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/ui/form'
import { Section } from '@/features/courses/parts'
import { useImport, venueErr } from './api'

async function readJson(f: File | null): Promise<unknown[] | null> {
  if (!f) return null
  const data = JSON.parse(await f.text())
  if (!Array.isArray(data)) throw new Error('not_array')
  return data
}

export function ImportPage() {
  const { t } = useTranslation()
  const imp = useImport()
  const [brandsFile, setBrandsFile] = useState<File | null>(null)
  const [venuesFile, setVenuesFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function run() {
    setError(null); setDone(null)
    let brands: unknown[] | null, venues: unknown[] | null
    try {
      brands = await readJson(brandsFile)
      venues = await readJson(venuesFile)
    } catch {
      return setError(t('venues.import.badFile'))
    }
    if (!brands && !venues) return setError(t('venues.import.needFile'))
    try {
      const r = await imp.mutateAsync({ brands: brands ?? [], venues: venues ?? [] })
      setDone(t('venues.import.done', { b: r?.brands_in ?? 0, v: r?.venues_in ?? 0 }))
    } catch (e) {
      setError(venueErr(e, t))
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="-mx-4 -mt-6 flex items-center gap-1 bg-navy py-3 pr-4 pl-2 text-white lg:mx-0 lg:mt-0 lg:rounded-2xl">
        <Link to="/admin/venues" aria-label={t('venues.backToList')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold">{t('venues.import.title')}</h1>
      </div>
      <Section title={t('venues.import.title')}>
        <p className="text-sm text-navy/70">{t('venues.import.body')}</p>
        <Field label={t('venues.import.brandsFile')}>
          <input type="file" accept="application/json,.json" onChange={(e) => setBrandsFile(e.target.files?.[0] ?? null)} className="min-h-12 text-base" />
        </Field>
        <Field label={t('venues.import.venuesFile')}>
          <input type="file" accept="application/json,.json" onChange={(e) => setVenuesFile(e.target.files?.[0] ?? null)} className="min-h-12 text-base" />
        </Field>
        <FormError message={error} />
        {done && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{done}</p>}
        <Button size="full" onClick={run} disabled={imp.isPending}>{imp.isPending ? t('venues.import.running') : t('venues.import.run')}</Button>
      </Section>
    </div>
  )
}
