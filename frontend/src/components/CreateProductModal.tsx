import { useEffect, useMemo, useState } from 'react'
import type { Category } from '../api'
import { flattenCategories } from '../utils/categories'
import Modal from './Modal'
import ModalFooter from './ModalFooter'

interface CreateProductModalProps {
  open: boolean
  categories: Category[]
  submitting: boolean
  onClose: () => void
  onSubmit: (data: { name: string; category_id: number | null }) => void
}

export default function CreateProductModal({
  open,
  categories,
  submitting,
  onClose,
  onSubmit,
}: CreateProductModalProps) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState('')

  const flatCategories = useMemo(() => flattenCategories(categories), [categories])

  useEffect(() => {
    if (!open) return
    setName('')
    setCategoryId('')
    setError('')
  }, [open])

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('请输入产品名称')
      return
    }
    setError('')
    onSubmit({
      name: trimmed,
      category_id: categoryId ? Number(categoryId) : null,
    })
  }

  return (
    <Modal
      open={open}
      title="创建产品"
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
          <span className="label">产品名称</span>
          <input
            className="input"
            placeholder="输入产品名称"
            value={name}
            autoFocus
            disabled={submitting}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
          />
        </label>
        <label className="field">
          <span className="label">所属类目</span>
          <select
            className="input"
            value={categoryId}
            disabled={submitting}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">选择类目（可选）</option>
            {flatCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {'\u00A0'.repeat(c.depth * 2)}
                {c.path}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error modal-form-error">{error}</p>}
      </div>
    </Modal>
  )
}
