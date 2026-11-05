// Ảnh sân đưa lên website: thu nhỏ cạnh dài 1920px, đóng logo VN Centre màu trắng góc dưới phải, xuất JPEG < 3 MB
// (kho site-photos chỉ nhận JPEG ≤ 3 MB). Ảnh gốc không tải lên đâu cả.
// Theo docs/plan/khu-quan-tri-san.md mục 3. Muốn đổi logo/vị trí: sửa WM bên dưới.

export const WM = {
  src: '/cert/logo-vncentre.png',
  /** Bề rộng logo so với cạnh ngắn của ảnh */
  width: 0.2,
  /** Khoảng cách tới mép, so với cạnh ngắn */
  margin: 0.035,
  opacity: 0.78,
  maxSide: 1920,
  maxBytes: 2_900_000,
}

let logoPromise: Promise<HTMLCanvasElement> | null = null

/** Logo chuyển sang màu trắng (giữ nguyên độ trong suốt), có bóng mờ để đọc được trên nền sáng. */
function whiteLogo(): Promise<HTMLCanvasElement> {
  logoPromise ??= new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const g = c.getContext('2d')!
      g.drawImage(img, 0, 0)
      g.globalCompositeOperation = 'source-in'
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, c.width, c.height)
      resolve(c)
    }
    img.onerror = () => { logoPromise = null; reject(new Error('logo_load')) }
    img.src = WM.src
  })
  return logoPromise
}

export interface StampedPhoto { blob: Blob; width: number; height: number; takenOn: string | null }

/** Ngày chụp từ EXIF (DateTimeOriginal) nếu có, dạng YYYY-MM-DD. Không đọc được thì null. */
export async function exifDate(file: File): Promise<string | null> {
  try {
    const buf = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer())
    const s = new TextDecoder('latin1').decode(buf)
    const m = s.match(/(\d{4}):(\d{2}):(\d{2}) \d{2}:\d{2}:\d{2}/)
    if (!m) return null
    const y = +m[1]
    return y > 1990 && y < 2100 ? `${m[1]}-${m[2]}-${m[3]}` : null
  } catch {
    return null
  }
}

export async function stampPhoto(file: File): Promise<StampedPhoto> {
  // imageOrientation: 'from-image' để ảnh chụp dọc trên điện thoại không bị xoay ngang
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
  if (!bitmap) throw new Error('photo_type')
  const [logo, takenOn] = await Promise.all([whiteLogo().catch(() => null), exifDate(file)])
  let side = WM.maxSide
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bitmap.width * scale)
    c.height = Math.round(bitmap.height * scale)
    const g = c.getContext('2d')!
    g.drawImage(bitmap, 0, 0, c.width, c.height)
    if (logo) {
      const short = Math.min(c.width, c.height)
      const w = Math.round(short * WM.width), h = Math.round((w * logo.height) / logo.width)
      const m = Math.round(short * WM.margin)
      g.save()
      g.globalAlpha = WM.opacity
      g.shadowColor = 'rgba(0,0,0,0.45)'
      g.shadowBlur = Math.max(2, Math.round(w * 0.03))
      g.drawImage(logo, c.width - w - m, c.height - h - m, w, h)
      g.restore()
    }
    for (const q of [0.86, 0.8, 0.72]) {
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q))
      if (blob && blob.size <= WM.maxBytes) {
        bitmap.close?.()
        return { blob, width: c.width, height: c.height, takenOn }
      }
    }
    side = Math.round(side * 0.85)
  }
  throw new Error('photo_too_large')
}
