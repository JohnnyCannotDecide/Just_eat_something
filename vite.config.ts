import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // 固定端口：localStorage 按 origin 隔离，端口漂移会让用户以为数据丢了。
  // 不要设置 host，`localhost` 与 `127.0.0.1` 也是不同 origin。
  server: {
    port: 5173,
    strictPort: true,
    // 仅开发：把 /api 转给本地 Pages Functions（先 npm run build + npm run dev:pages）。
    // 生产部署时前端与 Functions 同源，不需要代理。
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
  preview: { port: 4173, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      // 个人自用，新版本直接接管，不弹「请手动刷新」
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // public/ 里没进 manifest.icons 的图标单独点名；
      // manifest 引用的图标由插件自动加入预缓存，避免重复。
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: '便当手帐 · 每日抽卡饮食打卡',
        short_name: '便当手帐',
        description: '每日三餐抽卡决定吃什么，打卡收集 94 道可爱菜品印章。',
        lang: 'zh-CN',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // 静态回退：安装 / 首屏时用可爱的纸色；运行时由
        // meta[name="theme-color"] 跟随 settings.theme 更新。
        background_color: '#FFF6E8',
        theme_color: '#FFF6E8',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 只预缓存应用外壳；图片走运行时缓存，避免没有图片时出现空 glob 警告。
        globPatterns: ['**/*.{js,css,html}'],
        // Workbox 默认 2 MiB，大图会被静默漏掉。
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/images\/.*\.(?:png|jpe?g|webp|svg|avif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'diet-diary-images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      // 开发期不启用 SW；离线能力用 build + preview 验证。
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
