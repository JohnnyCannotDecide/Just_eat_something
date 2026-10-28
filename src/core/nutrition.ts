import { ingredientById } from '@/data'

import type { Dish, Ingredient } from './types'

export type GramOverrides = Readonly<Record<string, number>>

/** 单个食材的热量，保留小数；整道菜最后统一四舍五入。 */
export function calcIngredientKcal(ingredient: Ingredient, grams: number): number {
  return (ingredient.kcalPer100g * grams) / 100
}

function assertValidGrams(grams: number, label: string): void {
  if (!Number.isFinite(grams) || grams < 0) {
    throw new RangeError(`克数必须是非负有限数: ${label}`)
  }
}

/**
 * 菜品热量 = Σ(食材克数 × kcalPer100g / 100)，求和后四舍五入取整。
 * overrides 以 ingredientId 为键覆盖克数；未知食材直接抛错，避免静默算错。
 */
export function calcDishCalories(
  dish: Dish,
  overrides: GramOverrides = {},
  lookup: ReadonlyMap<string, Ingredient> = ingredientById,
): number {
  const ingredientIds = new Set(
    dish.ingredients.map((item) => item.ingredientId),
  )

  for (const key of Object.keys(overrides)) {
    if (!ingredientIds.has(key)) {
      throw new Error(`覆盖的食材不在菜品中: ${key}（菜品 ${dish.id}）`)
    }
  }

  const total = dish.ingredients.reduce((sum, item) => {
    const grams = overrides[item.ingredientId] ?? item.grams
    assertValidGrams(grams, `${item.ingredientId}（菜品 ${dish.id}）`)

    const ingredient = lookup.get(item.ingredientId)
    if (!ingredient) {
      throw new Error(`未知食材: ${item.ingredientId}（菜品 ${dish.id}）`)
    }

    return sum + calcIngredientKcal(ingredient, grams)
  }, 0)

  return Math.round(total)
}

/** 兼容旧调用；新代码请使用 calcDishCalories。 */
export function calcDishKcal(
  dish: Dish,
  lookup: ReadonlyMap<string, Ingredient>,
): number {
  return calcDishCalories(dish, {}, lookup)
}
