import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import type { ToastMessage } from '@/store/useUiStore'

interface ToastProps {
  toast: ToastMessage | null
  onDismiss: () => void
}

const TOAST_DURATION_MS = 2800

export function Toast({ toast, onDismiss }: ToastProps) {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!toast) {
      return
    }
    const timer = window.setTimeout(
      () => onDismissRef.current(),
      TOAST_DURATION_MS,
    )
    return () => window.clearTimeout(timer)
  }, [toast])

  if (!toast) {
    return null
  }

  return createPortal(
    <div
      className={`toast${toast.tone === 'error' ? ' toast--error' : ''}`}
      role="status"
      aria-live="polite"
    >
      {toast.text}
    </div>,
    document.body,
  )
}
