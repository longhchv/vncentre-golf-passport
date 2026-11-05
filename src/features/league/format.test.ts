import { describe, expect, it } from 'vitest'
import { pointsLabel, rankLabel, toParLabel } from './format'

describe('định dạng thành tích SNAG League', () => {
  it('hạng đồng điểm có chữ T, hạng kế tiếp bỏ qua do máy chủ tính', () => {
    expect(rankLabel(7, true)).toBe('T7')
    expect(rankLabel(9, false)).toBe('9')
    expect(rankLabel(null, false)).toBe('—')
  })
  it('điểm so với par', () => {
    expect(toParLabel(0)).toBe('E')
    expect(toParLabel(3)).toBe('+3')
    expect(toParLabel(-1)).toBe('−1')
    expect(toParLabel(null)).toBe('—')
  })
  it('điểm theo ngôn ngữ', () => {
    expect(pointsLabel(3200, 'vi')).toBe('3.200')
    expect(pointsLabel(3200, 'en')).toBe('3,200')
  })
})
