import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Mascot } from '@/components/Mascot'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <Mascot />
      <h1 className="text-2xl font-bold">{t('common.notFound')}</h1>
      <p className="text-navy/75">{t('common.notFoundBody')}</p>
      <Button asChild>
        <Link to="/">{t('common.home')}</Link>
      </Button>
    </div>
  )
}
