/**
 * Tự tải bản mới sau mỗi lần phát hành (anh Long chốt 27/11/2026).
 * Bản cũ còn trong bộ nhớ đệm (service worker) không biết trang mới → hiện "Sắp ra mắt" cho tới khi tải lại.
 * Cách làm: build ghi /version.json; app so phiên bản khi chuyển trang (tối đa mỗi phút một lần), khi gặp trang "Sắp ra mắt"
 * và khi không tải được một phần code. Có bản mới thì cập nhật service worker rồi tải lại — chỉ vào lúc chuyển trang,
 * không tải lại giữa chừng khi người dùng đang nhập.
 */
import { registerSW } from 'virtual:pwa-register'

let registration: ServiceWorkerRegistration | undefined
let lastCheck = 0
let reloading = false

function reloadOnce(tag: string) {
  if (reloading) return
  const key = `gp-reload-${tag}`
  try {
    if (sessionStorage.getItem(key)) return // đã thử tải lại cho phiên bản này, tránh vòng lặp
    sessionStorage.setItem(key, String(Date.now()))
  } catch { /* trình duyệt chặn bộ nhớ: vẫn tải lại một lần */ }
  reloading = true
  // Có service worker: cập nhật trước, bản mới nhận quyền điều khiển thì trang tự tải lại (autoUpdate).
  // Dự phòng: sau vài giây vẫn chưa tải lại thì tự tải.
  registration?.update().catch(() => {})
  window.setTimeout(() => window.location.reload(), registration ? 4000 : 0)
}

/** So phiên bản đang chạy với /version.json trên máy chủ. force = bỏ qua giới hạn mỗi phút một lần. */
export async function checkForNewVersion(force = false) {
  if (import.meta.env.DEV) return
  const now = Date.now()
  if (!force && now - lastCheck < 60_000) return
  lastCheck = now
  try {
    const res = await fetch(`/version.json?t=${now}`, { cache: 'no-store' })
    if (!res.ok) return
    const { version } = (await res.json()) as { version?: string }
    if (version && version !== __APP_VERSION__) reloadOnce(version)
  } catch { /* mất mạng: bỏ qua */ }
}

/** Không tải được phần code của một trang (thường do vừa phát hành bản mới): cập nhật rồi tải lại một lần cho mỗi phiên bản. */
export function recoverFromStaleBundle() {
  reloadOnce(`chunk-${__APP_VERSION__}`)
}

export function startAppUpdates(router: { subscribe: (fn: (s: { navigation: { state: string }; location: { pathname: string } }) => void) => unknown }) {
  // PWA: có bản mới thì kích hoạt và tải lại trang ngay khi mở app
  registerSW({ immediate: true, onRegisteredSW: (_url, r) => { registration = r } })
  // Không tải được một phần code (thường do vừa phát hành bản mới)
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault()
    recoverFromStaleBundle()
  })
  let path = window.location.pathname
  router.subscribe((s) => {
    if (s.navigation.state === 'idle' && s.location.pathname !== path) {
      path = s.location.pathname
      void checkForNewVersion()
    }
  })
}
