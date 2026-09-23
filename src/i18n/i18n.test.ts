import { describe, expect, it } from 'vitest'
import vi from './vi.json'
import en from './en.json'

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

describe('file ngôn ngữ', () => {
  it('vi và en có đúng cùng một bộ khoá', () => {
    expect(flatKeys(en).sort()).toEqual(flatKeys(vi).sort())
  })

  it('không có chuỗi rỗng', () => {
    for (const dict of [vi, en]) {
      const values = flatKeys(dict).map((k) => k.split('.').reduce<any>((o, p) => o[p], dict))
      expect(values.every((v) => typeof v === 'string' && v.trim() !== '')).toBe(true)
    }
  })
})
