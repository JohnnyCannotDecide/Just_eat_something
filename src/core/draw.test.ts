import { describe, expect, it } from 'vitest'

import { drawByRarity } from './draw'
import type { Rng } from './draw'
import type { Combo, Rarity } from './types'

function combo(id: string, rarity: Rarity): Combo {
  return { id, name: id, rarity, meals: ['lunch'], components: [] }
}

function sequence(values: readonly number[]): Rng {
  let index = 0
  return () => {
    if (index >= values.length) {
      throw new Error('rng 调用次数超出预期')
    }
    return values[index++]!
  }
}

const catalog = [
  combo('r', 'R'),
  combo('sr', 'SR'),
  combo('ssr', 'SSR'),
  combo('ur', 'UR'),
]

describe('drawByRarity', () => {
  it('maps rarity boundaries to R / SR / SSR / UR', () => {
    const cases = [
      { value: 0, expected: 'R' },
      { value: 0.56, expected: 'SR' },
      { value: 0.84, expected: 'SSR' },
      { value: 0.98, expected: 'UR' },
    ] as const

    for (const item of cases) {
      const result = drawByRarity(catalog, 0, sequence([item.value, 0]))
      expect(result.item.rarity).toBe(item.expected)
      expect(result.pityTriggered).toBe(false)
      expect(result.pityCount).toBe(item.expected === 'R' ? 1 : 0)
    }
  })

  it('clamps rng = 1 to the last bucket and last item', () => {
    const result = drawByRarity(catalog, 0, sequence([1, 1]))

    expect(result.item.rarity).toBe('UR')
    expect(result.item.id).toBe('ur')
    expect(result.pityCount).toBe(0)
  })

  it('renormalizes across the buckets that are actually available', () => {
    const result = drawByRarity(
      [combo('r1', 'R'), combo('sr1', 'SR')],
      0,
      sequence([0.98, 0]),
    )

    expect(result.item.rarity).toBe('SR')
    expect(result.item.id).toBe('sr1')
  })

  it('triggers pity on the sixth draw after five R results', () => {
    let pityCount = 0
    for (let i = 0; i < 5; i += 1) {
      const result = drawByRarity([combo(`r${i}`, 'R')], pityCount, () => 0)
      expect(result.item.rarity).toBe('R')
      expect(result.pityTriggered).toBe(false)
      pityCount = result.pityCount
    }

    expect(pityCount).toBe(5)

    const sixth = drawByRarity(catalog, pityCount, () => 0)
    expect(sixth.item.rarity).toBe('SR')
    expect(sixth.pityTriggered).toBe(true)
    expect(sixth.pityCount).toBe(0)
  })

  it('falls back to normal weights when pity is active but no SR+ is left', () => {
    let result = drawByRarity([combo('r0', 'R')], 5, sequence([0, 0]))
    expect(result.item.rarity).toBe('R')
    expect(result.pityTriggered).toBe(false)
    expect(result.pityCount).toBe(6)

    result = drawByRarity([combo('r0', 'R'), combo('r1', 'R')], 4, () => 0)
    expect(result.pityCount).toBe(5)
  })

  it('reads rng exactly twice per successful draw', () => {
    let calls = 0
    const rng: Rng = () => {
      calls += 1
      return 0
    }

    drawByRarity(catalog, 0, rng)

    expect(calls).toBe(2)
  })

  it('throws before calling rng when there are no candidates', () => {
    let calls = 0
    const rng: Rng = () => {
      calls += 1
      return 0
    }

    expect(() => drawByRarity([], 0, rng)).toThrow('候选池已抽空')
    expect(calls).toBe(0)
  })

  it('rejects non-finite rng output', () => {
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(() => drawByRarity(catalog, 0, () => value)).toThrow(RangeError)
    }
  })
})
