// Chuẩn hoá một dòng file danh sách học sinh (phụ lục A1, F10 bước 3–4).
// Hàm thuần, không phụ thuộc giao diện → có kiểm thử trong normalize.test.ts.

export type RowStatus = 'ok' | 'warning' | 'error'

export type MessageCode =
  | 'missing_name'
  | 'invalid_dob'
  | 'missing_dob'
  | 'dob_out_of_range'
  | 'missing_phone'
  | 'invalid_phone'
  | 'invalid_email'
  | 'unknown_school'
  | 'duplicate_in_file'

export interface RowMessage {
  code: MessageCode | 'duplicate_existing'
  params?: Record<string, string | number>
}

/** Giá trị ô như SheetJS đọc ra (raw): chữ, số (ngày dạng số seri của Excel) hoặc trống. */
export type Cell = string | number | boolean | null | undefined

export interface RawStudentRow {
  full_name: Cell
  date_of_birth: Cell
  school: Cell
  grade_class: Cell
  contact_name: Cell
  contact_phone: Cell
  contact_email: Cell
}

export interface NormalizedStudentRow {
  full_name: string | null
  date_of_birth: string | null // yyyy-mm-dd
  school_text: string | null
  school_id: string | null
  grade_class: string | null
  contact_name: string | null
  contact_phone: string | null // E.164
  contact_email: string | null
}

export interface NormalizeResult {
  normalized: NormalizedStudentRow
  status: RowStatus
  messages: RowMessage[]
}

const text = (c: Cell): string => (c === null || c === undefined ? '' : String(c)).replace(/\s+/g, ' ').trim()

/** "NGÔ   TÚ anh" → "Ngô Tú Anh" (viết hoa chữ cái đầu mỗi từ, kể cả tiếng Việt). */
export function titleCaseName(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) =>
      w
        .split('-')
        .map((p) => (p ? p.charAt(0).toLocaleUpperCase('vi') + p.slice(1).toLocaleLowerCase('vi') : p))
        .join('-'),
    )
    .join(' ')
}

/** Ngày seri của Excel (1900 date system) → yyyy-mm-dd. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  const ms = Math.round((serial - 25569) * 86400 * 1000) // 25569 = số ngày từ 1899-12-30 đến 1970-01-01
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Nhận dd/mm/yyyy, d/m/yyyy (cả dấu - hoặc .), yyyy-mm-dd, hoặc ô kiểu ngày của Excel (số seri).
 * Trả undefined nếu ô trống, null nếu sai định dạng.
 */
export function parseDob(c: Cell): string | null | undefined {
  if (typeof c === 'number') return excelSerialToIso(c)
  const s = text(c)
  if (!s) return undefined
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1]))
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]))
  if (/^\d{5}$/.test(s)) return excelSerialToIso(Number(s))
  return null
}

/**
 * Bỏ dấu cách, chấm, gạch, ngoặc; 0xxx → +84xxx; 84xxx (không dấu +) → +84xxx.
 * Trả undefined nếu trống, null nếu không hợp lệ.
 */
export function normalizePhone(c: Cell): string | null | undefined {
  let s = text(c)
  if (!s) return undefined
  s = s.replace(/[\s.\-()]/g, '')
  // Excel có thể làm mất số 0 đầu: 912345678 → coi là số VN
  if (/^\d{9}$/.test(s) && /^[35789]/.test(s)) s = '0' + s
  if (/^0\d{9,10}$/.test(s)) return '+84' + s.slice(1)
  if (/^84\d{9,10}$/.test(s)) return '+' + s
  if (/^00\d{8,15}$/.test(s)) s = '+' + s.slice(2)
  if (/^\+84\d{9,10}$/.test(s)) return s
  if (/^\+[1-9]\d{6,14}$/.test(s)) return s
  return null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeEmail(c: Cell): string | null | undefined {
  const s = text(c).toLowerCase()
  if (!s) return undefined
  return EMAIL_RE.test(s) ? s : null
}

/** Tên chuẩn hoá để so trùng (khớp public.normalize_name trong CSDL). */
export function normalizeForMatch(s: string): string {
  return s
    .replace(/[đĐ]/g, (ch) => (ch === 'đ' ? 'd' : 'D'))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export interface SchoolRef {
  id: string
  name: string
  short_name: string | null
}

export function matchSchool(textValue: string, schools: SchoolRef[]): SchoolRef | undefined {
  const key = normalizeForMatch(textValue)
  return schools.find((s) => normalizeForMatch(s.name) === key || (s.short_name && normalizeForMatch(s.short_name) === key))
}

export function normalizeStudentRow(
  raw: RawStudentRow,
  ctx: { selectedSchoolId: string; schools: SchoolRef[]; today?: Date },
): NormalizeResult {
  const messages: RowMessage[] = []
  const today = ctx.today ?? new Date()

  const nameText = text(raw.full_name)
  const full_name = nameText ? titleCaseName(nameText) : null
  if (!full_name) messages.push({ code: 'missing_name' })

  const dob = parseDob(raw.date_of_birth)
  if (dob === null) messages.push({ code: 'invalid_dob', params: { value: text(raw.date_of_birth) } })
  else if (dob === undefined) messages.push({ code: 'missing_dob' })
  else {
    const age = (today.getTime() - Date.parse(dob)) / (365.25 * 86400000)
    if (age < 2 || age > 30) messages.push({ code: 'dob_out_of_range', params: { value: dob } })
  }

  // Cột Trường: trống → trường đã chọn; có chữ → khớp với danh sách trường, không khớp thì dùng trường đã chọn và cảnh báo
  const school_text = text(raw.school) || null
  let school_id = ctx.selectedSchoolId
  if (school_text) {
    const found = matchSchool(school_text, ctx.schools)
    if (found) school_id = found.id
    else messages.push({ code: 'unknown_school', params: { value: school_text } })
  }

  const phone = normalizePhone(raw.contact_phone)
  if (phone === null) messages.push({ code: 'invalid_phone', params: { value: text(raw.contact_phone) } })
  else if (phone === undefined) messages.push({ code: 'missing_phone' })

  const email = normalizeEmail(raw.contact_email)
  if (email === null) messages.push({ code: 'invalid_email', params: { value: text(raw.contact_email) } })

  const contactName = text(raw.contact_name)

  const isError = messages.some((m) => m.code === 'missing_name' || m.code === 'invalid_dob')
  return {
    normalized: {
      full_name,
      date_of_birth: typeof dob === 'string' ? dob : null,
      school_text,
      school_id,
      grade_class: text(raw.grade_class) || null,
      contact_name: contactName ? titleCaseName(contactName) : null,
      contact_phone: typeof phone === 'string' ? phone : null,
      contact_email: typeof email === 'string' ? email : null,
    },
    status: isError ? 'error' : messages.length ? 'warning' : 'ok',
    messages,
  }
}

/** Đánh dấu dòng trùng nhau ngay trong file (cùng tên chuẩn hoá + cùng ngày sinh). */
export function markInFileDuplicates(rows: NormalizeResult[]): void {
  const seen = new Map<string, number>()
  rows.forEach((r, i) => {
    if (r.status === 'error' || !r.normalized.full_name) return
    const key = `${normalizeForMatch(r.normalized.full_name)}|${r.normalized.date_of_birth ?? ''}|${r.normalized.school_id}`
    const first = seen.get(key)
    if (first === undefined) {
      seen.set(key, i)
    } else {
      r.messages.push({ code: 'duplicate_in_file', params: { row: first + 2 } })
      if (r.status === 'ok') r.status = 'warning'
    }
  })
}

/** Cột A–G của file mẫu (phụ lục A1). */
export const STUDENT_LIST_COLUMNS: (keyof RawStudentRow)[] = [
  'full_name',
  'date_of_birth',
  'school',
  'grade_class',
  'contact_name',
  'contact_phone',
  'contact_email',
]

// ---------------------------------------------------------------------------
// Lịch sử khoá học (phụ lục A2): A Họ tên · B Ngày sinh · C Trường · D Lớp · E Năm học · F Khoá học · G Level đạt
// ---------------------------------------------------------------------------

export interface RawHistoryRow {
  full_name: Cell
  date_of_birth: Cell
  school: Cell
  grade_class: Cell
  academic_year: Cell
  course_name: Cell
  level: Cell
}

export interface NormalizedHistoryRow {
  full_name: string | null
  date_of_birth: string | null
  school_text: string | null
  school_id: string | null
  grade_class: string | null
  academic_year: string | null
  course_name: string | null
  level_number: number | null
}

export type HistoryMessageCode = MessageCode | 'invalid_year' | 'missing_course' | 'invalid_level'

export const HISTORY_COLUMNS: (keyof RawHistoryRow)[] = [
  'full_name',
  'date_of_birth',
  'school',
  'grade_class',
  'academic_year',
  'course_name',
  'level',
]

/** "2024-2025", "2024 – 2025", "2024/2025" → "2024-2025" (hai năm liền nhau). */
export function parseAcademicYear(c: Cell): string | null {
  const m = text(c).match(/^(\d{4})\s*[-–—/]\s*(\d{4})$/)
  if (!m) return null
  return Number(m[2]) === Number(m[1]) + 1 ? `${m[1]}-${m[2]}` : null
}

export function normalizeHistoryRow(
  raw: RawHistoryRow,
  ctx: { selectedSchoolId: string; schools: SchoolRef[] },
): { normalized: NormalizedHistoryRow; status: RowStatus; messages: { code: HistoryMessageCode; params?: Record<string, string | number> }[] } {
  const messages: { code: HistoryMessageCode; params?: Record<string, string | number> }[] = []
  const nameText = text(raw.full_name)
  const full_name = nameText ? titleCaseName(nameText) : null
  if (!full_name) messages.push({ code: 'missing_name' })

  const dob = parseDob(raw.date_of_birth)
  if (dob === null) messages.push({ code: 'invalid_dob', params: { value: text(raw.date_of_birth) } })
  else if (dob === undefined) messages.push({ code: 'missing_dob' })

  const school_text = text(raw.school) || null
  let school_id: string | null = ctx.selectedSchoolId || null
  if (school_text) {
    const found = matchSchool(school_text, ctx.schools)
    if (found) school_id = found.id
    else messages.push({ code: 'unknown_school', params: { value: school_text } })
  }

  const academic_year = parseAcademicYear(raw.academic_year)
  if (!academic_year) messages.push({ code: 'invalid_year', params: { value: text(raw.academic_year) } })
  const course_name = text(raw.course_name) || null
  if (!course_name) messages.push({ code: 'missing_course' })

  let level_number: number | null = null
  const levelText = text(raw.level)
  if (levelText) {
    const n = Number(levelText)
    if (Number.isInteger(n) && n >= 1 && n <= 20) level_number = n
    else messages.push({ code: 'invalid_level', params: { value: levelText } })
  }

  const errorCodes: HistoryMessageCode[] = ['missing_name', 'invalid_dob', 'invalid_year', 'missing_course', 'invalid_level']
  const isError = messages.some((m) => errorCodes.includes(m.code))
  return {
    normalized: {
      full_name,
      date_of_birth: typeof dob === 'string' ? dob : null,
      school_text,
      school_id,
      grade_class: text(raw.grade_class) || null,
      academic_year,
      course_name,
      level_number,
    },
    status: isError ? 'error' : messages.length ? 'warning' : 'ok',
    messages,
  }
}
