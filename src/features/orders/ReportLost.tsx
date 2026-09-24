import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { formatVnd } from '@/lib/i18nField'
import { formatCode } from '@/lib/codes'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormError } from '@/components/ui/form'

function useReplacementPrice() {
  return useQuery({
    queryKey: ['products', 'passport_replacement'],
    queryFn: async () => {
      const { data, error } = await supabase!.from('products').select('price_vnd').eq('code', 'passport_replacement').maybeSingle()
      if (error) throw error
      return (data?.price_vnd as number | undefined) ?? null
    },
  })
}

/**
 * F15 bước 1–2: phụ huynh "Báo mất sổ" → xác nhận → sổ mất hiệu lực ngay, tạo đơn phí cấp lại → trang thanh toán.
 * mode "pay": sổ đã báo mất nhưng chưa có sổ mới → mở (hoặc tạo lại) đơn thanh toán.
 */
export function ReportLostButton({ passportId, code, mode = 'report' }: { passportId: string; code: string; mode?: 'report' | 'pay' }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const price = useReplacementPrice()
  const [open, setOpen] = useState(false)
  const report = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase!.rpc('report_lost_passport', { p_passport_id: passportId })
      if (error) throw error
      return data as string
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: ['student_profile'] })
      qc.invalidateQueries({ queryKey: ['my_orders'] })
      navigate(`/app/orders/${orderId}`)
    },
  })

  if (mode === 'pay') {
    return (
      <Button size="sm" disabled={report.isPending} onClick={() => report.mutate()}>
        {t('orders.payReplacement')}
      </Button>
    )
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>{t('profile.reportLost')}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('profile.reportLost')}>
        <div className="space-y-4">
          <p className="font-mono text-xl font-bold">{formatCode(code)}</p>
          <ul className="list-disc space-y-1 pl-5 text-navy/80">
            <li>{t('orders.lostPoint1')}</li>
            <li>{t('orders.lostPoint2', { price: price.data != null ? formatVnd(price.data, i18n.language) : '…' })}</li>
            <li>{t('orders.lostPoint3')}</li>
          </ul>
          <FormError message={report.isError ? t('errors.generic') : null} />
          <Button size="full" disabled={report.isPending} onClick={() => report.mutate()}>{t('orders.confirmLost')}</Button>
          <Button size="full" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
        </div>
      </Dialog>
    </>
  )
}
