import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth, WORKSPACE_PATH } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input } from '@/components/ui/form'
import { ComingSoon } from '@/components/ComingSoon'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { cn } from '@/lib/utils'

type Tab = 'parent' | 'staff' | 'student'

export function LoginPage() {
  const { t } = useTranslation()
  const { session, loading, workspaces } = useAuth()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'staff')

  if (loading) return <FullPageSpinner />
  if (session) {
    const next = params.get('next')
    if (next) return <Navigate to={next} replace />
    if (workspaces.length === 1) return <Navigate to={WORKSPACE_PATH[workspaces[0]]} replace />
    return <Navigate to="/choose" replace />
  }

  const tabs: Tab[] = ['parent', 'staff', 'student']
  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-bold">{t('pages.login')}</h1>
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-navy/5 p-1">
        {tabs.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              'min-h-11 rounded-lg px-2 text-sm font-semibold',
              tab === k ? 'bg-white shadow-sm' : 'text-navy/60',
            )}
          >
            {t(`auth.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'staff' && <StaffLogin />}
      {/* Phụ huynh: Bước 6 (OTP + mật khẩu). Học viên: Bước 11 (tên + PIN). */}
      {tab === 'parent' && <ComingSoon title={t('auth.tab.parent')} />}
      {tab === 'student' && <ComingSoon title={t('auth.tab.student')} />}
    </div>
  )
}

function StaffLogin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return setError(t('status.notConfigured'))
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) {
      setError(err.message.toLowerCase().includes('invalid') ? t('auth.invalidCredentials') : err.message)
      return
    }
    navigate('/login', { replace: true })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label={t('auth.email')}>
        <Input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={t('auth.password')}>
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <FormError message={error} />
      <Button type="submit" size="full" disabled={busy}>
        {busy ? t('common.loading') : t('common.login')}
      </Button>
      <p className="text-center">
        <Link to="/forgot-password" className="font-semibold text-bronze underline-offset-4 hover:underline">
          {t('auth.forgotLink')}
        </Link>
      </p>
    </form>
  )
}
