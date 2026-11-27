import { describe, expect, it } from 'vitest'
import { activeSplit, ageLimitFor, buildWeek, checkDue, dateOfWeekday, planWarnings, weekHoursLimit, type AgeLimit, type KeepDrill, type KeepSplit } from './keep'

const sp = (code: string, pct: number, skills: string[], places: KeepSplit['places'], sort: number): KeepSplit =>
  ({ id: code, code, name_vi: code, name_en: code, pct, skills, places, sort_order: sort })
const split = [
  sp('putting', 30, ['putt'], ['home', 'range', 'sim3d', 'course'], 10),
  sp('short_game', 25, ['chip', 'pitch'], ['home', 'range', 'course'], 20),
  sp('full_swing', 25, ['full_swing'], ['home', 'range', 'sim3d'], 30),
  sp('on_course', 10, ['on_course'], ['course', 'sim3d'], 40),
  sp('fitness', 10, ['fitness'], ['home', 'range', 'sim3d', 'course'], 50),
]
const dr = (code: string, skill: string, contexts: string[], lf: number | null = null): KeepDrill =>
  ({ id: code, code, title_vi: code, title_en: code, skill, contexts, minutes: 10, level_from: lf, level_to: null })
const drills = [dr('p1', 'putt', ['small_room']), dr('p2', 'putt', ['range']), dr('c1', 'chip', ['range']), dr('f1', 'fitness', ['home']), dr('fs9', 'full_swing', ['range'], 10)]

const lim = (from: number, to: number, week: number | null, session: number, rest: number, coach: number | null = null): AgeLimit =>
  ({ id: `${from}`, age_from: from, age_to: to, week_hours: week, session_max_min: session, rest_days: rest, sleep_vi: null, coach_week_max: coach, note_vi: null, sort_order: from })
const limits = [lim(0, 8, 5, 60, 2), lim(9, 10, null, 90, 2), lim(11, 14, null, 150, 1), lim(15, 17, null, 240, 1, 20)]

describe('Giữ phong độ', () => {
  it('chỉ giữ phần tập được ở nơi đã chọn, chia lại tỉ lệ', () => {
    const a = activeSplit(split, ['home'])
    expect(a.map((x) => x.s.code)).toEqual(['putting', 'short_game', 'full_swing', 'fitness'])
    expect(a.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
  })

  it('1 tiếng/ngày × 5 ngày ở nhà: đủ 300 phút, mỗi ngày 60 phút, không có lên sân', () => {
    const w = buildWeek({ days: [1, 2, 3, 4, 5], minutesPerDay: 60, places: ['home'], split, drills, level: 5 })
    expect(w.map((d) => d.dow)).toEqual([1, 2, 3, 4, 5])
    expect(w.every((d) => d.minutes === 60)).toBe(true)
    const by = (a: string) => w.flatMap((d) => d.items).filter((i) => i.area === a).reduce((s, i) => s + i.minutes, 0)
    expect(by('on_course')).toBe(0)
    expect(by('putting')).toBeGreaterThanOrEqual(by('short_game'))
    expect(by('putting') + by('short_game') + by('full_swing') + by('fitness')).toBe(300)
  })

  it('cuối tuần × 3 tiếng có sân golf: 9 hố ít nhất 90 phút vào Chủ nhật, thứ Bảy hiện trước', () => {
    const w = buildWeek({ days: [0, 6], minutesPerDay: 180, places: ['range', 'course'], split, drills, level: 12 })
    expect(w.map((d) => d.dow)).toEqual([6, 0])
    expect(w.at(1)!.items.find((i) => i.area === 'on_course')?.minutes).toBeGreaterThanOrEqual(90)
    expect(w.at(0)!.items.some((i) => i.area === 'on_course')).toBe(false)
    // Chỉ có phòng 3D: khối 9 hố 3D ngắn hơn
    const w3 = buildWeek({ days: [0, 6], minutesPerDay: 180, places: ['sim3d'], split, drills, level: 12 })
    expect(w3.at(1)!.items.find((i) => i.area === 'on_course')?.minutes).toBeLessThan(90)
    expect(w.every((d) => d.minutes === 180)).toBe(true)
  })

  it('chọn bài theo nơi tập và level', () => {
    const w = buildWeek({ days: [1], minutesPerDay: 90, places: ['range'], split, drills, level: 5 })
    const fs = w.at(0)!.items.find((i) => i.area === 'full_swing')
    expect(fs?.drill).toBeNull() // bài fs9 chỉ từ level 10
    const w2 = buildWeek({ days: [1], minutesPerDay: 90, places: ['range'], split, drills, level: 10 })
    expect(w2.at(0)!.items.find((i) => i.area === 'full_swing')?.drill?.code).toBe('fs9')
  })

  it('quá sức giảm một nửa; tuần thi chỉ putting 15 phút', () => {
    const half = buildWeek({ days: [1, 3], minutesPerDay: 60, places: ['home'], split, drills, level: 5, factor: 0.5 })
    expect(half.every((d) => d.minutes === 30)).toBe(true)
    const light = buildWeek({ days: [1, 3], minutesPerDay: 60, places: ['range'], split, drills, level: 5, light: true })
    expect(light.every((d) => d.minutes === 15 && d.items.length === 1 && d.items.at(0)!.area === 'putting')).toBe(true)
  })

  it('giới hạn theo tuổi là gợi ý: cảnh báo, HLV duyệt mức cao hơn', () => {
    const l12 = ageLimitFor(limits, 12)
    expect(weekHoursLimit(l12, 12, null)).toBe(12)
    expect(planWarnings([1, 2, 3, 4, 5], 60, l12, 12, null)).toEqual([])
    expect(planWarnings([0, 1, 2, 3, 4, 5, 6], 180, l12, 12, null).map((w) => w.kind)).toEqual(['week', 'session', 'rest'])
    const l16 = ageLimitFor(limits, 16)
    expect(planWarnings([1, 2, 3, 4, 5], 240, l16, 16, 20)).toEqual([])
    expect(weekHoursLimit(ageLimitFor(limits, 7), 7, null)).toBe(5)
  })

  it('đến hạn kiểm tra sau 28 ngày; ngày trong tuần', () => {
    expect(checkDue(null, '2026-11-27')).toBe(true)
    expect(checkDue('2026-11-01', '2026-11-27')).toBe(false)
    expect(checkDue('2026-10-30', '2026-11-27')).toBe(true)
    expect(dateOfWeekday('2026-11-27', 1)).toBe('2026-11-23') // thứ Sáu → thứ Hai cùng tuần
    expect(dateOfWeekday('2026-11-27', 0)).toBe('2026-11-29') // Chủ nhật cuối tuần
  })
})
