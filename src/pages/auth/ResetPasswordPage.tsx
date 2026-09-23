import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input } from '@/components/ui/form'
import { FullPageSpinner } from '@/auth/RequireWorkspace'

// Độ dài tối thiểu lấy từ app_settings 'password.min_length' (public); 8 là giá trị dự phòng
const FALLBACK_MIN = 8

/** Trang đặt mật khẩu mới: mở từ link trong email đặt lại mật khẩu hoặc email mời nhân viên. */
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <FullPageSpinner />
  if (!session) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <h1 className="text-2xl font-bold">{t('auth.newPassword')}</h1>
        <p className="text-navy/75">{t('auth.resetLinkInvalid')}</p>
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    let min = FALLBACK_MIN
    const setting = await supabase!.from('app_settings').select('value').eq('key', 'password.min_length').maybeSingle()
    if (typeof setting.data?.value === 'number') min = setting.data.value
    if (password.length < min) return setError(t('auth.passwordTooShort', { min }))
    if (password !== confirm) return setError(t('auth.passwordMismatch'))
    setBusy(true)
    const { error: err } = await supabase!.auth.updateUser({ password })
    setBusy(false)
    if (err) return setError(err.message)
    navigate('/login', { replace: true })
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t('auth.newPassword')}</h1>
      <Field label={t('auth.password')}>
        <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label={t('auth.confirmPassword')}>
        <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <FormError message={error} />
      <Button type="submit" size="full" disabled={busy}>
        {t('common.save')}
      </Button>
    </form>
  )
}
