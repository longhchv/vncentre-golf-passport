// Tách toạ độ từ link Google Maps hoặc chuỗi "vĩ độ, kinh độ" (không gọi API nào của Google).

export interface LatLng { lat: number; lng: number }

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

/** Trả về toạ độ hoặc null nếu không đọc được. Ưu tiên toạ độ của địa điểm (!3d…!4d…) hơn tâm bản đồ (@…). */
export function parseLatLng(input: string): LatLng | null {
  const s = decodeURIComponent((input || '').trim())
  if (!s) return null
  const tries: RegExp[] = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // địa điểm trong link /place/
    /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, // tâm bản đồ
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/, // gõ tay "18.78, 105.73"
  ]
  for (const re of tries) {
    const m = s.match(re)
    if (m) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2])
      if (valid(lat, lng)) return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }
    }
  }
  return null
}

/** Khoảng cách đường chim bay (km, 1 chữ số thập phân). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10
}
