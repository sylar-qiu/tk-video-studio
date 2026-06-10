import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Category } from '../../api'
import { useConfirm } from '../../hooks/useConfirm'

interface FlatCategory {
  id: number
  name: string
  parent_id: number | null
  path: string
  depth: number
}

function flattenCategories(cats: Category[], depth = 0, parentPath = ''): FlatCategory[] {
  const result: FlatCategory[] = []
  for (const c of cats) {
    const path = parentPath ? `${parentPath} > ${c.name}` : c.name
    result.push({ id: c.id, name: c.name, parent_id: c.parent_id, path, depth })
    if (c.children.length) result.push(...flattenCategories(c.children, depth + 1, path))
  }
  return result
}

export default function CategoriesSettings() {
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const { confirm, ConfirmDialog } = useConfirm()

  const flat = useMemo(() => flattenCategories(categories), [categories])

  const load = useCallback(async () => {
    const cats = await api.listCategories()
    setCategories(cats)
  }, [])

  useEffect(() => {
    load().catch((e) => setError(String(e)))
  }, [load])

  const createCategory = async () => {
    if (!name.trim()) {
      setError('请输入类目名称')
      return
    }
    setCreating(true)
    setError('')
    try {
      await api.createCategory({
        name: name.trim(),
        parent_id: parentId ? Number(parentId) : null,
      })
      setName('')
      setParentId('')
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setCreating(false)
    }
  }

  const deleteCategory = async (id: number) => {
    const ok = await confirm({
      title: '删除类目',
      message: '确定删除该类目？',
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteCategory(id)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <>
      <section className="card settings-section">
        <h2>类目管理</h2>
        <p className="muted settings-section-desc">管理产品类目，支持多级层级。</p>
        <div className="category-create-form">
          <input
            className="input"
            placeholder="类目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="input"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">顶级类目</option>
            {flat.map((c) => (
              <option key={c.id} value={c.id}>
                {'\u00A0'.repeat(c.depth * 2)}
                {c.path}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={creating}
            onClick={createCategory}
          >
            {creating ? '添加中…' : '添加类目'}
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {flat.length === 0 ? (
          <div className="empty">暂无类目</div>
        ) : (
          <ul className="category-list">
            {flat.map((c) => (
              <li key={c.id} className="category-list-item" style={{ paddingLeft: 12 + c.depth * 20 }}>
                <span className="category-list-name">{c.name}</span>
                <span className="muted category-list-path">{c.path}</span>
                <button
                  type="button"
                  className="btn-link delete"
                  onClick={() => deleteCategory(c.id)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {ConfirmDialog}
    </>
  )
}
