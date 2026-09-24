import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LogOut, Menu, Repeat, UserRound } from 'lucide-react'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useAuth, type Workspace } from '@/auth/AuthProvider'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface NavItem {
  to: string
  labelKey: string
  end?: boolean
}

/** Khung chung cho các không gian sau đăng nhập; có menu điều hướng khi truyền `nav`. */
export function WorkspaceLayout({ workspace, nav }: { workspace: Workspace; nav?: NavItem[] }) {
  const { t } = useTranslation()
  const { profile, workspaces, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const navList = nav && (
    <nav className="flex flex-col gap-1" onClick={() => setMenuOpen(false)}>
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center rounded-xl px-3 text-base',
              isActive ? 'bg-navy font-semibold text-white' : 'text-navy/80 hover:bg-navy/5',
            )
          }
        >
          {t(item.labelKey)}
        </NavLink>
      ))}
    </nav>
  )

  const accountBox = (
    <div className="space-y-2 border-t border-navy/10 pt-3">
      <p className="truncate px-3 text-sm text-navy/60">{profile?.full_name || profile?.email || profile?.phone}</p>
      <Link to="/account" onClick={() => setMenuOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-navy/80 hover:bg-navy/5">
        <UserRound className="h-4 w-4" /> {t('account.title')}
      </Link>
      {workspaces.length > 1 && (
        <Link to="/choose" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-navy/80 hover:bg-navy/5">
          <Repeat className="h-4 w-4" /> {t('auth.switchWorkspace')}
        </Link>
      )}
      <button
        type="button"
        onClick={() => signOut()}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-navy/80 hover:bg-navy/5"
      >
        <LogOut className="h-4 w-4" /> {t('auth.signOut')}
      </button>
    </div>
  )

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-navy text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t('common.menu')}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/" className="flex min-w-0 items-center gap-2">
              <img src="/logo.svg" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
              <span className="truncate font-bold">{t(`workspace.${workspace}`)}</span>
            </Link>
          </div>
          <LanguageToggle className="text-white" />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
        <aside className="hidden w-60 shrink-0 space-y-3 lg:block">
          {navList}
          {accountBox}
        </aside>
        <main className="min-w-0 flex-1" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <Outlet />
        </main>
      </div>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title={t(`workspace.${workspace}`)}>
        <div className="space-y-3">
          {navList}
          {accountBox}
        </div>
      </Dialog>
    </div>
  )
}
