import { THEME_IDS, type ThemeName } from '@/config/gameConfig'

export interface ThemeOption {
  id: ThemeName
  label: string
  description: string
  /** 浏览器地址栏 / PWA 状态栏颜色。 */
  themeColor: string
  colorScheme: 'light' | 'dark'
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: 'simple',
    label: '简洁',
    description: '白底细线，少装饰',
    themeColor: '#F4F6F8',
    colorScheme: 'light',
  },
  {
    id: 'cute',
    label: '可爱',
    description: '奶油暖色，圆角手帐',
    themeColor: '#FFF6E8',
    colorScheme: 'light',
  },
  {
    id: 'vivid',
    label: '炫彩',
    description: '深色霓虹，稀有度光效',
    themeColor: '#150D24',
    colorScheme: 'dark',
  },
]

export function getThemeOption(theme: ThemeName): ThemeOption {
  return (
    THEME_OPTIONS.find((option) => option.id === theme) ?? THEME_OPTIONS[1]!
  )
}

function setMetaContent(name: string, content: string): void {
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (meta) {
    meta.content = content
  }
}

/** 把主题应用到文档根节点，并同步 PWA theme-color / color-scheme。 */
export function applyTheme(theme: ThemeName): void {
  if (typeof document === 'undefined') {
    return
  }

  const option = getThemeOption(theme)
  document.documentElement.dataset.theme = option.id
  setMetaContent('theme-color', option.themeColor)
  setMetaContent('color-scheme', option.colorScheme)
}

/** 供测试与首屏脚本对齐：所有合法主题 ID。 */
export const THEME_NAMES = THEME_IDS
