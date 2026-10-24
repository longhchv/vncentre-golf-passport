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
})
