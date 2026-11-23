/**
 * Spec 23 · Tính lịch tập từ giáo án (không gọi máy chủ).
 * Mỗi phần giáo án chia thành các khối bằng nhau (~block_minutes phút), rải đều theo các dòng bài tập.
 * Con trỏ (tuần, ngày, phần, tỉ lệ đã làm) lưu ở training_goals; máy chủ kiểm tra lại khi lưu buổi tập.
 */

export interface PlanLine {
  t: 'p' | 'o' | 'h' | 'b' | 's' | 'd'
  vi: string
  en: string
}
export interface PlanBlock {
  id: string
  sort_order: number
  area: 'fir' | 'gir' | 'scr' | 'chip' | 'putt'
  title_vi: string
  title_en: string
  est_minutes: number
  lines: PlanLine[]
}
export interface PlanSession {
  id: string
  week_no: number
  day_no: number
  blocks: PlanBlock[]
}
export interface Program {
  weeks: number
  days_per_week: number
  sessions: PlanSession[]
}
export interface Cursor {
  week: number
  day: number
  block: number
  fraction: number
}
export interface Chunk {
  week: number
  day: number
  blockIndex: number
  block: PlanBlock
  unitFrom: number
  unitTo: number
  unitTotal: number
  perLine: number
  minutes: number
  whole: boolean
}

const EXERCISE = new Set(['b', 's', 'd'])

export function exerciseLineIndexes(block: PlanBlock): number[] {
  const out: number[] = []
  block.lines.forEach((l, i) => EXERCISE.has(l.t) && out.push(i))
  return out
}

/** Số khối của một phần: mỗi dòng bài tập chia đều `perLine` khối. */
export function blockUnits(block: PlanBlock, blockMinutes = 5) {
  const nLines = Math.max(1, exerciseLineIndexes(block).length)
  const perLine = Math.max(1, Math.ceil(Math.ceil(block.est_minutes / blockMinutes) / nLines))
  return { nLines, perLine, total: nLines * perLine }
}

/** Buổi của (tuần, ngày): ưu tiên buổi riêng của ngày, không có thì buổi chung (day_no = 0). */
export function sessionFor(p: Program, week: number, day: number): PlanSession | undefined {
  return p.sessions.find((s) => s.week_no === week && s.day_no === day) ?? p.sessions.find((s) => s.week_no === week && s.day_no === 0)
}

export function isFinished(p: Program, c: Cursor) {
  return c.week > p.weeks
}

function advanceDay(p: Program, c: Cursor): Cursor {
  const day = c.day + 1
  return day > p.days_per_week ? { week: c.week + 1, day: 1, block: 0, fraction: 0 } : { week: c.week, day, block: 0, fraction: 0 }
}

/** Lấy các phần cho một buổi dài `minutes` phút, bắt đầu từ con trỏ. Trả về các phần và con trỏ sau buổi. */
export function nextChunks(p: Program, start: Cursor, minutes: number, blockMinutes = 5): { chunks: Chunk[]; cursor: Cursor } {
  let c = { ...start }
  const chunks: Chunk[] = []
  let left = minutes
  for (let guard = 0; guard < 200 && !isFinished(p, c) && left >= blockMinutes; guard++) {
    const s = sessionFor(p, c.week, c.day)
    if (!s || c.block >= s.blocks.length) {
      c = advanceDay(p, c)
      continue
    }
    const block = s.blocks[c.block]
    const { perLine, total } = blockUnits(block, blockMinutes)
    const u0 = Math.round(c.fraction * total)
    const remaining = total - u0
    let k = Math.floor((total * left) / block.est_minutes + 0.3)
    k = Math.min(Math.max(k, 1), remaining)
    const m = (block.est_minutes * k) / total
    if (chunks.length && m > left + 3) break
    chunks.push({ week: c.week, day: c.day, blockIndex: c.block, block, unitFrom: u0, unitTo: u0 + k, unitTotal: total, perLine, minutes: m, whole: u0 === 0 && k === total })
    left -= m
    if (u0 + k >= total) c = { ...c, block: c.block + 1, fraction: 0 }
    else c = { ...c, fraction: (u0 + k) / total }
  }
  // Hết phần của ngày thì dời sang ngày tiếp theo, để con trỏ luôn trỏ vào một phần có thật
  for (let guard = 0; guard < 20 && !isFinished(p, c); guard++) {
    const s = sessionFor(p, c.week, c.day)
    if (s && c.block < s.blocks.length) break
    c = advanceDay(p, c)
  }
  return { chunks, cursor: c }
}

/** Số khối của dòng bài tập thứ `lineNo` nằm trong phần làm hôm nay. */
export function lineCoverage(chunk: Chunk, lineNo: number) {
  let n = 0
  for (let u = chunk.unitFrom; u < chunk.unitTo; u++) if (Math.floor(u / chunk.perLine) === lineNo) n++
  return n
}

export function dayMinutes(p: Program, week: number, day: number) {
  return sessionFor(p, week, day)?.blocks.reduce((a, b) => a + b.est_minutes, 0) ?? 0
}

export function totalMinutes(p: Program) {
  let t = 0
  for (let w = 1; w <= p.weeks; w++) for (let d = 1; d <= p.days_per_week; d++) t += dayMinutes(p, w, d)
  return t
}

export function weekMinutes(p: Program, week: number) {
  let t = 0
  for (let d = 1; d <= p.days_per_week; d++) t += dayMinutes(p, week, d)
  return t
}

/** Số phút còn lại từ con trỏ đến hết tuần `untilWeek` của giáo án. */
export function minutesLeft(p: Program, c: Cursor, untilWeek = p.weeks) {
  let t = 0
  for (let w = c.week; w <= Math.min(untilWeek, p.weeks); w++) {
    for (let d = w === c.week ? c.day : 1; d <= p.days_per_week; d++) {
      const s = sessionFor(p, w, d)
      s?.blocks.forEach((b, i) => {
        if (w === c.week && d === c.day) {
          if (i > c.block) t += b.est_minutes
          else if (i === c.block) t += b.est_minutes * (1 - c.fraction)
        } else t += b.est_minutes
      })
    }
  }
  return t
}

// ---------- Ngày tháng (theo giờ Việt Nam, dạng YYYY-MM-DD) ----------

export function vnToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now)
}
export function parseDay(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
export function fmtDay(d: Date) {
  return d.toISOString().slice(0, 10)
}
export function addDays(s: string, n: number) {
  const d = parseDay(s)
  d.setUTCDate(d.getUTCDate() + n)
  return fmtDay(d)
}
export function dow(s: string) {
  return parseDay(s).getUTCDay()
}
export function mondayOf(s: string) {
  return addDays(s, -((dow(s) + 6) % 7))
}
/** Tuần lịch thứ mấy kể từ tuần của ngày bắt đầu (1 = tuần đầu). */
export function calendarWeek(startDate: string, day: string) {
  return Math.floor((parseDay(mondayOf(day)).getTime() - parseDay(mondayOf(startDate)).getTime()) / (7 * 864e5)) + 1
}

export interface Schedule {
  mode: 'fixed_12_weeks' | 'flexible'
  days: number[]
  sessionMinutes: number
  startDate: string
  maxSessionMinutes?: number
  blockMinutes?: number
}

/**
 * Thời lượng buổi tập của ngày `day`.
 * - flexible: đúng số phút người tập chọn.
 * - fixed_12_weeks: chia phần còn lại của tuần giáo án tương ứng cho các buổi còn lại trong tuần lịch (bù dần nếu chậm, tối đa maxSessionMinutes).
 */
export function sessionMinutesFor(p: Program, c: Cursor, sch: Schedule, day: string, isDone: (d: string) => boolean) {
  if (sch.mode === 'flexible') return sch.sessionMinutes
  const cw = calendarWeek(sch.startDate, day)
  const load = minutesLeft(p, c, Math.min(cw, c.week + 1))
  if (load <= 0) return sch.sessionMinutes
  const end = addDays(mondayOf(day), 6)
  let n = 0
  for (let d = day; d <= end; d = addDays(d, 1)) if (sch.days.includes(dow(d)) && !isDone(d)) n++
  const bm = sch.blockMinutes ?? 5
  return Math.min(sch.maxSessionMinutes ?? 210, Math.max(10, Math.ceil(load / Math.max(1, n) / bm) * bm))
}

export interface PlannedDay {
  date: string
  scheduled: boolean
  done: boolean
  minutes: number
  chunks: Chunk[] | null
}

/** Kế hoạch `n` ngày từ `from` (bỏ qua ngày đã qua và ngày đã tập). */
export function planDays(p: Program, c: Cursor, sch: Schedule, from: string, n: number, today: string, done: Set<string>): PlannedDay[] {
  let cur = { ...c }
  const out: PlannedDay[] = []
  for (let i = 0; i < n; i++) {
    const date = addDays(from, i)
    const scheduled = sch.days.includes(dow(date))
    const isDone = done.has(date)
    if (scheduled && !isDone && date >= today && !isFinished(p, cur)) {
      const minutes = sessionMinutesFor(p, cur, sch, date, (d) => d < date || done.has(d))
      const r = nextChunks(p, cur, minutes, sch.blockMinutes)
      out.push({ date, scheduled, done: false, minutes: r.chunks.reduce((a, x) => a + x.minutes, 0), chunks: r.chunks })
      cur = r.cursor
    } else out.push({ date, scheduled, done: isDone, minutes: 0, chunks: null })
  }
  return out
}

/** Bảng gợi ý thời lượng buổi khi giữ đúng 12 tuần, theo số buổi mỗi tuần. */
export function fixedTable(p: Program, blockMinutes = 5) {
  const loads = Array.from({ length: p.weeks }, (_, i) => weekMinutes(p, i + 1))
  const max = Math.max(...loads)
  const min = Math.min(...loads)
  const total = totalMinutes(p)
  const round = (x: number) => Math.ceil(x / blockMinutes) * blockMinutes
  return { min, max, rows: [3, 4, 5, 6, 7].map((n) => ({ n, avg: round(total / p.weeks / n), max: round(max / n) })) }
}

export function weeksNeeded(p: Program, days: number, minutes: number) {
  return Math.ceil(totalMinutes(p) / Math.max(1, days * minutes))
}

/** Chương trình theo handicap mục tiêu (khớp target_hcp_min/max của training_programs). */
export function programForTarget(target: number): 'b90' | 'b80' | 'b70' {
  if (target >= 18) return 'b90'
  if (target >= 8) return 'b80'
  return 'b70'
}

/** Cần bao nhiêu tháng nếu hạ tối đa `maxDrop` điểm mỗi tháng; null = mục tiêu khả thi. */
export function realisticMonths(now: number | null, target: number, months: number, maxDrop: number) {
  if (now == null || now <= target) return null
  return (now - target) / months <= maxDrop ? null : Math.ceil((now - target) / maxDrop)
}
