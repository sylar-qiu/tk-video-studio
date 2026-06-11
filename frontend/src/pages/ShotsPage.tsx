import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import VideoPreview from '../components/VideoPreview'
import ShotCardMeta from '../components/ShotCardMeta'
import { useConfirm } from '../hooks/useConfirm'
import { useUrlResourceFilters } from '../hooks/useUrlResourceFilters'
import { api, type Product, type Shot, type ShotNameInfo, type TagInfo } from '../api'
import { shotNameWithCount, tagWithCount } from '../utils/resourceLabels'
import { thumbImageClass } from '../utils/thumb'

export default function ShotsPage() {
  const urlFilters = useUrlResourceFilters()
  const [shots, setShots] = useState<Shot[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [tags, setTags] = useState<TagInfo[]>([])
  const [shotNames, setShotNames] = useState<ShotNameInfo[]>([])
  const [productFilter, setProductFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [error, setError] = useState('')
  const { confirm, ConfirmDialog } = useConfirm()

  useEffect(() => {
    if (urlFilters.product) setProductFilter(urlFilters.product)
    if (urlFilters.tag) setTagFilter(urlFilters.tag)
  }, [urlFilters.product, urlFilters.tag])

  const visibleShots = useMemo(
    () => [...shots].sort((a, b) => b.id - a.id),
    [shots],
  )

  const totalShots = useMemo(
    () => products.reduce((sum, p) => sum + p.stats.shots, 0),
    [products],
  )

  const hasFilter = !!(productFilter || tagFilter || nameFilter)

  const load = useCallback(() => {
    const productId = productFilter ? Number(productFilter) : undefined
    return api
      .listShots({
        productId,
        tag: tagFilter || undefined,
        name: nameFilter || undefined,
        readyOnly: true,
      })
      .then(setShots)
      .catch((e) => setError(String(e)))
  }, [productFilter, tagFilter, nameFilter])

  useEffect(() => {
    Promise.all([api.listProducts(), api.listTags()])
      .then(([productList, tagList]) => {
        setProducts(productList)
        setTags(tagList)
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    const productId = productFilter ? Number(productFilter) : undefined
    api
      .listShotNames({ productId, tag: tagFilter || undefined })
      .then(setShotNames)
      .catch(() => {})
  }, [productFilter, tagFilter])

  useEffect(() => {
    if (nameFilter && !shotNames.some((row) => row.name === nameFilter)) {
      setNameFilter('')
    }
  }, [nameFilter, shotNames])

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [load])

  const handleDelete = async (id: number) => {
    const ok = await confirm({
      title: '删除镜头',
      message: '确定删除这个镜头？',
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

  return (
    <div>
      <h1 className="page-title">素材库</h1>
      {(productFilter || tagFilter || nameFilter) && (
        <p className="muted">
          当前筛选：
          {productFilter && (
            <span>
              {' '}
              产品「{products.find((p) => String(p.id) === productFilter)?.name ?? productFilter}」
            </span>
          )}
          {tagFilter && <span> 标签「{tagFilter}」</span>}
          {nameFilter && <span> 镜头「{nameFilter}」</span>}
          <Link to="/shots" className="filter-clear-link">
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
            <option value="">全部产品 ({totalShots})</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.stats.shots})
              </option>
            ))}
          </select>
        </label>
        <label className="shots-library-filter">
          <select
            className="input"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">全部标签</option>
            {tags.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tagWithCount(tag.name, tag.videos)}
              </option>
            ))}
          </select>
        </label>
        <label className="shots-library-filter">
          <select
            className="input"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          >
            <option value="">全部镜头</option>
            {shotNames.map((row) => (
              <option key={row.name} value={row.name}>
                {shotNameWithCount(row.name, row.video_count)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {visibleShots.length === 0 ? (
        <div className="empty">
          {hasFilter ? '没有符合筛选条件的分镜' : '暂无分镜。上传视频后拆解片段即可出现在这里。'}
        </div>
      ) : (
        <div className="shot-library-grid">
          {visibleShots.map((shot) => {
            const displayName = shot.name.trim() || '未命名分镜'
            return (
              <article key={shot.id} className="shot-library-card">
                <div className="shot-library-card-media">
                  <VideoPreview
                    videoUrl={shot.clip_url}
                    thumbUrl={shot.thumb_url}
                    durationMs={shot.duration_ms}
                    className="video-thumb-btn"
                    imageClassName={thumbImageClass(shot.thumb_url)}
                    onDelete={() => void handleDelete(shot.id)}
                    hideCardMeta
                    resourceMeta={{
                      productId: shot.product_id,
                      productName: shot.product_name,
                      shotName: displayName,
                      tags: shot.tags,
                      editableShotName: true,
                      onSave: async (data) => {
                        await api.updateShot(shot.id, data)
                        load()
                      },
                    }}
                  />
                </div>
                <div className="shot-library-card-body">
                  <ShotCardMeta
                    variant="library"
                    productName={shot.product_name}
                    tags={shot.tags}
                    shotName={displayName}
                    createdAt={shot.created_at}
                  />
                </div>
              </article>
            )
          })}
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}
