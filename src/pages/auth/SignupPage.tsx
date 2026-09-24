import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input, Select } from '@/components/ui/form'
import { PhoneField } from '@/features/auth/PhoneField'
import { OtpStep } from '@/features/auth/OtpStep'
import { callOtp, otpErrorText, type OtpSent } from '@/features/auth/otp'
import { isVietnamese, toE164 } from '@/features/auth/phone'
import { setLanguage } from '@/i18n'

type Step = 'phone' | 'otp' | 'profile'

/**
 * F1 · Đăng ký phụ huynh: SĐT → OTP (VN: Zalo → SMS; nước ngoài: email) → mật khẩu + họ tên + email.
 * Email có thể bỏ qua lúc đăng ký (bắt buộc trước khi tải PDF đầu tiên).
 */
export function SignupPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const next = params.get('next') || '/app'

  const [step, setStep] = useState<Step>('phone')
  const [dial, setDial] = useState('84')
  const [local, setLocal] = useState('')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<OtpSent | null>(null)
  const [ticket, setTicket] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const phone = toE164(dial, local)
  const foreign = phone ? !isVietnamese(phone) : dial !== '84'

  async function send() {
    const r = await callOtp<OtpSent>({ action: 'send', purpose: 'signup', phone, email: foreign ? email : undefined, lang: i18n.language })
    setSent(r)
    setStep('otp')
  }

  async function onPhone(e: FormEvent) {
    e.preventDefault()
    if (!phone) return setError(t('auth.invalidPhone'))
    setBusy(true)
    setError(null)
    try {
      await send()
    } catch (err) {
      setError(otpErrorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('signup.title')}</h1>
        <p className="text-sm text-navy/60">{t('signup.stepOf', { n: step === 'phone' ? 1 : step === 'otp' ? 2 : 3 })}</p>
        {step !== 'otp' && <p className="rounded-xl bg-navy/5 p-3 text-sm text-navy/80">{t('signup.accountIntro')}</p>}
      </div>

      {step === 'phone' && (
        <form onSubmit={onPhone} className="space-y-4">
          <PhoneField dial={dial} onDial={setDial} value={local} onChange={setLocal} label={t('signup.parentPhone')} />
          {foreign && (
            <Field label={t('signup.parentEmail') + ' *'} hint={t('signup.foreignEmailHint')}>
              <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          )}
          <FormError message={error} />
          <Button type="submit" size="full" disabled={busy || !local.trim()}>
            {busy ? t('common.loading') : t('signup.sendCode')}
          </Button>
          <p className="text-center text-sm">
            {t('signup.haveAccount')}{' '}
            <Link to={`/login?tab=parent${params.get('next') ? `&next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-bronze">
              {t('common.login')}
            </Link>
          </p>
        </form>
      )}

      {step === 'otp' && sent && (
        <OtpStep
          sent={sent}
          onBack={() => setStep('phone')}
          onResend={send}
          onVerified={(tk) => {
            setTicket(tk)
            setStep('profile')
          }}
        />
      )}

      {step === 'profile' && (
        <ProfileStep
          foreign={foreign}
          foreignEmail={email}
          ticket={ticket}
          onDone={async (login, password, lang) => {
            const { error: e } = await supabase!.auth.signInWithPassword({ ...login, password })
            if (e) throw e
            await setLanguage(lang)
            qc.invalidateQueries({ queryKey: ['account'] })
            navigate(next, { replace: true })
          }}
        />
      )}
    </div>
  )
}

function ProfileStep({
  foreign,
  foreignEmail,
  ticket,
  onDone,
}: {
  foreign: boolean
  foreignEmail: string
  ticket: string
  onDone: (login: { phone: string } | { email: string }, password: string, lang: 'vi' | 'en') => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [lang, setLang] = useState<'vi' | 'en'>(i18n.language === 'en' ? 'en' : 'vi')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError(t('auth.passwordMismatch'))
    setBusy(true)
    setError(null)
    try {
      const r = await callOtp<{ login: { phone: string } | { email: string } }>({
        action: 'complete',
        ticket,
        full_name: fullName,
        email: foreign ? undefined : email.trim() || undefined,
        password,
        lang,
      })
      await onDone(r.login, password, lang)
    } catch (err) {
      setError(otpErrorText(t, err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t('signup.parentName') + ' *'} hint={t('signup.parentNameHint')}>
        <Input required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      {foreign ? (
        <p className="text-sm text-navy/70">{t('signup.emailVerified', { email: foreignEmail })}</p>
      ) : (
        <Field label={t('signup.parentEmail')} hint={t('signup.emailOptional')}>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      )}
      <Field label={t('auth.password') + ' *'} hint={t('signup.passwordHint')}>
        <Input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label={t('auth.confirmPassword') + ' *'}>
        <Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Field label={t('signup.language')}>
        <Select value={lang} onChange={(e) => setLang(e.target.value as 'vi' | 'en')}>
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </Select>
      </Field>
      <FormError message={error} />
      <Button type="submit" size="full" disabled={busy}>
        {busy ? t('common.loading') : t('signup.finish')}
      </Button>
    </form>
  )
}
