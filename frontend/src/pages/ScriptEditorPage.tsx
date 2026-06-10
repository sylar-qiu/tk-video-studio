import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import BatchGenerateModal from '../components/BatchGenerateModal'
import ExportNameModal from '../components/ExportNameModal'
import FilterSelect from '../components/FilterSelect'
import ScriptNameModal from '../components/ScriptNameModal'
import ConcatPreviewModal from '../components/ConcatPreviewModal'
import { buildBatchCombinationPlan, formatSceneMultiply } from '../utils/batchCombinations'
import VideoPreview from '../components/VideoPreview'
import { useConfirm } from '../hooks/useConfirm'
import { thumbImageClass } from '../utils/thumb'
import { calcExportDurationMs, segmentPlayMs } from '../utils/concatTimeline'
import {
  createDefaultBatchScenes,
  nextSceneId,
  nextSceneName,
  type SceneState,
} from '../utils/scriptScenes'
import {
  api,
  beijingNowMs,
  formatDuration,
  formatRelativeTime,
  type BgmTrack,
  type ConcatItem,
  type ConcatProject,
  type ExportJob,
  type Product,
  type ScriptScene,
  type Shot,
  type ShotNameInfo,
  type TagInfo,
  type TransitionType,
} from '../api'
import { shotNameWithCount, tagWithCount } from '../utils/resourceLabels'
import { scriptsListPath, parseScriptsTab } from '../utils/scriptsNav'

const BGM_IMPORT_VALUE = '__import__'

function ExportRelativeTime({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => beijingNowMs())

  useEffect(() => {
    const id = window.setInterval(() => setNow(beijingNowMs()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  return <p className="export-icon-time muted">{formatRelativeTime(createdAt, now)}</p>
}

interface TimelineEntry {
  shot: Shot
  transition: TransitionType
}

const SEGMENT_COLORS = [
  '#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa',
  '#60a5fa', '#f472b6', '#34d399', '#fb923c',
]

function itemsToTimeline(items: ConcatItem[], shots: Shot[]): TimelineEntry[] {
  const map = new Map(shots.map((s) => [s.id, s]))
  const result: TimelineEntry[] = []
  for (const it of items) {
    const shot = map.get(it.shot_id)
    if (shot) result.push({ shot, transition: it.transition })
  }
  return result
}

function timelineToItems(timeline: TimelineEntry[]): ConcatItem[] {
  return timeline.map((entry, index) => ({
    shot_id: entry.shot.id,
    transition: index === 0 ? 'cut' : entry.transition,
  }))
}

function shotPlayDurationMs(shot: { duration_ms: number; clip_duration_ms?: number | null }): number {
  return shot.clip_duration_ms ?? shot.duration_ms
}

function timelineSegmentPlayMs(entry: TimelineEntry, index: number): number {
  return segmentPlayMs(
    { transition: entry.transition, duration_ms: shotPlayDurationMs(entry.shot) },
    index,
  )
}

function calcTimelineExportMs(timeline: TimelineEntry[]): number {
  return calcExportDurationMs(
    timeline.map((entry) => ({
      transition: entry.transition,
      duration_ms: shotPlayDurationMs(entry.shot),
    })),
  )
}

interface ProjectAudioState {
  includeShotAudio: boolean
  shotAudioVolume: number
  bgmEnabled: boolean
  bgmVolume: number
}

function roundVolume(v: number): number {
  return Math.round(v * 100) / 100
}

function buildProjectSavePayload(
  projectName: string,
  timeline: TimelineEntry[],
  audio: ProjectAudioState,
) {
  return {
    name: projectName,
    items: timelineToItems(timeline),
    include_shot_audio: audio.includeShotAudio,
    shot_audio_volume: roundVolume(audio.shotAudioVolume),
    bgm_enabled: audio.bgmEnabled,
    bgm_volume: roundVolume(audio.bgmVolume),
  }
}

function serializeProjectSavePayload(
  projectName: string,
  timeline: TimelineEntry[],
  audio: ProjectAudioState,
): string {
  return JSON.stringify(buildProjectSavePayload(projectName, timeline, audio))
}

const DEFAULT_AUDIO_STATE: ProjectAudioState = {
  includeShotAudio: true,
  shotAudioVolume: 1,
  bgmEnabled: false,
  bgmVolume: 0.35,
}

function emptyDraftSnapshot(): string {
  return serializeProjectSavePayload('', [], DEFAULT_AUDIO_STATE)
}

function audioStateFromProject(project: ConcatProject): ProjectAudioState {
  return {
    includeShotAudio: project.include_shot_audio,
    shotAudioVolume: project.shot_audio_volume ?? 1,
    bgmEnabled: project.bgm_enabled,
    bgmVolume: project.bgm_volume,
  }
}

function scenesToApi(scenes: SceneState[]): ScriptScene[] {
  return scenes.map((s) => ({
    id: s.id,
    name: s.name,
    items: timelineToItems(s.timeline),
  }))
}

/** 批量脚本：保存/脏检查均面向整个脚本（全部场景 + 项目级声音），与当前选中场景无关。 */
function buildBatchSavePayload(
  projectName: string,
  scenes: SceneState[],
  audio: ProjectAudioState,
) {
  return {
    name: projectName,
    scenes: scenesToApi(scenes),
    include_shot_audio: audio.includeShotAudio,
    shot_audio_volume: roundVolume(audio.shotAudioVolume),
    bgm_enabled: audio.bgmEnabled,
    bgm_volume: roundVolume(audio.bgmVolume),
  }
}

function serializeBatchSnapshot(
  projectName: string,
  scenes: SceneState[],
  audio: ProjectAudioState,
): string {
  return JSON.stringify(buildBatchSavePayload(projectName, scenes, audio))
}

function apiScenesToState(apiScenes: ScriptScene[], shots: Shot[]): SceneState[] {
  return apiScenes.map((s) => ({
    id: s.id,
    name: s.name,
    timeline: itemsToTimeline(s.items, shots),
  }))
}

function emptyBatchDraftSnapshot(scenes: SceneState[]): string {
  return serializeBatchSnapshot('', scenes, DEFAULT_AUDIO_STATE)
}

function serializeSavedSnapshot(
  isBatch: boolean,
  projectName: string,
  scenes: SceneState[],
  timeline: TimelineEntry[],
  audio: ProjectAudioState,
): string {
  return isBatch
    ? serializeBatchSnapshot(projectName, scenes, audio)
    : serializeProjectSavePayload(projectName, timeline, audio)
}

export default function ScriptEditorPage() {
  const { projectId: projectIdParam } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [currentProject, setCurrentProject] = useState<ConcatProject | null>(null)
  const [projectName, setProjectName] = useState('')
  const [pickerShots, setPickerShots] = useState<Shot[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [tags, setTags] = useState<TagInfo[]>([])
  const [shotNames, setShotNames] = useState<ShotNameInfo[]>([])
  const [productFilter, setProductFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [manualTimeline, setManualTimeline] = useState<TimelineEntry[]>([])
  const [scenes, setScenes] = useState<SceneState[]>([])
  const [activeSceneId, setActiveSceneId] = useState('scene-1')
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const [nextExportName, setNextExportName] = useState('')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [includeShotAudio, setIncludeShotAudio] = useState(true)
  const [shotAudioVolume, setShotAudioVolume] = useState(1)
  const [bgmEnabled, setBgmEnabled] = useState(false)
  const [bgmVolume, setBgmVolume] = useState(0.35)
  const [bgmTracks, setBgmTracks] = useState<BgmTrack[]>([])
  const [bgmUploading, setBgmUploading] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const bgmInputRef = useRef<HTMLInputElement>(null)

  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
  const [batchCountdownSec, setBatchCountdownSec] = useState(0)
  const [nameModalOpen, setNameModalOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { confirm, ConfirmDialog } = useConfirm()

  const isBatchDraft = location.pathname === '/scripts/batch/new'
  const isNewDraft = location.pathname === '/scripts/new' || isBatchDraft
  const isBatch = isBatchDraft || currentProject?.source === 'batch'
  const isSaved = currentProject !== null

  const returnScriptsPath = useCallback(() => {
    if (isBatch) return scriptsListPath('batch')
    return scriptsListPath(parseScriptsTab(location.search))
  }, [isBatch, location.search])

  const timeline = useMemo(() => {
    if (isBatch) {
      return scenes.find((s) => s.id === activeSceneId)?.timeline ?? []
    }
    return manualTimeline
  }, [isBatch, scenes, activeSceneId, manualTimeline])

  const setTimeline = useCallback(
    (updater: TimelineEntry[] | ((prev: TimelineEntry[]) => TimelineEntry[])) => {
      if (isBatch) {
        setScenes((prev) =>
          prev.map((scene) => {
            if (scene.id !== activeSceneId) return scene
            const next =
              typeof updater === 'function' ? updater(scene.timeline) : updater
            return { ...scene, timeline: next }
          }),
        )
      } else {
        setManualTimeline(updater)
      }
    },
    [isBatch, activeSceneId],
  )

  const currentAudioState = useMemo(
    (): ProjectAudioState => ({
      includeShotAudio,
      shotAudioVolume,
      bgmEnabled,
      bgmVolume,
    }),
    [includeShotAudio, shotAudioVolume, bgmEnabled, bgmVolume],
  )

  const materialTotalMs = useMemo(
    () => timeline.reduce((sum, e) => sum + shotPlayDurationMs(e.shot), 0),
    [timeline],
  )
  const exportTotalMs = useMemo(() => calcTimelineExportMs(timeline), [timeline])
  const hasFade = timeline.some((e, i) => i > 0 && e.transition === 'fade')

  const batchPlan = useMemo(
    () => (isBatch ? buildBatchCombinationPlan(scenes) : null),
    [isBatch, scenes],
  )

  const isDirty = useMemo(() => {
    return (
      serializeSavedSnapshot(isBatch, projectName, scenes, timeline, currentAudioState) !==
      savedSnapshot
    )
  }, [isBatch, projectName, scenes, timeline, currentAudioState, savedSnapshot])

  const batchCanGenerate = isSaved && !isDirty && batchPlan !== null

  const totalShots = useMemo(
    () => products.reduce((sum, p) => sum + p.stats.shots, 0),
    [products],
  )

  const pickerSelectedCounts = useMemo(() => {
    const selectedShots = timeline.map((entry) => entry.shot)
    const byProduct = new Map<number, number>()
    const byName = new Map<string, number>()
    const byTag = new Map<string, number>()
    for (const shot of selectedShots) {
      if (shot.product_id != null) {
        byProduct.set(shot.product_id, (byProduct.get(shot.product_id) ?? 0) + 1)
      }
      byName.set(shot.name, (byName.get(shot.name) ?? 0) + 1)
      for (const tag of shot.tags) {
        byTag.set(tag, (byTag.get(tag) ?? 0) + 1)
      }
    }
    return {
      total: selectedShots.length,
      byProduct,
      byName,
      byTag,
    }
  }, [timeline])

  const hasPickerFilter = !!(productFilter || tagFilter || nameFilter)

  const loadProjectExports = useCallback(async (projectId: number) => {
    const j = await api.listExports({ projectId })
    setJobs(j)
    return j
  }, [])

  const loadMeta = useCallback(async () => {
    const [n, tracks, productList, tagList] = await Promise.all([
      api.getNextExportName(),
      api.listBgmTracks(),
      api.listProducts(),
      api.listTags(),
    ])
    setNextExportName(n.name)
    setBgmTracks(tracks)
    setProducts(productList)
    setTags(tagList)
  }, [])

  const loadPickerShots = useCallback(async () => {
    const productId = productFilter ? Number(productFilter) : undefined
    const list = await api.listShots({
      productId,
      tag: tagFilter || undefined,
      name: nameFilter || undefined,
      taggedOnly: true,
      readyOnly: true,
    })
    setPickerShots(list)
    return list
  }, [productFilter, tagFilter, nameFilter])

  const loadProject = useCallback(
    async (id: number) => {
      const [project, allShots] = await Promise.all([
        api.getProject(id),
        api.listShots({ taggedOnly: true, readyOnly: true }),
      ])
      const audio = audioStateFromProject(project)
      if (project.source === 'batch') {
        const rawScenes =
          project.scenes && project.scenes.length > 0
            ? project.scenes
            : createDefaultBatchScenes().map((s) => ({ id: s.id, name: s.name, items: [] }))
        const sceneStates = apiScenesToState(rawScenes, allShots)
        setSavedSnapshot(serializeBatchSnapshot(project.name, sceneStates, audio))
        setScenes(sceneStates)
        setActiveSceneId(sceneStates[0]?.id ?? 'scene-1')
        setManualTimeline([])
      } else {
        const nextTimeline = itemsToTimeline(project.items, allShots)
        setSavedSnapshot(serializeProjectSavePayload(project.name, nextTimeline, audio))
        setScenes([])
        setManualTimeline(nextTimeline)
      }
      setCurrentProject(project)
      setProjectName(project.name)
      setIncludeShotAudio(project.include_shot_audio)
      setShotAudioVolume(project.shot_audio_volume ?? 1)
      setBgmEnabled(project.bgm_enabled)
      setBgmVolume(project.bgm_volume)
      setSelectedIndex(null)
      await loadProjectExports(id)
    },
    [loadProjectExports],
  )

  const initNewDraft = useCallback(() => {
    if (isBatchDraft) {
      const defaults = createDefaultBatchScenes()
      setScenes(defaults)
      setActiveSceneId(defaults[0].id)
      setManualTimeline([])
      setSavedSnapshot(emptyBatchDraftSnapshot(defaults))
    } else {
      setScenes([])
      setManualTimeline([])
      setSavedSnapshot(emptyDraftSnapshot())
    }
    setCurrentProject(null)
    setProjectName('')
    setIncludeShotAudio(DEFAULT_AUDIO_STATE.includeShotAudio)
    setShotAudioVolume(DEFAULT_AUDIO_STATE.shotAudioVolume)
    setBgmEnabled(DEFAULT_AUDIO_STATE.bgmEnabled)
    setBgmVolume(DEFAULT_AUDIO_STATE.bgmVolume)
    setJobs([])
    setSelectedIndex(null)
    setError('')
  }, [isBatchDraft])

  const initPage = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      await loadMeta()
      if (isNewDraft) {
        initNewDraft()
        return
      }
      const pid = projectIdParam ? Number(projectIdParam) : NaN
      if (!Number.isFinite(pid) || pid <= 0) {
        navigate(returnScriptsPath(), { replace: true })
        return
      }
      await loadProject(pid)
    } catch (e) {
      setError(String(e))
      if (!isNewDraft) navigate(returnScriptsPath(), { replace: true })
    } finally {
      setLoading(false)
    }
  }, [initNewDraft, isNewDraft, loadMeta, loadProject, navigate, projectIdParam, returnScriptsPath])

  useEffect(() => {
    if (loading) return
    void loadPickerShots().catch((e) => setError(String(e)))
  }, [loadPickerShots, loading])

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
    void initPage()
  }, [initPage])

  const activeProjectId = currentProject?.id ?? null
  const hasProcessingJobs = jobs.some(
    (j) => j.status === 'pending' || j.status === 'processing',
  )

  useEffect(() => {
    if (!activeProjectId) return
    const ms = hasProcessingJobs ? 2000 : 10000
    const timer = window.setInterval(() => {
      loadProjectExports(activeProjectId).catch(() => {})
    }, ms)
    return () => window.clearInterval(timer)
  }, [activeProjectId, hasProcessingJobs, loadProjectExports])

  useEffect(() => {
    if (!batchModalOpen) return
    const timer = window.setInterval(() => {
      setBatchCountdownSec((sec) => Math.max(0, sec - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [batchModalOpen])

  const saveProject = useCallback(async () => {
    if (!isDirty || saving) return

    const payload = isBatch
      ? buildBatchSavePayload(projectName, scenes, currentAudioState)
      : buildProjectSavePayload(projectName, timeline, currentAudioState)
    const snapshot = serializeSavedSnapshot(
      isBatch,
      projectName,
      scenes,
      timeline,
      currentAudioState,
    )

    setSaving(true)
    setError('')
    try {
      if (!currentProject) {
        const created = await api.createProject({
          ...(projectName.trim() ? { name: projectName.trim() } : {}),
          source: isBatch ? 'batch' : 'manual',
        })
        const updated = await api.updateProject(created.id, payload)
        setSavedSnapshot(snapshot)
        setCurrentProject(updated)
        setProjectName(updated.name)
        if (updated.source === 'batch' && updated.scenes?.length) {
          const allShots = await api.listShots({ taggedOnly: true, readyOnly: true })
          setScenes(apiScenesToState(updated.scenes, allShots))
        }
        navigate(`/scripts/${updated.id}?tab=${isBatch ? 'batch' : 'manual'}`, { replace: true })
        await loadProjectExports(updated.id)
      } else {
        const updated = await api.updateProject(currentProject.id, payload)
        setSavedSnapshot(snapshot)
        setCurrentProject(updated)
        setProjectName(updated.name)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }, [
    currentAudioState,
    currentProject,
    isBatch,
    isDirty,
    loadProjectExports,
    navigate,
    projectName,
    saving,
    scenes,
    timeline,
  ])

  const handleBack = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: '离开页面',
        message: '有未保存的修改，确定返回脚本列表？',
        confirmLabel: '离开',
        danger: true,
      })
      if (!ok) return
    }
    navigate(returnScriptsPath())
  }

  const handleBgmUpload = async (file: File) => {
    if (!currentProject) return
    setBgmUploading(true)
    setError('')
    try {
      const [updated, tracks] = await Promise.all([
        api.uploadProjectBgm(currentProject.id, file),
        api.listBgmTracks(),
      ])
      setBgmTracks(tracks)
      setCurrentProject(updated)
      setBgmEnabled(updated.bgm_enabled)
      setSavedSnapshot(
        serializeSavedSnapshot(isBatch, projectName, scenes, timeline, {
          includeShotAudio,
          shotAudioVolume,
          bgmEnabled: updated.bgm_enabled,
          bgmVolume,
        }),
      )
    } catch (e) {
      setError(String(e))
    } finally {
      setBgmUploading(false)
      if (bgmInputRef.current) bgmInputRef.current.value = ''
    }
  }

  const handleBgmSelect = async (trackId: number | null) => {
    if (!currentProject) return
    setBgmUploading(true)
    setError('')
    try {
      const updated = await api.selectProjectBgm(currentProject.id, trackId)
      setCurrentProject(updated)
      setBgmEnabled(updated.bgm_enabled)
      setSavedSnapshot(
        serializeSavedSnapshot(isBatch, projectName, scenes, timeline, {
          includeShotAudio,
          shotAudioVolume,
          bgmEnabled: updated.bgm_enabled,
          bgmVolume,
        }),
      )
    } catch (e) {
      setError(String(e))
    } finally {
      setBgmUploading(false)
    }
  }

  const addShot = (shot: Shot) => {
    if (timeline.some((t) => t.shot.id === shot.id)) return
    setTimeline((prev) => {
      const next = [...prev, { shot, transition: 'cut' as TransitionType }]
      setSelectedIndex(next.length - 1)
      return next
    })
  }

  const removeAt = (index: number) => {
    setTimeline((prev) => prev.filter((_, i) => i !== index))
    setSelectedIndex((cur) => {
      if (cur === null) return null
      if (cur === index) return null
      if (cur > index) return cur - 1
      return cur
    })
  }

  const togglePickerShot = (shot: Shot, checked: boolean) => {
    if (checked) {
      addShot(shot)
      return
    }
    const index = timeline.findIndex((t) => t.shot.id === shot.id)
    if (index >= 0) removeAt(index)
  }

  const switchScene = (sceneId: string) => {
    setActiveSceneId(sceneId)
    setSelectedIndex(null)
  }

  const addScene = () => {
    const id = nextSceneId()
    setScenes((prev) => [
      ...prev,
      { id, name: nextSceneName(prev.length + 1), timeline: [] },
    ])
    setActiveSceneId(id)
    setSelectedIndex(null)
  }

  const deleteScene = async (sceneId: string) => {
    if (scenes.length <= 1) return
    const scene = scenes.find((s) => s.id === sceneId)
    const ok = await confirm({
      title: '删除场景',
      message: `确定删除「${scene?.name ?? '该场景'}」？场景内的素材将一并移除。`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return

    setScenes((prev) => {
      const next = prev.filter((s) => s.id !== sceneId)
      if (activeSceneId === sceneId) {
        setActiveSceneId(next[0]?.id ?? '')
      }
      return next
    })
    setSelectedIndex(null)
  }

  const move = (index: number, dir: -1 | 1) => {
    setTimeline((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setSelectedIndex((cur) => {
      if (cur === null) return null
      if (cur === index) return index + dir
      if (cur === index + dir) return index
      return cur
    })
  }

  const reorderTimeline = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return
    setTimeline((prev) => {
      if (from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
    setSelectedIndex((cur) => {
      if (cur === null) return null
      if (cur === from) return to
      if (from < cur && to >= cur) return cur - 1
      if (from > cur && to <= cur) return cur + 1
      return cur
    })
  }

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overSlotIndex, setOverSlotIndex] = useState<number | null>(null)
  const dragMovedRef = useRef(false)

  const resolveDropIndex = (slotIndex: number, clientX: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect()
    const insertAfter = clientX >= rect.left + rect.width / 2
    let to = insertAfter ? slotIndex + 1 : slotIndex
    if (dragIndex !== null && dragIndex < to) to -= 1
    return Math.max(0, Math.min(to, timeline.length - 1))
  }

  const handleSegmentDragStart = (index: number, e: React.DragEvent) => {
    dragMovedRef.current = false
    setDragIndex(index)
    setOverSlotIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  const handleSegmentDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragIndex === null) return
    dragMovedRef.current = true
    setOverSlotIndex(index)
  }

  const handleSegmentDrop = (index: number, e: React.DragEvent) => {
    e.preventDefault()
    if (dragIndex === null) return
    const to = resolveDropIndex(index, e.clientX, e.currentTarget as HTMLElement)
    reorderTimeline(dragIndex, to)
    setDragIndex(null)
    setOverSlotIndex(null)
  }

  const handleSegmentDragEnd = () => {
    setDragIndex(null)
    setOverSlotIndex(null)
    window.setTimeout(() => {
      dragMovedRef.current = false
    }, 0)
  }

  const handleSegmentClick = (index: number) => {
    if (dragMovedRef.current) return
    setSelectedIndex(index)
  }

  const setTransition = (index: number, transition: TransitionType) => {
    setTimeline((prev) =>
      prev.map((item, i) => (i === index ? { ...item, transition } : item)),
    )
  }

  const handleExportConfirm = async (name: string) => {
    if (timeline.length === 0 || !currentProject) return
    setExporting(true)
    setError('')
    try {
      await api.createExport(name, currentProject.id, timelineToItems(timeline))
      setExportModalOpen(false)
      const n = await api.getNextExportName()
      setNextExportName(n.name)
      await loadProjectExports(currentProject.id)
    } catch (e) {
      setError(String(e))
    } finally {
      setExporting(false)
    }
  }

  const handleBatchGenerateConfirm = async () => {
    if (!currentProject || !batchPlan) return
    setBatchGenerating(true)
    setBatchProgress({ done: 0, total: batchPlan.videoCount })
    setBatchCountdownSec(batchPlan.estimateProcessSec)
    setError('')
    try {
      const { name: baseName } = await api.getNextExportName()
      const pad = String(batchPlan.videoCount).length
      for (let i = 0; i < batchPlan.itemsList.length; i++) {
        const suffix = String(i + 1).padStart(pad, '0')
        const exportName =
          batchPlan.videoCount === 1 ? baseName : `${baseName}-${suffix}`
        await api.createExport(exportName, currentProject.id, batchPlan.itemsList[i])
        setBatchProgress({ done: i + 1, total: batchPlan.videoCount })
      }
      await loadProjectExports(currentProject.id)
    } catch (e) {
      setError(String(e))
    } finally {
      setBatchGenerating(false)
    }
  }

  const deleteExport = async (id: number) => {
    const ok = await confirm({
      title: '删除成品',
      message: '确定删除这个成品？',
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteExport(id)
      if (currentProject) await loadProjectExports(currentProject.id)
    } catch (e) {
      setError(String(e))
    }
  }

  const publishExport = async (id: number, opts?: { skipConfirm?: boolean }) => {
    if (!opts?.skipConfirm) {
      const ok = await confirm({
        title: '发布作品',
        message: '发布至「作品」？发布后可立即在作品页查看。',
        confirmLabel: '发布',
      })
      if (!ok) return
    }
    try {
      await api.publishExport(id)
      if (currentProject) await loadProjectExports(currentProject.id)
    } catch (e) {
      setError(String(e))
    }
  }

  const canPublishExport = (job: ExportJob) =>
    job.status === 'done' && job.work_status !== 'approved'

  const exportWorkBadge = (job: ExportJob) => {
    if (job.status !== 'done') {
      if (job.status === 'processing') return `合成中 ${Math.round(job.progress * 100)}%`
      if (job.status === 'pending') return '排队中'
      return job.status
    }
    if (job.work_status === 'approved' || job.work_status === 'pending') return '已发布'
    if (job.work_status === 'rejected') return '已驳回'
    return undefined
  }

  const selected = selectedIndex !== null ? timeline[selectedIndex] : null
  const selectedBgmTrackId = currentProject?.bgm_track_id ?? null
  const hasBgmSelected = selectedBgmTrackId != null || Boolean(currentProject?.bgm_filename)
  const bgmControlsActive = bgmEnabled && hasBgmSelected

  const renderBatchExportCard = (job: ExportJob) => (
    <div key={job.id} className="export-icon-wrap">
      <VideoPreview
        videoUrl={job.stream_url}
        thumbUrl={job.thumb_url}
        downloadUrl={job.download_url}
        className="video-thumb-btn"
        imageClassName={thumbImageClass(job.thumb_url)}
        disabled={!job.stream_url}
        onDelete={() => void deleteExport(job.id)}
        hideCardMeta
      >
        {job.status !== 'done' && exportWorkBadge(job) && (
          <span className={`export-icon-badge status ${job.status}`}>
            {exportWorkBadge(job)}
          </span>
        )}
      </VideoPreview>
      <ExportRelativeTime createdAt={job.created_at} />
    </div>
  )

  const renderMediaCard = (job: ExportJob) => (
    <div key={job.id} className="export-icon-wrap">
      <VideoPreview
        videoUrl={job.stream_url}
        thumbUrl={job.thumb_url}
        downloadUrl={job.download_url}
        className="video-thumb-btn"
        imageClassName={thumbImageClass(job.thumb_url)}
        disabled={!job.stream_url}
        onDelete={() => void deleteExport(job.id)}
        resourceMeta={{
          productId: job.product_id,
          productName: job.product_name,
          tags: job.tags,
          onSave: async (data) => {
            await api.updateExport(job.id, data)
            if (currentProject) await loadProjectExports(currentProject.id)
          },
        }}
        modalFooter={
          canPublishExport(job) ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => publishExport(job.id, { skipConfirm: true })}
            >
              发布到作品
            </button>
          ) : job.work_status === 'approved' || job.work_status === 'pending' ? (
            <span className="muted">已发布至作品</span>
          ) : undefined
        }
      >
        {exportWorkBadge(job) && (
          <span
            className={`export-icon-badge ${
              job.status !== 'done'
                ? `status ${job.status}`
                : job.work_status === 'rejected'
                  ? 'status failed'
                  : job.work_status
                    ? 'status done'
                    : ''
            }`}
          >
            {exportWorkBadge(job)}
          </span>
        )}
      </VideoPreview>
      {canPublishExport(job) && (
        <div className="export-icon-actions">
          <button type="button" className="btn-link publish" onClick={() => publishExport(job.id)}>
            {job.work_status === 'rejected' ? '重新发布' : '发布'}
          </button>
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="script-editor-page concat-page">
        <div className="empty">加载脚本…</div>
      </div>
    )
  }

  return (
    <div className="script-editor-page concat-page">
      <div className="page-header">
        <div>
          <div className="script-editor-title-row">
            <h1 className="page-title script-editor-name">
              {projectName.trim() || '未命名脚本'}
            </h1>
            <button
              type="button"
              className="script-name-edit-btn"
              aria-label="编辑脚本名称"
              onClick={() => setNameModalOpen(true)}
            >
              ✎
            </button>
          </div>
        </div>
        <button type="button" className="btn btn-secondary page-header-action" onClick={() => void handleBack()}>
          返回列表
        </button>
      </div>

      {isBatch && (
        <div className="script-scenes-bar">
          <div className="script-scenes-tabs" role="tablist" aria-label="脚本场景">
            {scenes.map((scene) => (
              <div key={scene.id} className="script-scene-tab-wrap">
                <button
                  type="button"
                  role="tab"
                  aria-selected={scene.id === activeSceneId}
                  className={`script-scene-tab${scene.id === activeSceneId ? ' active' : ''}`}
                  onClick={() => switchScene(scene.id)}
                >
                  {scene.name}
                  {scene.timeline.length > 0 && (
                    <span className="script-scene-tab-count">{scene.timeline.length}</span>
                  )}
                </button>
                {scenes.length > 1 && (
                  <button
                    type="button"
                    className="script-scene-tab-delete"
                    aria-label={`删除${scene.name}`}
                    title="删除场景"
                    onClick={() => void deleteScene(scene.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addScene}>
            + 新增场景
          </button>
        </div>
      )}

      <div className="concat-layout">
        <div className="concat-main">
          <div className="card">
            <div className="video-timeline-wrap">
              <div className="video-timeline-stats">
                {isBatch ? (
                  <>
                    <span>
                      本场景 {timeline.length} 个备选
                      {batchPlan && (
                        <span className="muted" style={{ marginLeft: 8 }}>
                          全脚本 {formatSceneMultiply(batchPlan.sceneCounts)} ={' '}
                          {batchPlan.videoCount} 条成片
                        </span>
                      )}
                    </span>
                    {batchPlan && (
                      <span className="video-timeline-total">
                        单条约 {formatDuration(batchPlan.avgDurationMs)}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span>{timeline.length} 段</span>
                    <span className="video-timeline-total">
                      成片 {formatDuration(exportTotalMs)}
                      {hasFade && materialTotalMs !== exportTotalMs && (
                        <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                          （素材 {formatDuration(materialTotalMs)}，淡化重叠已扣除）
                        </span>
                      )}
                    </span>
                  </>
                )}
              </div>

              {timeline.length === 0 && (
                <div className="video-timeline-empty">
                  {isBatch
                    ? '从右侧勾选分镜，作为本场景的备选素材'
                    : '从右侧点击分镜添加到脚本'}
                </div>
              )}
            </div>

            {timeline.length > 0 && (
              <div className="script-timeline">
                <div className="script-timeline-label">时间轴 · 拖拽片段调整顺序</div>
                <div className="script-timeline-track">
                  {timeline.map((entry, index) => {
                    const playMs = timelineSegmentPlayMs(entry, index)
                    const isDragging = dragIndex === index
                    const isDropTarget =
                      overSlotIndex === index && dragIndex !== null && dragIndex !== index
                    return (
                      <div
                        key={entry.shot.id}
                        className={`script-timeline-slot${isDropTarget ? ' drop-target' : ''}`}
                        style={{ flexGrow: playMs, flexShrink: 1, flexBasis: 0 }}
                        onDragOver={(e) => handleSegmentDragOver(index, e)}
                        onDrop={(e) => handleSegmentDrop(index, e)}
                      >
                        {index > 0 && (
                          <button
                            type="button"
                            className={`script-timeline-joint ${entry.transition}`}
                            title={entry.transition === 'fade' ? '交叉淡化（点击切换为硬切）' : '硬切（点击切换为交叉淡化）'}
                            onClick={() =>
                              setTransition(index, entry.transition === 'cut' ? 'fade' : 'cut')
                            }
                          >
                            {entry.transition === 'fade' ? '⌒' : '|'}
                          </button>
                        )}
                        <button
                          type="button"
                          draggable
                          className={`script-timeline-segment ${selectedIndex === index ? 'selected' : ''}${isDragging ? ' dragging' : ''}`}
                          style={
                            {
                              '--seg-color': SEGMENT_COLORS[index % SEGMENT_COLORS.length],
                              backgroundImage: entry.shot.thumb_url
                                ? `url(${entry.shot.thumb_url})`
                                : undefined,
                            } as React.CSSProperties
                          }
                          title={`${entry.shot.name} · ${formatDuration(playMs)} · 拖拽调整顺序`}
                          onDragStart={(e) => handleSegmentDragStart(index, e)}
                          onDragEnd={handleSegmentDragEnd}
                          onClick={() => handleSegmentClick(index)}
                        >
                          <span className="script-timeline-seg-overlay" />
                          <span className="script-timeline-seg-index">{index + 1}</span>
                          <span className="script-timeline-seg-name">{entry.shot.name}</span>
                          <span className="script-timeline-seg-duration">{formatDuration(playMs)}</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div className="script-timeline-ruler">
                  <span>0:00</span>
                  <span>{formatDuration(exportTotalMs)}</span>
                </div>
              </div>
            )}

            {selected && selectedIndex !== null && (
              <div className="segment-editor card">
                <h3>第 {selectedIndex + 1} 段 · {selected.shot.name}</h3>
                <p className="muted">
                  时长 {formatDuration(selected.shot.duration_ms)}
                  {selectedIndex > 0 && (
                    <>
                      {' · '}与上一段过渡：
                      <select
                        className="select"
                        style={{ width: 'auto', display: 'inline-block', marginLeft: 8 }}
                        value={selected.transition}
                        onChange={(e) => setTransition(selectedIndex, e.target.value as TransitionType)}
                      >
                        <option value="cut">硬切</option>
                        <option value="fade">交叉淡化</option>
                      </select>
                    </>
                  )}
                </p>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-secondary" type="button" onClick={() => move(selectedIndex, -1)}>左移</button>
                  <button className="btn btn-secondary" type="button" onClick={() => move(selectedIndex, 1)}>右移</button>
                  <button className="btn btn-secondary" type="button" onClick={() => removeAt(selectedIndex)}>移除</button>
                </div>
              </div>
            )}

            {error && <p className="error">{error}</p>}

            <div className="audio-settings card">
              <div className={`audio-track-row${!includeShotAudio ? ' is-disabled' : ''}`}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={includeShotAudio}
                    onChange={(e) => setIncludeShotAudio(e.target.checked)}
                  />
                  <span>保留原声</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={Math.round(shotAudioVolume * 100)}
                  disabled={!includeShotAudio}
                  onInput={(e) => setShotAudioVolume(Number(e.currentTarget.value) / 100)}
                  className="audio-volume-slider"
                />
                <span className="audio-volume-pct">{Math.round(shotAudioVolume * 100)}%</span>
              </div>
              <div className={`audio-track-row${!bgmControlsActive ? ' is-disabled' : ''}`}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={bgmEnabled}
                    disabled={!hasBgmSelected || bgmUploading}
                    onChange={(e) => setBgmEnabled(e.target.checked)}
                  />
                  <span>背景音乐</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={Math.round(bgmVolume * 100)}
                  disabled={!bgmControlsActive || bgmUploading}
                  onInput={(e) => setBgmVolume(Number(e.currentTarget.value) / 100)}
                  className="audio-volume-slider"
                />
                <span className="audio-volume-pct">{Math.round(bgmVolume * 100)}%</span>
              </div>
              <select
                className="select audio-bgm-select"
                value={selectedBgmTrackId ?? ''}
                disabled={!isSaved || bgmUploading}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === BGM_IMPORT_VALUE) {
                    bgmInputRef.current?.click()
                    return
                  }
                  void handleBgmSelect(value ? Number(value) : null)
                }}
              >
                <option value={BGM_IMPORT_VALUE}>导入本机音乐…</option>
                <option value="">未选择</option>
                {bgmTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.original_name}
                  </option>
                ))}
              </select>
              <input
                ref={bgmInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg"
                className="audio-file-input"
                disabled={!isSaved || bgmUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleBgmUpload(file)
                }}
              />
              {!isSaved && (
                <p className="muted audio-bgm-hint">保存脚本后可选择背景音乐</p>
              )}
            </div>

            <div className="concat-export-actions">
              <div className="concat-export-actions-left">
                {isBatch ? (
                  <>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={!batchCanGenerate || batchGenerating}
                      onClick={() => {
                        setBatchProgress({ done: 0, total: batchPlan?.videoCount ?? 0 })
                        setBatchCountdownSec(0)
                        setBatchModalOpen(true)
                      }}
                      title={
                        !isSaved
                          ? '请先保存脚本'
                          : isDirty
                            ? '请先保存修改'
                            : !batchPlan
                              ? '请为每个场景添加至少一段素材'
                              : undefined
                      }
                    >
                      批量生成
                      {batchPlan ? `（${batchPlan.videoCount} 条）` : ''}
                    </button>
                    {batchPlan && (
                      <span className="muted batch-generate-inline-hint">
                        预计约 {Math.ceil(batchPlan.estimateProcessSec / 60)} 分钟
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={!isSaved || timeline.length === 0 || isDirty}
                      onClick={() => setPreviewOpen(true)}
                      title={!isSaved ? '请先保存脚本' : isDirty ? '请先保存修改' : undefined}
                    >
                      预览成片
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={!isSaved || timeline.length === 0 || isDirty}
                      onClick={async () => {
                        const n = await api.getNextExportName()
                        setNextExportName(n.name)
                        setExportModalOpen(true)
                      }}
                      title={!isSaved ? '请先保存脚本' : isDirty ? '请先保存修改' : undefined}
                    >
                      导出成片（{formatDuration(exportTotalMs)}）
                    </button>
                  </>
                )}
              </div>
              <button
                className="btn btn-primary"
                type="button"
                disabled={!isDirty || saving}
                onClick={() => void saveProject()}
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>

          <h3 style={{ marginTop: 24 }}>
            {isBatch ? '成片列表' : '成品'}
            {currentProject && (
              <span className="muted" style={{ fontWeight: 400, fontSize: 14, marginLeft: 8 }}>
                · {currentProject.name}
                {isBatch && jobs.length > 0 && ` · ${jobs.length} 条`}
              </span>
            )}
          </h3>
          {!isSaved ? (
            <div className="empty">
              {isBatch ? '保存脚本后可批量生成成片' : '保存脚本后可导出成片'}
            </div>
          ) : jobs.length === 0 ? (
            <div className="empty">
              {isBatch ? '点击「批量生成」交叉合成成片，完成后可在此播放' : '当前脚本暂无成品'}
            </div>
          ) : (
            <div className={`export-grid${isBatch ? ' batch-export-grid' : ''}`}>
              {jobs.map((job) => (isBatch ? renderBatchExportCard(job) : renderMediaCard(job)))}
            </div>
          )}
        </div>

        <aside className="concat-sidebar card">
          <h3>素材筛选</h3>
          <p className="muted">
            {isBatch
              ? '勾选加入当前场景备选，取消勾选则移除'
              : '勾选添加到时间轴末尾，取消勾选则移除'}
          </p>
          <div className="shot-picker-panel">
            <div className="shot-picker-filters">
            <label className="shots-library-filter">
              <FilterSelect
                value={productFilter}
                onChange={setProductFilter}
                options={[
                  {
                    value: '',
                    label: `全部产品 (${totalShots})`,
                    selectedCount: pickerSelectedCounts.total,
                  },
                  ...products.map((p) => ({
                    value: String(p.id),
                    label: `${p.name} (${p.stats.shots})`,
                    selectedCount: pickerSelectedCounts.byProduct.get(p.id) ?? 0,
                  })),
                ]}
              />
            </label>
            <label className="shots-library-filter">
              <FilterSelect
                value={nameFilter}
                onChange={setNameFilter}
                options={[
                  {
                    value: '',
                    label: '全部分镜',
                    selectedCount: pickerSelectedCounts.total,
                  },
                  ...shotNames.map((row) => ({
                    value: row.name,
                    label: shotNameWithCount(row.name, row.video_count),
                    selectedCount: pickerSelectedCounts.byName.get(row.name) ?? 0,
                  })),
                ]}
              />
            </label>
            <label className="shots-library-filter">
              <FilterSelect
                value={tagFilter}
                onChange={setTagFilter}
                options={[
                  {
                    value: '',
                    label: '全部标签',
                    selectedCount: pickerSelectedCounts.total,
                  },
                  ...tags.map((tag) => ({
                    value: tag.name,
                    label: tagWithCount(tag.name, tag.videos),
                    selectedCount: pickerSelectedCounts.byTag.get(tag.name) ?? 0,
                  })),
                ]}
              />
            </label>
            </div>
            <div className="shot-picker-list">
              {pickerShots.length === 0 ? (
                <div className="empty shot-picker-empty">
                  {hasPickerFilter ? '没有符合筛选条件的分镜' : '暂无可用分镜'}
                </div>
              ) : (
                <div className="shot-picker-grid">
                  {pickerShots.map((shot) => {
                    const inTimeline = timeline.some((t) => t.shot.id === shot.id)
                    const checkboxId = `shot-pick-${shot.id}`
                    return (
                      <div
                        key={shot.id}
                        className={`shot-picker-tile${inTimeline ? ' selected' : ''}`}
                      >
                        <div className="shot-picker-media">
                          <VideoPreview
                            videoUrl={shot.clip_url}
                            thumbUrl={shot.thumb_url}
                            durationMs={shot.duration_ms}
                            className="video-thumb-btn shot-picker-thumb"
                            imageClassName={thumbImageClass(shot.thumb_url)}
                            hideThumbOverlay
                            autoPlay
                          />
                          <label htmlFor={checkboxId} className="shot-picker-check-overlay">
                            <input
                              id={checkboxId}
                              type="checkbox"
                              className="shot-picker-checkbox"
                              checked={inTimeline}
                              onChange={(e) => togglePickerShot(shot, e.target.checked)}
                            />
                            <span className="shot-picker-check-mark" aria-hidden />
                          </label>
                        </div>
                        <span className="shot-picker-tile-name" title={shot.name}>
                          {shot.name}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <ScriptNameModal
        open={nameModalOpen}
        defaultName={projectName}
        onClose={() => setNameModalOpen(false)}
        onConfirm={setProjectName}
      />
      {!isBatch && (
        <ExportNameModal
          open={exportModalOpen}
          defaultName={nextExportName}
          submitting={exporting}
          onClose={() => !exporting && setExportModalOpen(false)}
          onConfirm={handleExportConfirm}
        />
      )}
      {isBatch && (
        <BatchGenerateModal
          open={batchModalOpen}
          plan={batchPlan}
          submitting={batchGenerating}
          progress={batchProgress}
          countdownSec={batchCountdownSec}
          error={error}
          onClose={() => {
            if (batchGenerating) return
            setBatchModalOpen(false)
          }}
          onConfirm={() => void handleBatchGenerateConfirm()}
        />
      )}
      {!isBatch && (
        <ConcatPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={projectName || '脚本'}
          projectId={currentProject?.id ?? null}
          expectedTotalMs={exportTotalMs}
          includeShotAudio={includeShotAudio}
          shotAudioVolume={shotAudioVolume}
          bgmEnabled={bgmEnabled}
          bgmVolume={bgmVolume}
          bgmUrl={currentProject?.bgm_url ?? null}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}
