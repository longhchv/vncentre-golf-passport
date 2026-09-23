import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import vi from './vi.json'
import en from './en.json'

export const LANGUAGES = ['vi', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

const STORAGE_KEY = 'lang'

// Trước khi đăng nhập: nhớ lựa chọn trên máy; chưa chọn thì theo ngôn ngữ trình duyệt.
// Sau khi đăng nhập (bước sau): lấy profiles.preferred_language.
export function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'vi' || saved === 'en') return saved
  } catch {
    // localStorage có thể bị chặn (chế độ riêng tư)
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language : 'vi'
  return browser.toLowerCase().startsWith('vi') ? 'vi' : 'en'
}

export function setLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // bỏ qua
  }
  document.documentElement.lang = lang
  return i18n.changeLanguage(lang)
}

const initial = detectLanguage()
document.documentElement.lang = initial

i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en } },
  lng: initial,
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
})

export default i18n
