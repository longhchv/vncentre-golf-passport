import { useTranslation } from 'react-i18next'
import { CrudTable } from '@/features/admin/CrudTable'
import { useLocalized } from '@/lib/i18nField'
import { Badge } from '@/components/ui/card'

interface ScholarshipItem {
  id: string
  stage: 'primary' | 'lower_secondary' | 'upper_secondary'
  item_group: 'golf' | 'academic' | 'personal'
  title_vi: string
  title_en: string
  help_vi: string | null
  help_en: string | null
  auto_source: 'courses' | 'competitions' | 'culture_awards' | null
  sort_order: number
  is_active: boolean
}

/** Admin · Danh mục Hành trang học bổng (spec 15 mục 3.2). Mục có nguồn tự động: trạng thái tính lúc đọc, phụ huynh không sửa. */
export function ScholarshipItemsPage() {
  const { t } = useTranslation()
  const loc = useLocalized()
  const opts = (prefix: string, values: string[]) => values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }))
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy/65">{t('scholarship.adminIntro')}</p>
      <CrudTable<ScholarshipItem>
        table="scholarship_checklist_items"
        titleKey="admin.nav.scholarship"
        order="sort_order"
        newDefaults={{ is_active: true }}
        columns={[
          { key: 'sort_order', labelKey: 'scholarship.fields.sortOrder' },
          { key: 'stage', labelKey: 'scholarship.fields.stage', render: (r) => t(`scholarship.stage.${r.stage}`) },
          { key: 'item_group', labelKey: 'scholarship.fields.group', render: (r) => t(`scholarship.group.${r.item_group}`) },
          { key: 'title', labelKey: 'fields.name', render: (r) => loc(r, 'title') },
          {
            key: 'auto_source',
            labelKey: 'scholarship.fields.autoSource',
            render: (r) => (r.auto_source ? <Badge tone="good">{t(`scholarship.autoSource.${r.auto_source}`)}</Badge> : '—'),
          },
          { key: 'is_active', labelKey: 'scholarship.fields.active', render: (r) => (r.is_active ? '✓' : '—') },
        ]}
        fields={[
          { name: 'stage', labelKey: 'scholarship.fields.stage', type: 'select', required: true, options: opts('scholarship.stage', ['primary', 'lower_secondary', 'upper_secondary']) },
          { name: 'item_group', labelKey: 'scholarship.fields.group', type: 'select', required: true, options: opts('scholarship.group', ['golf', 'academic', 'personal']) },
          { name: 'title_vi', labelKey: 'scholarship.fields.titleVi', required: true },
          { name: 'title_en', labelKey: 'scholarship.fields.titleEn', required: true },
          { name: 'help_vi', labelKey: 'scholarship.fields.helpVi', type: 'textarea' },
          { name: 'help_en', labelKey: 'scholarship.fields.helpEn', type: 'textarea' },
          { name: 'auto_source', labelKey: 'scholarship.fields.autoSource', type: 'select', hintKey: 'scholarship.fields.autoSourceHint', options: opts('scholarship.autoSource', ['courses', 'competitions', 'culture_awards']) },
          { name: 'sort_order', labelKey: 'scholarship.fields.sortOrder', type: 'number', required: true },
          { name: 'is_active', labelKey: 'scholarship.fields.active', type: 'checkbox' },
        ]}
      />
    </div>
  )
}
