import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTable } from '@/lib/db'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/form'
import { GradeRoster } from '@/features/school/GradeRoster'
import type { School } from '@/lib/types'

/** Admin · Lớp & lên lớp (spec 22, D75): chọn trường → sửa lớp từng em, cờ "không tự lên lớp", sửa hàng loạt theo lớp. */
export function GradesAdminPage() {
  const { t } = useTranslation()
  const schools = useTable<School>('schools', { order: 'name' })
  const [schoolId, setSchoolId] = useState('')
  const list = schools.data ?? []
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('admin.nav.grades')}</h1>
      <Card className="p-4">
        <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} aria-label={t('fields.school')} className="max-w-md">
          <option value="">{t('grades.pickSchool')}</option>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.short_name || s.name}
            </option>
          ))}
        </Select>
      </Card>
      {schoolId && <GradeRoster key={schoolId} schoolId={schoolId} admin />}
    </div>
  )
}
