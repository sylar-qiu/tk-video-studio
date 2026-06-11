import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import VideoPreview from '../components/VideoPreview'
import ShotCardMeta from '../components/ShotCardMeta'
import TagSelect from '../components/TagSelect'
import ResourceMetaBreadcrumb from '../components/ResourceMetaBreadcrumb'
import { useConfirm } from '../hooks/useConfirm'
import { api, formatDuration, type Asset, type Product, type Shot } from '../api'
import { findOverlappingShots } from '../utils/shotRange'
import { thumbImageClass } from '../utils/thumb'

export default function ClipPage() {
  const { assetId } = useParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [asset, setAsset] = useState<Asset | null>(null)
  const [assetShots, setAssetShots] = useState<Shot[]>([])
  const [startMs, setStartMs] = useState(0)
  const [endMs, setEndMs] = useState(0)
  const [name, setName] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const inheritedProductIdRef = useRef('')
  const { confirm, ConfirmDialog } = useConfirm()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listProducts().then(setProducts).catch(() => {})
  }, [])

  const loadAsset = useCallback(async (id: number) => {
    const list = await api.listAssets()
    const found = list.find((a) => a.id === id)
    if (found) {
      setAsset(found)
      setEndMs(found.duration_ms)
    }
    const shots = await api.listShots({ assetId: id })
    setAssetShots(shots)
  }, [])

  useEffect(() => {
    if (!assetId) return
    loadAsset(Number(assetId)).catch((e) => setError(String(e)))
  }, [assetId, loadAsset])

  useEffect(() => {
    if (!asset) return
    const pid = String(asset.product_id ?? '')
    setProductId(pid)
    inheritedProductIdRef.current = pid
  }, [asset?.id, asset?.product_id])

  const hasExtractingShots = assetShots.some(
    (s) => s.status === 'pending' || s.status === 'processing',
  )

  useEffect(() => {
    if (!assetId || !hasExtractingShots) return
    const timer = window.setInterval(() => {
      loadAsset(Number(assetId)).catch(() => {})
    }, 2000)
    return () => window.clearInterval(timer)
  }, [assetId, hasExtractingShots, loadAsset])

  const setInPoint = useCallback(() => {
    const v = videoRef.current
    if (v) setStartMs(Math.floor(v.currentTime * 1000))
  }, [])

  const setOutPoint = useCallback(() => {
    const v = videoRef.current
    if (v) setEndMs(Math.floor(v.currentTime * 1000))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        setInPoint()
      }
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault()
        setOutPoint()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setInPoint, setOutPoint])

  const extract = async () => {
    if (!asset) return
    if (!productId) {
      setError('请选择所属产品')
      return
    }
    if (productId !== inheritedProductIdRef.current) {
      const ok = await confirm({
        title: '修改产品归属',
        message: '您修改了片段的产品归属，原则上不允许。是否继续？',
        confirmLabel: '继续提取',
        danger: true,
      })
      if (!ok) return
    }
    const overlapping = findOverlappingShots(assetShots, startMs, endMs)
    if (overlapping.length > 0) {
      const detail = overlapping
        .map((shot) => {
          const label = shot.name.trim() || `片段 ${formatDuration(shot.start_ms)}-${formatDuration(shot.end_ms)}`
          return `· ${label}（${formatDuration(shot.start_ms)} → ${formatDuration(shot.end_ms)}）`
        })
        .join('\n')
      const ok = await confirm({
        title: '时间段重叠',
        message: `当前选中区间与以下分镜时间段重叠：\n${detail}\n\n仍要重复提取吗？`,
        confirmLabel: '继续提取',
        danger: true,
      })
      if (!ok) return
    }
    setLoading(true)
    setError('')
    try {
      await api.createShot({
        asset_id: asset.id,
        name: name || `片段 ${formatDuration(startMs)}-${formatDuration(endMs)}`,
        start_ms: startMs,
        end_ms: endMs,
        tags: selectedTags,
        product_id: Number(productId),
      })
      setName('')
      setSelectedTags([])
      setStartMs(0)
      setEndMs(asset.duration_ms)
      const pid = String(asset.product_id ?? '')
      setProductId(pid)
      inheritedProductIdRef.current = pid
      await loadAsset(asset.id)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const deleteShot = async (shotId: number) => {
    const ok = await confirm({
      title: '删除片段',
      message: '确定删除这个片段？',
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteShot(shotId)
      if (asset) await loadAsset(asset.id)
    } catch (e) {
      setError(String(e))
    }
  }

  if (!asset) return <div className="empty">加载中…</div>

  return (
    <div className="clip-page">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 className="page-title" style={{ margin: 0 }}>拆解镜头</h1>
        <Link className="btn btn-secondary" to="/">返回素材上传</Link>
      </div>
      <ResourceMetaBreadcrumb
        productName={asset.product_name}
        tags={asset.tags}
        className="clip-asset-meta"
      />
      <p className="muted">总长 {formatDuration(asset.duration_ms)}</p>

      <div className="row clip-layout" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div className="video-wrap">
          <video
            ref={videoRef}
            src={api.getAssetStream(asset.id)}
            controls
            playsInline
          />
        </div>

        <div className="card clip-form" style={{ flex: 1, maxWidth: 420 }}>
          <p className="muted">播放视频，按 <kbd>I</kbd> / <kbd>O</kbd> 标记入点和出点。</p>

          <div className="clip-controls">
            <button className="btn btn-secondary" type="button" onClick={setInPoint}>
              I 入点 ({formatDuration(startMs)})
            </button>
            <button className="btn btn-secondary" type="button" onClick={setOutPoint}>
              O 出点 ({formatDuration(endMs)})
            </button>
          </div>

          <div className="field">
            <label className="label">镜头名称</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="可选" />
          </div>

          <label className="field field-product-inherited">
            <span className="label">所属产品（必填）</span>
            <select
              className="input input-inherited-product"
              value={productId}
              disabled={loading}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">请选择产品</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="field-hint muted">默认继承原片产品，原则上不可修改</span>
          </label>

          <TagSelect
            value={selectedTags}
            onChange={setSelectedTags}
            disabled={loading}
          />

          <p className="muted">选中区间：{formatDuration(startMs)} → {formatDuration(endMs)}（{formatDuration(endMs - startMs)}）</p>

          {error && <p className="error">{error}</p>}

          <button
            className="btn btn-primary"
            disabled={loading || endMs <= startMs || !productId}
            onClick={extract}
          >
            {loading ? '提取中…' : '提取镜头'}
          </button>
        </div>
      </div>

      <section className="clip-shots-section card" style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>本原片已拆解片段（{assetShots.length}）</h3>
        {assetShots.length === 0 ? (
          <div className="empty" style={{ padding: 16 }}>暂无片段，标记入出点后提取。</div>
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
                  onDelete={() => void deleteShot(shot.id)}
                  hideCardMeta
                  resourceMeta={{
                    productId: shot.product_id,
                    productName: shot.product_name,
                    shotName: shot.name,
                    tags: shot.tags,
                    editableShotName: true,
                    onSave: async (data) => {
                      await api.updateShot(shot.id, data)
                      if (asset) await loadAsset(asset.id)
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
      </section>
      {ConfirmDialog}
    </div>
  )
}
