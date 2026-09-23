import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { CrudTable } from '@/features/admin/CrudTable'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import type { AcademicYear } from '@/lib/types'

export function AcademicYearsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()

  // Chỉ một năm hiện tại (ràng buộc trong CSDL): bỏ năm cũ trước rồi đặt năm mới
  const setCurrent = useMutation({
    mutationFn: async (id: string) => {
      const off = await supabase!.from('academic_years').update({ is_current: false }).eq('is_current', true)
      if (off.error) throw off.error
      const on = await supabase!.from('academic_years').update({ is_current: true }).eq('id', id)
      if (on.error) throw on.error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic_years'] })
      toast(t('common.saved'))
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  return (
    <CrudTable<AcademicYear>
      table="academic_years"
      titleKey="admin.nav.years"
      order="start_date"
      columns={[
        { key: 'name', labelKey: 'fields.yearName' },
        { key: 'start_date', labelKey: 'fields.startDate' },
        { key: 'end_date', labelKey: 'fields.endDate' },
        {
          key: 'is_current',
          labelKey: 'fields.isCurrent',
          render: (r) => (r.is_current ? <Badge tone="good">{t('admin.years.current')}</Badge> : null),
        },
      ]}
      extraActions={(r) =>
        !r.is_current && (
          <Button size="sm" variant="outline" disabled={setCurrent.isPending} onClick={() => setCurrent.mutate(r.id)}>
            {t('admin.years.setCurrent')}
          </Button>
        )
      }
      fields={[
        { name: 'name', labelKey: 'fields.yearName', required: true, hintKey: 'admin.years.nameHint' },
        { name: 'start_date', labelKey: 'fields.startDate', type: 'date', required: true },
        { name: 'end_date', labelKey: 'fields.endDate', type: 'date', required: true },
      ]}
    />
  )
}
