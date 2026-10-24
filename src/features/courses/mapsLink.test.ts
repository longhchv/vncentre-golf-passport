import { describe, expect, it } from 'vitest'
import { coordsFromQuery, coordsFromText, decodePlus, recoverPlus, resolveMapsLink } from '../../../supabase/functions/goi-y-quanh-san/maps-link'
import { isShortMapsLink } from './coords'

const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } })
const page = (html: string) => new Response(html, { status: 200 })
const osm = (lat: number, lon: number, country = 'Indonesia') => new Response(JSON.stringify({ features: [{ geometry: { coordinates: [lon, lat] }, properties: { country } }] }), { status: 200 })
const none = () => new Response(JSON.stringify({ features: [] }), { status: 200 })
const meteo = (lat: number, lon: number, country: string) => new Response(JSON.stringify({ results: [{ latitude: lat, longitude: lon, country }] }), { status: 200 })
const noWait = async () => {}

describe('Plus Code', () => {
  it('giải mã mã đầy đủ (ví dụ chuẩn: Zurich)', () => {
    const p = decodePlus('8FVC9G8F+6X')
    expect(p.lat).toBeCloseTo(47.3655625, 5)
    expect(p.lng).toBeCloseTo(8.5249375, 5)
  })
  it('khôi phục mã rút gọn từ điểm tham chiếu cách vài chục km', () => {
    expect(recoverPlus('9G8F+6X', { lat: 47.6, lng: 8.8 })).toEqual(decodePlus('8FVC9G8F+6X'))
    expect(recoverPlus('9G8F+6X', { lat: 47.1, lng: 8.2 })).toEqual(decodePlus('8FVC9G8F+6X'))
  })
  it('mã rút gọn + địa chỉ trong q (dấu + giữ nguyên hoặc thay dấu cách bằng +)', async () => {
    const calls: string[] = []
    const f = async (u: string) => { calls.push(decodeURIComponent(u)); return osm(-6.6, 106.85) }
    const a = await coordsFromQuery('9VF7+C9Q Gn. Geulis Country Club, Gadog, Kec. Sukaraja, Kabupaten Bogor, Jawa Barat 16710, Indonesia', f, noWait)
    const b = await coordsFromQuery('9VF7+C9Q+Gn.+Geulis+Country+Club,+Gadog,+Kabupaten+Bogor,+Indonesia', f, noWait)
    expect(a).toMatchObject({ how: 'pluscode', approx: false })
    expect(b).toEqual(a)
    expect({ lat: a!.lat, lng: a!.lng }).toEqual(decodePlus('6P589VF7+C9Q'))
    expect(calls[0]).toContain('Gn. Geulis Country Club')
    expect(calls[0]).not.toContain('9VF7')
  })
  it('Photon không thấy thì dùng Open-Meteo theo tên địa danh, đúng quốc gia', async () => {
    const asked: string[] = []
    const f = async (u: string) => {
      asked.push(decodeURIComponent(u))
      if (u.includes('photon')) return none()
      if (u.includes('Sukaraja')) return meteo(-6.63, 106.88, 'Indonesia')
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }
    const r = await coordsFromQuery('9VF7+C9Q Gn. Geulis Country Club, Gadog, Kec. Sukaraja, Kabupaten Bogor, Jawa Barat 16710, Indonesia', f, noWait)
    expect({ lat: r!.lat, lng: r!.lng }).toEqual(decodePlus('6P589VF7+C9Q'))
    expect(asked.some((u) => u.includes('name=Sukaraja'))).toBe(true)
  })
  it('không có Plus Code thì tìm theo địa chỉ, bớt dần phần đầu, đánh dấu ước lượng', async () => {
    let n = 0
    const f = async () => (++n < 2 ? osm(1, 1, 'Japan') : osm(12.5, 99.9, 'Thailand'))
    expect(await coordsFromQuery('Black Mountain Golf Club, Hua Hin, Thailand', f, noWait)).toMatchObject({ lat: 12.5, lng: 99.9, how: 'address', approx: true })
    expect(n).toBe(2)
  })
})

describe('mở link rút gọn Google Maps', () => {
  it('nhận ra link rút gọn', () => {
    expect(isShortMapsLink('https://maps.app.goo.gl/iUC8JHWu4tR8DHAt8?g_st=ic')).toBe(true)
    expect(isShortMapsLink('https://goo.gl/maps/abc')).toBe(true)
    expect(isShortMapsLink('https://www.google.com/maps/@1,2,3z')).toBe(false)
  })

  it('link cuối có toạ độ địa điểm → lấy luôn', async () => {
    const f = async (u: string) => (u.includes('goo.gl') ? redirect('https://www.google.com/maps/place/X/@-6.62,106.8,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d-6.6213456!4d106.8512345') : page(''))
    expect(await resolveMapsLink('https://maps.app.goo.gl/a?g_st=ic', f, noWait)).toMatchObject({ lat: -6.621346, lng: 106.851235, how: 'link' })
  })

  it('link cuối chỉ có q (như link chia sẻ từ iPhone) → giải Plus Code, KHÔNG đọc khung nhìn trong trang', async () => {
    const seen: string[] = []
    const f = async (u: string) => {
      seen.push(u)
      if (u.includes('maps.app.goo.gl')) return redirect('https://maps.google.com/maps?q=9VF7%2BC9Q+Gn.+Geulis+Country+Club,+Kabupaten+Bogor,+Indonesia&ftid=0x2e69:0x1&entry=gps')
      if (u.includes('photon')) return osm(-6.6, 106.85)
      return page('<meta content="staticmap?center=35.76%2C125.70">')
    }
    const r = await resolveMapsLink('https://maps.app.goo.gl/b', f, noWait)
    expect(r).toMatchObject({ how: 'pluscode', approx: false })
    expect({ lat: r.lat, lng: r.lng }).toEqual(decodePlus('6P589VF7+C9Q'))
    expect(seen.some((u) => u.startsWith('https://maps.google.com'))).toBe(false)
  })

  it('đi qua trang đồng ý cookie của Google', async () => {
    const f = async (u: string) => (u.includes('goo.gl') ? redirect('https://consent.google.com/m?continue=' + encodeURIComponent('https://www.google.com/maps/place/X/@10.1,106.2,15z')) : page(''))
    expect(await resolveMapsLink('https://maps.app.goo.gl/y', f, noWait)).toMatchObject({ lat: 10.1, lng: 106.2 })
  })

  it('không đi ra ngoài tên miền Google', async () => {
    const f = async () => redirect('https://evil.example.com/')
    await expect(resolveMapsLink('https://maps.app.goo.gl/z', f, noWait)).rejects.toThrow('not_google')
    await expect(resolveMapsLink('https://example.com/a', f, noWait)).rejects.toThrow('not_google')
  })

  it('không đọc được thì trả lat/lng rỗng', async () => {
    const f = async (u: string) => (u.includes('goo.gl') ? redirect('https://www.google.com/maps?cid=123') : page('<html>no coords</html>'))
    expect(await resolveMapsLink('https://maps.app.goo.gl/w', f, noWait)).toMatchObject({ lat: null, lng: null })
  })

  it('bỏ toạ độ 0,0', () => {
    expect(coordsFromText('https://x/@0.0,0.0,3z')).toBeNull()
  })
})
