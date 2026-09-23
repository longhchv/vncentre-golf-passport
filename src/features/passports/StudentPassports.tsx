import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookMarked } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCode } from '@/lib/codes'
import { formatDateTime, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { AssignPassportDialog } from './AssignPassportDialog'
import { PassportDetailDialog, PASSPORT_TONE, type PassportStatus } from './PassportDetailDialog'

interface Row {
  id: string
  passport_code: string
  status: PassportStatus
  issued_at: string | null
  tier: { name_vi: string; name_en: string } | null
}

/** Mục "Sổ Passport" trong hồ sơ học viên (admin): các sổ theo thời gian, gán sổ mới. */
export function StudentPassports({ student }: { student: { id: string; full_name: string } }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const [assignOpen, setAssignOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['passports', 'student', student.id],
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('passports')
        .select('id, passport_code, status, issued_at, tier:passport_tiers(name_vi, name_en)')
        .eq('student_id', student.id)
        .order('issued_at', { ascending: false, nullsFirst: false })
      if (error) throw error
      return data as unknown as Row[]
    },
  })

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">{t('passports.studentSection')}</h3>
        <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
          <BookMarked className="h-4 w-4" /> {t('passports.assign')}
        </Button>
      </div>
      {q.data?.length === 0 && <p className="text-navy/60">{t('passports.none')}</p>}
      <ul className="space-y-1">
        {q.data?.map((p) => (
          <li key={p.id}>
            <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left text-sm" onClick={() => setOpenId(p.id)}>
              <span className="font-mono font-semibold underline-offset-4 hover:underline">{formatCode(p.passport_code)}</span>
              <Badge tone={PASSPORT_TONE[p.status]}>{t(`passportStatus.${p.status}`)}</Badge>
              <span className="text-navy/60">
                {loc(p.tier, 'name')}
                {p.issued_at ? ` · ${formatDateTime(p.issued_at, i18n.language)}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <AssignPassportDialog student={assignOpen ? student : null} onClose={() => setAssignOpen(false)} />
      <PassportDetailDialog passportId={openId} onClose={() => setOpenId(null)} />
    </section>
  )
}
