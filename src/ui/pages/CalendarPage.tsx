import { useEffect, useMemo, useState } from 'react'

import { monthKeyOf, shiftMonthKey } from '@/core/dateKey'
import { useAppStore } from '@/store/useAppStore'

import { DayDetailSheet } from '../components/calendar/DayDetailSheet'
import { MonthGrid } from '../components/calendar/MonthGrid'
import { MonthStatsCard } from '../components/calendar/MonthStatsCard'
import { buildCalendarMonthView } from '../selectors/calendarView'

export function CalendarPage() {
  const data = useAppStore((state) => state.data)
  const todayKey = useAppStore((state) => state.todayKey)
  const todayMonthKey = monthKeyOf(todayKey) ?? todayKey.slice(0, 7)

  const [monthKey, setMonthKey] = useState(todayMonthKey)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(
    null,
  )

  const view = useMemo(
    () => buildCalendarMonthView(data, monthKey, todayKey),
    [data, monthKey, todayKey],
  )

  // 跨天后关闭抽屉，避免历史日期与新的"今天"混在一起。
  useEffect(() => {
    setSelectedDateKey(null)
  }, [todayKey])

  const previousMonth = shiftMonthKey(monthKey, -1)
  const nextMonth = shiftMonthKey(monthKey, 1)

  return (
    <section
      className="page calendar-page"
      aria-labelledby="calendar-title"
    >
      <header className="page-head">
        <p className="page-kicker">一天一天，慢慢记</p>
        <h1 id="calendar-title">日历</h1>
        <p className="page-subtitle">
          翻翻看，每一餐都在这里留下了小小的记号。
        </p>
      </header>

      <MonthStatsCard stats={view.stats} />

      <section className="calendar-board" aria-label="月历">
        <div className="month-switcher">
          <button
            type="button"
            className="month-switcher__arrow"
            onClick={() => {
              if (previousMonth) {
                setMonthKey(previousMonth)
              }
            }}
            disabled={previousMonth === null}
            aria-label="上个月"
          >
            ‹
          </button>

          <div className="month-switcher__center">
            <strong className="month-switcher__label">
              {view.monthLabel}
            </strong>
            {monthKey !== todayMonthKey && (
              <button
                type="button"
                className="month-switcher__today"
                onClick={() => setMonthKey(todayMonthKey)}
              >
                回本月
              </button>
            )}
          </div>

          <button
            type="button"
            className="month-switcher__arrow"
            onClick={() => {
              if (nextMonth) {
                setMonthKey(nextMonth)
              }
            }}
            disabled={nextMonth === null}
            aria-label="下个月"
          >
            ›
          </button>
        </div>

        <MonthGrid
          weeks={view.weeks}
          onSelectDate={setSelectedDateKey}
        />

        <div className="calendar-legend" aria-hidden="true">
          <span>
            <i className="calendar-dot calendar-dot--undrawn" />
            未抽
          </span>
          <span>
            <i className="calendar-dot calendar-dot--drawn" />
            已抽
          </span>
          <span>
            <i className="calendar-dot calendar-dot--checkedIn" />
            已打卡
          </span>
          <span>
            <i className="calendar-cell__stamp-mark">🏵</i>
            印章数
          </span>
        </div>

        {!view.hasCheckedIn && (
          <p className="calendar-empty">
            这个月还没有打卡记录，慢慢来就好。
          </p>
        )}
      </section>

      {selectedDateKey && (
        <DayDetailSheet
          dateKey={selectedDateKey}
          todayKey={todayKey}
          onClose={() => setSelectedDateKey(null)}
        />
      )}
    </section>
  )
}
