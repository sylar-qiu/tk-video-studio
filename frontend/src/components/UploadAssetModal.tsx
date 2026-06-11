import { useEffect, useRef, useState } from 'react'
import type { Product } from '../api'
import { formatDuration } from '../api'
import Modal from './Modal'
import ModalFooter from './ModalFooter'
import TagSelect from './TagSelect'
import { captureVideoThumbnail } from '../utils/videoThumb'

interface UploadAssetModalProps {
  open: boolean
  products: Product[]
  submitting: boolean
  onClose: () => void
  onUpload: (files: FileList, productId: number, tags: string[]) => Promise<void>
}

interface PendingItem {
  key: string
  file: File
  thumbUrl: string | null
  durationMs: number | null
  status: 'loading' | 'ready' | 'error'
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}`
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
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const thumbGenRef = useRef(0)

  useEffect(() => {
    if (!open) return
    thumbGenRef.current += 1
    setError('')
    setDragOver(false)
    setSelectedTags([])
    setProductId('')
    setPendingItems([])
    if (inputRef.current) inputRef.current.value = ''
  }, [open])

  const generateThumb = async (file: File, key: string, generation: number) => {
    try {
      const { thumbUrl, durationMs } = await captureVideoThumbnail(file)
      if (generation !== thumbGenRef.current) return
      setPendingItems((prev) =>
        prev.map((item) =>
          item.key === key ? { ...item, thumbUrl, durationMs, status: 'ready' } : item,
        ),
      )
    } catch {
      if (generation !== thumbGenRef.current) return
      setPendingItems((prev) =>
        prev.map((item) => (item.key === key ? { ...item, status: 'error' } : item)),
      )
    }
  }

  const addFiles = (files: FileList | null) => {
    if (!files?.length || submitting) return
    const next = Array.from(files).filter(
      (f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name),
    )
    if (!next.length) {
      setError('请选择视频文件')
      return
    }
    setError('')
    const generation = thumbGenRef.current
    setPendingItems((prev) => {
      const existing = new Set(prev.map((item) => item.key))
      const added: PendingItem[] = []
      for (const file of next) {
        const key = fileKey(file)
        if (existing.has(key)) continue
        existing.add(key)
        added.push({ key, file, thumbUrl: null, durationMs: null, status: 'loading' })
      }
      for (const item of added) {
        void generateThumb(item.file, item.key, generation)
      }
      return added.length ? [...prev, ...added] : prev
    })
  }

  const pendingFiles = pendingItems.map((item) => item.file)

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
      thumbGenRef.current += 1
      setPendingItems([])
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
              : pendingItems.length
                ? `已选择 ${pendingItems.length} 个视频`
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

        {pendingItems.length > 0 && (
          <div className="upload-modal-previews">
            {pendingItems.map((item) => (
              <div key={item.key} className="upload-modal-preview-card">
                <div className="upload-modal-preview-thumb">
                  {item.thumbUrl ? (
                    <img src={item.thumbUrl} alt="" className="video-thumb" />
                  ) : (
                    <div
                      className={`video-preview-placeholder video-thumb${item.status === 'error' ? ' video-thumb-empty' : ''}`}
                    />
                  )}
                  {item.durationMs != null && item.durationMs > 0 && (
                    <span className="video-preview-duration">{formatDuration(item.durationMs)}</span>
                  )}
                  {item.status === 'loading' && !item.thumbUrl && (
                    <span className="upload-modal-preview-loading">生成预览…</span>
                  )}
                </div>
                <p className="upload-modal-preview-name" title={item.file.name}>
                  {item.file.name}
                </p>
              </div>
            ))}
          </div>
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
