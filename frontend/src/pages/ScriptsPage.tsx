import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useConfirm } from '../hooks/useConfirm'
import { api, formatDuration, type ConcatProject } from '../api'
import { parseScriptsTab, scriptsListPath, type ScriptsTab } from '../utils/scriptsNav'

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ScriptList({
  projects,
  emptyText,
  onOpen,
  onDelete,
}: {
  projects: ConcatProject[]
  emptyText: string
  onOpen: (id: number) => void
  onDelete: (id: number) => void
}) {
  if (projects.length === 0) {
    return <div className="empty scripts-module-empty">{emptyText}</div>
  }

  return (
    <div className="script-list">
      {projects.map((p) => (
        <div key={p.id} className="script-list-item card">
          <button type="button" className="script-list-open" onClick={() => onOpen(p.id)}>
            <strong>{p.name}</strong>
            <span className="muted">
              {p.shot_count} 段 · {formatDuration(p.duration_ms)}
              {p.updated_at ? ` · 更新 ${formatUpdatedAt(p.updated_at)}` : ''}
            </span>
          </button>
          <button
            type="button"
            className="script-list-del"
            title="删除"
            onClick={() => void onDelete(p.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export default function ScriptsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { confirm, ConfirmDialog } = useConfirm()

  const tab = parseScriptsTab(searchParams.toString())
  const setTab = (next: ScriptsTab) => {
    setSearchParams({ tab: next }, { replace: true })
  }

  const [projects, setProjects] = useState<ConcatProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadProjects = useCallback(async () => {
    setError('')
    try {
      const ps = await api.listProjects()
      setProjects(ps)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const manualProjects = useMemo(
    () => projects.filter((p) => (p.source ?? 'manual') !== 'batch'),
    [projects],
  )
  const batchProjects = useMemo(
    () => projects.filter((p) => p.source === 'batch'),
    [projects],
  )
  const visibleProjects = tab === 'manual' ? manualProjects : batchProjects

  const deleteProject = async (id: number) => {
    const ok = await confirm({
      title: '删除脚本',
      message: '确定删除这个脚本？相关预览文件也会被移除。',
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteProject(id)
      await loadProjects()
    } catch (e) {
      setError(String(e))
    }
  }

  const handleCreate = () => {
    if (tab === 'manual') {
      navigate('/scripts/new')
      return
    }
    navigate('/scripts/batch/new')
  }

  return (
    <div className="scripts-page">
      <div className="scripts-toolbar">
        <div className="scripts-tabs" role="tablist" aria-label="脚本类型">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'manual'}
            className={`scripts-tab${tab === 'manual' ? ' active' : ''}`}
            onClick={() => setTab('manual')}
          >
            独立脚本
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'batch'}
            className={`scripts-tab${tab === 'batch' ? ' active' : ''}`}
            onClick={() => setTab('batch')}
          >
            批量脚本
          </button>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleCreate}>
          {tab === 'manual' ? '新建脚本' : '批量新建'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <div className="empty">加载中…</div>
      ) : (
        <ScriptList
          projects={visibleProjects}
          emptyText={tab === 'manual' ? '暂无独立脚本' : '暂无批量脚本'}
          onOpen={(id) => navigate(`/scripts/${id}?tab=${tab}`)}
          onDelete={deleteProject}
        />
      )}

      {ConfirmDialog}
    </div>
  )
}
