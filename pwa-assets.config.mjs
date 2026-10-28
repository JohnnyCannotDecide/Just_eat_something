import { defineConfig } from '@vite-pwa/assets-generator/config'

/**
 * PWA 图标生成规则，源文件是 public/favicon.svg。
 *
 * - transparent：桌面浏览器 / Android 启动器用的常规图标
 * - maskable：Android 会套圆形遮罩，图案收进中央安全区，底色铺满
 * - apple：iOS 的 apple-touch-icon，不接受透明，必须垫满底色
 */
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
      padding: 0,
      resizeOptions: { background: '#FFF6E8' },
    },
    maskable: {
      sizes: [512],
      padding: 0.1,
      resizeOptions: { background: '#FFF6E8' },
    },
    apple: {
      sizes: [180],
      padding: 0,
      resizeOptions: { background: '#FFF6E8' },
    },
  },
})
