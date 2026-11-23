import { describe, expect, it } from 'vitest'
import data from '../../../docs/spec/data/break-90-80-70.json'
import {
  blockUnits, calendarWeek, fixedTable, lineCoverage, minutesLeft, nextChunks, planDays, programForTarget,
  realisticMonths, sessionMinutesFor, totalMinutes, type Cursor, type Program,
} from './planner'
import { averageStats, benchmark, estimateFromIntake, roundStats, weakestArea, type Benchmark, type HoleRow } from './stats'

type Raw = Record<string, { w: number; d: number; s: { a: string; h: string; m: number; it: [string, string][] }[] }[]>

function program(code: 'b90' | 'b80' | 'b70'): Program {
  const raw = (data as unknown as Raw)[code]
  return {
    weeks: 12,
    days_per_week: 3,
    sessions: raw.map((s, si) => ({
      id: `${code}-${si}`,
      week_no: s.w,
      day_no: s.d,
      blocks: s.s.map((b, bi) => ({
        id: `${code}-${si}-${bi}`, sort_order: bi, area: b.a as 'fir', title_vi: b.h, title_en: '',
        est_minutes: Math.round(b.m), lines: b.it.map(([t, vi]) => ({ t: t as 'p', vi, en: '' })),
      })),
    })),
  }
}

const start: Cursor = { week: 1, day: 1, block: 0, fraction: 0 }

describe('chia buổi tập theo thời lượng', () => {
  it('đi hết giáo án ở mọi thời lượng mà tổng số phút đúng bằng bản gốc', () => {
    for (const code of ['b90', 'b80', 'b70'] as const) {
      const p = program(code)
      for (const mins of [10, 45, 210]) {
        let c = start
        let sum = 0
        let n = 0
        while (c.week <= p.weeks && n < 5000) {
          const r = nextChunks(p, c, mins)
          sum += r.chunks.reduce((a, x) => a + x.minutes, 0)
          c = r.cursor
          n++
        }
        expect(c.week).toBe(13)
        expect(Math.round(sum)).toBe(totalMinutes(p))
      }
    }
  })

  it('buổi 10 phút chỉ lấy một phần của phần đầu tiên, phần dòng hôm nay đúng khối', () => {
    const p = program('b90')
    const r = nextChunks(p, start, 10)
    expect(r.chunks).toHaveLength(1)
    const c = r.chunks[0]
    expect(c.whole).toBe(false)
    expect(c.unitFrom).toBe(0)
    expect(c.minutes).toBeLessThanOrEqual(12)
    expect(r.cursor.fraction).toBeCloseTo(c.unitTo / c.unitTotal)
    const covered = Array.from({ length: 30 }, (_, i) => lineCoverage(c, i)).reduce((a, b) => a + b, 0)
    expect(covered).toBe(c.unitTo - c.unitFrom)
  })

  it('con trỏ không bao giờ trỏ quá số phần của ngày', () => {
    const p = program('b70')
    let c = start
    for (let i = 0; i < 400 && c.week <= 12; i++) {
      c = nextChunks(p, c, 60).cursor
      if (c.week <= 12) {
        const s = p.sessions.find((x) => x.week_no === c.week && (x.day_no === c.day || x.day_no === 0))!
        expect(c.block).toBeLessThan(s.blocks.length)
      }
    }
  })

  it('số khối mỗi phần cố định theo thời gian và số dòng bài tập', () => {
    const b = program('b90').sessions[0].blocks[0]
    const u = blockUnits(b)
    expect(u.total % u.nLines).toBe(0)
    expect(u.total).toBeGreaterThanOrEqual(Math.ceil(b.est_minutes / 5))
  })
})

describe('giữ đúng 12 tuần', () => {
  it('6 buổi mỗi tuần: hết 12 tuần lịch thì xong 12 tuần giáo án, buổi dài nhất dưới 2 tiếng', () => {
    const p = program('b90')
    const sch = { mode: 'fixed_12_weeks' as const, days: [1, 2, 3, 4, 5, 6], sessionMinutes: 60, startDate: '2026-11-23' }
    const done = new Set<string>()
    let c = start
    let longest = 0
    for (let i = 0; i < 84; i++) {
      const date = new Date(Date.UTC(2026, 10, 23 + i)).toISOString().slice(0, 10)
      if (!sch.days.includes(new Date(date).getUTCDay()) || c.week > 12) continue
      const m = sessionMinutesFor(p, c, sch, date, (d) => d < date)
      longest = Math.max(longest, m)
      c = nextChunks(p, c, m).cursor
      done.add(date)
      if (new Date(date).getUTCDay() === 6) expect(c.week).toBe(calendarWeek(sch.startDate, date) + 1)
    }
    expect(c.week).toBe(13)
    expect(longest).toBeLessThanOrEqual(120)
  })

  it('bị chậm thì buổi dài ra nhưng không quá trần', () => {
    const p = program('b80')
    const sch = { mode: 'fixed_12_weeks' as const, days: [6], sessionMinutes: 60, startDate: '2026-11-02', maxSessionMinutes: 210 }
    expect(sessionMinutesFor(p, start, sch, '2026-11-28', () => false)).toBe(210)
  })

  it('bảng gợi ý có đủ 3–7 buổi', () => {
    const t = fixedTable(program('b90'))
    expect(t.rows.map((r) => r.n)).toEqual([3, 4, 5, 6, 7])
    expect(t.rows[3].avg).toBeLessThan(t.rows[0].avg)
  })

  it('kế hoạch tuần bỏ qua ngày nghỉ và ngày đã qua', () => {
    const p = program('b90')
    const sch = { mode: 'flexible' as const, days: [2, 4, 6], sessionMinutes: 30, startDate: '2026-11-23' }
    const days = planDays(p, start, sch, '2026-11-23', 7, '2026-11-25', new Set())
    expect(days.filter((d) => d.chunks).map((d) => d.date)).toEqual(['2026-11-26', '2026-11-28'])
  })

  it('minutesLeft từ đầu bằng tổng giáo án', () => {
    const p = program('b70')
    expect(Math.round(minutesLeft(p, start))).toBe(totalMinutes(p))
  })
})

describe('mục tiêu', () => {
  it('chọn chương trình theo handicap mục tiêu', () => {
    expect(programForTarget(20)).toBe('b90')
    expect(programForTarget(12)).toBe('b80')
    expect(programForTarget(5)).toBe('b70')
  })
  it('cảnh báo mục tiêu quá gắt', () => {
    expect(realisticMonths(30, 20, 3, 1.5)).toBe(7)
    expect(realisticMonths(30, 25, 6, 1.5)).toBeNull()
  })
})

describe('thống kê vòng đấu', () => {
  const rows: Benchmark[] = [
    { stat: 'fir_pct', mode: 'step', hcp: 0, value: 63 }, { stat: 'fir_pct', mode: 'step', hcp: 10, value: 55 },
    { stat: 'fir_pct', mode: 'step', hcp: 20, value: 51 }, { stat: 'fir_pct', mode: 'step', hcp: 54, value: 40 },
    { stat: 'putts_per_18', mode: 'linear', hcp: 10, value: 35 }, { stat: 'putts_per_18', mode: 'linear', hcp: 20, value: 40 },
  ]
  it('chuẩn giống hàm máy chủ', () => {
    expect(benchmark(rows, 'fir_pct', 12)).toBe(51)
    expect(benchmark(rows, 'putts_per_18', 15)).toBe(37.5)
  })
  it('tính up & down, FIR, putt', () => {
    const holes: HoleRow[] = [
      { hole_no: 1, par: 4, strokes: 4, fairway: 'hit', gir: false, putts: 1 },
      { hole_no: 2, par: 3, strokes: 4, fairway: 'na', gir: false, putts: 2 },
      { hole_no: 3, par: 5, strokes: 6, fairway: 'left', gir: true, putts: 3 },
    ]
    const s = roundStats(holes)
    expect(s.firPct).toBe(50)
    expect(s.scramblePct).toBe(50)
    expect(s.putts).toBe(6)
    expect(s.missLeft).toBe(1)
  })
  it('phần yếu nhất', () => {
    const avg = averageStats([{ ...roundStats([]), holes: 18, firPct: 50, putts18: 42 }])
    expect(weakestArea(avg, rows, 15)).toBe('putt')
  })
  it('bài test đầu vào', () => {
    const e = estimateFromIntake({ putt: [38, 38, 30, 25, 20, 15], chip: [38, 38, 30, 25, 20, 18], long: [38, 38, 30, 20, 16, 12] }, 3, 1, 4)
    expect(e.hcp).toBe(Math.round((25 + 38 + 16) / 3))
    expect(e.weak).toBe('chip')
  })
})
