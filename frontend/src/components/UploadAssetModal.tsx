import { useEffect, useRef, useState } from 'react'
import type { Product } from '../api'
import Modal from './Modal'
import ModalFooter from './ModalFooter'
import TagSelect from './TagSelect'

interface UploadAssetModalProps {
  open: boolean
  products: Product[]
  submitting: boolean
  onClose: () => void
  onUpload: (files: FileList, productId: number, tags: string[]) => Promise<void>
}

export default function UploadAssetModal({
  open,
  products,
  submitting,
  onClose,
  onUpload,
}: UploadAssetModalProps) {
  const [productId, setProductId] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setError('')
    setDragOver(false)
    setSelectedTags([])
    setProductId((prev) => prev || (products.length ? String(products[0].id) : ''))
  }, [open, products])

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    if (!productId) {
      setError('请选择所属产品')
      return
    }
    setError('')
    try {
      await onUpload(files, Number(productId), selectedTags)
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <Modal
      open={open}
      title="上传素材"
      onClose={onClose}
      size="large"
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      footer={
        <ModalFooter>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            关闭
          </button>
        </ModalFooter>
      }
    >
      <div className="upload-modal">
        <div
          className={`upload-zone upload-modal-zone${dragOver ? ' upload-zone--active' : ''}${submitting ? ' upload-zone-disabled' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            if (!submitting) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (!submitting) handleFiles(e.dataTransfer.files)
          }}
          onClick={() => !submitting && inputRef.current?.click()}
        >
          <p className="upload-modal-zone-title">
            {submitting ? '上传中…' : '点击或拖拽视频到此处上传'}
          </p>
          <p className="muted">支持 mp4 / mov 等常见格式，上传后自动生成 9:16 缩略图</p>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
            hidden
            disabled={submitting}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <label className="field upload-modal-product">
          <span className="label">所属产品</span>
          <select
            className="input"
            value={productId}
            disabled={submitting}
            onChange={(e) => setProductId(e.target.value)}
          >
            {products.length === 0 ? (
              <option value="">暂无产品，请先在「产品」页创建</option>
            ) : (
              products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))
            )}
          </select>
        </label>

        <TagSelect
          value={selectedTags}
          onChange={setSelectedTags}
          disabled={submitting}
        />

        {error && <p className="error upload-modal-error">{error}</p>}
      </div>
    </Modal>
  )
}
