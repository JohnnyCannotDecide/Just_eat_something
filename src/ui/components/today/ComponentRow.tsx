import { useId, useState } from 'react'

import { RARITY_META } from '@/config/gameConfig'

import { formatKcalWithUnit } from '../../formatKcal'
import type { TodayComponent } from '../../selectors/todayView'
import { CookingDetails } from './CookingDetails'
import { DishThumb } from './DishThumb'

const ORIGIN_LABELS: Record<TodayComponent['origin'], string> = {
  combo: '套餐',
  redraw: '重抽',
  manual: '手动',
  custom: '自定义',
}

interface ComponentRowProps {
  component: TodayComponent
  disabled: boolean
  checkedIn: boolean
  /** 未选中的套餐卡只做预览，不提供任何会改动数据的操作。 */
  readOnly?: boolean
  showCalories: boolean
  undoable: boolean
  onToggleEaten: (component: TodayComponent, eaten: boolean) => void
  onRedraw: (component: TodayComponent) => void
  onDiscard: (component: TodayComponent) => void
  onUndo: (component: TodayComponent) => void
}

export function ComponentRow({
  component,
  disabled,
  checkedIn,
  readOnly = false,
  showCalories,
  undoable,
  onToggleEaten,
  onRedraw,
  onDiscard,
  onUndo,
}: ComponentRowProps) {
  const [showCooking, setShowCooking] = useState(false)
  const inputId = useId()
  const rarity = RARITY_META[component.rarity]
  const locked = checkedIn || readOnly
  const classNames = [
    'component-row',
    component.discarded ? 'is-discarded' : '',
    !component.eaten && !component.discarded ? 'is-unchecked' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={classNames}>
      <div className="component-row__main">
        {!locked && !component.discarded ? (
          <label className="component-check" htmlFor={inputId}>
            <input
              id={inputId}
              type="checkbox"
              checked={component.eaten}
              disabled={disabled}
              onChange={(event) =>
                onToggleEaten(component, event.target.checked)
              }
            />
            <span className="component-check__box" aria-hidden="true">
              ✓
            </span>
            <span className="sr-only">吃了{component.name}</span>
          </label>
        ) : (
          <span
            className={`component-eaten-mark${
              component.eaten ? ' is-eaten' : ''
            }`}
            aria-label={component.eaten ? '吃了' : '没吃'}
          >
            {component.eaten ? '✓' : '—'}
          </span>
        )}

        <span className="component-row__thumb">
          <DishThumb
            image={component.image}
            imageId={component.imageId}
            emoji={component.emoji}
          />
        </span>

        <div className="component-row__text">
          <div className="component-row__title">
            <strong>{component.name}</strong>
            <span
              className="component-row__rarity"
              data-rarity={component.rarity}
            >
              {rarity.label}
            </span>
            {component.origin !== 'combo' && (
              <span className="component-row__origin">
                {ORIGIN_LABELS[component.origin]}
              </span>
            )}
            {component.discarded && (
              <span className="component-row__discarded">已舍弃</span>
            )}
          </div>
          <span className="component-row__meta">
            {component.kind === 'custom'
              ? '自定义记录 · 1 份'
              : `${component.grams ?? 0} g`}
            {' · '}
            {formatKcalWithUnit(component.kcal, showCalories)}
          </span>
        </div>
      </div>

      <div className="component-row__actions">
        {component.cooking && (
          <button
            type="button"
            className="component-action"
            onClick={() => setShowCooking((open) => !open)}
            aria-expanded={showCooking}
            disabled={disabled}
          >
            {showCooking ? '收起' : '怎么做'}
          </button>
        )}
        {!locked && !component.discarded && component.canRedraw && (
          <button
            type="button"
            className="component-action"
            onClick={() => onRedraw(component)}
            disabled={disabled}
          >
            重抽
          </button>
        )}
        {!locked && !component.discarded && (
          <button
            type="button"
            className="component-action component-action--danger"
            onClick={() => onDiscard(component)}
            disabled={disabled}
          >
            舍弃
          </button>
        )}
        {!locked && component.discarded && undoable && (
          <button
            type="button"
            className="component-action"
            onClick={() => onUndo(component)}
            disabled={disabled}
          >
            撤销
          </button>
        )}
      </div>

      {component.cooking && (
        <CookingDetails cooking={component.cooking} open={showCooking} />
      )}
    </li>
  )
}
