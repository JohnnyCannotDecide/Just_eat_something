import { useId } from 'react'
import type { ReactNode } from 'react'

import { RARITY_META } from '@/config/gameConfig'

import { formatKcalWithUnit } from '../../formatKcal'
import type { TodayComboCandidate } from '../../selectors/todayView'
import { DishThumb } from './DishThumb'

interface ComboTileProps {
  combo: TodayComboCandidate
  expanded: boolean
  disabled?: boolean
  showCalories: boolean
  onToggle: () => void
  onSelect: (comboId: string) => void
  /** 打开手动改名；只给已选中的卡片传入。 */
  onRename?: () => void
  /** 展开后的部件列表。 */
  children?: ReactNode
}

export function ComboTile({
  combo,
  expanded,
  disabled = false,
  showCalories,
  onToggle,
  onSelect,
  onRename,
  children,
}: ComboTileProps) {
  const rarity = RARITY_META[combo.rarity]
  const active = combo.activeComponents.slice(0, 4)
  const bodyId = `combo-body-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  return (
    <div
      className={`combo-tile${combo.selected ? ' is-selected' : ''}${
        expanded ? ' is-expanded' : ''
      }`}
      data-rarity={combo.rarity}
    >
      <button
        type="button"
        className="combo-tile__toggle"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={`${combo.name}，${rarity.label} 稀有度，${formatKcalWithUnit(
          combo.kcal,
          showCalories,
        )}，${combo.activeComponents.length} 个部件${
          combo.selected ? '，当前已选中' : ''
        }，${expanded ? '收起部件' : '展开部件'}`}
      >
        <span className="combo-tile__topline">
          <span className="combo-tile__rarity">{rarity.label}</span>
          <span className="combo-tile__kcal">
            {formatKcalWithUnit(combo.kcal, showCalories)}
          </span>
        </span>
        <strong className="combo-tile__name">{combo.name}</strong>
        <span className="combo-tile__thumbs" aria-hidden="true">
          {active.map((component) => (
            <span key={component.id} className="combo-tile__thumb">
              <DishThumb
                image={component.image}
                imageId={component.imageId}
                emoji={component.emoji}
              />
            </span>
          ))}
        </span>
        <span className="combo-tile__meta">
          {combo.activeComponents.length} 个部件
          {combo.selected && <span className="combo-tile__badge">已选</span>}
          <span className="combo-tile__chevron" aria-hidden="true">
            ▾
          </span>
        </span>
      </button>

      {onRename && combo.selected && (
        <button
          type="button"
          className="combo-tile__rename"
          onClick={onRename}
          disabled={disabled}
          aria-label={`重命名套餐：${combo.name}`}
          title="给套餐改个名字"
        >
          ✎
        </button>
      )}

      <div className="combo-tile__collapse" aria-hidden={!expanded}>
        <div id={bodyId} className="combo-tile__body" inert={!expanded}>
          {children}
          <button
            type="button"
            className="combo-tile__select"
            aria-pressed={combo.selected}
            disabled={disabled || combo.selected}
            onClick={() => onSelect(combo.id)}
          >
            {combo.selected ? '已选这套' : '选这套'}
          </button>
        </div>
      </div>
    </div>
  )
}
