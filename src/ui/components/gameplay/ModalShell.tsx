import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useVisualViewport } from '../../hooks/useVisualViewport'

interface ModalShellProps {
  title: string
  description?: string
  variant?: 'center' | 'sheet'
  onClose: () => void
  dismissible?: boolean
  className?: string
  scrimClassName?: string
  children: ReactNode
  footer?: ReactNode
}

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'a[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

let bodyLockCount = 0
let previousBodyOverflow = ''

function lockBodyScroll(): void {
  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  bodyLockCount += 1
}

function unlockBodyScroll(): void {
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow
  }
}

/**
 * 统一的浮层外壳：遮罩、标题聚焦、Tab 循环、Esc 关闭、滚动锁与焦点恢复。
 * sheet 形态贴近底部并留出安全区；center 形态用于抽卡与奖励。
 */
export function ModalShell({
  title,
  description,
  variant = 'center',
  onClose,
  dismissible = true,
  className,
  scrimClassName,
  children,
  footer,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  const viewport = useVisualViewport()
  const scrimStyle =
    viewport.height === null
      ? undefined
      : ({
          '--vvh': `${viewport.height}px`,
          '--vv-top': `${viewport.offsetTop}px`,
        } as CSSProperties)

  onCloseRef.current = onClose
  dismissibleRef.current = dismissible

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    lockBodyScroll()
    titleRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) {
        return
      }

      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      )
      if (focusables.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }

      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      const inside = panelRef.current.contains(active)

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      unlockBodyScroll()

      if (previous?.isConnected) {
        previous.focus()
        return
      }
      const activeTab = document.querySelector<HTMLElement>(
        '[aria-current="page"]',
      )
      activeTab?.focus()
    }
  }, [])

  const modal = (
    <div
      className={`modal-scrim modal-scrim--${variant}${
        scrimClassName ? ` ${scrimClassName}` : ''
      }`}
      style={scrimStyle}
      onClick={(event) => {
        if (event.target === event.currentTarget && dismissible) {
          onClose()
        }
      }}
    >
      <div
        ref={panelRef}
        className={`modal modal--${variant}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="modal__head">
          <h2 id={titleId} ref={titleRef} tabIndex={-1}>
            {title}
          </h2>
          {description && <p id={descriptionId}>{description}</p>}
          {dismissible && (
            <button
              type="button"
              className="modal__close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          )}
        </div>

        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
