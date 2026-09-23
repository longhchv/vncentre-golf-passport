import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CrudTable } from '@/features/admin/CrudTable'
import type { FieldSpec } from '@/features/admin/EntityForm'
import { useTable } from '@/lib/db'
import { useLocalized } from '@/lib/i18nField'
import type { AcademicYear, ClassRow, ClassType, Level, Program, School } from '@/lib/types'

/** Dữ liệu tra cứu dùng chung cho biểu mẫu lớp. */
export function useClassLookups() {
  const schools = useTable<School>('schools', { order: 'name' })
  const years = useTable<AcademicYear>('academic_years', { order: 'start_date', ascending: false })
  const programs = useTable<Program>('programs', { order: 'code' })
  const classTypes = useTable<ClassType>('class_types', { order: 'code' })
  const levels = useTable<Level>('levels', { order: 'number' })
  return { schools, years, programs, classTypes, levels }
}

export function useClassFields(): FieldSpec[] {
  const { t } = useTranslation()
  const loc = useLocalized()
  const { schools, years, programs, classTypes, levels } = useClassLookups()
  const programById = new Map((programs.data ?? []).map((p) => [p.id, p]))
  return [
    { name: 'name', labelKey: 'fields.className', required: true, hintKey: 'classes.nameHint' },
    {
      name: 'school_id',
      labelKey: 'fields.school',
      type: 'select',
      options: (schools.data ?? []).map((s) => ({ value: s.id, label: s.short_name || s.name })),
    },
    {
      name: 'academic_year_id',
      labelKey: 'fields.yearName',
      type: 'select',
      options: (years.data ?? []).map((y) => ({ value: y.id, label: y.name })),
    },
    {
      name: 'program_id',
      labelKey: 'fields.program',
      type: 'select',
      required: true,
      options: (programs.data ?? []).map((p) => ({ value: p.id, label: loc(p, 'name') })),
    },
    {
      name: 'class_type_id',
      labelKey: 'fields.classType',
      type: 'select',
      options: (classTypes.data ?? []).map((c) => ({ value: c.id, label: loc(c, 'name') })),
    },
    {
      name: 'target_level_id',
      labelKey: 'fields.targetLevel',
      type: 'select',
      options: (levels.data ?? []).map((l) => ({
        value: l.id,
        label: `${programById.get(l.program_id)?.code === 'core20' ? '' : loc(programById.get(l.program_id), 'name') + ' – '}${loc(l, 'name')}`,
      })),
    },
    {
      name: 'scoring_mode',
      labelKey: 'fields.scoringModeClass',
      type: 'select',
      hintKey: 'classes.scoringHint',
      options: ['pass_fail', 'scale_1_5', 'measured'].map((v) => ({ value: v, label: t(`scoringMode.${v}`) })),
    },
    { name: 'start_date', labelKey: 'fields.startDate', type: 'date' },
    { name: 'end_date', labelKey: 'fields.endDate', type: 'date' },
    {
      name: 'status',
      labelKey: 'fields.status',
      type: 'select',
      required: true,
      options: ['active', 'completed', 'archived'].map((v) => ({ value: v, label: t(`classStatus.${v}`) })),
    },
  ]
}

export function ClassesPage() {
  const { t } = useTranslation()
  const { schools, years, programs } = useClassLookups()
  const fields = useClassFields()
  const schoolName = new Map((schools.data ?? []).map((s) => [s.id, s.short_name || s.name]))
  const yearName = new Map((years.data ?? []).map((y) => [y.id, y.name]))
  const core = programs.data?.find((p) => p.code === 'core20')
  const currentYear = years.data?.find((y) => y.is_current)

  return (
    <CrudTable<ClassRow>
      table="classes"
      titleKey="admin.nav.classes"
      order="name"
      filter={(c) => !c.deleted_at}
      newDefaults={{ status: 'active', program_id: core?.id, academic_year_id: currentYear?.id }}
      fields={fields}
      columns={[
        {
          key: 'name',
          labelKey: 'fields.className',
          render: (c) => (
            <Link to={`/admin/classes/${c.id}`} className="font-semibold text-navy underline-offset-4 hover:underline">
              {c.name}
            </Link>
          ),
        },
        { key: 'school', labelKey: 'fields.school', render: (c) => (c.school_id ? schoolName.get(c.school_id) : '—') },
        { key: 'year', labelKey: 'fields.yearName', render: (c) => (c.academic_year_id ? yearName.get(c.academic_year_id) : '—') },
        { key: 'code', labelKey: 'classes.joinCode', render: (c) => <code className="font-mono">{c.class_join_code}</code> },
        {
          key: 'status',
          labelKey: 'fields.status',
          render: (c) => <Badge tone={c.status === 'active' ? 'good' : 'neutral'}>{t(`classStatus.${c.status}`)}</Badge>,
        },
      ]}
      extraActions={(c) => (
        <Button asChild size="sm" variant="ghost" aria-label={t('classes.open')}>
          <Link to={`/admin/classes/${c.id}`}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      )}
    />
  )
}
