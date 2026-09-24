import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input } from '@/components/ui/form'
import { OtpStep } from '@/features/auth/OtpStep'
import { callOtp, otpErrorText, type OtpSent } from '@/features/auth/otp'
import { parseIdentifier } from '@/features/auth/phone'

type Step = 'identify' | 'otp' | 'password'

/**
 * F1 bước 5 · Quên mật khẩu: nhập SĐT hoặc email → OTP (theo quy tắc gửi của F1) → đặt mật khẩu mới.
 * Dùng chung cho phụ huynh và nhân viên.
 */
export function ForgotPasswordPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('identify')
  const [identifier, setIdentifier] = useState('')
  const [sent, setSent] = useState<OtpSent | null>(null)
  const [ticket, setTicket] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    const id = parseIdentifier(identifier)
    if (!id) throw new Error('invalid')
    const r = await callOtp<OtpSent>({ action: 'send', purpose: 'reset_password', ...id, lang: i18n.language })
    setSent(r)
    setStep('otp')
  }

  async function onIdentify(e: FormEvent) {
    e.preventDefault()
    if (!parseIdentifier(identifier)) return setError(t('auth.invalidIdentifier'))
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

  async function onPassword(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError(t('auth.passwordMismatch'))
    setBusy(true)
    setError(null)
    try {
      const r = await callOtp<{ login: { phone: string } | { email: string } }>({ action: 'complete', ticket, password })
      const { error: se } = await supabase!.auth.signInWithPassword({ ...r.login, password })
      if (se) throw se
      navigate('/login', { replace: true })
    } catch (err) {
      setError(otpErrorText(t, err))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t('pages.forgotPassword')}</h1>

      {step === 'identify' && (
        <form onSubmit={onIdentify} className="space-y-4">
          <p className="text-navy/75">{t('forgot.hint')}</p>
          <Field label={t('auth.phoneOrEmail')}>
            <Input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="0912 345 678" />
          </Field>
          <FormError message={error} />
          <Button type="submit" size="full" disabled={busy || !identifier.trim()}>
            {busy ? t('common.loading') : t('signup.sendCode')}
          </Button>
        </form>
      )}

      {step === 'otp' && sent && (
        <OtpStep
          sent={sent}
          onBack={() => setStep('identify')}
          onResend={send}
          onVerified={(tk) => {
            setTicket(tk)
            setStep('password')
          }}
        />
      )}

      {step === 'password' && (
        <form onSubmit={onPassword} className="space-y-4">
          <Field label={t('auth.newPassword')} hint={t('signup.passwordHint')}>
            <Input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label={t('auth.confirmPassword')}>
            <Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <FormError message={error} />
          <Button type="submit" size="full" disabled={busy}>
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </form>
      )}
    </div>
  )
}
