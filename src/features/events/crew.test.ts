import { describe, expect, it } from 'vitest'
import { parseCrewList } from './CrewAdmin'
import { crewKitUrl, crewQrFileName } from './CrewQr'

describe('parseCrewList', () => {
  it('đọc dấu ; và tab, bỏ dòng tiêu đề và dòng trống, giữ số dòng gốc', () => {
    const rows = parseCrewList('Họ tên; Mã ô; SĐT hoặc email; Năm sinh\nNguyễn Văn A; C2; 0912345678\n\nBé B\tD1\t0987654321\t2017\n  Lê C ; e1 ; c@x.vn  ')
    expect(rows).toEqual([
      { line: 2, full_name: 'Nguyễn Văn A', department: 'C2', contact: '0912345678', birth_year: '' },
      { line: 4, full_name: 'Bé B', department: 'D1', contact: '0987654321', birth_year: '2017' },
      { line: 5, full_name: 'Lê C', department: 'e1', contact: 'c@x.vn', birth_year: '' },
    ])
  })
})

describe('crewQrFileName', () => {
  it('bỏ dấu tiếng Việt, gắn ô và mã thẻ', () => {
    expect(crewQrFileName('Đặng Thị Ngọc Ánh', 'E1', 'WZUV8VMK')).toBe('QR-E1-Dang-Thi-Ngoc-Anh-WZUV8VMK.png')
    expect(crewQrFileName('  Lê  Văn  B ', null, 'ABCD2345')).toBe('QR-Le-Van-B-ABCD2345.png')
  })
})

describe('crewKitUrl', () => {
  it('chỉ mang mã thẻ trong phần # của link', () => {
    expect(crewKitUrl('5J64CC2K')).toBe('/kit/#ma=5J64CC2K')
  })
})
