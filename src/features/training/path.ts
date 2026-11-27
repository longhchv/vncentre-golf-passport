/** Spec 24 · đợt 2b: tính lộ trình và chi phí ước tính cho các bạn nhỏ. Không gọi máy chủ, để kiểm thử được. */

export type Phase = 'snag' | 'iron9' | 'iron18'
export type PlanCode = 'saving' | 'balanced' | 'fast'
export const PLAN_CODES: PlanCode[] = ['saving', 'balanced', 'fast']

export interface CostItem {
  id: string
  code: string
  grp: 'class' | 'practice' | 'tournament' | 'equipment' | 'home'
  name_vi: string
  name_en: string
  unit_vi: string
  unit_en: string
  min_vnd: number
  max_vnd: number
  note_vi: string | null
  sort_order: number
}

export interface PathStep {
  id: string
  code: string
  phase: Phase
  level_from: number
  level_to: number
  title_vi: string
  title_en: string
  hcp_note_vi: string | null
  opportunity_vi: string | null
  focus_vi: string | null
  months: Partial<Record<PlanCode, number>>
  sort_order: number
}

export interface PlanItem {
  item: string
  qty: number
  per: 'month' | 'year' | 'once'
  phase: Phase | 'all'
}

export interface FinancePlan {
  id: string
  code: PlanCode
  name_vi: string
  name_en: string
  summary_vi: string | null
  tradeoff_vi: string | null
  items: PlanItem[]
  sort_order: number
}

export interface Need {
  id: string
  code: string
  title_vi: string
  title_en: string
  advice_vi: string | null
  goal_step: string | null
  sort_order: number
}

export interface Money {
  min: number
  max: number
}

const ZERO: Money = { min: 0, max: 0 }
const add = (a: Money, b: Money): Money => ({ min: a.min + b.min, max: a.max + b.max })
const times = (a: Money, k: number): Money => ({ min: a.min * k, max: a.max * k })

/** Bước của một level; level ngoài mọi bước thì lấy bước gần nhất. */
export function stepIndexForLevel(steps: PathStep[], level: number): number {
  if (!steps.length) return -1
  const i = steps.findIndex((s) => level >= s.level_from && level <= s.level_to)
  if (i >= 0) return i
  return level < steps[0].level_from ? 0 : steps.length - 1
}

/** Bước nên hướng tới: bước xa nhất trong các nhu cầu đã chọn, không thấp hơn bước hiện tại. */
export function goalIndex(steps: PathStep[], needs: Need[], chosen: string[], current: number): number {
  let goal = current
  for (const n of needs) {
    if (!chosen.includes(n.code) || !n.goal_step) continue
    const i = steps.findIndex((s) => s.code === n.goal_step)
    if (i > goal) goal = i
  }
  return goal
}

function price(items: CostItem[], code: string): Money {
  const c = items.find((x) => x.code === code)
  return c ? { min: Number(c.min_vnd), max: Number(c.max_vnd) } : ZERO
}

const inPhase = (it: PlanItem, phase: Phase) => it.phase === 'all' || it.phase === phase

/** Chi phí mỗi tháng của phương án trong một giai đoạn (khoản theo năm chia 12). */
export function monthlyCost(plan: FinancePlan, items: CostItem[], phase: Phase): Money {
  return plan.items
    .filter((it) => it.per !== 'once' && inPhase(it, phase))
    .reduce((acc, it) => add(acc, times(price(items, it.item), it.per === 'year' ? it.qty / 12 : it.qty)), ZERO)
}

/** Khoản mua một lần khi bắt đầu giai đoạn (bộ gậy...). */
export function oneTimeCost(plan: FinancePlan, items: CostItem[], phase: Phase): Money {
  return plan.items
    .filter((it) => it.per === 'once' && it.phase === phase)
    .reduce((acc, it) => add(acc, times(price(items, it.item), it.qty)), ZERO)
}

/** Các khoản của phương án trong một giai đoạn, để hiện chi tiết. */
export function planLines(plan: FinancePlan, items: CostItem[], phase: Phase) {
  return plan.items
    .filter((it) => (it.per === 'once' ? it.phase === phase : inPhase(it, phase)))
    .map((it) => {
      const c = items.find((x) => x.code === it.item)
      return { ...it, cost: c, total: times(price(items, it.item), it.qty) }
    })
    .filter((l) => l.cost)
}

/**
 * Ước tính từ bước hiện tại (tính cả bước này) đến hết bước mục tiêu: số tháng và tổng chi phí.
 * Khoản mua một lần tính khi bước đầu một giai đoạn nằm trong khoảng; riêng giai đoạn đang học
 * chỉ tính nếu bước hiện tại là bước đầu của giai đoạn đó (nếu đã qua thì coi như đã có).
 */
export function pathEstimate(plan: FinancePlan, steps: PathStep[], items: CostItem[], from: number, to: number): { months: number; cost: Money } {
  let months = 0
  let cost = ZERO
  if (from < 0) return { months, cost }
  for (let i = from; i <= to && i < steps.length; i++) {
    const s = steps[i]
    const m = Number(s.months?.[plan.code] ?? 0)
    months += m
    cost = add(cost, times(monthlyCost(plan, items, s.phase), m))
    const firstOfPhase = i === 0 || steps[i - 1].phase !== s.phase
    if (firstOfPhase) cost = add(cost, oneTimeCost(plan, items, s.phase))
  }
  return { months, cost }
}

/** "200 nghìn", "1,5 triệu" / "200k", "1.5M". */
export function formatVnd(n: number, lang: string): string {
  const en = lang === 'en'
  if (n === 0) return en ? 'free' : 'miễn phí'
  if (n < 1_000_000) {
    const k = Math.round(n / 1000)
    return en ? `${k}k` : `${k} nghìn`
  }
  const m = n >= 100_000_000 ? Math.round(n / 1_000_000) : Math.round(n / 100_000) / 10
  const s = en ? String(m) : String(m).replace('.', ',')
  return en ? `${s}M` : `${s} triệu`
}

export function formatRange(v: Money, lang: string): string {
  const a = Math.round(v.min / 10_000) * 10_000
  const b = Math.round(v.max / 10_000) * 10_000
  return a === b ? formatVnd(a, lang) : `${formatVnd(a, lang)} – ${formatVnd(b, lang)}`
}

/** "2 năm 6 tháng" / "2 yr 6 mo" */
export function formatMonths(m: number, lang: string): string {
  const y = Math.floor(m / 12)
  const r = Math.round(m % 12)
  if (lang === 'en') return [y ? `${y} yr` : '', r ? `${r} mo` : ''].filter(Boolean).join(' ') || '0 mo'
  return [y ? `${y} năm` : '', r ? `${r} tháng` : ''].filter(Boolean).join(' ') || '0 tháng'
}
