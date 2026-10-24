import { describe, expect, it } from 'vitest'
import { parseTeesBlock, teeTotals } from './teesFormat'
import { teePreset, uniqueSlug, similarCourse } from './meta'

const P = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5]
const L = [380, 410, 175, 520, 395, 360, 190, 405, 540, 400, 165, 385, 530, 370, 415, 180, 390, 555]
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

describe('đọc bảng tee', () => {
  it('khối JSON', () => {
    const r = parseTeesBlock(JSON.stringify({ type: 'tees', units: 'm', par: P, si: P.map((_, i) => i + 1), tees: [{ name: 'Black', len: L }, { name: 'Red', len: L.map((x) => x - 60), gender: 'F' }] }))
    expect(r.ok).toBe(true)
    expect(r.units).toBe('m')
    expect(r.holes).toBe(18)
    expect(r.tees[0]).toMatchObject({ name: 'Black', color: '#111111', gender: 'M' })
    expect(r.tees[1].gender).toBe('F')
    expect(r.tees[0].holes[3]).toEqual({ par: 5, len: 520, si: 4 })
  })

  it('bảng chữ có cột Out/In/Tot và dòng tiêu đề', () => {
    const row = (name: string, a: number[]) => [name, ...a.slice(0, 9), sum(a.slice(0, 9)), ...a.slice(9), sum(a.slice(9)), sum(a)].join('\t')
    const head = ['Hố', 1, 2, 3, 4, 5, 6, 7, 8, 9, 'Out', 10, 11, 12, 13, 14, 15, 16, 17, 18, 'In', 'Tot'].join('\t')
    const r = parseTeesBlock(['Đơn vị: yd', head, row('Par', P), row('Đen', L), row('Đỏ (Nữ)', L.map((x) => x - 80))].join('\n'))
    expect(r.ok).toBe(true)
    expect(r.units).toBe('yd')
    expect(r.tees.map((t) => t.name)).toEqual(['Đen', 'Đỏ'])
    expect(r.tees[1].gender).toBe('F')
    expect(r.tees[0].holes).toHaveLength(18)
    expect(teeTotals(r.tees[0].holes)).toEqual({ out: sum(L.slice(0, 9)), in: sum(L.slice(9)), total: sum(L), par: sum(P) })
  })

  it('bảng cách bằng dấu cách, không tiêu đề, tự bỏ cột tổng', () => {
    const line = (name: string, a: number[]) => `${name} ${a.slice(0, 9).join(' ')} ${sum(a.slice(0, 9))} ${a.slice(9).join(' ')} ${sum(a.slice(9))} ${sum(a)}`
    const r = parseTeesBlock([line('Par', P), line('Xanh dương', L)].join('\n'))
    expect(r.tees[0].name).toBe('Xanh dương')
    expect(r.tees[0].color).toBe('#1F5FB0')
    expect(r.tees[0].holes.map((h) => h.len)).toEqual(L)
    expect(r.tees[0].holes.map((h) => h.par)).toEqual(P)
  })

  it('báo lỗi khi dán nhầm khối khác', () => {
    expect(parseTeesBlock('{"type":"course","name":"A"}').ok).toBe(false)
    expect(parseTeesBlock('').ok).toBe(false)
  })

  it('cảnh báo số bất thường', () => {
    const r = parseTeesBlock(JSON.stringify({ type: 'tees', par: [4, 9, 3], tees: [{ name: 'Blue', len: [380, 900, 150] }] }))
    expect(r.ok).toBe(true)
    expect(r.warnings.join(' ')).toMatch(/750/)
    expect(r.warnings.join(' ')).toMatch(/Par hố 2/)
  })
})

describe('danh mục sân', () => {
  it('nhận màu tee theo tên', () => {
    expect(teePreset('Xanh lá')?.color).toBe('#2E8B3E')
    expect(teePreset('Tee Vàng')?.color).toBe('#F2C200')
    expect(teePreset('Ladies')?.gender).toBe('F')
    expect(teePreset('Sao Hỏa')).toBeNull()
  })
  it('đường dẫn không trùng', () => {
    expect(uniqueSlug('Black Mountain Golf Club', [])).toBe('black-mountain-golf-club')
    expect(uniqueSlug('Black Mountain Golf Club', ['black-mountain-golf-club'])).toBe('black-mountain-golf-club-2')
  })
  it('báo sân trùng tên', () => {
    const list = [{ name: 'Mường Thanh Golf Club Xuân Thành', name_en: null }]
    expect(similarCourse('Muong Thanh Golf Club Xuan Thanh', list)).toBeTruthy()
    expect(similarCourse('Black Mountain', list)).toBeUndefined()
  })
})
