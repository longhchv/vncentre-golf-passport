// Danh mục dùng chung cho khu quản trị sân: quốc gia, tiện ích, loại ảnh, màu tee, tạo đường dẫn.
// Khoá tiện ích và loại ảnh trùng với bộ tạo trang (SG.FAC, SG.SHOT) để website hiện đúng nhãn.
import { SG, sgSlug } from '@/lib/site-builder/site-builder.mjs'
import { normName } from './importFormat'

/** Quốc gia hay dùng; ô "Khác" cho gõ mã 2 chữ cái. */
export const COUNTRIES: { code: string; vi: string; en: string }[] = [
  { code: 'VN', vi: 'Việt Nam', en: 'Vietnam' },
  { code: 'TH', vi: 'Thái Lan', en: 'Thailand' },
  { code: 'JP', vi: 'Nhật Bản', en: 'Japan' },
  { code: 'KR', vi: 'Hàn Quốc', en: 'South Korea' },
  { code: 'CN', vi: 'Trung Quốc', en: 'China' },
  { code: 'MY', vi: 'Malaysia', en: 'Malaysia' },
  { code: 'SG', vi: 'Singapore', en: 'Singapore' },
  { code: 'ID', vi: 'Indonesia', en: 'Indonesia' },
  { code: 'PH', vi: 'Philippines', en: 'Philippines' },
  { code: 'KH', vi: 'Campuchia', en: 'Cambodia' },
  { code: 'LA', vi: 'Lào', en: 'Laos' },
  { code: 'TW', vi: 'Đài Loan', en: 'Taiwan' },
  { code: 'AU', vi: 'Úc', en: 'Australia' },
  { code: 'US', vi: 'Hoa Kỳ', en: 'United States' },
  { code: 'GB', vi: 'Vương quốc Anh', en: 'United Kingdom' },
  { code: 'AE', vi: 'UAE', en: 'United Arab Emirates' },
]

export function countryName(code: string, lang: string): string {
  const c = COUNTRIES.find((x) => x.code === code)
  return c ? (lang === 'en' ? c.en : c.vi) : code
}

/** Tiện ích hiện trên website (khoá của SG.FAC). */
export const FACILITIES = Object.keys(SG.FAC) as string[]
export const facLabel = (key: string, lang: string): string => (SG.FAC[key] as [string, string] | undefined)?.[lang === 'en' ? 1 : 0] ?? key

/** Loại ảnh admin chọn nhanh (khoá của SG.SHOT, cộng 'hole' cho ảnh từng hố). */
export const PHOTO_KINDS = ['view', 'signature', 'hole', 'sunset', 'clubhouse', 'restaurant', 'terrace', 'range', 'putting', 'flag', 'scenery', 'scorecard', 'map', 'hotel', 'dish', 'other'] as const
export function kindLabel(kind: string | null, lang: string): string {
  if (kind === 'hole') return lang === 'en' ? 'Hole' : 'Hố'
  return (SG.SHOT[kind ?? 'other'] as [string, string] | undefined)?.[lang === 'en' ? 1 : 0] ?? kind ?? ''
}

/** Màu tee hay gặp; tên gõ vào khớp thì tự gán màu và giới tính gợi ý. */
export const TEE_PRESETS: { keys: string[]; color: string; gender: 'M' | 'F' | 'X'; vi: string; en: string }[] = [
  { keys: ['den', 'black', 'champion', 'championship', 'pro', 'tour'], color: '#111111', vi: 'Đen', en: 'Black', gender: 'M' },
  { keys: ['vang kim', 'gold'], color: '#C9A227', vi: 'Vàng kim', en: 'Gold', gender: 'M' },
  { keys: ['xanh', 'xanh duong', 'blue'], color: '#1F5FB0', vi: 'Xanh dương', en: 'Blue', gender: 'M' },
  { keys: ['trang', 'white', 'regular'], color: '#FFFFFF', vi: 'Trắng', en: 'White', gender: 'M' },
  { keys: ['vang', 'yellow'], color: '#F2C200', vi: 'Vàng', en: 'Yellow', gender: 'M' },
  { keys: ['xanh la', 'green'], color: '#2E8B3E', vi: 'Xanh lá', en: 'Green', gender: 'X' },
  { keys: ['bac', 'silver', 'senior'], color: '#A7A9AC', vi: 'Bạc', en: 'Silver', gender: 'X' },
  { keys: ['do', 'red', 'ladies', 'lady', 'nu', 'women'], color: '#C0392B', vi: 'Đỏ', en: 'Red', gender: 'F' },
  { keys: ['hong', 'pink'], color: '#E36AA8', vi: 'Hồng', en: 'Pink', gender: 'F' },
  { keys: ['cam', 'orange', 'junior'], color: '#E67E22', vi: 'Cam', en: 'Orange', gender: 'X' },
]

export function teePreset(name: string) {
  const n = normName(name)
  if (!n) return null
  // Khớp cụm dài trước ("xanh la" trước "xanh", "vang kim" trước "vang")
  const all = TEE_PRESETS.flatMap((p) => p.keys.map((k) => ({ k, p }))).sort((a, b) => b.k.length - a.k.length)
  const hit = all.find(({ k }) => n === k || n.startsWith(k + ' ') || n.endsWith(' ' + k) || n.includes(' ' + k + ' '))
  return hit?.p ?? null
}

/** Đường dẫn trang sân (không dấu, gạch nối), tránh trùng với sân đã có. */
export function uniqueSlug(name: string, taken: (string | null | undefined)[]): string {
  const base = sgSlug(name) || 'san'
  const set = new Set(taken.filter(Boolean))
  if (!set.has(base)) return base
  for (let i = 2; ; i++) if (!set.has(`${base}-${i}`)) return `${base}-${i}`
}

/** Sân đã có tên gần giống (để báo trước khi tạo trùng). */
export function similarCourse<T extends { name: string; name_en?: string | null }>(name: string, list: T[]): T | undefined {
  const n = normName(name)
  if (n.length < 4) return undefined
  return list.find((c) => [c.name, c.name_en].some((x) => {
    const m = normName(x || '')
    return m && (m === n || (Math.min(m.length, n.length) >= 6 && (m.includes(n) || n.includes(m))))
  }))
}
