import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // 存储适配器测试要用浏览器 localStorage，后续 UI 测试也可复用。
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      // 开发工具测试用 .mjs，避免 Node API 进入应用的 tsconfig。
      'scripts/**/*.{test,spec}.mjs',
    ],
  },
})
