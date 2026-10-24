// Màn 3 · Thông tin sân & tee (bản mẫu docs/mockups/quan-tri-san/Thong-tin.dc.html)
// Sân trải nghiệm: sửa toàn bộ. Sân đo: chỉ xem — số đo tee do app CSR quản lý (đặc tả mục "Các màn hình").
import { useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import type { GcCourse, GcHole, GcTee } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSaveCourse, useSaveTees, useTees } from './api'
import { useMapsCoords } from './useMapsCoords'
import { COUNTRIES, FACILITIES, facLabel, teePreset, TEE_PRESETS } from './meta'
import { parseTeesBlock, teeTotals, type TeeDraft } from './teesFormat'
import { Chip, Section, Seg, StickyActions, UnsavedGuard, errText, mapsMessage } from './parts'
import { useCourseCtx } from './CourseShell'

/** Thông tin thêm hiện trên website; lưu trong cột booking (jsonb) của gc_courses, đúng tên trường bộ tạo trang đang đọc. */
const EXTRA = ['bookPhone', 'bookZalo', 'bookWeb', 'designer', 'openYear', 'hours', 'grass'] as const
type Extra = Record<(typeof EXTRA)[number], string>

interface Draft {
  name: string; name_en: string; country: string; province: string; maps: string; phone: string; website: string
  holes: number; units: 'yd' | 'm'; played_on: string; facilities: string[]; extra: Extra
  tees: TeeDraft[]
}

const blankHoles = (n: number): GcHole[] => Array.from({ length: n }, () => ({ par: null, len: null, si: null }))
const fit = (h: GcHole[], n: number) => (h.length >= n ? h.slice(0, n) : [...h, ...blankHoles(n - h.length)])

function draftOf(c: GcCourse, tees: GcTee[]): Draft {
  const b = (c.booking ?? {}) as Record<string, unknown>
  const holes = c.holes ?? Math.max(18, ...tees.map((t) => t.holes.length))
  return {
    name: c.name, name_en: c.name_en ?? '', country: c.country, province: c.province ?? '',
    maps: c.lat != null && c.lng != null ? `${c.lat}, ${c.lng}` : '', phone: c.phone ?? '', website: c.website ?? '',
    holes, units: c.units, played_on: c.played_on ?? '', facilities: [...(c.facilities ?? [])],
    extra: Object.fromEntries(EXTRA.map((k) => [k, b[k] == null ? '' : String(b[k])])) as Extra,
    tees: tees.map((t) => ({ name: t.name, color: t.color, gender: t.gender, holes: fit(t.holes, holes) })),
  }
}

const num = (s: string): number | null => {
  const n = parseInt(s.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

export function CourseInfoPage() {
  const { course } = useCourseCtx()
  const tees = useTees(course.id)
  if (tees.isPending) return <FullPageSpinner />
  return <InfoForm key={course.id + String(tees.dataUpdatedAt)} course={course} tees={tees.data ?? []} />
}

function InfoForm({ course, tees }: { course: GcCourse; tees: GcTee[] }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const nav = useNavigate()
  const toast = useToast()
  const saveCourse = useSaveCourse()
  const saveTees = useSaveTees(course.id)
  const readOnly = course.kind === 'rated'

  const initial = useMemo(() => draftOf(course, tees), [course, tees])
  const [d, setD] = useState<Draft>(initial)
  const [half, setHalf] = useState(0)
  const [paste, setPaste] = useState('')
  const [pasteMsg, setPasteMsg] = useState<{ ok: boolean; lines: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const dirty = !justSaved && JSON.stringify(d) !== JSON.stringify(initial)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const setExtra = (k: keyof Extra, v: string) => setD((x) => ({ ...x, extra: { ...x.extra, [k]: v } }))
  const { coords, state: mapsState, approx } = useMapsCoords(d.maps)
  const mapsMsg = mapsMessage(mapsState, coords, t, approx)
  // Link không đọc được: giữ toạ độ đang lưu; ô trống: xoá toạ độ
  const keepOld = mapsState === 'bad' || mapsState === 'shortFail'

  // Đổi số hố → cắt/thêm ô trong mọi tee
  const setHoles = (n: number) => { setD((x) => ({ ...x, holes: n, tees: x.tees.map((tee) => ({ ...tee, holes: fit(tee.holes, n) })) })); setHalf(0) }
  const halves = Math.max(1, Math.ceil(d.holes / 9))
  const cols = Array.from({ length: Math.min(9, d.holes - half * 9) }, (_, i) => half * 9 + i)

  // Par, SI dùng chung: lấy từ tee đầu tiên, sửa thì áp cho mọi tee
  const ref = d.tees[0]?.holes ?? blankHoles(d.holes)
  const setShared = (i: number, k: 'par' | 'si', v: string) =>
    setD((x) => ({ ...x, tees: x.tees.map((tee) => ({ ...tee, holes: tee.holes.map((h, j) => (j === i ? { ...h, [k]: num(v) } : h)) })) }))
  const setLen = (ti: number, i: number, v: string) =>
    setD((x) => ({ ...x, tees: x.tees.map((tee, k) => (k === ti ? { ...tee, holes: tee.holes.map((h, j) => (j === i ? { ...h, len: num(v) } : h)) } : tee)) }))
  const setTee = (ti: number, v: Partial<TeeDraft>) => setD((x) => ({ ...x, tees: x.tees.map((tee, k) => (k === ti ? { ...tee, ...v } : tee)) }))
  const addTee = () => setD((x) => ({ ...x, tees: [...x.tees, { name: '', color: null, gender: 'M', holes: (x.tees[0]?.holes ?? blankHoles(x.holes)).map((h) => ({ ...h, len: null })) }] }))
  const delTee = (ti: number) => setD((x) => ({ ...x, tees: x.tees.filter((_, k) => k !== ti) }))

  function applyPaste() {
    const r = parseTeesBlock(paste)
    if (!r.ok) return setPasteMsg({ ok: false, lines: r.errors })
    const n = [9, 18, 27, 36].includes(r.holes) ? r.holes : d.holes
    setD((x) => ({ ...x, holes: n, units: r.units ?? x.units, tees: r.tees.map((tee) => ({ ...tee, holes: fit(tee.holes, n) })) }))
    setHalf(0)
    setPasteMsg({ ok: true, lines: [t('courses.info.pasteOk', { n: r.tees.length, h: n }), ...r.warnings] })
    setPaste('')
  }

  async function save() {
    setError(null)
    if (!d.name.trim()) return setError(t('courses.new.needName'))
    if (d.website.trim() && !/^https?:\/\//i.test(d.website.trim())) return setError(t('courses.new.badWeb'))
    const unnamed = d.tees.findIndex((x) => !x.name.trim())
    if (unnamed >= 0) return setError(t('courses.info.teeNeedsName', { n: unnamed + 1 }))
    const par = d.tees[0] ? teeTotals(d.tees[0].holes).par : 0
    const booking = Object.fromEntries(EXTRA.map((k) => [k, d.extra[k].trim()]).filter(([, v]) => v))
    try {
      await saveCourse.mutateAsync({
        id: course.id, name: d.name.trim(), name_en: d.name_en.trim() || null, country: d.country, province: d.province.trim() || null,
        lat: keepOld ? course.lat : coords?.lat ?? null, lng: keepOld ? course.lng : coords?.lng ?? null, phone: d.phone.trim() || null, website: d.website.trim() || null,
        holes: d.holes, par: par || null, units: d.units, played_on: d.played_on || null, facilities: d.facilities, booking,
      })
      await saveTees.mutateAsync(d.tees.map((x, i) => ({ name: x.name.trim(), color: x.color, gender: x.gender, holes: x.holes, source: 'scorecard', sort: i })))
      toast(t('common.saved'))
      flushSync(() => setJustSaved(true))
      nav(`/admin/courses/${course.id}/photos`)
    } catch (e) {
      setError(errText(e, t))
    }
  }

  if (readOnly) return <RatedInfo course={course} tees={tees} />

  const busy = saveCourse.isPending || saveTees.isPending || mapsState === 'resolving'
  const cell = 'h-9 w-11 rounded-md border border-navy/15 bg-white px-1 text-center text-sm tabular-nums focus:border-bronze focus:outline-none focus:ring-2 focus:ring-gold/50'
  const totals = d.tees.map((x) => teeTotals(x.holes))

  return (
    <div className="space-y-4">
      <UnsavedGuard dirty={dirty} />

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-navy/10 bg-white px-3 py-2">
          <p className="text-xs text-navy/60">{t('courses.f.holes')}</p>
          <Select aria-label={t('courses.f.holes')} className="mt-1 min-h-9 border-0 px-0 py-0 text-lg font-bold focus:ring-0" value={d.holes} onChange={(e) => setHoles(+e.target.value)}>
            {[9, 18, 27, 36].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </div>
        <div className="rounded-xl border border-navy/10 bg-white px-3 py-2">
          <p className="text-xs text-navy/60">Par</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{totals[0]?.par || '–'}</p>
        </div>
        <div className="rounded-xl border border-navy/10 bg-white px-3 py-2">
          <p className="mb-1 text-xs text-navy/60">{t('courses.info.units')}</p>
          <Seg label={t('courses.info.units')} value={d.units} onChange={(v) => set('units', v)} options={[{ v: 'yd', label: 'yd' }, { v: 'm', label: 'm' }]} />
        </div>
      </div>

      <Section
        title={t('courses.info.teeTable')}
        aside={halves > 1 && (
          <Seg
            label={t('courses.info.half')}
            value={String(half)}
            onChange={(v) => setHalf(+v)}
            options={Array.from({ length: halves }, (_, k) => ({ v: String(k), label: `${k * 9 + 1}–${Math.min(d.holes, k * 9 + 9)}` }))}
          />
        )}
      >
        {d.tees.length ? (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="border-separate border-spacing-x-0.5 border-spacing-y-1 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[1] bg-white pr-2 text-left text-xs font-semibold text-navy/60">{t('courses.info.hole')}</th>
                  {cols.map((i) => <th key={i} className="w-11 text-center text-xs font-semibold text-navy/60">{i + 1}</th>)}
                  <th className="px-1 text-right text-xs font-semibold text-navy/60">{half === 0 && d.holes > 9 ? 'Out' : half === 1 && d.holes === 18 ? 'In' : t('courses.info.sum')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="sticky left-0 z-[1] bg-white pr-2 text-left font-semibold">Par</th>
                  {cols.map((i) => (
                    <td key={i}><input className={cn(cell, 'bg-cream font-semibold')} inputMode="numeric" aria-label={`Par ${i + 1}`} value={ref[i]?.par ?? ''} onChange={(e) => setShared(i, 'par', e.target.value)} /></td>
                  ))}
                  <td className="px-1 text-right font-semibold tabular-nums">{cols.reduce((s, i) => s + (ref[i]?.par ?? 0), 0) || ''}</td>
                </tr>
                {d.tees.map((tee, ti) => (
                  <tr key={ti}>
                    <th scope="row" className="sticky left-0 z-[1] max-w-24 truncate bg-white pr-2 text-left font-medium">
                      <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-navy/40 align-middle" style={{ background: tee.color ?? 'transparent' }} />
                      {tee.name || `Tee ${ti + 1}`}
                    </th>
                    {cols.map((i) => (
                      <td key={i}><input className={cell} inputMode="numeric" aria-label={`${tee.name} ${i + 1}`} value={tee.holes[i]?.len ?? ''} onChange={(e) => setLen(ti, i, e.target.value)} /></td>
                    ))}
                    <td className="px-1 text-right tabular-nums">{cols.reduce((s, i) => s + (tee.holes[i]?.len ?? 0), 0) || ''}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="sticky left-0 z-[1] bg-white pr-2 text-left text-xs font-semibold text-navy/60">SI</th>
                  {cols.map((i) => (
                    <td key={i}><input className={cn(cell, 'h-8 text-xs')} inputMode="numeric" aria-label={`SI ${i + 1}`} value={ref[i]?.si ?? ''} onChange={(e) => setShared(i, 'si', e.target.value)} /></td>
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-navy/60">{t('courses.info.noTees')}</p>
        )}

        {d.tees.length > 0 && (
          <p className="text-sm text-navy/70">
            {d.tees.map((tee, i) => `${tee.name || `Tee ${i + 1}`}: ${totals[i].total.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN')} ${d.units}`).join(' · ')}
          </p>
        )}

        <div className="space-y-2 border-t border-navy/10 pt-3">
          <label htmlFor="tee-paste" className="text-sm font-semibold">{t('courses.info.pasteTitle')}</label>
          <p className="text-sm text-navy/60">{t('courses.info.pasteHint')}</p>
          <Textarea id="tee-paste" className="min-h-20 font-mono text-xs" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={t('courses.info.pastePh')} />
          {pasteMsg && (
            <ul className={cn('space-y-0.5 text-sm font-medium', pasteMsg.ok ? 'text-emerald-800' : 'text-red-700')}>
              {pasteMsg.lines.map((l, i) => <li key={i} className={i > 0 && pasteMsg.ok ? 'text-brown' : ''}>{i > 0 && pasteMsg.ok ? '⚠ ' : ''}{l}</li>)}
            </ul>
          )}
          <Button type="button" variant="outline" size="sm" disabled={!paste.trim()} onClick={applyPaste}>{t('courses.info.pasteApply')}</Button>
        </div>

        <details className="border-t border-navy/10 pt-3" open={d.tees.length > 0 && d.tees.some((x) => !x.name.trim())}>
          <summary className="cursor-pointer text-sm font-semibold">{t('courses.info.teeList', { n: d.tees.length })}</summary>
          <div className="mt-3 space-y-3">
            {d.tees.map((tee, ti) => (
              <div key={ti} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-cream p-2.5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Input
                    aria-label={t('courses.info.teeName')}
                    placeholder={t('courses.info.teeName')}
                    className="col-span-2 min-h-10 py-1.5 sm:col-span-1"
                    value={tee.name}
                    onChange={(e) => { const p = teePreset(e.target.value); setTee(ti, { name: e.target.value, ...(p && !tee.color ? { color: p.color, gender: p.gender } : {}) }) }}
                  />
                  <Select aria-label={t('courses.info.teeColor')} className="min-h-10 py-1.5" value={tee.color ?? ''} onChange={(e) => setTee(ti, { color: e.target.value || null })}>
                    <option value="">{t('courses.info.noColor')}</option>
                    {TEE_PRESETS.map((p) => <option key={p.color} value={p.color}>{lang === 'en' ? p.en : p.vi}</option>)}
                    {tee.color && !TEE_PRESETS.some((p) => p.color === tee.color) && <option value={tee.color}>{tee.color}</option>}
                  </Select>
                  <Select aria-label={t('courses.info.teeGender')} className="min-h-10 py-1.5" value={tee.gender} onChange={(e) => setTee(ti, { gender: e.target.value as TeeDraft['gender'] })}>
                    <option value="M">{t('courses.gender.M')}</option>
                    <option value="F">{t('courses.gender.F')}</option>
                    <option value="X">{t('courses.gender.X')}</option>
                  </Select>
                </div>
                <button type="button" onClick={() => delTee(ti)} aria-label={t('courses.info.delTee', { name: tee.name })} className="flex h-10 w-10 items-center justify-center rounded-full text-red-700 hover:bg-red-50">
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addTee}><Plus className="h-4 w-4" /> {t('courses.info.addTee')}</Button>
          </div>
        </details>
        <p className="text-xs text-navy/55">{t('courses.info.scorecardNote')}</p>
      </Section>

      <Section title={t('courses.info.facilities')}>
        <div className="flex flex-wrap gap-2">
          {FACILITIES.map((k) => {
            const on = d.facilities.includes(k)
            return (
              <Chip key={k} on={on} className={on ? 'border-bronze bg-[#FBEBDD] text-navy' : 'font-medium'} onClick={() => set('facilities', on ? d.facilities.filter((x) => x !== k) : [...d.facilities, k])}>
                {facLabel(k, lang)}
              </Chip>
            )
          })}
        </div>
      </Section>

      <Section title={t('courses.info.booking')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('courses.info.bookPhone')}><Input value={d.extra.bookPhone} onChange={(e) => setExtra('bookPhone', e.target.value)} inputMode="tel" /></Field>
          <Field label={t('courses.info.bookZalo')}><Input value={d.extra.bookZalo} onChange={(e) => setExtra('bookZalo', e.target.value)} /></Field>
          <Field label={t('courses.info.bookWeb')} className="sm:col-span-2"><Input value={d.extra.bookWeb} onChange={(e) => setExtra('bookWeb', e.target.value)} placeholder="https://" inputMode="url" /></Field>
          <Field label={t('courses.info.designer')}><Input value={d.extra.designer} onChange={(e) => setExtra('designer', e.target.value)} /></Field>
          <Field label={t('courses.info.openYear')}><Input value={d.extra.openYear} onChange={(e) => setExtra('openYear', e.target.value)} inputMode="numeric" maxLength={4} /></Field>
          <Field label={t('courses.info.hours')}><Input value={d.extra.hours} onChange={(e) => setExtra('hours', e.target.value)} placeholder="05:30–18:00" /></Field>
          <Field label={t('courses.info.grass')}><Input value={d.extra.grass} onChange={(e) => setExtra('grass', e.target.value)} placeholder="Paspalum" /></Field>
        </div>
      </Section>

      <details className="rounded-2xl border border-navy/10 bg-white p-4">
        <summary className="cursor-pointer text-base font-bold">{t('courses.info.general')}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t('courses.f.name')} className="sm:col-span-2"><Input value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label={t('courses.f.nameEn')} className="sm:col-span-2"><Input value={d.name_en} onChange={(e) => set('name_en', e.target.value)} placeholder={t('courses.f.nameEnPh')} /></Field>
          <Field label={t('courses.f.country')}>
            <Select value={d.country} onChange={(e) => set('country', e.target.value)}>
              {!COUNTRIES.some((c) => c.code === d.country) && <option value={d.country}>{d.country}</option>}
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{lang === 'en' ? c.en : c.vi}</option>)}
            </Select>
          </Field>
          <Field label={t('courses.f.province')}><Input value={d.province} onChange={(e) => set('province', e.target.value)} /></Field>
          <Field label={t('courses.f.maps')} className="sm:col-span-2" hint={mapsMsg.hint} error={mapsMsg.warn}>
            <Input value={d.maps} onChange={(e) => set('maps', e.target.value)} />
          </Field>
          <Field label={t('courses.f.phone')}><Input value={d.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" /></Field>
          <Field label={t('courses.f.playedOn')}><Input type="date" value={d.played_on} onChange={(e) => set('played_on', e.target.value)} /></Field>
          <Field label={t('courses.f.website')} className="sm:col-span-2"><Input value={d.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></Field>
        </div>
        <p className="mt-3 text-xs text-navy/55">{t('courses.info.slugNote', { slug: course.slug ?? '—' })}</p>
      </details>

      <FormError message={error} />
      <StickyActions aboveTabs>
        <Button type="button" size="full" disabled={busy} onClick={save}>
          {busy ? t('common.loading') : t('courses.info.saveNext')}
        </Button>
      </StickyActions>
    </div>
  )
}

/** Sân đo: chỉ xem, kèm lời nhắc sửa bên app CSR. */
function RatedInfo({ course, tees }: { course: GcCourse; tees: GcTee[] }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-[#E8EEF8] px-4 py-3 text-sm text-[#1F3A6B]">{t('courses.info.ratedNote')}</p>
      <Section title={t('courses.info.general')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-navy/60">{t('courses.f.name')}</dt><dd className="font-medium">{course.name}</dd>
          <dt className="text-navy/60">{t('courses.f.holes')}</dt><dd>{course.holes ?? '–'}</dd>
          <dt className="text-navy/60">{t('courses.f.csrId')}</dt><dd className="font-mono">{course.csr_course_id ?? '–'}</dd>
          <dt className="text-navy/60">{t('courses.info.facilities')}</dt><dd>{(course.facilities ?? []).map((k) => facLabel(k, i18n.language)).join(', ') || '–'}</dd>
        </dl>
        {tees.length > 0 && <p className="text-sm text-navy/60">{t('courses.info.teeList', { n: tees.length })}: {tees.map((x) => x.name).join(', ')}</p>}
      </Section>
    </div>
  )
}
