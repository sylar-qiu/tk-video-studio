import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { beijingNowMs, formatRelativeTime } from '../api'

interface Props {
  productName?: string | null
  tags?: string[]
  shotName?: string | null
  createdAt: string
  variant?: 'default' | 'library'
}

function LibraryCardTags({ tags }: { tags: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el || expanded) {
      setOverflows(false)
      return
    }
    setOverflows(el.scrollWidth > el.clientWidth + 1)
  }, [expanded])

  useLayoutEffect(() => {
    measure()
  }, [tags, measure])

  useEffect(() => {
    if (expanded) return
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [expanded, measure])

  if (tags.length === 0) return null

  const canToggle = overflows || expanded

  return (
    <div
      ref={ref}
      role={canToggle ? 'button' : undefined}
      tabIndex={canToggle ? 0 : undefined}
      className={`shot-library-card-tags${expanded ? ' is-expanded' : ''}${
        canToggle ? ' is-clickable' : ''
      }`}
      onClick={() => canToggle && setExpanded((v) => !v)}
      onKeyDown={(e) => {
        if (!canToggle) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setExpanded((v) => !v)
        }
      }}
      title={!expanded ? tags.join('、') : undefined}
      aria-expanded={canToggle ? expanded : undefined}
    >
      {tags.map((tag) => (
        <span key={tag} className="tag">
          {tag}
        </span>
      ))}
    </div>
  )
}

export default function ShotCardMeta({
  productName,
  tags = [],
  shotName,
  createdAt,
  variant = 'default',
}: Props) {
  const [now, setNow] = useState(() => beijingNowMs())

  useEffect(() => {
    const id = window.setInterval(() => setNow(beijingNowMs()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const name = shotName?.trim() || '未命名'

  if (variant === 'library') {
    return (
      <div className="shot-library-card-meta">
        <h3 className="shot-library-card-title" title={name}>
          {name}
        </h3>
        <p className="shot-library-card-product muted" title={productName ?? undefined}>
          {productName ?? '未指定产品'}
        </p>
        <LibraryCardTags tags={tags} />
        <p className="shot-library-card-time muted">
          {formatRelativeTime(createdAt, now)}
        </p>
      </div>
    )
  }

  return (
    <div className="asset-card-meta shot-card-meta">
      <p className="asset-card-meta-line">产品：{productName ?? '未指定'}</p>
      {tags.length > 0 && (
        <div className="asset-card-meta-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      )}
      <div className="shot-card-meta-row">
        <p className="asset-card-meta-line shot-card-meta-shot">分镜：{name}</p>
        <span className="asset-card-meta-line muted shot-card-meta-time">
          {formatRelativeTime(createdAt, now)}
        </span>
      </div>
    </div>
  )
}
