import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input } from '@/components/ui/form'

/** Quên mật khẩu cho nhân viên (email). Phụ huynh dùng OTP ở Bước 6. */
export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (err) setError(err.message)
    else setSent(true)
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t('pages.forgotPassword')}</h1>
      {sent ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{t('auth.resetSent')}</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-navy/75">{t('auth.forgotStaffHint')}</p>
          <Field label={t('auth.email')}>
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <FormError message={error} />
          <Button type="submit" size="full" disabled={busy}>
            {t('auth.sendResetLink')}
          </Button>
        </form>
      )}
    </div>
  )
}
