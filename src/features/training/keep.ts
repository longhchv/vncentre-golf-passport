/** Spec 24 · chế độ "Giữ phong độ": sinh lịch tuần từ tỉ lệ phân bổ và kho bài tập. Không gọi máy chủ, để kiểm thử được. */

export type Place = 'home' | 'range' | 'sim3d' | 'course'
export const PLACES: Place[] = ['home', 'range', 'sim3d', 'course']
export type KeepOption = 'daily' | 'weekend' | 'custom'
/** Thứ tự hiển thị trong tuần: thứ Hai … Chủ nhật (0 = Chủ nhật) */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const OPTION_PRESET: Record<Exclude<KeepOption, 'custom'>, { days: number[]; minutes: number }> = {
  daily: { days: [1, 2, 3, 4, 5], minutes: 60 },
  weekend: { days: [0, 6], minutes: 180 },
}

/** Nơi tập → ngữ cảnh trong kho bài tập (training_drills.contexts) */
const PLACE_CONTEXTS: Record<Place, string[]> = {
  home: ['home', 'small_room', 'club_only'],
  range: ['range', 'club_only', 'small_room'],
  sim3d: ['small_room', 'range', 'club_only'],
  course: ['course'],
}

export interface KeepSplit {
  id: string
  code: string
  name_vi: string
  name_en: string
  pct: number
  skills: string[]
  places: Place[]
  sort_order: number
}

export interface KeepDrill {
  id: string
  code: string
  title_vi: string
  title_en: string
  skill: string
  contexts: string[]
  minutes: number | null
  level_from: number | null
  level_to: number | null
}

export interface AgeLimit {
  id: string
  age_from: number
  age_to: number
  week_hours: number | null
  session_max_min: number
  rest_days: number
  sleep_vi: string | null
  sleep_en?: string | null
  coach_week_max: number | null
  note_vi: string | null
  note_en?: string | null
  sort_order: number
}

export interface KeepItem {
  key: string
  area: string
  minutes: number
  drill: KeepDrill | null
}

export interface KeepDay {
  dow: number
  items: KeepItem[]
  minutes: number
}

const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5)

/** Các phần tập được với nơi tập đã chọn; tỉ lệ của phần không tập được chia lại cho các phần còn lại. */
export function activeSplit(split: KeepSplit[], places: Place[]): { s: KeepSplit; share: number }[] {
  const ok = split.filter((s) => s.pct > 0 && s.places.some((p) => places.includes(p)))
  const sum = ok.reduce((a, s) => a + s.pct, 0)
  return sum ? ok.map((s) => ({ s, share: s.pct / sum })) : []
}

export function pickDrill(drills: KeepDrill[], s: KeepSplit, places: Place[], level: number, seed: number): KeepDrill | null {
  const ctx = new Set(places.flatMap((p) => PLACE_CONTEXTS[p]))
  const list = drills
    .filter((d) => s.skills.includes(d.skill) && d.contexts.some((c) => ctx.has(c))
      && (d.level_from == null || d.level_from <= level) && (d.level_to == null || d.level_to >= level))
    .sort((a, b) => a.code.localeCompare(b.code))
  return list.length ? list.at(seed % list.length) ?? null : null
}

export interface BuildOpts {
  days: number[]
  minutesPerDay: number
  places: Place[]
  split: KeepSplit[]
  drills: KeepDrill[]
  level: number
  /** 0.5 khi phụ huynh đánh dấu quá sức trong tuần */
  factor?: number
  /** Tuần thi học kỳ: mỗi ngày tập chỉ putting 15 phút */
  light?: boolean
}

/**
 * Lịch một tuần. Phần lên sân / 3D là một khối ở ngày cuối tuần (ưu tiên Chủ nhật);
 * các phần còn lại chia theo tỉ lệ, mỗi lần một khúc 15 phút (30 phút nếu buổi từ 90 phút), phần còn thiếu nhiều nhất được xếp trước.
 */
export function buildWeek(o: BuildOpts): KeepDay[] {
  const days = WEEK_ORDER.filter((d) => o.days.includes(d))
  const putting = o.split.find((s) => s.code === 'putting')
  if (o.light) {
    return days.map((dow, i) => ({
      dow, minutes: 15,
      items: [{ key: `${dow}-putting-light`, area: 'putting', minutes: 15, drill: putting ? pickDrill(o.drills, putting, ['home'], o.level, i) : null }],
    }))
  }
  const dayMin = round5(o.minutesPerDay * (o.factor ?? 1))
  const act = activeSplit(o.split, o.places)
  if (!days.length || !dayMin || !act.length) return days.map((dow) => ({ dow, items: [], minutes: 0 }))
  const total = dayMin * days.length
  const quota = new Map(act.map(({ s, share }) => [s.code, share * total]))
  const cap = new Map(days.map((d) => [d, dayMin]))
  const raw = new Map<number, { area: string; minutes: number }[]>(days.map((d) => [d, []]))

  // Lên sân / 3D: một khối ở ngày cuối tuần (ưu tiên Chủ nhật). Có sân golf và buổi từ 2 tiếng: ít nhất 90 phút cho 9 hố.
  const course = act.find(({ s }) => s.code === 'on_course')
  if (course) {
    const day = days.includes(0) ? 0 : days.includes(6) ? 6 : days.at(-1)!
    const floor = o.places.includes('course') && dayMin >= 120 ? 90 : 30
    const m = Math.min(dayMin, Math.max(floor, round5(quota.get('on_course') ?? 0)))
    raw.get(day)!.push({ area: 'on_course', minutes: m })
    cap.set(day, dayMin - m)
    quota.set('on_course', 0)
  }
  const others = act.filter(({ s }) => s.code !== 'on_course')
  const chunk = dayMin >= 90 ? 30 : 15
  for (const d of days) {
    let left = cap.get(d)!
    while (left >= 5 && others.length) {
      const best = others.reduce((a, b) => ((quota.get(b.s.code) ?? 0) > (quota.get(a.s.code) ?? 0) ? b : a))
      const code = best.s.code
      const m = Math.min(left, chunk)
      raw.get(d)!.push({ area: code, minutes: m })
      quota.set(code, (quota.get(code) ?? 0) - m)
      left -= m
    }
  }
  return days.map((dow, di) => {
    // Gộp các khúc cùng phần trong ngày, giữ thứ tự theo tỉ lệ phân bổ
    const merged = new Map<string, number>()
    for (const r of raw.get(dow)!) merged.set(r.area, (merged.get(r.area) ?? 0) + r.minutes)
    const items = act
      .filter(({ s }) => merged.has(s.code))
      .map(({ s }, ai) => ({
        key: `${dow}-${s.code}`,
        area: s.code,
        minutes: merged.get(s.code)!,
        drill: pickDrill(o.drills, s, o.places, o.level, di * 7 + ai),
      }))
    return { dow, items, minutes: items.reduce((a, it) => a + it.minutes, 0) }
  })
}

export function ageLimitFor(limits: AgeLimit[], age: number | null): AgeLimit | null {
  if (age == null) return null
  return [...limits].sort((a, b) => a.sort_order - b.sort_order).find((l) => age >= l.age_from && age <= l.age_to) ?? null
}

/** Giờ golf gợi ý tối đa mỗi tuần: mức HLV duyệt (nếu có) > mức của nhóm tuổi > bằng số tuổi. */
export function weekHoursLimit(limit: AgeLimit | null, age: number | null, coachHours: number | null): number | null {
  if (coachHours != null) return Number(coachHours)
  if (!limit) return age
  return limit.week_hours != null ? Number(limit.week_hours) : age
}

export type Warning = { kind: 'week'; hours: number; limit: number } | { kind: 'session'; minutes: number; limit: number } | { kind: 'rest'; rest: number; need: number }

/** Cảnh báo (không chặn) khi kế hoạch vượt mức gợi ý theo tuổi. */
export function planWarnings(days: number[], minutesPerDay: number, limit: AgeLimit | null, age: number | null, coachHours: number | null): Warning[] {
  const w: Warning[] = []
  const hours = (days.length * minutesPerDay) / 60
  const lim = weekHoursLimit(limit, age, coachHours)
  if (lim != null && hours > lim) w.push({ kind: 'week', hours, limit: lim })
  if (limit && minutesPerDay > limit.session_max_min) w.push({ kind: 'session', minutes: minutesPerDay, limit: limit.session_max_min })
  if (limit && 7 - days.length < limit.rest_days) w.push({ kind: 'rest', rest: 7 - days.length, need: limit.rest_days })
  return w
}

/** Đến hạn kiểm tra: chưa kiểm tra lần nào hoặc lần gần nhất đã 28 ngày. */
export function checkDue(lastCheckedOn: string | null, today: string): boolean {
  if (!lastCheckedOn) return true
  return (Date.parse(today) - Date.parse(lastCheckedOn)) / 864e5 >= 28
}

/** Ngày (YYYY-MM-DD) của một thứ trong tuần chứa `today` (tuần bắt đầu thứ Hai). */
export function dateOfWeekday(today: string, dow: number): string {
  const t = new Date(`${today}T00:00:00Z`)
  const cur = (t.getUTCDay() + 6) % 7
  const target = (dow + 6) % 7
  t.setUTCDate(t.getUTCDate() - cur + target)
  return t.toISOString().slice(0, 10)
}
