import { useTranslation } from 'react-i18next'

/** Lấy trường song ngữ `${base}_vi` / `${base}_en` theo ngôn ngữ đang dùng (rơi về tiếng Việt). */
export function useLocalized() {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'vi'
  return function localized<T extends object>(row: T | null | undefined, base: string): string {
    if (!row) return ''
    const r = row as Record<string, unknown>
    return (r[`${base}_${lang}`] as string | null) || (r[`${base}_vi`] as string | null) || ''
  }
}

export function formatDateTime(iso: string, lang: string) {
  // Hiển thị theo giờ Việt Nam (01 mục 1)
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso))
}

/** Ngày thuần (yyyy-mm-dd) → dd/mm/yyyy (vi) hoặc dd/mm/yyyy (en-GB), không đổi múi giờ. */
export function formatDate(isoDate: string, lang: string) {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'vi-VN', { timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

export function formatVnd(amount: number, lang: string) {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(amount) + ' đ'
}
