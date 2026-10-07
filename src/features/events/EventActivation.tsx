import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { formatCode } from '@/lib/codes'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/form'
import { COUNTRIES, toE164 } from '@/features/auth/phone'

type T = (k: string, o?: Record<string, unknown>) => string
interface LinkedCard { code: string; masked_name: string; completed: boolean; activated: boolean }
interface PhoneCheck { result: string; remaining?: number; completed?: boolean; new_phone?: boolean; cards?: LinkedCard[] }
interface CodeSent { otp_id: string; masked: string; resend_after: number; expires_in: number }

class ActivateError extends Error {
  constructor(public code: string, public detail: Record<string, unknown>) { super(code) }
}

async function callActivate<R>(body: Record<string, unknown>): Promise<R> {
  const { data, error } = await supabase!.functions.invoke('event-activate', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = (ctx ? await ctx.json().catch(() => null) : null) ?? {}
    throw new ActivateError(detail.error ?? 'server_error', detail)
  }
  return data as R
}

function errorText(t: T, e: unknown) {
  if (e instanceof ActivateError) {
    const d = e.detail as Record<string, unknown>
    return t(`eventActivate.errors.${e.code}`, { defaultValue: t('errors.generic'), ...d })
  }
  const code = String((e as { message?: string })?.message ?? '').split(':')[0]
  return t(`eventActivate.errors.${code}`, { defaultValue: t('errors.generic') })
}

/** Kết quả kiểm tra SĐT (E-R3) → câu báo; null khi khớp. */
function phoneResultText(t: T, r: PhoneCheck) {
  if (r.result === 'ok') return null
  if (r.result === 'wrong') return t('eventActivate.errors.phone_wrong', { remaining: r.remaining })
  return t(`eventActivate.errors.phone_${r.result}`, { defaultValue: t('errors.generic') })
}

/**
 * Tạo tài khoản từ thẻ sự kiện đã hoàn thành (E6), xác thực qua EMAIL:
 * SĐT đã ghi khi nhận thẻ (khớp đủ số, E-R3) → email → mã 6 số + mật khẩu + đồng ý → vào /app.
 * Đã đăng nhập (vd. email đã có tài khoản): chỉ cần SĐT để nối thẻ vào tài khoản hiện tại.
 */
export function EventActivation({ code }: { code: string }) {
  const { t, i18n } = useTranslation()
  const { session } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const en = i18n.language === 'en'
  const [dial, setDial] = useState('84')
  const [phone, setPhone] = useState('')
  const [check, setCheck] = useState<PhoneCheck | null>(null)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<CodeSent | null>(null)
  const [digits, setDigits] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [contact, setContact] = useState(false)
  const [photo, setPhoto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasAccount, setHasAccount] = useState(false)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (!sent) return
    setWait(sent.resend_after)
    const id = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [sent])

  const e164 = () => toE164(dial, phone)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try { await fn() } catch (e) {
      if (e instanceof ActivateError && e.code === 'email_has_account') setHasAccount(true)
      setError(errorText(t, e))
    } finally { setBusy(false) }
  }

  // Bước 1: SĐT
  function submitPhone(e: FormEvent) {
    e.preventDefault()
    const p = e164()
    if (!p) return setError(t('auth.invalidPhone'))
    run(async () => {
      if (session) {
        // Đã đăng nhập: kiểm tra SĐT và nối luôn vào tài khoản này
        const { data, error } = await supabase!.rpc('event_link_card_to_me', {
          p_code: code, p_data: { phone: p, contact_consent: contact, photo_consent: photo },
        })
        if (error) throw error
        const r = data as PhoneCheck
        const msg = phoneResultText(t, r)
        if (msg) return setError(msg)
        await qc.invalidateQueries()
        navigate('/app', { replace: true })
        return
      }
      const { data, error } = await supabase!.rpc('event_phone_check', { p_code: code, p_phone: p })
      if (error) throw error
      const r = data as PhoneCheck
      const msg = phoneResultText(t, r)
      if (msg) return setError(msg)
      setCheck(r)
    })
  }

  // Bước 2: email → gửi mã
  function sendCode(e?: FormEvent) {
    e?.preventDefault()
    setHasAccount(false)
    run(async () => {
      const r = await callActivate<CodeSent>({ action: 'send_code', code, phone: e164(), email: email.trim(), lang: en ? 'en' : 'vi' })
      setSent(r)
      setDigits('')
    })
  }

  // Bước 3: mã + mật khẩu + đồng ý → tạo tài khoản, đăng nhập
  function create(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      const r = await callActivate<{ ok: boolean; access_token?: string; refresh_token?: string }>({
        action: 'verify_and_create', otp_id: sent!.otp_id, code_digits: digits, password,
        full_name: fullName.trim(), contact_consent: contact, photo_consent: photo,
      })
      if (r.access_token && r.refresh_token) {
        await supabase!.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token })
        navigate('/app', { replace: true })
      } else {
        navigate(`/login?tab=parent&next=/app`, { replace: true })
      }
    })
  }

  const consents = (
    <div className="space-y-1">
      <Checkbox label={t('eventCard.contactConsent')} checked={contact} onChange={(e) => setContact(e.target.checked)} />
      <Checkbox label={t('eventActivate.photoConsent')} checked={photo} onChange={(e) => setPhoto(e.target.checked)} />
      <p className="text-sm text-navy/60">
        {t('eventActivate.agreeLine')}{' '}
        <Link to="/terms" target="_blank" className="text-bronze underline">{t('pages.terms')}</Link>
        {' · '}
        <Link to="/privacy" target="_blank" className="text-bronze underline">{t('pages.privacy')}</Link>
      </p>
    </div>
  )

  const phoneField = (
    <Field label={t('eventActivate.phoneLabel')} hint={t('eventActivate.phoneHint')}>
      <div className="flex gap-2">
        <Select value={dial} onChange={(e) => setDial(e.target.value)} className="w-28 shrink-0" aria-label={t('auth.countryCode')}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.dial}>+{c.dial} {en ? c.name_en : c.name_vi}</option>)}
        </Select>
        <Input type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912 345 678" required />
      </div>
    </Field>
  )

  // Đã đăng nhập: một bước
  if (session) {
    return (
      <form onSubmit={submitPhone} className="space-y-4 text-left">
        <p className="font-semibold">{t('eventActivate.linkToMeTitle', { email: session.user.email ?? '' })}</p>
        {phoneField}
        {consents}
        <FormError message={error} />
        <Button type="submit" size="full" disabled={busy || !phone.trim()}>{busy ? t('common.loading') : t('eventActivate.linkToMe')}</Button>
      </form>
    )
  }

  if (!check) {
    return (
      <form onSubmit={submitPhone} className="space-y-4 text-left">
        <p className="font-semibold">{t('eventActivate.title')}</p>
        <p className="text-sm text-navy/70">{t('eventActivate.intro')}</p>
        {phoneField}
        <FormError message={error} />
        <Button type="submit" size="full" disabled={busy || !phone.trim()}>{busy ? t('common.loading') : t('eventActivate.next')}</Button>
        <p className="text-center text-sm text-navy/60">
          {t('eventActivate.haveAccount')}{' '}
          <Link to={`/login?tab=parent&next=${encodeURIComponent(`/p/${code}`)}`} className="font-semibold text-bronze">{t('pages.login')}</Link>
        </p>
      </form>
    )
  }

  const cards = (check.cards ?? []).filter((c) => !c.activated)
  const cardList = cards.length > 1 && (
    <div className="rounded-xl bg-navy/5 p-3">
      <p className="text-sm font-semibold">{t('eventActivate.cardsTogether', { n: cards.length })}</p>
      <ul className="mt-1 space-y-0.5 text-sm text-navy/75">
        {cards.map((c) => (
          <li key={c.code} className="flex items-center gap-2">
            {c.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <span className="h-4 w-4" />}
            {c.masked_name} · {formatCode(c.code)}{!c.completed && ` (${t('eventCard.completion.registered')})`}
          </li>
        ))}
      </ul>
    </div>
  )

  if (!sent) {
    return (
      <form onSubmit={sendCode} className="space-y-4 text-left">
        <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> {t('eventActivate.phoneOk')}</p>
        {cardList}
        <Field label={t('eventActivate.emailLabel')} hint={t('eventActivate.emailHint')}>
          <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <FormError message={error} />
        {hasAccount && (
          <Button asChild variant="outline" size="full">
            <Link to={`/login?tab=parent&next=${encodeURIComponent(`/p/${code}`)}`}>{t('eventActivate.loginToLink')}</Link>
          </Button>
        )}
        <Button type="submit" size="full" disabled={busy || !email.trim()}><Mail className="h-5 w-5" /> {busy ? t('common.loading') : t('eventActivate.sendCode')}</Button>
      </form>
    )
  }

  return (
    <form onSubmit={create} className="space-y-4 text-left">
      <p className="text-navy/80">{t('eventActivate.codeSent', { email: sent.masked })}</p>
      <p className="rounded-xl bg-gold/15 p-3 text-sm text-brown">{t('eventActivate.spamHint')}</p>
      <Field label={t('otp.codeLabel')}>
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={digits}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
      </Field>
      <Field label={t('eventActivate.passwordLabel')} hint={t('eventActivate.passwordHint')}>
        <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Field label={t('eventActivate.yourName')} hint={t('eventActivate.yourNameHint')}>
        <Input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      {cardList}
      {consents}
      <FormError message={error} />
      <Button type="submit" size="full" disabled={busy || digits.length !== 6 || !password}>{busy ? t('common.loading') : t('eventActivate.create')}</Button>
      <div className="flex justify-between text-sm">
        <button type="button" className="font-semibold text-bronze" onClick={() => { setSent(null); setError(null) }}>{t('eventActivate.changeEmail')}</button>
        <button type="button" className="font-semibold text-bronze disabled:text-navy/40" disabled={wait > 0 || busy} onClick={() => sendCode()}>
          {wait > 0 ? t('otp.resendIn', { seconds: wait }) : t('otp.resend')}
        </button>
      </div>
    </form>
  )
}
