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

/** Ngôn ngữ nội dung đang dùng: 'en' hoặc 'vi'. */
export function useLang(): 'vi' | 'en' {
  const { i18n } = useTranslation()
  return i18n.language === 'en' ? 'en' : 'vi'
}

/**
 * Dữ liệu nội dung song ngữ: khi đang ở tiếng Anh, thay các trường `${f}_vi` bằng `${f}_en` (bản dịch trống thì giữ tiếng Việt),
 * mảng `${f}` bằng `${f}_en`, và nhãn từng phần thẻ (parts[].label_vi) bằng label_en. Dùng ngay khi tải dữ liệu.
 */
export function pickLang<T extends object>(row: T, lang: string, fields: string[], lists: string[] = []): T {
  if (lang !== 'en' || !row) return row
  const r = { ...(row as Record<string, unknown>) }
  for (const f of fields) {
    const en = r[`${f}_en`]
    if (typeof en === 'string' && en.trim()) r[`${f}_vi`] = en
  }
  for (const f of lists) {
    const en = r[`${f}_en`]
    if (Array.isArray(en) && en.length > 0) r[f] = en
  }
  if (Array.isArray(r.parts)) {
    r.parts = (r.parts as Record<string, unknown>[]).map((p) =>
      typeof p.label_en === 'string' && p.label_en.trim() ? { ...p, label_vi: p.label_en } : p)
  }
  return r as T
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
