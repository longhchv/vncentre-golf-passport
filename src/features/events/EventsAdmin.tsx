import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { invokeFunction } from '@/lib/functions'
import { formatDate } from '@/lib/i18nField'
import { usePublicBaseUrl } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'

export type EventStatus = 'draft' | 'open' | 'closed' | 'archived'
export const EVENT_TONE: Record<EventStatus, 'neutral' | 'good' | 'warn' | 'bad'> = { draft: 'neutral', open: 'good', closed: 'warn', archived: 'neutral' }

interface EventRow {
  id: string
  class_id: string
  name_vi: string
  name_en: string
  event_date: string
  venue: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
  self_claim_closes_at: string | null
  status: EventStatus
  zalo_oa_url: string | null
}
interface EventListRow { id: string; name_vi: string; event_date: string; venue: string | null; status: EventStatus; cards: number; registered: number; completed: number; staff: number }
interface Station { id: string; code: string; name_vi: string; name_en: string; sort_order: number; max_score: number | null; score_step: number; min_score_to_complete: number }

// datetime-local (giờ máy) ↔ ISO
const toLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)

/** Admin · Sự kiện (module Trải nghiệm sự kiện, E1): danh sách và tạo sự kiện mới. */
export function EventsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const list = useQuery({
    queryKey: ['admin_events'],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('admin_events')
      if (error) throw error
      return data as EventListRow[]
    },
  })
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase!.rpc('admin_create_event', { p_data: { name_vi: name.trim(), event_date: date } })
      if (error) throw error
      return data as string
    },
    onSuccess: (id) => navigate(`/admin/events/${id}`),
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('events.title')}</h1>
      <Card className="space-y-3 p-4">
        <p className="font-semibold">{t('events.create')}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <Field label={t('events.name')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t('events.date')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Button disabled={!name.trim() || !date || create.isPending} onClick={() => create.mutate()}><Plus className="h-4 w-4" /> {t('events.createButton')}</Button>
        </div>
        <p className="text-sm text-navy/60">{t('events.createHint')}</p>
      </Card>
      <TableWrap>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>{t('events.name')}</th>
              <th className={th}>{t('events.date')}</th>
              <th className={th}>{t('fields.status')}</th>
              <th className={`${th} text-right`}>{t('events.cards')}</th>
              <th className={`${th} text-right`}>{t('events.registered')}</th>
              <th className={`${th} text-right`}>{t('events.completed')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/10">
            {list.data?.map((e) => (
              <tr key={e.id} className="cursor-pointer hover:bg-navy/3" onClick={() => navigate(`/admin/events/${e.id}`)}>
                <td className={td}><span className="font-semibold">{e.name_vi}</span>{e.venue && <div className="text-sm text-navy/55">{e.venue}</div>}</td>
                <td className={`${td} whitespace-nowrap`}>{formatDate(e.event_date, i18n.language)}</td>
                <td className={td}><Badge tone={EVENT_TONE[e.status]}>{t(`events.status.${e.status}`)}</Badge></td>
                <td className={`${td} text-right`}>{e.cards}</td>
                <td className={`${td} text-right`}>{e.registered}</td>
                <td className={`${td} text-right`}>{e.completed}</td>
              </tr>
            ))}
            {list.data?.length === 0 && <tr><td className={`${td} text-navy/50`} colSpan={6}>{t('common.empty')}</td></tr>}
          </tbody>
        </table>
      </TableWrap>
    </div>
  )
}

/** Admin · Chi tiết sự kiện (E1): thông tin, 4 trạm, lô thẻ (xuất decal), nhân viên quầy. */
export function EventDetailPage() {
  const { eventId = '' } = useParams()
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const { data, error } = await supabase!.from('events').select('*').eq('id', eventId).single()
      if (error) throw error
      return data as EventRow
    },
  })
  return (
    <div className="space-y-5">
      <Link to="/admin/events" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze"><ArrowLeft className="h-4 w-4" /> {t('events.title')}</Link>
      {!q.data ? <p className="text-navy/60">{t('common.loading')}</p> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold">{q.data.name_vi}</h1>
            <Button asChild><Link to={`/event/${eventId}`}>{t('events.openCounter')}</Link></Button>
          </div>
          <EventInfo event={q.data} />
          <Stations eventId={eventId} />
          <CardBatches eventId={eventId} />
          <Staff eventId={eventId} />
        </>
      )}
    </div>
  )
}

function EventInfo({ event }: { event: EventRow }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState(event)
  useEffect(() => setF(event), [event])
  const set = (k: keyof EventRow) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const setDt = (k: keyof EventRow) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: fromLocal(e.target.value) }))
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.from('events').update({
        name_vi: f.name_vi.trim(), name_en: f.name_en.trim() || f.name_vi.trim(), event_date: f.event_date, venue: f.venue?.trim() || null,
        registration_opens_at: f.registration_opens_at, registration_closes_at: f.registration_closes_at,
        self_claim_closes_at: f.self_claim_closes_at, status: f.status, zalo_oa_url: f.zalo_oa_url?.trim() || null,
      }).eq('id', event.id)
      if (error) throw error
    },
    onSuccess: () => { toast(t('common.saved')); qc.invalidateQueries({ queryKey: ['event', event.id] }); qc.invalidateQueries({ queryKey: ['admin_events'] }) },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  return (
    <Card className="space-y-3 p-4">
      <p className="font-semibold">{t('events.info')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('events.name') + ' (VI)'}><Input value={f.name_vi} onChange={set('name_vi')} /></Field>
        <Field label={t('events.name') + ' (EN)'}><Input value={f.name_en} onChange={set('name_en')} /></Field>
        <Field label={t('events.date')}><Input type="date" value={f.event_date} onChange={set('event_date')} /></Field>
        <Field label={t('events.venue')}><Input value={f.venue ?? ''} onChange={set('venue')} /></Field>
        <Field label={t('events.regOpens')}><Input type="datetime-local" value={toLocal(f.registration_opens_at)} onChange={setDt('registration_opens_at')} /></Field>
        <Field label={t('events.regCloses')}><Input type="datetime-local" value={toLocal(f.registration_closes_at)} onChange={setDt('registration_closes_at')} /></Field>
        <Field label={t('events.claimCloses')} hint={t('events.claimClosesHint')}><Input type="datetime-local" value={toLocal(f.self_claim_closes_at)} onChange={setDt('self_claim_closes_at')} /></Field>
        <Field label={t('events.zalo')}><Input value={f.zalo_oa_url ?? ''} onChange={set('zalo_oa_url')} placeholder="https://zalo.me/…" /></Field>
        <Field label={t('fields.status')} hint={t('events.statusHint')}>
          <Select value={f.status} onChange={set('status')}>
            {(['draft', 'open', 'closed', 'archived'] as const).map((s) => <option key={s} value={s}>{t(`events.status.${s}`)}</option>)}
          </Select>
        </Field>
      </div>
      <Button disabled={!f.name_vi.trim() || save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>
    </Card>
  )
}

function Stations({ eventId }: { eventId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({
    queryKey: ['event_stations', eventId],
    queryFn: async () => {
      const { data, error } = await supabase!.from('event_stations').select('*').eq('event_id', eventId).order('sort_order')
      if (error) throw error
      return data as Station[]
    },
  })
  const [rows, setRows] = useState<Station[]>([])
  useEffect(() => { if (q.data) setRows(q.data) }, [q.data])
  const upd = (i: number, k: keyof Station, v: string) => setRows((r) => r.map((s, j) => (j === i ? {
    ...s, [k]: k === 'max_score' ? (v === '' ? null : Number(v)) : k === 'score_step' || k === 'min_score_to_complete' ? Number(v) : v,
  } : s)))
  const save = useMutation({
    mutationFn: async () => {
      for (const s of rows) {
        const { error } = await supabase!.from('event_stations').update({
          name_vi: s.name_vi, name_en: s.name_en, max_score: s.max_score, score_step: s.score_step, min_score_to_complete: s.min_score_to_complete,
        }).eq('id', s.id)
        if (error) throw error
      }
    },
    onSuccess: () => { toast(t('common.saved')); qc.invalidateQueries({ queryKey: ['event_stations', eventId] }) },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  return (
    <Card className="space-y-3 p-4">
      <p className="font-semibold">{t('events.stations')}</p>
      <TableWrap>
        <table className="w-full border-collapse">
          <thead><tr>
            <th className={th}>{t('events.stationName')} (VI)</th><th className={th}>(EN)</th>
            <th className={th}>{t('events.step')}</th><th className={th}>{t('events.minToComplete')}</th><th className={th}>{t('events.maxScore')}</th>
          </tr></thead>
          <tbody className="divide-y divide-navy/10">
            {rows.map((s, i) => (
              <tr key={s.id}>
                <td className={td}><Input value={s.name_vi} onChange={(e) => upd(i, 'name_vi', e.target.value)} /></td>
                <td className={td}><Input value={s.name_en} onChange={(e) => upd(i, 'name_en', e.target.value)} /></td>
                <td className={td}><Input inputMode="numeric" className="w-20" value={s.score_step} onChange={(e) => upd(i, 'score_step', e.target.value)} /></td>
                <td className={td}><Input inputMode="numeric" className="w-20" value={s.min_score_to_complete} onChange={(e) => upd(i, 'min_score_to_complete', e.target.value)} /></td>
                <td className={td}><Input inputMode="numeric" className="w-24" placeholder={t('events.noMax')} value={s.max_score ?? ''} onChange={(e) => upd(i, 'max_score', e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="text-sm text-navy/60">{t('events.stationsHint')}</p>
      <Button disabled={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>
    </Card>
  )
}

function CardBatches({ eventId }: { eventId: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const baseUrl = usePublicBaseUrl()
  const [qty, setQty] = useState('20')
  const q = useQuery({
    queryKey: ['passport_batches', 'event', eventId],
    queryFn: async () => {
      const { data, error } = await supabase!.from('passport_batches').select('id, name, quantity, exported_at, created_at').eq('event_id', eventId).order('created_at')
      if (error) throw error
      return data as { id: string; name: string; quantity: number; exported_at: string | null; created_at: string }[]
    },
  })
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('create_event_card_batch', { p_event_id: eventId, p_quantity: Number(qty) })
      if (error) throw error
    },
    onSuccess: () => { toast(t('events.batchCreated')); qc.invalidateQueries({ queryKey: ['passport_batches'] }); qc.invalidateQueries({ queryKey: ['admin_events'] }) },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  const n = Number(qty)
  return (
    <Card className="space-y-3 p-4">
      <p className="font-semibold">{t('events.cardBatches')}</p>
      <p className="text-sm text-navy/65">{t('events.qrPointsTo', { url: `${baseUrl}/p/…` })}</p>
      {!baseUrl.includes('app.vncentre.net') && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{t('events.notProductionDomain')}</p>}
      <ul className="space-y-1">
        {q.data?.map((b) => (
          <li key={b.id}>
            <Link to={`/admin/passports/${b.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-navy/5 p-3 hover:bg-navy/10">
              <span className="font-semibold">{b.name}</span>
              <span className="text-sm text-navy/60">{t('events.cardsN', { count: b.quantity })} · {formatDate(b.created_at, i18n.language)}{b.exported_at ? ` · ${t('events.exported')}` : ''}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('events.quantity')}><Input inputMode="numeric" className="w-28" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} /></Field>
        <Button disabled={!(n >= 1 && n <= 5000) || create.isPending} onClick={() => create.mutate()}><Plus className="h-4 w-4" /> {t('events.createBatch')}</Button>
      </div>
      <p className="text-sm text-navy/60">{t('events.decalHint')}</p>
    </Card>
  )
}

function Staff({ eventId }: { eventId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const list = useQuery({
    queryKey: ['event_staff_list', eventId],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('event_staff_list', { p_event_id: eventId })
      if (error) throw error
      return data as { user_id: string; full_name: string | null; email: string | null; status: string }[]
    },
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['event_staff_list', eventId] }); qc.invalidateQueries({ queryKey: ['admin_events'] }) }
  const add = useMutation({
    mutationFn: async () => {
      // Tạo tài khoản nhân viên (hoặc dùng tài khoản đã có theo email), rồi gán cho sự kiện này
      const r = await invokeFunction<{ user_id: string; link: string | null; email_sent: boolean; existed: boolean }>('admin-users', {
        action: 'create_staff', email: email.trim(), full_name: name.trim(), role: 'event_staff',
      })
      const { error } = await supabase!.rpc('set_event_staff', { p_event_id: eventId, p_user_id: r.user_id, p_on: true })
      if (error) throw error
      return r
    },
    onSuccess: (r) => {
      toast(r.existed ? t('events.staffAddedExisting') : r.email_sent ? t('events.staffInvited') : t('events.staffAdded'))
      setLink(r.link)
      setEmail(''); setName('')
      refresh()
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  const remove = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase!.rpc('set_event_staff', { p_event_id: eventId, p_user_id: userId, p_on: false })
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  return (
    <Card className="space-y-3 p-4">
      <p className="font-semibold">{t('events.staff')}</p>
      <p className="text-sm text-navy/60">{t('events.staffHint')}</p>
      <ul className="space-y-1">
        {list.data?.map((s) => (
          <li key={s.user_id} className="flex items-center justify-between gap-2 rounded-xl bg-navy/5 px-3 py-2">
            <span><span className="font-semibold">{s.full_name || '—'}</span> <span className="text-sm text-navy/55">{s.email}</span></span>
            <Button size="sm" variant="ghost" aria-label={t('common.remove')} onClick={() => remove.mutate(s.user_id)}><Trash2 className="h-4 w-4" /></Button>
          </li>
        ))}
        {list.data?.length === 0 && <li className="text-sm text-navy/55">{t('common.empty')}</li>}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label={t('auth.email')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={t('fields.fullName')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Button disabled={!email.includes('@') || !name.trim() || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> {t('events.addStaff')}</Button>
      </div>
      {link && (
        <div className="space-y-1 rounded-xl bg-gold/15 p-3 text-sm">
          <p>{t('events.staffLinkHint')}</p>
          <Input readOnly value={link} onFocus={(e) => e.target.select()} />
        </div>
      )}
      <FormError message={null} />
    </Card>
  )
}
