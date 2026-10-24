// Màn 2 · Thêm sân (bản mẫu docs/mockups/quan-tri-san/Them-san.dc.html)
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import type { GcCourse } from '@/lib/types'
import { useCourses, useSaveCourse } from './api'
import { parseCourseBlock } from './importFormat'
import { parseLatLng } from './coords'
import { COUNTRIES, similarCourse, uniqueSlug } from './meta'
import { StickyActions, errText } from './parts'
import { cn } from '@/lib/utils'

const today = () => new Date().toISOString().slice(0, 10)

export function NewCoursePage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const nav = useNavigate()
  const toast = useToast()
  const courses = useCourses()
  const save = useSaveCourse()

  const [paste, setPaste] = useState('')
  const [pasteMsg, setPasteMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [country, setCountry] = useState('VN')
  const [otherCountry, setOtherCountry] = useState('')
  const [province, setProvince] = useState('')
  const [maps, setMaps] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [holes, setHoles] = useState('18')
  const [kind, setKind] = useState<GcCourse['kind']>('experience')
  const [csrId, setCsrId] = useState('')
  const [playedOn, setPlayedOn] = useState(today())
  const [error, setError] = useState<string | null>(null)

  const coords = useMemo(() => parseLatLng(maps), [maps])
  const cc = country === '__' ? otherCountry.trim().toUpperCase() : country
  const dup = useMemo(() => (name.trim() ? similarCourse(name, courses.data ?? []) : undefined), [name, courses.data])

  function applyPaste(text: string) {
    setPaste(text)
    if (!text.trim()) return setPasteMsg(null)
    const r = parseCourseBlock(text)
    if (!r.ok || !r.value) return setPasteMsg({ ok: false, text: r.errors.join(' · ') })
    const v = r.value
    setName(v.name)
    setNameEn(v.name_en && v.name_en !== v.name ? v.name_en : '')
    if (COUNTRIES.some((c) => c.code === v.country)) setCountry(v.country)
    else { setCountry('__'); setOtherCountry(v.country) }
    setProvince(v.province ?? '')
    if (v.lat !== undefined && v.lng !== undefined) setMaps(`${v.lat}, ${v.lng}`)
    setPhone(v.phone ?? '')
    setWebsite(v.website ?? '')
    if (v.holes) setHoles(String(v.holes))
    setPasteMsg({ ok: true, text: t('courses.new.pasteOk') })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError(t('courses.new.needName'))
    if (!/^[A-Z]{2}$/.test(cc)) return setError(t('courses.new.needCountry'))
    if (maps.trim() && !coords) return setError(t('courses.new.badMaps'))
    if (kind === 'rated' && !csrId.trim()) return setError(t('courses.new.needCsr'))
    const web = website.trim()
    if (web && !/^https?:\/\//i.test(web)) return setError(t('courses.new.badWeb'))
    const nh = parseInt(holes, 10)
    try {
      const c = await save.mutateAsync({
        kind,
        csr_course_id: kind === 'rated' ? csrId.trim() : null,
        name: name.trim(),
        name_en: nameEn.trim() || null,
        slug: uniqueSlug(nameEn.trim() || name.trim(), (courses.data ?? []).map((x) => x.slug)),
        country: cc,
        province: province.trim() || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        phone: phone.trim() || null,
        website: web || null,
        holes: Number.isFinite(nh) ? nh : null,
        units: 'yd', // đổi ở màn Thông tin theo scorecard
        played_on: kind === 'experience' ? playedOn || null : null,
      })
      toast(t('courses.new.created'))
      nav(`/admin/courses/${c.id}/${kind === 'rated' ? 'photos' : 'info'}`, { replace: true })
    } catch (err) {
      setError(errText(err, t))
    }
  }

  const seg = (on: boolean) => cn('min-h-12 rounded-xl px-2 text-sm font-semibold', on ? 'border-2 border-navy bg-navy text-white' : 'border border-navy/15 bg-white text-navy')

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-4" noValidate>
      <div className="flex items-center gap-1">
        <Link to="/admin/courses" aria-label={t('courses.backToList')} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-navy/5">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-bold">{t('courses.new.title')}</h1>
      </div>

      <details className="rounded-xl border border-dashed border-bronze bg-white px-4 py-3" open={Boolean(paste)}>
        <summary className="cursor-pointer text-sm font-semibold text-[#9A5A22]">{t('courses.new.pasteTitle')}</summary>
        <Textarea
          className="mt-3 min-h-20 text-sm"
          value={paste}
          onChange={(e) => applyPaste(e.target.value)}
          placeholder={t('courses.new.pastePh')}
          aria-label={t('courses.new.pasteTitle')}
        />
        {pasteMsg && <p className={cn('mt-2 text-sm font-medium', pasteMsg.ok ? 'text-emerald-700' : 'text-red-700')}>{pasteMsg.text}</p>}
      </details>

      <Field label={t('courses.f.name')} error={null}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('courses.f.namePh')} maxLength={200} required />
      </Field>
      {dup && (
        <p className="-mt-2 rounded-xl bg-gold/25 px-3 py-2 text-sm text-brown">
          {t('courses.new.dup')}{' '}
          <Link className="font-semibold underline" to={`/admin/courses/${dup.id}/info`}>{dup.name}</Link>
        </p>
      )}
      <Field label={t('courses.f.nameEn')}>
        <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder={t('courses.f.nameEnPh')} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('courses.f.country')}>
          <Select value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{lang === 'en' ? c.en : c.vi}</option>)}
            <option value="__">{t('courses.f.otherCountry')}</option>
          </Select>
        </Field>
        {country === '__' ? (
          <Field label={t('courses.f.countryCode')}>
            <Input value={otherCountry} onChange={(e) => setOtherCountry(e.target.value)} maxLength={2} placeholder="FR" className="uppercase" />
          </Field>
        ) : (
          <Field label={t('courses.f.province')}>
            <Input value={province} onChange={(e) => setProvince(e.target.value)} placeholder={t('courses.f.provincePh')} />
          </Field>
        )}
      </div>
      {country === '__' && (
        <Field label={t('courses.f.province')}>
          <Input value={province} onChange={(e) => setProvince(e.target.value)} placeholder={t('courses.f.provincePh')} />
        </Field>
      )}

      <Field
        label={t('courses.f.maps')}
        hint={coords ? t('courses.f.coordsOk', { lat: coords.lat, lon: coords.lng }) : t('courses.f.mapsHint')}
        error={maps.trim() && !coords ? t('courses.new.badMaps') : null}
      >
        <Input value={maps} onChange={(e) => setMaps(e.target.value)} placeholder={t('courses.f.mapsPh')} inputMode="url" />
      </Field>
      {coords && (
        <a className="-mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#9A5A22] underline" href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`} target="_blank" rel="noreferrer">
          <MapPin className="h-4 w-4" /> {t('courses.f.checkMap')}
        </a>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('courses.f.phone')}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+66 …" inputMode="tel" />
        </Field>
        <Field label={t('courses.f.holes')}>
          <Select value={holes} onChange={(e) => setHoles(e.target.value)}>
            {[9, 18, 27, 36].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t('courses.f.website')}>
        <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" inputMode="url" />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-navy/80">{t('courses.f.kind')}</legend>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={kind === 'experience'} className={seg(kind === 'experience')} onClick={() => setKind('experience')}>{t('courses.kind.experience')}</button>
          <button type="button" aria-pressed={kind === 'rated'} className={seg(kind === 'rated')} onClick={() => setKind('rated')}>{t('courses.new.ratedBtn')}</button>
        </div>
      </fieldset>
      {kind === 'rated' ? (
        <Field label={t('courses.f.csrId')} hint={t('courses.f.csrIdHint')}>
          <Input value={csrId} onChange={(e) => setCsrId(e.target.value)} placeholder="xuanthanh" autoCapitalize="off" />
        </Field>
      ) : (
        <Field label={t('courses.f.playedOn')}>
          <Input type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} max={today()} />
        </Field>
      )}

      <FormError message={error} />
      <StickyActions>
        <Button type="submit" size="full" disabled={save.isPending}>
          {save.isPending ? t('common.loading') : t('courses.new.submit')}
        </Button>
      </StickyActions>
    </form>
  )
}
