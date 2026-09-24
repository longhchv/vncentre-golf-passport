import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, AlertCircle, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FormError, Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { ComingSoon } from '@/components/ComingSoon'
import { MyOrders } from '@/features/orders/OrderPage'
import { PhoneField } from '@/features/auth/PhoneField'
import { OtpStep } from '@/features/auth/OtpStep'
import { callOtp, otpErrorText, type OtpSent } from '@/features/auth/otp'
import { isVietnamese, toE164 } from '@/features/auth/phone'

/**
 * Tài khoản (02 mục 3.2): họ tên, SĐT, email, ngôn ngữ, đổi mật khẩu, đăng xuất.
 * Một người một tài khoản (C10): nhân viên thêm SĐT tại đây để dùng không gian Phụ huynh.
 * Đồng ý, đơn hàng và hoá đơn: các bước sau.
 */
export function AccountPage() {
  const { t } = useTranslation()
  const { session, loading, profile, signOut, changeLanguage, guardianId } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login?next=/account" replace />
  const user = session.user

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-bold">{t('account.title')}</h1>
      <NameCard initial={profile?.full_name ?? ''} userId={user.id} />

      <Card className="space-y-3 p-4">
        <h2 className="font-bold">{t('account.language')}</h2>
        <div className="grid grid-cols-2 gap-2">
          {(['vi', 'en'] as const).map((l) => (
            <Button key={l} variant={profile?.preferred_language === l ? 'primary' : 'outline'} onClick={() => changeLanguage(l)}>
              {l === 'vi' ? 'Tiếng Việt' : 'English'}
            </Button>
          ))}
        </div>
      </Card>

      <PhoneCard current={user.phone ? `+${user.phone}` : null} verified={Boolean(user.phone_confirmed_at)} />
      <EmailCard current={user.email ?? null} verified={Boolean(user.email_confirmed_at)} />
      <PasswordCard />

      {guardianId && <MyOrders />}
      {/* Quản lý đồng ý: Bước 15 */}
      <ComingSoon title={t('account.consents')} />

      <Button variant="outline" size="full" onClick={() => signOut()}>
        <LogOut className="h-4 w-4" /> {t('auth.signOut')}
      </Button>
    </div>
  )
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${ok ? 'text-emerald-700' : 'text-brown'}`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} {label}
    </span>
  )
}

function NameCard({ initial, userId }: { initial: string; userId: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { refreshAccount } = useAuth()
  const [name, setName] = useState(initial)
  return (
    <Card className="space-y-3 p-4">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const { error } = await supabase!.from('profiles').update({ full_name: name.trim() }).eq('user_id', userId)
          if (error) return toast(t('errors.generic'), 'error')
          await supabase!.from('guardians').update({ full_name: name.trim() }).eq('user_id', userId)
          await refreshAccount()
          toast(t('common.saved'))
        }}
      >
        <Field label={t('fields.fullName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </Field>
        <Button type="submit" size="sm" disabled={!name.trim() || name.trim() === initial}>
          {t('common.save')}
        </Button>
      </form>
    </Card>
  )
}

function PhoneCard({ current, verified }: { current: string | null; verified: boolean }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { refreshAccount } = useAuth()
  const [editing, setEditing] = useState(false)
  const [dial, setDial] = useState('84')
  const [local, setLocal] = useState('')
  const [sent, setSent] = useState<OtpSent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const phone = toE164(dial, local)

  const reset = () => {
    setEditing(false)
    setSent(null)
    setLocal('')
    setError(null)
  }

  async function send() {
    const r = await callOtp<OtpSent>({ action: 'send', purpose: 'add_phone', phone, lang: i18n.language })
    setSent(r)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!phone) return setError(t('auth.invalidPhone'))
    setBusy(true)
    setError(null)
    try {
      if (isVietnamese(phone)) {
        await send()
      } else {
        // Số nước ngoài: lưu chưa xác minh (F1)
        await callOtp({ action: 'set_foreign_phone', phone })
        await refreshAccount()
        toast(t('common.saved'))
        reset()
      }
    } catch (err) {
      setError(otpErrorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{t('auth.phone')}</h2>
        {current && <Status ok={verified} label={verified ? t('account.verified') : t('account.unverified')} />}
      </div>
      <p className="text-lg">{current ?? t('account.noPhone')}</p>
      {!current && <p className="text-sm text-navy/60">{t('account.addPhoneHint')}</p>}
      {!editing ? (
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          {current ? t('account.changePhone') : t('account.addPhone')}
        </Button>
      ) : sent ? (
        <OtpStep
          sent={sent}
          onBack={() => setSent(null)}
          onResend={send}
          onVerified={async (ticket) => {
            try {
              await callOtp({ action: 'complete', ticket })
              await refreshAccount()
              toast(t('account.phoneAdded'))
              reset()
            } catch (err) {
              setError(otpErrorText(t, err))
            }
          }}
        />
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <PhoneField dial={dial} onDial={setDial} value={local} onChange={setLocal} error={error} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !local.trim()}>
              {busy ? t('common.loading') : t('signup.sendCode')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

function EmailCard({ current, verified }: { current: string | null; verified: boolean }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { refreshAccount } = useAuth()
  const [editing, setEditing] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<OtpSent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reset = () => {
    setEditing(false)
    setSent(null)
    setEmail('')
    setError(null)
  }

  async function send(target: string) {
    const r = await callOtp<OtpSent>({ action: 'send', purpose: 'verify_email', email: target, lang: i18n.language })
    setSent(r)
  }

  async function start(target: string) {
    setBusy(true)
    setError(null)
    try {
      await send(target)
      setEditing(true)
    } catch (err) {
      setError(otpErrorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{t('auth.email')}</h2>
        {current && <Status ok={verified} label={verified ? t('account.verified') : t('account.unverified')} />}
      </div>
      <p className="text-lg break-all">{current ?? t('account.noEmail')}</p>
      {!current && <p className="text-sm text-navy/60">{t('account.emailWhy')}</p>}
      {current && !verified && <p className="text-sm text-navy/60">{t('account.verifyEmailWhy')}</p>}
      <FormError message={!editing ? error : null} />
      {!editing ? (
        <div className="flex flex-wrap gap-2">
          {current && !verified && (
            <Button size="sm" disabled={busy} onClick={() => { setEmail(current); start(current) }}>
              {t('account.verifyEmail')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {current ? t('account.changeEmail') : t('account.addEmail')}
          </Button>
        </div>
      ) : sent ? (
        <OtpStep
          sent={sent}
          onBack={() => setSent(null)}
          onResend={() => send(email)}
          onVerified={async (ticket) => {
            try {
              await callOtp({ action: 'complete', ticket })
              await refreshAccount()
              toast(t('account.emailVerified'))
              reset()
            } catch (err) {
              setError(otpErrorText(t, err))
            }
          }}
        />
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            start(email.trim().toLowerCase())
          }}
        >
          <Field label={t('auth.email')} error={error}>
            <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? t('common.loading') : t('signup.sendCode')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

function PasswordCard() {
  const { t } = useTranslation()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold">{t('account.changePassword')}</h2>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (password.length < 8) return setError(t('auth.passwordTooShort', { min: 8 }))
          if (password !== confirm) return setError(t('auth.passwordMismatch'))
          const { error: err } = await supabase!.auth.updateUser({ password })
          if (err) return setError(err.message)
          setPassword('')
          setConfirm('')
          setError(null)
          toast(t('account.passwordChanged'))
        }}
      >
        <Field label={t('auth.newPassword')}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t('auth.confirmPassword')}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <FormError message={error} />
        <Button type="submit" size="sm" disabled={!password}>
          {t('common.save')}
        </Button>
      </form>
    </Card>
  )
}
