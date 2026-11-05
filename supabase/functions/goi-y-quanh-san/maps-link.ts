// Mở link rút gọn Google Maps (maps.app.goo.gl …) phía máy chủ để lấy toạ độ.
// Trình duyệt không tự làm được vì Google không cho đọc chuyển hướng từ trang khác (CORS).
// KHÔNG gọi API nào của Google Maps Platform: chỉ mở đúng link người dùng dán, như khi bấm vào link.
// Viết thuần TypeScript (không dùng Deno.*) để chạy được cả trong kiểm thử vitest.

export interface LatLng { lat: number; lng: number }

/** Chỉ đi theo link của Google — không cho dùng chức năng này để mở trang bất kỳ. */
export const ALLOWED_HOST = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+|consent\.google\.[a-z.]+)$/i

const ok = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
const round = (n: number) => Math.round(n * 1e6) / 1e6

/** Tìm toạ độ trong link Google Maps. Ưu tiên toạ độ địa điểm (!3d!4d) hơn tâm bản đồ (@). */
export function coordsFromText(text: string): LatLng | null {
  let s = text || ''
  try { s = decodeURIComponent(s) } catch { /* giữ nguyên */ }
  const tries: RegExp[] = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination|center|daddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  ]
  for (const re of tries) {
    const m = s.match(re)
    if (m) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2])
      if (ok(lat, lng)) return { lat: round(lat), lng: round(lng) }
    }
  }
  return null
}

// ---- Plus Code (Open Location Code, mã mở, không phải dịch vụ của Google) ----
const OLC = '23456789CFGHJMPQRVWX'
const PAIR_RES = [20, 1, 0.05, 0.0025, 0.000125]
const PLUS_RE = /(?:^|[\s+,])([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})(?=[\s,+]|$)/i

/** Giải mã Plus Code đầy đủ (8 ký tự trước dấu +) → tâm ô. */
export function decodePlus(code: string): LatLng {
  const c = code.toUpperCase().replace('+', '').replace(/0+$/, '')
  let lat = -90, lng = -180, latRes = 0, lngRes = 0
  for (let i = 0; i < Math.min(c.length, 10); i += 2) {
    const r = PAIR_RES[i / 2]
    lat += OLC.indexOf(c[i]) * r
    lng += OLC.indexOf(c[i + 1] ?? '2') * r
    latRes = r; lngRes = r
  }
  if (c.length > 10) { // ô lưới 4x5 ở ký tự thứ 11
    const d = OLC.indexOf(c[10]); latRes /= 5; lngRes /= 4
    lat += Math.floor(d / 4) * latRes; lng += (d % 4) * lngRes
  }
  return { lat: round(lat + latRes / 2), lng: round(lng + lngRes / 2) }
}

function encodePrefix(lat: number, lng: number, len: number): string {
  let a = Math.min(Math.max(lat, -90), 90 - 1e-10) + 90, b = (((lng + 180) % 360) + 360) % 360
  let out = ''
  for (let i = 0; i < len / 2; i++) {
    const r = PAIR_RES[i]
    const da = Math.floor(a / r), db = Math.floor(b / r)
    out += OLC[da] + OLC[db]
    a -= da * r; b -= db * r
  }
  return out
}

/** Khôi phục Plus Code rút gọn (vd "9VF7+C9Q") từ một điểm tham chiếu gần đó (sai số tới ~50 km vẫn đúng). */
export function recoverPlus(short: string, ref: LatLng): LatLng {
  const code = short.toUpperCase()
  const pad = 8 - code.indexOf('+')
  if (pad <= 0) return decodePlus(code)
  const res = Math.pow(20, 2 - pad / 2), half = res / 2
  const p = decodePlus(encodePrefix(ref.lat, ref.lng, pad) + code)
  let { lat, lng } = p
  if (ref.lat + half < lat && lat - res >= -90) lat -= res
  else if (ref.lat - half > lat && lat + res <= 90) lat += res
  if (ref.lng + half < lng) lng -= res
  else if (ref.lng - half > lng) lng += res
  return { lat: round(lat), lng: round(lng) }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

export interface Resolved { url: string; lat: number | null; lng: number | null; how: 'link' | 'pluscode' | 'address' | null; approx: boolean }

const GEO_UA = { 'User-Agent': 'VNCentre-GolfPassport/1.0 (VNCentre.net@gmail.com)', 'Accept-Language': 'en' }
const STRIP = /^(kec\.?|kecamatan|kab\.?|kabupaten|kota|kel\.?|desa|jl\.?|jalan|huyện|xã|phường|quận|tỉnh|thành phố|tp\.?|amphoe|tambon|changwat)\s+/i

/**
 * Tìm toạ độ theo địa chỉ bằng dữ liệu OpenStreetMap (miễn phí, không cần khoá):
 * 1) Photon (photon.komoot.io) với địa chỉ đầy đủ, bớt dần phần đầu nếu không thấy;
 * 2) Open-Meteo Geocoding theo tên từng địa danh trong địa chỉ (đủ để khôi phục Plus Code rút gọn).
 * (Nominatim chặn máy chủ Supabase nên không dùng.)
 */
export async function geocodeAddress(text: string, fetchFn: Fetch = fetch, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<LatLng | null> {
  const parts = text.split(',').map((x) => x.trim()).filter(Boolean)
  const country = (parts[parts.length - 1] || '').toLowerCase()
  const getJson = async (u: string) => {
    try {
      const r = await fetchFn(u, { headers: GEO_UA })
      return r.ok ? await r.json() : null
    } catch { return null }
  }
  for (let i = 0; i < Math.min(parts.length, 3); i++) {
    if (i) await wait(300)
    const j = await getJson('https://photon.komoot.io/api/?limit=3&lang=en&q=' + encodeURIComponent(parts.slice(i).join(', ')))
    // Chỉ nhận kết quả đúng quốc gia ghi cuối địa chỉ (tránh trùng tên ở nước khác)
    const f = ((j?.features ?? []) as { geometry?: { coordinates?: number[] }; properties?: { country?: string; countrycode?: string } }[])
      .find((x) => parts.length < 2 || x.properties?.country?.toLowerCase() === country || x.properties?.countrycode?.toLowerCase() === country)
    const c = f?.geometry?.coordinates
    if (Array.isArray(c) && ok(+c[1], +c[0])) return { lat: round(+c[1]), lng: round(+c[0]) }
  }
  for (const seg of parts.slice(0, -1)) {
    const name = seg.replace(/\d{4,6}/g, '').replace(STRIP, '').trim()
    if (name.length < 3) continue
    await wait(300)
    const j = await getJson('https://geocoding-api.open-meteo.com/v1/search?count=5&name=' + encodeURIComponent(name))
    const list = (j?.results ?? []) as { latitude: number; longitude: number; country?: string; country_code?: string }[]
    const hit = list.find((x) => country && (x.country?.toLowerCase() === country || x.country_code?.toLowerCase() === country)) ?? (parts.length === 1 ? list[0] : undefined)
    if (hit && ok(hit.latitude, hit.longitude)) return { lat: round(hit.latitude), lng: round(hit.longitude) }
  }
  return null
}

/** Từ chữ trong tham số q (vd "9VF7+C9Q Gn. Geulis Country Club, Gadog, …, Indonesia") → toạ độ. */
export async function coordsFromQuery(q: string, fetchFn: Fetch = fetch, wait?: (ms: number) => Promise<unknown>): Promise<Omit<Resolved, 'url'> | null> {
  // q để nguyên dấu + (chưa đổi thành dấu cách) để giữ Plus Code; phần địa chỉ đổi + thành dấu cách
  const raw = (q || '').trim()
  const m = raw.match(PLUS_RE)
  const text = (m ? raw.replace(m[1], ' ') : raw).replace(/\+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,]+/, '').trim()
  if (!m && !text) return null
  if (m) {
    const code = m[1].toUpperCase()
    const rest = text
    if (code.indexOf('+') === 8) return { ...decodePlus(code), how: 'pluscode', approx: false }
    const ref = rest ? await geocodeAddress(rest, fetchFn, wait as never) : null
    if (ref) return { ...recoverPlus(code, ref), how: 'pluscode', approx: false }
  }
  if (!text) return null
  const hit = await geocodeAddress(text, fetchFn, wait as never)
  return hit ? { ...hit, how: 'address', approx: true } : null
}

/**
 * Đi theo chuyển hướng (tối đa 6 bước, chỉ trong tên miền Google) tới link đầy đủ.
 * Link có toạ độ → lấy luôn. Link chỉ có tên/địa chỉ (?q=…) → giải Plus Code trong đó, hoặc tìm theo địa chỉ.
 * Không đọc toạ độ trong mã trang: đó là khung nhìn theo vị trí máy chủ, không phải vị trí sân.
 */
export async function resolveMapsLink(input: string, fetchFn: Fetch = fetch, wait?: (ms: number) => Promise<unknown>): Promise<Resolved> {
  let url: URL
  try { url = new URL(String(input || '').trim()) } catch { throw new Error('bad_url') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('bad_url')
  if (!ALLOWED_HOST.test(url.hostname)) throw new Error('not_google')
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'Accept-Language': 'en' }

  for (let hop = 0; hop < 7; hop++) {
    if (/^consent\./i.test(url.hostname) && url.searchParams.get('continue')) {
      url = new URL(url.searchParams.get('continue')!)
      continue
    }
    const hit = coordsFromText(url.href)
    if (hit) return { url: url.href, ...hit, how: 'link', approx: false }
    const q = rawQuery(url)
    if (q) {
      const found = await coordsFromQuery(q, fetchFn, wait)
      return found ? { url: url.href, ...found } : { url: url.href, lat: null, lng: null, how: null, approx: false }
    }
    // Chưa có toạ độ hay tên/địa chỉ: mở tiếp (link rút gọn, ?cid=…), chỉ đi theo chuyển hướng trong Google
    const res = await fetchFn(url.href, { redirect: 'manual', headers })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, url)
      if (!ALLOWED_HOST.test(next.hostname)) throw new Error('not_google')
      url = next
      continue
    }
    if (res.ok) return { url: url.href, lat: null, lng: null, how: null, approx: false }
    throw new Error(`http_${res.status}`)
  }
  throw new Error('too_many_redirects')
}

/** Tên/địa chỉ trong link: ?q= / ?query= (giữ nguyên dấu +) hoặc /maps/place/<tên>/. */
function rawQuery(url: URL): string {
  const m = url.search.match(/[?&](?:q|query)=([^&]*)/)
  const dec = (x: string) => { try { return decodeURIComponent(x) } catch { return x } }
  if (m && m[1]) return dec(m[1])
  const p = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/)
  return p ? dec(p[1]) : ''
}
