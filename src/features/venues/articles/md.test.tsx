import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown, parseMd } from './md'

describe('parseMd', () => {
  it('tách tiêu đề, đoạn, danh sách', () => {
    const b = parseMd('## Mở bài\nDòng 1\ndòng 2\n\n- a\n- b\n1. x\n2. y\n### Nhỏ')
    expect(b).toEqual([
      { t: 'h2', text: 'Mở bài' },
      { t: 'p', text: 'Dòng 1 dòng 2' },
      { t: 'ul', items: ['a', 'b'] },
      { t: 'ol', items: ['x', 'y'] },
      { t: 'h3', text: 'Nhỏ' },
    ])
  })
})

describe('Markdown', () => {
  it('đậm, link https, không chèn được HTML hay link javascript', () => {
    const html = renderToStaticMarkup(<Markdown src={'**Trackman** [hãng](https://www.trackman.com) <img src=x onerror=alert(1)> [x](javascript:alert(1))'} />)
    expect(html).toContain('<strong>Trackman</strong>')
    expect(html).toContain('href="https://www.trackman.com"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href="javascript')
  })
})
