import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import QRCode from 'qrcode'
import { H, W, renderStaffCvPdf, type StaffCvData, type StaffCvEngagement, type Weight } from '../../../supabase/functions/_shared/staffCvPdf'

// Font thật của Edge Function (Be Vietnam Pro, hai tập chữ Latin + tiếng Việt)
const font = (n: string) => new Uint8Array(readFileSync(`supabase/assets/certificate/fonts/${n}`))
const fonts = Object.fromEntries(([['regular', 400], ['semibold', 600], ['bold', 700]] as [Weight, number][])
  .map(([w, n]) => [w, [font(`BeVietnamPro-latin-${n}.woff`), font(`BeVietnamPro-vietnamese-${n}.woff`)]])) as Record<Weight, [Uint8Array, Uint8Array]>
const lib = { PDFDocument, rgb, fontkit, QRCode }

const ev = (i: number, badge: 'verified' | 'approved' = 'verified'): StaffCvEngagement => ({
  id: `e${i}`, kind: 'event', event_name_vi: `Ngày hội golf số ${i}`, event_name_en: `Golf day ${i}`,
  position_vi: 'Hướng dẫn check-in', position_en: 'Check-in guide', started_on: '2026-10-10', hours: 8, badge,
})
const base = (over: Partial<StaffCvData> = {}): StaffCvData => ({
  lang: 'vi', cv_type: 'volunteer', verify_code: 'ABCDE23456', verify_url: 'https://app.vncentre.net/verify/ABCDE23456',
  exported_at: '2026-10-24', stage_colors: ['#F9C74F', '#F4A340', '#EE7B30', '#E0502B', '#C0262D'],
  person: { full_name: 'Nguyễn Thị Bích Ngọc', identity_code: 'VNC-000245', joined_vncentre_on: '2025-09-01', contact: null },
  tiles: [{ key: 'events', value: 2, badge: 'verified' }, { key: 'hours', value: 16, badge: 'verified' }],
  groups: ['volunteer'], engagements: [ev(1), ev(2, 'approved')], credentials: [], skills: [],
  ...over,
})

/** Chữ đã vẽ (gộp các đoạn tách theo tập font) và số ảnh đã nhúng */
async function render(data: StaffCvData, photo?: Uint8Array) {
  const drawn: string[] = []
  const t = vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text: string) { drawn.push(text) })
  const img = vi.spyOn(PDFPage.prototype, 'drawImage')
  const circles = vi.spyOn(PDFPage.prototype, 'drawCircle')
  const out = await renderStaffCvPdf(lib, data, { fonts, photo })
  const r = { ...out, text: drawn.join(''), images: img.mock.calls.length, circles: circles.mock.calls.map((c) => c[0]) }
  t.mockRestore(); img.mockRestore(); circles.mockRestore()
  return r
}

afterEach(() => vi.restoreAllMocks())

describe('CV nhân sự PDF (mục 5)', () => {
  it('một trang A4 dọc, đủ dấu tiếng Việt, không có logo (tiêu chí 7)', async () => {
    for (const cv_type of ['coach', 'volunteer', 'organizer'] as const) {
      const r = await render(base({ cv_type }))
      const doc = await PDFDocument.load(r.bytes)
      expect(doc.getPageCount()).toBe(1)
      const { width, height } = doc.getPage(0).getSize()
      expect([Math.round(width), Math.round(height)]).toEqual([Math.round(W), Math.round(H)])
      expect(r.text).toContain('Nguyễn Thị Bích Ngọc')
      // Không có ảnh nào (logo VN Centre hay ảnh khác) khi chủ hồ sơ không có ảnh
      expect(r.images).toBe(0)
    }
  })

  it('dài hơn một trang: in các mục mới nhất, cuối ghi "và N mục khác"', async () => {
    const r = await render(base({ engagements: Array.from({ length: 30 }, (_, i) => ev(i + 1)) }))
    expect(r.omitted).toBeGreaterThan(0)
    expect(r.text).toContain(`và ${r.omitted} mục khác`)
    expect(r.text).toContain('Ngày hội golf số 1')
    expect(r.text).not.toContain('Ngày hội golf số 30')
    expect((await PDFDocument.load(r.bytes)).getPageCount()).toBe(1)
  })

  it('tắt in liên hệ thì không có SĐT, email; bật thì có (tiêu chí 8)', async () => {
    const off = await render(base())
    expect(off.text).not.toMatch(/@|\+84/)
    const on = await render(base({ person: { ...base().person, contact: { phone: '+84912345678', email: 'ngoc@example.com' } } }))
    expect(on.text).toContain('ngoc@example.com')
    expect(on.text).toContain('+84912345678')
  })

  it('S-R8: chỉ vẽ các ô có trong snapshot (ô thiếu nguồn đã bị loại)', async () => {
    const r = await render(base({ tiles: [{ key: 'hours', value: 8, badge: 'verified' }] }))
    expect(r.text).toContain('Giờ đóng góp')
    expect(r.text).not.toContain('Sự kiện đã tham gia')
    expect(r.text).not.toContain('Chứng nhận tham gia')
  })

  it('hai loại dấu khác hình: Đã xác thực là chấm đặc, Đã duyệt là vòng viền (tiêu chí 12)', async () => {
    const r = await render(base())
    const filled = r.circles.filter((c) => c?.color && !c.borderColor)
    const ring = r.circles.filter((c) => c?.borderColor && !c.color)
    expect(filled.length).toBeGreaterThan(0)
    expect(ring.length).toBeGreaterThan(0)
  })

  it('bản tiếng Anh dùng chữ EN chủ hồ sơ đã nhập', async () => {
    const r = await render(base({ lang: 'en' }))
    expect(r.text).toContain('Golf day 1')
    expect(r.text).toContain('Check-in guide')
    expect(r.text).toContain('Verification code ABCDE-23456')
    expect(r.text).not.toContain('Ngày hội golf')
  })
})
