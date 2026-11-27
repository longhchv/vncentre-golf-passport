import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { checkForNewVersion } from '@/lib/appUpdate'
import { Mascot } from '@/components/Mascot'

/** Thẻ "Sắp ra mắt" cho mục chưa có — không để link chết (02 mục 2). */
export function ComingSoon({ title }: { title?: string }) {
  const { t } = useTranslation()
  // Bản cũ trong bộ nhớ đệm không biết trang mới → kiểm tra có bản mới để tự tải lại
  useEffect(() => { void checkForNewVersion(true) }, [])
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-navy/10 bg-white p-6 text-center shadow-sm">
      <Mascot className="h-20 w-20" />
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      <span className="rounded-full bg-gold/30 px-3 py-1 text-sm font-semibold text-brown">{t('common.comingSoon')}</span>
      <p className="text-base text-navy/70">{t('common.comingSoonBody')}</p>
    </div>
  )
}
