// Service worker app Handicap (hdcp.vncentre.net) · Minh · 26/11/2026
// - Lưu sẵn khung app để mở nhanh và mở được khi mạng chập chờn (luôn ưu tiên bản mới trên mạng).
// - Không chạm vào yêu cầu tới máy chủ dữ liệu (Supabase) hay font: chỉ file cùng tên miền.
// - Nhận thông báo đẩy (Web Push) và mở app khi bấm vào thông báo.
const CACHE = 'hdcp-v2';
const SHELL = ['./', 'index.html', 'golf3d.js', 'i18n-more.js', 'plus-i18n.js', 'plus.js', 'app2-i18n.js', 'app2.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Mạng trước, bộ nhớ đệm sau (chỉ GET cùng tên miền)
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Handicap', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Handicap', {
    body: d.body || '', tag: d.tag, icon: 'icons/icon-192.png', badge: 'icons/badge-72.png', data: { url: d.url || './#toi/att' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.location.href).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.startsWith(self.location.origin)) { w.focus(); return w.navigate ? w.navigate(url) : null; }
    return self.clients.openWindow(url);
  }));
});
