import { describe, expect, it } from 'vitest'

import {
  COOKING_STEP_MAX,
  COOKING_STEP_MAX_CHARS,
  COOKING_STEP_MIN,
  countUnicodeChars,
  isCookingMethod,
  isDishCategory,
  isMealType,
  requiresHeatThroughHint,
} from './dataRules'
import { dishes } from './index'

describe('dish content', () => {
  it.each(dishes.map((dish) => [dish.id, dish] as const))(
    '%s has a complete category, meals and cooking guide',
    (_id, dish) => {
      expect(isDishCategory(dish.category)).toBe(true)
      expect(dish.meals.length).toBeGreaterThan(0)
      expect(new Set(dish.meals).size).toBe(dish.meals.length)
      for (const meal of dish.meals) {
        expect(isMealType(meal)).toBe(true)
      }

      const cooking = dish.cooking
      if (!cooking) {
        throw new Error(`${dish.id} 缺少做法`)
      }

      expect(isCookingMethod(cooking.method)).toBe(true)
      expect(Number.isFinite(cooking.timeMinutes)).toBe(true)
      expect(cooking.timeMinutes).toBeGreaterThanOrEqual(0)

      const steps = cooking.steps
      expect(steps.length).toBeGreaterThanOrEqual(COOKING_STEP_MIN)
      expect(steps.length).toBeLessThanOrEqual(COOKING_STEP_MAX)
      for (const step of steps) {
        expect(step.trim()).not.toBe('')
        expect(countUnicodeChars(step)).toBeLessThanOrEqual(
          COOKING_STEP_MAX_CHARS,
        )
      }

      if (cooking.tips !== undefined) {
        expect(cooking.tips.trim()).not.toBe('')
      }
      if (dish.tip !== undefined) {
        expect(dish.tip.trim()).not.toBe('')
      }
    },
  )

  it.each(
    dishes
      .filter((dish) => requiresHeatThroughHint(dish))
      .map((dish) => [dish.id, dish] as const),
  )('%s tells the cook to heat meat, egg or seafood through', (_id, dish) => {
    expect(
      dish.cooking?.steps.some((step) => step.includes('熟透')),
    ).toBe(true)
  })

  it.each(
    dishes
      .filter((dish) => dish.cooking?.method === '外买')
      .map((dish) => [dish.id, dish] as const),
  )('%s explains how to select or reheat takeout', (_id, dish) => {
    expect(
      dish.cooking?.steps.some(
        (step) => step.includes('复热') || step.includes('加热'),
      ),
    ).toBe(true)
  })
})
