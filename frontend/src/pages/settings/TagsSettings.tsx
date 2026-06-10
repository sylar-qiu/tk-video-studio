import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import StatLink from '../../components/StatLink'
import { resourceFilterUrl } from '../../utils/resourceNav'
import { api, type TagStats } from '../../api'

export default function TagsSettings() {
  const [tags, setTags] = useState<TagStats[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setTags(await api.listTagStats())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="card settings-section">
      <h2>标签管理</h2>
      <p className="muted settings-section-desc">
        汇总系统中所有标签，以及各标签关联的原片、分镜、导出、作品与产品数量。
      </p>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <div className="empty">加载中…</div>
      ) : tags.length === 0 ? (
        <div className="empty">暂无标签。上传素材或为资源添加标签后，将在此展示。</div>
      ) : (
        <div className="tags-stats-table">
          <table>
            <thead>
              <tr>
                <th>标签</th>
                <th>视频</th>
                <th>原片</th>
                <th>分镜</th>
                <th>导出</th>
                <th>作品</th>
                <th>产品</th>
                <th>合计</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((row) => (
                <tr key={row.name}>
                  <td>
                    <Link
                      to={resourceFilterUrl('shots', { tag: row.name })}
                      className="tag tag-link"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="tags-stats-total">{row.videos || '—'}</td>
                  <td>
                    <StatLink kind="assets" count={row.counts.assets} filter={{ tag: row.name }} />
                  </td>
                  <td>
                    <StatLink kind="shots" count={row.counts.shots} filter={{ tag: row.name }} />
                  </td>
                  <td>
                    <StatLink kind="exports" count={row.counts.exports} filter={{ tag: row.name }} />
                  </td>
                  <td>
                    <StatLink kind="works" count={row.counts.works} filter={{ tag: row.name }} />
                  </td>
                  <td>
                    <StatLink kind="products" count={row.counts.products} filter={{ tag: row.name }} />
                  </td>
                  <td className="tags-stats-total">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
