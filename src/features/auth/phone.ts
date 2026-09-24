// Số điện thoại cho đăng ký/đăng nhập (F1): mặc định +84, chọn được mã nước khác. Lưu dạng E.164.

export interface Country {
  code: string // ISO
  dial: string // không có dấu +
  name_vi: string
  name_en: string
}

// Các nước thường gặp ở lớp quốc tế (UNIS); "Khác" cho phép gõ mã tuỳ ý.
export const COUNTRIES: Country[] = [
  { code: 'VN', dial: '84', name_vi: 'Việt Nam', name_en: 'Vietnam' },
  { code: 'KR', dial: '82', name_vi: 'Hàn Quốc', name_en: 'South Korea' },
  { code: 'JP', dial: '81', name_vi: 'Nhật Bản', name_en: 'Japan' },
  { code: 'CN', dial: '86', name_vi: 'Trung Quốc', name_en: 'China' },
  { code: 'TW', dial: '886', name_vi: 'Đài Loan', name_en: 'Taiwan' },
  { code: 'HK', dial: '852', name_vi: 'Hồng Kông', name_en: 'Hong Kong' },
  { code: 'SG', dial: '65', name_vi: 'Singapore', name_en: 'Singapore' },
  { code: 'TH', dial: '66', name_vi: 'Thái Lan', name_en: 'Thailand' },
  { code: 'MY', dial: '60', name_vi: 'Malaysia', name_en: 'Malaysia' },
  { code: 'IN', dial: '91', name_vi: 'Ấn Độ', name_en: 'India' },
  { code: 'AU', dial: '61', name_vi: 'Úc', name_en: 'Australia' },
  { code: 'US', dial: '1', name_vi: 'Mỹ / Canada', name_en: 'USA / Canada' },
  { code: 'GB', dial: '44', name_vi: 'Anh', name_en: 'United Kingdom' },
  { code: 'FR', dial: '33', name_vi: 'Pháp', name_en: 'France' },
  { code: 'DE', dial: '49', name_vi: 'Đức', name_en: 'Germany' },
  { code: 'NL', dial: '31', name_vi: 'Hà Lan', name_en: 'Netherlands' },
  { code: 'RU', dial: '7', name_vi: 'Nga', name_en: 'Russia' },
]

/** Ghép mã nước + số người dùng gõ → E.164, hoặc null nếu không hợp lệ. */
export function toE164(dial: string, local: string): string | null {
  const d = dial.replace(/\D/g, '')
  let n = local.replace(/[\s.\-()]/g, '')
  if (n.startsWith('+')) {
    // Người dùng gõ cả mã nước
    return /^\+[1-9]\d{6,14}$/.test(n) ? n : null
  }
  n = n.replace(/\D/g, '')
  if (n.startsWith('00')) return toE164('', '+' + n.slice(2))
  if (n.startsWith(d) && n.length > d.length + 6) n = n.slice(d.length) // gõ 84912… khi đã chọn +84
  n = n.replace(/^0+/, '') // 0912… → 912…
  if (d === '84') return /^\d{9,10}$/.test(n) ? `+84${n}` : null
  const full = `+${d}${n}`
  return /^\+[1-9]\d{6,14}$/.test(full) ? full : null
}

export const isVietnamese = (e164: string) => /^\+84\d{9,10}$/.test(e164)

/** Ô "SĐT hoặc email" ở trang đăng nhập: email giữ nguyên; số không có mã nước coi là số VN. */
export function parseIdentifier(input: string): { email: string } | { phone: string } | null {
  const s = input.trim()
  if (!s) return null
  if (s.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? { email: s.toLowerCase() } : null
  const phone = toE164('84', s)
  return phone ? { phone } : null
}
