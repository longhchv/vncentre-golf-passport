import { useTranslation } from 'react-i18next'
import { CrudTable } from '@/features/admin/CrudTable'
import { formatVnd, useLocalized } from '@/lib/i18nField'
import type { AppSetting, Product } from '@/lib/types'

/** Cấu hình: giá sản phẩm, giới hạn OTP, đơn giá tin, nội dung mẫu tin mời… (F16, R13). */
export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t('admin.nav.settings')}</h1>
      <CrudTable<Product>
        table="products"
        titleKey="admin.settings.products"
        order="code"
        canCreate={false}
        columns={[
          { key: 'name', labelKey: 'fields.name', render: (p) => loc(p, 'name') },
          { key: 'price_vnd', labelKey: 'fields.price', render: (p) => formatVnd(p.price_vnd, i18n.language) },
          { key: 'is_active', labelKey: 'fields.status', render: (p) => (p.is_active ? t('common.active') : t('common.inactive')) },
        ]}
        fields={[
          { name: 'name_vi', labelKey: 'fields.nameVi', required: true },
          { name: 'name_en', labelKey: 'fields.nameEn', required: true },
          { name: 'price_vnd', labelKey: 'fields.priceVnd', type: 'number', required: true },
          { name: 'is_active', labelKey: 'fields.isActive', type: 'checkbox' },
        ]}
      />
      <CrudTable<AppSetting>
        table="app_settings"
        titleKey="admin.settings.parameters"
        order="key"
        canCreate={false}
        columns={[
          {
            key: 'description',
            labelKey: 'fields.setting',
            render: (s) => (
              <div>
                <div>{loc(s, 'description') || s.key}</div>
                <code className="text-xs text-navy/50">{s.key}</code>
              </div>
            ),
          },
          {
            key: 'value',
            labelKey: 'fields.value',
            render: (s) => (
              <code className="block max-w-xs text-sm break-words whitespace-pre-wrap">
                {typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)}
              </code>
            ),
          },
        ]}
        fields={[
          { name: 'key', labelKey: 'fields.code', readOnlyOnEdit: true },
          { name: 'value', labelKey: 'fields.value', type: 'json', required: true, hintKey: 'admin.settings.valueHint' },
        ]}
      />
    </div>
  )
}
