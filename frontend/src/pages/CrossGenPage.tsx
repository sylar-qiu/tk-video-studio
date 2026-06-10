import { Navigate } from 'react-router-dom'

/** 交叉生成入口：进入批量脚本编辑。 */
export default function CrossGenPage() {
  return <Navigate to="/scripts/batch/new" replace />
}
