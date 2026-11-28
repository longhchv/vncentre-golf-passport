import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input } from '@/components/ui/form'
import { OAUTH_PROVIDERS, signInWithProvider, useAuthProviders, type OAuthProvider } from './providers'

// Spec 12 mục 7b, 7c: đăng nhập ngay lần đầu bằng Google / Apple / Facebook / Microsoft hoặc mã 6 số qua email.
// Tài khoản chưa có thì Supabase tự tạo; cùng email đã xác thực thì về chung một tài khoản.

/** Nút đăng nhập bằng nhà cung cấp (chỉ các nút đang bật) + đăng nhập bằng mã qua email. */
export function QuickSignIn() {
  const { t } = useTranslation()
  const providers = useAuthProviders()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const enabled = OAUTH_PROVIDERS.filter((p) => providers[p])

  const go = async (p: OAuthProvider) => {
    setError(null)
    const { error: err } = await signInWithProvider(p, params.get('next'))
    if (err) setError(t('signin.providerFailed'))
  }

  if (enabled.length === 0 && !providers.email_otp) return null
  return (
    <div className="space-y-3">
      {enabled.map((p) => (
        <Button key={p} type="button" variant="outline" size="full" onClick={() => void go(p)}>
          <ProviderMark provider={p} /> {t(`signin.with.${p}`)}
        </Button>
      ))}
      <FormError message={error} />
      {providers.email_otp && <EmailOtpSignIn />}
      <div className="flex items-center gap-3 text-sm text-navy/50">
        <span className="h-px flex-1 bg-navy/15" /> {t('signin.orPassword')} <span className="h-px flex-1 bg-navy/15" />
      </div>
    </div>
  )
}

function ProviderMark({ provider }: { provider: OAuthProvider }) {
  const letter = { google: 'G', apple: 'A', facebook: 'f', azure: 'M' }[provider]
  return (
    <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-navy/5 text-sm font-bold">
      {letter}
    </span>
  )
}

/** Mã 6 số qua email (Supabase Auth, gửi qua SMTP Brevo; mẫu email đặt bằng scripts/auth-email-templates.mjs). */
function EmailOtpSignIn() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return setError(t('signin.emailInvalid'))
    setBusy(true)
    setError(null)
    const { error: err } = await supabase!.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } })
    setBusy(false)
    if (err) return setError(err.status === 429 || /rate/i.test(err.message) ? t('signin.tooMany') : t('signin.sendFailed'))
    setSentTo(addr)
    setCode('')
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (!sentTo || code.length !== 6) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase!.auth.verifyOtp({ email: sentTo, token: code, type: 'email' })
    setBusy(false)
    if (err) return setError(t('signin.codeWrong'))
    const next = params.get('next')
    navigate(next ? `/login?next=${encodeURIComponent(next)}` : '/login', { replace: true })
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="full" onClick={() => setOpen(true)}>
        <Mail className="h-5 w-5" /> {t('signin.withEmailCode')}
      </Button>
    )
  }
  if (!sentTo) {
    return (
      <form onSubmit={send} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-navy/10">
        <Field label={t('auth.email')} hint={t('signin.emailHint')}>
          <Input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <FormError message={error} />
        <Button type="submit" size="full" disabled={busy}>
          {busy ? t('common.loading') : t('signin.sendCode')}
        </Button>
      </form>
    )
  }
  return (
    <form onSubmit={verify} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-navy/10">
      <p className="text-sm">{t('signin.codeSent', { email: sentTo })}</p>
      <p className="text-sm text-navy/60">{t('signin.checkSpam')}</p>
      <Field label={t('signin.code')}>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="font-mono text-lg tracking-[0.5em]"
        />
      </Field>
      <FormError message={error} />
      <Button type="submit" size="full" disabled={busy || code.length !== 6}>
        {busy ? t('common.loading') : t('common.login')}
      </Button>
      <div className="flex justify-between gap-2 text-sm">
        <button type="button" className="font-semibold text-bronze" onClick={() => void send()} disabled={busy}>
          {t('signin.resend')}
        </button>
        <button type="button" className="font-semibold text-navy/60" onClick={() => setSentTo(null)}>
          {t('signin.changeEmail')}
        </button>
      </div>
    </form>
  )
}
