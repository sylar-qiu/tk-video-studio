import { Link } from 'react-router-dom'
import { resourceFilterUrl, type ResourceFilterParams, type ResourceKind } from '../utils/resourceNav'

interface StatLinkProps {
  kind: ResourceKind
  count: number
  filter?: ResourceFilterParams
}

export default function StatLink({ kind, count, filter }: StatLinkProps) {
  if (count <= 0) {
    return <span className="stat-empty">—</span>
  }
  return (
    <Link to={resourceFilterUrl(kind, filter)} className="stat-link">
      {count}
    </Link>
  )
}
