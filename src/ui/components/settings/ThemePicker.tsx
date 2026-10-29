import type { ThemeName } from '@/config/gameConfig'

import { THEME_OPTIONS } from '../../theme'

interface ThemePickerProps {
  value: ThemeName
  disabled?: boolean
  onChange: (theme: ThemeName) => void
}

/** 三张预览卡；每张卡内部自带 data-theme，能真实渲染对应主题的令牌。 */
export function ThemePicker({
  value,
  disabled = false,
  onChange,
}: ThemePickerProps) {
  return (
    <fieldset className="theme-picker" disabled={disabled}>
      <legend className="sr-only">选择主题</legend>
      {THEME_OPTIONS.map((option) => {
        const active = option.id === value
        return (
          <label
            key={option.id}
            className={`theme-option${active ? ' is-active' : ''}`}
          >
            <input
              type="radio"
              name="theme"
              value={option.id}
              checked={active}
              onChange={() => onChange(option.id)}
            />
            <span className="theme-option__frame">
              <span
                className="theme-option__preview"
                data-theme={option.id}
                aria-hidden="true"
              >
                <span className="theme-option__bar" />
                <span className="theme-option__block" />
                <span className="theme-option__lines">
                  <i />
                  <i />
                </span>
                <span className="theme-option__dots">
                  <i data-rarity="R" />
                  <i data-rarity="SR" />
                  <i data-rarity="SSR" />
                  <i data-rarity="UR" />
                </span>
              </span>
            </span>
            <span className="theme-option__text">
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
            <span className="theme-option__check" aria-hidden="true">
              {active ? '✓' : ''}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
