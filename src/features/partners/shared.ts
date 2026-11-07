import { supabase } from '@/lib/supabase'

// Dùng chung cho quầy đối tác và màn khách (spec 18).

export type PartnerKind = 'golf_course' | 'driving_range' | 'restaurant' | 'cafe' | 'other'

export interface OfferBase {
  id: string
  name_vi: string
  name_en: string | null
  kind: 'percent' | 'bonus_item'
  percent: number | null
  bonus_vi: string | null
  bonus_en: string | null
}

export async function callRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) throw error
  return data as T
}

const KNOWN_ERRORS = [
  'qr_expired',
  'qr_invalid',
  'forbidden',
  'partner_inactive',
  'daily_limit',
  'offer_invalid',
  'invalid_amount',
  'reason_required',
  'settled',
  'not_found',
] as const

/** Khoá i18n cho lỗi từ hàm SQL (raise exception '<mã>'); không nhận ra thì trả lỗi chung. */
export function partnerErrorKey(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? ''
  const hit = KNOWN_ERRORS.find((k) => msg === k || msg.includes(k))
  return hit ? `partners.errors.${hit}` : 'errors.generic'
}

/** Chỉ giữ chữ số: "180.000" → "180000". */
export function digitsOnly(s: string) {
  return s.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
}

/** Hiện số có dấu chấm ngăn cách hàng nghìn (kiểu Việt Nam) khi đang gõ. */
export function groupThousands(digits: string) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
