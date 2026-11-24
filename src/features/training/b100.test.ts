import { describe, expect, it } from 'vitest'
import data from '../../../docs/spec/data/hcp54-b100.json'
import { blockUnits, nextChunks, programForTarget, totalMinutes, type Program } from './planner'
import { roundStats, type HoleRow } from './stats'

function program(code: 'hcp54' | 'b100', weeks: number): Program {
  const d = (data as unknown as Record<string, { w: number; d: number; s: { a: string; h: string; m: number; it: [string, string][] }[] }[]>)[code]
  return {
    weeks,
    days_per_week: 3,
    sessions: d.map((s, i) => ({
      id: String(i), week_no: s.w, day_no: s.d,
      blocks: s.s.map((b, j) => ({ id: `${i}-${j}`, sort_order: j, area: b.a as 'fir', title_vi: b.h, title_en: '', est_minutes: b.m,
        lines: b.it.map(([t, vi]) => ({ t: t as 'b', vi, en: '' })) })),
    })),
  }
}

describe('Có Handicap và Break 100', () => {
  it('chọn chương trình theo mục tiêu', () => {
    expect(programForTarget(54)).toBe('hcp54')
    expect(programForTarget(36)).toBe('b100')
    expect(programForTarget(25)).toBe('b100')
    expect(programForTarget(24.9)).toBe('b90')
    expect(programForTarget(18)).toBe('b90')
    expect(programForTarget(12)).toBe('b80')
  })
  it('đủ tuần, mỗi phần có dòng bài tập, buổi chạy hết được', () => {
    for (const [code, weeks, perSession] of [['hcp54', 8, 70], ['b100', 12, 120]] as const) {
      const p = program(code, weeks)
      expect(p.sessions.map((s) => s.week_no)).toEqual(Array.from({ length: weeks }, (_, i) => i + 1))
      for (const s of p.sessions) {
        expect(s.blocks.reduce((a, b) => a + b.est_minutes, 0)).toBe(perSession)
        for (const b of s.blocks) expect(blockUnits(b).nLines).toBeGreaterThan(0)
      }
      expect(totalMinutes(p)).toBe(weeks * 3 * perSession)
      let c = { week: 1, day: 1, block: 0, fraction: 0 }
      for (let i = 0; i < 400 && c.week <= weeks; i++) c = nextChunks(p, c, 60).cursor
      expect(c.week).toBe(weeks + 1)
    }
  })
  it('thống kê Break 100: phạt, lên green trước 1 gậy, hố điểm lớn', () => {
    const h = (par: number, strokes: number, putts: number, penalties = 0): HoleRow => ({ hole_no: 1, par, strokes, fairway: null, gir: null, putts, penalties })
    const s = roundStats([h(4, 5, 2), h(4, 7, 3, 2), h(3, 4, 2), h(5, 6, 1)])
    expect(s.penalties).toBe(2)
    expect(s.reg1).toBe(2)
    expect(s.reg1Known).toBe(4)
    expect(s.bigHoles).toBe(1)
  })
})
