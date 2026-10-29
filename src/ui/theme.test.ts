import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { THEME_IDS } from '@/config/gameConfig'

import {
  THEME_NAMES,
  THEME_OPTIONS,
  applyTheme,
  getThemeOption,
} from './theme'

function installMetas() {
  const theme = document.createElement('meta')
  theme.name = 'theme-color'
  theme.content = '#FFF6E8'
  const scheme = document.createElement('meta')
  scheme.name = 'color-scheme'
  scheme.content = 'light'
  document.head.append(theme, scheme)
}

beforeEach(() => {
  installMetas()
})

afterEach(() => {
  document.head.innerHTML = ''
  delete document.documentElement.dataset.theme
})

describe('theme options', () => {
  it('covers exactly the supported themes in display order', () => {
    expect(THEME_NAMES).toBe(THEME_IDS)
    expect(THEME_OPTIONS.map((option) => option.id)).toEqual([
      'simple',
      'cute',
      'vivid',
    ])
  })

  it('falls back to cute for unknown lookups', () => {
    expect(getThemeOption('cute').themeColor).toBe('#FFF6E8')
    expect(
      getThemeOption('midnight' as Parameters<typeof getThemeOption>[0]).id,
    ).toBe('cute')
  })
})

describe('applyTheme', () => {
  it.each([
    ['simple', '#F4F6F8', 'light'],
    ['cute', '#FFF6E8', 'light'],
    ['vivid', '#150D24', 'dark'],
  ] as const)(
    'applies %s to the document root and PWA metas',
    (theme, themeColor, colorScheme) => {
      applyTheme(theme)

      expect(document.documentElement.dataset.theme).toBe(theme)
      expect(
        document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
          ?.content,
      ).toBe(themeColor)
      expect(
        document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
          ?.content,
      ).toBe(colorScheme)
    },
  )

  it('does not throw when the metas are missing', () => {
    document.head.innerHTML = ''

    expect(() => applyTheme('vivid')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('vivid')
  })
})
