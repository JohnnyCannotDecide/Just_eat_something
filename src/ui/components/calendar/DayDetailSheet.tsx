import { useMemo } from 'react'

import { useAppStore } from '@/store/useAppStore'

import { STATUS_LABELS } from '../../copy'
import { formatKcalWithUnit } from '../../formatKcal'
import { buildDayDetailView } from '../../selectors/calendarView'
import type { TodayMealView } from '../../selectors/todayView'
import { ModalShell } from '../gameplay/ModalShell'
import { DishStamp } from '../stamp/DishStamp'
import { ComponentList } from '../today/ComponentList'

const noop = () => {}

interface DayMealCardProps {
  meal: TodayMealView
  showCalories: boolean
}

function DayMealCard({ meal, showCalories }: DayMealCardProps) {
  const checkedIn = meal.status === 'checkedIn'
  const selected = meal.selectedCombo

  return (
    <section
      className={`day-detail__meal day-detail__meal--${meal.status}`}
    >
      <header className="day-detail__meal-head">
        <h3>
          <span aria-hidden="true">{meal.emoji}</span> {meal.label}
        </h3>
        <span className={`meal-status meal-status--${meal.status}`}>
          <i className="meal-status__dot" aria-hidden="true" />
          {STATUS_LABELS[meal.status]}
        </span>
      </header>

      {checkedIn ? (
        selected ? (
          <>
            <p className="day-detail__combo-name">
              <strong>{selected.name}</strong>
              <span>{formatKcalWithUnit(meal.calories, showCalories)}</span>
            </p>

            <ComponentList
              components={selected.activeComponents}
              pending={false}
              checkedIn
              showCalories={showCalories}
              undoableComponentId={null}
              onToggleEaten={noop}
              onRedraw={noop}
              onDiscard={noop}
              onUndo={noop}
            />

            {meal.stampSlot === 'custom' && (
              <p className="day-detail__no-stamp">
                自定义记录，没有印章。
              </p>
            )}

            {meal.stamps.length > 0 && (
              <div
                className="day-detail__stamps"
                aria-label={`${meal.stamps.length} 枚印章`}
              >
                {meal.stamps.map((stamp) => (
                  <DishStamp
                    key={stamp.dish.id}
                    dish={stamp.dish}
                    count={stamp.count}
                    tier={stamp.tier}
                    dateLabel={stamp.dateLabel}
                    size="sm"
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="day-detail__empty">
            这餐已经收工了，但记录不太完整。
          </p>
        )
      ) : meal.status === 'drawn' ? (
        <>
          {selected && (
            <p className="day-detail__combo-name">
              <strong>{selected.name}</strong>
              <span>还没打卡</span>
            </p>
          )}
          <p className="day-detail__empty">
            这餐已经抽好了，还没打卡。
          </p>
        </>
      ) : (
        <p className="day-detail__empty">
          这餐没有记录，空着也很好。
        </p>
      )}
    </section>
  )
}

interface DayDetailSheetProps {
  dateKey: string
  todayKey: string
  onClose: () => void
}

export function DayDetailSheet({
  dateKey,
  todayKey,
  onClose,
}: DayDetailSheetProps) {
  const data = useAppStore((state) => state.data)
  const view = useMemo(
    () => buildDayDetailView(data, dateKey, todayKey),
    [data, dateKey, todayKey],
  )
  const description =
    view.checkedInCount > 0
      ? `${view.checkedInCount} 餐记录 · ${view.dayStampCount} 枚印章`
      : '这天还没有记录'

  return (
    <ModalShell
      variant="sheet"
      title={view.dateLabel}
      description={description}
      className="day-detail-sheet"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="primary-button"
          onClick={onClose}
        >
          收好
        </button>
      }
    >
      <div className="day-detail">
        <div className="day-detail__total">
          <span>当日合计</span>
          <strong>
            {formatKcalWithUnit(view.dayCalories, view.showCalories)}
          </strong>
        </div>

        {view.meals.map((meal) => (
          <DayMealCard
            key={meal.type}
            meal={meal}
            showCalories={view.showCalories}
          />
        ))}
      </div>
    </ModalShell>
  )
}
