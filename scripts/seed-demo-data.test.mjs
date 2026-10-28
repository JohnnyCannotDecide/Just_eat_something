import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  getCurrentStreak,
  getMonthStats,
  summarizeDay,
} from '@/core/calendar'
import { shiftDateKey } from '@/core/dateKey'
import { parseAppDataJson } from '@/storage/appData'
import { buildTodayView } from '@/ui/selectors/todayView'

const TODAY = '2026-10-29'
const SCRIPT = resolve(process.cwd(), 'scripts', 'seed-demo-data.mjs')

function keyAt(offset) {
  const key = shiftDateKey(TODAY, -offset)
  if (!key) {
    throw new Error(`无法计算日期偏移 ${offset}`)
  }
  return key
}

const json = execFileSync(
  process.execPath,
  [SCRIPT, '--stdout', '--today', TODAY, '--days', '45'],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
)
const data = parseAppDataJson(json, TODAY)

describe('seed-demo-data', () => {
  it('produces a valid, importable v2 backup under the size limit', () => {
    expect(data.schemaVersion).toBe(2)
    expect(data.profile).not.toBeNull()
    expect(Buffer.byteLength(json)).toBeLessThan(2 * 1024 * 1024)
    expect(Object.keys(data.days)).toHaveLength(38)
    expect(Object.keys(data.days).some((dateKey) => dateKey > TODAY)).toBe(
      false,
    )
  })

  it('includes gaps, today and the expected day shapes', () => {
    for (const offset of [6, 11, 15, 25, 30, 35, 40]) {
      expect(data.days[keyAt(offset)]).toBeUndefined()
    }

    const today = summarizeDay(TODAY, data.days[TODAY])
    expect(today.checkedInCount).toBe(1)
    expect(today.statuses).toEqual({
      breakfast: 'checkedIn',
      lunch: 'drawn',
      dinner: 'undrawn',
    })
    expect(getCurrentStreak(data.days, TODAY)).toBe(6)

    const drawn = summarizeDay(keyAt(9), data.days[keyAt(9)])
    expect(drawn.checkedInCount).toBe(0)
    expect(drawn.statuses.lunch).toBe('drawn')

    const empty = summarizeDay(keyAt(14), data.days[keyAt(14)])
    expect(data.days[keyAt(14)]).toBeDefined()
    expect(empty.checkedInCount).toBe(0)
  })

  it('keeps custom-only and all-unknown-calorie days', () => {
    const custom = summarizeDay(keyAt(4), data.days[keyAt(4)])
    expect(custom.checkedInCount).toBe(1)
    expect(custom.stampCount).toBe(0)
    expect(custom.calories).toBe(800)

    const unknown = summarizeDay(keyAt(19), data.days[keyAt(19)])
    expect(unknown.checkedInCount).toBe(1)
    expect(unknown.calories).toBeNull()
  })

  it('preserves an archived dish snapshot and its stamp', () => {
    const dateKey = keyAt(10)
    const summary = summarizeDay(dateKey, data.days[dateKey])
    expect(summary.stampCount).toBeGreaterThanOrEqual(1)

    const view = buildTodayView(data, dateKey)
    const stamps = view.meals.flatMap((meal) => meal.stamps)
    expect(stamps.some((stamp) => stamp.dish.id === 'ghost_archived_dish')).toBe(
      true,
    )

    const ghostComponent = view.meals
      .flatMap((meal) => meal.components)
      .find((component) => component.dishId === 'ghost_archived_dish')
    expect(ghostComponent).toMatchObject({
      name: '旧菜单的南瓜派',
      grams: 180,
      kcal: 47,
    })
  })

  it('keeps monthly stamp stats consistent with stamp records', () => {
    const stats = getMonthStats(data.days, '2026-10', TODAY)
    const octoberStamps = Object.values(data.stamps).reduce(
      (total, record) =>
        total +
        record.checkInDates.filter((dateKey) => dateKey.startsWith('2026-10'))
          .length,
      0,
    )

    expect(stats.checkedInDays).toBeGreaterThan(0)
    expect(stats.fullAttendanceDays).toBeGreaterThanOrEqual(1)
    expect(stats.stampCount).toBe(octoberStamps)
    expect(stats.stampCount).toBeGreaterThan(0)
  })
})
