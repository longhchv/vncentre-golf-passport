/**
 * Giao diện màu: "passport" (màu Golf Passport, mặc định) hoặc "vnc" (tuỳ chọn theo website mới VN Centre: nâu đậm + vàng logo).
 * Lưu trên máy người dùng; index.html đặt sẵn data-theme trước khi tải app để không nháy màu.
 */
export type Theme = 'vnc' | 'passport'
export const THEMES: Theme[] = ['passport', 'vnc']
const KEY = 'gp-theme'
const BAR: Record<Theme, string> = { vnc: '#3a1f0c', passport: '#080634' }

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'vnc' ? 'vnc' : 'passport'
  } catch {
    return 'passport'
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme])
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* trình duyệt chặn lưu: vẫn đổi màu cho lần mở này */
  }
  applyTheme(theme)
}
