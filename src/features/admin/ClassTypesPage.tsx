import { useTranslation } from 'react-i18next'
import { CrudTable } from '@/features/admin/CrudTable'
import { useLocalized } from '@/lib/i18nField'
import type { ClassType } from '@/lib/types'

const range = (a: number | null, b: number | null) => (a === null && b === null ? '—' : a === b ? `${a}` : `${a ?? '?'}–${b ?? '?'}`)

export function ClassTypesPage() {
  const { t } = useTranslation()
  const loc = useLocalized()
  const modes = ['pass_fail', 'scale_1_5', 'measured'].map((v) => ({ value: v, label: t(`scoringMode.${v}`) }))
  return (
    <CrudTable<ClassType>
      table="class_types"
      titleKey="admin.nav.classTypes"
      order="code"
      canCreate={false}
      columns={[
        { key: 'name', labelKey: 'fields.name', render: (r) => loc(r, 'name') },
        { key: 'minutes', labelKey: 'fields.sessionMinutes', render: (r) => range(r.session_minutes_min, r.session_minutes_max) },
        { key: 'sessions', labelKey: 'fields.sessionsPerLevel', render: (r) => range(r.sessions_per_level_min, r.sessions_per_level_max) },
        { key: 'default_scoring_mode', labelKey: 'fields.scoringMode', render: (r) => t(`scoringMode.${r.default_scoring_mode}`) },
      ]}
      fields={[
        { name: 'code', labelKey: 'fields.code', readOnlyOnEdit: true },
        { name: 'name_vi', labelKey: 'fields.nameVi', required: true },
        { name: 'name_en', labelKey: 'fields.nameEn', required: true },
        { name: 'session_minutes_min', labelKey: 'fields.sessionMinutesMin', type: 'number' },
        { name: 'session_minutes_max', labelKey: 'fields.sessionMinutesMax', type: 'number' },
        { name: 'sessions_per_level_min', labelKey: 'fields.sessionsPerLevelMin', type: 'number' },
        { name: 'sessions_per_level_max', labelKey: 'fields.sessionsPerLevelMax', type: 'number' },
        { name: 'default_scoring_mode', labelKey: 'fields.scoringMode', type: 'select', required: true, options: modes },
      ]}
    />
  )
}
