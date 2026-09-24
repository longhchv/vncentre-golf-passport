import { describe, expect, it } from 'vitest'
import { isVietnamese, parseIdentifier, toE164 } from './phone'

describe('số điện thoại E.164 (F1)', () => {
  it('số VN: bỏ số 0 đầu, bỏ dấu cách/chấm', () => {
    expect(toE164('84', '0912 345 678')).toBe('+84912345678')
    expect(toE164('84', '912.345.678')).toBe('+84912345678')
    expect(toE164('84', '84912345678')).toBe('+84912345678')
    expect(toE164('84', '+84912345678')).toBe('+84912345678')
  })
  it('số VN sai độ dài → null', () => {
    expect(toE164('84', '09123')).toBeNull()
    expect(toE164('84', '0912345678901')).toBeNull()
  })
  it('số nước ngoài theo mã nước đã chọn', () => {
    expect(toE164('82', '010-1234-5678')).toBe('+821012345678')
    expect(toE164('1', '(415) 555-0100')).toBe('+14155550100')
    expect(toE164('84', '+82 10 1234 5678')).toBe('+821012345678')
  })
  it('nhận ra số Việt Nam', () => {
    expect(isVietnamese('+84912345678')).toBe(true)
    expect(isVietnamese('+821012345678')).toBe(false)
  })
})

describe('ô đăng nhập "SĐT hoặc email"', () => {
  it('email', () => expect(parseIdentifier(' Ha@Example.com ')).toEqual({ email: 'ha@example.com' }))
  it('SĐT không mã nước → VN', () => expect(parseIdentifier('0912345678')).toEqual({ phone: '+84912345678' }))
  it('SĐT quốc tế', () => expect(parseIdentifier('+44 7700 900123')).toEqual({ phone: '+447700900123' }))
  it('không hợp lệ', () => {
    expect(parseIdentifier('abc')).toBeNull()
    expect(parseIdentifier('a@b')).toBeNull()
  })
})
