/** Spec 24 · chế độ "Tăng tốc trước giải": chặng theo ngày, việc từng ngày. Không gọi máy chủ, để kiểm thử được. */
import { activeSplit, pickDrill, type KeepDrill, type KeepSplit, type Place } from './keep'

export type Phase = 'test' | 'weak' | 'sim' | 'taper' | 'fun'
export const PHASE_ORDER: Phase[] = ['fun', 'test', 'weak', 'sim', 'taper']

export interface BoostPackage {
  id: string
  code: string
  name_vi: string
  name_en: string
  phases: Partial<Record<Phase, number>>
  min_age: number
  max_age: number
  sort_order: number
}

export interface BoostPlan {
  package_code: string
  event_name: string
  event_date: string
  course_name: string | null
  holes: number
  days: number[]
  minutes_per_day: number
  places: Place[]
  weak_areas: string[]
  hole_notes: Record<string, string>
  status: 'active' | 'cancelled'
}

export interface BoostItem { key: string; area: string; minutes: number; drill: KeepDrill | null }
export type BoostDay =
  | { kind: 'before' | 'after' | 'rest' | 'event'; date: string }
  | { kind: 'train'; date: string; phase: Phase; minutes: number; items: BoostItem[]; eve: boolean }

const DAY = 864e5
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
export const addDays = (d: string, n: number) => iso(ms(d) + n * DAY)
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY)
const dowOf = (d: string) => new Date(ms(d)).getUTCDay()
const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5)

export const packageDays = (p: BoostPackage) => PHASE_ORDER.reduce((a, k) => a + Number(p.phases[k] ?? 0), 0)

/** Các chặng của gói, ngày bắt đầu và kết thúc (ngày thi ngay sau ngày cuối). */
export function phaseRanges(p: BoostPackage, eventDate: string): { phase: Phase; from: string; to: string; days: number }[] {
  let cur = addDays(eventDate, -packageDays(p))
  const out: { phase: Phase; from: string; to: string; days: number }[] = []
  for (const k of PHASE_ORDER) {
    const n = Number(p.phases[k] ?? 0)
    if (!n) continue
    out.push({ phase: k, from: cur, to: addDays(cur, n - 1), days: n })
    cur = addDays(cur, n)
  }
  return out
}

/** Gói hợp tuổi, dài nhất mà vẫn vừa số ngày còn lại; không gói nào vừa thì gói ngắn nhất. */
export function suggestPackage(packages: BoostPackage[], age: number | null, daysLeft: number): BoostPackage | null {
  const ok = packages.filter((p) => age == null || (age >= p.min_age && age <= p.max_age)).sort((a, b) => packageDays(a) - packageDays(b))
  if (!ok.length) return null
  return [...ok].reverse().find((p) => packageDays(p) <= daysLeft) ?? ok.at(0)!
}

/** Chia số phút theo trọng số, mỗi phần làm tròn 5 phút, tổng đúng bằng số phút. */
export function allocate(minutes: number, weights: { code: string; w: number }[]): { code: string; minutes: number }[] {
  const ws = weights.filter((x) => x.w > 0)
  const sum = ws.reduce((a, x) => a + x.w, 0)
  if (!sum || minutes <= 0) return []
  const raw = ws.map((x) => ({ code: x.code, exact: (minutes * x.w) / sum }))
  const out = raw.map((x) => ({ code: x.code, minutes: Math.floor(x.exact / 5) * 5, rem: x.exact - Math.floor(x.exact / 5) * 5 }))
  let left = minutes - out.reduce((a, x) => a + x.minutes, 0)
  for (const x of [...out].sort((a, b) => b.rem - a.rem)) {
    if (left < 5) break
    x.minutes += 5
    left -= 5
  }
  return out.filter((x) => x.minutes > 0).map(({ code, minutes: m }) => ({ code, minutes: m }))
}

function weightsFor(phase: Phase, plan: BoostPlan, split: KeepSplit[]): { code: string; w: number }[] {
  // Lên sân chỉ có ở chặng mô phỏng (một khối đủ dài); các chặng khác bỏ phần này
  const act = activeSplit(split.filter((s) => s.code !== 'on_course'), plan.places)
  const base = act.map(({ s, share }) => ({ code: s.code, w: share }))
  const hasCourse = plan.places.includes('course') || plan.places.includes('sim3d')
  switch (phase) {
    case 'fun':
      return [{ code: 'putting', w: 40 }, { code: 'short_game', w: 40 }, { code: 'fitness', w: 20 }]
    case 'weak': {
      const weak = act.filter(({ s }) => plan.weak_areas.includes(s.code))
      const rest = act.filter(({ s }) => !plan.weak_areas.includes(s.code))
      const restSum = rest.reduce((a, x) => a + x.share, 0) || 1
      return [
        ...weak.map(({ s }) => ({ code: s.code, w: 0.6 / weak.length })),
        ...rest.map(({ s, share }) => ({ code: s.code, w: weak.length ? (0.4 * share) / restSum : share })),
      ]
    }
    case 'sim':
      return [{ code: hasCourse ? 'on_course' : 'game', w: 50 }, { code: 'putting', w: 20 }, { code: 'short_game', w: 20 }, { code: 'fitness', w: 10 }]
    default:
      return base
  }
}

/** Kế hoạch một ngày. */
export function boostDay(date: string, plan: BoostPlan, pkg: BoostPackage, split: KeepSplit[], drills: KeepDrill[], level: number): BoostDay {
  if (date === plan.event_date) return { kind: 'event', date }
  if (date > plan.event_date) return { kind: daysBetween(plan.event_date, date) <= 7 ? 'after' : 'before', date }
  const r = phaseRanges(pkg, plan.event_date).find((x) => date >= x.from && date <= x.to)
  if (!r) return { kind: 'before', date }
  const eve = addDays(date, 1) === plan.event_date
  if (!plan.days.includes(dowOf(date)) && !eve) return { kind: 'rest', date }
  let minutes = plan.minutes_per_day
  if (r.phase === 'taper') minutes = round5(minutes * 0.5)
  if (r.phase === 'fun') minutes = Math.min(minutes, 60)
  let parts: { code: string; minutes: number }[]
  if (eve) {
    minutes = 30
    parts = [{ code: 'warmup', minutes: 10 }, { code: 'putting', minutes: 20 }]
  } else if (r.phase === 'test') {
    const testMin = Math.min(30, minutes)
    const hasCourse = plan.places.includes('course') || plan.places.includes('sim3d')
    const rest = minutes - testMin
    parts = [{ code: 'test', minutes: testMin }, ...(hasCourse && rest >= 60 ? [{ code: 'on_course', minutes: rest }] : allocate(rest, weightsFor('taper', plan, split)))]
  } else {
    parts = allocate(minutes, weightsFor(r.phase, plan, split))
  }
  const items = parts.map((p, i) => {
    const s = split.find((x) => x.code === p.code)
    return { key: `b-${p.code}`, area: p.code, minutes: p.minutes, drill: s ? pickDrill(drills, s, plan.places, level, daysBetween(r.from, date) * 7 + i) : null }
  })
  return { kind: 'train', date, phase: r.phase, minutes: items.reduce((a, x) => a + x.minutes, 0), items, eve }
}
