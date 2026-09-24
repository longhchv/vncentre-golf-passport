// Bố cục chứng nhận (F9) — dùng chung cho PDF (Edge Function) và bản xem trên app (SVG).
// Toạ độ theo khung 2000 × 1414 (A4 ngang), gốc ở góc trên trái, y là đường chân chữ (baseline).
// Đo theo mẫu chứng nhận hiện tại của VN Centre (tai-san-chung-nhan/Mau-chung-nhan-certificate.png).
// File này không import gì để cả Deno và Vite dùng được.

export const CERT_W = 2000
export const CERT_H = 1414

export type CertFont = 'serif' | 'serifBold' | 'serifItalic' | 'script' | 'sans' | 'sansMedium'
export type CertImage = 'background' | 'logoVnCentre' | 'logoRaVga' | 'signature'

export type CertElement =
  | {
      kind: 'text'
      text: string
      x: number
      y: number
      size: number
      font: CertFont
      color: string
      align: 'left' | 'center' | 'right'
      /** Chữ dài hơn thì thu nhỏ cỡ chữ cho vừa */
      maxWidth?: number
      letterSpacing?: number
    }
  | { kind: 'image'; image: CertImage; x: number; y: number; w: number; h: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dotted?: boolean }
  | { kind: 'qr'; value: string; x: number; y: number; size: number; color: string }

/** Dữ liệu in trên chứng nhận — snapshot lưu trong certificates.data (R9). */
export interface CertificateData {
  student_name: string
  class_name?: string | null
  school_name?: string | null
  program: string
  level_label?: string | null
  issued_at?: string
  language: 'en' | 'bilingual'
  signer_name: string
  /** Xuống dòng bằng "\n" */
  signer_title: string
  verify_code: string
  verify_url: string
  background_path?: string | null
  signature_path?: string | null
}

const GRAY = '#49494d'
const GOLD = '#d49d60'
const BROWN = '#744c29'
const NAVY = '#181e42'

/** Mã xác thực dễ đọc: ABCDE-FGHJK */
export function formatVerifyCode(code: string) {
  return code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5)}` : code
}

export function programLine(d: Pick<CertificateData, 'program' | 'level_label'>) {
  return [d.program, d.level_label].filter((x) => x && String(x).trim()).join(' - ')
}

export function buildCertificate(d: CertificateData): CertElement[] {
  const bi = d.language === 'bilingual'
  const text = (t: string, x: number, y: number, size: number, font: CertFont, color: string,
    align: 'left' | 'center' | 'right' = 'center', extra: { maxWidth?: number; letterSpacing?: number } = {}): CertElement =>
    ({ kind: 'text', text: t.normalize('NFC'), x, y, size, font, color, align, ...extra })
  const dotted = (x1: number, x2: number, y: number): CertElement => ({ kind: 'line', x1, y1: y, x2, y2: y, color: GRAY, width: 2.2, dotted: true })

  const els: CertElement[] = [
    { kind: 'image', image: 'background', x: 0, y: 0, w: CERT_W, h: CERT_H },
    // Đầu trang: VN Centre (trái), Dự án R&A – VGA (phải)
    { kind: 'image', image: 'logoVnCentre', x: 176, y: 166, w: 184, h: 75 },
    text('TRUNG TÂM QUẢNG BÁ &', 378, 191, 24, 'sansMedium', BROWN, 'left', { maxWidth: 300 }),
    text('PHÁT TRIỂN GOLF VIỆT NAM', 378, 219, 24, 'sansMedium', BROWN, 'left', { maxWidth: 332 }),
    text('VIETNAM GOLF PROMOTION AND DEVELOPMENT CENTRE', 378, 238, 11, 'sansMedium', '#798185', 'left', { maxWidth: 332 }),
    { kind: 'image', image: 'logoRaVga', x: 1548, y: 172, w: 262, h: 141 },

    text('CERTIFICATE', 1000, 377, 108, 'serif', GRAY, 'center', { maxWidth: 700 }),
    text('OF COMPLETION', 1000, 458, 54, 'serif', GOLD, 'center', { maxWidth: 520, letterSpacing: 5 }),
    { kind: 'line', x1: 704, y1: 487, x2: 1295, y2: 487, color: '#a6a6a6', width: 2 },
  ]
  if (bi) els.push(text('CHỨNG NHẬN HOÀN THÀNH', 1000, 522, 22, 'serif', GOLD, 'center', { letterSpacing: 4 }))
  els.push(text('THIS CERTIFICATE IS AWARDED TO', 1000, bi ? 570 : 577, bi ? 38 : 42, 'serif', GRAY, 'center', { maxWidth: 730 }))
  if (bi) els.push(text('Chứng nhận này được trao cho', 1000, 603, 23, 'serifItalic', GRAY))

  // Tên học viên (có dấu)
  els.push(text(d.student_name, 1000, bi ? 668 : 664, bi ? 56 : 60, 'serifBold', NAVY, 'center', { maxWidth: 1100 }))
  els.push(dotted(445, 1553, 680))

  // Lớp, trường
  const c = bi
    ? { label: 'Class / Lớp:', size: 44, x1: 700, x2: 810, school: 'School / Trường:', sx: 845, s1: 1150 }
    : { label: 'Class:', size: 54, x1: 625, x2: 735, school: 'School:', sx: 787, s1: 960 }
  els.push(text(c.label, 443, 742, c.size, 'script', '#000000', 'left'))
  els.push(dotted(c.x1, c.x2, 748))
  if (d.class_name) els.push(text(d.class_name, (c.x1 + c.x2) / 2, 738, 30, 'serif', NAVY, 'center', { maxWidth: c.x2 - c.x1 + 40 }))
  els.push(text(c.school, c.sx, 742, c.size, 'script', '#000000', 'left'))
  els.push(dotted(c.s1, 1553, 748))
  if (d.school_name) els.push(text(d.school_name, (c.s1 + 1553) / 2, 738, 30, 'serif', NAVY, 'center', { maxWidth: 1553 - c.s1 }))

  // Dòng ghi nhận
  const prog = programLine(d)
  if (bi) {
    els.push(text('In recognition of their achievement in completing the', 1000, 802, 30, 'serif', GRAY))
    els.push(text(prog, 1000, 840, 30, 'serif', GRAY, 'center', { maxWidth: 1300 }))
    els.push(text(`Ghi nhận thành tích hoàn thành ${prog}`, 1000, 876, 25, 'serifItalic', GRAY, 'center', { maxWidth: 1300 }))
  } else {
    els.push(text('In recognition of their achievement in completing the', 1000, 815, 34, 'serif', GRAY))
    els.push(text(prog, 1000, 857, 34, 'serif', GRAY, 'center', { maxWidth: 1300 }))
  }

  // Chữ ký, tên và chức danh người ký (không dấu, như mẫu)
  els.push({ kind: 'image', image: 'signature', x: 785, y: bi ? 880 : 868, w: 430, h: 238 })
  els.push({ kind: 'line', x1: 817, y1: 1085, x2: 1183, y2: 1085, color: '#bcbcbc', width: 2 })
  els.push(text(d.signer_name, 1000, 1142, 38, 'serifBold', GRAY, 'center', { maxWidth: 700 }))
  d.signer_title.split('\n').slice(0, 2).forEach((line, i) =>
    els.push(text(line.trim(), 1000, 1193 + i * 43, 32, 'serif', GRAY, 'center', { maxWidth: 760 })))

  // QR xác thực + mã
  els.push(text(bi ? 'Scan to verify · Quét để xác thực' : 'Scan to verify', 1725, 1068, 14, 'serifItalic', '#232425', 'center', { maxWidth: 230 }))
  els.push({ kind: 'qr', value: d.verify_url, x: 1637, y: 1080, size: 176, color: NAVY })
  els.push(text(formatVerifyCode(d.verify_code), 1725, 1280, 16, 'sansMedium', NAVY, 'center', { letterSpacing: 2 }))
  return els
}
