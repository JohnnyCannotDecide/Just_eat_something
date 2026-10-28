import type { CSSProperties } from 'react'

import { RARITY_META } from '@/config/gameConfig'

import { formatKcal } from '../../formatKcal'
import type { TodayComboCandidate } from '../../selectors/todayView'
import { DishThumb } from './DishThumb'

interface ComboTileProps {
  combo: TodayComboCandidate
  disabled?: boolean
  showCalories: boolean
  onSelect: (comboId: string) => void
}

export function ComboTile({
  combo,
  disabled = false,
  showCalories,
  onSelect,
}: ComboTileProps) {
  const rarity = RARITY_META[combo.rarity]
  const style = {
    '--rarity-color': rarity.color,
    '--rarity-glow': rarity.glow,
  } as CSSProperties
  const active = combo.activeComponents.slice(0, 4)

  return (
    <button
      type="button"
      className={`combo-tile${combo.selected ? ' is-selected' : ''}`}
      style={style}
      onClick={() => onSelect(combo.id)}
      disabled={disabled}
      aria-pressed={combo.selected}
      aria-label={`${combo.name}，${rarity.label} 稀有度，${formatKcal(
        combo.kcal,
        showCalories,
      )} 千卡，${combo.activeComponents.length} 个部件${
        combo.selected ? '，已选中' : '，点击选择'
      }`}
    >
      <span className="combo-tile__topline">
        <span className="combo-tile__rarity">{rarity.label}</span>
        <span className="combo-tile__kcal">
          {formatKcal(combo.kcal, showCalories)} kcal
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
      </span>
    </button>
  )
}
