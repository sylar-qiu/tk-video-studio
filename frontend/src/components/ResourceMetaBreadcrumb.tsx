interface Props {
  productName?: string | null
  shotName?: string | null
  tags?: string[]
  className?: string
}

export default function ResourceMetaBreadcrumb({
  productName,
  shotName,
  tags = [],
  className = '',
}: Props) {
  const items: string[] = []
  if (productName) items.push(productName)
  if (shotName?.trim()) items.push(shotName.trim())
  items.push(...tags.filter(Boolean))

  if (items.length === 0) return null

  return (
    <div className={`meta-breadcrumb${className ? ` ${className}` : ''}`} title={items.join(' › ')}>
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="meta-breadcrumb-item">
          {index > 0 && <span className="meta-breadcrumb-sep" aria-hidden>›</span>}
          <span className="meta-breadcrumb-text">{item}</span>
        </span>
      ))}
    </div>
  )
}
