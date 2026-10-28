import { describe, expect, it } from 'vitest'

import type { Dish, Rarity } from '@/core/types'

import {
  countUnicodeChars,
  isCookingMethod,
  isDishCategory,
  isMealType,
  requiresHeatThroughHint,
  resolveComboRarity,
} from './dataRules'

function dish(
  id: string,
  rarity: Rarity,
  ingredientId = 'rice',
): Dish {
  return {
    id,
    name: id,
    rarity,
    category: 'staple',
    meals: ['lunch'],
    ingredients: [{ ingredientId, grams: 100 }],
    image: `/images/dishes/${id}.png`,
    cooking: { method: '煮', timeMinutes: 0, steps: ['一', '二', '三'] },
  }
}

describe('dataRules', () => {
  it('counts Unicode code points instead of UTF-16 units', () => {
    expect(countUnicodeChars('白米饭')).toBe(3)
    expect(countUnicodeChars('🍚')).toBe(1)
    expect(countUnicodeChars('a🍚')).toBe(2)
  })

  it('guards dish categories, cooking methods and meals', () => {
    expect(isDishCategory('staple')).toBe(true)
    expect(isDishCategory('rice')).toBe(false)

    expect(isCookingMethod('外买')).toBe(true)
    expect(isCookingMethod('外卖')).toBe(false)

    expect(isMealType('breakfast')).toBe(true)
    expect(isMealType('brunch')).toBe(false)
  })

  it('detects dishes that need a heat-through hint', () => {
    expect(requiresHeatThroughHint(dish('egg_dish', 'R', 'egg'))).toBe(true)
    expect(requiresHeatThroughHint(dish('veg_dish', 'R', 'spinach'))).toBe(
      false,
    )
  })

  it('derives combo rarity and forces UR when a component is UR', () => {
    const dishById = new Map([
      ['r', dish('r', 'R')],
      ['sr', dish('sr', 'SR')],
      ['ur', dish('ur', 'UR')],
    ])

    expect(resolveComboRarity(['r'], undefined, dishById)).toBe('R')
    expect(resolveComboRarity(['r', 'sr'], undefined, dishById)).toBe('SR')
    expect(resolveComboRarity(['r'], 'SSR', dishById)).toBe('SSR')
    expect(resolveComboRarity(['ur'], 'R', dishById)).toBe('UR')
    expect(() => resolveComboRarity([], undefined, dishById)).toThrow(
      '至少需要一个',
    )
    expect(() => resolveComboRarity(['missing'], undefined, dishById)).toThrow(
      '不存在的菜品',
    )
  })
})
