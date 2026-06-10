import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import VideoPreview from '../components/VideoPreview'
import { useConfirm } from '../hooks/useConfirm'
import { useUrlResourceFilters } from '../hooks/useUrlResourceFilters'
import { thumbImageClass } from '../utils/thumb'
import { api, type Product, type Work } from '../api'

export default function WorksPage() {
  const urlFilters = useUrlResourceFilters()
  const [works, setWorks] = useState<Work[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productFilter, setProductFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [error, setError] = useState('')
  const { confirm, ConfirmDialog } = useConfirm()

  useEffect(() => {
    if (urlFilters.product) setProductFilter(urlFilters.product)
    if (urlFilters.tag) setTagFilter(urlFilters.tag)
  }, [urlFilters.product, urlFilters.tag])

  const productName = useMemo(() => {
    if (!productFilter) return null
    return products.find((p) => String(p.id) === productFilter)?.name ?? null
  }, [productFilter, products])

  const totalWorks = useMemo(
    () => products.reduce((sum, p) => sum + p.stats.works, 0),
    [products],
  )

  const publishedWorks = useMemo(
    () => works.filter((w) => w.status === 'approved' || w.status === 'pending'),
    [works],
  )

  const load = useCallback(async () => {
    const productId = productFilter ? Number(productFilter) : undefined
    const [w, productList] = await Promise.all([
      api.listWorks({
        productId: Number.isFinite(productId) ? productId : undefined,
        tag: tagFilter || undefined,
      }),
      api.listProducts(),
    ])
    setWorks(w)
    setProducts(productList)
    return w
  }, [productFilter, tagFilter])

  useEffect(() => {
    load().catch((e) => setError(String(e)))
    const timer = window.setInterval(() => {
      load().catch(() => {})
    }, 5000)
    return () => window.clearInterval(timer)
  }, [load])

  const deleteWork = async (id: number) => {
    const ok = await confirm({
      title: '删除作品',
      message: '确定删除这条作品记录？（不会删除原成品文件）',
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteWork(id)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="works-page">
      <h1 className="page-title">作品</h1>
      {(productFilter || tagFilter) && (
        <p className="muted">
          当前筛选：
          {productName && <span> 产品「{productName}」</span>}
          {tagFilter && <span> 标签「{tagFilter}」</span>}
          <Link to="/works" className="filter-clear-link">
            清除
          </Link>
        </p>
      )}

      <div className="shots-library-filters card">
        <label className="shots-library-filter">
          <select
            className="input"
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          >
            <option value="">全部产品 ({totalWorks})</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.stats.works})
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {publishedWorks.length === 0 ? (
        <div className="empty">
          {productFilter || tagFilter
            ? '没有符合筛选条件的作品'
            : '暂无作品。在「拼接导出」中编辑脚本、导出成片后，点击「发布」即可。'}
        </div>
      ) : (
        <div className="export-grid">
          {publishedWorks.map((work) => (
            <div key={work.id} className="export-icon-wrap">
              <VideoPreview
                videoUrl={work.stream_url}
                thumbUrl={work.thumb_url}
                downloadUrl={work.download_url}
                className="video-thumb-btn"
                imageClassName={thumbImageClass(work.thumb_url)}
                disabled={!work.stream_url}
                onDelete={() => void deleteWork(work.id)}
                resourceMeta={{
                  productId: work.product_id,
                  productName: work.product_name,
                  tags: work.tags,
                  onSave: async (data) => {
                    await api.updateWork(work.id, data)
                    await load()
                  },
                }}
              />
            </div>
          ))}
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}
