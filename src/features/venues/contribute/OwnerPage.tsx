// Spec 27 · Chủ sân tự cập nhật trang (không qua duyệt; ghi lịch sử nguồn "Chủ sân sửa")
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Section, StickyActions } from '@/features/courses/parts'
import { PARKING, useBrands, type PriceRow, type Venue } from '../api'
import { contribErr, useMyVenues, useOwnerUpdate } from './api'
import { TAPGOLF } from './ContributePages'
import { surveyErr, useOwnerReply, useVenueReviewsForOwner } from '../survey/api'
import { Stars } from '../survey/SurveyPages'
import { fmtDate } from '@/features/courses/parts'

export function OwnerVenuesPage() {
  const { t } = useTranslation()
  const mine = useMyVenues()
  const [sel, setSel] = useState<string | null>(null)
  if (mine.isPending) return <FullPageSpinner />
  const list = mine.data ?? []
  const v = list.find((x) => x.id === sel) ?? (list.length === 1 ? list[0] : null)
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{t('venues.o.title')}</h1>
      <FormError message={mine.error ? contribErr(mine.error, t) : null} />
      {!list.length && <p className="rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-navy/60">{t('venues.o.none')}</p>}
      {list.length > 1 && (
        <Select aria-label={t('venues.o.pick')} value={v?.id ?? ''} onChange={(e) => setSel(e.target.value)}>
          <option value="">{t('venues.o.pick')}</option>
          {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      )}
      {v && <OwnerForm key={v.id + v.updated_at} v={v} />}
      {v && <OwnerReviews venueId={v.id} />}
    </div>
  )
}

function OwnerForm({ v }: { v: Venue }) {
  const { t } = useTranslation()
  const toast = useToast()
  const brands = useBrands()
  const upd = useOwnerUpdate()
  const init = useMemo(() => ({
    phone: v.phone ?? '', hours: v.hours ?? '', web: v.web ?? '', fb_url: v.fb_url ?? '', late: v.late, machine: v.machine ?? '',
    model: v.machine_detail?.model ?? '', software: v.machine_detail?.software ?? '', bays: v.bays == null ? '' : String(v.bays),
    parking: v.parking, parking_note: v.parking_note ?? '', prices: (v.prices ?? []).map((p) => ({ ...p })),
  }), [v])
  const [d, setD] = useState(init)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof typeof d>(k: K, val: (typeof d)[K]) => setD((x) => ({ ...x, [k]: val }))
  const dirty = JSON.stringify(d) !== JSON.stringify(init)

  async function save() {
    setErr(null)
    if (d.bays.trim() && !/^\d{1,3}$/.test(d.bays.trim())) return setErr(t('venues.err.badBays'))
    try {
      await upd.mutateAsync({ id: v.id, payload: {
        phone: d.phone.trim() || null, hours: d.hours.trim() || null, web: d.web.trim() || null, fb_url: d.fb_url.trim() || null, late: d.late,
        machine: d.machine || null, machine_detail: { ...(v.machine_detail ?? {}), model: d.model.trim() || undefined, software: d.software.trim() || undefined },
        bays: d.bays.trim() ? parseInt(d.bays, 10) : null, parking: d.parking, parking_note: d.parking_note.trim() || null,
        prices: d.prices.filter((p: PriceRow) => p.item_vi.trim() && p.price.trim()),
      } })
      toast(t('common.saved'))
    } catch (e) { setErr(contribErr(e, t)) }
  }

  return (
    <>
      <Section title={v.name} aside={<a href={`${TAPGOLF}/#/${v.id}`} className="text-sm font-semibold underline">{t('venues.o.view')}</a>}>
        <p className="text-sm text-navy/70">{t('venues.o.hint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('venues.f.phone')}><Input value={d.phone} inputMode="tel" onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label={t('venues.f.hours')}><Input value={d.hours} onChange={(e) => set('hours', e.target.value)} /></Field>
          <Field label={t('venues.f.web')}><Input value={d.web} inputMode="url" onChange={(e) => set('web', e.target.value)} /></Field>
          <Field label={t('venues.f.fb')}><Input value={d.fb_url} inputMode="url" onChange={(e) => set('fb_url', e.target.value)} /></Field>
          <Field label={t('venues.f.machine')}>
            <Select value={d.machine} onChange={(e) => set('machine', e.target.value)}>
              <option value="">{t('venues.noMachine')}</option>
              {(brands.data ?? []).map((b) => <option key={b.key} value={b.key}>{b.key}</option>)}
            </Select>
          </Field>
          <Field label={t('venues.f.bays')}><Input value={d.bays} inputMode="numeric" onChange={(e) => set('bays', e.target.value)} /></Field>
          <Field label={t('venues.f.model')}><Input value={d.model} onChange={(e) => set('model', e.target.value)} /></Field>
          <Field label={t('venues.f.software')}><Input value={d.software} onChange={(e) => set('software', e.target.value)} /></Field>
          <Field label={t('venues.f.parking')}>
            <Select value={d.parking} onChange={(e) => set('parking', e.target.value as Venue['parking'])}>{PARKING.map((k) => <option key={k} value={k}>{t(`venues.parking.${k}`)}</option>)}</Select>
          </Field>
          <Field label={t('venues.f.parkingNote')}><Input value={d.parking_note} onChange={(e) => set('parking_note', e.target.value)} /></Field>
          <div className="sm:col-span-2"><Checkbox label={t('venues.f.late')} checked={d.late} onChange={(e) => set('late', e.target.checked)} /></div>
        </div>
      </Section>
      <Section title={t('venues.tab.prices')}>
        {d.prices.map((p, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Input aria-label={t('venues.p.item')} placeholder={t('venues.p.item')} value={p.item_vi} onChange={(e) => set('prices', d.prices.map((x, j) => (j === i ? { ...x, item_vi: e.target.value } : x)))} />
            <Input aria-label={t('venues.p.price')} placeholder={t('venues.p.price')} value={p.price} onChange={(e) => set('prices', d.prices.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
            <Input aria-label={t('venues.p.unit')} placeholder={t('venues.p.unit')} value={p.unit ?? ''} onChange={(e) => set('prices', d.prices.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
            <Button variant="ghost" aria-label={t('venues.p.remove')} className="text-red-700" onClick={() => set('prices', d.prices.filter((_, j) => j !== i))}><Trash2 className="h-5 w-5" /></Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => set('prices', [...d.prices, { item_vi: '', price: '', unit: t('venues.p.unitDefault'), verified_at: new Date().toISOString().slice(0, 10) }])}>
          <Plus className="h-5 w-5" /> {t('venues.p.add')}
        </Button>
      </Section>
      <FormError message={err} />
      <StickyActions><Button size="full" onClick={save} disabled={!dirty || upd.isPending}>{upd.isPending ? t('venues.saving') : t('venues.save')}</Button></StickyActions>
    </>
  )
}

/** Chủ sân trả lời đánh giá (mỗi đánh giá một lần, hiện công khai dưới đánh giá). */
function OwnerReviews({ venueId }: { venueId: string }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const list = useVenueReviewsForOwner(venueId)
  const reply = useOwnerReply()
  const [txt, setTxt] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  async function send(id: string) {
    setErr(null)
    if (!txt[id]?.trim()) return setErr(t('venues.s.err.reply_required'))
    try { await reply.mutateAsync({ id, reply: txt[id] }); toast(t('venues.o.replied')) } catch (e) { setErr(surveyErr(e, t)) }
  }
  const rows = list.data ?? []
  return (
    <Section title={t('venues.o.reviews', { n: rows.length })}>
      <p className="text-sm text-navy/70">{t('venues.o.reviewsHint')}</p>
      <FormError message={err ?? (list.error ? surveyErr(list.error, t) : null)} />
      {!rows.length && !list.isPending && <p className="text-sm text-navy/60">{t('venues.r.none')}</p>}
      {rows.map((r) => (
        <article key={r.id} className="space-y-2 border-t border-navy/10 pt-3 first:border-0 first:pt-0">
          <p className="flex flex-wrap items-center gap-2 text-sm"><Stars n={r.stars} /> <b>{r.author}</b> <span className="text-navy/60">{fmtDate(r.created_at, i18n.language)}</span></p>
          {r.body && <p className="text-sm whitespace-pre-line">{r.body}</p>}
          {r.owner_reply ? <p className="rounded-lg bg-cream px-3 py-2 text-sm"><b>{t('venues.r.ownerReply')}:</b> {r.owner_reply}</p> : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input className="min-w-0 flex-1" maxLength={1000} aria-label={t('venues.o.replyPh')} placeholder={t('venues.o.replyPh')} value={txt[r.id] ?? ''} onChange={(e) => setTxt({ ...txt, [r.id]: e.target.value })} />
              <Button variant="outline" onClick={() => send(r.id)} disabled={reply.isPending}>{t('venues.o.reply')}</Button>
            </div>
          )}
        </article>
      ))}
    </Section>
  )
}
