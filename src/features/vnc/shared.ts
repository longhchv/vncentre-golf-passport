// Mã VNC (docs/spec/12-ma-vnc-so-dep-dang-nhap.md): hạng, nhóm, định dạng giá dùng chung cho trang người dùng và admin.

export const TIERS = ['kim_cuong', 'vang', 'bac', 'dong', 'nam_sinh'] as const
export type Tier = (typeof TIERS)[number] | 'thuong'

export const CATEGORIES = [
  'luc_quy', 'ngu_quy', 'sanh_6', 'so_tron', 'tu_quy', 'taxi', 'dao_ganh_6', 'so_golf',
  'sanh_4', 'so_golf_duoi', 'loc_phat', 'dao_ganh_4', 'tam_hoa', 'nam_sinh',
] as const

export interface VncCode {
  code: string
  tier: Tier
  categories: string[]
  list_price: number | null
  is_primary?: boolean
  status?: string
  acquired_at?: string | null
  acquired_by?: 'cap' | 'tang' | 'mua' | null
  match?: 'exact' | 'near' | 'contains' | 'stock'
}

export const TIER_STYLE: Record<Tier, string> = {
  kim_cuong: 'bg-sky-100 text-sky-900',
  vang: 'bg-gold/30 text-brown',
  bac: 'bg-slate-200 text-slate-800',
  dong: 'bg-orange-100 text-orange-900',
  nam_sinh: 'bg-emerald-100 text-emerald-900',
  thuong: 'bg-navy/5 text-navy/70',
}

/** 012345 → "012 345" cho dễ đọc. */
export function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

export function formatVnd(n: number | null | undefined, lang: string) {
  if (n == null) return '—'
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(n) + ' đ'
}

/** Chỉ giữ chữ số, tối đa 6 (ô tìm số). */
export function digitsOnly(s: string) {
  return s.replace(/\D/g, '').slice(0, 6)
}
