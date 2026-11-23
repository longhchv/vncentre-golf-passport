// Spec 25/26 · Sân tập & phòng golf 3D — truy cập practice_venues, sim_brands, practice_venue_history.
// Quyền ở cơ sở dữ liệu: chỉ admin ghi (is_admin); người xem web đọc view pv_public_venues.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const REGIONS = ['hn', 'hcm', 'dn', 'north', 'central', 'south'] as const
export type Region = (typeof REGIONS)[number]
export const VENUE_TYPES = ['3d', 'range', 'academy', 'course', 'mini'] as const
export type VenueType = (typeof VENUE_TYPES)[number]
export const VENUE_STATUS = ['draft', 'active', 'closed_temp', 'closed'] as const
export type VenueStatus = (typeof VENUE_STATUS)[number]
export const PARKING = ['unknown', 'free', 'paid', 'none'] as const
export type Parking = (typeof PARKING)[number]
/** Mã tiện ích đúng như trang web sân tập đang dùng. */
export const SVC = ['food', 'restaurant', 'cafe', 'bar', 'class', 'kids', 'family', 'card', 'wifi', 'restroom', 'wheelchair', 'shop', 'vip', 'gym', 'pool', 'sauna', 'course'] as const
export const BRAND_GROUPS = ['tour', 'screen', 'home'] as const

export interface PriceRow { item_vi: string; item_en?: string; price: string; unit?: string; note?: string; verified_at?: string }
export interface MachineDetail { model?: string; software?: string; note?: string }

export interface Venue {
  id: string; region: Region; name: string; type: VenueType; district: string | null; address: string | null
  lat: number | null; lng: number | null; phone: string | null; email: string | null; web: string | null
  fb_url: string | null; fb_chain_url: string | null; fb_chain_name: string | null; videos: string[]
  hours: string | null; late: boolean; machine: string | null; machine_detail: MachineDetail; bays: number | null
  svc: string[]; parking: Parking; parking_note: string | null; residents_only: boolean; prices: PriceRow[]
  google_rating: number | null; google_reviews: number | null; google_at: string | null
  status: VenueStatus; partner_id: string | null; vnc_score: number | null; user_rating: number | null; user_reviews: number
  created_at: string; updated_at: string
}

export interface Brand {
  key: string; group: (typeof BRAND_GROUPS)[number]; origin_vi: string | null; origin_en: string | null; badges: string[]
  sum_vi: string | null; sum_en: string | null; tech_vi: string | null; tech_en: string | null; fit_vi: string | null; fit_en: string | null
  models: [string, string][]; feats: string[]; apps: [string, string][]; sources: string[]; sort: number; active: boolean
}

export interface HistoryRow {
  id: number; venue_id: string; changed_by: string | null; changed_at: string; source: string; source_id: string | null
  before: Partial<Venue> | null; after: Partial<Venue> | null
}

function db() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình')
  return supabase
}
async function rows<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

export const venueKeys = {
  list: ['practice_venues'] as const,
  one: (id: string) => ['practice_venues', id] as const,
  history: (id: string) => ['practice_venue_history', id] as const,
  brands: ['sim_brands'] as const,
}

export function useVenues() {
  return useQuery({ queryKey: venueKeys.list, queryFn: () => rows<Venue[]>(db().from('practice_venues').select('*').order('region').order('name')) })
}
export function useVenue(id: string) {
  return useQuery({ queryKey: venueKeys.one(id), enabled: !!id, queryFn: () => rows<Venue>(db().from('practice_venues').select('*').eq('id', id).single()) })
}
export function useBrands() {
  return useQuery({ queryKey: venueKeys.brands, queryFn: () => rows<Brand[]>(db().from('sim_brands').select('*').order('sort').order('key')) })
}
export function useHistory(id: string) {
  return useQuery({
    queryKey: venueKeys.history(id),
    queryFn: () => rows<HistoryRow[]>(db().from('practice_venue_history').select('*').eq('venue_id', id).order('changed_at', { ascending: false }).limit(100)),
  })
}

/** Tạo (cấp mã theo vùng bằng pv_next_id) hoặc cập nhật một địa điểm. */
export function useSaveVenue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: Partial<Venue> }) => {
      if (id) return rows<Venue>(db().from('practice_venues').update(values).eq('id', id).select().single())
      const newId = await rows<string>(db().rpc('pv_next_id', { p_region: values.region }))
      return rows<Venue>(db().from('practice_venues').insert({ ...values, id: newId }).select().single())
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: venueKeys.list })
      qc.setQueryData(venueKeys.one(v.id), v)
      qc.invalidateQueries({ queryKey: venueKeys.history(v.id) })
    },
  })
}

export function useRestore(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (historyId: number) => rows(db().rpc('pv_restore', { p_history_id: historyId })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: venueKeys.one(venueId) })
      qc.invalidateQueries({ queryKey: venueKeys.history(venueId) })
      qc.invalidateQueries({ queryKey: venueKeys.list })
    },
  })
}

export function useSaveBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ isNew, brand }: { isNew: boolean; brand: Brand }) => {
      const q = isNew ? db().from('sim_brands').insert(brand) : db().from('sim_brands').update(brand).eq('key', brand.key)
      return rows<Brand>(q.select().single())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: venueKeys.brands })
      qc.invalidateQueries({ queryKey: venueKeys.list })
    },
  })
}

export function useImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brands, venues }: { brands: unknown[]; venues: unknown[] }) => {
      const r = await rows<{ brands_in: number; venues_in: number }[]>(db().rpc('pv_import', { p_brands: brands, p_venues: venues }))
      return r[0]
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: venueKeys.list })
      qc.invalidateQueries({ queryKey: venueKeys.brands })
    },
  })
}

/** Các trường còn thiếu của một địa điểm (dùng cho bộ lọc "thiếu dữ liệu" và độ phủ). */
export type Gap = 'machine' | 'price' | 'phone' | 'fb'
export function gaps(v: Venue): Gap[] {
  const out: Gap[] = []
  if ((v.type === '3d' || v.type === 'academy') && !v.machine) out.push('machine')
  if (!v.prices?.length) out.push('price')
  if (!v.phone) out.push('phone')
  if (!v.fb_url && !v.fb_chain_url) out.push('fb')
  return out
}

/** Trường đổi giữa hai bản (bỏ cột hệ thống). */
const SYS = new Set(['updated_at', 'created_at', 'updated_by', 'created_by'])
export function changedFields(before: Partial<Venue> | null, after: Partial<Venue> | null): string[] {
  if (!before || !after) return []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((k) => !SYS.has(k) && JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((after as Record<string, unknown>)[k]))
}

/** Lỗi Supabase → câu dễ hiểu. */
export function venueErr(e: unknown, t: (k: string, o?: Record<string, unknown>) => string): string {
  const m = (e as { message?: string })?.message || String(e)
  if (/row-level security|permission denied|not_allowed|not authorized/i.test(m)) return t('venues.err.permission')
  if (/Failed to fetch|NetworkError|network/i.test(m)) return t('venues.err.network')
  if (/does not exist|schema cache/i.test(m)) return t('venues.err.notMigrated')
  if (/nothing_to_restore/.test(m)) return t('venues.err.nothingToRestore')
  return t('venues.err.generic', { msg: m })
}
