import { useTranslation } from 'react-i18next'

// Nội dung Điều khoản / Chính sách chưa soạn (phụ lục D, D3). Phiên bản giữ chỗ: v0-draft.
export function LegalPage({ titleKey }: { titleKey: 'pages.terms' | 'pages.privacy' }) {
  const { t } = useTranslation()
  return (
    <article className="space-y-4">
      <h1 className="text-2xl font-bold">{t(titleKey)}</h1>
      <p className="rounded-xl bg-gold/20 p-4 text-navy/80">{t('pages.legalDraft')}</p>
      <p className="text-sm text-navy/50">v0-draft</p>
    </article>
  )
}
