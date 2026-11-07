import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Copy, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { formatVnd, useLocalized } from '@/lib/i18nField'
import { supabase } from '@/lib/supabase'

interface ReferralSummary {
  code: string
  referred_count: number
  provisional_total: number
  payouts_enabled: boolean
  partners: { id: string; name: string; offers: { id: string; name_vi: string; name_en: string | null }[] }[]
}

/**
 * Hồ sơ của tôi · Khối 7 Kinh doanh (spec 18 mục 5). Chỉ SỐ người đã giới thiệu và TỔNG tạm tính;
 * không tên, hoá đơn, chi tiêu của người được giới thiệu, không sơ đồ mạng lưới.
 */
export function BusinessSection() {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const toast = useToast()
  const q = useQuery({
    queryKey: ['referral_my_summary'],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('referral_my_summary')
      if (error) throw error
      return data as ReferralSummary
    },
  })

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{t('adultProfile.business')}</h2>
      {q.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : q.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        (() => {
          const d = q.data
          const link = `${window.location.origin}/r/${d.code}`
          const partners = (d.partners ?? []).filter((p) => p.offers?.length)
          return (
            <>
              <Card className="space-y-3 p-4">
                <p className="text-sm font-semibold text-navy/80">{t('business.referralLink')}</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 rounded-xl bg-navy/5 px-3 py-2.5 text-sm break-all">{link}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link)
                        toast(t('common.copied'))
                      } catch {
                        toast(t('errors.generic'), 'error')
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" /> {t('common.copy')}
                  </Button>
                </div>
                <p className="text-sm text-navy/60">{t('business.code', { code: d.code })}</p>
              </Card>
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4">
                  <p className="text-2xl font-bold">{d.referred_count}</p>
                  <p className="text-sm text-navy/65">{t('business.referredCount', { count: Number(d.referred_count) })}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-2xl font-bold break-words">{formatVnd(Number(d.provisional_total), i18n.language)}</p>
                  <p className="text-sm text-navy/65">{t('business.provisionalTotal')}</p>
                </Card>
              </div>
              <p className="flex items-start gap-2 rounded-xl bg-gold/15 px-3 py-2 text-sm font-medium text-brown">
                <Info className="mt-0.5 h-4 w-4 shrink-0" /> {t('business.provisionalNote')}
              </p>
              {partners.length > 0 && (
                <Card className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-semibold">{t('business.partnersTitle')}</p>
                    <Link to="/app/partners" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
                      {t('business.viewAll')} <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                  <ul className="divide-y divide-navy/10">
                    {partners.map((p) => (
                      <li key={p.id}>
                        <Link to="/app/partners" className="block py-2 hover:bg-navy/5">
                          <span className="block font-semibold break-words">{p.name}</span>
                          <span className="block text-sm text-navy/65">{p.offers.map((o) => loc(o, 'name')).join(' · ')}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )
        })()
      )}
    </section>
  )
}
