import { useTranslation } from 'react-i18next'
import { ComingSoon } from '@/components/ComingSoon'

/** Trang giữ chỗ cho các đường dẫn đã chốt trong sơ đồ màn hình, chức năng làm ở bước sau. */
export function PlaceholderPage({ titleKey, bodyKey }: { titleKey: string; bodyKey?: string }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t(titleKey)}</h1>
      {bodyKey && <p className="text-navy/75">{t(bodyKey)}</p>}
      <ComingSoon />
    </div>
  )
}
