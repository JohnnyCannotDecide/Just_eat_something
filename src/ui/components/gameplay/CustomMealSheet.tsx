import { useId, useState } from 'react'

import {
  createCustomDraft,
  parseCustomMealDraft,
} from '../../gameplay/customForm'
import type { CustomMealErrors } from '../../gameplay/customForm'
import { ModalShell } from './ModalShell'

interface CustomMealSheetProps {
  mealLabel: string
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: { name: string; calories: number | null }) => void
}

export function CustomMealSheet({
  mealLabel,
  pending,
  error,
  onClose,
  onSubmit,
}: CustomMealSheetProps) {
  const [draft, setDraft] = useState(createCustomDraft)
  const [errors, setErrors] = useState<CustomMealErrors>({})
  const uid = useId()
  const nameId = `${uid}-name`
  const caloriesId = `${uid}-calories`

  const handleSubmit = () => {
    const parsed = parseCustomMealDraft(draft)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    onSubmit(parsed.value)
  }

  return (
    <ModalShell
      variant="sheet"
      title={`${mealLabel} · 自定义记录`}
      description="只记一笔，不生成印章。"
      onClose={onClose}
      dismissible={!pending}
      className="custom-sheet"
      footer={
        <button
          type="button"
          className="primary-button"
          onClick={handleSubmit}
          disabled={pending}
        >
          {pending ? '正在记录…' : '记下这一餐'}
        </button>
      }
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-field">
        <label htmlFor={nameId}>吃了什么</label>
        <input
          id={nameId}
          type="text"
          value={draft.name}
          maxLength={24}
          placeholder="比如：朋友聚餐"
          onChange={(event) => {
            setDraft((current) => ({ ...current, name: event.target.value }))
            setErrors((current) => ({ ...current, name: undefined }))
          }}
          disabled={pending}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${nameId}-error` : undefined}
        />
        {errors.name && (
          <p id={`${nameId}-error`} className="form-field__error">
            {errors.name}
          </p>
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
            placeholder="比如：800，可留空"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                calories: event.target.value,
              }))
              setErrors((current) => ({ ...current, calories: undefined }))
            }}
            disabled={pending}
            aria-invalid={errors.calories ? true : undefined}
            aria-describedby={
              errors.calories ? `${caloriesId}-error` : undefined
            }
          />
          <span aria-hidden="true">kcal</span>
        </div>
        {errors.calories && (
          <p id={`${caloriesId}-error`} className="form-field__error">
            {errors.calories}
          </p>
        )}
      </div>

      <p className="sheet-note">
        🎟️ 今天第一次自定义记录会送 1 张抽卡券，之后的不再重复送。
      </p>
    </ModalShell>
  )
}
