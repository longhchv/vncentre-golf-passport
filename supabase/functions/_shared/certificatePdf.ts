// Vẽ chứng nhận ra PDF (pdf-lib) theo certificateLayout.ts. Thư viện được truyền vào (lib) để
// dùng được cả trong Edge Function (Deno, npm:) và script kiểm thử trên máy (Node).

import { buildCertificate, CERT_H, CERT_W, type CertFont, type CertificateData } from './certificateLayout.ts'

export interface CertAssets {
  background: Uint8Array
  logoVnCentre: Uint8Array
  signature: Uint8Array
  /** PDF vector logo Dự án R&A – VGA; lấy vùng raVgaBox của trang 1 */
  raVgaPdf: Uint8Array
  raVgaBox: { left: number; bottom: number; right: number; top: number }
  fonts: Record<CertFont, Uint8Array>
}

// deno-lint-ignore no-explicit-any
type Lib = { PDFDocument: any; rgb: any; setCharacterSpacing: any; LineCapStyle: any; fontkit: any; QRCode: any }

const PAGE_W = 841.89
const PAGE_H = 595.28
const K = PAGE_W / CERT_W

function color(lib: Lib, hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  return lib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export async function renderCertificatePdf(lib: Lib, data: CertificateData, assets: CertAssets): Promise<Uint8Array> {
  const doc = await lib.PDFDocument.create()
  doc.registerFontkit(lib.fontkit)
  doc.setTitle(`Certificate - ${data.student_name}`)
  doc.setAuthor('VN Centre')
  doc.setCreator('VN Centre Golf Passport')
  const page = doc.addPage([PAGE_W, PAGE_H])
  const y = (v: number) => PAGE_H - v * (PAGE_H / CERT_H)

  const fonts: Partial<Record<CertFont, unknown>> = {}
  // deno-lint-ignore no-explicit-any
  const font = async (f: CertFont): Promise<any> => (fonts[f] ??= await doc.embedFont(assets.fonts[f], { subset: true }))

  // Nền / chữ ký admin tải lên có thể là PNG hoặc JPEG
  // deno-lint-ignore no-explicit-any
  const embed = (b: Uint8Array): Promise<any> => (b[0] === 0x89 ? doc.embedPng(b) : doc.embedJpg(b))
  const images = {
    background: await embed(assets.background),
    logoVnCentre: await embed(assets.logoVnCentre),
    signature: await embed(assets.signature),
  }
  const raDoc = await lib.PDFDocument.load(assets.raVgaPdf)
  const raVga = await doc.embedPage(raDoc.getPage(0), assets.raVgaBox)

  for (const el of buildCertificate(data)) {
    if (el.kind === 'image') {
      const box = { x: el.x * K, y: y(el.y + el.h), width: el.w * K, height: el.h * K }
      if (el.image === 'logoRaVga') page.drawPage(raVga, box)
      else page.drawImage(images[el.image], box)
    } else if (el.kind === 'line') {
      page.drawLine({
        start: { x: el.x1 * K, y: y(el.y1) }, end: { x: el.x2 * K, y: y(el.y2) },
        thickness: el.width * K, color: color(lib, el.color),
        ...(el.dotted ? { dashArray: [0.01, 3.2], lineCap: lib.LineCapStyle.Round } : {}),
      })
    } else if (el.kind === 'qr') {
      // Vẽ QR bằng hình chữ nhật (vector, nét khi in); gộp các ô đen liền nhau trên cùng hàng
      const qr = lib.QRCode.create(el.value, { errorCorrectionLevel: 'M' })
      const n: number = qr.modules.size
      const cell = (el.size * K) / n
      const top = y(el.y)
      for (let r = 0; r < n; r++) {
        let c = 0
        while (c < n) {
          if (!qr.modules.get(r, c)) { c++; continue }
          const start = c
          while (c < n && qr.modules.get(r, c)) c++
          page.drawRectangle({ x: el.x * K + start * cell, y: top - (r + 1) * cell, width: (c - start) * cell + 0.05, height: cell + 0.05, color: color(lib, el.color) })
        }
      }
    } else {
      const f = await font(el.font)
      const ls = el.letterSpacing ?? 0
      const widthAt = (size: number) => f.widthOfTextAtSize(el.text, size) + ls * Math.max(0, [...el.text].length - 1)
      let size = el.size
      if (el.maxWidth && widthAt(size) > el.maxWidth) size = size * (el.maxWidth / widthAt(size))
      const w = widthAt(size)
      const x = el.align === 'center' ? el.x - w / 2 : el.align === 'right' ? el.x - w : el.x
      if (ls) page.pushOperators(lib.setCharacterSpacing(ls * K))
      page.drawText(el.text, { x: x * K, y: y(el.y), size: size * K, font: f, color: color(lib, el.color) })
      if (ls) page.pushOperators(lib.setCharacterSpacing(0))
    }
  }
  return await doc.save({ useObjectStreams: true })
}
