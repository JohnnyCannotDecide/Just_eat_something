import { describe, expect, it } from 'vitest'

import { dishById } from '@/data'

import {
  calcDishCalories,
  calcDishKcal,
  calcIngredientKcal,
} from './nutrition'
import type { Dish, Ingredient } from './types'

const rice: Ingredient = { id: 'rice', name: '米饭', kcalPer100g: 116 }
const lookup = new Map<string, Ingredient>([[rice.id, rice]])

function dish(ingredients: Dish['ingredients']): Dish {
  return {
    id: 'test_dish',
    name: '测试菜',
    rarity: 'R',
    category: 'staple',
    meals: ['lunch'],
    ingredients,
    image: '/images/dishes/test_dish.png',
    cooking: { method: '煮', timeMinutes: 0, steps: [] },
  }
}

describe('nutrition', () => {
  it('calculates 200g of rice as 232 kcal', () => {
    expect(calcDishCalories(dish([{ ingredientId: 'rice', grams: 200 }]), {}, lookup)).toBe(232)
  })

  it('uses the bundled ingredients by default', () => {
    const whiteRice = dishById.get('white_rice')!
    expect(calcDishCalories(whiteRice)).toBe(232)
    expect(calcDishCalories(whiteRice, { cooked_rice: 300 })).toBe(348)
  })

  it('applies gram overrides only to the listed ingredients', () => {
    const a: Ingredient = { id: 'a', name: 'A', kcalPer100g: 100 }
    const b: Ingredient = { id: 'b', name: 'B', kcalPer100g: 50 }
    const map = new Map<string, Ingredient>([
      ['a', a],
      ['b', b],
    ])
    const testDish = dish([
      { ingredientId: 'a', grams: 100 },
      { ingredientId: 'b', grams: 100 },
    ])

    expect(calcDishCalories(testDish, { a: 50 }, map)).toBe(100)
  })

  it('rounds the total instead of each ingredient', () => {
    const a: Ingredient = { id: 'a', name: 'A', kcalPer100g: 33.3 }
    const b: Ingredient = { id: 'b', name: 'B', kcalPer100g: 33.3 }
    const map = new Map<string, Ingredient>([
      ['a', a],
      ['b', b],
    ])

    // 16.65 + 16.65 = 33.3 → 33；若逐项取整会得到 17 + 17 = 34。
    expect(
      calcDishCalories(
        dish([
          { ingredientId: 'a', grams: 50 },
          { ingredientId: 'b', grams: 50 },
        ]),
        {},
        map,
      ),
    ).toBe(33)
  })

  it('allows zero grams but rejects negative or non-finite grams', () => {
    const testDish = dish([{ ingredientId: 'rice', grams: 100 }])

    expect(calcDishCalories(testDish, { rice: 0 }, lookup)).toBe(0)
    expect(() => calcDishCalories(testDish, { rice: -1 }, lookup)).toThrow(RangeError)
    expect(() => calcDishCalories(testDish, { rice: Number.NaN }, lookup)).toThrow(RangeError)
    expect(() => calcDishCalories(testDish, { rice: Number.POSITIVE_INFINITY }, lookup)).toThrow(
      RangeError,
    )
  })

  it('rejects overrides for ingredients that are not in the dish', () => {
    expect(() =>
      calcDishCalories(dish([{ ingredientId: 'rice', grams: 100 }]), { other: 10 }, lookup),
    ).toThrow('覆盖的食材不在菜品中: other')
  })

  it('throws for unknown ingredients', () => {
    expect(() =>
      calcDishCalories(dish([{ ingredientId: 'missing', grams: 100 }]), {}, lookup),
    ).toThrow('未知食材: missing')
  })

  it('recalculates when grams change', () => {
    expect(calcIngredientKcal(rice, 150)).toBe(174)
  })

  it('keeps calcDishKcal as a compatibility wrapper', () => {
    expect(calcDishKcal(dish([{ ingredientId: 'rice', grams: 200 }]), lookup)).toBe(232)
  })
})
