import { useEffect, useState } from 'react'
import Modal from './Modal'
import ModalFooter from './ModalFooter'

interface ScriptNameModalProps {
  open: boolean
  defaultName: string
  onClose: () => void
  onConfirm: (name: string) => void
}

export default function ScriptNameModal({
  open,
  defaultName,
  onClose,
  onConfirm,
}: ScriptNameModalProps) {
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  const handleConfirm = () => {
    onConfirm(name.trim())
    onClose()
  }

  return (
    <Modal
      open={open}
      title="编辑脚本名称"
      onClose={onClose}
      footer={
        <ModalFooter>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm}>
            确定
          </button>
        </ModalFooter>
      }
    >
      <div className="field">
        <span className="label">脚本名称</span>
        <input
          className="input"
          value={name}
          autoFocus
          placeholder="留空则保存时自动命名"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm()
          }}
        />
      </div>
    </Modal>
  )
}
