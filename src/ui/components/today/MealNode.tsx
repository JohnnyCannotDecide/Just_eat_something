import type { CSSProperties } from 'react'

import type { MealType } from '@/core/types'

import {
  drawActionLabel,
  STATUS_LABELS,
} from '../../copy'
import { formatKcal } from '../../formatKcal'
import type {
  TodayComponent,
  TodayMealView,
} from '../../selectors/todayView'
import { ComboTile } from './ComboTile'
import { ComponentList } from './ComponentList'
import { StampCluster } from './StampCluster'

interface MealNodeProps {
  meal: TodayMealView
  index: number
  pending: boolean
  showCalories: boolean
  onDraw: (meal: MealType) => void
  onSelectCombo: (meal: MealType, candidateId: string) => void
  onCheckIn: (meal: MealType) => void
  onCustom: (meal: MealType) => void
  onRedraw: (meal: MealType, candidateId: string, componentId: string) => void
  onAddComponent: (meal: MealType, candidateId: string) => void
  onDiscard: (meal: MealType, candidateId: string, componentId: string) => void
  onUndo: (meal: MealType) => void
  onToggleEaten: (
    meal: MealType,
    candidateId: string,
    component: TodayComponent,
    eaten: boolean,
  ) => void
}

export function MealNode({
  meal,
  index,
  pending,
  showCalories,
  onDraw,
  onSelectCombo,
  onCheckIn,
  onCustom,
  onRedraw,
  onAddComponent,
  onDiscard,
  onUndo,
  onToggleEaten,
}: MealNodeProps) {
  const isCheckedIn = meal.status === 'checkedIn'
  const isDrawn = meal.status === 'drawn'
  const canDraw = meal.allowance.canDraw
  const selected = meal.selectedCombo
  const style = {
    '--tilt': index % 2 === 0 ? '-0.3deg' : '0.3deg',
    '--order': index,
  } as CSSProperties
  const otherCandidates =
    isCheckedIn && selected
      ? meal.candidates.filter((candidate) => candidate.id !== selected.id)
      : []
  const selectedCalories = selected?.kcal ?? null

  return (
    <li className={`meal-node meal-node--${meal.status}`} style={style}>
      <span className="meal-node__dot" aria-hidden="true">
        {meal.emoji}
      </span>

      <div className="meal-node__head">
        <div className="meal-node__title">
          <h3>{meal.label}</h3>
          <span className={`status-chip status-chip--${meal.status}`}>
            {STATUS_LABELS[meal.status]}
          </span>
        </div>
        <span className="meal-node__kcal">
          {isCheckedIn
            ? `${formatKcal(meal.calories, showCalories)} kcal`
            : isDrawn
              ? selected
                ? `${formatKcal(selectedCalories, showCalories)} kcal`
                : '待选'
              : '—'}
        </span>
      </div>

      <div className="meal-ticket" aria-busy={pending}>
        <span className="meal-ticket__stitch" aria-hidden="true" />

        {meal.status === 'undrawn' && (
          <div className="meal-empty">
            <span className="meal-empty__icon" aria-hidden="true">
              ＋
            </span>
            <div>
              <p className="meal-empty__title">这一餐还空着</p>
              <p className="meal-empty__hint">等一份合眼缘的套餐。</p>
            </div>
          </div>
        )}

        {isDrawn && (
          <>
            <div className="combo-grid" aria-label={`${meal.label}候选套餐`}>
              {meal.candidates.map((candidate) => (
                <ComboTile
                  key={candidate.id}
                  combo={candidate}
                  disabled={pending}
                  showCalories={showCalories}
                  onSelect={(candidateId) =>
                    onSelectCombo(meal.type, candidateId)
                  }
                />
              ))}
            </div>

            {selected ? (
              <>
                <p className="meal-selection" aria-live="polite">
                  已选：{selected.name}，确认部件后再打卡
                </p>
                <ComponentList
                  components={selected.components}
                  pending={pending}
                  checkedIn={false}
                  showCalories={showCalories}
                  undoableComponentId={meal.undoableComponentId}
                  onToggleEaten={(component, eaten) => {
                    if (selected) {
                      onToggleEaten(meal.type, selected.id, component, eaten)
                    }
                  }}
                  onRedraw={(component) =>
                    onRedraw(meal.type, selected.id, component.id)
                  }
                  onDiscard={(component) =>
                    onDiscard(meal.type, selected.id, component.id)
                  }
                  onUndo={() => onUndo(meal.type)}
                  onAddComponent={() =>
                    onAddComponent(meal.type, selected.id)
                  }
                />
              </>
            ) : (
              <p className="meal-selection" aria-live="polite">
                点一张套餐卡，展开它包含的部件。
              </p>
            )}
          </>
        )}

        {isCheckedIn && (
          <>
            <div className="meal-result">
              <span className="meal-result__emoji" aria-hidden="true">
                {meal.stampSlot === 'custom' ? '🍽️' : '🍱'}
              </span>
              <div className="meal-result__text">
                <span
                  className={`meal-result__tag${
                    meal.stampSlot === 'custom' ? ' is-custom' : ''
                  }`}
                >
                  {meal.stampSlot === 'custom'
                    ? '自定义记录'
                    : `本餐 ${meal.stamps.length} 枚印章`}
                </span>
                <strong>{selected?.name ?? '这一餐'}</strong>
              </div>
              <span className="meal-result__kcal">
                {formatKcal(meal.calories, showCalories)}
                <small> kcal</small>
              </span>
            </div>

            {selected && (
              <ComponentList
                components={selected.components}
                pending={pending}
                checkedIn
                showCalories={showCalories}
                undoableComponentId={null}
                onToggleEaten={() => undefined}
                onRedraw={() => undefined}
                onDiscard={() => undefined}
                onUndo={() => undefined}
              />
            )}

            {otherCandidates.length > 0 && (
              <div className="meal-pool" aria-label="本餐抽到的其他套餐">
                <span className="meal-pool__label">当时还抽到</span>
                {otherCandidates.map((candidate) => (
                  <span key={candidate.id} className="meal-pool__item">
                    <span aria-hidden="true">🍱</span>
                    {candidate.name}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {!isCheckedIn && (
          <div className="meal-actions">
            {isDrawn && (
              <button
                type="button"
                className="meal-action meal-action--primary"
                onClick={() => onCheckIn(meal.type)}
                disabled={pending || !selected}
              >
                就吃这个
              </button>
            )}
            <button
              type="button"
              className={`meal-action${
                isDrawn ? ' meal-action--draw' : ' meal-action--primary'
              }`}
              onClick={() => onDraw(meal.type)}
              disabled={pending || !canDraw}
            >
              {drawActionLabel(meal.allowance)}
            </button>
            <button
              type="button"
              className="meal-action meal-action--ghost"
              onClick={() => onCustom(meal.type)}
              disabled={pending}
            >
              直接记一餐
            </button>
          </div>
        )}

        <div className="meal-ticket__foot">
          <div className="meal-draw">
            {isCheckedIn ? (
              <>
                <span className="meal-draw__total">
                  {meal.stamps.length > 0
                    ? '这餐的印章盖好了'
                    : '本餐已收工'}
                </span>
                <span className="meal-draw__breakdown">
                  {meal.stampSlot === 'custom'
                    ? meal.calories === null
                      ? '热量留空，未计入汇总'
                      : '自定义记录已计入今日热量'
                    : `吃了 ${meal.components.filter((item) => item.eaten).length} 个部件`}
                </span>
              </>
            ) : (
              <>
                <span className="meal-draw__total">
                  {canDraw
                    ? `还能抽 ${meal.allowance.totalRemaining} 次`
                    : '今天的次数用完啦'}
                </span>
                <span className="meal-draw__breakdown">
                  基础 {meal.allowance.remainingBase} · 券{' '}
                  {meal.allowance.remainingTokens} · 广告{' '}
                  {meal.allowance.remainingAds}
                </span>
              </>
            )}
          </div>

          <StampCluster stamps={meal.stamps} slot={meal.stampSlot} />
        </div>
      </div>
    </li>
  )
}
