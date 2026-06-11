import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category } from '../api'
import {
  flattenCategories,
  visibleInSearch,
  visibleInTree,
} from '../utils/categories'
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
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [showTree, setShowTree] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const flat = useMemo(() => flattenCategories(categories), [categories])
  const selected = categoryId ? flat.find((c) => c.id === categoryId) : null

  useEffect(() => {
    if (!open) return
    setName('')
    setCategoryId(null)
    setError('')
    setCollapsed(new Set())
    setShowTree(false)
    setSearch('')
  }, [open])

  useEffect(() => {
    if (showTree) setTimeout(() => searchRef.current?.focus(), 80)
  }, [showTree])

  useEffect(() => {
    if (!showTree) return
    const onMouseDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowTree(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [showTree])

  const visible = useMemo(() => {
    const q = search.trim()
    return q ? visibleInSearch(flat, q) : visibleInTree(flat, collapsed)
  }, [flat, collapsed, search])

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('请输入产品名称')
      return
    }
    setError('')
    onSubmit({ name: trimmed, category_id: categoryId })
  }

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const closeTree = () => {
    setShowTree(false)
    setSearch('')
  }

  const selectCat = (id: number) => {
    setCategoryId(id)
    closeTree()
  }

  const clearCat = () => {
    setCategoryId(null)
    closeTree()
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
          <div className="category-picker" ref={pickerRef}>
            <button
              type="button"
              className={`input category-picker-trigger ${selected ? '' : 'placeholder'}`}
              onClick={() => setShowTree(!showTree)}
              disabled={submitting}
            >
              {selected ? (
                <span className="category-picker-selected" title={selected.path}>
                  <span className="category-picker-dots">{'　'.repeat(selected.depth)}</span>
                  {selected.path}
                </span>
              ) : (
                <span className="muted">搜索或选择类目（可选）</span>
              )}
              <span className="category-picker-arrow">{showTree ? '▲' : '▼'}</span>
            </button>

            {showTree && (
              <div className="category-picker-dropdown">
                <div className="category-picker-search">
                  <input
                    ref={searchRef}
                    className="input"
                    placeholder="搜索类目名称…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') closeTree()
                    }}
                  />
                </div>

                <button
                  type="button"
                  className={`category-picker-item ${categoryId === null ? 'is-selected' : ''}`}
                  onClick={clearCat}
                >
                  <em className="muted">不选择类目</em>
                </button>

                {visible.length === 0 ? (
                  <div className="category-picker-empty muted">无匹配类目</div>
                ) : (
                  visible.map((c) => (
                    <div
                      key={c.id}
                      className={`category-picker-item ${c.id === categoryId ? 'is-selected' : ''}`}
                      style={{ paddingLeft: 12 + c.depth * 20 }}
                    >
                      {!search.trim() && (
                        <span
                          className={`category-picker-toggle ${c.child_count ? '' : 'invisible'}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggle(c.id)
                          }}
                        >
                          {c.child_count ? (collapsed.has(c.id) ? '▶' : '▼') : '　'}
                        </span>
                      )}
                      {search.trim() && <span className="category-picker-toggle invisible">　</span>}
                      <span className="category-picker-label" onClick={() => selectCat(c.id)}>
                        {search.trim() ? highlightMatch(c.name, search.trim()) : c.name}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </label>

        {error && <p className="error modal-form-error">{error}</p>}
      </div>
    </Modal>
  )
}

function highlightMatch(text: string, query: string) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}
