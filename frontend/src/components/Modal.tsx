import { useEffect, useRef, type ReactNode } from 'react'
import { acquireBodyScrollLock } from '../utils/scrollLock'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'default' | 'wide' | 'large' | 'video'
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
}

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'default',
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    const releaseScroll = acquireBodyScrollLock()
    return () => {
      window.removeEventListener('keydown', onKey)
      releaseScroll()
    }
  }, [open, closeOnEscape])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div
        className={`modal-panel modal-panel--${size}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h3 id="modal-title">{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer}
      </div>
    </div>
  )
}
