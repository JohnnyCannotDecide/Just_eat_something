export interface CustomMealDraft {
  name: string
  calories: string
}

export interface CustomMealErrors {
  name?: string
  calories?: string
}

export type CustomMealParseResult =
  | { ok: true; value: { name: string; calories: number | null } }
  | { ok: false; errors: CustomMealErrors }

export function createCustomDraft(): CustomMealDraft {
  return { name: '', calories: '' }
}

/** 自定义记录只收名称与可选热量；名称 trim，热量取整后交给 core 再校验一次。 */
export function parseCustomMealDraft(
  draft: CustomMealDraft,
): CustomMealParseResult {
  const errors: CustomMealErrors = {}
  const name = draft.name.trim()

  if (name.length === 0) {
    errors.name = '给这餐起个名字吧'
  }

  const calorieText = draft.calories.trim()
  let calories: number | null = null
  if (calorieText.length > 0) {
    const parsed = Number(calorieText)
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.calories = '热量要填 0 或更大的数字，或留空'
    } else {
      calories = Math.round(parsed)
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    value: { name, calories },
  }
}
