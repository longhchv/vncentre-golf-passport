import { useTranslation } from 'react-i18next'
import { CrudTable } from '@/features/admin/CrudTable'
import { Card } from '@/components/ui/card'
import { useSaveRow, useTable } from '@/lib/db'
import { formatVnd, useLocalized } from '@/lib/i18nField'
import type { AppSetting, Product } from '@/lib/types'

/** Cấu hình: giá sản phẩm, giới hạn OTP, đơn giá tin, nội dung mẫu tin mời… (F16, R13). */
export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t('admin.nav.settings')}</h1>
      <OtpChannelSwitch />
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

/**
 * Spec 16: công tắc kênh gửi mã xác thực cho số Việt Nam (app_settings `auth.otp_vn_channel`).
 * Nhật ký: trigger audit_row trên app_settings ghi trước / sau mỗi lần đổi.
 */
function OtpChannelSwitch() {
  const { t } = useTranslation()
  const rows = useTable<AppSetting>('app_settings', { order: 'key' })
  const save = useSaveRow('app_settings')
  const row = rows.data?.find((r) => r.key === 'auth.otp_vn_channel')
  if (!row) return null
  const current = row.value === 'zalo' ? 'zalo' : 'email'
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-lg font-bold">{t('admin.settings.otpChannel.title')}</h2>
      <p className="text-sm text-navy/70">{t('admin.settings.otpChannel.hint')}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('admin.settings.otpChannel.title')}>
        {(['email', 'zalo'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={current === v}
            disabled={save.isPending}
            onClick={() => current !== v && save.mutate({ id: row.id, value: v })}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${current === v ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15'}`}
          >
            {t(`admin.settings.otpChannel.${v}`)}
          </button>
        ))}
      </div>
    </Card>
  )
}
