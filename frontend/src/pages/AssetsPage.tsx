import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import VideoPreview from '../components/VideoPreview'
import AssetCardMeta from '../components/AssetCardMeta'
import ShotCardMeta from '../components/ShotCardMeta'
import UploadAssetModal from '../components/UploadAssetModal'
import { thumbImageClass } from '../utils/thumb'
import { useConfirm } from '../hooks/useConfirm'
import { useUrlResourceFilters } from '../hooks/useUrlResourceFilters'
import { api, type Asset, type Product, type Shot } from '../api'

export default function AssetsPage() {
  const urlFilters = useUrlResourceFilters()
  const [assets, setAssets] = useState<Asset[]>([])
  const [shotsByAsset, setShotsByAsset] = useState<Map<number, Shot[]>>(new Map())
  const [products, setProducts] = useState<Product[]>([])
  const [productFilter, setProductFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const { confirm, ConfirmDialog } = useConfirm()

  useEffect(() => {
    if (urlFilters.product) setProductFilter(urlFilters.product)
    if (urlFilters.tag) setTagFilter(urlFilters.tag)
  }, [urlFilters.product, urlFilters.tag])

  const load = useCallback(async () => {
    const productId = productFilter ? Number(productFilter) : undefined
    const [assetList, productList] = await Promise.all([
      api.listAssets({
        productId: Number.isFinite(productId) ? productId : undefined,
        tag: tagFilter || undefined,
      }),
      api.listProducts(),
    ])
    const sorted = [...assetList].sort((a, b) => b.id - a.id)
    const shotLists = await Promise.all(
      sorted.map((asset) => api.listShots({ assetId: asset.id })),
    )
    const map = new Map<number, Shot[]>()
    sorted.forEach((asset, i) => {
      map.set(asset.id, shotLists[i])
    })
    setAssets(sorted)
    setShotsByAsset(map)
    setProducts(productList)
  }, [productFilter, tagFilter])

  useEffect(() => {
    load().catch((e) => setError(String(e)))
    const timer = window.setInterval(() => {
      load().catch(() => {})
    }, 4000)
    return () => window.clearInterval(timer)
  }, [load])

  const onUpload = async (files: FileList, productId: number, tags: string[]) => {
    setUploading(true)
    setError('')
    try {
      for (const file of Array.from(files)) {
        await api.uploadAsset(file, productId, tags)
      }
      await load()
      setUploadOpen(false)
    } catch (e) {
      setError(String(e))
      throw e
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAsset = async (id: number) => {
    const ok = await confirm({
      title: '删除原片',
      message: '确定删除这个原片及其所有分镜？',
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteAsset(id)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  const handleDeleteShot = async (id: number) => {
    const ok = await confirm({
      title: '删除片段',
      message: '确定删除这个拆解片段？',
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteShot(id)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  const showList = products.length > 0 || assets.length > 0 || productFilter !== '' || tagFilter !== ''

  const productName = useMemo(() => {
    if (!productFilter) return null
    return products.find((p) => String(p.id) === productFilter)?.name ?? null
  }, [productFilter, products])

  const totalAssetCount = useMemo(
    () => products.reduce((sum, p) => sum + p.stats.assets, 0),
    [products],
  )

  return (
    <div className="assets-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">素材列表</h1>
          <p className="muted page-header-desc">
            上传原片后拆解分镜并打标签，切好的片段会进入「素材库」。
            {(productFilter || tagFilter) && (
              <>
                {' '}
                当前筛选：
                {productName && <span> 产品「{productName}」</span>}
                {tagFilter && <span> 标签「{tagFilter}」</span>}
                <Link to="/" className="filter-clear-link">
                  清除
                </Link>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setUploadOpen(true)}
        >
          上传素材
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {!showList ? (
        <div className="empty">暂无原片，点击右上角「上传素材」开始。</div>
      ) : (
        <section className="source-split-section">
          <div className="source-split-layout card">
            <div className="source-split-table-head">
              <span className="source-split-table-title">原片列表</span>
              <label className="source-split-table-filter">
                <select
                  className="input source-split-filter-select"
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                >
                  <option value="">全部产品 ({totalAssetCount})</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.stats.assets})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {assets.length === 0 ? (
              <div className="source-split-empty">
                {productFilter || tagFilter
                  ? '没有符合筛选条件的原片'
                  : productFilter
                    ? '该产品下暂无原片'
                    : '暂无原片，点击右上角「上传素材」开始'}
              </div>
            ) : (
              assets.map((asset) => {
              const assetShots = shotsByAsset.get(asset.id) ?? []
              return (
                <div key={asset.id} className="source-split-row">
                  <div className="source-split-left">
                    <div className="source-asset-card">
                      <VideoPreview
                        videoUrl={api.getAssetStream(asset.id)}
                        thumbUrl={asset.thumb_url}
                        durationMs={asset.duration_ms}
                        className="video-thumb-btn"
                        imageClassName={thumbImageClass(asset.thumb_url)}
                        onDelete={() => void handleDeleteAsset(asset.id)}
                        hideCardMeta
                        modalFooter={
                          <Link className="btn btn-primary" to={`/clip/${asset.id}`}>
                            拆解分镜
                          </Link>
                        }
                        resourceMeta={{
                          productId: asset.product_id,
                          productName: asset.product_name,
                          tags: asset.tags,
                          onSave: async (data) => {
                            await api.updateAsset(asset.id, data)
                            await load()
                          },
                        }}
                      />
                      <AssetCardMeta
                        productName={asset.product_name}
                        tags={asset.tags}
                        createdAt={asset.created_at}
                      />
                    </div>
                  </div>

                  <div className="source-split-right">
                    {assetShots.length === 0 ? (
                      <div className="source-shots-empty">暂无拆解片段，点击原片播放后在下方「拆解分镜」开始</div>
                    ) : (
                      <div className="source-shots-grid">
                        {assetShots.map((shot) => (
                          <div key={shot.id} className="source-shot-card">
                            <VideoPreview
                              videoUrl={shot.clip_url}
                              thumbUrl={shot.thumb_url}
                              durationMs={shot.duration_ms}
                              className="video-thumb-btn"
                              imageClassName={thumbImageClass(shot.thumb_url)}
                              disabled={shot.status !== 'ready'}
                              onDelete={() => void handleDeleteShot(shot.id)}
                              hideCardMeta
                              resourceMeta={{
                                productId: shot.product_id,
                                productName: shot.product_name,
                                shotName: shot.name,
                                tags: shot.tags,
                                editableShotName: true,
                                onSave: async (data) => {
                                  await api.updateShot(shot.id, data)
                                  await load()
                                },
                              }}
                            >
                              {shot.status !== 'ready' && (
                                <span className={`source-shot-badge status ${shot.status}`}>
                                  {shot.status === 'processing'
                                    ? '提取中'
                                    : shot.status === 'pending'
                                      ? '排队中'
                                      : shot.status}
                                </span>
                              )}
                            </VideoPreview>
                            <ShotCardMeta
                              productName={shot.product_name}
                              tags={shot.tags}
                              shotName={shot.name}
                              createdAt={shot.created_at}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
              })
            )}
          </div>
        </section>
      )}

      <UploadAssetModal
        open={uploadOpen}
        products={products}
        submitting={uploading}
        onClose={() => !uploading && setUploadOpen(false)}
        onUpload={onUpload}
      />
      {ConfirmDialog}
    </div>
  )
}
