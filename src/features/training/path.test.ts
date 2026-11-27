import { describe, expect, it } from 'vitest'
import { formatMonths, formatRange, formatVnd, goalIndex, monthlyCost, oneTimeCost, pathEstimate, stepIndexForLevel, type CostItem, type FinancePlan, type Need, type PathStep } from './path'

const item = (code: string, min: number, max = min): CostItem => ({
  id: code, code, grp: 'class', name_vi: code, name_en: code, unit_vi: 'buổi', unit_en: 'session', min_vnd: min, max_vnd: max, note_vi: null, sort_order: 0,
})
const items = [item('snag_group', 200_000), item('range', 100_000, 200_000), item('fee_snag', 150_000), item('pga_group', 500_000), item('clubs_basic', 2_500_000, 3_000_000), item('home', 0)]

const step = (code: string, phase: PathStep['phase'], from: number, to: number, months: number): PathStep => ({
  id: code, code, phase, level_from: from, level_to: to, title_vi: code, title_en: code, hcp_note_vi: null, opportunity_vi: null, focus_vi: null,
  months: { saving: months, balanced: months, fast: months }, sort_order: 0,
})
const steps = [step('s1', 'snag', 1, 3, 12), step('s2', 'snag', 4, 9, 24), step('s3', 'iron9', 10, 11, 12)]

const plan: FinancePlan = {
  id: 'p', code: 'saving', name_vi: '', name_en: '', summary_vi: null, tradeoff_vi: null, sort_order: 0,
  items: [
    { item: 'snag_group', qty: 4, per: 'month', phase: 'snag' },
    { item: 'home', qty: 12, per: 'month', phase: 'all' },
    { item: 'fee_snag', qty: 6, per: 'year', phase: 'snag' },
    { item: 'pga_group', qty: 4, per: 'month', phase: 'iron9' },
    { item: 'range', qty: 4, per: 'month', phase: 'iron9' },
    { item: 'clubs_basic', qty: 1, per: 'once', phase: 'iron9' },
  ],
}

describe('lộ trình các bạn nhỏ', () => {
  it('chọn bước theo level', () => {
    expect(stepIndexForLevel(steps, 1)).toBe(0)
    expect(stepIndexForLevel(steps, 7)).toBe(1)
    expect(stepIndexForLevel(steps, 15)).toBe(2)
  })

  it('bước mục tiêu là bước xa nhất của các nhu cầu, không lùi', () => {
    const needs: Need[] = [
      { id: '1', code: 'health', title_vi: '', title_en: '', advice_vi: null, goal_step: 's2', sort_order: 0 },
      { id: '2', code: 'compete', title_vi: '', title_en: '', advice_vi: null, goal_step: 's3', sort_order: 1 },
    ]
    expect(goalIndex(steps, needs, ['health'], 0)).toBe(1)
    expect(goalIndex(steps, needs, ['health', 'compete'], 0)).toBe(2)
    expect(goalIndex(steps, needs, ['health'], 2)).toBe(2)
    expect(goalIndex(steps, needs, [], 1)).toBe(1)
  })

  it('chi phí tháng: khoản theo năm chia 12, khoản 0 đồng không cộng', () => {
    expect(monthlyCost(plan, items, 'snag')).toEqual({ min: 800_000 + 75_000, max: 800_000 + 75_000 })
    expect(monthlyCost(plan, items, 'iron9')).toEqual({ min: 2_000_000 + 400_000, max: 2_000_000 + 800_000 })
    expect(oneTimeCost(plan, items, 'iron9')).toEqual({ min: 2_500_000, max: 3_000_000 })
    expect(oneTimeCost(plan, items, 'snag')).toEqual({ min: 0, max: 0 })
  })

  it('ước tính cả chặng, mua gậy khi bắt đầu giai đoạn gậy sắt', () => {
    const e = pathEstimate(plan, steps, items, 1, 2)
    expect(e.months).toBe(36)
    expect(e.cost.min).toBe(24 * 875_000 + 12 * 2_400_000 + 2_500_000)
    expect(e.cost.max).toBe(24 * 875_000 + 12 * 2_800_000 + 3_000_000)
    // Đang ở giữa giai đoạn gậy sắt thì coi như đã có gậy... trừ khi đó là bước đầu của giai đoạn
    expect(pathEstimate(plan, steps, items, 2, 2).cost.min).toBe(12 * 2_400_000 + 2_500_000)
  })

  it('định dạng tiền và thời gian', () => {
    expect(formatVnd(200_000, 'vi')).toBe('200 nghìn')
    expect(formatVnd(1_500_000, 'vi')).toBe('1,5 triệu')
    expect(formatVnd(0, 'vi')).toBe('miễn phí')
    expect(formatVnd(251_900_000, 'vi')).toBe('252 triệu')
    expect(formatVnd(1_500_000, 'en')).toBe('1.5M')
    expect(formatRange({ min: 700_000, max: 800_000 }, 'vi')).toBe('700 nghìn – 800 nghìn')
    expect(formatRange({ min: 875_000, max: 875_000 }, 'vi')).toBe('880 nghìn')
    expect(formatMonths(30, 'vi')).toBe('2 năm 6 tháng')
    expect(formatMonths(12, 'vi')).toBe('1 năm')
  })
})
