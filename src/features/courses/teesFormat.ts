// Đọc "bảng tee" Minh gửi (đọc từ ảnh scorecard) để dán vào màn Thông tin sân.
// Nhận 2 dạng: khối JSON {"type":"tees",...} hoặc bảng chữ (cột cách nhau bằng Tab, dấu | hoặc nhiều dấu cách).
// Định dạng: docs/spec/goi-y-quanh-san.md, mục "Bảng tee".
import type { GcHole } from '@/lib/types'
import { teePreset } from './meta'
import { normName } from './importFormat'

export interface TeeDraft {
  name: string
  color: string | null
  gender: 'M' | 'F' | 'X'
  holes: GcHole[]
}

export interface TeesParse {
  ok: boolean
  units: 'yd' | 'm' | null
  holes: number
  tees: TeeDraft[]
  errors: string[]
  warnings: string[]
}

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '' || v === '-' || v === '–') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function teeFrom(name: string, len: (number | null)[], par: (number | null)[], si: (number | null)[], color?: string | null, gender?: string | null): TeeDraft {
  const p = teePreset(name)
  const g = gender === 'F' || gender === 'M' || gender === 'X' ? gender : p?.gender ?? 'M'
  return {
    name: name.trim(),
    color: color || p?.color || null,
    gender: g,
    holes: len.map((l, i) => ({ par: par[i] ?? null, len: l, si: si[i] ?? null })),
  }
}

function fromJson(j: Record<string, unknown>): TeesParse {
  const errors: string[] = [], warnings: string[] = []
  const units = j.units === 'm' ? 'm' : j.units === 'yd' ? 'yd' : null
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(toNum) : [])
  const par = arr(j.par), si = arr(j.si)
  const list = Array.isArray(j.tees) ? (j.tees as Record<string, unknown>[]) : []
  if (!list.length) errors.push('Không thấy danh sách "tees"')
  const tees = list.map((t, i) => {
    const name = String(t?.name ?? '').trim() || `Tee ${i + 1}`
    const len = arr(t?.len)
    if (!len.length) errors.push(`Tee "${name}" chưa có chiều dài (len)`)
    const tPar = arr(t?.par), tSi = arr(t?.si)
    return teeFrom(name, len, tPar.length ? tPar : par, tSi.length ? tSi : si, (t?.color as string) ?? null, (t?.gender as string) ?? null)
  })
  const holes = Math.max(toNum(j.holes) ?? 0, ...tees.map((t) => t.holes.length), par.length)
  return finish({ ok: !errors.length, units, holes, tees, errors, warnings })
}

const SKIP_COL = /^(out|in|tot|total|tổng|tong|ra|vao|vào|hcp ?total|net)$/i
const isHoleRow = (n: string) => /^(ho|hole|holes|so ho|#)$/.test(n)
const isParRow = (n: string) => /^par$/.test(n)
const isSiRow = (n: string) => /^(si|hcp|handicap|index|stroke index|chi so|chi so kho|hdcp)$/.test(n)

function fromTable(text: string): TeesParse {
  const errors: string[] = [], warnings: string[] = []
  let units: 'yd' | 'm' | null = null
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const rows = lines.map(splitRow).filter((r) => r.length)
  // Cột tổng (Out/In/Tot) đánh dấu theo dòng tiêu đề "Hố"
  let skip = new Set<number>()
  const header = rows.find((r) => isHoleRow(normName(r[0] ?? '')))
  if (header) skip = new Set(header.slice(1).map((c, i) => (SKIP_COL.test(c.trim()) ? i : -1)).filter((i) => i >= 0))
  let par: (number | null)[] = [], si: (number | null)[] = []
  const tees: TeeDraft[] = []
  for (const r of rows) {
    const label = (r[0] ?? '').trim()
    const n = normName(label.replace(/\(.*?\)/g, ''))
    if (/^(don vi|units?)$/.test(normName(label.split(/[:=]/)[0]))) {
      const v = normName(label.split(/[:=]/)[1] ?? r[1] ?? '')
      units = /^(m|met|meter|meters|metres?)$/.test(v) ? 'm' : /^(y|yd|yds|yard|yards)$/.test(v) ? 'yd' : units
      continue
    }
    if (isHoleRow(n)) continue
    let vals = r.slice(1).filter((_, i) => !skip.has(i)).map(toNum)
    if (!header) vals = dropTotals(vals)
    if (!vals.some((v) => v !== null)) continue
    if (isParRow(n)) par = vals
    else if (isSiRow(n)) si = vals
    else {
      const genderHint = /\b(nu|ladies|lady|women|female)\b/.test(normName(label)) ? 'F' : /\b(nam|men|male)\b/.test(normName(label)) ? 'M' : null
      tees.push(teeFrom(label.replace(/\((?:nam|nữ|men|ladies|women)\)/gi, '').trim() || label, vals, [], [], null, genderHint))
    }
  }
  if (!tees.length) errors.push('Không thấy dòng chiều dài của tee nào')
  if (!par.length) warnings.push('Không thấy dòng Par')
  tees.forEach((t) => (t.holes = t.holes.map((h, i) => ({ ...h, par: par[i] ?? null, si: si[i] ?? null }))))
  const holes = Math.max(...tees.map((t) => t.holes.length), par.length, 0)
  return finish({ ok: !errors.length, units, holes, tees, errors, warnings })
}

/** Tách một dòng thành [nhãn, ô 1, ô 2, ...]. Dòng cách bằng dấu cách: các chữ đầu (trước số đầu tiên) là nhãn. */
function splitRow(line: string): string[] {
  if (line.includes('\t') || line.includes('|')) return line.split(/\t|\|/).map((c) => c.trim()).filter(Boolean)
  const tok = line.split(/\s+/).filter(Boolean)
  const isCell = (s: string) => /^-?[\d.,]+$/.test(s) || /^[-–]$/.test(s) || SKIP_COL.test(s)
  let k = 0
  while (k < tok.length && !isCell(tok[k])) k++
  if (k === 0) return tok
  return [tok.slice(0, k).join(' '), ...tok.slice(k)]
}

/** Bảng không có dòng tiêu đề: 21 số (18 hố + Out, In, Tot) hoặc 10 số (9 hố + tổng) → bỏ cột tổng. */
function dropTotals(v: (number | null)[]): (number | null)[] {
  const sum = (a: (number | null)[]) => a.reduce<number>((s, x) => s + (x ?? 0), 0)
  if (v.length === 21 && v[9] === sum(v.slice(0, 9)) && v[19] === sum(v.slice(10, 19))) return [...v.slice(0, 9), ...v.slice(10, 19)]
  if (v.length === 20 && v[9] === sum(v.slice(0, 9))) return [...v.slice(0, 9), ...v.slice(10, 19)]
  if (v.length === 19 && v[18] === sum(v.slice(0, 18))) return v.slice(0, 18)
  if (v.length === 10 && v[9] === sum(v.slice(0, 9))) return v.slice(0, 9)
  return v
}

function finish(r: TeesParse): TeesParse {
  if (!r.ok) return r
  const bad = r.tees.filter((t) => t.holes.length !== r.holes)
  if (bad.length) r.warnings.push(`Số hố không khớp ở tee: ${bad.map((t) => t.name).join(', ')}`)
  if (r.holes && ![9, 18, 27, 36].includes(r.holes)) r.warnings.push(`Đọc được ${r.holes} hố — kiểm tra lại`)
  const maxLen = Math.max(...r.tees.flatMap((t) => t.holes.map((h) => h.len ?? 0)))
  if (maxLen > 750) r.warnings.push('Có hố dài hơn 750 — kiểm tra lại số')
  r.tees.forEach((t) => t.holes.forEach((h, i) => { if (h.par !== null && (h.par < 3 || h.par > 6)) r.warnings.push(`Par hố ${i + 1} = ${h.par} — kiểm tra lại`) }))
  r.warnings = [...new Set(r.warnings)]
  return r
}

export function parseTeesBlock(text: string): TeesParse {
  const t = (text || '').replace(/```(?:json)?/gi, '').trim()
  if (!t) return { ok: false, units: null, holes: 0, tees: [], errors: ['Chưa dán gì'], warnings: [] }
  const start = t.indexOf('{')
  if (start >= 0 && t.lastIndexOf('}') > start) {
    try {
      const j = JSON.parse(t.slice(start, t.lastIndexOf('}') + 1)) as Record<string, unknown>
      if (j.type && j.type !== 'tees') return { ok: false, units: null, holes: 0, tees: [], errors: [`Đây là khối "${String(j.type)}", không phải bảng tee`], warnings: [] }
      return fromJson(j)
    } catch {
      return { ok: false, units: null, holes: 0, tees: [], errors: ['Khối JSON bị lỗi cú pháp'], warnings: [] }
    }
  }
  return fromTable(t)
}

/** Tổng chiều dài, par của một tee theo nửa sân. */
export function teeTotals(holes: GcHole[]) {
  const s = (a: GcHole[], k: 'len' | 'par') => a.reduce((x, h) => x + (Number(h[k]) || 0), 0)
  return { out: s(holes.slice(0, 9), 'len'), in: s(holes.slice(9, 18), 'len'), total: s(holes, 'len'), par: s(holes, 'par') }
}
