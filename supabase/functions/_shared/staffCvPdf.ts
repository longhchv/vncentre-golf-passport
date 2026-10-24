// CV nhân sự PDF A4 dọc, một trang (11-module-ho-so-nhan-su.md mục 5): 3 mẫu Huấn luyện viên · TNV, CTV · Ban tổ chức.
// Vẽ từ snapshot staff_cv_exports.data (S-R5). Thư viện truyền vào (lib) như certificatePdf.ts để chạy được cả
// trong Edge Function (Deno, npm:) lẫn script thử trên máy (Node). Không import gì.
// Màu theo src/index.css; không có logo VN Centre. Font Be Vietnam Pro dạng hai tập chữ (Latin + tiếng Việt):
// mỗi đoạn chữ được tách theo ký tự để in đủ dấu.

export type CvType = 'coach' | 'volunteer' | 'organizer'
export type Weight = 'regular' | 'semibold' | 'bold'
type Lang = 'vi' | 'en'

export interface StaffCvEngagement {
  id: string
  kind: 'event' | 'project' | 'class'
  event_name_vi?: string | null
  event_name_en?: string | null
  class_name?: string | null
  school_name?: string | null
  academic_year?: string | null
  project_name_vi?: string | null
  project_name_en?: string | null
  position_vi?: string | null
  position_en?: string | null
  staff_group?: string | null
  started_on?: string | null
  ended_on?: string | null
  hours?: number | string | null
  scale?: Record<string, number | string | null> | null
  outcome_vi?: string | null
  outcome_en?: string | null
  badge: 'verified' | 'approved'
  confirmed_by_name?: string | null
}

export interface StaffCvCredential {
  id: string
  type: 'certificate' | 'prior_experience'
  title_vi: string
  title_en?: string | null
  issuer?: string | null
  issued_on?: string | null
  expires_on?: string | null
  years?: number | string | null
}

/** Snapshot đã in (staff_cv_exports.data) */
export interface StaffCvData {
  lang: Lang
  cv_type: CvType
  verify_code: string
  verify_url: string
  exported_at: string
  person: {
    full_name: string
    identity_code?: string | null
    photo_path?: string | null
    joined_vncentre_on?: string | null
    current_position?: { vi?: string | null; en?: string | null } | null
    contact?: { phone?: string | null; email?: string | null } | null
  }
  stage_colors: string[]
  tiles: { key: string; value: number | string; badge: 'verified' | 'approved' }[]
  groups: string[]
  engagements: StaffCvEngagement[]
  credentials: StaffCvCredential[]
  skills: { code: string; name_vi: string; name_en: string; count: number }[]
}

export interface StaffCvAssets {
  /** Mỗi độ đậm hai file: [Latin, tiếng Việt] */
  fonts: Record<Weight, [Uint8Array, Uint8Array]>
  photo?: Uint8Array | null
}

// deno-lint-ignore no-explicit-any
type Lib = { PDFDocument: any; rgb: any; fontkit: any; QRCode: any }

export const W = 595.28
export const H = 841.89
const M = 32
const C = {
  navy: '#080634', gold: '#f9c74f', bronze: '#b06829', brown: '#6a3a16', cream: '#fbf7ef',
  muted: '#5b5a72', line: '#e4dfd3', white: '#ffffff',
}

const LABELS: Record<Lang, Record<string, string>> = {
  vi: {
    'role.coach': 'Huấn luyện viên', 'role.volunteer': 'Tình nguyện viên, cộng tác viên', 'role.organizer': 'Ban tổ chức',
    'group.coach': 'Huấn luyện viên', 'group.volunteer': 'Tình nguyện viên', 'group.collaborator': 'Cộng tác viên', 'group.organizer': 'Ban tổ chức',
    identity: 'Mã định danh', joined: 'Tham gia VN Centre từ', scan: 'Quét để xác thực',
    'tile.years': 'Năm kinh nghiệm', 'tile.sessions': 'Số buổi đứng lớp', 'tile.students': 'Học viên đã dạy', 'tile.level_ups': 'Lượt các bạn lên cấp',
    'tile.events': 'Sự kiện đã tham gia', 'tile.hours': 'Giờ đóng góp', 'tile.roles': 'Vai trò đã đảm nhận', 'tile.certificates': 'Chứng nhận tham gia',
    'tile.projects': 'Dự án, sự kiện đã làm', 'tile.participants': 'Lượt người tham dự', 'tile.schools_partners': 'Trường và đối tác',
    teaching: 'Quá trình giảng dạy', events: 'Sự kiện đã tham gia', journey: 'Hành trình tham gia', skills: 'Kỹ năng được ghi nhận',
    projects: 'Dự án, sự kiện', contact: 'Liên hệ', groups: 'Phân nhóm', certificates: 'Chứng chỉ', studying: 'Đang học, công tác',
    featured: 'Chứng nhận tiêu biểu', position: 'Vị trí hiện tại', expertise: 'Chuyên môn', legend: 'Chú thích',
    verified: 'Đã xác thực: app tự ghi hoặc người phụ trách xác nhận', approved: 'Đã duyệt: tự khai, VN Centre đã xem và duyệt',
    more: 'và {n} mục khác', hours: '{n} giờ', years: '{n} năm', confirmedBy: 'Xác nhận bởi {name}', expires: 'hết hạn {date}',
    'scale.participants': 'Người tham dự', 'scale.schools': 'Trường', 'scale.partners': 'Đối tác', 'scale.teams': 'Đội',
    exported: 'Xuất ngày {date}', code: 'Mã xác thực {code}', none: 'Chưa có mục nào',
    'kind.event': 'Sự kiện', 'kind.project': 'Dự án', 'kind.class': 'Giảng dạy',
  },
  en: {
    'role.coach': 'Coach', 'role.volunteer': 'Volunteer, collaborator', 'role.organizer': 'Organising team',
    'group.coach': 'Coach', 'group.volunteer': 'Volunteer', 'group.collaborator': 'Collaborator', 'group.organizer': 'Organising team',
    identity: 'ID', joined: 'Joined VN Centre on', scan: 'Scan to verify',
    'tile.years': 'Years of experience', 'tile.sessions': 'Sessions taught', 'tile.students': 'Students taught', 'tile.level_ups': 'Student level-ups',
    'tile.events': 'Events joined', 'tile.hours': 'Hours contributed', 'tile.roles': 'Roles held', 'tile.certificates': 'Participation certificates',
    'tile.projects': 'Projects and events', 'tile.participants': 'Attendees', 'tile.schools_partners': 'Schools and partners',
    teaching: 'Teaching history', events: 'Events joined', journey: 'Volunteering journey', skills: 'Recorded skills',
    projects: 'Projects and events', contact: 'Contact', groups: 'Groups', certificates: 'Certificates', studying: 'Study and work',
    featured: 'Featured certificates', position: 'Current position', expertise: 'Expertise', legend: 'Key',
    verified: 'Verified: recorded by the app or confirmed by the person in charge', approved: 'Approved: self-reported, reviewed by VN Centre',
    more: 'and {n} more', hours: '{n} h', years: '{n} years', confirmedBy: 'Confirmed by {name}', expires: 'expires {date}',
    'scale.participants': 'Attendees', 'scale.schools': 'Schools', 'scale.partners': 'Partners', 'scale.teams': 'Teams',
    exported: 'Exported {date}', code: 'Verification code {code}', none: 'Nothing yet',
    'kind.event': 'Event', 'kind.project': 'Project', 'kind.class': 'Teaching',
  },
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
const fmtNum = (v: number | string, lang: Lang) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  const [int, dec] = (Number.isInteger(n) ? String(n) : n.toFixed(1)).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'vi' ? '.' : ',')
  return dec ? `${grouped}${lang === 'vi' ? ',' : '.'}${dec}` : grouped
}
const fmtCode = (c: string) => (c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c)

function hex(lib: Lib, h: string) {
  const n = parseInt(h.replace('#', ''), 16)
  return lib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export async function renderStaffCvPdf(lib: Lib, data: StaffCvData, assets: StaffCvAssets): Promise<{ bytes: Uint8Array; omitted: number }> {
  const lang: Lang = data.lang === 'en' ? 'en' : 'vi'
  const L = (k: string, vars: Record<string, string | number> = {}) =>
    (LABELS[lang][k] ?? k).replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? ''))
  const pick = (o: Record<string, unknown>, base: string) =>
    ((lang === 'en' && (o[`${base}_en`] as string)) || (o[`${base}_vi`] as string) || '') as string

  const doc = await lib.PDFDocument.create()
  doc.registerFontkit(lib.fontkit)
  doc.setTitle(`CV - ${data.person.full_name}`)
  doc.setCreator('VN Centre Golf Passport')
  doc.setSubject(data.verify_url)
  const page = doc.addPage([W, H])

  // Font: tách chữ theo tập Latin / tiếng Việt
  // deno-lint-ignore no-explicit-any
  const fonts = {} as Record<Weight, { pdf: any[]; kit: any[] }>
  for (const w of ['regular', 'semibold', 'bold'] as Weight[]) {
    const [la, vi] = assets.fonts[w]
    fonts[w] = {
      pdf: [await doc.embedFont(la, { subset: true }), await doc.embedFont(vi, { subset: true })],
      kit: [lib.fontkit.create(la), lib.fontkit.create(vi)],
    }
  }
  function runs(text: string, w: Weight) {
    const out: { text: string; i: number }[] = []
    for (const ch of text) {
      const cp = ch.codePointAt(0)!
      const i = fonts[w].kit[0].hasGlyphForCodePoint(cp) || !fonts[w].kit[1].hasGlyphForCodePoint(cp) ? 0 : 1
      if (out.length && out[out.length - 1].i === i) out[out.length - 1].text += ch
      else out.push({ text: ch, i })
    }
    return out
  }
  const width = (text: string, w: Weight, size: number) =>
    runs(text, w).reduce((s, r) => s + fonts[w].pdf[r.i].widthOfTextAtSize(r.text, size), 0)

  /** y là đường chân chữ tính từ mép trên trang */
  function text(t: string, x: number, y: number, size: number, w: Weight, color: string, opts: { align?: 'left' | 'center' | 'right'; maxWidth?: number } = {}) {
    let s = size
    if (opts.maxWidth && width(t, w, s) > opts.maxWidth) s = Math.max(size * 0.6, s * (opts.maxWidth / width(t, w, s)))
    const tw = width(t, w, s)
    let cx = opts.align === 'center' ? x - tw / 2 : opts.align === 'right' ? x - tw : x
    for (const r of runs(t, w)) {
      page.drawText(r.text, { x: cx, y: H - y, size: s, font: fonts[w].pdf[r.i], color: hex(lib, color) })
      cx += fonts[w].pdf[r.i].widthOfTextAtSize(r.text, s)
    }
    return tw
  }
  function wrap(t: string, w: Weight, size: number, maxWidth: number, maxLines = 6): string[] {
    const words = t.replace(/\s+/g, ' ').trim().split(' ')
    const lines: string[] = []
    let cur = ''
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word
      if (width(next, w, size) <= maxWidth || !cur) cur = next
      else { lines.push(cur); cur = word }
    }
    if (cur) lines.push(cur)
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines)
      let last = kept[maxLines - 1]
      while (last && width(`${last}…`, w, size) > maxWidth) last = last.slice(0, -1)
      kept[maxLines - 1] = `${last.trimEnd()}…`
      return kept
    }
    return lines
  }
  const rect = (x: number, y: number, w: number, h: number, fill: string, border?: string) =>
    page.drawRectangle({ x, y: H - y - h, width: w, height: h, color: hex(lib, fill), ...(border ? { borderColor: hex(lib, border), borderWidth: 0.8 } : {}) })

  /** Hai loại dấu khác cả hình lẫn màu (mục 5): chấm navy đặc + tích gold / vòng viền đồng + tích đồng */
  function mark(kind: 'verified' | 'approved', cx: number, cy: number, r = 4.2) {
    const k = r / 10
    const check = kind === 'verified' ? 'M -4.5 0.5 L -1.5 3.5 L 4.5 -3' : 'M -4 0.5 L -1.3 3.2 L 4 -2.5'
    if (kind === 'verified') {
      page.drawCircle({ x: cx, y: H - cy, size: r, color: hex(lib, C.navy) })
      page.drawSvgPath(check, { x: cx, y: H - cy, scale: k, borderColor: hex(lib, C.gold), borderWidth: 2.4 })
    } else {
      page.drawCircle({ x: cx, y: H - cy, size: r * 0.84, borderColor: hex(lib, C.bronze), borderWidth: r * 0.3 })
      page.drawSvgPath(check, { x: cx, y: H - cy, scale: k, borderColor: hex(lib, C.bronze), borderWidth: 2.6 })
    }
  }

  // ── Dải 5 màu giai đoạn Passport ở mép trên
  const stripe = data.stage_colors.length ? data.stage_colors : [C.gold]
  stripe.forEach((c, i) => rect((W / stripe.length) * i, 0, W / stripe.length + 0.5, 6, c))

  // ── Đầu trang navy: ảnh, tên, vai trò, mã định danh, ngày tham gia, QR xác thực
  const HEAD_B = 150
  rect(0, 6, W, HEAD_B - 6, C.navy)
  const ph = 84
  const phX = M, phY = 6 + (HEAD_B - 6 - ph) / 2
  let photoDone = false
  if (assets.photo) {
    try {
      const img = assets.photo[0] === 0x89 ? await doc.embedPng(assets.photo) : await doc.embedJpg(assets.photo)
      rect(phX - 2, phY - 2, ph + 4, ph + 4, C.gold)
      page.drawImage(img, { x: phX, y: H - phY - ph, width: ph, height: ph })
      photoDone = true
    } catch { /* ảnh hỏng thì dùng chữ viết tắt */ }
  }
  if (!photoDone) {
    page.drawCircle({ x: phX + ph / 2, y: H - phY - ph / 2, size: ph / 2, color: hex(lib, '#1c1a4f'), borderColor: hex(lib, C.gold), borderWidth: 2 })
    const initials = data.person.full_name.split(/\s+/).filter(Boolean).slice(-2).map((s) => s[0]?.toUpperCase() ?? '').join('')
    text(initials || '?', phX + ph / 2, phY + ph / 2 + 9, 26, 'bold', C.gold, { align: 'center' })
  }
  const qrBox = 92
  const qrX = W - M - qrBox
  const textX = phX + ph + 18
  const textW = qrX - 16 - textX
  const nameLines = wrap(data.person.full_name, 'bold', 22, textW, 2)
  let hy = 42
  for (const ln of nameLines) { text(ln, textX, hy, 22, 'bold', C.white, { maxWidth: textW }); hy += 25 }
  text(L(`role.${data.cv_type}`), textX, hy, 12, 'semibold', C.gold, { maxWidth: textW })
  hy += 18
  if (data.person.identity_code) { text(`${L('identity')}  ${data.person.identity_code}`, textX, hy, 9, 'regular', C.cream); hy += 13 }
  if (data.person.joined_vncentre_on) text(`${L('joined')} ${fmtDate(data.person.joined_vncentre_on)}`, textX, hy, 9, 'regular', C.cream)

  // QR vector (nét khi in), như chứng nhận
  rect(qrX, 18, qrBox, qrBox, C.white)
  const qr = lib.QRCode.create(data.verify_url, { errorCorrectionLevel: 'M' })
  const n: number = qr.modules.size
  const cell = (qrBox - 10) / n
  for (let r = 0; r < n; r++) {
    let c = 0
    while (c < n) {
      if (!qr.modules.get(r, c)) { c++; continue }
      const s0 = c
      while (c < n && qr.modules.get(r, c)) c++
      page.drawRectangle({ x: qrX + 5 + s0 * cell, y: H - (18 + 5 + (r + 1) * cell), width: (c - s0) * cell + 0.05, height: cell + 0.05, color: hex(lib, C.navy) })
    }
  }
  text(L('scan'), qrX + qrBox / 2, 18 + qrBox + 12, 7.5, 'regular', C.cream, { align: 'center' })
  text(fmtCode(data.verify_code), qrX + qrBox / 2, 18 + qrBox + 23, 8, 'semibold', C.gold, { align: 'center' })

  // ── 4 ô số liệu (ô thiếu nguồn đã bị loại khỏi snapshot, S-R8)
  let top = HEAD_B + 18
  const tiles = data.tiles.slice(0, 4)
  if (tiles.length) {
    const gap = 10
    const tw = (W - 2 * M - gap * 3) / 4
    const offset = ((4 - tiles.length) * (tw + gap)) / 2
    tiles.forEach((t, i) => {
      const x = M + offset + i * (tw + gap)
      rect(x, top, tw, 54, C.white, C.line)
      const v = fmtNum(t.value, lang)
      const vw = text(v, x + 10, top + 24, 18, 'bold', C.navy)
      mark(t.badge, x + 10 + vw + 8, top + 18.5)
      wrap(L(`tile.${t.key}`), 'regular', 8, tw - 20, 2).forEach((ln, j) => text(ln, x + 10, top + 38 + j * 9.5, 8, 'regular', C.muted))
    })
    top += 54 + 20
  }

  // ── Hai cột: nội dung chính bên trái, cột phụ bên phải
  const FOOT = H - 44
  const LIMIT = FOOT - 22
  const LX = M, LW = 340, RX = M + LW + 18, RW = W - M - RX
  rect(RX - 8, top - 6, RW + 8 + M - 12, FOOT - 14 - (top - 6), C.cream)

  function sectionTitle(t: string, x: number, y: number, w: number) {
    text(t, x, y, 11, 'bold', C.navy, { maxWidth: w })
    page.drawLine({ start: { x, y: H - y - 5 }, end: { x: x + 28, y: H - y - 5 }, thickness: 1.6, color: hex(lib, C.bronze) })
    return y + 20
  }

  // Một mục trong cột chính: dấu + tiêu đề + các dòng phụ
  type Line = { text: string; size: number; w: Weight; color: string }
  type Entry = { badge?: 'verified' | 'approved'; title: string; lines: Line[] }
  type Block = { heading?: string; sub?: string; entry?: Entry }
  const entryLines = (e: Entry) => {
    const tl = wrap(e.title, 'semibold', 10, LW - 14, 2)
    const extra = e.lines.flatMap((l) => wrap(l.text, l.w, l.size, LW - 14, 3).map((t) => ({ ...l, text: t })))
    return { tl, extra, h: tl.length * 13 + extra.reduce((s, l) => s + l.size + 3.5, 0) + 7 }
  }
  const metaLine = (parts: (string | null | undefined | false)[]): Line =>
    ({ text: parts.filter(Boolean).join(' · '), size: 8.5, w: 'regular', color: C.muted })
  const dateRange = (e: StaffCvEngagement) =>
    [e.started_on, e.ended_on && e.ended_on !== e.started_on ? e.ended_on : null].filter(Boolean).map((d) => fmtDate(d)).join(' – ')
  const titleOf = (e: StaffCvEngagement) =>
    e.kind === 'event' ? pick(e as unknown as Record<string, unknown>, 'event_name')
      : e.kind === 'class' ? (e.class_name ?? '') : pick(e as unknown as Record<string, unknown>, 'project_name')
  const engagementEntry = (e: StaffCvEngagement, extra: Line[] = []): Entry => ({
    badge: e.badge,
    title: titleOf(e),
    lines: [
      metaLine([pick(e as unknown as Record<string, unknown>, 'position'), e.kind === 'class' && e.school_name, dateRange(e),
        e.hours !== null && e.hours !== undefined && e.hours !== '' && L('hours', { n: fmtNum(e.hours, lang) })]),
      ...extra,
    ].filter((l) => l.text),
  })

  const blocks: Block[] = []
  const eng = data.engagements
  if (data.cv_type === 'coach') {
    const classes = eng.filter((e) => e.kind === 'class')
    const others = eng.filter((e) => e.kind !== 'class')
    blocks.push({ heading: L('teaching') })
    const years = [...new Set(classes.map((e) => e.academic_year ?? ''))]
    for (const y of years) {
      if (y) blocks.push({ sub: y })
      for (const e of classes.filter((c) => (c.academic_year ?? '') === y)) blocks.push({ entry: engagementEntry(e) })
    }
    if (!classes.length) blocks.push({ sub: L('none') })
    if (others.length) {
      blocks.push({ heading: L('events') })
      for (const e of others) blocks.push({ entry: engagementEntry(e) })
    }
  } else if (data.cv_type === 'volunteer') {
    blocks.push({ heading: L('journey') })
    for (const e of eng) blocks.push({ entry: engagementEntry(e) })
    if (!eng.length) blocks.push({ sub: L('none') })
  } else {
    blocks.push({ heading: L('projects') })
    for (const e of eng.filter((x) => x.kind !== 'class')) {
      const sc = e.scale ?? {}
      const scale = ['participants', 'schools', 'partners', 'teams']
        .filter((k) => sc[k] !== undefined && sc[k] !== null && sc[k] !== '')
        .map((k) => `${L(`scale.${k}`)} ${fmtNum(sc[k] as number, lang)}`).join(' · ')
      const outcome = pick(e as unknown as Record<string, unknown>, 'outcome')
      blocks.push({
        entry: engagementEntry(e, [
          ...(scale ? [{ text: scale, size: 8.5, w: 'semibold' as Weight, color: C.brown }] : []),
          ...(outcome ? [{ text: outcome, size: 8.5, w: 'regular' as Weight, color: C.navy }] : []),
          ...(e.badge === 'verified' && e.confirmed_by_name ? [{ text: L('confirmedBy', { name: e.confirmed_by_name }), size: 8, w: 'regular' as Weight, color: C.muted }] : []),
        ]),
      })
    }
    if (!eng.some((x) => x.kind !== 'class')) blocks.push({ sub: L('none') })
  }
  // TNV: kỹ năng kèm số lần, đặt sau hành trình
  const skillChips = data.cv_type === 'volunteer' && data.skills.length
    ? data.skills.map((s) => `${lang === 'en' ? s.name_en : s.name_vi} × ${s.count}`) : []

  // Vẽ cột chính, dừng khi hết trang; mục còn lại → "và N mục khác"
  let y = top + 8
  let omitted = 0
  const chipsH = skillChips.length ? 20 + Math.ceil(skillChips.length / 2) * 20 + 6 : 0
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const reserve = chipsH + 16
    if (b.heading) {
      if (y + 40 > LIMIT - reserve) { omitted += blocks.slice(i).filter((x) => x.entry).length; break }
      y = sectionTitle(b.heading, LX, y + (i ? 6 : 0), LW)
    } else if (b.sub) {
      if (y + 30 > LIMIT - reserve) { omitted += blocks.slice(i).filter((x) => x.entry).length; break }
      text(b.sub, LX, y + 2, 9, 'semibold', C.bronze)
      y += 15
    } else if (b.entry) {
      const m = entryLines(b.entry)
      if (y + m.h > LIMIT - reserve) { omitted += blocks.slice(i).filter((x) => x.entry).length; break }
      if (b.entry.badge) mark(b.entry.badge, LX + 4.2, y - 3.2)
      let ly = y
      for (const t of m.tl) { text(t, LX + 14, ly, 10, 'semibold', C.navy); ly += 13 }
      for (const l of m.extra) { ly += 0.5; text(l.text, LX + 14, ly, l.size, l.w, l.color); ly += l.size + 3 }
      y = ly + 7
    }
  }
  if (omitted > 0) {
    text(L('more', { n: omitted }), LX + 14, y + 2, 9, 'semibold', C.bronze)
    y += 18
  }
  if (skillChips.length) {
    y = sectionTitle(L('skills'), LX, y + 6, LW)
    const cw = (LW - 8) / 2
    skillChips.forEach((s, i) => {
      const cx = LX + (i % 2) * (cw + 8)
      const cy = y + Math.floor(i / 2) * 20
      rect(cx, cy - 11, cw, 16, C.cream, C.line)
      text(s, cx + 7, cy, 8.5, 'semibold', C.navy, { maxWidth: cw - 14 })
    })
  }

  // ── Cột phụ
  let ry = top + 8
  const rLimit = FOOT - 18
  function side(heading: string, items: { title: string; sub?: string; badge?: 'verified' | 'approved' }[]) {
    if (!items.length || ry + 40 > rLimit) return
    ry = sectionTitle(heading, RX, ry, RW)
    for (const it of items) {
      const tl = wrap(it.title, 'semibold', 8.5, RW - (it.badge ? 12 : 0), 2)
      const sl = it.sub ? wrap(it.sub, 'regular', 7.5, RW - (it.badge ? 12 : 0), 2) : []
      const h = tl.length * 11 + sl.length * 10 + 5
      if (ry + h > rLimit) break
      const ix = RX + (it.badge ? 12 : 0)
      if (it.badge) mark(it.badge, RX + 3.6, ry - 3, 3.6)
      for (const t of tl) { text(t, ix, ry, 8.5, 'semibold', C.navy); ry += 11 }
      for (const t of sl) { text(t, ix, ry, 7.5, 'regular', C.muted); ry += 10 }
      ry += 5
    }
    ry += 8
  }
  const contact = data.person.contact
  if (contact && (contact.phone || contact.email)) {
    side(L('contact'), [contact.phone, contact.email].filter(Boolean).map((c) => ({ title: String(c) })))
  }
  const credTitle = (c: StaffCvCredential) => pick(c as unknown as Record<string, unknown>, 'title')
  const certs = data.credentials.filter((c) => c.type === 'certificate').map((c) => ({
    title: credTitle(c), badge: 'approved' as const,
    sub: [c.issuer, fmtDate(c.issued_on), c.expires_on && L('expires', { date: fmtDate(c.expires_on) })].filter(Boolean).join(' · '),
  }))
  if (data.cv_type === 'coach') {
    side(L('groups'), data.groups.map((g) => ({ title: L(`group.${g}`) })))
    side(L('certificates'), certs)
  } else if (data.cv_type === 'volunteer') {
    side(L('studying'), data.credentials.filter((c) => c.type === 'prior_experience').map((c) => ({
      title: credTitle(c), badge: 'approved' as const,
      sub: [c.issuer, c.years !== null && c.years !== undefined && c.years !== '' && L('years', { n: fmtNum(c.years, lang) })].filter(Boolean).join(' · '),
    })))
    side(L('featured'), certs)
  } else {
    const pos = data.person.current_position
    const posText = pos ? ((lang === 'en' && pos.en) || pos.vi || '') : ''
    if (posText) side(L('position'), [{ title: posText }])
    side(L('expertise'), data.skills.map((s) => ({ title: `${lang === 'en' ? s.name_en : s.name_vi} × ${s.count}` })))
  }
  // Chú thích hai loại dấu
  if (ry + 50 < rLimit) {
    ry = sectionTitle(L('legend'), RX, ry, RW)
    for (const k of ['verified', 'approved'] as const) {
      mark(k, RX + 3.6, ry - 3, 3.6)
      for (const t of wrap(L(k), 'regular', 7.5, RW - 12, 3)) { text(t, RX + 12, ry, 7.5, 'regular', C.muted); ry += 10 }
      ry += 4
    }
  }

  // ── Chân trang
  page.drawLine({ start: { x: M, y: H - FOOT }, end: { x: W - M, y: H - FOOT }, thickness: 0.6, color: hex(lib, C.line) })
  text(`${L('exported', { date: fmtDate(data.exported_at) })} · app.vncentre.net`, M, FOOT + 16, 8, 'regular', C.muted)
  text(L('code', { code: fmtCode(data.verify_code) }), W - M, FOOT + 16, 8, 'semibold', C.navy, { align: 'right' })

  return { bytes: await doc.save({ useObjectStreams: true }), omitted }
}
