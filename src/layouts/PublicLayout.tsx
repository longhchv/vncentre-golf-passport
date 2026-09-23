import { Link, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from '@/components/LanguageToggle'

export function PublicLayout() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="sticky top-0 z-10 bg-navy text-white"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <img src="/logo.svg" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
            <span className="truncate font-bold">{t('app.shortName')}</span>
          </Link>
          <LanguageToggle className="text-white" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer
        className="px-4 py-4 text-center text-sm text-navy/60"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {t('app.org')}
      </footer>
    </div>
  )
}
