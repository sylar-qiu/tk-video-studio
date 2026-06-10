import { Navigate, useParams } from 'react-router-dom'

/** 旧路由兼容：/concat → /scripts */
export default function ConcatPage() {
  const { projectId } = useParams()
  if (projectId) return <Navigate to={`/scripts/${projectId}`} replace />
  return <Navigate to="/scripts" replace />
}
