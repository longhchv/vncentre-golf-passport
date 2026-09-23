import { describe, expect, it } from 'vitest'
import { codeFromQr } from './QrScanner'
import { checkLayout, DEFAULT_DECAL_LAYOUT, passportUrl } from './exports'

describe('đọc mã từ QR sổ', () => {
  it('lấy mã từ URL /p/{mã}', () => {
    expect(codeFromQr('https://app.vncentre.net/p/ABCD2345')).toBe('ABCD2345')
    expect(codeFromQr('https://staging.example.dev/p/abcd2345?x=1')).toBe('ABCD2345')
  })
  it('QR chỉ chứa mã', () => {
    expect(codeFromQr('abcd-2345')).toBe('ABCD2345')
  })
})

describe('bố cục tờ decal', () => {
  it('mặc định 5×6 tem 35×45 mm vừa khổ A4', () => {
    expect(checkLayout(DEFAULT_DECAL_LAYOUT)).toBeNull()
  })
  it('báo lỗi khi vượt khổ giấy', () => {
    expect(checkLayout({ ...DEFAULT_DECAL_LAYOUT, rows: 7 })).toBe('too_big')
    expect(checkLayout({ ...DEFAULT_DECAL_LAYOUT, columns: 6 })).toBe('too_big')
  })
  it('URL QR theo cấu hình', () => {
    expect(passportUrl('https://app.vncentre.net', 'ABCD2345')).toBe('https://app.vncentre.net/p/ABCD2345')
  })
})
