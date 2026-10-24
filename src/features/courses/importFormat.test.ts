import { describe, expect, it } from 'vitest'
import { matchExisting, normName, parseCourseBlock, parsePlacesBlock } from './importFormat'

describe('khối thông tin sân', () => {
  it('đọc khối JSON kèm lời dẫn và ```', () => {
    const r = parseCourseBlock('Thông tin sân đây anh:\n```json\n{"type":"course","name":"Black Mountain Golf Club","country":"th","lat":12.57,"lng":99.95,"holes":18}\n```')
    expect(r.ok).toBe(true)
    expect(r.value).toMatchObject({ name: 'Black Mountain Golf Club', country: 'TH', lat: 12.57, lng: 99.95, holes: 18 })
  })
  it('báo lỗi rõ ràng', () => {
    expect(parseCourseBlock('{"country":"VNM"}').errors).toEqual(['Thiếu tên sân (name)', 'Mã quốc gia phải gồm 2 chữ cái, vd VN, TH'])
    expect(parseCourseBlock('không có gì').ok).toBe(false)
    expect(parseCourseBlock('{"type":"places","places":[]}').errors[0]).toContain('không phải thông tin sân')
  })
})

describe('danh sách địa điểm', () => {
  const text = JSON.stringify({ type: 'places', course: 'Cửa Lò', at: '2026-10-23', places: [
    { pid: 'P1', name: 'Nhà hàng Sao Biển', cat: 'food', area: 'Cửa Lò', km: 3, g_rating: 4.8, g_count: 947, note: 'Hải sản' },
    { name: 'Đảo Lan Châu', cat: 'nature', km: '4,5' },
    { name: 'Đền Cuông', cat: 'see', g_rating: '4.7' },
    { name: 'Sai nhóm', cat: 'xyz' },
    { name: 'Sao quá', cat: 'food', g_rating: 7 },
    { cat: 'food' },
    { name: 'Serena', cat: 'lodging', pass: false, why: '33 lượt' },
  ] })
  it('đọc đúng các dòng hợp lệ, chuyển nhóm cũ, lấy ngày tra cứu chung', () => {
    const r = parsePlacesBlock(text)
    expect(r.ok).toBe(true)
    expect(r.value!.places.map((p) => p.name)).toEqual(['Nhà hàng Sao Biển', 'Đảo Lan Châu', 'Đền Cuông', 'Serena'])
    expect(r.value!.places[1]).toMatchObject({ km: 4.5, g_rating: null, g_at: '2026-10-23', pass: true })
    expect(r.value!.places[2].cat).toBe('heritage')
    expect(r.value!.places[3]).toMatchObject({ pass: false, why: '33 lượt' })
  })
  it('báo từng dòng lỗi', () => {
    const r = parsePlacesBlock(text)
    expect(r.rowErrors.map((e) => e.index)).toEqual([4, 5, 6])
  })
  it('nhận cả mảng trần', () => {
    expect(parsePlacesBlock('[{"name":"A","cat":"cafe"}]').value!.places).toHaveLength(1)
  })
})

describe('so trùng với địa điểm đã có', () => {
  it('chuẩn hoá tên', () => {
    expect(normName('Nhà hàng Hải sản Kiến')).toBe('hai san kien')
    expect(normName('Cà phê Lối Xưa')).toBe('loi xua')
  })
  it('theo pid, rồi tên gần giống; không đụng nơi đoàn đã ghé', () => {
    const existing = [
      { id: 'a', pid: 'P1', name: 'Sao Biển', src: 'web' as const },
      { id: 'b', pid: null, name: 'Khu di tích Đảo Lan Châu', src: 'web' as const },
      { id: 'c', pid: null, name: 'Tía Tô Glamping', src: 'visited' as const },
    ]
    const rows = parsePlacesBlock(JSON.stringify({ places: [
      { pid: 'P1', name: 'Nhà hàng Sao Biển', cat: 'food' },
      { name: 'Đảo Lan Châu', cat: 'nature' },
      { name: 'Tía Tô Glamping', cat: 'lodging' },
      { name: 'Nơi mới', cat: 'cafe' },
    ] })).value!.places
    expect(matchExisting(rows, existing).map((m) => [m.kind, m.existingId])).toEqual([['update', 'a'], ['update', 'b'], ['visited', 'c'], ['new', null]])
  })
})
