import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/utils'

/** Nút đổi Việt/Anh ở mọi trang; khi đã đăng nhập thì lưu vào hồ sơ tài khoản. */
export function LanguageToggle({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const { changeLanguage } = useAuth()
  const next = i18n.language === 'vi' ? 'en' : 'vi'
  return (
    <button
      type="button"
      onClick={() => changeLanguage(next)}
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
