import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, checkCode, formatCode, isStudentCode, normalizeCode } from './codes'

describe('bảng chữ mã', () => {
  it('có 32 ký tự, không có 0, 1, I, O', () => {
    expect(CODE_ALPHABET).toHaveLength(32)
    for (const c of ['0', '1', 'I', 'O']) expect(CODE_ALPHABET).not.toContain(c)
    expect(new Set(CODE_ALPHABET).size).toBe(32)
  })
})

describe('chuẩn hoá mã', () => {
  it('in hoa, bỏ gạch và khoảng trắng', () => {
    expect(normalizeCode(' ab2c-d3ef ')).toBe('AB2CD3EF')
    expect(normalizeCode('ab2c d3ef')).toBe('AB2CD3EF')
    expect(normalizeCode('AB2C–D3EF')).toBe('AB2CD3EF')
  })

  it('nhận mã sổ hợp lệ gõ thường, có gạch', () => {
    expect(checkCode('abcd-ef23', 'passport')).toEqual({ ok: true, code: 'ABCDEF23' })
  })

  it('báo ký tự không hợp lệ khi có 0, 1, I, O', () => {
    for (const bad of ['ABCD-EF20', 'ABCD-EF21', 'ABCD-EFI2', 'ABCD-EFO2']) {
      expect(checkCode(bad, 'passport')).toMatchObject({ ok: false, reason: 'invalid_chars' })
    }
  })

  it('kiểm tra độ dài theo loại mã', () => {
    expect(checkCode('ABC', 'passport')).toMatchObject({ ok: false, reason: 'wrong_length' })
    expect(checkCode('ABCDEF', 'class')).toEqual({ ok: true, code: 'ABCDEF' })
    expect(checkCode('ABCDEFGHJK', 'verify')).toEqual({ ok: true, code: 'ABCDEFGHJK' })
    expect(checkCode('  ', 'claim')).toMatchObject({ ok: false, reason: 'empty' })
  })

  it('hiển thị XXXX-XXXX', () => {
    expect(formatCode('abcdef23')).toBe('ABCD-EF23')
  })

  it('nhận mã học viên VNC-000123', () => {
    expect(isStudentCode('VNC-000123')).toBe(true)
    expect(isStudentCode('vnc000123')).toBe(true)
    expect(isStudentCode('VNC-12345')).toBe(false)
  })
})
