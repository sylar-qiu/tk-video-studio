import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import StatLink from '../../components/StatLink'
import { resourceFilterUrl } from '../../utils/resourceNav'
import { api, type Product, type TagStats } from '../../api'

export default function TagsSettings() {
  const [products, setProducts] = useState<Product[]>([])
  const [productFilter, setProductFilter] = useState('')
  const [tags, setTags] = useState<TagStats[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.listProducts().then(setProducts).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const productId = productFilter ? Number(productFilter) : undefined
      setTags(await api.listTagStats({ productId }))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [productFilter])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="card settings-section">
      <h2>标签管理</h2>
      <p className="muted settings-section-desc">
        按产品查看标签，以及各标签关联的原片、分镜、导出、作品数量。
      </p>

      <label className="field tags-settings-filter">
        <span className="label">产品筛选</span>
        <select
          className="input"
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
        >
          <option value="">全部产品</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <div className="empty">加载中…</div>
      ) : tags.length === 0 ? (
        <div className="empty">
          {productFilter
            ? '该产品下暂无标签。上传素材或为资源添加标签后，将在此展示。'
            : '暂无标签。上传素材或为资源添加标签后，将在此展示。'}
        </div>
      ) : (
        <div className="tags-stats-table">
          <table>
            <thead>
              <tr>
                <th>标签</th>
                <th>产品</th>
                <th>视频</th>
                <th>原片</th>
                <th>分镜</th>
                <th>导出</th>
                <th>作品</th>
                <th>合计</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((row) => {
                const rowFilter = { productId: row.product_id, tag: row.name }
                return (
                  <tr key={`${row.product_id}:${row.name}`}>
                    <td>
                      <Link
                        to={resourceFilterUrl('shots', rowFilter)}
                        className="tag tag-link"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td>{row.product_name ?? '—'}</td>
                    <td className="tags-stats-total">{row.videos || '—'}</td>
                    <td>
                      <StatLink kind="assets" count={row.counts.assets} filter={rowFilter} />
                    </td>
                    <td>
                      <StatLink kind="shots" count={row.counts.shots} filter={rowFilter} />
                    </td>
                    <td>
                      <StatLink kind="exports" count={row.counts.exports} filter={rowFilter} />
                    </td>
                    <td>
                      <StatLink kind="works" count={row.counts.works} filter={rowFilter} />
                    </td>
                    <td className="tags-stats-total">{row.total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
