import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { checkCode, formatCode } from '@/lib/codes'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Mascot } from '@/components/Mascot'
import { rpc, type PassportLookup } from './api'
import { ActivationWizard } from './ActivationWizard'

/**
 * /p/{mã sổ} — quét QR sổ hoặc nhập mã (F2). Xử lý theo bảng trạng thái sổ × người mở.
 */
export function PassportScanPage() {
  const { passportCode = '' } = useParams()
  const { t, i18n } = useTranslation()
  const { session, loading, workspaces } = useAuth()
  const check = checkCode(passportCode, 'passport')
  const code = check.code

  const lookup = useQuery({
    queryKey: ['passport_lookup', code, session?.user.id ?? 'anon'],
    enabled: check.ok && !loading,
    queryFn: () => rpc<PassportLookup>('passport_lookup', { p_code: code }),
    staleTime: 0,
  })

  if (!check.ok) return <Message title={t('scan.wrongCode')} body={t('codes.invalidChars')} retry />
  if (loading || lookup.isPending) return <FullPageSpinner />
  if (lookup.isError) return <Message title={t('errors.loadFailed')} retry />
  const r = lookup.data
  if (r.result === 'locked') return <Message title={t('scan.locked', { minutes: r.retry_minutes })} />
  if (r.result === 'not_found') return <Message title={t('scan.wrongCode')} body={t('scan.wrongCodeBody')} retry />

  const next = `/p/${code}`
  const tier = i18n.language === 'en' ? r.tier_en : r.tier_vi
  const isStaff = workspaces.some((w) => w !== 'parent' && w !== 'student')

  // Sổ chưa kích hoạt: chưa đăng nhập → chào + đăng ký/đăng nhập (D30: F1 trước); đã đăng nhập → trình tự kích hoạt
  if (r.status === 'assigned' || r.status === 'unassigned') {
    if (!session) {
      return (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
          <Mascot className="h-28 w-28" />
          {r.status === 'assigned' ? (
            <>
              <h1 className="text-2xl font-bold">{t('activation.passportOf', { name: r.masked_name })}</h1>
              {r.school_name && <p className="text-navy/70">{r.school_name}</p>}
            </>
          ) : (
            <h1 className="text-2xl font-bold">{t('activation.unassignedTitle')}</h1>
          )}
          <p className="text-sm text-navy/60">{tier} · {formatCode(code)}</p>
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
    return <ActivationWizard code={code} maskedName={r.masked_name} schoolName={r.school_name} />
  }

  // Sổ đã báo mất / huỷ
  if (r.status === 'lost' || r.status === 'void') {
    if (r.relation === 'staff' || (isStaff && r.relation !== 'none')) {
      return (
        <Card className="mx-auto max-w-md space-y-3 border-red-300 bg-red-50 p-5">
          <p className="flex items-center gap-2 font-bold text-red-800">
            <AlertTriangle className="h-5 w-5" /> {t(`scan.staffWarning.${r.status}`)}
          </p>
          <p>{r.masked_name}</p>
          {r.current_passport_code && <p>{t('scan.currentPassport', { code: formatCode(r.current_passport_code) })}</p>}
          <StaffLink studentId={r.student_id} />
        </Card>
      )
    }
    return <Message title={t('scan.invalidPassport')} />
  }

  // Sổ đang dùng (hoặc sổ cấp trước — xử lý như đang dùng, F2)
  if (r.relation === 'guardian') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <Mascot className="h-24 w-24" />
        <h1 className="text-xl font-bold">{t('scan.yourChild', { name: r.masked_name })}</h1>
        {r.status === 'retired' && r.current_passport_code && (
          <p className="text-navy/70">{t('scan.retiredNote', { code: formatCode(r.current_passport_code) })}</p>
        )}
        <Button asChild size="full">
          <Link to="/app">{t('activation.openChild')}</Link>
        </Button>
      </div>
    )
  }
  if (r.relation === 'staff') {
    return (
      <Card className="mx-auto max-w-md space-y-3 p-5">
        <p className="font-bold">{r.masked_name}</p>
        <p className="text-sm text-navy/60">{tier} · {t(`passportStatus.${r.status}`)}</p>
        {r.status === 'retired' && r.current_passport_code && <p>{t('scan.retiredNote', { code: formatCode(r.current_passport_code) })}</p>}
        <StaffLink studentId={r.student_id} />
      </Card>
    )
  }
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
      <Mascot className="h-24 w-24" />
      <h1 className="text-xl font-bold">{t('scan.alreadyActive')}</h1>
      <p className="text-navy/75">{t('scan.alreadyActiveHint')}</p>
      {!session && (
        <Button asChild size="full">
          <Link to={`/login?tab=parent&next=${encodeURIComponent(next)}`}>{t('common.login')}</Link>
        </Button>
      )}
    </div>
  )
}

function StaffLink({ studentId }: { studentId?: string | null }) {
  const { t } = useTranslation()
  const { workspaces } = useAuth()
  if (!studentId) return null
  // Hồ sơ học viên cho nhân viên: admin có trang Học viên; HLV mở hồ sơ ở Bước 8
  if (workspaces.includes('admin')) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to={`/admin/students?open=${studentId}`}>{t('scan.openStudent')}</Link>
      </Button>
    )
  }
  return null
}

function Message({ title, body, retry }: { title: string; body?: string; retry?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-6 text-center">
      <Mascot />
      <h1 className="text-xl font-bold">{title}</h1>
      {body && <p className="text-navy/75">{body}</p>}
      {retry && (
        <Button asChild variant="outline">
          <Link to="/activate">{t('scan.enterManually')}</Link>
        </Button>
      )}
    </div>
  )
}
