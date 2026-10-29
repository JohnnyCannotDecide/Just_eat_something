import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * API 集成测试会启动本地 `wrangler pages dev` 与本地 D1，
 * 因此单独配置、串行执行；`npm test` 不会包含这些用例。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['scripts/**/*.api.test.mjs'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
})
