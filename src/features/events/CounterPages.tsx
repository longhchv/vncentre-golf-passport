import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, Gift, QrCode, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { checkCode, formatCode } from '@/lib/codes'
import { formatDate, formatDateTime } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Field, FormError, Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { QrScanner } from '@/features/passports/QrScanner'
import { eventErrorText, RegistrationForm, type RegistrationData } from './EventCard'
import { EVENT_TONE, type EventStatus } from './EventsAdmin'
import { ClaimsQueue, LiveBoard } from './EventMonitor'

interface MyEvent { id: string; name_vi: string; name_en: string; event_date: string; venue: string | null; status: EventStatus }
interface Station { id: string; code: string; name_vi: string; name_en: string; score_step: number; min_score_to_complete: number; max_score: number | null; score: number | null }
interface CounterCard {
  result: 'ok' | 'not_found'
  code: string
  card_status: string
  same_event: boolean
  card_event_name: string
  registration_open: boolean
  participation: null | { full_name: string; player_type: 'self' | 'child'; completion_status: string; completed_via: string | null; completed_at: string | null }
  stations: Station[]
  points: { total: number; redeemed: number; balance: number }
  redemptions: { points: number; gift_label: string | null; redeemed_at: string; event_name: string }[]
}

const rpc = async <T,>(fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) throw error
  return data as T
}

/** Nhân viên sự kiện · danh sách sự kiện được giao. */
export function EventStaffHome() {
  const { t, i18n } = useTranslation()
  const q = useQuery({ queryKey: ['my_events'], queryFn: () => rpc<MyEvent[]>('my_events', {}) })
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t('counter.myEvents')}</h1>
      {q.data?.length === 0 && <Card className="p-5 text-center text-navy/65">{t('counter.noEvents')}</Card>}
      <ul className="space-y-2">
        {q.data?.map((e) => (
          <li key={e.id}>
            <Link to={`/event/${e.id}`} className="block">
              <Card className="space-y-1 p-4 hover:border-bronze">
                <p className="font-semibold">{i18n.language === 'en' ? e.name_en : e.name_vi}</p>
                <p className="text-sm text-navy/60">{[formatDate(e.event_date, i18n.language), e.venue].filter(Boolean).join(' · ')}</p>
                <Badge tone={EVENT_TONE[e.status]}>{t(`events.status.${e.status}`)}</Badge>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Quầy đổi quà (E4): quét thẻ → (ghi tên hộ) → nhập 4 điểm → Hoàn thành (chứng nhận) → đổi quà bằng điểm (B18).
 * Không hiện SĐT, email người chơi (E-R12). Mục tiêu dưới 20 giây mỗi thẻ.
 */
export function CounterPage() {
  const { eventId = '' } = useParams()
  const { t, i18n } = useTranslation()
  const [code, setCode] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [scanKey, setScanKey] = useState(0)
  const ev = useQuery({ queryKey: ['my_events'], queryFn: () => rpc<MyEvent[]>('my_events', {}) })
  const event = ev.data?.find((e) => e.id === eventId)

  function next() {
    setCode(null)
    setManual('')
    setScanKey((k) => k + 1)
  }
  function submitManual(e: FormEvent) {
    e.preventDefault()
    const c = checkCode(manual, 'passport')
    if (c.ok) setCode(c.code)
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link to="/event" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze"><ArrowLeft className="h-4 w-4" /> {t('counter.myEvents')}</Link>
      <div>
        <h1 className="text-xl font-bold">{t('counter.title')}</h1>
        {event && <p className="text-sm text-navy/60">{i18n.language === 'en' ? event.name_en : event.name_vi}</p>}
      </div>
      {!code ? (
        <Card className="space-y-3 p-4">
          <QrScanner key={scanKey} onCode={(c) => setCode(c)} hint={t('counter.scanHint')} />
          <form onSubmit={submitManual} className="flex gap-2">
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="XXXX-XXXX" className="font-mono uppercase tracking-widest" autoCapitalize="characters" />
            <Button type="submit" disabled={!checkCode(manual, 'passport').ok}>{t('counter.open')}</Button>
          </form>
        </Card>
      ) : (
        <CardPanel eventId={eventId} code={code} onNext={next} />
      )}
      {!code && <LiveBoard eventId={eventId} />}
      {!code && <ClaimsQueue eventId={eventId} />}
    </div>
  )
}

function CardPanel({ eventId, code, onNext }: { eventId: string; code: string; onNext: () => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const en = i18n.language === 'en'
  const key = ['counter_card', eventId, code]
  const q = useQuery({ queryKey: key, queryFn: () => rpc<CounterCard>('counter_card', { p_event_id: eventId, p_code: code }) })
  const setCard = (c: CounterCard) => qc.setQueryData(key, c)
  const [scores, setScores] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [points, setPoints] = useState('')
  const [gift, setGift] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (q.data?.stations) setScores(Object.fromEntries(q.data.stations.map((s) => [s.code, s.score == null ? '' : String(s.score)])))
  }, [q.data?.code, q.data?.stations])

  const onError = (e: unknown) => setErr(eventErrorText(t, e))
  const register = useMutation({
    mutationFn: (d: RegistrationData) => rpc('event_staff_register', { p_event_id: eventId, p_code: code, p_data: d }),
    onSuccess: () => { setErr(null); qc.invalidateQueries({ queryKey: key }) },
    onError,
  })
  const save = useMutation({
    mutationFn: () => rpc<CounterCard>('counter_save_scores', { p_event_id: eventId, p_code: code, p_scores: scores, p_reason: reason || null }),
    onSuccess: (c) => { setErr(null); setReason(''); setCard(c); toast(t('common.saved')) },
    onError,
  })
  const complete = useMutation({
    mutationFn: async () => {
      // Lưu điểm đang nhập rồi hoàn thành trong một lần bấm
      await rpc('counter_save_scores', { p_event_id: eventId, p_code: code, p_scores: scores, p_reason: null })
      return rpc<CounterCard>('counter_complete', { p_event_id: eventId, p_code: code })
    },
    onSuccess: (c) => { setErr(null); setCard(c) },
    onError,
  })
  const redeem = useMutation({
    mutationFn: () => rpc<CounterCard>('counter_redeem', { p_event_id: eventId, p_code: code, p_points: Number(points), p_gift_label: gift || null }),
    onSuccess: (c) => { setErr(null); setPoints(''); setGift(''); setCard(c); toast(t('counter.redeemed', { balance: c.points.balance })) },
    onError,
  })

  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (q.isError) return <Card className="space-y-3 p-4"><FormError message={eventErrorText(t, q.error)} /><NextButton onNext={onNext} /></Card>
  const c = q.data
  if (c.result === 'not_found') return <Card className="space-y-3 p-4"><p className="font-semibold">{t('counter.notEventCard')}</p><NextButton onNext={onNext} /></Card>

  const p = c.participation
  const completed = p?.completion_status === 'completed'
  // Trạm còn thiếu theo điểm đang nhập (E-R6)
  const missing = c.stations.filter((s) => Number(scores[s.code] || 0) < s.min_score_to_complete)
  const scoreInvalid = c.stations.some((s) => {
    const v = scores[s.code]
    if (v === '' || v == null) return false
    const n = Number(v)
    return !Number.isInteger(n) || n < 0 || n % s.score_step !== 0 || (s.max_score != null && n > s.max_score)
  })

  return (
    <div className="space-y-3">
      <Card className="space-y-1 p-4">
        <p className="font-mono text-sm text-navy/55">{formatCode(c.code)}</p>
        {p ? (
          <>
            <p className="text-2xl font-bold">{p.full_name}</p>
            <div className="flex flex-wrap gap-1">
              <Badge>{t(`eventCard.playerType.${p.player_type}`)}</Badge>
              <Badge tone={completed ? 'good' : 'warn'}>{t(`eventCard.completion.${p.completion_status}`)}</Badge>
            </div>
            {completed && p.completed_at && (
              <p className="text-sm text-emerald-700">{t('counter.completedAt', { time: formatDateTime(p.completed_at, i18n.language) })}</p>
            )}
            {!c.same_event && <p className="text-sm text-brown">{t('counter.otherEvent', { name: c.card_event_name })}</p>}
          </>
        ) : (
          <p className="font-semibold">{t('counter.notRegistered')}</p>
        )}
      </Card>

      <FormError message={err} />

      {/* Thẻ chưa ghi tên → ghi tên hộ trước (E4 bước 2) */}
      {!p && c.same_event && (c.registration_open ? (
        <Card className="space-y-3 p-4">
          <p className="font-semibold">{t('counter.registerOnBehalf')}</p>
          <RegistrationForm staff busy={register.isPending} error={null} onSubmit={(d) => register.mutate(d)} />
        </Card>
      ) : <Card className="p-4 text-navy/70">{t('eventCard.registrationClosed')}</Card>)}

      {/* 4 ô điểm + Hoàn thành (chỉ thẻ của sự kiện này) */}
      {p && c.same_event && (
        <Card className="space-y-3 p-4">
          <p className="font-semibold">{t('counter.scores')}</p>
          <div className="grid grid-cols-2 gap-3">
            {c.stations.map((s) => (
              <Field key={s.code} label={en ? s.name_en : s.name_vi}>
                <Input inputMode="numeric" className="text-center text-2xl font-bold" value={scores[s.code] ?? ''}
                  onChange={(e) => setScores((x) => ({ ...x, [s.code]: e.target.value.replace(/[^0-9]/g, '') }))} />
              </Field>
            ))}
          </div>
          <p className="text-xs text-navy/55">{t('counter.scoreRule', { step: c.stations[0]?.score_step ?? 5, min: c.stations[0]?.min_score_to_complete ?? 5 })}</p>
          {completed && (
            <Field label={t('counter.editReason')}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          )}
          {completed ? (
            <Button variant="outline" size="full" disabled={save.isPending || scoreInvalid || !reason.trim()} onClick={() => save.mutate()}>{t('counter.saveScores')}</Button>
          ) : (
            <>
              {missing.length > 0 && (
                <p className="rounded-xl bg-gold/15 p-2 text-sm text-brown">
                  {t('counter.missing', { stations: missing.map((s) => (en ? s.name_en : s.name_vi)).join(', ') })}
                </p>
              )}
              <Button size="full" className="min-h-14 text-lg" disabled={complete.isPending || scoreInvalid || missing.length > 0} onClick={() => complete.mutate()}>
                <CheckCircle2 className="h-6 w-6" /> {t('counter.complete')}
              </Button>
              <Button variant="ghost" size="full" disabled={save.isPending || scoreInvalid} onClick={() => save.mutate()}>{t('counter.saveOnly')}</Button>
            </>
          )}
        </Card>
      )}

      {/* Đổi quà bằng điểm (B18) */}
      {p && (
        <Card className="space-y-3 p-4">
          <div className="flex items-end justify-between gap-2">
            <p className="flex items-center gap-2 font-semibold"><Gift className="h-5 w-5 text-bronze" /> {t('counter.redeemTitle')}</p>
            <p className="text-right"><span className="text-sm text-navy/60">{t('counter.balance')}</span> <span className="text-2xl font-bold">{c.points.balance}</span></p>
          </div>
          {c.redemptions.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-navy/5 p-2 text-sm">
              {c.redemptions.map((r, i) => (
                <li key={i}>{t('counter.redeemedLine', { points: r.points, gift: r.gift_label ?? '—', time: formatDateTime(r.redeemed_at, i18n.language) })}</li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-[7rem_1fr] gap-2">
            <Field label={t('counter.redeemPoints')}><Input inputMode="numeric" className="text-center text-xl font-bold" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^0-9]/g, ''))} /></Field>
            <Field label={t('counter.giftLabel')}><Input value={gift} onChange={(e) => setGift(e.target.value)} /></Field>
          </div>
          <Button size="full" variant="outline" disabled={redeem.isPending || !(Number(points) > 0) || Number(points) > c.points.balance}
            onClick={() => window.confirm(t('counter.confirmRedeem', { points, balance: c.points.balance - Number(points) })) && redeem.mutate()}>
            {t('counter.redeem')}
          </Button>
        </Card>
      )}

      <NextButton onNext={onNext} />
    </div>
  )
}

function NextButton({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation()
  return (
    <Button size="full" variant="outline" className="min-h-14" onClick={onNext}>
      <QrCode className="h-5 w-5" /> {t('counter.next')} <RotateCcw className="h-4 w-4" />
    </Button>
  )
}
