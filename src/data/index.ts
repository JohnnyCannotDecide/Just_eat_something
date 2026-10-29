import type {
  Combo,
  CookingInfo,
  CookingMethod,
  Dish,
  DishCategory,
  DishIngredient,
  Ingredient,
  MealType,
  Rarity,
} from '@/core/types'

import combosJson from './combos.json'
import {
  isCookingMethod,
  isDishCategory,
  isMealType,
  resolveComboRarity,
} from './dataRules'
import dishesJson from './dishes.json'
import ingredientsJson from './ingredients.json'

interface RawCooking {
  method: string
  timeMinutes: number
  steps: readonly string[]
  tips?: string
}

interface RawDish {
  id: string
  name: string
  rarity: string
  category: string
  meals: readonly string[]
  providesStaple?: boolean
  providesProtein?: boolean
  ingredients: readonly DishIngredient[]
  image: string
  stampImage?: string
  tip?: string
  cooking: RawCooking
}

interface RawCombo {
  id: string
  name: string
  rarity?: string
  meals: readonly string[]
  components: readonly string[]
  tip?: string
}

/** JSON 里的 rarity 是普通字符串，这里收窄成字面量并顺手校验。 */
export function parseRarity(value: string): Rarity {
  if (value === 'R' || value === 'SR' || value === 'SSR' || value === 'UR') {
    return value
  }
  throw new Error(`未知稀有度: ${value}`)
}

function parseDishCategory(value: string, context: string): DishCategory {
  if (isDishCategory(value)) return value
  throw new Error(`${context} 的分类不合法: ${value}`)
}

function parseCookingMethod(value: string, context: string): CookingMethod {
  if (isCookingMethod(value)) return value
  throw new Error(`${context} 的做法不合法: ${value}`)
}

function parseMealType(value: string, context: string): MealType {
  if (isMealType(value)) return value
  throw new Error(`${context} 的餐次不合法: ${value}`)
}

function parseMeals(values: readonly string[], context: string): MealType[] {
  if (values.length === 0) {
    throw new Error(`${context} 至少需要一个餐次`)
  }
  return values.map((value) => parseMealType(value, context))
}

function parseCooking(raw: RawCooking, context: string): CookingInfo {
  return {
    method: parseCookingMethod(raw.method, context),
    timeMinutes: raw.timeMinutes,
    steps: [...raw.steps],
    ...(raw.tips !== undefined ? { tips: raw.tips } : {}),
  }
}

function parseDish(raw: RawDish): Dish {
  const context = `菜品 ${raw.id}`
  return {
    id: raw.id,
    name: raw.name,
    rarity: parseRarity(raw.rarity),
    category: parseDishCategory(raw.category, context),
    meals: parseMeals(raw.meals, context),
    ...(raw.providesStaple !== undefined
      ? { providesStaple: raw.providesStaple }
      : {}),
    ...(raw.providesProtein !== undefined
      ? { providesProtein: raw.providesProtein }
      : {}),
    ingredients: raw.ingredients.map(({ ingredientId, grams }) => ({
      ingredientId,
      grams,
    })),
    image: raw.image,
    ...(raw.stampImage !== undefined ? { stampImage: raw.stampImage } : {}),
    ...(raw.tip !== undefined ? { tip: raw.tip } : {}),
    cooking: parseCooking(raw.cooking, context),
  }
}

function parseCombo(
  raw: RawCombo,
  dishMap: ReadonlyMap<string, Dish>,
): Combo {
  const context = `套餐 ${raw.id}`
  const components = [...raw.components]
  return {
    id: raw.id,
    name: raw.name,
    rarity: resolveComboRarity(
      components,
      raw.rarity === undefined ? undefined : parseRarity(raw.rarity),
      dishMap,
    ),
    meals: parseMeals(raw.meals, context),
    components,
    ...(raw.tip !== undefined ? { tip: raw.tip } : {}),
  }
}

export const ingredients: readonly Ingredient[] = ingredientsJson.ingredients

const rawDishes: readonly RawDish[] = dishesJson.dishes

export const dishes: readonly Dish[] = rawDishes.map(parseDish)

export const ingredientById: ReadonlyMap<string, Ingredient> = new Map(
  ingredients.map((ingredient) => [ingredient.id, ingredient]),
)

export const dishById: ReadonlyMap<string, Dish> = new Map(
  dishes.map((dish) => [dish.id, dish]),
)

const rawCombos: readonly RawCombo[] = combosJson.combos

export const combos: readonly Combo[] = rawCombos.map((combo) =>
  parseCombo(combo, dishById),
)

export const comboById: ReadonlyMap<string, Combo> = new Map(
  combos.map((combo) => [combo.id, combo]),
)
