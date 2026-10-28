import {
  combos as defaultCombos,
  dishes as defaultDishes,
} from '@/data'

import type { AppData } from '@/storage/appData'

import type { Combo, CustomDish, Dish } from './types'

/** 没上传图片又没有 emoji 时使用的兜底图标。 */
export const CUSTOM_DISH_FALLBACK_EMOJI = '🍽️'
export const CUSTOM_DISH_ID_PREFIX = 'custom_dish:'
export const CUSTOM_COMBO_ID_PREFIX = 'custom_combo:'
export const CUSTOM_INGREDIENT_ID_PREFIX = 'custom_ingredient:'
export const IMAGE_ID_PREFIX = 'img:'

function randomToken(): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createCustomDishId(): string {
  return `${CUSTOM_DISH_ID_PREFIX}${randomToken()}`
}

export function createCustomIngredientId(): string {
  return `${CUSTOM_INGREDIENT_ID_PREFIX}${randomToken()}`
}

export function createImageId(): string {
  return `${IMAGE_ID_PREFIX}${randomToken()}`
}

/**
 * 自制菜热量：
 * - total 模式直接用手填总热量；
 * - ingredients 模式按克数累加，四舍五入；
 * - 没有任何食材时为 null（不计入结算）。
 */
export function calcCustomDishCalories(dish: CustomDish): number | null {
  if (dish.calorieMode === 'total') {
    return dish.calories === null ? null : Math.round(dish.calories)
  }
  if (dish.ingredientRows.length === 0) {
    return null
  }

  const total = dish.ingredientRows.reduce(
    (sum, row) => sum + (row.kcalPer100g * row.grams) / 100,
    0,
  )
  return Math.round(total)
}

/**
 * 自制菜 → 运行时菜品。
 * 食材详情直接带上名称与热量，避免依赖官方食材表；
 * 总热量显式传入，抽卡/添加生成的部件不依赖官方食材也能算热量。
 */
export function buildLibraryDish(custom: CustomDish): Dish {
  return {
    id: custom.id,
    name: custom.name,
    rarity: custom.rarity,
    category: custom.category,
    meals: [...custom.meals],
    ingredients: custom.ingredientRows.map((row, index) => ({
      ingredientId: row.ingredientId ?? `${custom.id}:ingredient:${index + 1}`,
      grams: row.grams,
    })),
    // 图片位留给 imageId；没有上传图时由 emoji 兜底，避免出现 <img src="🍅">。
    image: '',
    ...(custom.imageId ? { imageId: custom.imageId } : {}),
    emoji: custom.emoji ?? CUSTOM_DISH_FALLBACK_EMOJI,
    isCustom: true,
    archived: custom.archived,
    ingredientDetails: custom.ingredientRows.map((row) => ({
      ...(row.ingredientId ? { ingredientId: row.ingredientId } : {}),
      name: row.name,
      kcalPer100g: row.kcalPer100g,
      grams: row.grams,
    })),
    calories: calcCustomDishCalories(custom),
    cooking: custom.cooking
      ? { ...custom.cooking, steps: [...custom.cooking.steps] }
      : null,
  }
}

/** 每道自制菜对应一个隐藏的单部件套餐，用于进抽卡池。 */
export function buildHiddenCombo(custom: CustomDish): Combo {
  return {
    id: `${CUSTOM_COMBO_ID_PREFIX}${custom.id}`,
    name: custom.name,
    rarity: custom.rarity,
    meals: [...custom.meals],
    components: [custom.id],
  }
}

export interface DishLibrary {
  /** 可被抽卡 / 重抽 / 添加的菜：官方菜 + 未归档自制菜。 */
  dishes: Dish[]
  /** 添加部件时的候选查询；归档菜不在其中。 */
  poolDishById: Map<string, Dish>
  /** 查询用的全部菜品，包含归档自制菜（历史与印章仍要能查）。 */
  dishById: Map<string, Dish>
  /** 抽卡池：官方套餐 + 未归档且开启入池的隐藏套餐。 */
  combos: Combo[]
  comboById: Map<string, Combo>
}

/** 把自制菜合并进官方目录，得到本次会话使用的菜品库。 */
export function buildDishLibrary(
  data: Pick<AppData, 'customDishes'>,
  officialDishes: readonly Dish[] = defaultDishes,
  officialCombos: readonly Combo[] = defaultCombos,
): DishLibrary {
  const activeCustom = data.customDishes.filter((dish) => !dish.archived)
  const poolCustom = activeCustom.filter((dish) => dish.includeInPool)

  const dishes = [...officialDishes, ...activeCustom.map(buildLibraryDish)]
  const poolDishById = new Map(dishes.map((dish) => [dish.id, dish]))
  const dishById = new Map(poolDishById)
  for (const archived of data.customDishes.filter((dish) => dish.archived)) {
    dishById.set(archived.id, buildLibraryDish(archived))
  }

  const combos = [...officialCombos, ...poolCustom.map(buildHiddenCombo)]
  const comboById = new Map(combos.map((combo) => [combo.id, combo]))

  return { dishes, poolDishById, dishById, combos, comboById }
}

/**
 * 这道菜是否已有打卡记录：有印章，或在任一已打卡餐的选中套餐里出现过。
 * 决定删除时是归档还是真删。
 */
export function hasCheckInRecords(
  data: Pick<AppData, 'stamps' | 'days'>,
  dishId: string,
): boolean {
  const stamp = data.stamps[dishId]
  if (stamp && stamp.checkInCount > 0) {
    return true
  }

  for (const day of Object.values(data.days)) {
    for (const meal of Object.values(day.meals)) {
      if (!meal.budget.checkedIn) {
        continue
      }
      const selected = meal.candidateCombos.find(
        (candidate) => candidate.id === meal.selectedCandidateId,
      )
      if (
        selected?.components.some((component) => component.dishId === dishId)
      ) {
        return true
      }
    }
  }

  return false
}

export interface SnapshotReferenceTarget {
  dishId?: string
  imageId?: string
  /** 检查图片引用时忽略这道菜自己（编辑换图 / 删除场景）。 */
  ignoreDishId?: string
}

/**
 * 历史套餐、未选中的草稿、自制菜本身是否还引用某个 dishId / imageId。
 * 真删菜品和清理图片前用它兜底，宁可留成孤儿也不让历史破图。
 */
export function hasAnySnapshotReference(
  data: Pick<AppData, 'days' | 'customDishes'>,
  target: SnapshotReferenceTarget,
): boolean {
  if (target.imageId) {
    const referencedByDish = data.customDishes.some(
      (dish) =>
        dish.id !== target.ignoreDishId && dish.imageId === target.imageId,
    )
    if (referencedByDish) {
      return true
    }
  }

  for (const day of Object.values(data.days)) {
    for (const meal of Object.values(day.meals)) {
      for (const candidate of meal.candidateCombos) {
        for (const component of candidate.components) {
          if (target.dishId && component.dishId === target.dishId) {
            return true
          }
          if (target.imageId && component.imageId === target.imageId) {
            return true
          }
        }
      }
    }
  }

  return false
}
