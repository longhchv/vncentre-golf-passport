import { Navigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { useAuth, type Workspace } from '@/auth/AuthProvider'
import { Mascot } from '@/components/Mascot'
import { Button } from '@/components/ui/button'

export function FullPageSpinner() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-navy/70">
      <Mascot className="h-16 w-16 animate-pulse" />
      {t('common.loading')}
    </div>
  )
}

/** Chặn truy cập không gian khi chưa đăng nhập hoặc không có vai trò tương ứng. */
export function RequireWorkspace({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  const { session, loading, workspaces, profile, signOut } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()

  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />

  if (profile?.status === 'suspended' || !workspaces.includes(workspace)) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-12 text-center">
        <Mascot />
        <h1 className="text-xl font-bold">{t('auth.noAccessTitle')}</h1>
        <p className="text-navy/75">
          {profile?.status === 'suspended' ? t('auth.suspended') : t('auth.noAccessBody')}
        </p>
        <Button variant="outline" onClick={() => signOut()}>
          {t('auth.signOut')}
        </Button>
      </div>
    )
  }
  return <>{children}</>
}
