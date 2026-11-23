// Đọc một dòng file số dư điểm thưởng (cột A–F: mã, họ tên, năm sinh, trường, SĐT phụ huynh, điểm còn lại).

export interface OpeningRow {
  row: number
  cells: unknown[]
  code?: string
  name?: string
  year?: string
  school?: string
  phone?: string
  points: number
  error?: 'name' | 'points' | 'year'
}

const text = (v: unknown): string => (v == null ? '' : String(v).trim())

/** Năm sinh từ: 2016 · "2016" · "13/07/2016" · "2016-07-13" · ngày kiểu số của Excel. */
export function parseYear(v: unknown): string | undefined | null {
  if (v == null || text(v) === '') return undefined
  if (typeof v === 'number') {
    if (Number.isInteger(v) && v >= 1900 && v <= 2100) return String(v)
    if (v > 3000 && v < 80000) return String(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).getUTCFullYear())
    return null
  }
  const s = text(v)
  let m = s.match(/^(\d{4})$/) ?? s.match(/^\d{1,2}[/.-]\d{1,2}[/.-](\d{4})$/) ?? s.match(/^(\d{4})-\d{1,2}-\d{1,2}/)
  if (!m) return null
  const y = Number(m[1])
  return y >= 1900 && y <= 2100 ? m[1] : null
}

/** Điểm: số nguyên ≥ 0; chấp nhận "1.200", "1,200", "1 200". */
export function parsePoints(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 999999 ? v : null
  const s = text(v).replace(/[\s.,]/g, '')
  if (!/^\d{1,6}$/.test(s)) return null
  return Number(s)
}

/** SĐT: Excel hay làm mất số 0 đầu khi ô là số. */
export function parsePhone(v: unknown): string | undefined {
  if (v == null) return undefined
  let s = typeof v === 'number' ? String(Math.round(v)) : text(v)
  if (/^[1-9]\d{8}$/.test(s)) s = '0' + s
  return s || undefined
}

export function parseOpeningRow(cells: unknown[], row: number): OpeningRow {
  const code = text(cells[0]) || undefined
  const name = text(cells[1]).replace(/\s+/g, ' ') || undefined
  const year = parseYear(cells[2])
  const school = text(cells[3]) || undefined
  const phone = parsePhone(cells[4])
  const points = parsePoints(cells[5])
  const out: OpeningRow = { row, cells, code, name, year: year ?? undefined, school, phone, points: points ?? 0 }
  if (!code && !name) out.error = 'name'
  else if (points === null) out.error = 'points'
  else if (year === null) out.error = 'year'
  return out
}
