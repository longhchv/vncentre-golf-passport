import { Link, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from '@/components/LanguageToggle'

export type Workspace = 'parent' | 'student' | 'coach' | 'school' | 'admin'

/** Khung chung cho các không gian sau đăng nhập. Đăng nhập và phân quyền làm ở Bước 2. */
export function WorkspaceLayout({ workspace }: { workspace: Workspace }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="sticky top-0 z-10 bg-navy text-white"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <img src="/logo.svg" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
            <span className="truncate font-bold">{t(`workspace.${workspace}`)}</span>
          </Link>
          <LanguageToggle className="text-white" />
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-6"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Outlet />
      </main>
    </div>
  )
}
