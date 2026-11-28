import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FormError, Input } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { cn } from '@/lib/utils'
import { useMyIdentity } from '@/features/auth/providers'

const ERRORS = ['name_required', 'birth_year_invalid', 'kind_invalid']

/**
 * Chào mừng (spec 12 mục 7b): sau lần đăng nhập đầu hỏi tối thiểu họ tên, năm sinh, học viên hay phụ huynh/người lớn,
 * rồi tạo hồ sơ golfer kèm mã VNC (một lần — auth_onboard).
 */
export function WelcomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { session, loading, profile, refreshAccount } = useAuth()
  const identity = useMyIdentity(session?.user.id)
  const [name, setName] = useState(profile?.full_name ?? '')
  const [year, setYear] = useState('')
  const [kind, setKind] = useState<'student' | 'adult' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (loading || identity.isPending) return <FullPageSpinner />
  if (!session) return <Navigate to="/login" replace />
  if (identity.data && !identity.data.needs_onboarding && !done) return <Navigate to="/login" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!kind) return setError(t('welcome.kindRequired'))
    setBusy(true)
    setError(null)
    const { data, error: err } = await supabase!.rpc('auth_onboard', {
      p_full_name: name,
      p_birth_year: Number(year),
      p_kind: kind,
    })
    setBusy(false)
    if (err) return setError(ERRORS.includes(err.message) ? t(`welcome.errors.${err.message}`) : t('errors.generic'))
    setDone((data as { student_code: string }).student_code)
    await refreshAccount()
    await qc.invalidateQueries({ queryKey: ['auth-identity'] })
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md space-y-5">
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <Mascot />
          <h1 className="text-2xl font-bold">{t('welcome.doneTitle')}</h1>
          <p className="text-navy/70">{t('welcome.yourCode')}</p>
          <p className="font-mono text-3xl font-bold tracking-wider">{done}</p>
          <p className="text-sm text-navy/60">{t('welcome.codeHint')}</p>
          <Button size="full" onClick={() => navigate('/login', { replace: true })}>
            {t('welcome.continue')}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('welcome.title')}</h1>
        <p className="text-navy/70">{t('welcome.intro')}</p>
      </div>
      <Field label={t('welcome.name')}>
        <Input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('welcome.birthYear')}>
        <Input
          required
          inputMode="numeric"
          maxLength={4}
          placeholder="1985"
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">{t('welcome.kind')}</legend>
        {(['student', 'adult'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              'w-full rounded-xl px-4 py-3 text-left ring-1',
              kind === k ? 'bg-navy text-white ring-navy' : 'bg-white ring-navy/15',
            )}
          >
            <span className="block font-semibold">{t(`welcome.kinds.${k}`)}</span>
            <span className={cn('block text-sm', kind === k ? 'text-white/80' : 'text-navy/60')}>{t(`welcome.kindsHint.${k}`)}</span>
          </button>
        ))}
      </fieldset>
      <FormError message={error} />
      <Button type="submit" size="full" disabled={busy || year.length !== 4 || name.trim().length < 2}>
        {busy ? t('common.loading') : t('welcome.submit')}
      </Button>
    </form>
  )
}
