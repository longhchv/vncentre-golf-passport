/** Spec 24 · HLV xem phong độ cả lớp: chế độ đang dùng (Giữ phong độ / Tăng tốc trước giải), phút đã làm 7 ngày, kiểm tra gần nhất, dấu hiệu quá sức. */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { Badge, Card } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

interface FormRow {
  student_id: string
  full_name: string
  age: number | null
  keep: { days: number; minutes: number; light_until: string | null; coach_week_hours: number | null } | null
  boost: { event_name: string; event_date: string; package: string } | null
  done_7d: number
  last_check: { checked_on: string; result: 'first' | 'up' | 'same' | 'down' } | null
  overload: boolean
}

const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`

export function CoachClassForm({ classId }: { classId: string }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['training_class_form', classId],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('training_class_form', { p_class_id: classId })
      if (error) throw error
      return data as FormRow[]
    },
  })
  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (q.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  const rows = q.data ?? []
  if (!rows.length) return <p className="text-navy/60">{t('training.coach.empty')}</p>
  return (
    <div className="space-y-2">
      <p className="text-sm text-navy/70">{t('training.classForm.hint')}</p>
      {rows.map((r) => (
        <Card key={r.student_id} className="space-y-1 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{r.full_name}{r.age != null ? <span className="font-normal text-navy/55"> · {t('training.keep.age', { n: r.age })}</span> : null}</p>
            <div className="flex flex-wrap gap-1">
              {r.overload && <Badge tone="bad"><AlertTriangle className="h-3 w-3" /> {t('training.classForm.overload')}</Badge>}
              {r.last_check && <Badge tone={r.last_check.result === 'up' ? 'good' : r.last_check.result === 'down' ? 'bad' : 'neutral'}>{t(`training.keep.result.${r.last_check.result}`)} {dm(r.last_check.checked_on)}</Badge>}
            </div>
          </div>
          <p className="text-sm text-navy/70">
            {r.boost ? t('training.classForm.boost', { name: r.boost.event_name, date: dm(r.boost.event_date) })
              : r.keep ? t('training.classForm.keep', { days: r.keep.days, minutes: r.keep.minutes })
                : t('training.classForm.none')}
            {' · '}{t('training.classForm.done7', { n: r.done_7d })}
          </p>
        </Card>
      ))}
    </div>
  )
}
