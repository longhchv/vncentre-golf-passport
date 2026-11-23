import { describe, expect, it } from 'vitest'
import { cardState, partsMet, type Result } from './junior'

const r = (status: Result['status']): Result => ({ id: status, challenge_id: 'c', made: [1], video_url: null, status, submitted_as: 'guardian', review_note: null, created_at: '' })

describe('thẻ thử thách', () => {
  it('đủ mọi phần mới đạt, không vượt số lần', () => {
    const parts = [{ label_vi: 'a', attempts: 5, target: 3 }, { label_vi: 'b', attempts: 10, target: 6 }]
    expect(partsMet(parts, [3, 6])).toBe(true)
    expect(partsMet(parts, [3, 5])).toBe(false)
    expect(partsMet(parts, [6, 6])).toBe(false)
    expect(partsMet(parts, [3])).toBe(false)
  })
  it('trạng thái thẻ theo các lượt', () => {
    expect(cardState([])).toBe('todo')
    expect(cardState([r('below'), r('rejected')])).toBe('tried')
    expect(cardState([r('below'), r('pending')])).toBe('pending')
    expect(cardState([r('pending'), r('approved')])).toBe('done')
    expect(cardState([r('passed')])).toBe('done')
  })
})
