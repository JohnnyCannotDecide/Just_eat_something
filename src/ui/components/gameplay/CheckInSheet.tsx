import { useId, useMemo, useState } from 'react'

import { TOKEN_REWARDS } from '@/config/gameConfig'
import type {
  ComboCandidateSnapshot,
  MealComponentSnapshot,
} from '@/core/types'

import { formatKcal } from '../../formatKcal'
import {
  collectDraftUpdates,
  comboFieldError,
  componentDraftTotal,
  createComboCheckInDraft,
  parseComboCheckInDraft,
  previewComboCalories,
  setDraftCustomCalories,
  setDraftEaten,
  setDraftIngredientGrams,
  setDraftTotalGrams,
} from '../../gameplay/comboCheckInForm'
import type {
  ComboCheckInDraft,
  ComboCheckInValues,
  ComboFieldErrors,
} from '../../gameplay/comboCheckInForm'
import { DishThumb } from '../today/DishThumb'
import { ModalShell } from './ModalShell'

interface DraftUpdate {
  eaten: boolean
  grams: Record<string, number> | null
  calories: number | null | undefined
}

interface CheckInSheetProps {
  mealLabel: string
  candidate: ComboCandidateSnapshot
  pending: boolean
  showCalories: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: ComboCheckInValues) => void
  onPersist: (componentId: string, update: DraftUpdate) => void
}

export function CheckInSheet({
  mealLabel,
  candidate,
  pending,
  showCalories,
  error,
  onClose,
  onSubmit,
  onPersist,
}: CheckInSheetProps) {
  const active = useMemo(
    () => candidate.components.filter((component) => !component.discarded),
    [candidate.components],
  )
  const [draft, setDraft] = useState<ComboCheckInDraft>(() =>
    createComboCheckInDraft(candidate.components),
  )
  const [errors, setErrors] = useState<ComboFieldErrors>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [totals, setTotals] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = {}
    for (const component of active) {
      if (component.kind === 'dish') {
        result[component.id] = String(component.grams ?? 0)
      }
    }
    return result
  })
  const uid = useId()
  const calories = useMemo(
    () => previewComboCalories(active, draft),
    [active, draft],
  )

  const persist = (
    component: MealComponentSnapshot,
    nextDraft: ComboCheckInDraft,
  ) => {
    const update = collectDraftUpdates(component, nextDraft)
    onPersist(component.id, update)
  }

  const clearError = (componentId: string, key?: string) => {
    setErrors((current) => {
      const next = { ...current }
      delete next.form
      if (key) {
        delete next[`${componentId}:${key}`]
      }
      return next
    })
  }

  const handleToggle = (
    component: MealComponentSnapshot,
    eaten: boolean,
  ) => {
    const next = setDraftEaten(draft, component.id, eaten)
    setDraft(next)
    clearError(component.id)
    persist(component, next)
  }

  const handleIngredient = (
    component: MealComponentSnapshot,
    key: string,
    value: string,
  ) => {
    const next = setDraftIngredientGrams(draft, component.id, key, value)
    setDraft(next)
    setTotals((current) => ({
      ...current,
      [component.id]: String(componentDraftTotal(component, next)),
    }))
    clearError(component.id, key)
  }

  const handleTotal = (
    component: MealComponentSnapshot,
    value: string,
  ) => {
    setTotals((current) => ({ ...current, [component.id]: value }))
    const next = setDraftTotalGrams(draft, component, value)
    setDraft(next)
  }

  const handleBlur = (
    component: MealComponentSnapshot,
    key?: string,
  ) => {
    if (component.kind === 'dish') {
      setTotals((current) => ({
        ...current,
        [component.id]: String(componentDraftTotal(component, draft)),
      }))
    }
    clearError(component.id, key)
    persist(component, draft)
  }

  const handleSubmit = () => {
    const parsed = parseComboCheckInDraft(active, draft)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    onSubmit(parsed.values)
  }

  const handleClose = () => {
    for (const component of active) {
      persist(component, draft)
    }
    onClose()
  }

  return (
    <ModalShell
      variant="sheet"
      title={`${mealLabel}打卡`}
      description="勾选吃了的部件，克数可以逐项调整。"
      onClose={handleClose}
      dismissible={!pending}
      className="checkin-sheet"
      footer={
        <div className="checkin-foot">
          <div className="checkin-total">
            <span className="checkin-total__label">合计</span>
            <strong>{formatKcal(calories, showCalories)}</strong>
            <span className="checkin-total__unit">kcal</span>
            <span className="checkin-total__hint">
              打卡后送 {TOKEN_REWARDS.formalDish} 张抽卡券
            </span>
          </div>
          <button
            type="button"
            className="primary-button checkin-submit"
            onClick={handleSubmit}
            disabled={pending}
          >
            {pending ? '正在盖章…' : '确认打卡'}
          </button>
        </div>
      }
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {errors.form && (
        <p className="form-error" role="alert">
          {errors.form}
        </p>
      )}

      <ul className="combo-checkin-list">
        {active.map((component) => {
          const inputId = `${uid}-${component.id}`
          const eaten = draft.eaten[component.id] ?? component.eaten
          const isOpen = expanded[component.id] === true

          return (
            <li
              key={component.id}
              className={`combo-checkin${eaten ? '' : ' is-off'}`}
            >
              <div className="combo-checkin__head">
                <label className="combo-checkin__check" htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={eaten}
                    disabled={pending}
                    onChange={(event) =>
                      handleToggle(component, event.target.checked)
                    }
                  />
                  <span aria-hidden="true">✓</span>
                </label>
                <span className="combo-checkin__thumb">
                  <DishThumb
                    image={component.image}
                    imageId={component.imageId}
                    emoji={
                      component.emoji ??
                      (component.kind === 'custom'
                        ? '🍽️'
                        : component.name.slice(0, 1))
                    }
                  />
                </span>
                <div className="combo-checkin__title">
                  <strong>{component.name}</strong>
                  <small>
                    {component.kind === 'custom'
                      ? '自定义记录'
                      : `${component.category ?? '菜品'} · 标准 ${component.grams ?? 0} g`}
                  </small>
                </div>
                {component.kind === 'dish' && (
                  <button
                    type="button"
                    className="combo-checkin__expand"
                    onClick={() =>
                      setExpanded((current) => ({
                        ...current,
                        [component.id]: !isOpen,
                      }))
                    }
                    aria-expanded={isOpen}
                    disabled={pending}
                  >
                    {isOpen ? '收起' : '克数'}
                  </button>
                )}
              </div>

              {eaten && component.kind === 'dish' && (
                <div className="combo-checkin__grams">
                  <label>
                    <span>总克数</span>
                    <span className="combo-checkin__input">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={totals[component.id] ?? ''}
                        onChange={(event) =>
                          handleTotal(component, event.target.value)
                        }
                        onBlur={() => handleBlur(component)}
                        disabled={pending}
                      />
                      <span aria-hidden="true">g</span>
                    </span>
                  </label>

                  {isOpen && (
                    <ul className="ingredient-list ingredient-list--nested">
                      {component.ingredients.map((ingredient, index) => {
                        const key = ingredient.ingredientId ?? String(index)
                        const fieldError = comboFieldError(
                          errors,
                          component.id,
                          key,
                        )
                        return (
                          <li key={key} className="ingredient-row">
                            <div className="ingredient-row__label">
                              <label
                                htmlFor={`${uid}-${component.id}-${key}`}
                              >
                                {ingredient.name}
                              </label>
                              <span>
                                {formatKcal(
                                  ingredient.kcalPer100g,
                                  showCalories,
                                )}{' '}
                                kcal / 100g
                              </span>
                            </div>
                            <div className="ingredient-row__input">
                              <input
                                id={`${uid}-${component.id}-${key}`}
                                type="text"
                                inputMode="decimal"
                                value={
                                  draft.ingredientGrams[component.id]?.[key] ??
                                  ''
                                }
                                onChange={(event) =>
                                  handleIngredient(
                                    component,
                                    key,
                                    event.target.value,
                                  )
                                }
                                onBlur={() => handleBlur(component, key)}
                                disabled={pending}
                                aria-invalid={fieldError ? true : undefined}
                              />
                              <span aria-hidden="true">g</span>
                            </div>
                            {fieldError && (
                              <p className="ingredient-row__error">
                                {fieldError}
                              </p>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}

              {eaten && component.kind === 'custom' && (
                <div className="combo-checkin__custom">
                  <label>
                    <span>热量（可留空）</span>
                    <span className="combo-checkin__input">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={draft.customCalories[component.id] ?? ''}
                        onChange={(event) => {
                          const next = setDraftCustomCalories(
                            draft,
                            component.id,
                            event.target.value,
                          )
                          setDraft(next)
                          clearError(component.id, 'calories')
                        }}
                        onBlur={() => handleBlur(component, 'calories')}
                        disabled={pending}
                        aria-invalid={
                          comboFieldError(errors, component.id, 'calories')
                            ? true
                            : undefined
                        }
                      />
                      <span aria-hidden="true">kcal</span>
                    </span>
                  </label>
                  {comboFieldError(errors, component.id, 'calories') && (
                    <p className="ingredient-row__error">
                      {comboFieldError(errors, component.id, 'calories')}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="sheet-note">
        只给勾选的部件计时：被取消勾选的部件不会计入热量，也不会得到印章。
      </p>
    </ModalShell>
  )
}
