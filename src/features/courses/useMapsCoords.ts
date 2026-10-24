// Đọc toạ độ từ ô "Link Google Maps": link đầy đủ hoặc "vĩ độ, kinh độ" đọc ngay trên máy;
// link rút gọn (maps.app.goo.gl) nhờ máy chủ mở hộ. Không đọc được thì chỉ cảnh báo, không chặn lưu.
import { useEffect, useState } from 'react'
import { isGoogleMapsLink, parseLatLng, type LatLng } from './coords'
import { resolveMapsLink } from './api'

export type MapsState = 'empty' | 'ok' | 'resolving' | 'shortFail' | 'bad'

type Hit = (LatLng & { approx?: boolean }) | null
const cache = new Map<string, Hit>()

export function useMapsCoords(input: string): { coords: LatLng | null; state: MapsState; approx?: boolean } {
  const text = (input || '').trim()
  const direct = parseLatLng(text)
  const short = !direct && isGoogleMapsLink(text)
  const [resolved, setResolved] = useState<{ key: string; value: Hit } | null>(null)

  useEffect(() => {
    if (!short) return
    if (cache.has(text)) { setResolved({ key: text, value: cache.get(text)! }); return }
    let alive = true
    const timer = setTimeout(async () => {
      let value: Hit = null
      try {
        const r = await resolveMapsLink(text)
        value = r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng, approx: r.approx } : parseLatLng(r.url)
      } catch { value = null }
      cache.set(text, value)
      if (alive) setResolved({ key: text, value })
    }, 350)
    return () => { alive = false; clearTimeout(timer) }
  }, [text, short])

  if (!text) return { coords: null, state: 'empty' }
  if (direct) return { coords: direct, state: 'ok' }
  if (!short) return { coords: null, state: 'bad' }
  if (!resolved || resolved.key !== text) return { coords: null, state: 'resolving' }
  return resolved.value ? { coords: { lat: resolved.value.lat, lng: resolved.value.lng }, state: 'ok', approx: Boolean(resolved.value.approx) } : { coords: null, state: 'shortFail' }
}
