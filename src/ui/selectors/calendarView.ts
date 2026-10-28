import {
  buildCalendarMonth,
  summarizeDay,
} from '@/core/calendar'
import type {
  CalendarMonthCell,
  MonthStats,
} from '@/core/calendar'
import type { AppData } from '@/storage/appData'

import type { TodayView } from './todayView'
import { buildTodayView } from './todayView'

export interface CalendarMonthView {
  monthKey: string
  monthLabel: string
  weeks: (CalendarMonthCell | null)[][]
  stats: MonthStats
  hasCheckedIn: boolean
}

export interface CalendarDayView extends TodayView {
  /** 当日已打卡餐的热量合计；没有任何数值时为 null。 */
  dayCalories: number | null
  dayStampCount: number
  isFuture: boolean
}

export function buildCalendarMonthView(
  data: AppData,
  monthKey: string,
  todayKey: string,
): CalendarMonthView {
  const month = buildCalendarMonth(data.days, monthKey, todayKey)

  return {
    monthKey: month.monthKey,
    monthLabel:
      month.year > 0 ? `${month.year}年${month.month}月` : month.monthKey,
    weeks: month.weeks,
    stats: month.stats,
    hasCheckedIn: month.stats.checkedInDays > 0,
  }
}

/**
 * 历史日详情完全复用今日页的视图构建：选中套餐、部件、印章都来自快照，
 * 不依赖当前菜品库；热量展示由 showCalories 统一控制。
 */
export function buildDayDetailView(
  data: AppData,
  dateKey: string,
  todayKey: string,
): CalendarDayView {
  const view = buildTodayView(data, dateKey)
  const summary = summarizeDay(dateKey, data.days[dateKey])

  return {
    ...view,
    dayCalories: summary.calories,
    dayStampCount: summary.stampCount,
    isFuture: dateKey > todayKey,
  }
}
