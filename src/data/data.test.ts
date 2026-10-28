import { describe, expect, it } from 'vitest'

import { calcDishCalories } from '@/core/nutrition'

import dishesJson from './dishes.json'
import ingredientsJson from './ingredients.json'
import { dishById, dishes, ingredientById, ingredients } from './index'

const RARITY_COUNTS = { R: 29, SR: 19, SSR: 9, UR: 3 } as const

const TOP_LEVEL_DISH_KEYS = ['_comment', 'dishes']
const TOP_LEVEL_INGREDIENT_KEYS = ['_comment', 'ingredients']
const DISH_KEYS = new Set([
  'id',
  'name',
  'rarity',
  'category',
  'meals',
  'ingredients',
  'image',
  'stampImage',
  'tip',
  'cooking',
])
const REQUIRED_DISH_KEYS = [
  'id',
  'name',
  'rarity',
  'category',
  'meals',
  'ingredients',
  'image',
  'cooking',
]
const INGREDIENT_KEYS = ['id', 'kcalPer100g', 'name']
const DISH_INGREDIENT_KEYS = ['grams', 'ingredientId']

describe('data integrity', () => {
  it('has 60 dishes and 66 ingredients', () => {
    expect(dishes).toHaveLength(60)
    expect(ingredients).toHaveLength(66)
  })

  it('matches the rarity distribution', () => {
    for (const [rarity, expected] of Object.entries(RARITY_COUNTS)) {
      expect(dishes.filter((dish) => dish.rarity === rarity)).toHaveLength(expected)
    }
  })

  it('only uses the fields defined by the spec', () => {
    expect(Object.keys(dishesJson).sort()).toEqual(TOP_LEVEL_DISH_KEYS)
    expect(Object.keys(ingredientsJson).sort()).toEqual(TOP_LEVEL_INGREDIENT_KEYS)

    for (const dish of dishesJson.dishes) {
      const keys = Object.keys(dish)
      expect(keys.filter((key) => !DISH_KEYS.has(key))).toEqual([])
      for (const required of REQUIRED_DISH_KEYS) {
        expect(keys).toContain(required)
      }
      for (const item of dish.ingredients) {
        expect(Object.keys(item).sort()).toEqual(DISH_INGREDIENT_KEYS)
      }
    }

    for (const ingredient of ingredientsJson.ingredients) {
      expect(Object.keys(ingredient).sort()).toEqual(INGREDIENT_KEYS)
    }

    expect(JSON.stringify(dishesJson)).not.toContain('"emoji"')
  })

  it('has unique ids and valid ingredient references', () => {
    expect(new Set(ingredients.map((item) => item.id)).size).toBe(ingredients.length)
    expect(new Set(dishes.map((item) => item.id)).size).toBe(dishes.length)

    for (const dish of dishes) {
      const ingredientIds = dish.ingredients.map((item) => item.ingredientId)
      expect(new Set(ingredientIds).size).toBe(ingredientIds.length)

      for (const item of dish.ingredients) {
        expect(ingredientById.has(item.ingredientId)).toBe(true)
        expect(item.grams).toBeGreaterThan(0)
      }
    }
  })

  it('uses the default image path and has a positive calorie total', () => {
    for (const dish of dishes) {
      expect(dish.image).toBe(`/images/dishes/${dish.id}.png`)
      expect(calcDishCalories(dish)).toBeGreaterThan(0)
    }
  })

  it('computes the basic rice dish from its ingredients', () => {
    const whiteRice = dishById.get('white_rice')
    expect(whiteRice?.name).toBe('白米饭')
    expect(calcDishCalories(whiteRice!)).toBe(232)
    expect(calcDishCalories(whiteRice!, { cooked_rice: 300 })).toBe(348)
  })
})
