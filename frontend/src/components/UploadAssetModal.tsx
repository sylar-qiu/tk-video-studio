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
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setError('')
    setDragOver(false)
    setSelectedTags([])
    setProductId('')
    setPendingFiles([])
    if (inputRef.current) inputRef.current.value = ''
  }, [open])

  const addFiles = (files: FileList | null) => {
    if (!files?.length || submitting) return
    const next = Array.from(files).filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name))
    if (!next.length) {
      setError('请选择视频文件')
      return
    }
    setError('')
    setPendingFiles((prev) => {
      const names = new Set(prev.map((f) => `${f.name}:${f.size}`))
      const merged = [...prev]
      for (const file of next) {
        const key = `${file.name}:${file.size}`
        if (!names.has(key)) {
          names.add(key)
          merged.push(file)
        }
      }
      return merged
    })
  }

  const handleSubmit = async () => {
    if (!pendingFiles.length) {
      setError('请先选择要上传的视频')
      return
    }
    if (!productId) {
      setError('请选择所属产品')
      return
    }
    setError('')
    const dt = new DataTransfer()
    pendingFiles.forEach((f) => dt.items.add(f))
    try {
      await onUpload(dt.files, Number(productId), selectedTags)
      setPendingFiles([])
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      setError(String(e))
    }
  }

  const canSubmit = pendingFiles.length > 0 && !!productId && !submitting

  return (
    <Modal
      open={open}
      title="上传素材"
      onClose={onClose}
      size="large"
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      footer={
        <ModalFooter align="start">
          <button
            type="button"
            className="btn btn-primary upload-modal-submit"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? '上传中…' : '上传素材'}
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
            addFiles(e.dataTransfer.files)
          }}
          onClick={() => !submitting && inputRef.current?.click()}
        >
          <p className="upload-modal-zone-title">
            {submitting
              ? '上传中…'
              : pendingFiles.length
                ? `已选择 ${pendingFiles.length} 个视频`
                : '点击或拖拽视频到此处'}
          </p>
          <p className="muted">支持 mp4 / mov 等常见格式，上传后自动生成 9:16 缩略图</p>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
            hidden
            disabled={submitting}
            onChange={(e) => {
              addFiles(e.target.files)
              if (inputRef.current) inputRef.current.value = ''
            }}
          />
        </div>

        {pendingFiles.length > 0 && (
          <ul className="upload-modal-files">
            {pendingFiles.map((file, index) => (
              <li key={`${file.name}-${file.size}-${index}`}>{file.name}</li>
            ))}
          </ul>
        )}

        <label className="field upload-modal-product">
          <span className="label">所属产品</span>
          <select
            className="input"
            value={productId}
            disabled={submitting}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">请选择产品</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {products.length === 0 && (
            <p className="muted upload-modal-hint">暂无产品，请先在「产品」页创建</p>
          )}
        </label>

        <TagSelect value={selectedTags} onChange={setSelectedTags} disabled={submitting} />

        {error && <p className="error upload-modal-error">{error}</p>}
      </div>
    </Modal>
  )
}
