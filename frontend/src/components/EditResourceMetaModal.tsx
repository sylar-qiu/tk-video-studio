import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useConfirm } from '../hooks/useConfirm'
import type { ResourceMetaSaveData } from '../types/resourceMeta'
import Modal from './Modal'
import ModalFooter from './ModalFooter'
import TagSelect from './TagSelect'

interface Props {
  open: boolean
  productId: number | null
  shotName?: string | null
  tags: string[]
  editableShotName?: boolean
  submitting?: boolean
  onClose: () => void
  onSave: (data: ResourceMetaSaveData) => Promise<void>
}

export default function EditResourceMetaModal({
  open,
  productId,
  shotName,
  tags,
  editableShotName = false,
  submitting = false,
  onClose,
  onSave,
}: Props) {
  const [products, setProducts] = useState<{ id: number; name: string }[]>([])
  const [pid, setPid] = useState(String(productId ?? ''))
  const [name, setName] = useState(shotName ?? '')
  const [selectedTags, setSelectedTags] = useState<string[]>(tags)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const initialProductIdRef = useRef('')
  const { confirm, ConfirmDialog } = useConfirm()

  const productInherited = editableShotName
  const busy = submitting || saving

  useEffect(() => {
    api.listProducts().then((list) => setProducts(list)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const pidStr = String(productId ?? '')
    setPid(pidStr)
    initialProductIdRef.current = pidStr
    setName(shotName ?? '')
    setSelectedTags(tags)
    setError('')
    // 仅在弹窗打开时同步一次，避免父级轮询刷新把未保存的选项清掉
  }, [open])

  const handleSave = async () => {
    if (editableShotName && !name.trim()) {
      setError('请输入分镜名称')
      return
    }
    if (productInherited && pid !== initialProductIdRef.current) {
      const ok = await confirm({
        title: '修改产品归属',
        message: '您修改了视频的产品归属，原则上不允许。是否继续？',
        confirmLabel: '继续保存',
        danger: true,
      })
      if (!ok) return
    }

    setSaving(true)
    setError('')
    try {
      const data: ResourceMetaSaveData = {
        product_id: pid === '' ? null : Number(pid),
        tags: selectedTags,
      }
      if (editableShotName) data.name = name.trim()
      await onSave(data)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="编辑属性"
      onClose={onClose}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      footer={
        <ModalFooter>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </ModalFooter>
      }
    >
      <div className="modal-form">
        <label className={`field${productInherited ? ' field-product-inherited' : ''}`}>
          <span className="label">所属产品</span>
          <select
            className={`input${productInherited ? ' input-inherited-product' : ''}`}
            value={pid}
            disabled={busy}
            onChange={(e) => setPid(e.target.value)}
          >
            <option value="">未指定</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {productInherited && (
            <span className="field-hint muted">继承自原片，原则上不可修改</span>
          )}
        </label>
        {editableShotName && (
          <label className="field">
            <span className="label">分镜名称</span>
            <input
              className="input"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              placeholder="分镜名称"
            />
          </label>
        )}
        <TagSelect value={selectedTags} onChange={setSelectedTags} disabled={busy} />
        {error && <p className="error modal-form-error">{error}</p>}
      </div>
      {ConfirmDialog}
    </Modal>
  )
}
