import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { checkCode } from '@/lib/codes'
import { Button } from '@/components/ui/button'
import { Mascot } from '@/components/Mascot'
import { activationErrorText, rpc } from './api'
import { ActivationWizard } from './ActivationWizard'

function Message({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-6 text-center">
      <Mascot />
      <h1 className="text-xl font-bold">{title}</h1>
      {body && <p className="text-navy/75">{body}</p>}
      {children}
    </div>
  )
}

function SignInPrompt({ title, subtitle, note, next }: { title: string; subtitle?: string | null; note?: string; next: string }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
      <Mascot className="h-28 w-28" />
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="text-navy/70">{subtitle}</p>}
      {note && <p className="rounded-xl bg-gold/15 p-3 text-sm text-brown">{note}</p>}
      <p className="text-navy/75">{t('scan.signInToActivate')}</p>
      <Button asChild size="full">
        <Link to={`/signup?next=${encodeURIComponent(next)}`}>{t('scan.signupAndActivate')}</Link>
      </Button>
      <Button asChild variant="outline" size="full">
        <Link to={`/login?tab=parent&next=${encodeURIComponent(next)}`}>{t('scan.haveAccount')}</Link>
      </Button>
    </div>
  )
}

interface ClaimLookup {
  result: 'ok' | 'not_found' | 'locked'
  used?: boolean
  masked_name?: string | null
  school_name?: string | null
  relation?: 'guardian' | 'none'
  student_id?: string | null
  retry_minutes?: number
}

/** /c/{mã} — kích hoạt bằng mã in trên chứng nhận giấy / phiếu kết quả (F4). */
export function ClaimPage() {
  const { claimCode = '' } = useParams()
  const { t } = useTranslation()
  const { session, loading } = useAuth()
  const check = checkCode(claimCode, 'claim')
  const q = useQuery({
    queryKey: ['claim_lookup', check.code, session?.user.id ?? 'anon'],
    enabled: check.ok && !loading,
    queryFn: () => rpc<ClaimLookup>('claim_lookup', { p_code: check.code }),
  })

  if (!check.ok) return <Message title={t('scan.wrongCode')} body={t('codes.invalidChars')} />
  if (loading || q.isPending) return <FullPageSpinner />
  if (q.isError) return <Message title={t('errors.loadFailed')} />
  const r = q.data
  if (r.result === 'locked') return <Message title={t('scan.locked', { minutes: r.retry_minutes })} />
  if (r.result === 'not_found') return <Message title={t('scan.wrongCode')} body={t('scan.wrongCodeBody')} />
  if (r.relation === 'guardian' && r.student_id) {
    return (
      <Message title={t('scan.yourChild', { name: r.masked_name })}>
        <Button asChild size="full"><Link to={`/app/children/${r.student_id}`}>{t('activation.openChild')}</Link></Button>
      </Message>
    )
  }
  if (r.used) {
    return (
      <Message title={t('claim.used')} body={t('claim.usedHint')}>
        {!session && <Button asChild size="full"><Link to="/login?tab=parent">{t('common.login')}</Link></Button>}
      </Message>
    )
  }
  const next = `/c/${check.code}`
  if (!session) return <SignInPrompt title={t('activation.profileOf', { name: r.masked_name })} subtitle={r.school_name} next={next} />
  return <ActivationWizard kind="claim" code={check.code} maskedName={r.masked_name} schoolName={r.school_name} />
}

interface InviteLookup {
  result: 'ok' | 'not_found' | 'used' | 'expired' | 'cancelled'
  purpose?: 'activation' | 'second_guardian'
  masked_name?: string | null
  school_name?: string | null
  masked_target?: string
  target_kind?: 'phone' | 'email'
}

/** /i/{token} — mở link mời kích hoạt (F3) hoặc lời mời người giám hộ thứ hai (F6). */
export function InvitePage() {
  const { inviteToken = '' } = useParams()
  const { t } = useTranslation()
  const { session, loading } = useAuth()
  const q = useQuery({
    queryKey: ['invitation_lookup', inviteToken],
    queryFn: () => rpc<InviteLookup>('invitation_lookup', { p_token: inviteToken }),
  })
  // Đã đăng nhập: kiểm tra trước đúng SĐT/email được mời để báo lỗi rõ ràng (F3 bước 5)
  const start = useQuery({
    queryKey: ['invitation_start_check', inviteToken, session?.user.id],
    enabled: Boolean(session) && q.data?.result === 'ok',
    retry: false,
    queryFn: () => rpc('invitation_start', { p_token: inviteToken }),
  })

  if (loading || q.isPending) return <FullPageSpinner />
  if (q.isError) return <Message title={t('errors.loadFailed')} />
  const r = q.data
  if (r.result === 'not_found') return <Message title={t('invite.notFound')} />
  if (r.result === 'used') {
    return (
      <Message title={t('invite.used')} body={t('invite.usedHint')}>
        <Button asChild size="full"><Link to="/login?tab=parent&next=/app">{t('common.login')}</Link></Button>
      </Message>
    )
  }
  if (r.result === 'expired' || r.result === 'cancelled') return <Message title={t(`invite.${r.result}`)} body={t('invite.askAgain')} />

  const next = `/i/${inviteToken}`
  const title = t('activation.profileOf', { name: r.masked_name })
  const note = t(r.target_kind === 'email' ? 'invite.forEmail' : 'invite.forPhone', { target: r.masked_target })
  if (!session) return <SignInPrompt title={title} subtitle={r.school_name} note={note} next={next} />
  if (start.isPending) return <FullPageSpinner />
  if (start.isError) {
    const other = String((start.error as { message?: string })?.message ?? '').startsWith('invite_other_target')
    return (
      <Message title={other ? t('invite.otherTarget') : activationErrorText(t, start.error)} body={other ? note : undefined}>
        {other && (
          <>
            <p className="text-sm text-navy/70">{t('invite.otherTargetHint')}</p>
            <Button asChild variant="outline" size="full"><Link to="/activate">{t('parent.activateAnother')}</Link></Button>
          </>
        )}
      </Message>
    )
  }
  return <ActivationWizard kind="invite" code={inviteToken} maskedName={r.masked_name} schoolName={r.school_name} />
}
