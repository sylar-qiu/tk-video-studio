import { useCallback, useRef, useState } from 'react'
import ConfirmModal from '../components/ConfirmModal'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export function useConfirm() {
  const [state, setState] = useState<{ options: ConfirmOptions } | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const opts: ConfirmOptions =
      typeof options === 'string' ? { message: options } : options
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setState({ options: opts })
    })
  }, [])

  const finish = (result: boolean) => {
    setState(null)
    resolveRef.current?.(result)
    resolveRef.current = null
  }

  const ConfirmDialog = (
    <ConfirmModal
      open={state !== null}
      title={state?.options.title}
      message={state?.options.message ?? ''}
      confirmLabel={state?.options.confirmLabel}
      cancelLabel={state?.options.cancelLabel}
      danger={state?.options.danger}
      onConfirm={() => finish(true)}
      onCancel={() => finish(false)}
    />
  )

  return { confirm, ConfirmDialog }
}
