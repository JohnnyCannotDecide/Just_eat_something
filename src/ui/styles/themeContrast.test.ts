/// <reference types="node" />

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { RARITY_ORDER, STAMP_TIERS, THEME_IDS } from '@/config/gameConfig'

type Rgba = [number, number, number, number]

const css = readFileSync('src/ui/styles/tokens.css', 'utf8')

function parseBlock(start: number): Record<string, string> {
  const end = css.indexOf('\n}', start)
  const result: Record<string, string> = {}
  for (const match of css.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    result[match[1]!] = match[2]!.trim()
  }
  return result
}

function themeTokens(theme: string): Record<string, string> {
  const marker =
    theme === 'cute'
      ? ":root:not([data-theme]),\n[data-theme='cute'] {"
      : `[data-theme='${theme}'] {`
  const start = css.indexOf(marker)
  if (start < 0) {
    throw new Error(`theme block not found: ${theme}`)
  }
  return parseBlock(start)
}

function parseColor(value: string): Rgba | null {
  const hex = value.match(/^#([0-9a-f]{3,8})$/i)
  if (hex) {
    let digits = hex[1]!
    if (digits.length === 3) {
      digits = [...digits].map((char) => char + char).join('')
    }
    if (digits.length === 6) {
      digits += 'ff'
    }
    if (digits.length !== 8) {
      return null
    }
    return [
      Number.parseInt(digits.slice(0, 2), 16),
      Number.parseInt(digits.slice(2, 4), 16),
      Number.parseInt(digits.slice(4, 6), 16),
      Number.parseInt(digits.slice(6, 8), 16) / 255,
    ]
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/i)
  if (rgb) {
    const parts = rgb[1]!.split(',').map((part) => Number(part.trim()))
    if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) {
      return null
    }
    return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1]
  }

  return null
}

function requireColor(tokens: Record<string, string>, theme: string, name: string): Rgba {
  const raw = tokens[name]
  const color = raw ? parseColor(raw) : null
  if (!color) {
    throw new Error(`${theme} --${name} is not a solid color: ${raw}`)
  }
  return color
}

/** alpha 先与背景合成，和浏览器实际观感一致。 */
function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground[3]
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
    1,
  ]
}

function linear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(color: Rgba): number {
  return (
    0.2126 * linear(color[0]) +
    0.7152 * linear(color[1]) +
    0.0722 * linear(color[2])
  )
}

function contrast(foreground: Rgba, background: Rgba): number {
  const a = composite(foreground, background)
  const b = composite(background, [255, 255, 255, 1])
  const [lighter, darker] = [luminance(a), luminance(b)].sort(
    (left, right) => right - left,
  )
  return (lighter! + 0.05) / (darker! + 0.05)
}

function toLab(color: Rgba): [number, number, number] {
  const xyz = [
    (0.4124 * linear(color[0]) +
      0.3576 * linear(color[1]) +
      0.1805 * linear(color[2])) /
      0.95047,
    0.2126 * linear(color[0]) +
      0.7152 * linear(color[1]) +
      0.0722 * linear(color[2]),
    (0.0193 * linear(color[0]) +
      0.1192 * linear(color[1]) +
      0.9505 * linear(color[2])) /
      1.08883,
  ]
  const f = (value: number) =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116
  const [x, y, z] = xyz.map(f) as [number, number, number]
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

/** CIE76 色差；用于确认色相而不是亮度区分。 */
function deltaE(left: Rgba, right: Rgba): number {
  const a = toLab(left)
  const b = toLab(right)
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

describe.each(THEME_IDS)('theme contrast: %s', (theme) => {
  const tokens = themeTokens(theme)
  const card = requireColor(tokens, theme, 'surface-card')

  function expectRatio(
    label: string,
    foreground: Rgba,
    background: Rgba,
    minimum: number,
  ) {
    expect(contrast(foreground, background), label).toBeGreaterThanOrEqual(minimum)
  }

  it('keeps every rarity readable on its soft chip and solid badge', () => {
    const onRarity = requireColor(tokens, theme, 'text-on-rarity')
    for (const rarity of RARITY_ORDER) {
      const key = rarity.toLowerCase()
      expectRatio(
        `${rarity} ink on soft`,
        requireColor(tokens, theme, `rarity-${key}-ink`),
        requireColor(tokens, theme, `rarity-${key}-soft`),
        4.5,
      )
      expectRatio(
        `${rarity} label on solid fill`,
        onRarity,
        requireColor(tokens, theme, `rarity-${key}`),
        4.5,
      )
      expectRatio(
        `${rarity} line on card`,
        requireColor(tokens, theme, `rarity-${key}-line`),
        card,
        3,
      )
    }
  })

  it('keeps bronze, silver and gold stamps readable', () => {
    const onRing = requireColor(tokens, theme, 'stamp-on-ring')
    const onSoft = requireColor(tokens, theme, 'stamp-on-soft')
    for (const stamp of STAMP_TIERS) {
      const tier = stamp.tier
      expectRatio(
        `${tier} ink on soft`,
        requireColor(tokens, theme, `stamp-${tier}-ink`),
        requireColor(tokens, theme, `stamp-${tier}-soft`),
        4.5,
      )
      expectRatio(
        `${tier} count on ring`,
        onRing,
        requireColor(tokens, theme, `stamp-${tier}`),
        4.5,
      )
      expectRatio(
        `${tier} label on soft`,
        onSoft,
        requireColor(tokens, theme, `stamp-${tier}-soft`),
        4.5,
      )
      expectRatio(
        `${tier} line on card`,
        requireColor(tokens, theme, `stamp-${tier}-line`),
        card,
        3,
      )
    }
  })

  it('separates rarity and stamp hues even without color vision', () => {
    const rarityColors = RARITY_ORDER.map((rarity) =>
      requireColor(tokens, theme, `rarity-${rarity.toLowerCase()}`),
    )
    for (let left = 0; left < rarityColors.length; left += 1) {
      for (let right = left + 1; right < rarityColors.length; right += 1) {
        expect(
          deltaE(rarityColors[left]!, rarityColors[right]!),
          `${RARITY_ORDER[left]} vs ${RARITY_ORDER[right]} ΔE`,
        ).toBeGreaterThanOrEqual(15)
      }
    }

    const stampColors = STAMP_TIERS.map((stamp) =>
      requireColor(tokens, theme, `stamp-${stamp.tier}`),
    )
    for (let left = 0; left < stampColors.length; left += 1) {
      for (let right = left + 1; right < stampColors.length; right += 1) {
        expect(
          deltaE(stampColors[left]!, stampColors[right]!),
          `${STAMP_TIERS[left]!.tier} vs ${STAMP_TIERS[right]!.tier} ΔE`,
        ).toBeGreaterThanOrEqual(12)
      }
    }
  })
})
