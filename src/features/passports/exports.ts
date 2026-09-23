// Xuất file cho sổ Passport (F11): CSV cho nhà in, PDF tờ decal, danh sách đối chiếu gán sổ.
// pdf-lib, qrcode, xlsx được tải khi cần để không làm nặng trang khác.

import { formatCode } from '@/lib/codes'

export interface DecalLayout {
  page: 'A4'
  width_mm: number
  height_mm: number
  columns: number
  rows: number
  margin_top_mm: number
  margin_left_mm: number
  gap_x_mm: number
  gap_y_mm: number
  /** Vẽ viền mảnh quanh tem để căn chỉnh khi in thử */
  cut_lines?: boolean
}

export const DEFAULT_DECAL_LAYOUT: DecalLayout = {
  page: 'A4',
  width_mm: 35,
  height_mm: 45,
  columns: 5,
  rows: 6,
  margin_top_mm: 6,
  margin_left_mm: 7.5,
  gap_x_mm: 2,
  gap_y_mm: 2,
}

const A4 = { w: 210, h: 297 }
const MM = 72 / 25.4

export const passportUrl = (baseUrl: string, code: string) => `${baseUrl}/p/${code}`

function downloadBlob(data: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Kiểm tra bố cục có vừa khổ giấy không; trả lỗi để hiện cho admin. */
export function checkLayout(l: DecalLayout): string | null {
  const width = l.margin_left_mm + l.columns * l.width_mm + (l.columns - 1) * l.gap_x_mm
  const height = l.margin_top_mm + l.rows * l.height_mm + (l.rows - 1) * l.gap_y_mm
  if (l.columns < 1 || l.rows < 1 || l.width_mm < 20 || l.height_mm < 25) return 'too_small'
  if (width > A4.w || height > A4.h) return 'too_big'
  return null
}

/** CSV cho nhà in: STT, mã, URL QR (UTF-8 có BOM để Excel mở đúng). */
export function downloadPassportCsv(codes: string[], baseUrl: string, fileName: string) {
  const lines = ['STT,Ma so,URL QR', ...codes.map((c, i) => `${i + 1},${formatCode(c)},${passportUrl(baseUrl, c)}`)]
  downloadBlob('﻿' + lines.join('\r\n'), fileName, 'text/csv;charset=utf-8')
}

/** PDF tờ decal: mỗi tem có QR + mã XXXX-XXXX + tên miền (F11). */
export async function buildDecalPdf(codes: string[], baseUrl: string, layout: DecalLayout): Promise<Uint8Array> {
  const [{ PDFDocument, StandardFonts, rgb }, QRCode] = await Promise.all([import('pdf-lib'), import('qrcode')])
  const doc = await PDFDocument.create()
  doc.setTitle('VN Centre Golf Passport – decal')
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const navy = rgb(8 / 255, 6 / 255, 52 / 255)
  const host = baseUrl.replace(/^https?:\/\//, '')

  const perPage = layout.columns * layout.rows
  const w = layout.width_mm
  const h = layout.height_mm
  const pad = 2.5
  const qrSize = Math.min(w - 2 * pad, h - 13)
  const codeSize = Math.min(10, (w - 2 * pad) * 0.3)
  const hostSize = Math.min(6.5, codeSize * 0.62)

  let page = doc.addPage([A4.w * MM, A4.h * MM])
  for (let i = 0; i < codes.length; i++) {
    if (i > 0 && i % perPage === 0) page = doc.addPage([A4.w * MM, A4.h * MM])
    const slot = i % perPage
    const col = slot % layout.columns
    const row = Math.floor(slot / layout.columns)
    const left = layout.margin_left_mm + col * (w + layout.gap_x_mm)
    const top = layout.margin_top_mm + row * (h + layout.gap_y_mm)
    // pdf-lib đo từ góc dưới-trái
    const y0 = (A4.h - top - h) * MM
    const x0 = left * MM

    if (layout.cut_lines) {
      page.drawRectangle({ x: x0, y: y0, width: w * MM, height: h * MM, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.4 })
    }

    // QR dạng vector: vẽ từng ô đen
    const qr = QRCode.create(passportUrl(baseUrl, codes[i]), { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    const quiet = 1
    const cell = (qrSize * MM) / (n + 2 * quiet)
    const qx = x0 + ((w - qrSize) / 2) * MM + quiet * cell
    const qyTop = y0 + (h - pad) * MM - quiet * cell
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.modules.get(r, c)) {
          page.drawRectangle({ x: qx + c * cell, y: qyTop - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: rgb(0, 0, 0) })
        }
      }
    }

    const codeText = formatCode(codes[i])
    const codeY = y0 + (h - pad - qrSize) * MM - codeSize * 1.05
    page.drawText(codeText, {
      x: x0 + (w * MM - bold.widthOfTextAtSize(codeText, codeSize)) / 2,
      y: codeY,
      size: codeSize,
      font: bold,
      color: navy,
    })
    page.drawText(host, {
      x: x0 + (w * MM - regular.widthOfTextAtSize(host, hostSize)) / 2,
      y: codeY - hostSize * 1.35,
      size: hostSize,
      font: regular,
      color: navy,
    })
  }
  return doc.save()
}

export async function downloadDecalPdf(codes: string[], baseUrl: string, layout: DecalLayout, fileName: string) {
  const bytes = await buildDecalPdf(codes, baseUrl, layout)
  downloadBlob(bytes as BlobPart, fileName, 'application/pdf')
}

/** Danh sách đối chiếu "tên học viên ↔ mã sổ" sau khi gán hàng loạt (F11 cách 2). */
export async function downloadAssignmentList(
  rows: { student_code: string; full_name: string; grade_class: string | null; passport_code: string | null; result: string }[],
  resultLabel: (r: string) => string,
  fileName: string,
) {
  const XLSX = await import('xlsx')
  const aoa = [
    ['STT', 'Mã học viên', 'Họ và tên', 'Lớp', 'Mã sổ', 'Kết quả'],
    ...rows.map((r, i) => [i + 1, r.student_code, r.full_name, r.grade_class ?? '', r.passport_code ? formatCode(r.passport_code) : '', resultLabel(r.result)]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 28 }, { wch: 8 }, { wch: 12 }, { wch: 20 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Doi chieu')
  XLSX.writeFile(wb, fileName, { compression: true })
}
