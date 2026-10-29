import { useId, useMemo, useState } from 'react'

import type { Dish, MealType, Rarity } from '@/core/types'

import { formatKcalWithUnit } from '../../formatKcal'
import {
  createCustomDraft,
  parseCustomMealDraft,
} from '../../gameplay/customForm'
import type { CustomMealErrors } from '../../gameplay/customForm'
import { DishThumb } from '../today/DishThumb'
import { ModalShell } from './ModalShell'

type SheetMode = 'library' | 'custom'

interface AddComponentSheetProps {
  meal: MealType
  mealLabel: string
  comboRarity: Rarity
  /** 可添加的菜品（官方 + 未归档自制菜）。 */
  dishCatalog: readonly Dish[]
  existingDishIds: readonly string[]
  showCalories: boolean
  pending: boolean
  error: string | null
  onClose: () => void
  onAddDish: (dishId: string) => void
  onAddCustom: (input: { name: string; calories: number | null }) => void
}

export function AddComponentSheet({
  meal,
  mealLabel,
  comboRarity,
  dishCatalog,
  existingDishIds,
  showCalories,
  pending,
  error,
  onClose,
  onAddDish,
  onAddCustom,
}: AddComponentSheetProps) {
  const [mode, setMode] = useState<SheetMode>('library')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(createCustomDraft)
  const [errors, setErrors] = useState<CustomMealErrors>({})
  const uid = useId()
  const nameId = `${uid}-name`
  const caloriesId = `${uid}-calories`
  const existing = useMemo(() => new Set(existingDishIds), [existingDishIds])

  const available = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return dishCatalog.filter(
      (dish) =>
        dish.meals.includes(meal) &&
        !existing.has(dish.id) &&
        (comboRarity === 'UR' || dish.rarity !== 'UR') &&
        (keyword.length === 0 ||
          dish.name.toLowerCase().includes(keyword) ||
          dish.id.toLowerCase().includes(keyword)),
    )
  }, [comboRarity, dishCatalog, existing, meal, query])

  const handleCustomSubmit = () => {
    const parsed = parseCustomMealDraft(draft)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    onAddCustom(parsed.value)
  }

  return (
    <ModalShell
      variant="sheet"
      title={`${mealLabel} · 添加部件`}
      description="从菜品库挑一道，或记一条自定义内容。"
      onClose={onClose}
      dismissible={!pending}
      className="add-component-sheet"
      footer={
        mode === 'custom' ? (
          <button
            type="button"
            className="primary-button"
            onClick={handleCustomSubmit}
            disabled={pending}
          >
            {pending ? '正在添加…' : '添加自定义部件'}
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={pending}
          >
            先不加了
          </button>
        )
      }
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="segmented" role="tablist" aria-label="添加方式">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'library'}
          className={mode === 'library' ? 'is-active' : ''}
          onClick={() => setMode('library')}
          disabled={pending}
        >
          菜品库
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'custom'}
          className={mode === 'custom' ? 'is-active' : ''}
          onClick={() => setMode('custom')}
          disabled={pending}
        >
          自定义记录
        </button>
      </div>

      {mode === 'library' ? (
        <>
          <div className="form-field">
            <label htmlFor={`${uid}-search`}>搜索菜品</label>
            <input
              id={`${uid}-search`}
              type="search"
              value={query}
              placeholder="输入名字找一找"
              onChange={(event) => setQuery(event.target.value)}
              disabled={pending}
            />
          </div>

          {available.length === 0 ? (
            <p className="sheet-note">没有找到可添加的菜品。</p>
          ) : (
            <ul className="add-dish-list">
              {available.map((dish) => (
                <li key={dish.id}>
                  <button
                    type="button"
                    className="add-dish-row"
                    onClick={() => onAddDish(dish.id)}
                    disabled={pending}
                  >
                    <span className="add-dish-row__thumb">
                      <DishThumb
                        image={dish.image}
                        imageId={dish.imageId}
                        emoji={dish.emoji ?? dish.name.slice(0, 1)}
                      />
                    </span>
                    <span className="add-dish-row__text">
                      <strong>{dish.name}</strong>
                      <small>
                        {dish.rarity} · {dish.category}
                      </small>
                    </span>
                    <span className="add-dish-row__kcal">
                      {dish.isCustom
                        ? formatKcalWithUnit(dish.calories, showCalories)
                        : `${Math.round(
                            dish.ingredients.reduce(
                              (sum, item) => sum + item.grams,
                              0,
                            ),
                          )} g`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="form-field">
            <label htmlFor={nameId}>吃了什么</label>
            <input
              id={nameId}
              type="text"
              value={draft.name}
              maxLength={24}
              placeholder="比如：同事请的奶茶"
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
                setErrors((current) => ({ ...current, name: undefined }))
              }}
              disabled={pending}
              aria-invalid={errors.name ? true : undefined}
            />
            {errors.name && (
              <p className="form-field__error">{errors.name}</p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor={caloriesId}>热量（可选）</label>
            <div className="form-field__input">
              <input
                id={caloriesId}
                type="text"
                inputMode="numeric"
                value={draft.calories}
                placeholder="比如：300，可留空"
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    calories: event.target.value,
                  }))
                  setErrors((current) => ({
                    ...current,
                    calories: undefined,
                  }))
                }}
                disabled={pending}
                aria-invalid={errors.calories ? true : undefined}
              />
              <span aria-hidden="true">kcal</span>
            </div>
            {errors.calories && (
              <p className="form-field__error">{errors.calories}</p>
            )}
          </div>

          <p className="sheet-note">
            自定义记录不生成印章；勾选吃掉后会按规则给抽卡券。
          </p>
        </>
      )}
    </ModalShell>
  )
}
