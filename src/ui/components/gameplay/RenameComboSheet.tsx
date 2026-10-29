import { useId, useState } from 'react'

import { COMBO_NAME_MAX_CHARS } from '@/core/comboName'
import { countUnicodeChars } from '@/data/dataRules'

import { ModalShell } from './ModalShell'

interface RenameComboSheetProps {
  mealLabel: string
  currentName: string
  pending: boolean
  error: string | null
  onClose: () => void
  /** null 表示恢复自动/原始名字。 */
  onSubmit: (name: string | null) => void
}

export function RenameComboSheet({
  mealLabel,
  currentName,
  pending,
  error,
  onClose,
  onSubmit,
}: RenameComboSheetProps) {
  const [value, setValue] = useState(currentName)
  const [localError, setLocalError] = useState<string | null>(null)
  const uid = useId()
  const nameId = `${uid}-combo-name`
  const length = countUnicodeChars(value.trim())

  const handleSubmit = () => {
    const trimmed = value.trim()
    const trimmedLength = countUnicodeChars(trimmed)
    if (trimmedLength === 0) {
      setLocalError('写个名字再保存吧')
      return
    }
    if (trimmedLength > COMBO_NAME_MAX_CHARS) {
      setLocalError(`最多 ${COMBO_NAME_MAX_CHARS} 个字`)
      return
    }
    setLocalError(null)
    onSubmit(trimmed)
  }

  return (
    <ModalShell
      variant="sheet"
      title={`${mealLabel}套餐名字`}
      description={`最多 ${COMBO_NAME_MAX_CHARS} 个字；改完就不会再自动变了。`}
      onClose={onClose}
      dismissible={!pending}
      className="rename-sheet"
      footer={
        <>
          <button
            type="button"
            className="secondary-button rename-sheet__reset"
            onClick={() => onSubmit(null)}
            disabled={pending}
          >
            恢复自动名字
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleSubmit}
            disabled={pending}
          >
            {pending ? '正在保存…' : '保存'}
          </button>
        </>
      }
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-field">
        <label htmlFor={nameId}>这一餐叫什么</label>
        <input
          id={nameId}
          type="text"
          value={value}
          placeholder="比如：番茄炒蛋夜宵"
          onChange={(event) => {
            setValue(event.target.value)
            setLocalError(null)
          }}
          disabled={pending}
          aria-invalid={localError ? true : undefined}
          aria-describedby={`${nameId}-hint`}
        />
        <p id={`${nameId}-hint`} className="rename-sheet__hint">
          {length}/{COMBO_NAME_MAX_CHARS}
        </p>
        {localError && (
          <p className="form-field__error" role="alert">
            {localError}
          </p>
        )}
      </div>

      <p className="sheet-note">
        名字会跟着这次打卡存进历史；之后换部件也不会改它。
      </p>
    </ModalShell>
  )
}
