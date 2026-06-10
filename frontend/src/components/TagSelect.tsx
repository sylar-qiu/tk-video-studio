import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import CreateTagModal from './CreateTagModal'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  disabled?: boolean
  label?: string
  required?: boolean
}

export default function TagSelect({
  value,
  onChange,
  disabled = false,
  label = '标签',
  required = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [library, setLibrary] = useState<string[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const loadTags = useCallback(() => {
    api.listTags().then((rows) => setLibrary(rows.map((t) => t.name))).catch(() => {})
  }, [])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  useEffect(() => {
    if (!open) return
    loadTags()
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, loadTags])

  const available = library.filter((tag) => !value.includes(tag))

  const addTag = (tag: string) => {
    if (!value.includes(tag)) onChange([...value, tag])
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  const handleCreated = (tag: string) => {
    loadTags()
    if (!value.includes(tag)) onChange([...value, tag])
  }

  const toggleOpen = () => {
    if (!disabled) setOpen((prev) => !prev)
  }

  const labelSuffix = required ? '（必填）' : '（可选）'

  return (
    <div className="field tag-select-field" ref={rootRef}>
      <span className="label">
        {label}
        {labelSuffix}
      </span>
      <div className="tag-select-control">
        <div
          className={`tag-select-input input${open ? ' tag-select-input--open' : ''}${disabled ? ' tag-select-input--disabled' : ''}`}
        >
          {value.map((tag) => (
            <span key={tag} className="tag-select-chip">
              <span className="tag-select-chip-label">{tag}</span>
              {!disabled && (
                <span
                  role="button"
                  tabIndex={0}
                  className="tag-select-chip-remove"
                  aria-label={`移除 ${tag}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTag(tag)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      removeTag(tag)
                    }
                  }}
                >
                  ×
                </span>
              )}
            </span>
          ))}
          {value.length === 0 && (
            <button
              type="button"
              className="tag-select-placeholder"
              disabled={disabled}
              onClick={toggleOpen}
            >
              选择标签…
            </button>
          )}
        </div>
        <button
          type="button"
          className="tag-select-toggle"
          disabled={disabled}
          aria-label={open ? '收起标签列表' : '展开标签列表'}
          aria-expanded={open}
          onClick={toggleOpen}
        >
          {open ? '▴' : '▾'}
        </button>
        {open && !disabled && (
          <div className="tag-select-menu" role="listbox">
            <button
              type="button"
              className="tag-select-menu-create"
              onClick={() => {
                setOpen(false)
                setCreateOpen(true)
              }}
            >
              + 创建标签
            </button>
            {available.length === 0 ? (
              <div className="tag-select-menu-empty muted">暂无可选标签</div>
            ) : (
              available.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="tag-select-menu-item"
                  role="option"
                  onClick={() => addTag(tag)}
                >
                  {tag}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <CreateTagModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}
