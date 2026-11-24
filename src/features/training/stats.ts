/** Spec 23 · Thống kê vòng đấu theo hố, so với chuẩn theo handicap, bài test đầu vào. */

export interface HoleRow {
  hole_no: number
  par: number
  strokes: number | null
  fairway: 'hit' | 'left' | 'right' | 'na' | null
  gir: boolean | null
  putts: number | null
  penalties?: number | null
}

export interface RoundStats {
  holes: number
  strokes: number
  par: number
  firPct: number | null
  missLeft: number
  missRight: number
  girPct: number | null
  scramblePct: number | null
  putts: number
  putts18: number
  threePuttPct: number | null
  /** Tổng gậy phạt và mất bóng (chỉ tính hố có ghi). */
  penalties: number
  /** Số hố lên green trước 1 gậy so với chuẩn: số gậy trước khi putt ≤ par − 1. */
  reg1: number
  /** Số hố có ghi số putt (để biết reg1 đếm trên bao nhiêu hố). */
  reg1Known: number
  /** Số hố từ triple bogey trở lên. */
  bigHoles: number
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null)

export function roundStats(holes: HoleRow[]): RoundStats {
  const played = holes.filter((h) => h.strokes != null)
  const driving = played.filter((h) => h.par > 3 && h.fairway && h.fairway !== 'na')
  const hits = driving.filter((h) => h.fairway === 'hit').length
  const girKnown = played.filter((h) => h.gir != null)
  const girHit = girKnown.filter((h) => h.gir).length
  // Up & down: trượt green nhưng vẫn đạt par hoặc tốt hơn
  const missed = girKnown.filter((h) => !h.gir)
  const saved = missed.filter((h) => (h.strokes ?? 99) <= h.par).length
  const puttHoles = played.filter((h) => h.putts != null)
  const putts = puttHoles.reduce((a, h) => a + (h.putts ?? 0), 0)
  return {
    holes: played.length,
    strokes: played.reduce((a, h) => a + (h.strokes ?? 0), 0),
    par: played.reduce((a, h) => a + h.par, 0),
    firPct: pct(hits, driving.length),
    missLeft: driving.filter((h) => h.fairway === 'left').length,
    missRight: driving.filter((h) => h.fairway === 'right').length,
    girPct: pct(girHit, girKnown.length),
    scramblePct: pct(saved, missed.length),
    putts,
    putts18: puttHoles.length ? Math.round((putts / puttHoles.length) * 18 * 10) / 10 : 0,
    threePuttPct: pct(puttHoles.filter((h) => (h.putts ?? 0) >= 3).length, puttHoles.length),
    penalties: played.reduce((a, h) => a + (h.penalties ?? 0), 0),
    reg1: puttHoles.filter((h) => (h.strokes ?? 99) - (h.putts ?? 0) <= h.par - 1).length,
    reg1Known: puttHoles.length,
    bigHoles: played.filter((h) => (h.strokes ?? 0) >= h.par + 3).length,
  }
}

export interface Benchmark {
  stat: 'fir_pct' | 'gir_pct' | 'scramble_pct' | 'putts_per_18' | 'three_putt_pct'
  mode: 'step' | 'linear'
  hcp: number
  value: number
}

/** Giống hàm training_benchmark trên máy chủ. */
export function benchmark(rows: Benchmark[], stat: Benchmark['stat'], hcp: number): number | null {
  const r = rows.filter((x) => x.stat === stat).sort((a, b) => a.hcp - b.hcp)
  if (!r.length) return null
  if (r[0].mode === 'step') return (r.find((x) => x.hcp >= hcp) ?? r[r.length - 1]).value
  const lo = [...r].reverse().find((x) => x.hcp <= hcp)
  const hi = r.find((x) => x.hcp >= hcp)
  if (!lo) return hi!.value
  if (!hi || hi.hcp === lo.hcp) return lo.value
  return Math.round((lo.value + ((hi.value - lo.value) * (hcp - lo.hcp)) / (hi.hcp - lo.hcp)) * 10) / 10
}

export type Area = 'fir' | 'gir' | 'scr' | 'chip' | 'putt'

/** Trung bình các vòng gần nhất (đã tính sẵn). */
export function averageStats(list: RoundStats[]) {
  const avg = (f: (s: RoundStats) => number | null) => {
    const v = list.map(f).filter((x): x is number => x != null)
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
  }
  return {
    count: list.length,
    firPct: avg((s) => s.firPct),
    girPct: avg((s) => s.girPct),
    scramblePct: avg((s) => s.scramblePct),
    putts18: avg((s) => (s.holes ? s.putts18 : null)),
  }
}

/** Phần yếu nhất so với chuẩn của handicap mục tiêu (mỗi 10 điểm % hoặc 2 putt tính như nhau). */
export function weakestArea(avg: ReturnType<typeof averageStats>, rows: Benchmark[], targetHcp: number): Area | null {
  const gaps: [Area, number][] = []
  const fir = benchmark(rows, 'fir_pct', targetHcp)
  const gir = benchmark(rows, 'gir_pct', targetHcp)
  const scr = benchmark(rows, 'scramble_pct', targetHcp)
  const putts = benchmark(rows, 'putts_per_18', targetHcp)
  if (fir != null && avg.firPct != null) gaps.push(['fir', (fir - avg.firPct) / 10])
  if (gir != null && avg.girPct != null) gaps.push(['gir', (gir - avg.girPct) / 10])
  if (scr != null && avg.scramblePct != null) gaps.push(['scr', (scr - avg.scramblePct) / 10])
  if (putts != null && avg.putts18 != null) gaps.push(['putt', (avg.putts18 - putts) / 2])
  const worst = gaps.sort((a, b) => b[1] - a[1])[0]
  return worst && worst[1] > 0 ? worst[0] : null
}

export interface IntakeMap {
  putt: number[]
  chip: number[]
  long: number[]
}

/** Bài test đầu vào: số đạt trên 5 của 3 bài → handicap ước tính từng kỹ năng, trung bình và kỹ năng yếu nhất. */
export function estimateFromIntake(map: IntakeMap, putt: number, chip: number, long: number) {
  const at = (arr: number[], i: number) => arr[Math.max(0, Math.min(arr.length - 1, i))]
  const e = { putt: at(map.putt, putt), chip: at(map.chip, chip), long: at(map.long, long) }
  const hcp = Math.round((e.putt + e.chip + e.long) / 3)
  const worst = (Object.entries(e) as [keyof typeof e, number][]).sort((a, b) => b[1] - a[1])[0][0]
  const weak: Area = worst === 'long' ? 'fir' : worst
  return { ...e, hcp, weak }
}
