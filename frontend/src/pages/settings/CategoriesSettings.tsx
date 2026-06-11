import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type Category, type Product } from '../../api'
import { useConfirm } from '../../hooks/useConfirm'
import Modal from '../../components/Modal'
import ModalFooter from '../../components/ModalFooter'
import {
  countDescendants,
  collectSubtreeIds,
  flattenCategories,
  idsForDeletionOrder,
  visibleInTree,
  type FlatCategory,
} from '../../utils/categories'

export default function CategoriesSettings() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [pageError, setPageError] = useState('')
  const [modalError, setModalError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const { confirm, ConfirmDialog } = useConfirm()

  const [showModal, setShowModal] = useState(false)
  const [modalParentId, setModalParentId] = useState('')
  const [catName, setCatName] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const flat = useMemo(() => flattenCategories(categories), [categories])

  useEffect(() => setCollapsed(new Set()), [categories])

  const load = useCallback(async () => {
    try {
      const [cats, prods] = await Promise.all([api.listCategories(), api.listProducts()])
      setCategories(cats)
      setProducts(prods)
      setPageError('')
    } catch (e) {
      setPageError(String(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const parentItem = modalParentId ? flat.find((c) => c.id === Number(modalParentId)) : null

  const openAdd = (parentId: string) => {
    setModalParentId(parentId)
    setCatName('')
    setModalError('')
    setShowModal(true)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const closeModal = () => {
    setShowModal(false)
    setModalError('')
  }

  const createCategory = async () => {
    if (!catName.trim()) {
      setModalError('请输入类目名称')
      return
    }
    setCreating(true)
    setModalError('')
    try {
      await api.createCategory({
        name: catName.trim(),
        parent_id: modalParentId ? Number(modalParentId) : null,
      })
      closeModal()
      setModalParentId('')
      setCatName('')
      await load()
    } catch (e) {
      setModalError(String(e))
    } finally {
      setCreating(false)
    }
  }

  const productsInSubtree = (rootId: number) => {
    const subtreeIds = new Set(collectSubtreeIds(flat, rootId))
    return products.filter((p) => p.category_id != null && subtreeIds.has(p.category_id))
  }

  const deleteCategory = async (item: FlatCategory) => {
    const blocked = productsInSubtree(item.id)
    if (blocked.length > 0) {
      const preview = [...new Set(blocked.map((p) => p.name))].slice(0, 3).join('、')
      const suffix =
        blocked.length > 3 ? ` 等 ${blocked.length} 个产品` : `（${blocked.length} 个产品）`
      setPageError(`无法删除「${item.name}」：子树内仍有产品 ${preview}${suffix}，请先移走或更改类目。`)
      return
    }

    const descCount = countDescendants(flat, item.id)
    const childInfo = descCount > 0 ? `（含 ${descCount} 个子类目）` : ''
    const ok = await confirm({
      title: '删除类目',
      message: `确定删除「${item.name}」？${childInfo}\n子类目也会被一并删除。`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return

    setPageError('')
    try {
      for (const id of idsForDeletionOrder(flat, item.id)) {
        await api.deleteCategory(id)
      }
      await load()
    } catch (e) {
      setPageError(String(e))
      await load()
    }
  }

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const expandAll = () => setCollapsed(new Set())
  const collapseAll = () =>
    setCollapsed(new Set(flat.filter((f) => f.child_count > 0).map((f) => f.id)))

  const visible = useMemo(() => visibleInTree(flat, collapsed), [flat, collapsed])

  return (
    <section className="card settings-section">
      <div className="settings-section-header">
        <div className="settings-section-header-row">
          <div>
            <h2>类目管理</h2>
            <p className="muted settings-section-desc">
              共 {flat.length} 个类目，支持任意层级嵌套。
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openAdd('')}>
            ＋ 添加顶级类目
          </button>
        </div>
      </div>

      {pageError && <p className="error">{pageError}</p>}

      <div className="category-tree-toolbar">
        <span className="muted">
          {visible.length} / {flat.length} 可见
        </span>
        <button type="button" className="btn-link btn-xs" onClick={expandAll}>
          展开全部
        </button>
        <button type="button" className="btn-link btn-xs" onClick={collapseAll}>
          收起全部
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="empty">暂无类目</div>
      ) : (
        <ul className="category-tree">
          {visible.map((item) => (
            <li
              key={item.id}
              className="category-tree-item"
              style={{ '--depth': item.depth } as React.CSSProperties}
            >
              <span
                className={`category-tree-toggle ${item.child_count ? '' : 'invisible'}`}
                onClick={() => toggle(item.id)}
              >
                {item.child_count ? (collapsed.has(item.id) ? '▶' : '▼') : '　'}
              </span>

              <span className="category-tree-name" title={item.path}>
                {item.name}
              </span>

              {item.child_count > 0 && (
                <span className="category-tree-badge">{item.child_count}</span>
              )}

              <button
                type="button"
                className="btn-link category-tree-addchild"
                onClick={() => openAdd(String(item.id))}
                title="在此类目下添加子类目"
              >
                ＋
              </button>

              <button
                type="button"
                className="btn-link delete category-tree-delete"
                onClick={() => deleteCategory(item)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}

      {ConfirmDialog}

      <Modal
        open={showModal}
        title={parentItem ? `添加到「${parentItem.name}」` : '添加顶级类目'}
        onClose={closeModal}
        size="default"
        footer={
          <ModalFooter>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeModal}
              disabled={creating}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={creating || !catName.trim()}
              onClick={createCategory}
            >
              {creating ? '添加中…' : '确认添加'}
            </button>
          </ModalFooter>
        }
      >
        <div className="modal-form">
          {parentItem && (
            <p className="muted category-modal-path">路径：{parentItem.path}</p>
          )}
          <label className="field">
            <span className="label">类目名称</span>
            <input
              ref={inputRef}
              className="input"
              placeholder="如 Outdoors（户外）"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !creating && createCategory()}
              disabled={creating}
              autoFocus
            />
          </label>
          {modalError && <p className="error modal-form-error">{modalError}</p>}
        </div>
      </Modal>
    </section>
  )
}
