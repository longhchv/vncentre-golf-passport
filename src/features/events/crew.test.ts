import { describe, expect, it } from 'vitest'
import { parseCrewList } from './CrewAdmin'

describe('parseCrewList', () => {
  it('đọc dấu ; và tab, bỏ dòng tiêu đề và dòng trống, giữ số dòng gốc', () => {
    const rows = parseCrewList('Họ tên; Mã ô; SĐT hoặc email; Năm sinh\nNguyễn Văn A; C2; 0912345678\n\nBé B\tD1\t0987654321\t2017\n  Lê C ; e1 ; c@x.vn  ')
    expect(rows).toEqual([
      { line: 2, full_name: 'Nguyễn Văn A', slot_code: 'C2', contact: '0912345678', birth_year: '' },
      { line: 4, full_name: 'Bé B', slot_code: 'D1', contact: '0987654321', birth_year: '2017' },
      { line: 5, full_name: 'Lê C', slot_code: 'e1', contact: 'c@x.vn', birth_year: '' },
    ])
  })
})
