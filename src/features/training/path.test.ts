import { describe, expect, it } from 'vitest'
import { applyPlace, formatMonths, formatRange, formatVnd, goalIndex, monthlyCost, oneTimeCost, pathMonths, stepIndexForLevel, type CostItem, type FinancePlan, type Need, type PathStep } from './path'

const item = (code: string, min: number, max = min): CostItem => ({
  id: code, code, grp: 'class', name_vi: code, name_en: code, unit_vi: 'buổi', unit_en: 'session', min_vnd: min, max_vnd: max, price_pending: false, gain_vi: null, gain_en: null, note_vi: null, sort_order: 0,
})
const items = [item('snag_group', 200_000), item('snag_school_public', 0), item('snag_school_private', 100_000, 250_000), item('range', 100_000, 200_000), item('fee_snag', 150_000), item('pga_group', 500_000), item('clubs_basic', 2_500_000, 3_000_000), item('home', 0)]

const step = (code: string, phase: PathStep['phase'], from: number, to: number, months: number): PathStep => ({
  id: code, code, phase, level_from: from, level_to: to, title_vi: code, title_en: code, benefit_vi: null, hcp_note_vi: null, opportunity_vi: null, focus_vi: null,
  months: { super_saving: months + 3, saving: months, balanced: months, fast: months }, sort_order: 0,
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

  it('thời gian đến mục tiêu theo phương án, không tính tổng tiền', () => {
    expect(pathMonths(plan, steps, 1, 2)).toBe(36)
    expect(pathMonths({ ...plan, code: 'super_saving' }, steps, 0, 2)).toBe(57)
    expect(pathMonths(plan, steps, -1, 2)).toBe(0)
  })

  it('học SNAG ở trường công thì lớp SNAG 0 đồng', () => {
    expect(monthlyCost(applyPlace(plan, 'public_school'), items, 'snag')).toEqual({ min: 75_000, max: 75_000 })
    expect(monthlyCost(applyPlace(plan, 'outside'), items, 'snag')).toEqual({ min: 875_000, max: 875_000 })
    // Trường tư: 4 buổi nhóm/tháng, 100–250 nghìn/buổi
    expect(monthlyCost(applyPlace(plan, 'private_school'), items, 'snag')).toEqual({ min: 475_000, max: 1_075_000 })
    // Phương án không có lớp nhóm (1 kèm 1) vẫn được tính lớp ở trường
    const fast: FinancePlan = { ...plan, items: [{ item: 'home', qty: 8, per: 'month', phase: 'all' }] }
    expect(monthlyCost(applyPlace(fast, 'private_school'), items, 'snag')).toEqual({ min: 400_000, max: 1_000_000 })
    // Giai đoạn gậy sắt không đổi
    expect(monthlyCost(applyPlace(plan, 'public_school'), items, 'iron9')).toEqual(monthlyCost(plan, items, 'iron9'))
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
