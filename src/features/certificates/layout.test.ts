import { describe, expect, it } from 'vitest'
import { buildCertificate, formatVerifyCode, programLine, type CertificateData } from '../../../supabase/functions/_shared/certificateLayout'

const base: CertificateData = {
  student_name: 'Tô Vĩnh Diện', class_name: '3A', school_name: 'Vinschool', program: 'SNAG Golf @ School Basic', level_label: 'Level 1',
  language: 'en', signer_name: 'Vu Anh Long', signer_title: 'Director of the R&A - VGA\nJunior Golf Development Project',
  verify_code: 'ABCDEFGHJK', verify_url: 'https://app.vncentre.net/verify/ABCDEFGHJK',
}
const texts = (d: CertificateData) => buildCertificate(d).flatMap((e) => (e.kind === 'text' ? [e.text] : []))

describe('bố cục chứng nhận', () => {
  it('in đủ nội dung theo mẫu (F9)', () => {
    const t = texts(base)
    expect(t).toEqual(expect.arrayContaining([
      'CERTIFICATE', 'OF COMPLETION', 'THIS CERTIFICATE IS AWARDED TO', 'Tô Vĩnh Diện', '3A', 'Vinschool',
      'SNAG Golf @ School Basic - Level 1', 'Vu Anh Long', 'Director of the R&A - VGA', 'Junior Golf Development Project', 'ABCDE-FGHJK',
    ]))
    // Bản tiếng Anh: không có dòng dịch tiếng Việt (chỉ tên riêng và tên trung tâm ở đầu trang)
    expect(t.some((x) => /Chứng nhận|Ghi nhận|Lớp|Trường:|CHỨNG NHẬN/.test(x))).toBe(false)
  })

  it('QR trỏ tới trang xác thực', () => {
    const qr = buildCertificate(base).find((e) => e.kind === 'qr')
    expect(qr && qr.kind === 'qr' && qr.value).toBe('https://app.vncentre.net/verify/ABCDEFGHJK')
  })

  it('bản song ngữ thêm dòng tiếng Việt', () => {
    const t = texts({ ...base, language: 'bilingual' })
    expect(t).toContain('CHỨNG NHẬN HOÀN THÀNH')
    expect(t).toContain('Ghi nhận thành tích hoàn thành SNAG Golf @ School Basic - Level 1')
  })

  it('tên có dấu được chuẩn hoá NFC', () => {
    const t = texts({ ...base, student_name: 'Tô Vĩnh Diện'.normalize('NFD') })
    expect(t).toContain('Tô Vĩnh Diện'.normalize('NFC'))
  })

  it('chứng nhận sự kiện: tên + dòng xác nhận + QR, không điểm, không Class/School (module 10 mục 5)', () => {
    const d: CertificateData = { ...base, kind: 'event', program: 'Lễ phát động', line_vi: 'Đã hoàn thành trải nghiệm môn Golf tại Lễ phát động, Hồ Hoàn Kiếm, ngày 10/10/2026', layout: { name_y: 600 } }
    const els = buildCertificate(d)
    const t = els.flatMap((e) => (e.kind === 'text' ? [e.text] : []))
    expect(t[0]).toBe('Tô Vĩnh Diện')
    expect(t.join(' ')).toContain('Đã hoàn thành trải nghiệm môn Golf')
    expect(t.some((x) => /Class|School|CERTIFICATE|điểm|score/i.test(x))).toBe(false)
    expect(els.find((e) => e.kind === 'text' && e.text === 'Tô Vĩnh Diện')).toMatchObject({ y: 600 })
    expect(els.some((e) => e.kind === 'qr')).toBe(true)
    // Chưa tải nền thì không vẽ nền
    expect(els.some((e) => e.kind === 'image')).toBe(false)
  })

  it('mã và dòng chương trình', () => {
    expect(formatVerifyCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK')
    expect(programLine({ program: 'Summer Camp 2026', level_label: null })).toBe('Summer Camp 2026')
  })
})
