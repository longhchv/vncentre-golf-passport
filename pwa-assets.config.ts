import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Sinh biểu tượng app từ public/logo.png. Chạy: npm run icons
// Logo: bìa sổ Golf Passport bản in (logo R&A – VGA Junior Golf + ô PASSPORT, nền navy #181e42), ghép lại thành hình vuông.
// Linh vật rồng giữ nguyên ở Mascot (ảnh đại diện khi chưa có ảnh, màn kích hoạt…).
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.2, resizeOptions: { background: '#181e42' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#181e42' } },
  },
  images: ['public/logo.png'],
})
