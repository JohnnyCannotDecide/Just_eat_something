import { describe, expect, it } from 'vitest'

import { combos, dishById } from '@/data'

import {
  addCustomComponent,
  createComboCandidate,
  createCustomOnlyCandidate,
  createLegacyCandidate,
  discardComponent,
} from './components'
import {
  createMealDrawBudget,
  markMealCheckedIn,
} from './drawBudget'
import type { Rng } from './draw'
import {
  checkInMeal,
  drawForMeal,
  redrawComponent,
} from './gameFlow'
import type { MealDrawInput } from './gameFlow'
import { createTokenWallet } from './tokens'
import type { Combo, Dish, DishCategory, MealType, Rarity } from './types'

const DAY = '2026-10-28'

function combo(
  id: string,
  rarity: Rarity,
  meals: MealType[] = ['lunch'],
): Combo {
  return { id, name: id, rarity, meals, components: [] }
}

function makeDish(
  id: string,
  options: {
    category?: DishCategory
    rarity?: Rarity
    meals?: MealType[]
  } = {},
): Dish {
  return {
    id,
    name: id,
    rarity: options.rarity ?? 'R',
    category: options.category ?? 'staple',
    meals: options.meals ?? ['breakfast', 'lunch', 'dinner'],
    ingredients: [],
    image: `/images/dishes/${id}.png`,
    cooking: { method: '煮', timeMinutes: 0, steps: [] },
  }
}

const targetDish = makeDish('target')
const altStaple = makeDish('alt_staple')
const altStapleSr = makeDish('alt_staple_sr', { rarity: 'SR' })
const urStaple = makeDish('ur_staple', { rarity: 'UR' })
const breakfastStaple = makeDish('breakfast_staple', { meals: ['breakfast'] })
const mainDish = makeDish('main_dish', { category: 'main' })

const fixtureDishById = new Map<string, Dish>(
  [
    targetDish,
    altStaple,
    altStapleSr,
    urStaple,
    breakfastStaple,
    mainDish,
  ].map((dish) => [dish.id, dish]),
)

function fixtureCandidate() {
  return createComboCandidate(
    {
      ...combo('fixture_combo', 'R'),
      components: ['target', 'main_dish'],
    },
    'draw',
    'fixture_candidate',
    { dishById: fixtureDishById },
  )
}

function redrawInput(overrides: Record<string, unknown> = {}) {
  return {
    meal: 'lunch' as MealType,
    candidate: fixtureCandidate(),
    componentId: 'comp:combo:target:1',
    budget: createMealDrawBudget(),
    tokenCount: 0,
    pityCount: 0,
    ...overrides,
  }
}

function drawInput(overrides: Partial<MealDrawInput> = {}): MealDrawInput {
  return {
    meal: 'lunch',
    budget: createMealDrawBudget(),
    tokenCount: 0,
    pityCount: 0,
    drawnComboIds: [],
    ...overrides,
  }
}

describe('drawForMeal', () => {
  const catalog = [
    combo('c_r', 'R'),
    combo('c_sr', 'SR'),
    combo('c_breakfast', 'R', ['breakfast']),
  ]

  it('regression: beef → white rice → beef can still draw by reshuffling', () => {
    const regressionCatalog = [
      combo('test_beef_veg_rice', 'R'),
      combo('test_white_rice', 'R'),
    ]

    const result = drawForMeal(
      drawInput({
        budget: { baseUsed: 2, adUsed: 1, checkedIn: false },
        drawnComboIds: [
          'test_beef_veg_rice',
          'test_white_rice',
          'test_beef_veg_rice',
        ],
      }),
      { rng: () => 0, catalog: regressionCatalog, adCompleted: true },
    )

    expect(result).toMatchObject({ status: 'drawn', shuffled: true })
  })

  it('keeps offering ads past the old per-meal cap', () => {
    const budget = { baseUsed: 2, adUsed: 10, checkedIn: false }

    expect(drawForMeal(drawInput({ budget }), { catalog })).toEqual({
      status: 'requires-ad',
    })

    const result = drawForMeal(drawInput({ budget }), {
      rng: () => 0,
      catalog,
      adCompleted: true,
    })
    expect(result.status).toBe('drawn')
    if (result.status !== 'drawn') return
    expect(result.source).toBe('ad')
    expect(result.budget.adUsed).toBe(11)
  })

  it('draws from base draws and keeps the candidate pool untouched', () => {
    const result = drawForMeal(drawInput(), { rng: () => 0, catalog })

    expect(result.status).toBe('drawn')
    if (result.status !== 'drawn') return

    expect(result.combo.id).toBe('c_r')
    expect(result.source).toBe('base')
    expect(result.budget).toEqual({
      baseUsed: 1,
      adUsed: 0,
      checkedIn: false,
    })
    expect(result.tokenCount).toBe(0)
    expect(result.pityCount).toBe(1)
    expect(result.pityTriggered).toBe(false)
  })

  it('consumes a token only after the meal base draws are used', () => {
    const result = drawForMeal(
      drawInput({
        budget: { baseUsed: 2, adUsed: 0, checkedIn: false },
        tokenCount: 1,
      }),
      { rng: () => 0, catalog },
    )

    expect(result.status).toBe('drawn')
    if (result.status !== 'drawn') return

    expect(result.source).toBe('token')
    expect(result.tokenCount).toBe(0)
  })

  it('requires a completed ad before consuming the ad source, without reading rng', () => {
    let calls = 0
    const rng: Rng = () => {
      calls += 1
      return 0
    }
    const request = drawInput({
      budget: { baseUsed: 2, adUsed: 0, checkedIn: false },
    })

    expect(drawForMeal(request, { rng, catalog })).toEqual({
      status: 'requires-ad',
    })
    expect(calls).toBe(0)

    const result = drawForMeal(request, { rng, catalog, adCompleted: true })
    expect(result.status).toBe('drawn')
    if (result.status !== 'drawn') return
    expect(result.source).toBe('ad')
    expect(result.budget.adUsed).toBe(1)
  })

  it('blocks drawing after the meal is checked in', () => {
    expect(
      drawForMeal(
        drawInput({ budget: markMealCheckedIn(createMealDrawBudget()) }),
        { catalog },
      ),
    ).toEqual({ status: 'blocked', reason: 'checked-in' })
  })

  it('triggers pity at the configured miss threshold', () => {
    const result = drawForMeal(drawInput({ pityCount: 5 }), {
      rng: () => 0,
      catalog,
    })

    expect(result.status).toBe('drawn')
    if (result.status !== 'drawn') return

    expect(result.combo.rarity).toBe('SR')
    expect(result.pityCount).toBe(0)
    expect(result.pityTriggered).toBe(true)
  })

  it('never repeats a combo within the same round', () => {
    const result = drawForMeal(
      drawInput({ pityCount: 4, drawnComboIds: ['c_r'] }),
      { rng: () => 0, catalog },
    )

    expect(result.status).toBe('drawn')
    if (result.status !== 'drawn') return

    expect(result.combo.id).toBe('c_sr')
    expect(result.combo.rarity).toBe('SR')
    expect(result.shuffled).toBe(false)
    expect(result.nextDrawnComboIds).toEqual(['c_r', 'c_sr'])
  })

  it('reshuffles an exhausted round without immediately repeating the previous combo', () => {
    const result = drawForMeal(
      drawInput({ drawnComboIds: ['c_r', 'c_sr'] }),
      { rng: () => 0, catalog },
    )

    expect(result.status).toBe('drawn')
    if (result.status !== 'drawn') return

    expect(result.combo.id).toBe('c_r')
    expect(result.shuffled).toBe(true)
    expect(result.singleCandidate).toBe(false)
    expect(result.nextDrawnComboIds).toEqual(['c_r'])
    expect(result.budget.baseUsed).toBe(1)
  })

  it('never blocks when the meal pool has a single combo', () => {
    const single = [combo('c_r', 'R')]

    const result = drawForMeal(
      drawInput({ drawnComboIds: ['c_r'] }),
      { rng: () => 0, catalog: single },
    )

    expect(result.status).toBe('drawn')
    if (result.status !== 'drawn') return

    expect(result.combo.id).toBe('c_r')
    expect(result.shuffled).toBe(true)
    expect(result.singleCandidate).toBe(true)
    expect(result.nextDrawnComboIds).toEqual(['c_r'])
  })

  it('only blocks when the catalog has no combos for the meal', () => {
    expect(
      drawForMeal(drawInput({ meal: 'dinner' }), { rng: () => 0, catalog }),
    ).toEqual({ status: 'blocked', reason: 'pool-empty' })
  })
})

describe('redrawComponent', () => {
  it('replaces the component with a same-meal, same-category, non-UR dish', () => {
    const input = redrawInput()

    const result = redrawComponent(input, {
      rng: () => 0,
      dishCatalog: [...fixtureDishById.values()],
    })

    expect(result.status).toBe('redrawn')
    if (result.status !== 'redrawn') return

    const replaced = result.candidate.components.find(
      (item) => item.dishId === 'alt_staple',
    )
    expect(
      result.candidate.components.some((item) => item.id === input.componentId),
    ).toBe(false)
    expect(replaced).toMatchObject({
      dishId: 'alt_staple',
      category: 'staple',
      origin: 'redraw',
      eaten: true,
      discarded: false,
    })
    expect(result.source).toBe('base')
    expect(result.budget.baseUsed).toBe(1)
    expect(result.pityCount).toBe(1)
  })

  it('never replaces with a UR dish', () => {
    const result = redrawComponent(redrawInput(), {
      rng: () => 1,
      dishCatalog: [...fixtureDishById.values()],
    })

    expect(result.status).toBe('redrawn')
    if (result.status !== 'redrawn') return
    expect(result.component.rarity).toBe('SR')
    expect(result.component.dishId).toBe('alt_staple_sr')
  })

  it('excludes other active dishes, other meals, and other categories', () => {
    const input = redrawInput()

    const onlyMismatch = [...fixtureDishById.values()].filter(
      (dish) =>
        dish.id === 'target' ||
        dish.id === 'main_dish' ||
        dish.id === 'breakfast_staple' ||
        dish.id === 'ur_staple',
    )

    expect(
      redrawComponent(input, {
        rng: () => 0,
        dishCatalog: onlyMismatch,
      }),
    ).toEqual({ status: 'no-candidate', reason: 'single-candidate' })
  })

  it('blocks when the component is missing, discarded, or custom', () => {
    const input = redrawInput()

    expect(
      redrawComponent(
        { ...input, componentId: 'nope' },
        { dishCatalog: [...fixtureDishById.values()] },
      ),
    ).toEqual({ status: 'blocked', reason: 'component-missing' })

    const discarded = discardComponent(input.candidate, input.componentId)
    expect(
      redrawComponent(
        { ...input, candidate: discarded },
        { dishCatalog: [...fixtureDishById.values()] },
      ),
    ).toEqual({ status: 'blocked', reason: 'component-missing' })

    const withCustom = addCustomComponent(input.candidate, {
      name: '奶茶',
      calories: 300,
    })
    const custom = withCustom.components.at(-1)!
    expect(
      redrawComponent(
        { ...input, candidate: withCustom, componentId: custom.id },
        { dishCatalog: [...fixtureDishById.values()] },
      ),
    ).toEqual({ status: 'blocked', reason: 'not-redrawable' })
  })

  it('blocks after check-in', () => {
    expect(
      redrawComponent(redrawInput({ budget: markMealCheckedIn(createMealDrawBudget()) }), {
        dishCatalog: [...fixtureDishById.values()],
      }),
    ).toEqual({ status: 'blocked', reason: 'checked-in' })
  })

  it('keeps redrawing via ads after the old ad cap', () => {
    const input = redrawInput({
      budget: { baseUsed: 2, adUsed: 10, checkedIn: false },
    })
    const options = { dishCatalog: [...fixtureDishById.values()] }

    expect(redrawComponent(input, options)).toEqual({ status: 'requires-ad' })

    const result = redrawComponent(input, { ...options, adCompleted: true })
    expect(result.status).toBe('redrawn')
    if (result.status !== 'redrawn') return
    expect(result.source).toBe('ad')
    expect(result.budget.adUsed).toBe(11)
  })

  it('requires a completed ad when the next source is an ad', () => {
    const input = redrawInput({
      budget: { baseUsed: 2, adUsed: 0, checkedIn: false },
    })
    const options = { dishCatalog: [...fixtureDishById.values()] }

    expect(redrawComponent(input, options)).toEqual({ status: 'requires-ad' })

    const result = redrawComponent(input, { ...options, adCompleted: true })
    expect(result.status).toBe('redrawn')
    if (result.status !== 'redrawn') return
    expect(result.source).toBe('ad')
    expect(result.budget.adUsed).toBe(1)
  })

  it('falls back to normal weights when pity has no SR+ candidate', () => {
    let calls = 0
    const rng: Rng = () => {
      calls += 1
      return 0
    }

    const result = redrawComponent(redrawInput({ pityCount: 5 }), {
      rng,
      dishCatalog: [targetDish, altStaple],
    })

    expect(result.status).toBe('redrawn')
    if (result.status !== 'redrawn') return
    expect(result.component.rarity).toBe('R')
    expect(result.pityTriggered).toBe(false)
    expect(result.pityCount).toBe(6)
    expect(result.budget.baseUsed).toBe(1)
    expect(calls).toBe(2)
  })

  it('draws from guaranteed rarities when pity is active', () => {
    const result = redrawComponent(redrawInput({ pityCount: 5 }), {
      rng: () => 0,
      dishCatalog: [...fixtureDishById.values()],
    })

    expect(result.status).toBe('redrawn')
    if (result.status !== 'redrawn') return
    expect(result.component.rarity).toBe('SR')
    expect(result.pityTriggered).toBe(true)
    expect(result.pityCount).toBe(0)
    expect(result.budget.baseUsed).toBe(1)
  })

  it('does not consume a draw, use pity, or change pity for a free redraw', () => {
    const budget = { baseUsed: 2, adUsed: 3, checkedIn: false }
    const result = redrawComponent(
      redrawInput({ budget, pityCount: 5 }),
      {
        rng: () => 0,
        dishCatalog: [...fixtureDishById.values()],
        costsDraw: false,
      },
    )

    expect(result.status).toBe('redrawn')
    if (result.status !== 'redrawn') return
    expect(result.source).toBeNull()
    expect(result.pityTriggered).toBe(false)
    expect(result.pityCount).toBe(5)
    expect(result.budget).toEqual(budget)
    expect(result.component.rarity).toBe('R')
  })

  it('excludes dishes already seen in the same component slot', () => {
    const dishes = [targetDish, altStaple, altStapleSr]

    const first = redrawComponent(redrawInput(), {
      rng: () => 0,
      dishCatalog: dishes,
    })
    expect(first.status).toBe('redrawn')
    if (first.status !== 'redrawn') return
    expect(first.component.dishId).toBe('alt_staple')
    expect(first.component.seenDishIds).toEqual(['target', 'alt_staple'])

    const second = redrawComponent(
      {
        ...redrawInput(),
        candidate: first.candidate,
        componentId: first.component.id,
      },
      { rng: () => 0, dishCatalog: dishes },
    )
    expect(second.status).toBe('redrawn')
    if (second.status !== 'redrawn') return
    expect(second.component.dishId).toBe('alt_staple_sr')
    expect(second.component.seenDishIds).toEqual([
      'target',
      'alt_staple',
      'alt_staple_sr',
    ])
    expect(second.shuffled).toBe(false)
  })

  it('reshuffles an exhausted slot, keeps the current dish, and avoids the previous dish', () => {
    const dishes = [targetDish, altStaple, altStapleSr]

    const first = redrawComponent(redrawInput(), {
      rng: () => 0,
      dishCatalog: dishes,
    })
    if (first.status !== 'redrawn') throw new Error('first redraw failed')

    const second = redrawComponent(
      {
        ...redrawInput(),
        candidate: first.candidate,
        componentId: first.component.id,
      },
      { rng: () => 0, dishCatalog: dishes },
    )
    if (second.status !== 'redrawn') throw new Error('second redraw failed')

    const third = redrawComponent(
      {
        ...redrawInput(),
        candidate: second.candidate,
        componentId: second.component.id,
      },
      { rng: () => 0, dishCatalog: dishes },
    )

    expect(third.status).toBe('redrawn')
    if (third.status !== 'redrawn') return
    expect(third.shuffled).toBe(true)
    expect(third.component.dishId).not.toBe('alt_staple_sr')
    expect(third.component.dishId).not.toBe('alt_staple')
    expect(third.component.seenDishIds).toEqual(['alt_staple_sr', 'target'])
  })

  it('never dead-ends when the category has only the current dish', () => {
    const result = redrawComponent(redrawInput(), {
      dishCatalog: [targetDish],
    })

    expect(result).toEqual({
      status: 'no-candidate',
      reason: 'single-candidate',
    })
    expect(redrawInput().budget.baseUsed).toBe(0)
  })

  it('gives the replacement a fresh unique component id', () => {
    const input = redrawInput()

    const result = redrawComponent(input, {
      rng: () => 0,
      dishCatalog: [...fixtureDishById.values()],
    })

    expect(result.status).toBe('redrawn')
    if (result.status !== 'redrawn') return
    const ids = result.candidate.components.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(result.component.id).toMatch(/^comp:redraw:/)
  })
})

function realCandidate(dishIds: string[]) {
  const comboId = `test:${dishIds.join('+')}`
  return createComboCandidate(
    {
      id: comboId,
      name: '测试套餐',
      rarity: 'R',
      meals: ['lunch'],
      components: dishIds,
    },
    'draw',
    'test_candidate',
  )
}

describe('checkInMeal', () => {
  it('computes calories, stamps, and a formal token for a full combo', () => {
    const candidate = realCandidate(['white_rice', 'boiled_egg'])

    const result = checkInMeal({
      candidate,
      budget: createMealDrawBudget(),
      wallet: createTokenWallet(DAY),
      dateKey: DAY,
    })

    expect(result.status).toBe('checked-in')
    if (result.status !== 'checked-in') return

    expect(result.calories).toBe(405)
    expect(result.stampDishIds).toEqual(['white_rice', 'boiled_egg'])
    expect(result.budget.checkedIn).toBe(true)
    expect(result.rewardKind).toBe('formal')
    expect(result.tokenRewarded).toBe(true)
    expect(result.wallet.count).toBe(1)
    expect(result.components).toHaveLength(2)
  })

  it('only stamps and counts components that were actually eaten', () => {
    const candidate = realCandidate(['white_rice', 'boiled_egg'])
    const [rice, egg] = candidate.components

    const result = checkInMeal({
      candidate,
      budget: createMealDrawBudget(),
      wallet: createTokenWallet(DAY),
      dateKey: DAY,
      eaten: { [rice!.id]: false },
    })

    expect(result.status).toBe('checked-in')
    if (result.status !== 'checked-in') return

    expect(result.calories).toBe(173)
    expect(result.stampDishIds).toEqual(['boiled_egg'])
    expect(result.components.find((item) => item.id === egg!.id)?.eaten).toBe(
      true,
    )
  })

  it('dedupes stamps when the same dish appears twice', () => {
    const candidate = realCandidate(['white_rice', 'white_rice'])

    const result = checkInMeal({
      candidate,
      budget: createMealDrawBudget(),
      wallet: createTokenWallet(DAY),
      dateKey: DAY,
    })

    expect(result.status).toBe('checked-in')
    if (result.status !== 'checked-in') return

    expect(result.stampDishIds).toEqual(['white_rice'])
    expect(result.calories).toBe(464)
    expect(result.wallet.count).toBe(1)
  })

  it('rewards only the first custom-only check-in of the day', () => {
    const wallet = createTokenWallet(DAY)
    const first = checkInMeal({
      candidate: createCustomOnlyCandidate({
        id: 'custom:1',
        name: '聚餐',
        calories: 800,
      }),
      budget: createMealDrawBudget(),
      wallet,
      dateKey: DAY,
    })

    expect(first.status).toBe('checked-in')
    if (first.status !== 'checked-in') return
    expect(first.rewardKind).toBe('custom')
    expect(first.stampDishIds).toEqual([])
    expect(first.calories).toBe(800)
    expect(first.tokenRewarded).toBe(true)
    expect(first.wallet.customRewardClaimed).toBe(true)

    const second = checkInMeal({
      candidate: createCustomOnlyCandidate({
        id: 'custom:2',
        name: '夜宵',
        calories: null,
      }),
      budget: createMealDrawBudget(),
      wallet: first.wallet,
      dateKey: DAY,
    })

    expect(second.status).toBe('checked-in')
    if (second.status !== 'checked-in') return
    expect(second.tokenRewarded).toBe(false)
    expect(second.wallet.count).toBe(1)
    expect(second.calories).toBeNull()
  })

  it('applies eaten, gram, and custom calorie overrides and drops discarded parts', () => {
    const base = realCandidate(['white_rice', 'boiled_egg'])
    const withCustom = addCustomComponent(base, {
      name: '奶茶',
      calories: 300,
    })
    const custom = withCustom.components.at(-1)!
    const rice = withCustom.components.find((item) => item.dishId === 'white_rice')!
    const discarded = discardComponent(withCustom, rice.id)

    const result = checkInMeal({
      candidate: discarded,
      budget: createMealDrawBudget(),
      wallet: createTokenWallet(DAY),
      dateKey: DAY,
      ingredientGrams: { [rice.id]: { cooked_rice: 100 } },
      customCalories: { [custom.id]: 250 },
    })

    expect(result.status).toBe('checked-in')
    if (result.status !== 'checked-in') return

    expect(result.components.map((item) => item.id)).not.toContain(rice.id)
    expect(result.calories).toBe(173 + 250)
    expect(result.stampDishIds).toEqual(['boiled_egg'])
    expect(
      result.components.find((item) => item.id === custom.id)?.calories,
    ).toBe(250)
  })

  it('blocks when nothing is eaten or there are no active components', () => {
    const candidate = realCandidate(['white_rice', 'boiled_egg'])
    const allOff = Object.fromEntries(
      candidate.components.map((item) => [item.id, false]),
    )

    expect(
      checkInMeal({
        candidate,
        budget: createMealDrawBudget(),
        wallet: createTokenWallet(DAY),
        dateKey: DAY,
        eaten: allOff,
      }),
    ).toEqual({ status: 'blocked', reason: 'no-eaten' })

    const noComponents = createCustomOnlyCandidate({
      id: 'custom:empty',
      name: '空',
      calories: null,
    })
    const emptied = {
      ...noComponents,
      components: noComponents.components.map((item) => ({
        ...item,
        discarded: true,
      })),
    }
    expect(
      checkInMeal({
        candidate: emptied,
        budget: createMealDrawBudget(),
        wallet: createTokenWallet(DAY),
        dateKey: DAY,
      }),
    ).toEqual({ status: 'blocked', reason: 'no-components' })
  })

  it('blocks a second check-in for the same meal', () => {
    expect(
      checkInMeal({
        candidate: realCandidate(['white_rice']),
        budget: markMealCheckedIn(createMealDrawBudget()),
        wallet: createTokenWallet(DAY),
        dateKey: DAY,
      }),
    ).toEqual({ status: 'blocked', reason: 'checked-in' })
  })

  it('does not stamp or count missing dishes, but still grants a formal token', () => {
    const candidate = createLegacyCandidate({
      dateKey: DAY,
      meal: 'lunch',
      dishId: 'missing_dish',
      eaten: true,
    })

    const result = checkInMeal({
      candidate,
      budget: createMealDrawBudget(),
      wallet: createTokenWallet(DAY),
      dateKey: DAY,
    })

    expect(result.status).toBe('checked-in')
    if (result.status !== 'checked-in') return
    expect(result.stampDishIds).toEqual([])
    expect(result.calories).toBeNull()
    expect(result.rewardKind).toBe('formal')
    expect(result.tokenRewarded).toBe(true)
  })

  it('rejects invalid custom calorie overrides', () => {
    const candidate = createCustomOnlyCandidate({
      id: 'custom:bad',
      name: '聚餐',
      calories: 800,
    })
    const id = candidate.components[0]!.id

    expect(() =>
      checkInMeal({
        candidate,
        budget: createMealDrawBudget(),
        wallet: createTokenWallet(DAY),
        dateKey: DAY,
        customCalories: { [id]: -1 },
      }),
    ).toThrow(RangeError)
  })
})

describe('real combo catalog', () => {
  it('can build a snapshot for the first breakfast combo', () => {
    const breakfast = combos.find((item) => item.meals.includes('breakfast'))!
    const candidate = createComboCandidate(breakfast, 'draw')

    expect(candidate.components.length).toBeGreaterThan(0)
    for (const component of candidate.components) {
      expect(component.kind).toBe('dish')
      expect(component.dishId).not.toBeNull()
      expect(dishById.has(component.dishId!)).toBe(true)
    }
  })
})
