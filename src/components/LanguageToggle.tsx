import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { setLanguage } from '@/i18n'
import { cn } from '@/lib/utils'

export function LanguageToggle({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const next = i18n.language === 'vi' ? 'en' : 'vi'
  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      aria-label={t('lang.switchLabel')}
      className={cn(
        'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-current/25 px-3 text-sm font-semibold',
        className,
      )}
    >
      <Languages className="h-4 w-4" aria-hidden />
      {t('lang.switchTo')}
    </button>
  )
}
