import { describe, expect, it } from 'vitest'

import {
  calcMealCalories,
  createComboCandidate,
  createCustomOnlyCandidate,
  createLegacyCandidate,
} from '@/core/components'
import { shiftDateKey } from '@/core/dateKey'
import type { ComboCandidateSnapshot, MealType } from '@/core/types'
import { combos } from '@/data'
import { createDailyRecord, createEmptyAppData } from '@/storage/appData'
import type { AppData, DailyRecord } from '@/storage/appData'

import { formatKcal } from '../formatKcal'
import {
  buildCalendarMonthView,
  buildDayDetailView,
} from './calendarView'

const DAY = '2026-10-29'
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

function makeData(profile: boolean = true): AppData {
  const data = createEmptyAppData(DAY)
  data.profile = profile ? PROFILE : null
  data.targetCalories = 1800
  data.settings.showCalories = profile
  return data
}

function dayOf(data: AppData, dateKey: string): DailyRecord {
  const existing = data.days[dateKey]
  if (existing) {
    return existing
  }
  const record = createDailyRecord(dateKey)
  data.days[dateKey] = record
  return record
}

function setMeal(
  data: AppData,
  dateKey: string,
  type: MealType,
  candidate: ComboCandidateSnapshot,
  options: { checkedIn: boolean; calories?: number | null },
): void {
  dayOf(data, dateKey).meals[type] = {
    candidateCombos: [candidate],
    selectedCandidateId: candidate.id,
    calories: options.calories ?? null,
    budget: {
      checkedIn: options.checkedIn,
      baseUsed: 1,
      adUsed: 0,
    },
  }
}

function addStamps(
  data: AppData,
  candidate: ComboCandidateSnapshot,
  dateKey: string,
  count: number,
): void {
  for (const component of candidate.components) {
    if (!component.dishId || !component.eaten || component.discarded) {
      continue
    }
    data.stamps[component.dishId] = {
      checkInCount: count,
      firstCheckInDate: dateKey,
      checkInDates: [dateKey],
    }
  }
}

describe('buildCalendarMonthView', () => {
  it('exposes statuses, stamp counts and today markers', () => {
    const data = makeData()
    setMeal(data, DAY, 'breakfast', soy, {
      checkedIn: true,
      calories: calcMealCalories(soy.components),
    })
    addStamps(data, soy, DAY, 2)

    const lunch = createComboCandidate(
      combos.find((item) => item.id === 'b_porridge_egg')!,
      'draw',
    )
    setMeal(data, DAY, 'lunch', lunch, { checkedIn: false })

    const view = buildCalendarMonthView(data, '2026-10', DAY)
    const cell = view.weeks
      .flat()
      .find((item) => item?.dateKey === DAY)

    expect(view.monthLabel).toBe('2026年10月')
    expect(view.weeks).toHaveLength(6)
    expect(view.hasCheckedIn).toBe(true)
    expect(cell?.isToday).toBe(true)
    expect(cell?.statuses).toEqual({
      breakfast: 'checkedIn',
      lunch: 'drawn',
      dinner: 'undrawn',
    })
    expect(cell?.stampCount).toBe(soy.components.length)
    expect(view.stats.checkedInDays).toBe(1)
    expect(view.stats.stampCount).toBe(soy.components.length)
  })

  it('shows an empty month without records', () => {
    const view = buildCalendarMonthView(makeData(), '2026-08', DAY)

    expect(view.monthLabel).toBe('2026年8月')
    expect(view.hasCheckedIn).toBe(false)
    expect(view.stats.checkedInDays).toBe(0)
    expect(view.stats.fullAttendanceDays).toBe(0)
    expect(view.stats.stampCount).toBe(0)
  })
})

describe('buildDayDetailView', () => {
  it('builds a read-only checked-in day from snapshots', () => {
    const data = makeData()
    const calories = calcMealCalories(soy.components)
    setMeal(data, DAY, 'breakfast', soy, {
      checkedIn: true,
      calories,
    })
    addStamps(data, soy, DAY, 1)

    const view = buildDayDetailView(data, DAY, DAY)
    const breakfast = view.meals[0]!

    expect(view.dateLabel).toBe('10月29日 · 周四')
    expect(view.showCalories).toBe(true)
    expect(view.dayCalories).toBe(calories)
    expect(view.dayStampCount).toBe(soy.components.length)
    expect(view.isFuture).toBe(false)
    expect(breakfast.status).toBe('checkedIn')
    expect(breakfast.selectedCombo?.name).toBe(soy.name)
    expect(breakfast.components).toHaveLength(soy.components.length)
    expect(breakfast.components[0]).toMatchObject({
      name: soy.components[0]!.name,
      grams: soy.components[0]!.grams,
      kcal: soy.components[0]!.calories,
    })
    expect(breakfast.stamps.map((stamp) => stamp.dish.id)).toEqual(
      soy.components.map((component) => component.dishId),
    )
  })

  it('shows the final manual combo name frozen in the check-in snapshot', () => {
    const data = makeData()
    const renamed: ComboCandidateSnapshot = {
      ...soy,
      name: '油条豆浆早安',
      nameSource: 'manual',
      manualName: '油条豆浆早安',
    }
    setMeal(data, DAY, 'breakfast', renamed, {
      checkedIn: true,
      calories: calcMealCalories(renamed.components),
    })

    const breakfast = buildDayDetailView(data, DAY, DAY).meals[0]!
    expect(breakfast.selectedCombo?.name).toBe('油条豆浆早安')
  })

  it('hides calories when the switch is off but keeps the record', () => {
    const data = makeData(false)
    data.settings.showCalories = false
    setMeal(data, DAY, 'dinner', soy, {
      checkedIn: true,
      calories: 520,
    })

    const view = buildDayDetailView(data, DAY, DAY)
    const dinner = view.meals[2]!

    expect(view.showCalories).toBe(false)
    expect(formatKcal(dinner.calories, view.showCalories)).toBe('?')
    expect(formatKcal(view.dayCalories, view.showCalories)).toBe('?')
    expect(dinner.selectedCombo?.name).toBe(soy.name)
  })

  it('shows calories for guests when the switch is on', () => {
    const data = makeData(false)
    data.settings.showCalories = true
    setMeal(data, DAY, 'dinner', soy, {
      checkedIn: true,
      calories: 520,
    })

    const view = buildDayDetailView(data, DAY, DAY)
    const dinner = view.meals[2]!

    expect(view.showCalories).toBe(true)
    expect(formatKcal(dinner.calories, view.showCalories)).toBe('520')
    expect(formatKcal(view.dayCalories, view.showCalories)).toBe('520')
    expect(dinner.selectedCombo?.name).toBe(soy.name)
  })

  it('keeps an archived dish snapshot that is missing from the catalog', () => {
    const ghost = createLegacyCandidate({
      dateKey: DAY,
      meal: 'dinner',
      dishId: 'ghost_dish',
      eaten: true,
    })
    const data = makeData()
    setMeal(data, DAY, 'dinner', ghost, {
      checkedIn: true,
      calories: null,
    })
    data.stamps.ghost_dish = {
      checkInCount: 1,
      firstCheckInDate: DAY,
      checkInDates: [DAY],
    }

    const view = buildDayDetailView(data, DAY, DAY)
    const dinner = view.meals[2]!
    const component = dinner.selectedCombo?.components[0]

    expect(dinner.status).toBe('checkedIn')
    expect(component).toMatchObject({
      dishId: 'ghost_dish',
      name: 'ghost_dish',
      grams: null,
      kcal: null,
    })
    expect(dinner.stamps[0]?.dish.id).toBe('ghost_dish')
    expect(view.dayStampCount).toBe(1)
    expect(view.dayCalories).toBeNull()
  })

  it('handles a custom-only day without stamps', () => {
    const custom = createCustomOnlyCandidate({
      id: 'custom:2026-10-29:lunch',
      name: '和朋友聚餐',
      calories: 800,
    })
    const data = makeData()
    setMeal(data, DAY, 'lunch', custom, {
      checkedIn: true,
      calories: 800,
    })

    const view = buildDayDetailView(data, DAY, DAY)
    const lunch = view.meals[1]!

    expect(lunch.status).toBe('checkedIn')
    expect(lunch.stampSlot).toBe('custom')
    expect(lunch.stamps).toEqual([])
    expect(view.dayStampCount).toBe(0)
    expect(view.dayCalories).toBe(800)
  })

  it('falls back to an empty day and flags future dates', () => {
    const data = makeData()
    const missing = shiftDateKey(DAY, -1)!
    const view = buildDayDetailView(data, missing, DAY)

    expect(view.meals.map((meal) => meal.status)).toEqual([
      'undrawn',
      'undrawn',
      'undrawn',
    ])
    expect(view.dayCalories).toBeNull()
    expect(view.dayStampCount).toBe(0)
    expect(view.isFuture).toBe(false)

    const future = shiftDateKey(DAY, 1)!
    expect(buildDayDetailView(data, future, DAY).isFuture).toBe(true)
  })
})
