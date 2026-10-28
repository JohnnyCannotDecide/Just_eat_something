import {
  calcMealCalories,
  scaleComponentToTotal,
  withComponentIngredientGrams,
  withCustomComponentCalories,
} from '@/core/components'
import type {
  ComponentIngredientSnapshot,
  MealComponentSnapshot,
} from '@/core/types'

export type ComboCheckInDraft = {
  eaten: Record<string, boolean>
  ingredientGrams: Record<string, Record<string, string>>
  customCalories: Record<string, string>
}

export type ComboFieldErrors = Record<string, string>

export interface ComboCheckInValues {
  eaten: Record<string, boolean>
  ingredientGrams: Record<string, Record<string, number>>
  customCalories: Record<string, number | null>
}

export type ComboCheckInParseResult =
  | { ok: true; values: ComboCheckInValues }
  | { ok: false; errors: ComboFieldErrors }

function parseGrams(raw: string | undefined): number | null {
  const text = (raw ?? '').trim()
  if (text.length === 0) {
    return null
  }
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0) {
    return null
  }
  return value
}

function ingredientKey(
  item: ComponentIngredientSnapshot,
  index: number,
): string {
  return item.ingredientId ?? String(index)
}

function fieldKey(componentId: string, key: string): string {
  return `${componentId}:${key}`
}

function activeComponents(
  components: readonly MealComponentSnapshot[],
): MealComponentSnapshot[] {
  return components.filter((component) => !component.discarded)
}

/** 打卡草稿以部件实例 id 为 key，避免两个部件共用食材时互相覆盖。 */
export function createComboCheckInDraft(
  components: readonly MealComponentSnapshot[],
): ComboCheckInDraft {
  const draft: ComboCheckInDraft = {
    eaten: {},
    ingredientGrams: {},
    customCalories: {},
  }

  for (const component of activeComponents(components)) {
    draft.eaten[component.id] = component.eaten
    if (component.kind === 'dish') {
      const grams: Record<string, string> = {}
      component.ingredients.forEach((item, index) => {
        grams[ingredientKey(item, index)] = String(item.grams)
      })
      draft.ingredientGrams[component.id] = grams
    } else {
      draft.customCalories[component.id] =
        component.calories === null ? '' : String(component.calories)
    }
  }

  return draft
}

export function setDraftEaten(
  draft: ComboCheckInDraft,
  componentId: string,
  eaten: boolean,
): ComboCheckInDraft {
  return {
    ...draft,
    eaten: { ...draft.eaten, [componentId]: eaten },
  }
}

export function setDraftIngredientGrams(
  draft: ComboCheckInDraft,
  componentId: string,
  key: string,
  value: string,
): ComboCheckInDraft {
  return {
    ...draft,
    ingredientGrams: {
      ...draft.ingredientGrams,
      [componentId]: {
        ...(draft.ingredientGrams[componentId] ?? {}),
        [key]: value,
      },
    },
  }
}

export function setDraftCustomCalories(
  draft: ComboCheckInDraft,
  componentId: string,
  value: string,
): ComboCheckInDraft {
  return {
    ...draft,
    customCalories: { ...draft.customCalories, [componentId]: value },
  }
}

/** 用草稿里的合法克数还原部件；非法/缺失项沿用快照克数。 */
export function componentWithDraftGrams(
  component: MealComponentSnapshot,
  draft: ComboCheckInDraft,
): MealComponentSnapshot {
  if (component.kind !== 'dish' || component.ingredients.length === 0) {
    return component
  }

  const overrides: Record<string, number> = {}
  component.ingredients.forEach((item, index) => {
    const grams = parseGrams(
      draft.ingredientGrams[component.id]?.[ingredientKey(item, index)],
    )
    if (grams !== null) {
      overrides[ingredientKey(item, index)] = grams
    }
  })

  return withComponentIngredientGrams(component, overrides)
}

export function componentDraftTotal(
  component: MealComponentSnapshot,
  draft: ComboCheckInDraft,
): number {
  if (component.kind !== 'dish') {
    return 0
  }
  const current = componentWithDraftGrams(component, draft)
  return current.grams ?? 0
}

/**
 * 修改总克数：按草稿中的当前比例缩放全部食材。
 * 非法输入原样返回，由 UI 展示错误。
 */
export function setDraftTotalGrams(
  draft: ComboCheckInDraft,
  component: MealComponentSnapshot,
  value: string,
): ComboCheckInDraft {
  if (component.kind !== 'dish' || component.ingredients.length === 0) {
    return draft
  }
  const total = parseGrams(value)
  if (total === null) {
    return draft
  }

  const current = componentWithDraftGrams(component, draft)
  const scaled = scaleComponentToTotal(current, total)
  const grams: Record<string, string> = {}
  scaled.ingredients.forEach((item, index) => {
    grams[ingredientKey(item, index)] = String(item.grams)
  })

  return {
    ...draft,
    ingredientGrams: {
      ...draft.ingredientGrams,
      [component.id]: grams,
    },
  }
}

export function previewComboCalories(
  components: readonly MealComponentSnapshot[],
  draft: ComboCheckInDraft,
): number {
  const preview = activeComponents(components).map((component) => {
    const eaten = draft.eaten[component.id] ?? component.eaten
    if (!eaten) {
      return { ...component, eaten: false }
    }

    if (component.kind === 'custom') {
      const raw = draft.customCalories[component.id] ?? ''
      const text = raw.trim()
      if (text.length === 0) {
        return withCustomComponentCalories(component, null)
      }
      const value = parseGrams(raw)
      return withCustomComponentCalories(component, value)
    }

    return componentWithDraftGrams(component, draft)
  })

  return calcMealCalories(preview) ?? 0
}

/** 提交前校验：只校验勾选部件；至少勾选一项。 */
export function parseComboCheckInDraft(
  components: readonly MealComponentSnapshot[],
  draft: ComboCheckInDraft,
): ComboCheckInParseResult {
  const active = activeComponents(components)
  const errors: ComboFieldErrors = {}
  const values: ComboCheckInValues = {
    eaten: {},
    ingredientGrams: {},
    customCalories: {},
  }

  if (active.length === 0) {
    return { ok: false, errors: { form: '这餐没有可以结算的部件' } }
  }

  for (const component of active) {
    const eaten = draft.eaten[component.id] ?? component.eaten
    values.eaten[component.id] = eaten
    if (!eaten) {
      continue
    }

    if (component.kind === 'dish') {
      const grams: Record<string, number> = {}
      component.ingredients.forEach((item, index) => {
        const key = ingredientKey(item, index)
        const parsed = parseGrams(
          draft.ingredientGrams[component.id]?.[key],
        )
        if (parsed === null) {
          errors[fieldKey(component.id, key)] =
            (draft.ingredientGrams[component.id]?.[key] ?? '').trim().length ===
            0
              ? '填个克数吧'
              : '克数要是 0 或更大的数字'
          return
        }
        grams[key] = parsed
      })
      values.ingredientGrams[component.id] = grams
    } else {
      const raw = draft.customCalories[component.id] ?? ''
      const text = raw.trim()
      if (text.length === 0) {
        values.customCalories[component.id] = null
      } else {
        const parsed = parseGrams(raw)
        if (parsed === null) {
          errors[fieldKey(component.id, 'calories')] =
            '热量要填 0 或更大的数字，或留空'
        } else {
          values.customCalories[component.id] = Math.round(parsed)
        }
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }
  if (!Object.values(values.eaten).some(Boolean)) {
    return { ok: false, errors: { form: '至少勾选一个吃掉的部件' } }
  }

  return { ok: true, values }
}

/**
 * 关闭面板时保存草稿中的合法修改：
 * 返回已校验的克数/热量，非法项不会写入。
 */
export function collectDraftUpdates(
  component: MealComponentSnapshot,
  draft: ComboCheckInDraft,
): {
  eaten: boolean
  grams: Record<string, number> | null
  calories: number | null | undefined
} {
  const eaten = draft.eaten[component.id] ?? component.eaten

  if (component.kind === 'custom') {
    const raw = draft.customCalories[component.id] ?? ''
    const text = raw.trim()
    if (text.length === 0) {
      return { eaten, grams: null, calories: null }
    }
    const parsed = parseGrams(raw)
    return {
      eaten,
      grams: null,
      calories: parsed === null ? undefined : Math.round(parsed),
    }
  }

  const grams: Record<string, number> = {}
  let valid = true
  component.ingredients.forEach((item, index) => {
    const key = ingredientKey(item, index)
    const parsed = parseGrams(draft.ingredientGrams[component.id]?.[key])
    if (parsed === null) {
      valid = false
      return
    }
    grams[key] = parsed
  })

  return { eaten, grams: valid ? grams : null, calories: undefined }
}

export function comboFieldError(
  errors: ComboFieldErrors,
  componentId: string,
  key: string,
): string | undefined {
  return errors[fieldKey(componentId, key)]
}
