import { Navigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { Mascot } from '@/components/Mascot'

// Spec 14 bước 4: app giải chỉ biết mã VNC (student_code), nên trang chi tiết nhận cả mã VNC trên đường dẫn,
// vd. /admin/students/VNC-002279 hay /league/students/vnc002279 → tìm id rồi chuyển sang /…/students/{id}.

/** "VNC-002279", "vnc002279", "VNC-2279" → true */
export function isStudentCode(s: string) {
  return /^vnc-?\d{1,10}$/i.test(s.trim())
}

/** Về đúng dạng đang phát: VNC- + 6 chữ số (student_code_seq, lpad 6) */
export function normalizeStudentCode(s: string) {
  return 'VNC-' + s.replace(/\D/g, '').padStart(6, '0')
}

export function StudentCodeRedirect({
  code,
  base,
  resolve,
}: {
  code: string
  base: string
  resolve: (code: string) => Promise<string | null>
}) {
  const { t } = useTranslation()
  const norm = normalizeStudentCode(code)
  const q = useQuery({ queryKey: ['resolve_student_code', base, norm], retry: false, queryFn: () => resolve(norm) })
  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (q.data) return <Navigate to={`${base}/${q.data}`} replace />
  return (
    <Card className="mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center">
      <Mascot />
      <p className="font-semibold">{t('students.codeNotFound', { code: norm })}</p>
    </Card>
  )
}
