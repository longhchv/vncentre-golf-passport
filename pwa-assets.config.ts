import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Sinh biểu tượng app từ public/logo.svg. Chạy: npm run icons
// Logo hiện là bản tạm; thay bằng linh vật rồng khi có file PNG/SVG gốc (phụ lục D, D2).
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#080634' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#080634' } },
  },
  images: ['public/logo.svg'],
})
