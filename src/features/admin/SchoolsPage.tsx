import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/card'
import { CrudTable } from '@/features/admin/CrudTable'
import type { School } from '@/lib/types'

const SCHOOL_TYPES = ['public', 'private', 'international', 'center', 'club', 'other'] as const

export function SchoolsPage() {
  const { t } = useTranslation()
  const typeOptions = SCHOOL_TYPES.map((v) => ({ value: v, label: t(`schoolType.${v}`) }))
  return (
    <CrudTable<School>
      table="schools"
      titleKey="admin.nav.schools"
      order="name"
      newDefaults={{ type: 'public', is_active: true, requires_photo_consent: false }}
      columns={[
        { key: 'name', labelKey: 'fields.name' },
        { key: 'short_name', labelKey: 'fields.shortName' },
        { key: 'type', labelKey: 'fields.schoolType', render: (r) => t(`schoolType.${r.type}`) },
        { key: 'city', labelKey: 'fields.city' },
        {
          key: 'requires_photo_consent',
          labelKey: 'fields.photoConsent',
          render: (r) => (r.requires_photo_consent ? t('common.yes') : t('common.no')),
        },
        {
          key: 'is_active',
          labelKey: 'fields.status',
          render: (r) =>
            r.is_active ? <Badge tone="good">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>,
        },
      ]}
      fields={[
        { name: 'name', labelKey: 'fields.name', required: true },
        { name: 'short_name', labelKey: 'fields.shortName' },
        { name: 'type', labelKey: 'fields.schoolType', type: 'select', required: true, options: typeOptions },
        { name: 'city', labelKey: 'fields.city' },
        { name: 'address', labelKey: 'fields.address' },
        { name: 'requires_photo_consent', labelKey: 'fields.photoConsent', type: 'checkbox' },
        { name: 'is_active', labelKey: 'fields.isActive', type: 'checkbox' },
      ]}
    />
  )
}
