/// <reference types="node" />

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { RARITY_ORDER, STAMP_TIERS, THEME_IDS } from '@/config/gameConfig'

import { THEME_OPTIONS } from '../theme'

const read = (file: string) => readFileSync(file, 'utf8')

const stylePath = (file: string) => `src/ui/styles/${file}`

const css = {
  global: read(stylePath('global.css')),
  tokens: read(stylePath('tokens.css')),
  themes: read(stylePath('themes.css')),
  base: read(stylePath('base.css')),
  today: read(stylePath('today.css')),
  onboarding: read(stylePath('onboarding.css')),
  pages: read(stylePath('pages.css')),
  calendar: read(stylePath('calendar.css')),
  gameplay: read(stylePath('gameplay.css')),
  stamp: read(stylePath('stamp.css')),
}

const componentCss = [
  ['base.css', css.base],
  ['today.css', css.today],
  ['onboarding.css', css.onboarding],
  ['pages.css', css.pages],
  ['calendar.css', css.calendar],
  ['gameplay.css', css.gameplay],
  ['stamp.css', css.stamp],
  ['themes.css', css.themes],
] as const

/** 只读取某个选择器规则块的声明；主题块都以顶格的 } 结束。 */
function declarations(text: string, start: number): Record<string, string> {
  const end = text.indexOf('\n}', start)
  const body = text.slice(start, end)
  const result: Record<string, string> = {}
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    result[match[1]!] = match[2]!.trim()
  }
  return result
}

function themeDeclarations(theme: string): Record<string, string> {
  const marker =
    theme === 'cute'
      ? ":root:not([data-theme]),\n[data-theme='cute'] {"
      : `[data-theme='${theme}'] {`
  const start = css.tokens.indexOf(marker)
  expect(start, `missing theme block: ${theme}`).toBeGreaterThanOrEqual(0)
  return declarations(css.tokens, start)
}

function rootDeclarations(): Record<string, string> {
  return declarations(css.tokens, css.tokens.indexOf(':root {'))
}

const requiredThemeTokens = [
  // 表面
  'surface-page',
  'surface-app',
  'surface-card',
  'surface-bright',
  'surface-raised',
  'surface-soft',
  'surface-sheet',
  'surface-modal',
  'surface-toast',
  'surface-sunken',
  'surface-bento-start',
  'surface-bento-end',
  'surface-draw-start',
  'surface-draw-end',
  // 文本
  'text-strong',
  'text-muted',
  'text-faint',
  'text-soft',
  'text-note',
  'text-disabled',
  'text-on-bento',
  'text-ink-soft',
  'text-ink-faint',
  'text-on-accent',
  'text-on-gold',
  'text-on-danger',
  'text-on-toast',
  // 强调与线条
  'accent-ink',
  'accent-ink-deep',
  'accent-bright',
  'accent-line',
  'accent-edge',
  'focus-ring',
  'line',
  'line-strong',
  'line-soft',
  'line-dash',
  'line-faint',
  // 稀有度
  'rarity-r',
  'rarity-sr',
  'rarity-ssr',
  'rarity-ur',
  ...['r', 'sr', 'ssr', 'ur'].flatMap((rarity) => [
    `rarity-${rarity}-soft`,
    `rarity-${rarity}-ink`,
    `rarity-${rarity}-line`,
    `rarity-${rarity}-glow`,
  ]),
  'text-on-rarity',
  // 印章
  ...['bronze', 'silver', 'gold'].flatMap((tier) => [
    `stamp-${tier}`,
    `stamp-${tier}-soft`,
    `stamp-${tier}-ink`,
    `stamp-${tier}-line`,
  ]),
  'stamp-neutral',
  'stamp-neutral-soft',
  'stamp-neutral-ink',
  'stamp-locked',
  'stamp-locked-soft',
  'stamp-on-ring',
  'stamp-on-soft',
  // 阴影与字体
  'shadow-soft',
  'shadow-card',
  'shadow-ticket',
  'shadow-float',
  'shadow-modal',
  'shadow-button',
  'shadow-danger',
  'shadow-glow',
  'drop-shadow-card',
  'drop-shadow-stamp',
  'font-body',
  'font-display',
]

const rootTokenPatterns = [
  /^text-\d/,
  /^radius-/,
  /^motion-/,
  /^ease-/,
  /^weight-/,
  /^tracking-/,
]

describe('design tokens', () => {
  it('defines every required token in all three themes', () => {
    for (const theme of THEME_IDS) {
      const declarations = themeDeclarations(theme)
      for (const token of requiredThemeTokens) {
        expect(
          declarations[token],
          `${theme} is missing --${token}`,
        ).toBeTruthy()
      }
    }
  })

  it('keeps theme token sets in parity, allowing root-level radius fallbacks', () => {
    const root = rootDeclarations()
    const blocks = Object.fromEntries(
      THEME_IDS.map((theme) => [theme, themeDeclarations(theme)]),
    ) as Record<(typeof THEME_IDS)[number], Record<string, string>>
    const union = new Set(THEME_IDS.flatMap((theme) => Object.keys(blocks[theme])))

    for (const theme of THEME_IDS) {
      for (const token of union) {
        expect(
          blocks[theme][token] ?? root[token],
          `${theme} is missing --${token}`,
        ).toBeTruthy()
      }
    }
  })

  it('declares radii inside every theme so nested previews do not inherit', () => {
    for (const theme of THEME_IDS) {
      const declarations = themeDeclarations(theme)
      for (const token of ['radius-xs', 'radius-control', 'radius-tile', 'radius-lg']) {
        expect(
          declarations[token],
          `${theme} must declare its own --${token} for nested previews`,
        ).toBeTruthy()
      }
    }
  })

  it('defines the theme-independent typography, radius and motion scales', () => {
    const root = rootDeclarations()
    const names = Object.keys(root)

    for (const pattern of rootTokenPatterns) {
      expect(
        names.some((name) => pattern.test(name)),
        `missing token matching ${pattern}`,
      ).toBe(true)
    }

    expect(root['font-rounded']).toBeTruthy()
    expect(root['radius-control']).toBeTruthy()
    expect(root['radius-tile']).toBeTruthy()
    expect(root['motion-flip']).toBeTruthy()
    expect(root['ease-spring']).toBeTruthy()
  })

  it('maps every rarity and stamp tier through data attributes', () => {
    const rarities = [...css.tokens.matchAll(/\[data-rarity='([^']+)'\]/g)].map(
      (match) => match[1],
    )
    const tiers = [...css.tokens.matchAll(/\[data-tier='([^']+)'\]/g)].map(
      (match) => match[1],
    )

    expect(rarities).toEqual([...RARITY_ORDER])
    expect(tiers).toEqual(STAMP_TIERS.map((tier) => tier.tier))

    for (const rarity of RARITY_ORDER) {
      const lower = rarity.toLowerCase()
      const block = declarations(
        css.tokens,
        css.tokens.indexOf(`[data-rarity='${rarity}'] {`),
      )
      expect(block['rarity-color']).toBe(`var(--rarity-${lower})`)
      expect(block['rarity-soft']).toBe(`var(--rarity-${lower}-soft)`)
      expect(block['rarity-ink']).toBe(`var(--rarity-${lower}-ink)`)
      expect(block['rarity-line']).toBe(`var(--rarity-${lower}-line)`)
    }

    for (const tier of STAMP_TIERS) {
      const block = declarations(
        css.tokens,
        css.tokens.indexOf(`[data-tier='${tier.tier}'] {`),
      )
      expect(block['stamp-color']).toBe(`var(--stamp-${tier.tier})`)
      expect(block['stamp-soft']).toBe(`var(--stamp-${tier.tier}-soft)`)
      expect(block['stamp-ink']).toBe(`var(--stamp-${tier.tier}-ink)`)
      expect(block['stamp-line']).toBe(`var(--stamp-${tier.tier}-line)`)
    }
  })

  it('keeps themes.css as the final global stylesheet', () => {
    const imports = [...css.global.matchAll(/@import '\.\/([\w-]+)\.css';/g)].map(
      (match) => match[1],
    )
    expect(imports[0]).toBe('tokens')
    expect(imports.at(-1)).toBe('themes')
  })
})

describe('component styles', () => {
  it('contains no raw color literals outside tokens.css', () => {
    const literal = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i
    for (const [file, text] of componentCss) {
      const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, '')
      expect(withoutComments, `${file} has a raw color`).not.toMatch(literal)
    }
  })

  it('uses tokens for fonts, radii, weights and motion', () => {
    for (const [file, text] of componentCss) {
      const body = text.replace(/\/\*[\s\S]*?\*\//g, '')

      const fontFamilies = [
        ...body.matchAll(/font-family:\s*([^;]+);/g),
      ].map((match) => match[1]!.trim())
      for (const value of fontFamilies) {
        expect(
          value.startsWith('var(--font-'),
          `${file} has a literal font family: ${value}`,
        ).toBe(true)
      }

      const fontWeights = [...body.matchAll(/font-weight:\s*([^;]+);/g)].map(
        (match) => match[1]!.trim(),
      )
      for (const value of fontWeights) {
        expect(
          value.startsWith('var(--weight-'),
          `${file} has a literal font weight: ${value}`,
        ).toBe(true)
      }

      const fontSizes = [...body.matchAll(/font-size:\s*([^;]+);/g)].map(
        (match) => match[1]!.trim(),
      )
      for (const value of fontSizes) {
        expect(
          value.startsWith('var(--text-') || value === '1em',
          `${file} has a literal font size: ${value}`,
        ).toBe(true)
      }

      const radii = [...body.matchAll(/border-radius:\s*([^;]+);/g)].map(
        (match) => match[1]!.trim(),
      )
      for (const value of radii) {
        expect(
          /^(var\(--radius|50%$|inherit$|0$)/.test(value),
          `${file} has a literal radius: ${value}`,
        ).toBe(true)
      }

      // 先把 var() 整体抹掉，避免把 --ease-out / --motion-fast 当成字面量。
      const withoutVars = body.replace(/var\([^)]*\)/g, '')
      expect(withoutVars, `${file} has a literal duration`).not.toMatch(
        /(?:transition|animation)(?:-[a-z-]+)?:[^;]*\d+m?s\b/,
      )
      expect(withoutVars, `${file} has a literal easing`).not.toMatch(
        /(?:transition|animation)(?:-[a-z-]+)?:[^;]*\b(?:ease|ease-in|ease-out|ease-in-out|linear)\b/,
      )
    }
  })

  it('resolves every var() reference to a declared token or an inline variable', () => {
    const inline = new Set(['order', 'tilt', 'vv-top', 'vvh', 'stamp-tilt'])
    const declared = new Set<string>()
    for (const text of Object.values(css)) {
      for (const match of text.matchAll(/--([\w-]+)\s*:/g)) {
        declared.add(match[1]!)
      }
    }

    for (const [file, text] of componentCss) {
      for (const match of text.matchAll(/var\(--([\w-]+)/g)) {
        const name = match[1]!
        expect(
          declared.has(name) || inline.has(name),
          `${file} references undeclared --${name}`,
        ).toBe(true)
      }
    }
  })
})

describe('first paint theme bootstrap', () => {
  const html = read('index.html')

  it('defaults the document to cute', () => {
    expect(html).toMatch(/<html[^>]*\sdata-theme="cute"/)
  })

  it('mirrors every THEME_OPTION in the synchronous script', () => {
    const entries = [
      ...html.matchAll(/(\w+): \['(#[0-9A-Fa-f]{6})', '(light|dark)'\]/g),
    ].map((match) => ({
      id: match[1]!,
      themeColor: match[2]!,
      colorScheme: match[3]!,
    }))

    expect(entries).toEqual(
      THEME_OPTIONS.map(({ id, themeColor, colorScheme }) => ({
        id,
        themeColor,
        colorScheme,
      })),
    )
  })

  it('reads the same storage key the app writes', () => {
    expect(html).toContain("localStorage.getItem('diet-diary:app-data')")
  })
})
