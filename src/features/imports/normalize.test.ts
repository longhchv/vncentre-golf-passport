import { describe, expect, it } from 'vitest'
import {
  excelSerialToIso,
  markInFileDuplicates,
  normalizeEmail,
  normalizeForMatch,
  normalizePhone,
  normalizeStudentRow,
  parseDob,
  titleCaseName,
  type RawStudentRow,
} from './normalize'

const schools = [
  { id: 'tvd', name: 'Trường Tiểu học Tô Vĩnh Diện', short_name: 'TH Tô Vĩnh Diện' },
  { id: 'unis', name: 'UNIS Hanoi (Community UNIS)', short_name: 'UNIS' },
]
const ctx = { selectedSchoolId: 'tvd', schools, today: new Date('2026-09-24T00:00:00Z') }
const row = (over: Partial<RawStudentRow> = {}): RawStudentRow => ({
  full_name: 'Nguyễn Minh An',
  date_of_birth: '13/07/2019',
  school: '',
  grade_class: '2A3',
  contact_name: 'Trần Thu Hà',
  contact_phone: '0912345678',
  contact_email: 'ha.tran@gmail.com',
  ...over,
})

describe('họ tên', () => {
  it('viết hoa chữ cái đầu, bỏ khoảng trắng thừa (phụ lục A1)', () => {
    expect(titleCaseName('NGÔ   TÚ ANH')).toBe('Ngô Tú Anh')
    expect(titleCaseName('  nguyễn   đức  phúc ')).toBe('Nguyễn Đức Phúc')
    expect(titleCaseName('kim ji-woo')).toBe('Kim Ji-Woo')
  })
  it('tên chuẩn hoá để so trùng giống CSDL', () => {
    expect(normalizeForMatch('  Đặng   Quốc BẢO ')).toBe('dang quoc bao')
  })
})

describe('ngày sinh', () => {
  it('nhận dd/mm/yyyy, d/m/yyyy, yyyy-mm-dd', () => {
    expect(parseDob('13/07/2019')).toBe('2019-07-13')
    expect(parseDob('3/7/2019')).toBe('2019-07-03')
    expect(parseDob('03-07-2019')).toBe('2019-07-03')
    expect(parseDob('2019-07-13')).toBe('2019-07-13')
  })
  it('nhận ô kiểu ngày của Excel (số seri)', () => {
    expect(excelSerialToIso(43659)).toBe('2019-07-13')
    expect(parseDob(43659)).toBe('2019-07-13')
  })
  it('báo sai với ngày không tồn tại hoặc chữ lạ', () => {
    expect(parseDob('31/02/2019')).toBeNull()
    expect(parseDob('13/13/2019')).toBeNull()
    expect(parseDob('tháng 7')).toBeNull()
  })
  it('ô trống → undefined', () => {
    expect(parseDob('')).toBeUndefined()
    expect(parseDob(null)).toBeUndefined()
  })
})

describe('số điện thoại', () => {
  it('0xxx → +84xxx, bỏ dấu cách, dấu chấm', () => {
    expect(normalizePhone('0912 345 678')).toBe('+84912345678')
    expect(normalizePhone('0912.345.678')).toBe('+84912345678')
    expect(normalizePhone('84912345678')).toBe('+84912345678')
    expect(normalizePhone('+84 912 345 678')).toBe('+84912345678')
  })
  it('Excel làm mất số 0 đầu → vẫn nhận', () => {
    expect(normalizePhone(912345678)).toBe('+84912345678')
  })
  it('số quốc tế có +', () => {
    expect(normalizePhone('+82 10 1234 5678')).toBe('+821012345678')
    expect(normalizePhone('0082 10 1234 5678')).toBe('+821012345678')
  })
  it('sai độ dài → null', () => {
    expect(normalizePhone('09123')).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
  })
})

describe('email', () => {
  it('kiểm tra định dạng, chuyển chữ thường', () => {
    expect(normalizeEmail(' Ha.Tran@Gmail.com ')).toBe('ha.tran@gmail.com')
    expect(normalizeEmail('ha.tran@gmail')).toBeNull()
    expect(normalizeEmail('')).toBeUndefined()
  })
})

describe('trạng thái dòng (F10 bước 4)', () => {
  it('đủ thông tin → ok', () => {
    const r = normalizeStudentRow(row(), ctx)
    expect(r.status).toBe('ok')
    expect(r.normalized).toMatchObject({
      full_name: 'Nguyễn Minh An',
      date_of_birth: '2019-07-13',
      school_id: 'tvd',
      contact_phone: '+84912345678',
    })
  })
  it('thiếu họ tên → error', () => {
    expect(normalizeStudentRow(row({ full_name: '  ' }), ctx).status).toBe('error')
  })
  it('ngày sinh sai định dạng → error', () => {
    const r = normalizeStudentRow(row({ date_of_birth: '31/02/2019' }), ctx)
    expect(r.status).toBe('error')
    expect(r.messages[0].code).toBe('invalid_dob')
  })
  it('thiếu ngày sinh hoặc SĐT → warning, vẫn nhập', () => {
    expect(normalizeStudentRow(row({ date_of_birth: '' }), ctx).status).toBe('warning')
    const r = normalizeStudentRow(row({ contact_phone: '' }), ctx)
    expect(r.status).toBe('warning')
    expect(r.messages.map((m) => m.code)).toContain('missing_phone')
  })
  it('SĐT sai → warning và bỏ SĐT', () => {
    const r = normalizeStudentRow(row({ contact_phone: '123' }), ctx)
    expect(r.status).toBe('warning')
    expect(r.normalized.contact_phone).toBeNull()
  })
  it('cột Trường khớp tên ngắn → dùng trường đó; không khớp → trường đã chọn + cảnh báo', () => {
    expect(normalizeStudentRow(row({ school: 'unis' }), ctx).normalized.school_id).toBe('unis')
    const r = normalizeStudentRow(row({ school: 'Trường Lạ' }), ctx)
    expect(r.normalized.school_id).toBe('tvd')
    expect(r.messages.map((m) => m.code)).toContain('unknown_school')
  })
  it('trùng trong file → cảnh báo ở dòng sau', () => {
    const rows = [normalizeStudentRow(row(), ctx), normalizeStudentRow(row({ full_name: 'NGUYỄN MINH AN' }), ctx)]
    markInFileDuplicates(rows)
    expect(rows[0].status).toBe('ok')
    expect(rows[1].status).toBe('warning')
    expect(rows[1].messages.at(-1)).toEqual({ code: 'duplicate_in_file', params: { row: 2 } })
  })
})
