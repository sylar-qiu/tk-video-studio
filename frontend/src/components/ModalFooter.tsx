import type { ReactNode } from 'react'

interface ModalFooterProps {
  children: ReactNode
  align?: 'end' | 'start' | 'between'
}

export default function ModalFooter({ children, align = 'end' }: ModalFooterProps) {
  return <div className={`modal-footer modal-footer--${align}`}>{children}</div>
}
