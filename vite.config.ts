import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
        description: '每日三餐抽卡决定吃什么，打卡收集 60 道可爱菜品印章。',
        lang: 'zh-CN',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
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
