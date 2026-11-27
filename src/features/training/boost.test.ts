import { describe, expect, it } from 'vitest'
import { addDays, allocate, boostDay, packageDays, phaseRanges, suggestPackage, type BoostPackage, type BoostPlan } from './boost'
import type { KeepSplit } from './keep'

const pk = (code: string, phases: BoostPackage['phases'], min: number, max = 25): BoostPackage =>
  ({ id: code, code, name_vi: code, name_en: code, phases, min_age: min, max_age: max, sort_order: 0 })
const pkgs = [
  pk('fun', { fun: 7 }, 0, 8),
  pk('w1', { test: 1, weak: 3, sim: 2, taper: 1 }, 9),
  pk('w2', { test: 2, weak: 5, sim: 4, taper: 3 }, 9),
  pk('m1', { test: 3, weak: 11, sim: 7, taper: 7 }, 11),
  pk('m3', { test: 7, weak: 42, sim: 21, taper: 14 }, 11),
]
const sp = (code: string, pct: number, places: KeepSplit['places']): KeepSplit => ({ id: code, code, name_vi: code, name_en: code, pct, skills: [], places, sort_order: pct })
const split = [sp('putting', 30, ['home', 'range', 'course']), sp('short_game', 25, ['home', 'range', 'course']), sp('full_swing', 25, ['home', 'range']), sp('on_course', 10, ['course']), sp('fitness', 10, ['home', 'range', 'course'])]
const plan = (o: Partial<BoostPlan> = {}): BoostPlan => ({
  package_code: 'w2', event_name: 'Giải', event_date: '2026-12-15', course_name: null, holes: 18, days: [0, 1, 2, 3, 4, 5, 6], minutes_per_day: 120,
  places: ['range', 'course'], weak_areas: ['putting', 'short_game'], hole_notes: {}, status: 'active', ...o,
})

describe('Tăng tốc trước giải', () => {
  it('gói và chặng: kết thúc ngay trước ngày thi', () => {
    expect(packageDays(pkgs.at(3)!)).toBe(28)
    const r = phaseRanges(pkgs.at(2)!, '2026-12-15')
    expect(r.map((x) => x.phase)).toEqual(['test', 'weak', 'sim', 'taper'])
    expect(r.at(0)!.from).toBe('2026-12-01')
    expect(r.at(-1)!.to).toBe('2026-12-14')
  })

  it('gợi ý gói theo tuổi và số ngày còn lại', () => {
    expect(suggestPackage(pkgs, 7, 30)?.code).toBe('fun')
    expect(suggestPackage(pkgs, 10, 30)?.code).toBe('w2') // 9–10 tuổi chỉ tới 2 tuần
    expect(suggestPackage(pkgs, 13, 30)?.code).toBe('m1')
    expect(suggestPackage(pkgs, 13, 5)?.code).toBe('w1') // không gói nào vừa → gói ngắn nhất
    expect(suggestPackage(pkgs, 13, 100)?.code).toBe('m3')
  })

  it('chia phút tròn 5, tổng đúng', () => {
    const a = allocate(95, [{ code: 'a', w: 1 }, { code: 'b', w: 1 }, { code: 'c', w: 1 }])
    expect(a.reduce((s, x) => s + x.minutes, 0)).toBe(95)
    expect(a.every((x) => x.minutes % 5 === 0)).toBe(true)
  })

  it('chặng tập phần yếu: 2 phần yếu chiếm khoảng 60%', () => {
    const d = boostDay('2026-12-05', plan(), pkgs.at(2)!, split, [], 10)
    expect(d.kind).toBe('train')
    if (d.kind !== 'train') return
    expect(d.phase).toBe('weak')
    expect(d.minutes).toBe(120)
    expect(d.items.some((i) => i.area === 'on_course')).toBe(false)
    const weak = d.items.filter((i) => i.area === 'putting' || i.area === 'short_game').reduce((s, i) => s + i.minutes, 0)
    expect(weak).toBeGreaterThanOrEqual(65)
    expect(weak).toBeLessThanOrEqual(80)
  })

  it('mô phỏng có sân golf thì một nửa là vòng tập; không có sân thì game mô phỏng', () => {
    const d = boostDay('2026-12-09', plan(), pkgs.at(2)!, split, [], 10)
    if (d.kind !== 'train') throw new Error(d.kind)
    expect(d.phase).toBe('sim')
    expect(d.items.find((i) => i.area === 'on_course')?.minutes).toBe(60)
    const h = boostDay('2026-12-09', plan({ places: ['home'] }), pkgs.at(2)!, split, [], 10)
    if (h.kind !== 'train') throw new Error(h.kind)
    expect(h.items.some((i) => i.area === 'game')).toBe(true)
  })

  it('giảm tải còn một nửa; ngày trước giải chỉ khởi động và putt 30 phút; ngày nghỉ; sau giải hồi sức', () => {
    const t = boostDay('2026-12-12', plan(), pkgs.at(2)!, split, [], 10)
    if (t.kind !== 'train') throw new Error(t.kind)
    expect(t.phase).toBe('taper')
    expect(t.minutes).toBe(60)
    const eve = boostDay(addDays('2026-12-15', -1), plan({ days: [1] }), pkgs.at(2)!, split, [], 10)
    if (eve.kind !== 'train') throw new Error(eve.kind)
    expect(eve.eve).toBe(true)
    expect(eve.minutes).toBe(30)
    expect(boostDay('2026-12-02', plan({ days: [1] }), pkgs.at(2)!, split, [], 10).kind).toBe('rest') // 2/12 là thứ Tư
    expect(boostDay('2026-12-15', plan(), pkgs.at(2)!, split, [], 10).kind).toBe('event')
    expect(boostDay('2026-12-18', plan(), pkgs.at(2)!, split, [], 10).kind).toBe('after')
    expect(boostDay('2026-11-20', plan(), pkgs.at(2)!, split, [], 10).kind).toBe('before')
  })

  it('tuần vui: tối đa 60 phút, chỉ trò chơi putting, chip, thể lực', () => {
    const f = boostDay('2026-12-10', plan({ package_code: 'fun', minutes_per_day: 90 }), pkgs.at(0)!, split, [], 2)
    if (f.kind !== 'train') throw new Error(f.kind)
    expect(f.minutes).toBe(60)
    expect(f.items.map((i) => i.area).sort()).toEqual(['fitness', 'putting', 'short_game'])
  })
})
