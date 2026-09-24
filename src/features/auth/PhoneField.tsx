import { useTranslation } from 'react-i18next'
import { Field, Input, Select } from '@/components/ui/form'
import { COUNTRIES } from './phone'

/** Ô số điện thoại: chọn mã nước (mặc định +84) + số (F1 bước 1). */
export function PhoneField({
  dial,
  onDial,
  value,
  onChange,
  label,
  error,
}: {
  dial: string
  onDial: (d: string) => void
  value: string
  onChange: (v: string) => void
  label?: string
  error?: string | null
}) {
  const { t, i18n } = useTranslation()
  const en = i18n.language === 'en'
  return (
    <Field label={label ?? t('auth.phone')} error={error} hint={dial === '84' ? t('auth.phoneHintVn') : t('auth.phoneHintForeign')}>
      <div className="flex gap-2">
        <Select value={dial} onChange={(e) => onDial(e.target.value)} className="w-32 shrink-0" aria-label={t('auth.countryCode')}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.dial}>
              +{c.dial} {en ? c.name_en : c.name_vi}
            </option>
          ))}
        </Select>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={dial === '84' ? '0912 345 678' : ''}
        />
      </div>
    </Field>
  )
}
