import { describe, expect, it } from 'vitest'
import { parseOpeningRow, parsePhone, parsePoints, parseYear } from './openingParse'

describe('parseYear', () => {
  it('đọc các dạng năm sinh', () => {
    expect(parseYear(2016)).toBe('2016')
    expect(parseYear('2016')).toBe('2016')
    expect(parseYear('13/07/2016')).toBe('2016')
    expect(parseYear('2016-07-13')).toBe('2016')
    expect(parseYear(42564)).toBe('2016') // 13/07/2016 dạng số của Excel
    expect(parseYear('')).toBeUndefined()
    expect(parseYear(null)).toBeUndefined()
    expect(parseYear('khoảng 2016')).toBeNull()
    expect(parseYear(15)).toBeNull()
  })
})

describe('parsePoints', () => {
  it('chỉ nhận số nguyên ≥ 0', () => {
    expect(parsePoints(350)).toBe(350)
    expect(parsePoints('1.200')).toBe(1200)
    expect(parsePoints('1,200')).toBe(1200)
    expect(parsePoints(0)).toBe(0)
    expect(parsePoints(-5)).toBeNull()
    expect(parsePoints(12.5)).toBeNull()
    expect(parsePoints('')).toBeNull()
    expect(parsePoints('abc')).toBeNull()
  })
})

describe('parsePhone', () => {
  it('trả lại số 0 đầu bị Excel làm mất', () => {
    expect(parsePhone(912345678)).toBe('0912345678')
    expect(parsePhone(' 0912 345 678 ')).toBe('0912 345 678')
    expect(parsePhone(null)).toBeUndefined()
  })
})

describe('parseOpeningRow', () => {
  it('báo lỗi theo thứ tự tên → điểm → năm sinh', () => {
    expect(parseOpeningRow([null, '', 2016, null, null, 10], 2).error).toBe('name')
    expect(parseOpeningRow([null, 'An', 2016, null, null, 'x'], 2).error).toBe('points')
    expect(parseOpeningRow([null, 'An', 'abc', null, null, 10], 2).error).toBe('year')
    const ok = parseOpeningRow(['HV001', '  Nguyễn   Minh An ', '2016', 'TH A', 912345678, '1.200'], 5)
    expect(ok).toMatchObject({ row: 5, code: 'HV001', name: 'Nguyễn Minh An', year: '2016', school: 'TH A', phone: '0912345678', points: 1200 })
    expect(ok.error).toBeUndefined()
  })
})
