import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { ComingSoon } from '@/components/ComingSoon'
import { supabase } from '@/lib/supabase'

async function count(table: string) {
  const { count: n, error } = await supabase!.from(table).select('id', { count: 'exact', head: true })
  if (error) throw error
  return n ?? 0
}

/** Bảng điều khiển: bản đầy đủ (tỉ lệ kích hoạt, chi phí tin…) làm ở Bước 15. */
export function AdminHomePage() {
  const { t } = useTranslation()
  const stats = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => ({
      students: await count('students'),
      schools: await count('schools'),
      levels: await count('levels'),
    }),
  })

  const items = [
    { key: 'students', label: t('admin.home.students') },
    { key: 'schools', label: t('admin.home.schools') },
    { key: 'levels', label: t('admin.home.levels') },
  ] as const

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('admin.nav.dashboard')}</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <Card key={i.key} className="p-4">
            <p className="text-sm text-navy/60">{i.label}</p>
            <p className="text-3xl font-bold">{stats.data ? stats.data[i.key] : '…'}</p>
          </Card>
        ))}
      </div>
      <ComingSoon title={t('admin.home.fullDashboard')} />
    </div>
  )
}
