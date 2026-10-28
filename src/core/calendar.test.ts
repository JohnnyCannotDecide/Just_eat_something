import { describe, expect, it } from 'vitest'

import {
  buildCalendarMonth,
  getCurrentStreak,
  getMealStampDishIds,
  getMonthStats,
  summarizeDay,
} from './calendar'
import type { CalendarDayLike, CalendarMealLike } from './calendar'
import { getMealDayStatus } from './mealStatus'
import type { MealComponentSnapshot, MealType } from './types'

const TODAY = '2026-10-29'
let componentSeq = 0

function emptyMeal(): CalendarMealLike {
  return {
    budget: { checkedIn: false, baseUsed: 0, adUsed: 0 },
    candidateCombos: [],
    selectedCandidateId: null,
    calories: null,
  }
}

function component(
  dishId: string | null,
  options: {
    kind?: 'dish' | 'custom'
    eaten?: boolean
    discarded?: boolean
  } = {},
): MealComponentSnapshot {
  componentSeq += 1
  const kind = options.kind ?? 'dish'
  return {
    id: `component-${componentSeq}`,
    kind,
    origin: kind === 'custom' ? 'custom' : 'combo',
    dishId: kind === 'custom' ? null : dishId,
    name: kind === 'custom' ? '自定义记录' : (dishId ?? '未知菜'),
    category: kind === 'custom' ? null : 'staple',
    rarity: 'R',
    image: null,
    cooking: null,
    ingredients: [],
    grams: null,
    calories: 100,
    eaten: options.eaten ?? true,
    discarded: options.discarded ?? false,
  }
}

function meal(options: {
  checkedIn?: boolean
  drawn?: boolean
  components?: MealComponentSnapshot[]
  calories?: number | null
} = {}): CalendarMealLike {
  const checkedIn = options.checkedIn ?? false
  const hasCandidate =
    checkedIn || (options.drawn ?? false) || (options.components?.length ?? 0) > 0
  const candidate = hasCandidate
    ? {
        id: 'candidate',
        comboId: null,
        source: 'draw' as const,
        name: '测试套餐',
        rarity: 'R' as const,
        components: options.components ?? [],
      }
    : null

  return {
    budget: {
      checkedIn,
      baseUsed: hasCandidate ? 1 : 0,
      adUsed: 0,
    },
    candidateCombos: candidate ? [candidate] : [],
    selectedCandidateId: candidate?.id ?? null,
    calories: options.calories ?? null,
  }
}

function day(
  dateKey: string,
  meals: Partial<Record<MealType, CalendarMealLike>> = {},
): CalendarDayLike {
  return {
    dateKey,
    meals: {
      breakfast: meals.breakfast ?? emptyMeal(),
      lunch: meals.lunch ?? emptyMeal(),
      dinner: meals.dinner ?? emptyMeal(),
    },
  }
}

describe('getMealDayStatus', () => {
  it('distinguishes undrawn, drawn and checked-in', () => {
    expect(getMealDayStatus(emptyMeal())).toBe('undrawn')
    expect(
      getMealDayStatus({
        ...emptyMeal(),
        budget: { checkedIn: false, baseUsed: 1, adUsed: 0 },
      }),
    ).toBe('drawn')
    expect(getMealDayStatus(meal({ drawn: true }))).toBe('drawn')
    expect(getMealDayStatus(meal({ checkedIn: true }))).toBe('checkedIn')
  })

  it('prefers checked-in even when draw counts remain', () => {
    expect(
      getMealDayStatus({
        budget: { checkedIn: true, baseUsed: 2, adUsed: 1 },
        candidateCombos: [],
      }),
    ).toBe('checkedIn')
  })
})

describe('getMealStampDishIds', () => {
  it('dedupes within a meal and skips custom/discarded/uneaten', () => {
    const record = meal({
      checkedIn: true,
      components: [
        component('a'),
        component('a'),
        component('b', { discarded: true }),
        component('c', { eaten: false }),
        component(null, { kind: 'custom' }),
        component('archived_dish'),
      ],
    })

    expect(getMealStampDishIds(record)).toEqual(['a', 'archived_dish'])
  })

  it('returns nothing before check-in or without a selected candidate', () => {
    expect(
      getMealStampDishIds(
        meal({ components: [component('a')], calories: null }),
      ),
    ).toEqual([])

    const noSelection: CalendarMealLike = {
      ...meal({ checkedIn: true, components: [component('a')] }),
      selectedCandidateId: 'missing',
    }
    expect(getMealStampDishIds(noSelection)).toEqual([])
  })
})

describe('summarizeDay', () => {
  it('handles a missing day', () => {
    const summary = summarizeDay('2026-10-01')

    expect(summary.statuses).toEqual({
      breakfast: 'undrawn',
      lunch: 'undrawn',
      dinner: 'undrawn',
    })
    expect(summary.checkedInCount).toBe(0)
    expect(summary.stampCount).toBe(0)
    expect(summary.calories).toBeNull()
  })

  it('sums stamps across meals but not within one meal twice', () => {
    const summary = summarizeDay(
      TODAY,
      day(TODAY, {
        breakfast: meal({
          checkedIn: true,
          calories: 300,
          components: [component('a'), component('a'), component('b')],
        }),
        lunch: meal({
          checkedIn: true,
          calories: 500,
          components: [component('a')],
        }),
        dinner: meal({ drawn: true, components: [component('c')] }),
      }),
    )

    expect(summary.statuses).toEqual({
      breakfast: 'checkedIn',
      lunch: 'checkedIn',
      dinner: 'drawn',
    })
    expect(summary.checkedInCount).toBe(2)
    expect(summary.stampCount).toBe(3)
    expect(summary.calories).toBe(800)
  })

  it('skips null calories and returns null when nothing is known', () => {
    const partial = summarizeDay(
      TODAY,
      day(TODAY, {
        breakfast: meal({ checkedIn: true, calories: 300 }),
        lunch: meal({ checkedIn: true, calories: null }),
      }),
    )
    expect(partial.calories).toBe(300)

    const unknown = summarizeDay(
      TODAY,
      day(TODAY, {
        dinner: meal({ checkedIn: true, calories: null }),
      }),
    )
    expect(unknown.checkedInCount).toBe(1)
    expect(unknown.calories).toBeNull()
  })
})

describe('getCurrentStreak', () => {
  function active(dateKey: string): CalendarDayLike {
    return day(dateKey, {
      breakfast: meal({ checkedIn: true, components: [component('a')] }),
    })
  }

  it('includes today when today has a check-in', () => {
    const days = {
      '2026-10-29': active('2026-10-29'),
      '2026-10-28': active('2026-10-28'),
      '2026-10-27': active('2026-10-27'),
    }

    expect(getCurrentStreak(days, TODAY)).toBe(3)
  })

  it('starts from yesterday when today is empty', () => {
    const days = {
      '2026-10-29': day('2026-10-29'),
      '2026-10-28': active('2026-10-28'),
      '2026-10-27': active('2026-10-27'),
      '2026-10-26': active('2026-10-26'),
    }

    expect(getCurrentStreak(days, TODAY)).toBe(3)
  })

  it('stops at the first empty day and can cross months', () => {
    const days = {
      '2026-11-02': active('2026-11-02'),
      '2026-11-01': active('2026-11-01'),
      '2026-10-31': active('2026-10-31'),
      '2026-10-30': active('2026-10-30'),
      // 10-29 缺失，连续中断
    }

    expect(getCurrentStreak(days, '2026-11-02')).toBe(4)
  })

  it('returns zero for no data or an invalid today key', () => {
    expect(getCurrentStreak({}, TODAY)).toBe(0)
    expect(getCurrentStreak({}, 'not-a-date')).toBe(0)
  })
})

describe('getMonthStats', () => {
  const days: Record<string, CalendarDayLike> = {
    '2026-10-27': day('2026-10-27', {
      breakfast: meal({ checkedIn: true, components: [component('a')] }),
      lunch: meal({ checkedIn: true, components: [component('b')] }),
      dinner: meal({ checkedIn: true, components: [component('c')] }),
    }),
    '2026-10-28': day('2026-10-28', {
      breakfast: meal({ checkedIn: true, components: [component('a')] }),
      lunch: meal({ checkedIn: true, components: [component('a')] }),
      dinner: meal({ checkedIn: true, components: [component('b')] }),
    }),
    '2026-10-29': day('2026-10-29', {
      breakfast: meal({ checkedIn: true, components: [component('a')] }),
      lunch: meal({ drawn: true }),
    }),
    '2026-09-30': day('2026-09-30', {
      breakfast: meal({ checkedIn: true, components: [component('z')] }),
    }),
  }

  it('counts checked-in days, full days and stamps for the month', () => {
    const stats = getMonthStats(days, '2026-10', TODAY)

    expect(stats.checkedInDays).toBe(3)
    expect(stats.fullAttendanceDays).toBe(2)
    // 同一道菜跨餐各记一次：27 日 3 枚，28 日 3 枚，29 日 1 枚。
    expect(stats.stampCount).toBe(3 + 3 + 1)
    expect(stats.currentStreak).toBe(3)
  })

  it('returns zeros for a month without data but keeps the global streak', () => {
    const stats = getMonthStats(days, '2026-08', TODAY)

    expect(stats.checkedInDays).toBe(0)
    expect(stats.fullAttendanceDays).toBe(0)
    expect(stats.stampCount).toBe(0)
    expect(stats.currentStreak).toBe(3)
  })

  it('returns zeros for an invalid month key', () => {
    const stats = getMonthStats(days, '2026-13', TODAY)

    expect(stats.checkedInDays).toBe(0)
    expect(stats.stampCount).toBe(0)
    expect(stats.currentStreak).toBe(3)
  })
})

describe('buildCalendarMonth', () => {
  it('builds a fixed Monday-first 6×7 grid', () => {
    const month = buildCalendarMonth({}, '2026-10', TODAY)

    expect(month.year).toBe(2026)
    expect(month.month).toBe(10)
    expect(month.weeks).toHaveLength(6)
    expect(month.weeks.every((week) => week.length === 7)).toBe(true)

    // 2026-10-01 是周四，周一开头时空 3 格。
    const firstWeek = month.weeks[0]!
    expect(firstWeek.slice(0, 3)).toEqual([null, null, null])
    expect(firstWeek[3]?.dateKey).toBe('2026-10-01')
    expect(firstWeek[6]?.dateKey).toBe('2026-10-04')
    expect(month.weeks[4]![3]?.dateKey).toBe('2026-10-29')
  })

  it('marks today and future dates', () => {
    const month = buildCalendarMonth({}, '2026-10', TODAY)
    const cells = month.weeks.flat().filter((cell) => cell !== null)
    const byKey = new Map(cells.map((cell) => [cell.dateKey, cell]))

    expect(byKey.get('2026-10-29')?.isToday).toBe(true)
    expect(byKey.get('2026-10-29')?.isFuture).toBe(false)
    expect(byKey.get('2026-10-30')?.isFuture).toBe(true)
    expect(byKey.get('2026-11-01')).toBeUndefined()
  })

  it('includes statuses and stamp counts per cell', () => {
    const month = buildCalendarMonth(
      {
        [TODAY]: day(TODAY, {
          breakfast: meal({
            checkedIn: true,
            components: [component('a'), component('b')],
          }),
          lunch: meal({ drawn: true }),
        }),
      },
      '2026-10',
      TODAY,
    )
    const cell = month.weeks
      .flat()
      .find((item) => item?.dateKey === TODAY)

    expect(cell?.statuses).toEqual({
      breakfast: 'checkedIn',
      lunch: 'drawn',
      dinner: 'undrawn',
    })
    expect(cell?.checkedInCount).toBe(1)
    expect(cell?.stampCount).toBe(2)
  })

  it('handles leap February and December', () => {
    const leap = buildCalendarMonth({}, '2024-02', '2026-10-29')
    const leapDays = leap.weeks
      .flat()
      .filter((cell) => cell !== null)
    expect(leapDays).toHaveLength(29)
    expect(leapDays.at(-1)?.dateKey).toBe('2024-02-29')

    const december = buildCalendarMonth({}, '2026-12', TODAY)
    const decemberDays = december.weeks
      .flat()
      .filter((cell) => cell !== null)
    expect(decemberDays).toHaveLength(31)
    expect(decemberDays.at(-1)?.dateKey).toBe('2026-12-31')
  })

  it('does not throw for an invalid month key', () => {
    const month = buildCalendarMonth({}, '2026-13', TODAY)

    expect(month.weeks).toEqual([])
    expect(month.stats.checkedInDays).toBe(0)
  })
})
