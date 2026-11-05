import { describe, expect, it } from 'vitest'
import { sgCourseHTML, sgModel } from './site-builder.mjs'
import { packFromGc } from './gc-adapter.mjs'

describe('bộ tạo trang dùng chung', () => {
  it('dựng được trang sân trải nghiệm từ dữ liệu gc_*', () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({ par: [4, 4, 3, 5][i % 4], len: 300 + i * 10, si: i + 1 }))
    const pack = packFromGc({
      course: { id: 'g1', name: 'Sân thử', country: 'TH', holes: 18, units: 'm', kind: 'experience', intro_vi: 'Giới thiệu', intro_en: 'Intro' },
      tees: [{ id: 't1', name: 'Blue', gender: 'M', holes }],
      places: [
        { id: 'p1', src: 'web', cat: 'food', name: 'Quán A', km: 2.5, g_rating: 4.6, g_count: 120, g_at: '2026-10-23', pid: 'X1', family: false, data: {} },
        { id: 'p2', src: 'web', cat: 'cafe', name: 'Quán B', km: 1.2, g_rating: 4.2, g_count: 80, family: false, hidden: true, data: {} },
      ],
    })
    const m = sgModel(pack, { preview: true })
    expect(m.places).toHaveLength(1) // nơi ẩn không lên web
    expect(m.holes[0].len).toEqual(expect.arrayContaining([328])) // 300 m → 328 yd
    const html = sgCourseHTML(m, () => '', { home: '#' })
    expect(html).toContain('Quán A')
    expect(html).toContain('class="gytab"')
  })
  it('tiện ích, tên tiếng Anh, đặt sân và ảnh đại diện đi đúng vào trang', () => {
    const pack = packFromGc({
      course: { id: 'g2', name: 'Sân B', name_en: 'Course B', country: 'TH', holes: 9, units: 'yd', kind: 'experience',
        facilities: ['range', 'cart'], booking: { bookPhone: '+66 123', designer: 'Nicklaus' } },
      tees: [{ id: 't1', name: 'Blue', gender: 'M', holes: Array.from({ length: 9 }, () => ({ par: 4, len: 350 })) }],
      photos: [{ id: 'ph2', path: 'b.jpg', kind: 'other' }, { id: 'ph1', path: 'a.jpg', kind: 'sunset' }],
    })
    const m = sgModel(pack, { preview: true })
    expect(m.fac).toEqual(['range', 'cart'])
    expect(m.nameEn).toBe('Course B')
    expect(m.info.bookPhone).toBe('+66 123')
    expect(m.heroP.id).toBe('ph2')
  })

  it('Gợi ý tham khảo: mỗi tab hiện 3 địa điểm, có nút xem thêm khi nhiều hơn', () => {
    const places = Array.from({ length: 5 }, (_, i) => ({ id: 'f' + i, src: 'web', cat: 'food', name: 'Quán ' + i, km: 5 - i, family: false, data: {} }))
    places.push({ id: 'c1', src: 'web', cat: 'cafe', name: 'Cà phê 1', km: 1, family: false, data: {} })
    const pack = packFromGc({
      course: { id: 'g3', name: 'Sân C', country: 'VN', holes: 9, units: 'yd', kind: 'experience' },
      tees: [{ id: 't1', name: 'Blue', gender: 'M', holes: Array.from({ length: 9 }, () => ({ par: 4, len: 350 })) }],
      places,
    })
    const html = sgCourseHTML(sgModel(pack, { preview: true }), () => '', { home: '#' })
    expect(html.match(/class="gymore"/g)).toHaveLength(1) // chỉ tab Ăn uống (5 > 3)
    expect(html).toContain('Xem thêm 2 địa điểm')
    expect(html.indexOf('Quán 4')).toBeLessThan(html.indexOf('Quán 0')) // gần sân trước
  })

  it('Thư viện ảnh: chia tab theo nhóm, mỗi tab 6 ảnh, có nút xem thêm', () => {
    const kinds = ['clubhouse', 'clubhouse', 'restaurant', 'view', 'view', 'view', 'view', 'view', 'view', 'view', 'view', 'other', 'sunset']
    const pack = packFromGc({
      course: { id: 'g4', name: 'Sân D', country: 'VN', holes: 9, units: 'yd', kind: 'experience' },
      tees: [{ id: 't1', name: 'Blue', gender: 'M', holes: Array.from({ length: 9 }, () => ({ par: 4, len: 350 })) }],
      photos: kinds.map((k, i) => ({ id: 'p' + i, path: i + '.jpg', kind: k })),
    })
    const html = sgCourseHTML(sgModel(pack, { preview: true }), () => 'x.jpg', { home: '#' })
    expect(html).toContain('id="galp-welcome"')
    expect(html).toContain('id="galp-course"')
    expect(html).toContain('id="galp-more"')
    expect(html.match(/class="gymore"/g)).toHaveLength(1) // chỉ tab Trên sân có hơn 6 ảnh
  })
})
