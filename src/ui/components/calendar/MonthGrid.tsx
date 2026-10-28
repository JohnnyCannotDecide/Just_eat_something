import { MEALS } from '@/config/gameConfig'

import type { CalendarMonthCell } from '@/core/calendar'

import { STATUS_LABELS } from '../../copy'

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const

interface MonthGridProps {
  weeks: (CalendarMonthCell | null)[][]
  onSelectDate: (dateKey: string) => void
}

function cellLabel(cell: CalendarMonthCell): string {
  const month = Number(cell.dateKey.slice(5, 7))
  const statuses = MEALS.map(
    (meal) => `${meal.label}${STATUS_LABELS[cell.statuses[meal.type]]}`,
  ).join('、')
  const stamps =
    cell.stampCount > 0 ? `，${cell.stampCount} 枚印章` : ''
  const future = cell.isFuture ? '，未来日期' : ''

  return `${cell.isToday ? '今天，' : ''}${month}月${
    cell.day
  }日，${statuses}${stamps}${future}`
}

export function MonthGrid({ weeks, onSelectDate }: MonthGridProps) {
  return (
    <div className="calendar-grid-wrap">
      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="calendar-grid" aria-label="月历">
        {weeks.map((week, weekIndex) => (
          <div className="calendar-week" key={weekIndex}>
            {week.map((cell, dayIndex) => {
              if (!cell) {
                return (
                  <span
                    key={`empty-${weekIndex}-${dayIndex}`}
                    className="calendar-cell calendar-cell--empty"
                    aria-hidden="true"
                  />
                )
              }

              const classNames = [
                'calendar-cell',
                cell.isToday ? 'is-today' : '',
                cell.isFuture ? 'is-future' : '',
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  className={classNames}
                  disabled={cell.isFuture}
                  onClick={() => onSelectDate(cell.dateKey)}
                  aria-label={cellLabel(cell)}
                >
                  <span className="calendar-cell__day">{cell.day}</span>
                  <span className="calendar-cell__dots" aria-hidden="true">
                    {MEALS.map((meal) => (
                      <i
                        key={meal.type}
                        className={`calendar-dot calendar-dot--${
                          cell.statuses[meal.type]
                        }`}
                      />
                    ))}
                  </span>
                  {cell.stampCount > 0 && (
                    <span
                      className="calendar-cell__stamps"
                      aria-hidden="true"
                    >
                      <span className="calendar-cell__stamp-mark">🏵</span>
                      {cell.stampCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
