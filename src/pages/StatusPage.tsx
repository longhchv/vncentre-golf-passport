import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { checkSupabase } from '@/lib/supabase'

/** Trang kỹ thuật để kiểm tra nhanh bản deploy trên điện thoại. */
export function StatusPage() {
  const { t, i18n } = useTranslation()
  const { data: supa, isPending } = useQuery({ queryKey: ['supabase-health'], queryFn: checkSupabase })
  const standalone = window.matchMedia('(display-mode: standalone)').matches

  const supaLabel = isPending
    ? t('status.checking')
    : supa === 'ok'
      ? `✅ ${t('status.ok')}`
      : supa === 'not_configured'
        ? `⚠️ ${t('status.notConfigured')}`
        : `❌ ${t('status.error')}`

  const rows: [string, string][] = [
    [t('status.version'), __APP_VERSION__],
    [t('status.environment'), import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE],
    [t('status.supabase'), supaLabel],
    [t('status.language'), i18n.language],
    [t('status.standalone'), standalone ? t('status.yes') : t('status.no')],
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('pages.status')}</h1>
      <dl className="divide-y divide-navy/10 rounded-2xl bg-white shadow-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-2 px-4 py-3">
            <dt className="text-navy/70">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
