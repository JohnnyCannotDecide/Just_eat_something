import { describe, expect, it } from 'vitest'

import { createCustomComponent } from '@/core/components'
import type { MealComponentSnapshot } from '@/core/types'

import {
  collectDraftUpdates,
  comboFieldError,
  componentDraftTotal,
  componentWithDraftGrams,
  createComboCheckInDraft,
  parseComboCheckInDraft,
  previewComboCalories,
  setDraftCustomCalories,
  setDraftEaten,
  setDraftIngredientGrams,
  setDraftTotalGrams,
} from './comboCheckInForm'

function dishComponent(
  overrides: Partial<MealComponentSnapshot> = {},
): MealComponentSnapshot {
  return {
    id: 'comp:combo:rice-egg:1',
    kind: 'dish',
    origin: 'combo',
    dishId: 'rice_egg',
    name: '米饭加蛋',
    category: 'staple',
    rarity: 'R',
    image: null,
    cooking: null,
    ingredients: [
      {
        ingredientId: 'rice',
        name: '米饭',
        kcalPer100g: 116,
        grams: 200,
      },
      {
        ingredientId: 'egg',
        name: '鸡蛋',
        kcalPer100g: 144,
        grams: 100,
      },
    ],
    grams: 300,
    calories: 376,
    eaten: true,
    discarded: false,
    ...overrides,
  }
}

const custom = createCustomComponent({ name: '奶茶', calories: 300 }, 'custom:1')

describe('createComboCheckInDraft', () => {
  it('keys drafts by component id and skips discarded components', () => {
    const discarded = dishComponent({ id: 'gone', discarded: true })
    const draft = createComboCheckInDraft([
      dishComponent(),
      custom,
      discarded,
    ])

    expect(draft.eaten).toEqual({
      'comp:combo:rice-egg:1': true,
      'custom:1': true,
    })
    expect(draft.ingredientGrams).toEqual({
      'comp:combo:rice-egg:1': { rice: '200', egg: '100' },
    })
    expect(draft.customCalories).toEqual({ 'custom:1': '300' })
  })

  it('keeps two components with the same ingredients independent', () => {
    const first = dishComponent({ id: 'a' })
    const second = dishComponent({ id: 'b', eaten: false })
    const draft = createComboCheckInDraft([first, second])

    const next = setDraftIngredientGrams(
      setDraftEaten(draft, 'a', false),
      'b',
      'rice',
      '50',
    )

    expect(next.eaten).toEqual({ a: false, b: false })
    expect(next.ingredientGrams.a?.rice).toBe('200')
    expect(next.ingredientGrams.b?.rice).toBe('50')
  })

  it('stores an empty string for null custom calories', () => {
    const empty = createCustomComponent({ name: '水', calories: null }, 'c')
    const draft = createComboCheckInDraft([empty])

    expect(draft.customCalories.c).toBe('')
  })
})

describe('draft edits', () => {
  it('does not mutate the previous draft', () => {
    const draft = createComboCheckInDraft([dishComponent()])

    const eaten = setDraftEaten(draft, draft.eaten ? Object.keys(draft.eaten)[0]! : 'x', false)
    const grams = setDraftIngredientGrams(
      draft,
      'comp:combo:rice-egg:1',
      'rice',
      '50',
    )
    const calories = setDraftCustomCalories(draft, 'custom:1', '250')

    expect(draft.eaten['comp:combo:rice-egg:1']).toBe(true)
    expect(draft.ingredientGrams['comp:combo:rice-egg:1']?.rice).toBe('200')
    expect(draft.customCalories['custom:1']).toBeUndefined()
    expect(eaten).not.toBe(draft)
    expect(grams).not.toBe(draft)
    expect(calories.customCalories['custom:1']).toBe('250')
  })

  it('restores a component from valid draft grams', () => {
    const component = dishComponent()
    const draft = setDraftIngredientGrams(
      createComboCheckInDraft([component]),
      component.id,
      'egg',
      '50',
    )

    const next = componentWithDraftGrams(component, draft)

    expect(next.ingredients.map((item) => item.grams)).toEqual([200, 50])
    expect(next.grams).toBe(250)
    expect(next.calories).toBe(304)
  })

  it('falls back to snapshot grams for empty or invalid values', () => {
    const component = dishComponent()
    const draft = setDraftIngredientGrams(
      setDraftIngredientGrams(
        createComboCheckInDraft([component]),
        component.id,
        'rice',
        '',
      ),
      component.id,
      'egg',
      '-3',
    )

    const next = componentWithDraftGrams(component, draft)

    expect(next.grams).toBe(300)
  })

  it('scales all ingredients when the total grams change', () => {
    const component = dishComponent()
    const draft = setDraftTotalGrams(
      createComboCheckInDraft([component]),
      component,
      '600',
    )

    expect(draft.ingredientGrams[component.id]).toEqual({
      rice: '400',
      egg: '200',
    })
    expect(componentDraftTotal(component, draft)).toBe(600)
    expect(previewComboCalories([component], draft)).toBe(752)
  })

  it('ignores invalid totals and custom components', () => {
    const component = dishComponent()
    const draft = createComboCheckInDraft([component])

    expect(setDraftTotalGrams(draft, component, '-1')).toBe(draft)
    expect(setDraftTotalGrams(draft, component, 'abc')).toBe(draft)
    expect(setDraftTotalGrams(draft, custom, '100')).toBe(draft)
    expect(componentDraftTotal(custom, draft)).toBe(0)
  })
})

describe('previewComboCalories', () => {
  it('only counts eaten components and updates live', () => {
    const first = dishComponent({ id: 'a' })
    const second = dishComponent({ id: 'b' })
    const draft = createComboCheckInDraft([first, second])

    expect(previewComboCalories([first, second], draft)).toBe(752)

    const withoutFirst = setDraftEaten(draft, 'a', false)
    expect(previewComboCalories([first, second], withoutFirst)).toBe(376)

    const doubledEgg = setDraftIngredientGrams(
      withoutFirst,
      'b',
      'egg',
      '200',
    )
    expect(previewComboCalories([first, second], doubledEgg)).toBe(520)
  })

  it('reflects custom calorie edits and null values', () => {
    const draft = createComboCheckInDraft([custom])

    expect(previewComboCalories([custom], draft)).toBe(300)
    expect(
      previewComboCalories(
        [custom],
        setDraftCustomCalories(draft, custom.id, '250'),
      ),
    ).toBe(250)
    expect(
      previewComboCalories(
        [custom],
        setDraftCustomCalories(draft, custom.id, ''),
      ),
    ).toBe(0)
  })

  it('ignores discarded components', () => {
    const kept = dishComponent({ id: 'a' })
    const gone = dishComponent({ id: 'b', discarded: true })
    const draft = createComboCheckInDraft([kept, gone])

    expect(previewComboCalories([kept, gone], draft)).toBe(376)
  })
})

describe('parseComboCheckInDraft', () => {
  it('returns values for the checked components', () => {
    const component = dishComponent()
    const draft = setDraftIngredientGrams(
      createComboCheckInDraft([component]),
      component.id,
      'egg',
      '50',
    )

    const parsed = parseComboCheckInDraft([component], draft)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.values).toEqual({
      eaten: { [component.id]: true },
      ingredientGrams: { [component.id]: { rice: 200, egg: 50 } },
      customCalories: {},
    })
  })

  it('skips validation for components that were not eaten', () => {
    const component = dishComponent()
    const draft = setDraftIngredientGrams(
      setDraftEaten(
        createComboCheckInDraft([component]),
        component.id,
        false,
      ),
      component.id,
      'rice',
      'abc',
    )

    const parsed = parseComboCheckInDraft([component], draft)

    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors).toEqual({ form: '至少勾选一个吃掉的部件' })
  })

  it('reports missing and invalid grams per field', () => {
    const component = dishComponent()
    const draft = setDraftIngredientGrams(
      setDraftIngredientGrams(
        createComboCheckInDraft([component]),
        component.id,
        'rice',
        '',
      ),
      component.id,
      'egg',
      'abc',
    )

    const parsed = parseComboCheckInDraft([component], draft)

    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(comboFieldError(parsed.errors, component.id, 'rice')).toBe(
      '填个克数吧',
    )
    expect(comboFieldError(parsed.errors, component.id, 'egg')).toBe(
      '克数要是 0 或更大的数字',
    )
  })

  it('requires at least one eaten component', () => {
    const component = dishComponent()
    const draft = setDraftEaten(
      createComboCheckInDraft([component]),
      component.id,
      false,
    )

    const parsed = parseComboCheckInDraft([component], draft)

    expect(parsed).toEqual({
      ok: false,
      errors: { form: '至少勾选一个吃掉的部件' },
    })
  })

  it('rejects a meal with no active components', () => {
    expect(
      parseComboCheckInDraft(
        [dishComponent({ discarded: true })],
        createComboCheckInDraft([]),
      ),
    ).toEqual({
      ok: false,
      errors: { form: '这餐没有可以结算的部件' },
    })
  })

  it('accepts null, rounds, and validates custom calories', () => {
    const draft = createComboCheckInDraft([custom])

    const blank = parseComboCheckInDraft(
      [custom],
      setDraftCustomCalories(draft, custom.id, '  '),
    )
    expect(blank.ok).toBe(true)
    if (blank.ok) {
      expect(blank.values.customCalories[custom.id]).toBeNull()
    }

    const rounded = parseComboCheckInDraft(
      [custom],
      setDraftCustomCalories(draft, custom.id, '250.6'),
    )
    expect(rounded.ok).toBe(true)
    if (rounded.ok) {
      expect(rounded.values.customCalories[custom.id]).toBe(251)
    }

    const invalid = parseComboCheckInDraft(
      [custom],
      setDraftCustomCalories(draft, custom.id, '-1'),
    )
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) {
      expect(comboFieldError(invalid.errors, custom.id, 'calories')).toBe(
        '热量要填 0 或更大的数字，或留空',
      )
    }
  })
})

describe('collectDraftUpdates', () => {
  it('flushes valid dish grams and ignores invalid ones', () => {
    const component = dishComponent()
    const draft = setDraftIngredientGrams(
      createComboCheckInDraft([component]),
      component.id,
      'egg',
      '50',
    )

    expect(collectDraftUpdates(component, draft)).toEqual({
      eaten: true,
      grams: { rice: 200, egg: 50 },
      calories: undefined,
    })

    const invalid = setDraftIngredientGrams(
      draft,
      component.id,
      'egg',
      'x',
    )
    expect(collectDraftUpdates(component, invalid)).toEqual({
      eaten: true,
      grams: null,
      calories: undefined,
    })
  })

  it('flushes custom calories or null', () => {
    const draft = createComboCheckInDraft([custom])

    expect(collectDraftUpdates(custom, draft)).toEqual({
      eaten: true,
      grams: null,
      calories: 300,
    })
    expect(
      collectDraftUpdates(
        custom,
        setDraftCustomCalories(draft, custom.id, ''),
      ),
    ).toEqual({ eaten: true, grams: null, calories: null })
    expect(
      collectDraftUpdates(
        custom,
        setDraftCustomCalories(draft, custom.id, 'abc'),
      ),
    ).toEqual({ eaten: true, grams: null, calories: undefined })
  })
})
