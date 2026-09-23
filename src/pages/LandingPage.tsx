import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { QrCode, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Mascot } from '@/components/Mascot'

export function LandingPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <Mascot className="mt-4 h-32 w-32" />
      <div className="space-y-3">
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{t('landing.headline')}</h1>
        <p className="text-base text-navy/75">{t('landing.body')}</p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button asChild size="full">
          <Link to="/activate">
            <QrCode className="h-5 w-5" aria-hidden />
            {t('landing.activate')}
          </Link>
        </Button>
        <Button asChild variant="outline" size="full">
          <Link to="/login">{t('common.login')}</Link>
        </Button>
        <Button asChild variant="ghost" size="full">
          <Link to="/verify">
            <ShieldCheck className="h-5 w-5" aria-hidden />
            {t('landing.verify')}
          </Link>
        </Button>
      </div>
      <p className="text-sm text-navy/60">{t('landing.installHint')}</p>
    </div>
  )
}
