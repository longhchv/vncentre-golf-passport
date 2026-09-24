import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

import pkg from './package.json' with { type: 'json' }

// Cloudflare tự đặt mã commit khi build (Workers Builds hoặc Pages)
const commit = (process.env.WORKERS_CI_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA)?.slice(0, 7)
const appVersion = commit ? `${pkg.version}+${commit}` : pkg.version

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'VN Centre Golf Passport',
        short_name: 'Golf Passport',
        description: 'Hồ sơ golf chính thức của học viên VN Centre',
        lang: 'vi',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#080634',
        background_color: '#080634',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Chỉ lưu sẵn phần lõi; các gói lớn của admin (Excel, PDF, camera) lưu khi dùng lần đầu
        globPatterns: ['**/*.{css,html,ico,png,svg,woff2,webmanifest}', 'assets/index-*.js', 'mascot-256.webp'],
        // Font của chứng nhận chỉ tải khi mở chứng nhận
        globIgnores: ['**/noto-serif-*', '**/great-vibes-*', '**/montserrat-*', 'cert/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js'),
            handler: 'CacheFirst',
            options: { cacheName: 'js-chunks', expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && (/\.woff2$/.test(url.pathname) || url.pathname.startsWith('/cert/')),
            handler: 'CacheFirst',
            options: { cacheName: 'cert-assets', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 180 } },
          },
        ],
        navigateFallback: '/index.html',
        // Không cache API Supabase: dữ liệu học viên luôn lấy mới
        navigateFallbackDenylist: [/^\/functions\//],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
  },
})
