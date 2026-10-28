import type { ReactNode } from 'react'

import { ModalShell } from './ModalShell'

interface ConfirmDialogProps {
  title: string
  description?: string
  confirmLabel: string
  pendingLabel?: string
  pending?: boolean
  error?: string | null
  tone?: 'default' | 'danger'
  onCancel: () => void
  onConfirm: () => void
  children?: ReactNode
}

/**
 * 通用确认弹窗：一次说明 + 明确的确认按钮。
 * 复用 ModalShell 的 portal、焦点陷阱、Esc 与焦点恢复。
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending = false,
  error = null,
  tone = 'default',
  onCancel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <ModalShell
      title={title}
      description={description}
      variant="center"
      className="confirm-dialog"
      dismissible={!pending}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={pending}
          >
            取消
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'danger-button' : 'primary-button'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </button>
        </>
      }
    >
      {children}
      {error && (
        <p className="confirm-dialog__error" role="alert">
          {error}
        </p>
      )}
    </ModalShell>
  )
}
