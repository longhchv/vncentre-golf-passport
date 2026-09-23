import { Link, Navigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { useAuth, WORKSPACE_PATH } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Mascot } from '@/components/Mascot'
import { FullPageSpinner } from '@/auth/RequireWorkspace'

/** Người có nhiều vai trò chọn không gian làm việc (F1). */
export function ChooseWorkspacePage() {
  const { t } = useTranslation()
  const { session, loading, workspaces, profile, signOut } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login" replace />
  if (workspaces.length === 1) return <Navigate to={WORKSPACE_PATH[workspaces[0]]} replace />

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('auth.chooseWorkspace')}</h1>
        <p className="text-navy/70">{profile?.full_name || profile?.email}</p>
      </div>
      {workspaces.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 text-center shadow-sm">
          <Mascot className="h-20 w-20" />
          <p className="text-navy/75">{t('auth.noWorkspace')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {workspaces.map((w) => (
            <li key={w}>
              <Link
                to={WORKSPACE_PATH[w]}
                className="flex min-h-16 items-center justify-between rounded-2xl border border-navy/10 bg-white px-5 text-lg font-semibold shadow-sm hover:border-bronze"
              >
                {t(`workspace.${w}`)}
                <ChevronRight className="h-5 w-5 text-bronze" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" size="full" onClick={() => signOut()}>
        {t('auth.signOut')}
      </Button>
    </div>
  )
}
