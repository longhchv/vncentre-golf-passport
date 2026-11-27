// Markdown rút gọn cho bài viết địa điểm — cùng quy tắc với trang tapgolf (golf-web/articles.js):
//   ## Tiêu đề mục · ### Tiêu đề nhỏ · - gạch đầu dòng · 1. đánh số · **đậm** · [chữ](https://…) · dòng trống = đoạn mới
// Không dựng HTML thô: mọi chữ đều đi qua React nên không chèn được mã.
import type { ReactNode } from 'react'

export type MdBlock =
  | { t: 'h2' | 'h3' | 'p'; text: string }
  | { t: 'ul' | 'ol'; items: string[] }

export function parseMd(src: string): MdBlock[] {
  const out: MdBlock[] = []
  let para: string[] = []
  const flush = () => { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = [] } }
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{2,3})\s+(.+)$/))) { flush(); out.push({ t: m[1].length === 2 ? 'h2' : 'h3', text: m[2] }); continue }
    if ((m = line.match(/^[-*]\s+(.+)$/)) || (m = line.match(/^\d+[.)]\s+(.+)$/))) {
      flush()
      const t = /^\d/.test(line) ? 'ol' : 'ul'
      const last = out[out.length - 1]
      if (last && last.t === t) last.items.push(m[1])
      else out.push({ t, items: [m[1]] })
      continue
    }
    para.push(line)
  }
  flush()
  return out
}

/** **đậm** và [chữ](https://…) trong một dòng. */
export function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] != null) nodes.push(<strong key={k++}>{m[1]}</strong>)
    else nodes.push(<a key={k++} href={m[3]} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold underline">{m[2]}</a>)
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ src }: { src: string }) {
  return (
    <div className="space-y-3 text-base leading-relaxed">
      {parseMd(src).map((b, i) => {
        if (!('items' in b)) {
          if (b.t === 'h2') return <h2 key={i} className="pt-2 text-lg font-bold">{inline(b.text)}</h2>
          if (b.t === 'h3') return <h3 key={i} className="font-bold">{inline(b.text)}</h3>
          return <p key={i}>{inline(b.text)}</p>
        }
        const li = b.items.map((x, j) => <li key={j}>{inline(x)}</li>)
        return b.t === 'ul'
          ? <ul key={i} className="list-disc space-y-1 pl-5">{li}</ul>
          : <ol key={i} className="list-decimal space-y-1 pl-5">{li}</ol>
      })}
    </div>
  )
}
