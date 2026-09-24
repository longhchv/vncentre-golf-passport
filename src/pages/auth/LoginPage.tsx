import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth, WORKSPACE_PATH } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input } from '@/components/ui/form'
import { ComingSoon } from '@/components/ComingSoon'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { parseIdentifier } from '@/features/auth/phone'
import { cn } from '@/lib/utils'

type Tab = 'parent' | 'staff' | 'student'

export function LoginPage() {
  const { t } = useTranslation()
  const { session, loading, workspaces } = useAuth()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'parent')

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
            className={cn('min-h-11 rounded-lg px-2 text-sm font-semibold', tab === k ? 'bg-white shadow-sm' : 'text-navy/60')}
          >
            {t(`auth.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'parent' && <PasswordLogin mode="parent" />}
      {tab === 'staff' && <PasswordLogin mode="staff" />}
      {/* Học viên (tên đăng nhập + PIN): Bước 11 */}
      {tab === 'student' && <ComingSoon title={t('auth.tab.student')} />}
    </div>
  )
}

/**
 * Phụ huynh: SĐT hoặc email + mật khẩu (F1 bước 4 — không gửi OTP mỗi lần đăng nhập để tiết kiệm).
 * Nhân viên: email + mật khẩu.
 */
function PasswordLogin({ mode }: { mode: 'parent' | 'staff' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return setError(t('status.notConfigured'))
    const id = mode === 'staff' ? { email: identifier.trim().toLowerCase() } : parseIdentifier(identifier)
    if (!id) return setError(t('auth.invalidIdentifier'))
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ ...id, password })
    setBusy(false)
    if (err) {
      const m = err.message.toLowerCase()
      setError(
        m.includes('invalid')
          ? t(mode === 'parent' ? 'auth.invalidCredentialsParent' : 'auth.invalidCredentials')
          : m.includes('confirm')
            ? t('auth.emailNotConfirmed')
            : m.includes('banned')
              ? t('auth.suspended')
              : err.message,
      )
      return
    }
    const next = params.get('next')
    navigate(next ? `/login?next=${encodeURIComponent(next)}` : '/login', { replace: true })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label={mode === 'parent' ? t('auth.phoneOrEmail') : t('auth.email')}>
        <Input
          type={mode === 'staff' ? 'email' : 'text'}
          inputMode={mode === 'staff' ? 'email' : 'text'}
          autoComplete="username"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={mode === 'parent' ? '0912 345 678' : undefined}
        />
      </Field>
      <Field label={t('auth.password')}>
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <FormError message={error} />
      <Button type="submit" size="full" disabled={busy}>
        {busy ? t('common.loading') : t('common.login')}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link to="/forgot-password" className="font-semibold text-bronze underline-offset-4 hover:underline">
          {t('auth.forgotLink')}
        </Link>
        {mode === 'parent' && (
          <Link
            to={`/signup${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}
            className="font-semibold text-bronze underline-offset-4 hover:underline"
          >
            {t('auth.noAccountSignup')}
          </Link>
        )}
      </div>
    </form>
  )
}
