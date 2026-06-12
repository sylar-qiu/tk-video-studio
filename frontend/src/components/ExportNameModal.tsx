import { useEffect, useState } from 'react'
import Modal from './Modal'
import ModalFooter from './ModalFooter'

interface ExportNameModalProps {
  open: boolean
  defaultName: string
  submitting: boolean
  onClose: () => void
  onConfirm: (name: string) => void
}

export default function ExportNameModal({
  open,
  defaultName,
  submitting,
  onClose,
  onConfirm,
}: ExportNameModalProps) {
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  const handleConfirm = () => {
    const trimmed = name.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <Modal
      open={open}
      title="导出成片"
      onClose={onClose}
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      footer={
        <ModalFooter>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={submitting}>
            {submitting ? '导出中…' : '确认导出'}
          </button>
        </ModalFooter>
      }
    >
      <div className="field">
        <span className="label">视频名称</span>
        <input
          className="input"
          value={name}
          autoFocus
          disabled={submitting}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm()
          }}
        />
      </div>
    </Modal>
  )
}
