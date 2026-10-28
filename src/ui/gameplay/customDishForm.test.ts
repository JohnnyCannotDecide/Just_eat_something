import { describe, expect, it } from 'vitest'

import type { CustomDish } from '@/core/types'

import {
  createDishDraftFrom,
  createEmptyDishDraft,
  parseCustomDishDraft,
} from './customDishForm'
import type { CustomDishFormDraft } from './customDishForm'

function draft(
  overrides: Partial<CustomDishFormDraft> = {},
): CustomDishFormDraft {
  return {
    ...createEmptyDishDraft(),
    name: '番茄炒蛋',
    rows: [{ key: 'row-a', name: '番茄', kcalPer100g: '20', grams: '200' }],
    ...overrides,
  }
}

describe('parseCustomDishDraft', () => {
  it('parses a valid ingredient-based dish', () => {
    const result = parseCustomDishDraft(
      draft({
        emoji: '🍅',
        cookingEnabled: true,
        cooking: {
          method: '炒',
          timeMinutes: '15',
          steps: ['热锅', '炒蛋', '加番茄'],
        },
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      name: '番茄炒蛋',
      emoji: '🍅',
      category: 'main',
      meals: ['lunch', 'dinner'],
      rarity: 'R',
      calorieMode: 'ingredients',
      calories: null,
      includeInPool: true,
    })
    expect(result.value.ingredientRows).toEqual([
      { name: '番茄', kcalPer100g: 20, grams: 200 },
    ])
    expect(result.value.cooking).toEqual({
      method: '炒',
      timeMinutes: 15,
      steps: ['热锅', '炒蛋', '加番茄'],
    })
  })

  it('trims values and drops a blank emoji', () => {
    const result = parseCustomDishDraft(
      draft({
        name: '  番茄炒蛋  ',
        emoji: '   ',
        rows: [
          { key: 'a', name: ' 番茄 ', kcalPer100g: ' 20 ', grams: ' 200 ' },
        ],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('番茄炒蛋')
    expect(result.value.emoji).toBeNull()
    expect(result.value.ingredientRows[0]!.name).toBe('番茄')
  })

  it('requires a name of at most 20 characters', () => {
    const empty = parseCustomDishDraft(draft({ name: '   ' }))
    expect(empty.ok).toBe(false)
    if (!empty.ok) {
      expect(empty.errors.name).toBe('给菜谱起个名字吧')
    }

    const long = parseCustomDishDraft(draft({ name: '菜'.repeat(21) }))
    expect(long.ok).toBe(false)
    if (!long.ok) {
      expect(long.errors.name).toBe('菜谱名称最多 20 个字')
    }
  })

  it('requires at least one meal', () => {
    const result = parseCustomDishDraft(draft({ meals: [] }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.meals).toBe('至少选择一个适合的餐次')
    }
  })

  it('rejects rarities outside the allowed list', () => {
    const result = parseCustomDishDraft(draft({ rarity: 'UR' }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.rarity).toBe('这个稀有度不能用于自制菜')
    }
  })

  it('requires at least one ingredient row', () => {
    const result = parseCustomDishDraft(draft({ rows: [] }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.rows).toBe('至少添加一种食材')
    }
  })

  it('flags every invalid ingredient row', () => {
    const result = parseCustomDishDraft(
      draft({
        rows: [
          { key: 'a', name: '', kcalPer100g: '20', grams: '200' },
          { key: 'b', name: '米', kcalPer100g: '901', grams: '0' },
          { key: 'c', name: '米', kcalPer100g: '100', grams: '50' },
        ],
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.rowErrors).toEqual({
        a: { name: '填一下食材名' },
        b: {
          kcal: '热量填 0~900',
          grams: '克数填 1~2000',
        },
        c: { name: '同一种食材只填一行' },
      })
    }
  })

  it('parses total-calorie mode and ignores the rows', () => {
    const result = parseCustomDishDraft(
      draft({
        calorieMode: 'total',
        totalCalories: '480.4',
        rows: [{ key: 'a', name: '不生效', kcalPer100g: '1', grams: '1' }],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.calorieMode).toBe('total')
    expect(result.value.calories).toBe(480)
    expect(result.value.ingredientRows).toEqual([])
  })

  it('validates the total calories range', () => {
    for (const value of ['', '0', '5001', 'abc']) {
      const result = parseCustomDishDraft(
        draft({ calorieMode: 'total', totalCalories: value }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.totalCalories).toBe('总热量填 1~5000')
      }
    }
  })

  it('drops cooking when the switch is off', () => {
    const result = parseCustomDishDraft(
      draft({
        cookingEnabled: false,
        cooking: {
          method: '炒',
          timeMinutes: '15',
          steps: ['热锅', '炒蛋', '加番茄'],
        },
      }),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.cooking).toBeNull()
    }
  })

  it('requires 3~5 cooking steps', () => {
    const tooFew = parseCustomDishDraft(
      draft({
        cookingEnabled: true,
        cooking: {
          method: '炒',
          timeMinutes: '15',
          steps: ['热锅', '炒蛋'],
        },
      }),
    )
    expect(tooFew.ok).toBe(false)
    if (!tooFew.ok) {
      expect(tooFew.errors.cooking).toBe('做法至少写 3 步')
    }

    const tooLongStep = parseCustomDishDraft(
      draft({
        cookingEnabled: true,
        cooking: {
          method: '炒',
          timeMinutes: '15',
          steps: ['热锅', '炒蛋', '啊'.repeat(31)],
        },
      }),
    )
    expect(tooLongStep.ok).toBe(false)
    if (!tooLongStep.ok) {
      expect(tooLongStep.errors.cooking).toBe('请检查做法步骤')
      expect(tooLongStep.errors.cookingSteps?.[2]).toBe(
        '每一步最多 30 个字',
      )
    }
  })

  it('validates the cooking time', () => {
    for (const value of ['', '301', 'abc']) {
      const result = parseCustomDishDraft(
        draft({
          cookingEnabled: true,
          cooking: {
            method: '炒',
            timeMinutes: value,
            steps: ['热锅', '炒蛋', '加番茄'],
          },
        }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.cookingTime).toBe('时间填 0~300 分钟')
      }
    }
  })

  it('round-trips an existing dish into an editable draft', () => {
    const dish: CustomDish = {
      id: 'custom_dish:a',
      name: '番茄炒蛋',
      imageId: 'img:a',
      emoji: '🍅',
      category: 'main',
      meals: ['lunch'],
      rarity: 'SR',
      ingredientRows: [
        {
          ingredientId: 'tomato',
          name: '番茄',
          kcalPer100g: 20,
          grams: 200,
        },
      ],
      calorieMode: 'ingredients',
      calories: null,
      cooking: {
        method: '炒',
        timeMinutes: 15,
        steps: ['热锅', '炒蛋', '加番茄'],
      },
      includeInPool: false,
      archived: false,
      createdAt: '2026-10-20',
    }

    const result = parseCustomDishDraft(createDishDraftFrom(dish))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      name: '番茄炒蛋',
      emoji: '🍅',
      rarity: 'SR',
      meals: ['lunch'],
      includeInPool: false,
    })
    expect(result.value.ingredientRows[0]!.ingredientId).toBe('tomato')
    expect(result.value.cooking).toEqual(dish.cooking)
  })
})
