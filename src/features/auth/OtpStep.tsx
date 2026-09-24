import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input } from '@/components/ui/form'
import { callOtp, otpErrorText, OtpError, type OtpSent } from './otp'

/**
 * Nhập mã OTP 6 số: đếm ngược được gửi lại, báo số lần sai còn lại (F1).
 * onVerified nhận "vé" dùng một lần để hoàn tất đăng ký / đặt lại mật khẩu.
 */
export function OtpStep({
  sent,
  onVerified,
  onResend,
  onBack,
}: {
  sent: OtpSent
  onVerified: (ticket: string) => void
  onResend: () => Promise<void>
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(sent.resend_after)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    setWait(sent.resend_after)
    setLocked(false)
    setCode('')
    const id = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [sent])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await callOtp<{ ticket: string }>({ action: 'verify', otp_id: sent.otp_id, code })
      onVerified(r.ticket)
    } catch (err) {
      if (err instanceof OtpError && ['otp_locked', 'otp_expired'].includes(err.code)) setLocked(true)
      setError(otpErrorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-navy/80">
        {t(`otp.sentVia.${sent.channel}`, { target: sent.masked })}
      </p>
      {sent.mock && <p className="rounded-xl bg-gold/20 p-3 text-sm text-brown">{t('otp.mockNotice')}</p>}
      <Field label={t('otp.codeLabel')}>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          className="text-center font-mono text-2xl tracking-[0.5em]"
          disabled={locked}
        />
      </Field>
      <FormError message={error} />
      <Button type="submit" size="full" disabled={busy || code.length !== 6 || locked}>
        {busy ? t('common.loading') : t('otp.verify')}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={onBack} className="font-semibold text-bronze">
          {t('common.back')}
        </button>
        <button
          type="button"
          disabled={wait > 0 || busy}
          onClick={async () => {
            setError(null)
            try {
              await onResend()
            } catch (err) {
              setError(otpErrorText(t, err))
            }
          }}
          className="font-semibold text-bronze disabled:text-navy/40"
        >
          {wait > 0 ? t('otp.resendIn', { seconds: wait }) : t('otp.resend')}
        </button>
      </div>
    </form>
  )
}
