import { describe, expect, it } from 'vitest'

import {
  PityUnavailableError,
  createComboDrawState,
  drawByRarity,
  drawCombo,
  resetComboDraws,
} from './draw'
import type { Rng } from './draw'
import type { Combo, MealType, Rarity } from './types'

function combo(
  id: string,
  rarity: Rarity,
  meals: MealType[] = ['lunch'],
): Combo {
  return { id, name: id, rarity, meals, components: [] }
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

function state(pityCount = 0, drawnComboIds: string[] = []) {
  return { ...createComboDrawState(pityCount), drawnComboIds }
}

describe('drawCombo', () => {
  it('only draws combos available for the requested meal', () => {
    const catalog = [
      combo('breakfast_only', 'R', ['breakfast']),
      combo('lunch_only', 'R', ['lunch']),
      combo('dinner_only', 'R', ['dinner']),
    ]

    const result = drawCombo(state(), 'breakfast', () => 0, catalog)

    expect(result.combo.id).toBe('breakfast_only')
  })

  it('never repeats a combo already drawn in the same meal', () => {
    const catalog = [
      combo('r0', 'R'),
      combo('r1', 'R'),
      combo('r2', 'R'),
    ]

    let current = state()
    const ids: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const result = drawCombo(current, 'lunch', () => 0, catalog)
      ids.push(result.combo.id)
      current = {
        pityCount: result.pityCount,
        drawnComboIds: [...current.drawnComboIds, result.combo.id],
      }
    }

    expect(ids).toEqual(['r0', 'r1', 'r2'])
    expect(new Set(ids).size).toBe(3)
  })

  it('excludes combos listed as already drawn', () => {
    const catalog = [combo('r0', 'R'), combo('r1', 'R')]

    const result = drawCombo(state(0, ['r0']), 'lunch', () => 0, catalog)

    expect(result.combo.id).toBe('r1')
  })

  it('triggers pity on the sixth draw after five R combos', () => {
    const catalog = [
      combo('r0', 'R'),
      combo('r1', 'R'),
      combo('r2', 'R'),
      combo('r3', 'R'),
      combo('r4', 'R'),
      combo('sr', 'SR'),
      combo('ssr', 'SSR'),
      combo('ur', 'UR'),
    ]

    let current = state()
    for (let i = 0; i < 5; i += 1) {
      const result = drawCombo(current, 'lunch', () => 0, catalog)
      expect(result.combo.rarity).toBe('R')
      expect(result.pityTriggered).toBe(false)
      current = {
        pityCount: result.pityCount,
        drawnComboIds: [...current.drawnComboIds, result.combo.id],
      }
    }

    expect(current.pityCount).toBe(5)

    const sixth = drawCombo(current, 'lunch', () => 0, catalog)
    expect(sixth.combo.rarity).toBe('SR')
    expect(sixth.pityTriggered).toBe(true)
    expect(sixth.pityCount).toBe(0)
  })

  it('falls back to normal weights when pity is active but no SR+ is left', () => {
    const catalog = [combo('r0', 'R'), combo('r1', 'R')]

    const result = drawCombo(state(5, ['r1']), 'lunch', () => 0, catalog)

    expect(result.combo.id).toBe('r0')
    expect(result.combo.rarity).toBe('R')
    expect(result.pityTriggered).toBe(false)
    expect(result.pityCount).toBe(6)
  })

  it('throws when the meal pool is empty, before calling rng', () => {
    let calls = 0
    const rng: Rng = () => {
      calls += 1
      return 0
    }

    expect(() =>
      drawCombo(state(), 'breakfast', rng, [combo('lunch_only', 'R')]),
    ).toThrow('候选套餐已抽完')
    expect(calls).toBe(0)
  })

  it('throws when every combo of the meal is already drawn', () => {
    expect(() =>
      drawCombo(state(0, ['r0']), 'lunch', () => 0, [combo('r0', 'R')]),
    ).toThrow('候选套餐已抽完')
  })

  it('maps rarity boundaries to R / SR / SSR / UR', () => {
    const catalog = [
      combo('r', 'R'),
      combo('sr', 'SR'),
      combo('ssr', 'SSR'),
      combo('ur', 'UR'),
    ]
    const cases = [
      { value: 0, expected: 'R' },
      { value: 0.56, expected: 'SR' },
      { value: 0.84, expected: 'SSR' },
      { value: 0.98, expected: 'UR' },
    ] as const

    for (const item of cases) {
      const result = drawCombo(
        state(),
        'lunch',
        sequence([item.value, 0]),
        catalog,
      )
      expect(result.combo.rarity).toBe(item.expected)
      expect(result.pityTriggered).toBe(false)
      expect(result.pityCount).toBe(item.expected === 'R' ? 1 : 0)
    }
  })

  it('clamps rng = 1 to the last bucket and last combo', () => {
    const catalog = [
      combo('r', 'R'),
      combo('sr', 'SR'),
      combo('ssr', 'SSR'),
      combo('ur', 'UR'),
    ]

    const result = drawCombo(state(), 'lunch', sequence([1, 1]), catalog)

    expect(result.combo.rarity).toBe('UR')
    expect(result.combo.id).toBe('ur')
    expect(result.pityCount).toBe(0)
  })

  it('renormalizes when a rarity bucket is exhausted', () => {
    const catalog = [combo('r1', 'R'), combo('ur', 'UR')]

    const result = drawCombo(
      state(0, ['ur']),
      'lunch',
      sequence([0.98, 0]),
      catalog,
    )

    expect(result.combo.rarity).toBe('R')
    expect(result.combo.id).toBe('r1')
  })

  it('reads rng exactly twice per successful draw', () => {
    let calls = 0
    const rng: Rng = () => {
      calls += 1
      return 0
    }

    drawCombo(state(), 'lunch', rng, [combo('r0', 'R'), combo('r1', 'R')])

    expect(calls).toBe(2)
  })

  it('rejects non-finite rng output', () => {
    const catalog = [combo('r', 'R')]

    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(() => drawCombo(state(), 'lunch', () => value, catalog)).toThrow(
        RangeError,
      )
    }
  })
})

describe('drawByRarity strict mode', () => {
  it('throws PityUnavailableError without reading rng when pity has no SR+', () => {
    let calls = 0
    const rng: Rng = () => {
      calls += 1
      return 0
    }

    expect(() =>
      drawByRarity([combo('r', 'R')], 5, rng, 'strict'),
    ).toThrow(PityUnavailableError)
    expect(calls).toBe(0)
  })

  it('still draws normally below the pity threshold', () => {
    const result = drawByRarity(
      [combo('r', 'R'), combo('sr', 'SR')],
      4,
      sequence([0, 0]),
      'strict',
    )

    expect(result.item.rarity).toBe('R')
    expect(result.pityCount).toBe(5)
  })
})

describe('combo draw state', () => {
  it('normalizes the initial pity count', () => {
    expect(createComboDrawState(3.9)).toEqual({
      pityCount: 3,
      drawnComboIds: [],
    })
    expect(createComboDrawState(Number.NaN).pityCount).toBe(0)
    expect(createComboDrawState(-2).pityCount).toBe(0)
  })

  it('resets drawn combos for a new meal but keeps pity progress', () => {
    expect(
      resetComboDraws({ pityCount: 4, drawnComboIds: ['a', 'b'] }),
    ).toEqual({ pityCount: 4, drawnComboIds: [] })
  })
})
