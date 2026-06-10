import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CreateProductModal from '../components/CreateProductModal'
import StatLink from '../components/StatLink'
import { useConfirm } from '../hooks/useConfirm'
import { useUrlResourceFilters } from '../hooks/useUrlResourceFilters'
import { resourceFilterUrl } from '../utils/resourceNav'
import { api, type Category, type Product } from '../api'

export default function ProductsPage() {
  const urlFilters = useUrlResourceFilters()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tagFilter, setTagFilter] = useState('')
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const { confirm, ConfirmDialog } = useConfirm()
  useEffect(() => {
    if (urlFilters.tag) setTagFilter(urlFilters.tag)
  }, [urlFilters.tag])

  const visibleProducts = useMemo(() => {
    if (!tagFilter) return products
    return products.filter((p) => p.tags.includes(tagFilter))
  }, [products, tagFilter])

  const totals = useMemo(
    () =>
      visibleProducts.reduce(
        (acc, p) => ({
          assets: acc.assets + p.stats.assets,
          shots: acc.shots + p.stats.shots,
          exports: acc.exports + p.stats.exports,
          works: acc.works + p.stats.works,
        }),
        { assets: 0, shots: 0, exports: 0, works: 0 },
      ),
    [visibleProducts],
  )

  const load = useCallback(async () => {
    const [ps, cats] = await Promise.all([api.listProducts(), api.listCategories()])
    setProducts(ps)
    setCategories(cats)
  }, [])

  useEffect(() => {
    load().catch((e) => setError(String(e)))
  }, [load])

  const handleCreate = async (data: { name: string; category_id: number | null }) => {
    setCreating(true)
    setError('')
    try {
      await api.createProduct(data)
      setCreateOpen(false)
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setCreating(false)
    }
  }

  const deleteProduct = async (id: number) => {
    const ok = await confirm({
      title: '删除产品',
      message: '确定删除该产品？需无关联资源。',
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteProduct(id)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="products-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">产品</h1>
          <p className="muted page-header-desc">
            共 {visibleProducts.length} 个产品
            {tagFilter && (
              <>
                {' '}
                · 标签「{tagFilter}」
                <Link to="/products" className="filter-clear-link">
                  清除
                </Link>
              </>
            )}
            {' '}
            · 原片 <StatLink kind="assets" count={totals.assets} filter={{ tag: tagFilter || undefined }} />
            {' '}
            · 分镜 <StatLink kind="shots" count={totals.shots} filter={{ tag: tagFilter || undefined }} />
            {' '}
            · 成品{' '}
            <StatLink kind="exports" count={totals.exports} filter={{ tag: tagFilter || undefined }} />
            {' '}
            · 作品 <StatLink kind="works" count={totals.works} filter={{ tag: tagFilter || undefined }} />
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          创建产品
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {visibleProducts.length === 0 ? (
        <div className="empty">
          {tagFilter ? `没有带标签「${tagFilter}」的产品` : '暂无产品，点击右上角「创建产品」开始。'}
        </div>
      ) : (
        <div className="products-table card">
          <table>
            <thead>
              <tr>
                <th>产品</th>
                <th>类目</th>
                <th>原片</th>
                <th>分镜</th>
                <th>成品</th>
                <th>作品</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.tags.length > 0 && (
                      <div className="product-row-tags">
                        {p.tags.map((t) => (
                          <Link
                            key={t}
                            to={resourceFilterUrl('shots', { productId: p.id, tag: t })}
                            className="tag tag-link"
                          >
                            {t}
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="muted">{p.category_path ?? '—'}</td>
                  <td>
                    <StatLink kind="assets" count={p.stats.assets} filter={{ productId: p.id }} />
                  </td>
                  <td>
                    <StatLink kind="shots" count={p.stats.shots} filter={{ productId: p.id }} />
                  </td>
                  <td>
                    <StatLink kind="exports" count={p.stats.exports} filter={{ productId: p.id }} />
                  </td>
                  <td>
                    <StatLink kind="works" count={p.stats.works} filter={{ productId: p.id }} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-link delete"
                      onClick={() => deleteProduct(p.id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateProductModal
        open={createOpen}
        categories={categories}
        submitting={creating}
        onClose={() => !creating && setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      {ConfirmDialog}
    </div>
  )
}
