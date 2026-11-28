import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { formatDate } from '@/lib/i18nField'
import { supabase } from '@/lib/supabase'

// Phụ huynh xem điểm, chủ đề, chuyên cần và nhận xét của con qua các buổi trên lớp (lớp học trực tiếp, việc 7).

interface ReportSession {
  session_date: string
  session_no: number | null
  topic: string | null
  class_name: string
  points: number
  attendance: 'present' | 'late' | 'absent' | null
  comment_tags: string[]
  note: string | null
}

export function ClassReportCard({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation()
  const q = useQuery({
    queryKey: ['class-report', studentId],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('class_live_student_report', { p_student_id: studentId })
      // Máy chủ chưa có hàm (chưa chạy migration): ẩn mục
      if (error) return null
      return data as { total: number; available: number; sessions: ReportSession[] }
    },
  })
  if (!q.data || q.data.sessions.length === 0) return null
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold">{t('classLive.report.title')}</h2>
      <p className="text-sm text-navy/70">{t('classLive.report.summary', { total: q.data.total, available: q.data.available })}</p>
      <ul className="space-y-2">
        {q.data.sessions.slice(0, 12).map((s) => (
          <li key={`${s.class_name}-${s.session_date}`} className="space-y-0.5 rounded-xl bg-navy/5 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold">
                {s.session_no ? `${t('classLive.session.no', { no: s.session_no })} · ` : ''}
                {formatDate(s.session_date, i18n.language)}
              </p>
              <p className="font-bold text-bronze">+{s.points}</p>
            </div>
            {s.topic && <p className="text-sm">{s.topic}</p>}
            <p className="text-xs text-navy/60">
              {[s.attendance && t(`classLive.attendance.${s.attendance}`), ...s.comment_tags.map((c) => t(`classLive.comment.tag.${c}`))]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {s.note && <p className="text-sm text-navy/80 italic">“{s.note}”</p>}
          </li>
        ))}
      </ul>
    </Card>
  )
}
