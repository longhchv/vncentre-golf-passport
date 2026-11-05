// Đọc "thông tin sân" và "danh sách địa điểm quanh sân" Minh gửi (docs/spec/goi-y-quanh-san.md, mục Định dạng nhập).
// Không gọi dịch vụ ngoài nào. Mọi lỗi trả về theo từng dòng để admin sửa.
import type { GcPlace, GcPlaceCat } from '@/lib/types'

export const PLACE_CATS: GcPlaceCat[] = ['lodging', 'food', 'cafe', 'kids', 'heritage', 'nature', 'fun', 'shop']
/** Nhóm cũ của app CSR → tab mới (giống SG.TABS của bộ tạo trang) */
export const LEGACY_CAT: Record<string, GcPlaceCat> = { family: 'kids', see: 'heritage', spa: 'fun', night: 'fun' }

export interface CourseBlock {
  name: string
  name_en?: string
  country: string
  province?: string
  lat?: number
  lng?: number
  phone?: string
  website?: string
  holes?: number
}

export interface PlaceRow {
  pid: string | null
  name: string
  cat: GcPlaceCat
  area: string | null
  km: number | null
  drive_min: number | null
  g_rating: number | null
  g_count: number | null
  g_at: string | null
  phone: string | null
  note: string | null
  note_en: string | null
  pass: boolean
  why: string | null
}

export interface ParseResult<T> { ok: boolean; value: T | null; errors: string[] }

/** Bỏ ``` và chữ thừa quanh khối JSON (Minh có thể gửi kèm lời dẫn). */
function extractJson(text: string): unknown {
  const t = (text || '').replace(/```(?:json)?/gi, '').trim()
  const start = t.search(/[[{]/)
  if (start < 0) throw new Error('Không thấy khối dữ liệu')
  const open = t[start], close = open === '{' ? '}' : ']'
  const end = t.lastIndexOf(close)
  if (end <= start) throw new Error('Khối dữ liệu bị cắt dở')
  return JSON.parse(t.slice(start, end + 1))
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => {
  const s = v === null || v === undefined ? '' : String(v).trim()
  return s ? s : null
}
const isoDate = (v: unknown): string | null => {
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export function parseCourseBlock(text: string): ParseResult<CourseBlock> {
  let j: Record<string, unknown>
  try { j = extractJson(text) as Record<string, unknown> } catch (e) { return { ok: false, value: null, errors: [(e as Error).message] } }
  const errors: string[] = []
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, value: null, errors: ['Khối thông tin sân phải là một đối tượng { … }'] }
  if (j.type && j.type !== 'course') errors.push(`Đây là khối "${String(j.type)}", không phải thông tin sân`)
  const name = str(j.name)
  if (!name) errors.push('Thiếu tên sân (name)')
  const country = (str(j.country) || 'VN').toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) errors.push('Mã quốc gia phải gồm 2 chữ cái, vd VN, TH')
  const lat = num(j.lat), lng = num(j.lng)
  if ((lat === null) !== (lng === null)) errors.push('Toạ độ phải có đủ lat và lng')
  if (lat !== null && (Math.abs(lat) > 90 || Math.abs(lng ?? 0) > 180)) errors.push('Toạ độ ngoài phạm vi')
  const holes = num(j.holes)
  if (holes !== null && (holes < 1 || holes > 54)) errors.push('Số hố phải từ 1 đến 54')
  if (errors.length) return { ok: false, value: null, errors }
  return { ok: true, errors, value: {
    name: name!, name_en: str(j.name_en) ?? undefined, country, province: str(j.province) ?? undefined,
    lat: lat ?? undefined, lng: lng ?? undefined, phone: str(j.phone) ?? undefined, website: str(j.website) ?? undefined, holes: holes ?? undefined,
  } }
}

export function parsePlacesBlock(text: string): ParseResult<{ course: string | null; at: string | null; places: PlaceRow[] }> & { rowErrors: { index: number; name: string; error: string }[] } {
  let j: unknown
  try { j = extractJson(text) } catch (e) { return { ok: false, value: null, errors: [(e as Error).message], rowErrors: [] } }
  const obj = Array.isArray(j) ? { places: j } : (j as Record<string, unknown>)
  if (obj && 'type' in obj && obj.type && obj.type !== 'places') return { ok: false, value: null, errors: [`Đây là khối "${String(obj.type)}", không phải danh sách địa điểm`], rowErrors: [] }
  const list = Array.isArray(obj?.places) ? (obj.places as Record<string, unknown>[]) : null
  if (!list) return { ok: false, value: null, errors: ['Không thấy danh sách "places"'], rowErrors: [] }
  const at = isoDate(obj.at)
  const rowErrors: { index: number; name: string; error: string }[] = []
  const places: PlaceRow[] = []
  list.forEach((r, i) => {
    const name = str(r?.name)
    const rawCat = str(r?.cat)
    const cat = (rawCat && (LEGACY_CAT[rawCat] ?? rawCat)) as GcPlaceCat | null
    if (!name) return rowErrors.push({ index: i + 1, name: '', error: 'Thiếu tên' })
    if (!cat || !PLACE_CATS.includes(cat)) return rowErrors.push({ index: i + 1, name, error: `Nhóm "${rawCat ?? ''}" không hợp lệ` })
    const g_rating = num(r.g_rating)
    if (g_rating !== null && (g_rating < 0 || g_rating > 5)) return rowErrors.push({ index: i + 1, name, error: 'Số sao phải từ 0 đến 5' })
    places.push({
      pid: str(r.pid), name, cat, area: str(r.area), km: num(r.km), drive_min: num(r.drive_min),
      g_rating, g_count: num(r.g_count), g_at: isoDate(r.g_at) ?? at, phone: str(r.phone),
      note: str(r.note), note_en: str(r.note_en), pass: r.pass === undefined ? true : Boolean(r.pass), why: str(r.why),
    })
  })
  return { ok: places.length > 0, errors: places.length ? [] : ['Không có địa điểm hợp lệ nào'], rowErrors,
    value: { course: str(obj.course), at, places } }
}

/** Chuẩn hoá tên để so trùng: bỏ dấu, chữ thường, bỏ ký tự đặc biệt và các chữ chung chung. */
export function normName(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(nha hang|khach san|quan|cafe|coffee|ca phe|hotel|resort|restaurant)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

export type MatchKind = 'new' | 'update' | 'visited'

/** Đối chiếu danh sách nhập với địa điểm đã có: theo pid, rồi theo tên gần giống. Không bao giờ ghi đè nơi đoàn đã ghé. */
export function matchExisting(rows: PlaceRow[], existing: Pick<GcPlace, 'id' | 'pid' | 'name' | 'src'>[]) {
  const byPid = new Map(existing.filter((e) => e.pid).map((e) => [e.pid!, e]))
  const byName = existing.map((e) => ({ e, n: normName(e.name) }))
  return rows.map((row) => {
    let hit = row.pid ? byPid.get(row.pid) : undefined
    if (!hit) {
      const n = normName(row.name)
      hit = byName.find((x) => x.n && n && (x.n === n || (Math.min(x.n.length, n.length) >= 6 && (x.n.includes(n) || n.includes(x.n)))))?.e
    }
    const kind: MatchKind = !hit ? 'new' : hit.src === 'visited' ? 'visited' : 'update'
    return { row, kind, existingId: hit?.id ?? null }
  })
}
