// Định dạng mã theo 01-du-lieu.md mục 2. Việc SINH mã làm trong CSDL (public.random_code),
// ở đây chỉ chuẩn hoá và kiểm tra mã người dùng gõ vào.

export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export type CodeKind = 'passport' | 'claim' | 'class' | 'verify'

export const CODE_LENGTH: Record<CodeKind, number> = {
  passport: 8,
  claim: 8,
  class: 6,
  verify: 10,
}

/** In hoa, bỏ dấu gạch và khoảng trắng. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s\-‐–—_.]/g, '')
}

export type CodeCheck =
  | { ok: true; code: string }
  | { ok: false; reason: 'empty' | 'invalid_chars' | 'wrong_length'; code: string }

/**
 * Kiểm tra mã: ký tự 0, 1, I, O (và mọi ký tự ngoài bảng chữ) → invalid_chars, để hiện câu
 * "Mã không hợp lệ. Lưu ý mã không có số 0, số 1, chữ I và chữ O."
 */
export function checkCode(input: string, kind: CodeKind): CodeCheck {
  const code = normalizeCode(input)
  if (!code) return { ok: false, reason: 'empty', code }
  if ([...code].some((c) => !CODE_ALPHABET.includes(c))) return { ok: false, reason: 'invalid_chars', code }
  if (code.length !== CODE_LENGTH[kind]) return { ok: false, reason: 'wrong_length', code }
  return { ok: true, code }
}

/** Hiển thị mã sổ/mã kích hoạt dạng XXXX-XXXX. */
export function formatCode(code: string): string {
  const c = normalizeCode(code)
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

/** Mã học viên: VNC- + 6 chữ số. */
export function isStudentCode(input: string): boolean {
  return /^VNC-?\d{6}$/i.test(input.trim())
}
