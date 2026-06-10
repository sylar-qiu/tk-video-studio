import { useEffect, useState } from 'react'
import { beijingNowMs, formatRelativeTime } from '../api'

interface Props {
  productName?: string | null
  tags?: string[]
  createdAt: string
}

export default function AssetCardMeta({ productName, tags = [], createdAt }: Props) {
  const [now, setNow] = useState(() => beijingNowMs())

  useEffect(() => {
    const id = window.setInterval(() => setNow(beijingNowMs()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="asset-card-meta">
      <p className="asset-card-meta-line">产品：{productName ?? '未指定'}</p>
      {tags.length > 0 && (
        <div className="asset-card-meta-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      )}
      <p className="asset-card-meta-line muted">{formatRelativeTime(createdAt, now)}</p>
    </div>
  )
}
