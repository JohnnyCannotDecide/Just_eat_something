import type {
  CalorieMode,
  CookingInfo,
  CookingMethod,
  CustomDish,
  CustomDishIngredientRow,
  DishCategory,
  MealType,
  Rarity,
} from '@/core/types'
import { customDishAllowedRarities } from '@/config/gameConfig'
import { countUnicodeChars } from '@/data/dataRules'

import { DISH_CATEGORY_EMOJI } from '../dishEmoji'
import type { ProcessedImage } from '../images/processImageFile'

export const DISH_CATEGORY_LABELS: Record<DishCategory, string> = {
  staple: '主食',
  main: '主菜',
  soup: '汤羹',
  drink: '饮品',
  veg: '蔬菜',
  fruit: '水果',
  snack: '小食',
}

export interface CustomDishFormRow {
  /** React 列表 key；不参与数据。 */
  key: string
  /** 官方食材或自定义食材的 id；为空表示新建食材。 */
  ingredientId?: string
  name: string
  kcalPer100g: string
  grams: string
}

export interface CustomDishFormCooking {
  method: CookingMethod
  timeMinutes: string
  steps: string[]
}

export interface CustomDishFormDraft {
  name: string
  emoji: string
  category: DishCategory
  meals: MealType[]
  rarity: Rarity
  calorieMode: CalorieMode
  rows: CustomDishFormRow[]
  totalCalories: string
  cookingEnabled: boolean
  cooking: CustomDishFormCooking
  includeInPool: boolean
  image: ProcessedImage | null
  /** 编辑时点了“移除图片”。 */
  removeImage: boolean
}

export interface CustomDishRowErrors {
  name?: string
  kcal?: string
  grams?: string
}

export interface CustomDishFormErrors {
  name?: string
  category?: string
  meals?: string
  rarity?: string
  rows?: string
  rowErrors?: Record<string, CustomDishRowErrors>
  totalCalories?: string
  cooking?: string
  cookingTime?: string
  cookingSteps?: Array<string | undefined>
}

export interface CustomDishFormValue {
  name: string
  emoji: string | null
  category: DishCategory
  meals: MealType[]
  rarity: Rarity
  ingredientRows: CustomDishIngredientRow[]
  calorieMode: CalorieMode
  calories: number | null
  cooking: CookingInfo | null
  includeInPool: boolean
}

export type CustomDishParseResult =
  | { ok: true; value: CustomDishFormValue }
  | { ok: false; errors: CustomDishFormErrors }

let rowSequence = 0

export function createRowKey(): string {
  rowSequence += 1
  return `row-${rowSequence}`
}

export function createEmptyRow(): CustomDishFormRow {
  return {
    key: createRowKey(),
    name: '',
    kcalPer100g: '',
    grams: '',
  }
}

export function createEmptyDishDraft(): CustomDishFormDraft {
  return {
    name: '',
    emoji: DISH_CATEGORY_EMOJI.main,
    category: 'main',
    meals: ['lunch', 'dinner'],
    rarity: 'R',
    calorieMode: 'ingredients',
    rows: [createEmptyRow()],
    totalCalories: '',
    cookingEnabled: false,
    cooking: {
      method: '煮',
      timeMinutes: '20',
      steps: ['', '', ''],
    },
    includeInPool: true,
    image: null,
    removeImage: false,
  }
}

export function createDishDraftFrom(dish: CustomDish): CustomDishFormDraft {
  return {
    name: dish.name,
    emoji: dish.emoji ?? DISH_CATEGORY_EMOJI[dish.category],
    category: dish.category,
    meals: [...dish.meals],
    rarity: dish.rarity,
    calorieMode: dish.calorieMode,
    rows:
      dish.ingredientRows.length > 0
        ? dish.ingredientRows.map((row) => ({
            key: createRowKey(),
            ...(row.ingredientId ? { ingredientId: row.ingredientId } : {}),
            name: row.name,
            kcalPer100g: String(row.kcalPer100g),
            grams: String(row.grams),
          }))
        : [createEmptyRow()],
    totalCalories: dish.calories === null ? '' : String(dish.calories),
    cookingEnabled: dish.cooking !== null,
    cooking: {
      method: dish.cooking?.method ?? '煮',
      timeMinutes: String(dish.cooking?.timeMinutes ?? 20),
      steps:
        dish.cooking?.steps.length && dish.cooking.steps.length > 0
          ? [...dish.cooking.steps]
          : ['', '', ''],
    },
    includeInPool: dish.includeInPool,
    image: null,
    removeImage: false,
  }
}

function parseNumber(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

function hasErrors(errors: CustomDishFormErrors): boolean {
  return Object.values(errors).some((value) => value !== undefined)
}

/** 表单校验：不依赖 UI 状态，可直接单测。 */
export function parseCustomDishDraft(
  draft: CustomDishFormDraft,
): CustomDishParseResult {
  const errors: CustomDishFormErrors = {}

  const name = draft.name.trim()
  if (name.length === 0) {
    errors.name = '给菜谱起个名字吧'
  } else if (countUnicodeChars(name) > 20) {
    errors.name = '菜谱名称最多 20 个字'
  }

  if (draft.meals.length === 0) {
    errors.meals = '至少选择一个适合的餐次'
  }

  if (
    !customDishAllowedRarities.some((rarity) => rarity === draft.rarity)
  ) {
    errors.rarity = '这个稀有度不能用于自制菜'
  }

  const rows: CustomDishIngredientRow[] = []
  if (draft.calorieMode === 'ingredients') {
    const rowErrors: Record<string, CustomDishRowErrors> = {}
    const seen = new Set<string>()

    for (const row of draft.rows) {
      const rowName = row.name.trim()
      const grams = parseNumber(row.grams)
      const kcal = parseNumber(row.kcalPer100g)
      const current: CustomDishRowErrors = {}

      if (!rowName) {
        current.name = '填一下食材名'
      } else if (countUnicodeChars(rowName) > 12) {
        current.name = '食材名最多 12 个字'
      } else if (seen.has(rowName)) {
        current.name = '同一种食材只填一行'
      }

      if (kcal === null || kcal < 0 || kcal > 900) {
        current.kcal = '热量填 0~900'
      }
      if (grams === null || grams < 1 || grams > 2000) {
        current.grams = '克数填 1~2000'
      }

      if (rowName) {
        seen.add(rowName)
      }

      if (Object.keys(current).length > 0) {
        rowErrors[row.key] = current
      } else if (kcal !== null && grams !== null) {
        rows.push({
          ...(row.ingredientId ? { ingredientId: row.ingredientId } : {}),
          name: rowName,
          kcalPer100g: kcal,
          grams,
        })
      }
    }

    if (draft.rows.length === 0) {
      errors.rows = '至少添加一种食材'
    } else if (Object.keys(rowErrors).length > 0) {
      errors.rows = '请检查标红的食材行'
      errors.rowErrors = rowErrors
    }
  }

  let total: number | null = null
  if (draft.calorieMode === 'total') {
    total = parseNumber(draft.totalCalories)
    if (total === null || total < 1 || total > 5000) {
      errors.totalCalories = '总热量填 1~5000'
    }
  }

  let cooking: CookingInfo | null = null
  if (draft.cookingEnabled) {
    const time = parseNumber(draft.cooking.timeMinutes)
    const steps = draft.cooking.steps.map((step) => step.trim())
    const stepErrors = steps.map((step) => {
      if (!step) {
        return '这一步还没写'
      }
      if (countUnicodeChars(step) > 30) {
        return '每一步最多 30 个字'
      }
      return undefined
    })
    const filled = steps.filter((step) => step.length > 0)

    if (filled.length < 3) {
      errors.cooking = '做法至少写 3 步'
    } else if (filled.length > 5) {
      errors.cooking = '做法最多 5 步'
    } else if (stepErrors.some((error) => error !== undefined)) {
      errors.cooking = '请检查做法步骤'
    }
    if (stepErrors.some((error) => error !== undefined)) {
      errors.cookingSteps = stepErrors
    }
    if (time === null || time < 0 || time > 300) {
      errors.cookingTime = '时间填 0~300 分钟'
    }

    if (
      !errors.cooking &&
      !errors.cookingTime &&
      !errors.cookingSteps
    ) {
      cooking = {
        method: draft.cooking.method,
        timeMinutes: Math.round(time ?? 0),
        steps: filled,
      }
    }
  }

  if (hasErrors(errors)) {
    return { ok: false, errors }
  }

  const emoji = draft.emoji.trim()

  return {
    ok: true,
    value: {
      name,
      emoji: emoji.length > 0 ? emoji.slice(0, 16) : null,
      category: draft.category,
      meals: [...draft.meals],
      rarity: draft.rarity,
      ingredientRows: draft.calorieMode === 'total' ? [] : rows,
      calorieMode: draft.calorieMode,
      calories:
        draft.calorieMode === 'total' && total !== null
          ? Math.round(total)
          : null,
      cooking,
      includeInPool: draft.includeInPool,
    },
  }
}
