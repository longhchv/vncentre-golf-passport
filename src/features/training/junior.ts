/** Spec 24 · Thẻ thử thách: kiểu dữ liệu và luật đạt thẻ (không gọi máy chủ). */

export interface Part {
  label_vi: string
  label_en?: string
  attempts: number
  target: number
  provisional?: boolean
}
export interface Challenge {
  id: string
  level_number: number
  code: string
  kind: 'level_up' | 'practice'
  area: string
  title_vi: string
  title_en: string
  how_vi: string | null
  parts: Part[]
  verify: 'self' | 'video_or_adult' | 'coach'
  points_rank: number
  points_reward: number
  is_provisional: boolean
  sort_order: number
}
export interface Result {
  id: string
  challenge_id: string
  made: number[]
  video_url: string | null
  status: 'passed' | 'below' | 'pending' | 'approved' | 'rejected'
  submitted_as: 'guardian' | 'student' | 'coach'
  review_note: string | null
  created_at: string
}
export type CardState = 'done' | 'pending' | 'tried' | 'todo'

export function cardState(results: Result[]): CardState {
  if (results.some((r) => r.status === 'passed' || r.status === 'approved')) return 'done'
  if (results.some((r) => r.status === 'pending')) return 'pending'
  return results.length ? 'tried' : 'todo'
}

/** Khớp training_parts_met trên máy chủ. */
export function partsMet(parts: Part[], made: number[]) {
  return made.length === parts.length && parts.every((p, i) => made[i] >= p.target && made[i] <= p.attempts)
}
