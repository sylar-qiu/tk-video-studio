import { useEffect, useState } from 'react'
import { api } from '../api'
import Modal from './Modal'
import ModalFooter from './ModalFooter'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (name: string) => void
}

export default function CreateTagModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setError('')
  }, [open])

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('请输入标签名称')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const tag = await api.createTag(trimmed)
      onCreated(tag.name)
      onClose()
    } catch (e) {
      const msg = String(e)
      setError(msg.includes('409') || msg.includes('已存在') ? '标签已存在' : msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="创建标签"
      onClose={onClose}
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      footer={
        <ModalFooter>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '创建中…' : '创建'}
          </button>
        </ModalFooter>
      }
    >
      <div className="modal-form">
        <label className="field">
          <span className="label">标签名称</span>
          <input
            className="input"
            value={name}
            autoFocus
            disabled={submitting}
            placeholder="输入新标签"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit()
            }}
          />
        </label>
        {error && <p className="error modal-form-error">{error}</p>}
      </div>
    </Modal>
  )
}
