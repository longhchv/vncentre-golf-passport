import { useTranslation } from 'react-i18next'
import { LEGAL, LEGAL_VERSION } from './legalContent'

// Điều khoản / Chính sách: bản tạm (D46), chờ luật sư rà soát (D3)
export function LegalPage({ titleKey }: { titleKey: 'pages.terms' | 'pages.privacy' }) {
  const { t, i18n } = useTranslation()
  const doc = LEGAL[titleKey === 'pages.terms' ? 'terms' : 'privacy'][i18n.language === 'en' ? 'en' : 'vi']
  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{doc.title}</h1>
      <p className="rounded-xl bg-gold/20 p-3 text-sm text-navy/80">{t('pages.legalDraft')}</p>
      <p className="text-navy/80">{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.h} className="space-y-2">
          <h2 className="text-lg font-bold">{s.h}</h2>
          {s.p.map((p, i) => <p key={i} className="text-navy/80">{p}</p>)}
        </section>
      ))}
      <p className="text-sm text-navy/50">{t('pages.legalVersion', { version: LEGAL_VERSION })}</p>
    </article>
  )
}
