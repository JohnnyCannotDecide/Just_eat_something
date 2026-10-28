import { useEffect, useId, useState } from 'react'

import {
  MEALS,
  RARITY_META,
  customDishAllowedRarities,
} from '@/config/gameConfig'
import type {
  CookingMethod,
  CustomDish,
  CustomIngredient,
  DishCategory,
  Ingredient,
  MealType,
  Rarity,
} from '@/core/types'
import { COOKING_METHODS, DISH_CATEGORIES } from '@/data/dataRules'
import type { CustomDishInput } from '@/store/useAppStore'

import {
  DISH_CATEGORY_EMOJI,
  DISH_CATEGORY_LABELS,
  createDishDraftFrom,
  createEmptyDishDraft,
  createEmptyRow,
  parseCustomDishDraft,
} from '../../gameplay/customDishForm'
import type {
  CustomDishFormDraft,
  CustomDishFormErrors,
  CustomDishFormRow,
} from '../../gameplay/customDishForm'
import { processImageFile } from '../../images/processImageFile'
import { useImageUrl } from '../../images/useImageUrl'
import { ModalShell } from '../gameplay/ModalShell'

interface CustomDishSheetProps {
  /** null 表示新建。 */
  dish: CustomDish | null
  ingredients: readonly Ingredient[]
  customIngredients: readonly CustomIngredient[]
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: CustomDishInput) => void
}

function toggleMeal(meals: MealType[], meal: MealType): MealType[] {
  return meals.includes(meal)
    ? meals.filter((item) => item !== meal)
    : [...meals, meal]
}

export function CustomDishSheet({
  dish,
  ingredients,
  customIngredients,
  pending,
  error,
  onClose,
  onSubmit,
}: CustomDishSheetProps) {
  const [draft, setDraft] = useState<CustomDishFormDraft>(() =>
    dish ? createDishDraftFrom(dish) : createEmptyDishDraft(),
  )
  const [errors, setErrors] = useState<CustomDishFormErrors>({})
  const [imageError, setImageError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  const uid = useId()
  const nameId = `${uid}-name`
  const emojiId = `${uid}-emoji`
  const categoryId = `${uid}-category`
  const methodId = `${uid}-method`
  const timeId = `${uid}-time`
  const totalId = `${uid}-total`

  const existingImageUrl = useImageUrl(dish?.imageId)
  const currentImageUrl =
    draft.image?.previewUrl ?? (draft.removeImage ? null : existingImageUrl)

  // 换图/卸载时回收旧预览地址。
  useEffect(() => {
    const image = draft.image
    return () => {
      if (image) {
        URL.revokeObjectURL(image.previewUrl)
      }
    }
  }, [draft.image])

  const update = (patch: Partial<CustomDishFormDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }

  const updateRow = (
    key: string,
    patch: Partial<CustomDishFormRow>,
  ) => {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row) =>
        row.key === key ? { ...row, ...patch } : row,
      ),
    }))
    setErrors((current) => ({
      ...current,
      rows: undefined,
      rowErrors: undefined,
    }))
  }

  const handleSourceChange = (key: string, ingredientId: string) => {
    if (!ingredientId) {
      updateRow(key, {
        ingredientId: undefined,
        name: '',
        kcalPer100g: '',
      })
      return
    }
    const source =
      ingredients.find((item) => item.id === ingredientId) ??
      customIngredients.find((item) => item.id === ingredientId)
    if (!source) {
      return
    }
    updateRow(key, {
      ingredientId: source.id,
      name: source.name,
      kcalPer100g: String(source.kcalPer100g),
    })
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      return
    }
    setProcessing(true)
    setImageError(null)
    try {
      const processed = await processImageFile(file)
      setDraft((current) => ({
        ...current,
        image: processed,
        removeImage: false,
      }))
    } catch (caught) {
      setImageError(
        caught instanceof Error ? caught.message : '图片处理失败，换一张试试',
      )
    } finally {
      setProcessing(false)
    }
  }

  const handleCategoryChange = (category: DishCategory) => {
    setDraft((current) => ({
      ...current,
      category,
      // 用户没改过图标时，跟着分类换一个默认图标。
      emoji:
        current.emoji === DISH_CATEGORY_EMOJI[current.category]
          ? DISH_CATEGORY_EMOJI[category]
          : current.emoji,
    }))
  }

  const handleSubmit = () => {
    const parsed = parseCustomDishDraft(draft)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    onSubmit({
      ...parsed.value,
      image: draft.image
        ? { bytes: draft.image.bytes, mime: draft.image.mime }
        : draft.removeImage
          ? null
          : undefined,
    })
  }

  return (
    <ModalShell
      variant="sheet"
      title={dish ? '编辑菜谱' : '新增菜谱'}
      description={
        dish
          ? '改完保存后，历史记录不会跟着变。'
          : '把常吃的菜存进图鉴，也可以让它进抽卡池。'
      }
      onClose={onClose}
      dismissible={!pending && !processing}
      className="custom-dish-sheet"
      footer={
        <button
          type="button"
          className="primary-button"
          onClick={handleSubmit}
          disabled={pending || processing}
        >
          {pending ? '正在保存…' : '保存菜谱'}
        </button>
      }
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-field">
        <label htmlFor={nameId}>菜谱名称</label>
        <input
          id={nameId}
          type="text"
          value={draft.name}
          maxLength={20}
          placeholder="比如：番茄炒蛋"
          onChange={(event) => {
            update({ name: event.target.value })
            setErrors((current) => ({ ...current, name: undefined }))
          }}
          disabled={pending}
          aria-invalid={errors.name ? true : undefined}
        />
        {errors.name && <p className="form-field__error">{errors.name}</p>}
      </div>

      <div className="form-field">
        <span className="form-field__label">菜谱图片</span>
        <div className="dish-image-editor">
          <span className="dish-image-preview">
            {currentImageUrl ? (
              <img src={currentImageUrl} alt="" />
            ) : (
              <span aria-hidden="true">{draft.emoji || '🍽️'}</span>
            )}
          </span>
          <div className="dish-image-actions">
            <label className="secondary-button dish-image-upload">
              {processing
                ? '处理中…'
                : currentImageUrl
                  ? '换一张'
                  : '上传图片'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={pending || processing}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  void handleFile(file)
                }}
              />
            </label>
            {currentImageUrl && !processing && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setDraft((current) => ({
                    ...current,
                    image: null,
                    removeImage: current.removeImage || Boolean(dish?.imageId),
                  }))
                  setImageError(null)
                }}
                disabled={pending}
              >
                移除图片
              </button>
            )}
          </div>
        </div>
        <p className="sheet-note">
          图片会自动裁成正方形并压缩；不传图片就用下面的图标。
        </p>
        {imageError && <p className="form-field__error">{imageError}</p>}

        <label htmlFor={emojiId}>图标</label>
        <input
          id={emojiId}
          type="text"
          value={draft.emoji}
          maxLength={16}
          placeholder="一个 emoji，比如 🍅"
          onChange={(event) => update({ emoji: event.target.value })}
          disabled={pending}
        />
      </div>

      <div className="form-field">
        <label htmlFor={categoryId}>分类</label>
        <select
          id={categoryId}
          value={draft.category}
          onChange={(event) => {
            const next = DISH_CATEGORIES.find(
              (category) => category === event.target.value,
            )
            if (next) {
              handleCategoryChange(next)
            }
          }}
          disabled={pending}
        >
          {DISH_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {DISH_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="form-field dish-meal-field">
        <legend>适合餐次</legend>
        <div className="dish-meal-options">
          {MEALS.map((meal) => (
            <label key={meal.type} className="dish-meal-chip">
              <input
                type="checkbox"
                checked={draft.meals.includes(meal.type)}
                onChange={() => {
                  update({ meals: toggleMeal(draft.meals, meal.type) })
                  setErrors((current) => ({
                    ...current,
                    meals: undefined,
                  }))
                }}
                disabled={pending}
              />
              <span>
                {meal.emoji} {meal.label}
              </span>
            </label>
          ))}
        </div>
        {errors.meals && (
          <p className="form-field__error">{errors.meals}</p>
        )}
      </fieldset>

      <div className="form-field">
        <span className="form-field__label">热量来源</span>
        <div className="segmented" role="tablist" aria-label="热量来源">
          <button
            type="button"
            role="tab"
            aria-selected={draft.calorieMode === 'ingredients'}
            className={
              draft.calorieMode === 'ingredients' ? 'is-active' : ''
            }
            onClick={() => update({ calorieMode: 'ingredients' })}
            disabled={pending}
          >
            按食材
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={draft.calorieMode === 'total'}
            className={draft.calorieMode === 'total' ? 'is-active' : ''}
            onClick={() => update({ calorieMode: 'total' })}
            disabled={pending}
          >
            直接填总热量
          </button>
        </div>
      </div>

      {draft.calorieMode === 'ingredients' ? (
        <section className="form-field" aria-label="食材">
          <span className="form-field__label">食材</span>
          {errors.rows && (
            <p className="form-field__error">{errors.rows}</p>
          )}
          <ul className="dish-row-list">
            {draft.rows.map((row) => {
              const rowError = errors.rowErrors?.[row.key]
              const locked = Boolean(row.ingredientId)
              return (
                <li key={row.key} className="dish-row">
                  <div className="dish-row__controls">
                    <label className="sr-only" htmlFor={`${uid}-${row.key}-source`}>
                      食材来源
                    </label>
                    <select
                      id={`${uid}-${row.key}-source`}
                      value={row.ingredientId ?? ''}
                      onChange={(event) =>
                        handleSourceChange(row.key, event.target.value)
                      }
                      disabled={pending}
                    >
                      <option value="">新建食材</option>
                      <optgroup label="官方食材">
                        {ingredients.map((ingredient) => (
                          <option
                            key={ingredient.id}
                            value={ingredient.id}
                          >
                            {ingredient.name} ·{' '}
                            {ingredient.kcalPer100g} kcal/100g
                          </option>
                        ))}
                      </optgroup>
                      {customIngredients.length > 0 && (
                        <optgroup label="我的食材">
                          {customIngredients.map((ingredient) => (
                            <option
                              key={ingredient.id}
                              value={ingredient.id}
                            >
                              {ingredient.name} ·{' '}
                              {ingredient.kcalPer100g} kcal/100g
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>

                    <div className="dish-row__inputs">
                      <label>
                        <span>名称</span>
                        <input
                          type="text"
                          value={row.name}
                          maxLength={12}
                          onChange={(event) =>
                            updateRow(row.key, {
                              name: event.target.value,
                            })
                          }
                          disabled={pending || locked}
                          aria-invalid={rowError?.name ? true : undefined}
                        />
                      </label>
                      <label>
                        <span>kcal/100g</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.kcalPer100g}
                          onChange={(event) =>
                            updateRow(row.key, {
                              kcalPer100g: event.target.value,
                            })
                          }
                          disabled={pending || locked}
                          aria-invalid={rowError?.kcal ? true : undefined}
                        />
                      </label>
                      <label>
                        <span>克数</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.grams}
                          onChange={(event) =>
                            updateRow(row.key, {
                              grams: event.target.value,
                            })
                          }
                          disabled={pending}
                          aria-invalid={rowError?.grams ? true : undefined}
                        />
                      </label>
                    </div>
                  </div>

                  {rowError && (
                    <p className="form-field__error">
                      {rowError.name ?? rowError.kcal ?? rowError.grams}
                    </p>
                  )}

                  <button
                    type="button"
                    className="dish-row__remove"
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        rows: current.rows.filter(
                          (item) => item.key !== row.key,
                        ),
                      }))
                      setErrors((current) => ({
                        ...current,
                        rows: undefined,
                        rowErrors: undefined,
                      }))
                    }}
                    disabled={pending || draft.rows.length <= 1}
                  >
                    删掉这一行
                  </button>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                rows: [...current.rows, createEmptyRow()],
              }))
            }
            disabled={pending || draft.rows.length >= 12}
          >
            再加一种食材
          </button>
        </section>
      ) : (
        <div className="form-field">
          <label htmlFor={totalId}>总热量</label>
          <div className="form-field__input">
            <input
              id={totalId}
              type="text"
              inputMode="numeric"
              value={draft.totalCalories}
              placeholder="比如：480"
              onChange={(event) => {
                update({ totalCalories: event.target.value })
                setErrors((current) => ({
                  ...current,
                  totalCalories: undefined,
                }))
              }}
              disabled={pending}
              aria-invalid={errors.totalCalories ? true : undefined}
            />
            <span aria-hidden="true">kcal</span>
          </div>
          {errors.totalCalories && (
            <p className="form-field__error">{errors.totalCalories}</p>
          )}
        </div>
      )}

      <label className="switch-row">
        <input
          type="checkbox"
          checked={draft.cookingEnabled}
          onChange={(event) =>
            update({ cookingEnabled: event.target.checked })
          }
          disabled={pending}
        />
        <span className="switch-row__track" aria-hidden="true">
          <span />
        </span>
        <span className="switch-row__text">
          <strong>填写做法</strong>
          <small>可选，想记下来就写 3~5 步。</small>
        </span>
      </label>

      {draft.cookingEnabled && (
        <section className="dish-cooking" aria-label="做法">
          <div className="form-field">
            <label htmlFor={methodId}>做法</label>
            <select
              id={methodId}
              value={draft.cooking.method}
              onChange={(event) => {
                const method = COOKING_METHODS.find(
                  (item) => item === event.target.value,
                )
                if (method) {
                  update({
                    cooking: { ...draft.cooking, method },
                  })
                }
              }}
              disabled={pending}
            >
              {COOKING_METHODS.map((method: CookingMethod) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor={timeId}>用时（分钟）</label>
            <input
              id={timeId}
              type="text"
              inputMode="numeric"
              value={draft.cooking.timeMinutes}
              onChange={(event) => {
                update({
                  cooking: {
                    ...draft.cooking,
                    timeMinutes: event.target.value,
                  },
                })
                setErrors((current) => ({
                  ...current,
                  cookingTime: undefined,
                }))
              }}
              disabled={pending}
              aria-invalid={errors.cookingTime ? true : undefined}
            />
            {errors.cookingTime && (
              <p className="form-field__error">{errors.cookingTime}</p>
            )}
          </div>

          <div className="form-field">
            <span className="form-field__label">步骤</span>
            {draft.cooking.steps.map((step, index) => (
              <div key={index} className="dish-step-row">
                <span className="dish-step-row__index">{index + 1}</span>
                <input
                  type="text"
                  value={step}
                  maxLength={30}
                  placeholder={`第 ${index + 1} 步`}
                  onChange={(event) => {
                    const steps = [...draft.cooking.steps]
                    steps[index] = event.target.value
                    update({
                      cooking: { ...draft.cooking, steps },
                    })
                    setErrors((current) => ({
                      ...current,
                      cooking: undefined,
                      cookingSteps: undefined,
                    }))
                  }}
                  disabled={pending}
                  aria-invalid={
                    errors.cookingSteps?.[index] ? true : undefined
                  }
                />
                {draft.cooking.steps.length > 3 && (
                  <button
                    type="button"
                    className="dish-step-row__remove"
                    onClick={() => {
                      update({
                        cooking: {
                          ...draft.cooking,
                          steps: draft.cooking.steps.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        },
                      })
                      setErrors((current) => ({
                        ...current,
                        cookingSteps: undefined,
                      }))
                    }}
                    disabled={pending}
                  >
                    删
                  </button>
                )}
              </div>
            ))}
            {errors.cooking && (
              <p className="form-field__error">{errors.cooking}</p>
            )}
            {draft.cooking.steps.length < 5 && (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  update({
                    cooking: {
                      ...draft.cooking,
                      steps: [...draft.cooking.steps, ''],
                    },
                  })
                }
                disabled={pending}
              >
                再加一步
              </button>
            )}
          </div>
        </section>
      )}

      <div className="form-field">
        <label htmlFor={`${uid}-rarity`}>稀有度</label>
        <select
          id={`${uid}-rarity`}
          value={draft.rarity}
          onChange={(event) => {
            const rarity = customDishAllowedRarities.find(
              (item) => item === event.target.value,
            )
            if (rarity) {
              update({ rarity: rarity as Rarity })
            }
          }}
          disabled={pending}
        >
          {customDishAllowedRarities.map((rarity) => (
            <option key={rarity} value={rarity}>
              {RARITY_META[rarity].label}（{rarity}）
            </option>
          ))}
        </select>
        {errors.rarity && (
          <p className="form-field__error">{errors.rarity}</p>
        )}
      </div>

      <label className={`switch-row${dish?.archived ? ' is-disabled' : ''}`}>
        <input
          type="checkbox"
          checked={draft.includeInPool && !dish?.archived}
          onChange={(event) =>
            update({ includeInPool: event.target.checked })
          }
          disabled={pending || Boolean(dish?.archived)}
        />
        <span className="switch-row__track" aria-hidden="true">
          <span />
        </span>
        <span className="switch-row__text">
          <strong>加入抽卡池</strong>
          <small>
            {dish?.archived
              ? '已归档的菜谱不会再被抽到。'
              : '开着就有机会在今日页抽到这道菜。'}
          </small>
        </span>
      </label>
    </ModalShell>
  )
}
