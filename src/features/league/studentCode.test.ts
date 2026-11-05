import { describe, expect, it } from 'vitest'
import { isStudentCode, normalizeStudentCode } from './studentCode'

describe('mã VNC trên đường dẫn', () => {
  it('nhận các cách viết của mã VNC, không nhận uuid', () => {
    expect(isStudentCode('VNC-002279')).toBe(true)
    expect(isStudentCode('vnc002279')).toBe(true)
    expect(isStudentCode('VNC-2279')).toBe(true)
    expect(isStudentCode('3f2b8c1e-0d5a-4f7e-9a61-2c4b7d8e9f01')).toBe(false)
    expect(isStudentCode('CVMERAPL')).toBe(false)
  })
  it('chuẩn hoá về VNC- và 6 chữ số', () => {
    expect(normalizeStudentCode('vnc002279')).toBe('VNC-002279')
    expect(normalizeStudentCode('VNC-2279')).toBe('VNC-002279')
    expect(normalizeStudentCode('VNC-001915')).toBe('VNC-001915')
  })
})
