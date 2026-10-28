import { describe, expect, it } from 'vitest'

import type { MealType, Rarity } from '@/core/types'

import combosJson from './combos.json'
import {
  COMBO_COMPONENT_MAX,
  COMBO_COMPONENT_MIN,
  MAX_UR_COMBOS,
  MEAL_TYPES,
  MIN_COMBOS_PER_MEAL,
} from './dataRules'
import { comboById, combos, dishById, dishes } from './index'

const TOP_LEVEL_COMBO_KEYS = ['_comment', 'combos']
const COMBO_KEYS = new Set([
  'id',
  'name',
  'rarity',
  'meals',
  'components',
  'tip',
])
const REQUIRED_COMBO_KEYS = ['id', 'name', 'meals', 'components']

const RARITY_COUNTS: Record<Rarity, number> = {
  R: 11,
  SR: 17,
  SSR: 9,
  UR: 3,
}

describe('combo data', () => {
  it('has the expected top-level shape and fields', () => {
    expect(Object.keys(combosJson).sort()).toEqual(TOP_LEVEL_COMBO_KEYS)

    for (const combo of combosJson.combos) {
      const keys = Object.keys(combo)
      expect(keys.filter((key) => !COMBO_KEYS.has(key))).toEqual([])
      for (const required of REQUIRED_COMBO_KEYS) {
        expect(keys).toContain(required)
      }
    }
  })

  it('has unique ids and valid 1-4 dish components', () => {
    expect(new Set(combos.map((combo) => combo.id)).size).toBe(combos.length)
    expect(comboById.size).toBe(combos.length)

    for (const combo of combos) {
      expect(combo.components.length).toBeGreaterThanOrEqual(
        COMBO_COMPONENT_MIN,
      )
      expect(combo.components.length).toBeLessThanOrEqual(COMBO_COMPONENT_MAX)
      expect(new Set(combo.components).size).toBe(combo.components.length)

      for (const dishId of combo.components) {
        expect(dishById.has(dishId)).toBe(true)
      }
    }
  })

  it('only pairs dishes that are available for every combo meal', () => {
    for (const combo of combos) {
      for (const dishId of combo.components) {
        const dish = dishById.get(dishId)!
        for (const meal of combo.meals) {
          expect(dish.meals).toContain(meal)
        }
      }
    }
  })

  it('offers at least eight combos per meal', () => {
    for (const meal of MEAL_TYPES) {
      const count = combos.filter((combo) => combo.meals.includes(meal)).length
      expect(count).toBeGreaterThanOrEqual(MIN_COMBOS_PER_MEAL)
    }
  })

  it('does not repeat the same combo in one meal pool', () => {
    for (const meal of MEAL_TYPES) {
      const pool = combos.filter((combo) => combo.meals.includes(meal))
      const names = pool.map((combo) => combo.name)
      const componentSets = pool.map((combo) =>
        [...combo.components].sort().join('|'),
      )
      expect(new Set(names).size).toBe(names.length)
      expect(new Set(componentSets).size).toBe(componentSets.length)
    }
  })

  it('covers every dish at least once', () => {
    const covered = new Set(combos.flatMap((combo) => combo.components))
    for (const dish of dishes) {
      expect(covered.has(dish.id)).toBe(true)
    }
    expect(covered.size).toBe(dishes.length)
  })

  it('resolves rarity from the rarest component', () => {
    for (const combo of combos) {
      const highest = combo.components
        .map((dishId) => dishById.get(dishId)!.rarity)
        .reduce((current, rarity) =>
          ['R', 'SR', 'SSR', 'UR'].indexOf(rarity) >
          ['R', 'SR', 'SSR', 'UR'].indexOf(current)
            ? rarity
            : current,
        )
      expect(combo.rarity).toBe(highest === 'UR' ? 'UR' : highest)
    }
  })

  it('matches the planned combo rarity distribution', () => {
    for (const [rarity, expected] of Object.entries(RARITY_COUNTS)) {
      expect(combos.filter((combo) => combo.rarity === rarity)).toHaveLength(
        expected,
      )
    }
  })

  it('keeps UR dishes inside the at most three UR combos', () => {
    const urCombos = combos.filter((combo) => combo.rarity === 'UR')
    expect(urCombos.length).toBeLessThanOrEqual(MAX_UR_COMBOS)
    expect(urCombos.length).toBe(3)

    const urDishes = dishes.filter((dish) => dish.rarity === 'UR')
    expect(urDishes.length).toBe(3)
    for (const dish of urDishes) {
      const containing = combos.filter((combo) =>
        combo.components.includes(dish.id),
      )
      expect(containing.length).toBeGreaterThan(0)
      expect(containing.every((combo) => combo.rarity === 'UR')).toBe(true)
    }
  })

  it('declares at least one meal for every combo', () => {
    for (const combo of combos) {
      expect(combo.meals.length).toBeGreaterThan(0)
      expect(new Set(combo.meals).size).toBe(combo.meals.length)
      for (const meal of combo.meals) {
        expect(MEAL_TYPES).toContain(meal as MealType)
      }
    }
  })
})
