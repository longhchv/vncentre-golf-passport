import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCode } from '@/lib/codes'
import { formatDate } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { COUNTRIES, toE164 } from '@/features/auth/phone'
import { EventActivation } from './EventActivation'
import { SelfClaim } from './SelfClaim'

export interface EventCardStatus {
  result: 'ok' | 'not_found'
  code: string
  card_status: 'unassigned' | 'event_registered' | 'active' | 'void' | 'retired' | 'lost'
  event: { id: string; name_vi: string; name_en: string; event_date: string; venue: string | null; zalo_oa_url: string | null
    status: string; registration_open: boolean; claim_open: boolean }
  participation: null | { masked_name: string; player_type: 'self' | 'child'; completion_status: 'registered' | 'pending_review' | 'completed' | 'rejected'
    completed_at: string | null; locked: boolean; reject_reason: string | null; points: { total: number; redeemed: number; balance: number } }
}

export interface RegistrationData { player_type: 'self' | 'child'; full_name: string; phone: string | null; age: string; residence: string; contact_consent: boolean }

/** Lỗi từ hàm CSDL → câu song ngữ */
export function eventErrorText(t: (k: string, o?: Record<string, unknown>) => string, e: unknown) {
  const [code, detail] = String((e as { message?: string })?.message ?? '').split(':')
  return t(`eventCard.errors.${code}`, { defaultValue: t('errors.generic'), detail })
}

/**
 * Form ghi tên một màn hình (E2). Tự ghi tên: bắt buộc SĐT; nhân viên ghi hộ: SĐT tuỳ chọn (quyết định 8).
 * Không gửi OTP, không tạo tài khoản (E-R2).
 */
export function RegistrationForm({ staff, busy, error, onSubmit }: {
  staff?: boolean
  busy: boolean
  error: string | null
  onSubmit: (d: RegistrationData) => void
}) {
  const { t, i18n } = useTranslation()
  const en = i18n.language === 'en'
  const [type, setType] = useState<'self' | 'child' | null>(null)
  const [name, setName] = useState('')
  const [dial, setDial] = useState('84')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState('')
  const [residence, setResidence] = useState('')
  const [contact, setContact] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    let e164: string | null = null
    if (phone.trim()) {
      e164 = toE164(dial, phone)
      if (!e164) return setLocalError(t('auth.invalidPhone'))
    } else if (!staff) return setLocalError(t('eventCard.errors.phone_required'))
    onSubmit({ player_type: type!, full_name: name.trim(), phone: e164, age, residence, contact_consent: contact })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-navy/80">{t('eventCard.whoPlays')} *</p>
        <div className="grid grid-cols-2 gap-2">
          {(['self', 'child'] as const).map((k) => (
            <Button key={k} type="button" variant={type === k ? 'primary' : 'outline'} onClick={() => setType(k)}>{t(`eventCard.playerType.${k}`)}</Button>
          ))}
        </div>
      </div>
      <Field label={t('eventCard.playerName') + ' *'}>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      </Field>
      <Field label={t('eventCard.contactPhone') + (staff ? '' : ' *')} hint={staff ? t('eventCard.phoneOptionalStaff') : t('eventCard.phoneHint')}>
        <div className="flex gap-2">
          <Select value={dial} onChange={(e) => setDial(e.target.value)} className="w-28 shrink-0" aria-label={t('auth.countryCode')}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.dial}>+{c.dial} {en ? c.name_en : c.name_vi}</option>)}
          </Select>
          <Input type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912 345 678" />
        </div>
      </Field>
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <Field label={t('eventCard.age')}><Input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} /></Field>
        <Field label={t('eventCard.residence')}><Input value={residence} onChange={(e) => setResidence(e.target.value)} /></Field>
      </div>
      <Checkbox label={t('eventCard.contactConsent')} checked={contact} onChange={(e) => setContact(e.target.checked)} />
      {!staff && (
        <p className="text-sm text-navy/60">
          {t('eventCard.agreeLine')}{' '}
          <Link to="/terms" target="_blank" className="text-bronze underline">{t('pages.terms')}</Link>
          {' · '}
          <Link to="/privacy" target="_blank" className="text-bronze underline">{t('pages.privacy')}</Link>
        </p>
      )}
      <FormError message={localError ?? error} />
      <Button type="submit" size="full" disabled={busy || !type || !name.trim()}>{busy ? t('common.loading') : t('eventCard.register')}</Button>
    </form>
  )
}

/** /p/{mã} với thẻ hạng "Trải nghiệm sự kiện" (E2, trạng thái thẻ). */
export function EventCardPage({ code }: { code: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const en = i18n.language === 'en'
  const [done, setDone] = useState<{ masked_name: string; code: string } | null>(null)
  const q = useQuery({
    queryKey: ['event_card_status', code],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('event_card_status', { p_code: code })
      if (error) throw error
      return data as EventCardStatus
    },
  })
  const register = useMutation({
    mutationFn: async (d: RegistrationData) => {
      const { data, error } = await supabase!.rpc('event_register', { p_code: code, p_data: d })
      if (error) throw error
      return data as { masked_name: string; code: string }
    },
    onSuccess: (r) => { setDone(r); qc.invalidateQueries({ queryKey: ['event_card_status', code] }) },
  })

  if (q.isPending) return <FullPageSpinner />
  if (q.isError || q.data.result !== 'ok') return <p className="text-center text-red-700">{t('errors.loadFailed')}</p>
  const s = q.data
  const ev = s.event
  const eventName = en ? ev.name_en : ev.name_vi
  const header = (
    <div className="flex flex-col items-center gap-2 text-center">
      <Mascot className="h-24 w-24" />
      <p className="text-sm font-semibold text-bronze">{eventName}</p>
      <p className="text-sm text-navy/60">{[formatDate(ev.event_date, i18n.language), ev.venue].filter(Boolean).join(' · ')}</p>
    </div>
  )
  const zalo = ev.zalo_oa_url && (
    <Button asChild variant="outline" size="full">
      <a href={ev.zalo_oa_url} target="_blank" rel="noreferrer"><MessageCircle className="h-5 w-5" /> {t('eventCard.followZalo')}</a>
    </Button>
  )

  // Vừa ghi tên xong
  if (done) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        {header}
        <Card className="space-y-3 p-5 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <p className="text-lg">{t('eventCard.registeredLine', { name: done.masked_name, code: formatCode(done.code) })}</p>
          <p className="text-navy/75">{t('eventCard.nextSteps')}</p>
        </Card>
        {zalo}
      </div>
    )
  }

  // Thẻ chưa ghi tên
  if (s.card_status === 'unassigned') {
    return (
      <div className="mx-auto max-w-md space-y-4">
        {header}
        {ev.registration_open ? (
          <>
            <h1 className="text-center text-xl font-bold">{t('eventCard.registerTitle')}</h1>
            <Card className="p-4">
              <RegistrationForm busy={register.isPending} error={register.isError ? eventErrorText(t, register.error) : null} onSubmit={(d) => register.mutate(d)} />
            </Card>
          </>
        ) : (
          <Card className="p-5 text-center text-navy/75">{ev.status === 'draft' ? t('eventCard.notOpenYet') : t('eventCard.registrationClosed')}</Card>
        )}
        <p className="text-center text-xs text-navy/45">{formatCode(s.code)}</p>
      </div>
    )
  }

  // Thẻ huỷ / đã nâng hạng
  if (s.card_status === 'void' || s.card_status === 'retired' || s.card_status === 'lost' || !s.participation) {
    return <div className="mx-auto max-w-md space-y-4">{header}<Card className="p-5 text-center">{t('eventCard.cardInactive')}</Card></div>
  }

  const p = s.participation
  return (
    <div className="mx-auto max-w-md space-y-4">
      {header}
      <Card className="space-y-3 p-5 text-center">
        <p className="text-lg font-bold">{p.masked_name}</p>
        <Badge tone={p.completion_status === 'completed' ? 'good' : p.completion_status === 'rejected' ? 'bad' : 'warn'}>
          {t(`eventCard.completion.${p.completion_status}`)}
        </Badge>
        {p.completion_status === 'completed' ? (
          <>
            <p className="text-xl font-bold text-emerald-700">{t('eventCard.congrats')}</p>
            {s.card_status === 'active' ? (
              <>
                <p className="text-navy/75">{t('eventActivate.alreadyActivated')}</p>
                <Button asChild size="full"><Link to="/login?tab=parent&next=/app">{t('eventActivate.openAccount')}</Link></Button>
              </>
            ) : (
              <EventActivation code={s.code} />
            )}
          </>
        ) : p.completion_status === 'pending_review' ? (
          <p className="text-navy/75">{t('eventCard.pendingReview')}</p>
        ) : (
          <>
            <p className="text-navy/75">{t('eventCard.notCompleted')}</p>
            {p.completion_status === 'rejected' && p.reject_reason && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{t('eventCard.rejectedReason', { reason: p.reject_reason })}</p>
            )}
            {ev.claim_open && <SelfClaim code={s.code} />}
          </>
        )}
        <div className="rounded-xl bg-gold/15 p-3">
          <p className="text-sm text-navy/65">{t('eventCard.points')}</p>
          <p className="text-3xl font-bold">{p.points.balance}</p>
          {p.points.redeemed > 0 && <p className="text-xs text-navy/55">{t('eventCard.pointsDetail', { total: p.points.total, redeemed: p.points.redeemed })}</p>}
          <p className="text-xs text-navy/55">{t('eventCard.pointsJourney')}</p>
        </div>
      </Card>
      {zalo}
      <p className="text-center text-xs text-navy/45">{formatCode(s.code)}</p>
    </div>
  )
}
