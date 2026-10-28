import { MEALS } from '@/config/gameConfig'

import { getEatenDishIds } from './components'
import {
  isValidMonthKey,
  parseDateKey,
  shiftDateKey,
} from './dateKey'
import { getMealDayStatus } from './mealStatus'
import type { MealDayStatus } from './mealStatus'
import type { ComboCandidateSnapshot, MealType } from './types'

export type { MealDayStatus } from './mealStatus'

export interface CalendarMealLike {
  budget: { checkedIn: boolean; baseUsed: number; adUsed: number }
  candidateCombos: readonly ComboCandidateSnapshot[]
  selectedCandidateId: string | null
  calories: number | null
}

export interface CalendarDayLike {
  dateKey: string
  meals: Record<MealType, CalendarMealLike>
}

export type CalendarDays = Readonly<Record<string, CalendarDayLike>>

export interface DaySummary {
  dateKey: string
  statuses: Record<MealType, MealDayStatus>
  checkedInCount: number
  /** 当日实际吃掉的库内部件数；同餐同菜去重，跨餐可重复。 */
  stampCount: number
  /** 只累计已打卡餐；没有任何数值时为 null。 */
  calories: number | null
}

export interface MonthStats {
  monthKey: string
  checkedInDays: number
  fullAttendanceDays: number
  currentStreak: number
  stampCount: number
}

export interface CalendarMonthCell {
  dateKey: string
  day: number
  isToday: boolean
  isFuture: boolean
  statuses: Record<MealType, MealDayStatus>
  checkedInCount: number
  stampCount: number
  calories: number | null
}

export interface CalendarMonth {
  monthKey: string
  year: number
  month: number
  weeks: (CalendarMonthCell | null)[][]
  stats: MonthStats
}

const WEEKS_PER_MONTH = 6
const DAYS_PER_WEEK = 7

function createStatuses(): Record<MealType, MealDayStatus> {
  return {
    breakfast: 'undrawn',
    lunch: 'undrawn',
    dinner: 'undrawn',
  }
}

/** 已打卡餐中，实际吃掉的库内部件 dishId（同一餐内去重）。 */
export function getMealStampDishIds(meal: CalendarMealLike): string[] {
  if (!meal.budget.checkedIn) {
    return []
  }

  const selected = meal.candidateCombos.find(
    (candidate) => candidate.id === meal.selectedCandidateId,
  )
  return selected ? getEatenDishIds(selected.components) : []
}

export function summarizeDay(
  dateKey: string,
  day?: CalendarDayLike | null,
): DaySummary {
  const statuses = createStatuses()
  let checkedInCount = 0
  let stampCount = 0
  let calories = 0
  let hasCalories = false

  for (const meal of MEALS) {
    const record = day?.meals[meal.type]
    if (!record) {
      continue
    }

    const status = getMealDayStatus(record)
    statuses[meal.type] = status
    if (status !== 'checkedIn') {
      continue
    }

    checkedInCount += 1
    stampCount += getMealStampDishIds(record).length
    if (record.calories !== null && Number.isFinite(record.calories)) {
      calories += record.calories
      hasCalories = true
    }
  }

  return {
    dateKey,
    statuses,
    checkedInCount,
    stampCount,
    calories: hasCalories ? Math.round(calories) : null,
  }
}

/**
 * 当前连续打卡天数：今天有打卡就从今天算，否则从昨天算；
 * 遇到第一个没有打卡的日期停止，可以跨月/跨年。
 */
export function getCurrentStreak(
  days: CalendarDays,
  todayKey: string,
): number {
  if (!parseDateKey(todayKey)) {
    return 0
  }

  let cursor: string | null = todayKey
  if (summarizeDay(todayKey, days[todayKey]).checkedInCount === 0) {
    cursor = shiftDateKey(todayKey, -1)
  }

  let streak = 0
  while (cursor && summarizeDay(cursor, days[cursor]).checkedInCount > 0) {
    streak += 1
    cursor = shiftDateKey(cursor, -1)
  }
  return streak
}

function monthParts(
  monthKey: string,
): { year: number; month: number } | null {
  if (!isValidMonthKey(monthKey)) {
    return null
  }
  const parts = parseDateKey(`${monthKey}-01`)
  return parts ? { year: parts.year, month: parts.month } : null
}

function daysInMonth(year: number, month: number): number {
  // month 为 1–12；第 0 天是上个月最后一天，所以这里取本月最后一天。
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function dateKeyInMonth(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(
    2,
    '0',
  )}-${String(day).padStart(2, '0')}`
}

export function getMonthStats(
  days: CalendarDays,
  monthKey: string,
  todayKey: string,
): MonthStats {
  const stats: MonthStats = {
    monthKey,
    checkedInDays: 0,
    fullAttendanceDays: 0,
    currentStreak: getCurrentStreak(days, todayKey),
    stampCount: 0,
  }

  const parts = monthParts(monthKey)
  if (!parts) {
    return stats
  }

  const totalDays = daysInMonth(parts.year, parts.month)
  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = dateKeyInMonth(parts.year, parts.month, day)
    const summary = summarizeDay(dateKey, days[dateKey])
    if (summary.checkedInCount > 0) {
      stats.checkedInDays += 1
    }
    if (summary.checkedInCount === MEALS.length) {
      stats.fullAttendanceDays += 1
    }
    stats.stampCount += summary.stampCount
  }

  return stats
}

/**
 * 月历网格：周一为一周起点，固定 6 行 × 7 列，月外格子为 null。
 * 未来日期可浏览但由界面禁用；数据缺失时统计为 0，不抛错。
 */
export function buildCalendarMonth(
  days: CalendarDays,
  monthKey: string,
  todayKey: string,
): CalendarMonth {
  const stats = getMonthStats(days, monthKey, todayKey)
  const parts = monthParts(monthKey)
  if (!parts) {
    return { monthKey, year: 0, month: 0, weeks: [], stats }
  }

  const totalDays = daysInMonth(parts.year, parts.month)
  const firstWeekday = new Date(
    Date.UTC(parts.year, parts.month - 1, 1),
  ).getUTCDay()
  const leadingBlanks = (firstWeekday + 6) % 7
  const todayIsValid = parseDateKey(todayKey) !== null
  const cells: (CalendarMonthCell | null)[] = Array.from(
    { length: WEEKS_PER_MONTH * DAYS_PER_WEEK },
    () => null,
  )

  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = dateKeyInMonth(parts.year, parts.month, day)
    const summary = summarizeDay(dateKey, days[dateKey])
    cells[leadingBlanks + day - 1] = {
      dateKey,
      day,
      isToday: dateKey === todayKey,
      isFuture: todayIsValid && dateKey > todayKey,
      statuses: summary.statuses,
      checkedInCount: summary.checkedInCount,
      stampCount: summary.stampCount,
      calories: summary.calories,
    }
  }

  const weeks: (CalendarMonthCell | null)[][] = []
  for (let index = 0; index < cells.length; index += DAYS_PER_WEEK) {
    weeks.push(cells.slice(index, index + DAYS_PER_WEEK))
  }

  return {
    monthKey,
    year: parts.year,
    month: parts.month,
    weeks,
    stats,
  }
}
