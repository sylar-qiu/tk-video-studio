import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import VideoPreview from '../components/VideoPreview'
import { useConfirm } from '../hooks/useConfirm'
import { useUrlResourceFilters } from '../hooks/useUrlResourceFilters'
import { thumbImageClass } from '../utils/thumb'
import { api, type ExportJob, type Product } from '../api'

export default function ExportsPage() {
  const urlFilters = useUrlResourceFilters()
  const [exports, setExports] = useState<ExportJob[]>([])
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

  const load = useCallback(async () => {
    const productId = productFilter ? Number(productFilter) : undefined
    const [items, productList] = await Promise.all([
      api.listExports({
        productId: Number.isFinite(productId) ? productId : undefined,
        tag: tagFilter || undefined,
      }),
      api.listProducts(),
    ])
    setExports(items)
    setProducts(productList)
  }, [productFilter, tagFilter])

  useEffect(() => {
    load().catch((e) => setError(String(e)))
  }, [load])

  const deleteExport = async (id: number) => {
    const ok = await confirm({
      title: '删除成品',
      message: '确定删除这个成品？',
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteExport(id)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  const hasFilter = !!(productFilter || tagFilter)

  return (
    <div className="exports-page">
      <h1 className="page-title">成品</h1>
      <p className="muted">
        脚本导出的成片。
        {hasFilter && (
          <>
            {' '}
            当前筛选：
            {productName && <span> 产品「{productName}」</span>}
            {tagFilter && <span> 标签「{tagFilter}」</span>}
            <Link to="/exports" className="filter-clear-link">
              清除
            </Link>
          </>
        )}
      </p>

      {error && <p className="error">{error}</p>}

      {exports.length === 0 ? (
        <div className="empty">
          {hasFilter ? '没有符合筛选条件的成品' : '暂无成品。在脚本编辑页导出后会出现在这里。'}
        </div>
      ) : (
        <div className="export-grid">
          {exports.map((job) => (
            <div key={job.id} className="export-icon-wrap">
              <VideoPreview
                videoUrl={job.stream_url}
                thumbUrl={job.thumb_url}
                downloadUrl={job.download_url}
                title={job.name}
                className="video-thumb-btn"
                imageClassName={thumbImageClass(job.thumb_url)}
                disabled={!job.stream_url}
                onDelete={() => void deleteExport(job.id)}
                resourceMeta={{
                  productId: job.product_id,
                  productName: job.product_name,
                  tags: job.tags,
                  onSave: async (data) => {
                    await api.updateExport(job.id, data)
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
