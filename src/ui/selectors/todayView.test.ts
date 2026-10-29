import { describe, expect, it } from 'vitest'

import {
  calcMealCalories,
  createComboCandidate,
  createCustomOnlyCandidate,
  createLegacyCandidate,
  discardComponent,
  withComponentEaten,
} from '@/core/components'
import { createMealDrawBudget } from '@/core/drawBudget'
import type {
  ComboCandidateSnapshot,
  MealComponentSnapshot,
} from '@/core/types'
import { combos, dishById } from '@/data'
import { createEmptyAppData } from '@/storage/appData'
import type { AppData, DailyRecord, MealRecord } from '@/storage/appData'

import {
  buildTodayView,
  formatDateLabel,
  formatShortDate,
  toIngredientRows,
} from './todayView'

const DAY = '2026-10-28'

const PROFILE = {
  sex: 'female',
  age: 30,
  heightCm: 165,
  weightKg: 60,
  activity: 'sedentary',
  goal: 'maintain',
} as const

const soy = createComboCandidate(
  combos.find((item) => item.id === 'b_soy_youtiao')!,
  'draw',
)
const porridge = createComboCandidate(
  combos.find((item) => item.id === 'b_porridge_egg')!,
  'draw',
)

function makeData(
  targetCalories: number | null = 2000,
  withProfile = true,
): AppData {
  const data = createEmptyAppData(DAY)
  data.profile = withProfile ? { ...PROFILE } : null
  data.targetCalories = targetCalories
  return data
}

function day(data: AppData): DailyRecord {
  return data.days[DAY]!
}

function setMeal(
  data: AppData,
  type: 'breakfast' | 'lunch' | 'dinner',
  candidates: ComboCandidateSnapshot[],
  selectedId: string | null = null,
): MealRecord {
  const record: MealRecord = {
    candidateCombos: candidates,
    selectedCandidateId: selectedId,
    calories: null,
    budget: createMealDrawBudget(),
  }
  day(data).meals[type] = record
  return record
}

function addStamps(
  data: AppData,
  components: readonly MealComponentSnapshot[],
  counts: number[],
): void {
  components.forEach((component, index) => {
    if (component.dishId) {
      const count = counts[index] ?? 1
      data.stamps[component.dishId] = {
        checkInCount: count,
        firstCheckInDate: DAY,
        checkInDates: Array.from({ length: count }, () => DAY),
      }
    }
  })
}

function findComponent(
  candidate: ComboCandidateSnapshot,
  index = 0,
): MealComponentSnapshot {
  const component = candidate.components[index]
  if (!component) {
    throw new Error('fixture 缺少部件')
  }
  return component
}

describe('buildTodayView', () => {
  it('shows a real empty day with three undrawn meals', () => {
    const view = buildTodayView(makeData(), DAY)

    expect(view.dateLabel).toBe('10月28日 · 周三')
    expect(view.meals.map((meal) => meal.status)).toEqual([
      'undrawn',
      'undrawn',
      'undrawn',
    ])
    expect(view.meals[0]!.allowance).toMatchObject({
      remainingBase: 2,
      remainingTokens: 0,
      remainingAds: null,
      totalRemaining: null,
    })
    expect(view.meals[0]!.stampSlot).toBe('reserved')
    expect(view.meals[0]!.candidates).toEqual([])
    expect(view.meals[0]!.selectedCombo).toBeNull()
    expect(view.meals[0]!.calories).toBeNull()
    expect(view.consumedCalories).toBe(0)
    expect(view.remainingCalories).toBe(2000)
    expect(view.overCalories).toBe(0)
    expect(view.progressPercent).toBe(0)
    expect(view.tokenCount).toBe(0)
    expect(view.checkedInCount).toBe(0)
  })

  it('renders combo candidates with component snapshots and selection', () => {
    const data = makeData()
    const meal = setMeal(
      data,
      'breakfast',
      [soy, porridge],
      porridge.id,
    )
    meal.budget.baseUsed = 2
    day(data).tokens.count = 1

    const breakfast = buildTodayView(data, DAY).meals[0]!

    expect(breakfast.status).toBe('drawn')
    expect(breakfast.candidates.map((item) => item.id)).toEqual([
      'b_soy_youtiao',
      'b_porridge_egg',
    ])
    expect(breakfast.candidates.map((item) => item.selected)).toEqual([
      false,
      true,
    ])
    expect(breakfast.selectedCombo?.id).toBe('b_porridge_egg')
    expect(breakfast.components).toHaveLength(
      porridge.components.length,
    )
    expect(breakfast.components[0]?.name).toBe(
      porridge.components[0]?.name,
    )
    expect(breakfast.components[0]?.ingredients[0]?.name).toBe(
      porridge.components[0]?.ingredients[0]?.name,
    )
    expect(breakfast.candidates[0]?.activeComponents).toHaveLength(
      soy.components.length,
    )
    expect(breakfast.allowance).toMatchObject({
      remainingBase: 0,
      remainingTokens: 1,
      remainingAds: null,
      totalRemaining: null,
    })
  })

  it('computes pre-check-in calories from the selected snapshot', () => {
    const data = makeData()
    const skipped = findComponent(soy)
    const modified: ComboCandidateSnapshot = {
      ...soy,
      components: soy.components.map((component) =>
        component.id === skipped.id
          ? { ...component, eaten: false }
          : component,
      ),
    }
    setMeal(data, 'breakfast', [modified], modified.id)

    const breakfast = buildTodayView(data, DAY).meals[0]!

    const expected = calcMealCalories(
      soy.components.map((component) =>
        component.id === skipped.id
          ? { ...component, eaten: false }
          : component,
      ),
    )
    expect(breakfast.calories).toBe(expected)
    expect(breakfast.calories).not.toBeNull()
    expect(breakfast.status).toBe('drawn')
  })

  it('shows combo calories with eaten-only stamps when checked in', () => {
    const data = makeData()
    const modified: ComboCandidateSnapshot = {
      ...soy,
      components: soy.components.map((component, index) =>
        index === 0 ? { ...component, eaten: false } : component,
      ),
    }
    const meal = setMeal(data, 'breakfast', [modified], modified.id)
    meal.calories = 500
    meal.budget = { baseUsed: 2, adUsed: 0, checkedIn: true }
    addStamps(data, soy.components, [1, 3, 7])

    const breakfast = buildTodayView(data, DAY).meals[0]!

    expect(breakfast.status).toBe('checkedIn')
    expect(breakfast.calories).toBe(500)
    expect(breakfast.allowance.totalRemaining).toBe(0)
    expect(breakfast.stamps.map((stamp) => stamp.dish.id)).toEqual(
      soy.components.slice(1).map((component) => component.dishId),
    )
    expect(breakfast.stamps.map((stamp) => stamp.tier)).toEqual([
      'silver',
      'gold',
    ])
    expect(breakfast.stamps[0]).toMatchObject({
      count: 3,
      dateLabel: '10.28',
    })
    expect(breakfast.stampSlot).toBe('stamped')
  })

  it('dedupes the same dish within a meal and ignores discarded/uneaten parts', () => {
    const data = makeData()
    const duplicate = createComboCandidate(
      {
        id: 'dup_combo',
        name: '双份米饭',
        rarity: 'R',
        meals: ['lunch'],
        components: ['white_rice', 'white_rice', 'boiled_egg'],
      },
      'draw',
      'dup_candidate',
    )
    const withDiscard = discardComponent(
      duplicate,
      findComponent(duplicate, 2).id,
    )
    const meal = setMeal(data, 'lunch', [withDiscard], withDiscard.id)
    meal.budget.checkedIn = true
    addStamps(data, withDiscard.components, [1, 1, 1])

    const lunch = buildTodayView(data, DAY).meals[1]!

    expect(lunch.selectedCombo?.discardedComponents).toHaveLength(1)
    expect(lunch.selectedCombo?.activeComponents).toHaveLength(2)
    expect(lunch.stamps.map((stamp) => stamp.dish.id)).toEqual(['white_rice'])
    expect(lunch.stampSlot).toBe('stamped')
  })

  it('marks a checked-in custom-only meal as custom without stamps', () => {
    const data = makeData()
    const custom = createCustomOnlyCandidate({
      id: 'custom:1',
      name: '朋友聚餐',
      calories: 800,
    })
    const meal = setMeal(data, 'lunch', [custom], custom.id)
    meal.calories = 800
    meal.budget.checkedIn = true

    const lunch = buildTodayView(data, DAY).meals[1]!

    expect(lunch.status).toBe('checkedIn')
    expect(lunch.selectedCombo?.name).toBe('朋友聚餐')
    expect(lunch.calories).toBe(800)
    expect(lunch.stamps).toEqual([])
    expect(lunch.stampSlot).toBe('custom')
    expect(lunch.undoableComponentId).toBeNull()
  })

  it('keeps a null-calorie custom meal checked in and out of totals', () => {
    const data = makeData()
    const custom = createCustomOnlyCandidate({
      id: 'custom:2',
      name: '没算热量的一餐',
      calories: null,
    })
    const meal = setMeal(data, 'lunch', [custom], custom.id)
    meal.calories = null
    meal.budget.checkedIn = true

    const lunch = buildTodayView(data, DAY).meals[1]!

    expect(lunch.status).toBe('checkedIn')
    expect(lunch.calories).toBeNull()
    expect(lunch.stampSlot).toBe('custom')
    expect(buildTodayView(data, DAY).consumedCalories).toBe(0)
  })

  it('renders legacy missing-dish snapshots without live catalog lookups', () => {
    const data = makeData()
    const legacy = createLegacyCandidate({
      dateKey: DAY,
      meal: 'lunch',
      dishId: 'ghost_dish',
      eaten: true,
    })
    const meal = setMeal(data, 'lunch', [legacy], legacy.id)
    meal.calories = null
    meal.budget.checkedIn = true

    const lunch = buildTodayView(data, DAY).meals[1]!

    expect(lunch.selectedCombo?.name).toBe('ghost_dish')
    expect(lunch.components[0]).toMatchObject({
      name: 'ghost_dish',
      dishId: 'ghost_dish',
      kcal: null,
    })
    expect(lunch.stamps).toEqual([])
    expect(lunch.stampSlot).toBe('reserved')
  })

  it('uses snapshot values instead of the live dish library', () => {
    const data = makeData()
    const snapshot: ComboCandidateSnapshot = {
      ...soy,
      name: '自定义套餐名',
      components: soy.components.map((component, index) =>
        index === 0
          ? { ...component, name: '快照名字', calories: 1 }
          : component,
      ),
    }
    setMeal(data, 'breakfast', [snapshot], snapshot.id)

    const breakfast = buildTodayView(data, DAY).meals[0]!

    expect(breakfast.selectedCombo?.name).toBe('自定义套餐名')
    expect(breakfast.components[0]?.name).toBe('快照名字')
    expect(breakfast.components[0]?.kcal).toBe(1)
  })

  it('exposes the undoable component only for a matching discard', () => {
    const data = makeData()
    const target = findComponent(soy)
    const discarded = discardComponent(soy, target.id)
    setMeal(data, 'breakfast', [discarded], discarded.id)
    const reference = {
      dateKey: DAY,
      meal: 'breakfast' as const,
      candidateId: discarded.id,
      componentId: target.id,
    }

    expect(
      buildTodayView(data, DAY, reference).meals[0]!.undoableComponentId,
    ).toBe(target.id)

    expect(
      buildTodayView(data, DAY, {
        ...reference,
        dateKey: '2026-10-27',
      }).meals[0]!.undoableComponentId,
    ).toBeNull()
    expect(
      buildTodayView(data, DAY, {
        ...reference,
        meal: 'lunch',
      }).meals[0]!.undoableComponentId,
    ).toBeNull()
    expect(
      buildTodayView(data, DAY, {
        ...reference,
        candidateId: porridge.id,
      }).meals[0]!.undoableComponentId,
    ).toBeNull()

    // 撤销后组件不再被舍弃，引用也应失效。
    expect(
      buildTodayView(data, DAY, {
        ...reference,
        componentId: findComponent(soy, 1).id,
      }).meals[0]!.undoableComponentId,
    ).toBeNull()
  })

  it('treats an eaten component as unable to redraw after check-in', () => {
    const data = makeData()
    const meal = setMeal(data, 'breakfast', [soy], soy.id)
    meal.budget.checkedIn = true

    const breakfast = buildTodayView(data, DAY).meals[0]!

    expect(breakfast.components.every((item) => !item.canRedraw)).toBe(true)
    expect(
      buildTodayView(makeData(), DAY).meals[0]!.components,
    ).toEqual([])
  })

  it('marks library components as redrawable while the meal is open', () => {
    const data = makeData()
    setMeal(data, 'breakfast', [soy], soy.id)

    const breakfast = buildTodayView(data, DAY).meals[0]!

    expect(breakfast.components.every((item) => item.canRedraw)).toBe(true)
    expect(breakfast.components[0]?.origin).toBe('combo')
  })

  it('shows numbers from the switch alone and gates targets on a profile', () => {
    const guest = buildTodayView(makeData(2000, false), DAY)
    expect(guest.showCalories).toBe(true)
    expect(guest.hasProfile).toBe(false)
    expect(guest.targetCalories).toBeNull()
    expect(guest.remainingCalories).toBeNull()
    expect(guest.overCalories).toBe(0)
    expect(guest.progressPercent).toBe(0)

    const hidden = makeData()
    hidden.settings.showCalories = false
    expect(buildTodayView(hidden, DAY).showCalories).toBe(false)
    expect(buildTodayView(hidden, DAY).hasProfile).toBe(true)

    const shown = makeData()
    shown.settings.showCalories = true
    const view = buildTodayView(shown, DAY)
    expect(view.showCalories).toBe(true)
    expect(view.hasProfile).toBe(true)
    expect(view.targetCalories).toBe(2000)
  })

  it('clamps progress and reports over-target calories', () => {
    const data = makeData(500)
    const meal = setMeal(data, 'dinner', [soy], soy.id)
    meal.calories = 800
    meal.budget.checkedIn = true

    const view = buildTodayView(data, DAY)

    expect(view.progressPercent).toBe(100)
    expect(view.overCalories).toBe(300)
    expect(view.remainingCalories).toBe(-300)
  })

  it('does not trust an expired token wallet', () => {
    const data = makeData()
    day(data).tokens = {
      dateKey: '2026-10-27',
      count: 2,
      customRewardClaimed: false,
    }

    const view = buildTodayView(data, DAY)

    expect(view.tokenCount).toBe(0)
    expect(view.meals[0]!.allowance.remainingTokens).toBe(0)
    expect(view.meals[0]!.allowance.totalRemaining).toBeNull()
  })

  it('falls back safely when today is missing', () => {
    const data = createEmptyAppData(DAY)
    data.targetCalories = null
    data.days = {}

    const view = buildTodayView(data, DAY)

    expect(view.targetCalories).toBeNull()
    expect(view.remainingCalories).toBeNull()
    expect(view.progressPercent).toBe(0)
    expect(view.meals.map((meal) => meal.status)).toEqual([
      'undrawn',
      'undrawn',
      'undrawn',
    ])
  })

  it('treats consumed draws as a drawn meal even without candidates', () => {
    const data = makeData()
    const breakfast = day(data).meals.breakfast
    breakfast.budget.baseUsed = 1

    const view = buildTodayView(data, DAY).meals[0]!

    expect(view.status).toBe('drawn')
    expect(view.candidates).toEqual([])
    expect(view.selectedCombo).toBeNull()
  })

  it('formats valid local date labels and leaves invalid keys alone', () => {
    expect(formatDateLabel('2026-10-28')).toBe('10月28日 · 周三')
    expect(formatDateLabel('not-a-date')).toBe('not-a-date')
    expect(formatShortDate('2026-10-28')).toBe('10.28')
    expect(formatShortDate('not-a-date')).toBe('')
  })

  it('keeps toIngredientRows working for the stamp book', () => {
    const rice = dishById.get('white_rice')!
    expect(toIngredientRows(rice)).toEqual([
      {
        id: 'cooked_rice',
        name: '米饭',
        grams: 200,
        kcalPer100g: 116,
      },
    ])
  })

  it('hints when a lunch combo has no staple', () => {
    const lunchCombo = combos.find((item) => item.id === 'l_tomato_egg')!
    const lunch = createComboCandidate(lunchCombo, 'draw')
    const rice = lunch.components.find(
      (component) => component.category === 'staple',
    )!
    const withoutStaple = discardComponent(lunch, rice.id)

    const data = makeData()
    setMeal(data, 'lunch', [withoutStaple], withoutStaple.id)

    const view = buildTodayView(data, DAY)
    expect(view.meals[1]!.stapleHint).toBe(true)
    expect(view.meals[0]!.stapleHint).toBe(false)
    expect(view.meals[2]!.stapleHint).toBe(false)
  })

  it('does not hint when the lunch combo has a staple', () => {
    const lunchCombo = combos.find((item) => item.id === 'l_tomato_egg')!
    const lunch = createComboCandidate(lunchCombo, 'draw')

    const data = makeData()
    setMeal(data, 'lunch', [lunch], lunch.id)

    expect(buildTodayView(data, DAY).meals[1]!.stapleHint).toBe(false)
  })

  it('treats a dish with providesStaple as a staple even outside the staple category', () => {
    const lunchCombo = combos.find((item) => item.id === 'l_tomato_egg')!
    const lunch = createComboCandidate(lunchCombo, 'draw')
    const rice = lunch.components.find(
      (component) => component.category === 'staple',
    )!
    const swapped: ComboCandidateSnapshot = {
      ...lunch,
      components: lunch.components.map((component) =>
        component.id === rice.id
          ? {
              ...component,
              dishId: 'banana_oat_cup',
              name: '香蕉燕麦杯',
              category: 'snack',
            }
          : component,
      ),
    }

    const data = makeData()
    setMeal(data, 'lunch', [swapped], swapped.id)

    expect(buildTodayView(data, DAY).meals[1]!.stapleHint).toBe(false)
  })

  it('hides the lunch staple hint after check-in', () => {
    const lunchCombo = combos.find((item) => item.id === 'l_tomato_egg')!
    const lunch = createComboCandidate(lunchCombo, 'draw')
    const rice = lunch.components.find(
      (component) => component.category === 'staple',
    )!
    const withoutStaple = discardComponent(lunch, rice.id)

    const data = makeData()
    const record = setMeal(data, 'lunch', [withoutStaple], withoutStaple.id)
    record.budget.checkedIn = true

    expect(buildTodayView(data, DAY).meals[1]!.stapleHint).toBe(false)
  })

  it('keeps non-discarded eaten state on the component list', () => {
    const data = makeData()
    const skipped = findComponent(soy)
    const modified: ComboCandidateSnapshot = {
      ...soy,
      components: soy.components.map((component) =>
        component.id === skipped.id
          ? withComponentEaten(soy, component.id, false).components[0]!
          : component,
      ),
    }
    setMeal(data, 'breakfast', [modified], modified.id)

    const breakfast = buildTodayView(data, DAY).meals[0]!

    expect(
      breakfast.components.find((item) => item.id === skipped.id)?.eaten,
    ).toBe(false)
    expect(breakfast.components.filter((item) => item.eaten)).toHaveLength(
      soy.components.length - 1,
    )
  })
})
