import { RARITY_ORDER } from '@/config/gameConfig'
import type {
  Combo,
  CookingMethod,
  Dish,
  DishCategory,
  MealType,
  Rarity,
} from '@/core/types'

/**
 * 菜品/套餐数据的内容约束。
 * 这些不是玩法规则，概率、次数等数值仍然只放在 gameConfig。
 */

export const DISH_CATEGORIES = [
  'staple',
  'main',
  'soup',
  'drink',
  'veg',
  'fruit',
  'snack',
] as const satisfies readonly DishCategory[]

export const COOKING_METHODS = [
  '蒸',
  '煮',
  '炒',
  '拌',
  '烤',
  '煎',
  '炖',
  '冲泡',
  '免煮',
  '外买',
] as const satisfies readonly CookingMethod[]

export const MEAL_TYPES = [
  'breakfast',
  'lunch',
  'dinner',
] as const satisfies readonly MealType[]

export const COOKING_STEP_MIN = 3
export const COOKING_STEP_MAX = 5
export const COOKING_STEP_MAX_CHARS = 30
export const COOKING_TIME_MAX_MINUTES = 300

export const COMBO_COMPONENT_MIN = 1
export const COMBO_COMPONENT_MAX = 4
export const MIN_COMBOS_PER_MEAL = 12
export const MAX_UR_COMBOS = 3

/** 肉、蛋、海鲜，以及含肉馅的半成品都需要“熟透”提示。 */
export const HEAT_THROUGH_INGREDIENT_IDS: ReadonlySet<string> = new Set([
  'egg',
  'quail_egg',
  'century_egg',
  'chicken_breast',
  'chicken_thigh',
  'lean_pork',
  'lean_beef',
  'beef_brisket',
  'pork_ribs',
  'salmon',
  'cod',
  'sea_bass',
  'shrimp',
  'fried_chicken',
  'xiaolongbao',
  'dumpling',
  'wonton',
  'chicken_wing',
  'beef_tendon_ball',
  'char_siu',
  'pork_trotter',
  'pork_belly',
])

const DISH_CATEGORY_SET: ReadonlySet<string> = new Set(DISH_CATEGORIES)
const COOKING_METHOD_SET: ReadonlySet<string> = new Set(COOKING_METHODS)
const MEAL_TYPE_SET: ReadonlySet<string> = new Set(MEAL_TYPES)

export function isDishCategory(value: string): value is DishCategory {
  return DISH_CATEGORY_SET.has(value)
}

export function isCookingMethod(value: string): value is CookingMethod {
  return COOKING_METHOD_SET.has(value)
}

export function isMealType(value: string): value is MealType {
  return MEAL_TYPE_SET.has(value)
}

/** 按 Unicode 码点计数，避免 emoji 被算成两个字符。 */
export function countUnicodeChars(value: string): number {
  return Array.from(value).length
}

export function requiresHeatThroughHint(dish: Dish): boolean {
  return dish.ingredients.some(({ ingredientId }) =>
    HEAT_THROUGH_INGREDIENT_IDS.has(ingredientId),
  )
}

export function isBreakfastOnly(dish: Pick<Dish, 'meals'>): boolean {
  return dish.meals.length === 1 && dish.meals[0] === 'breakfast'
}

/** 水果、甜点、饮品不能作为单部件套餐的唯一内容。 */
export function isSideOnlyCategory(category: DishCategory): boolean {
  return category === 'fruit' || category === 'drink' || category === 'snack'
}

export function comboProvides(
  combo: Pick<Combo, 'components'>,
  dishById: ReadonlyMap<string, Dish>,
  flag: 'providesStaple' | 'providesProtein',
): boolean {
  return combo.components.some(
    (dishId) => dishById.get(dishId)?.[flag] === true,
  )
}

/** 与 gameFlow.redrawComponent 的候选过滤保持一致。 */
export function isRedrawCandidate(
  dish: Pick<Dish, 'meals' | 'category' | 'rarity'>,
  meal: MealType,
  category: DishCategory,
): boolean {
  return (
    dish.meals.includes(meal) &&
    dish.category === category &&
    dish.rarity !== 'UR'
  )
}

function rarityRank(rarity: Rarity): number {
  return RARITY_ORDER.indexOf(rarity)
}

/**
 * 套餐稀有度：部件最高为 UR 时强制 UR；否则显式声明优先，缺省取部件最高。
 * 在数据加载边界调用一次，后续一律使用已解析的 Combo.rarity。
 */
export function resolveComboRarity(
  components: readonly string[],
  declaredRarity: Rarity | undefined,
  dishById: ReadonlyMap<string, Dish>,
): Rarity {
  if (components.length === 0) {
    throw new Error('套餐至少需要一个菜品部件')
  }

  let highest: Rarity = 'R'
  for (const dishId of components) {
    const dish = dishById.get(dishId)
    if (!dish) {
      throw new Error(`套餐引用了不存在的菜品: ${dishId}`)
    }
    if (rarityRank(dish.rarity) > rarityRank(highest)) {
      highest = dish.rarity
    }
  }

  if (highest === 'UR') return 'UR'
  return declaredRarity ?? highest
}
