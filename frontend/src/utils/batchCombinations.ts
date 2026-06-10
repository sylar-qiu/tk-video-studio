import { calcExportDurationMs } from './concatTimeline'
import type { ConcatItem } from '../api'
import type { SceneTimelineEntry } from './scriptScenes'

function cartesian<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return []
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap((prefix) => arr.map((item) => [...prefix, item])),
    [[]],
  )
}

export interface BatchCombinationPlan {
  combinations: SceneTimelineEntry[][]
  itemsList: ConcatItem[][]
  videoCount: number
  sceneCounts: number[]
  avgDurationMs: number
  minDurationMs: number
  maxDurationMs: number
  estimateProcessSec: number
}

function comboToItems(combo: SceneTimelineEntry[]): ConcatItem[] {
  return combo.map((entry, index) => ({
    shot_id: entry.shot.id,
    transition: index === 0 ? 'cut' : 'cut',
  }))
}

function comboDurationMs(combo: SceneTimelineEntry[]): number {
  return calcExportDurationMs(
    combo.map((entry) => ({
      transition: 'cut' as const,
      duration_ms: entry.shot.clip_duration_ms ?? entry.shot.duration_ms,
    })),
  )
}

/** 各场景素材做笛卡尔积，每个成片从每个场景各取一段拼接。 */
export function buildBatchCombinationPlan(
  scenes: { timeline: SceneTimelineEntry[] }[],
): BatchCombinationPlan | null {
  if (scenes.length === 0) return null
  const sceneCounts = scenes.map((s) => s.timeline.length)
  if (sceneCounts.some((n) => n < 1)) return null

  const combinations = cartesian(scenes.map((s) => s.timeline))
  const durations = combinations.map(comboDurationMs)
  const totalMs = durations.reduce((sum, ms) => sum + ms, 0)
  const videoCount = combinations.length
  const avgDurationMs = videoCount > 0 ? Math.round(totalMs / videoCount) : 0
  const minDurationMs = durations.length ? Math.min(...durations) : 0
  const maxDurationMs = durations.length ? Math.max(...durations) : 0

  // 粗估：每条成片约 20s 合成 + 0.6×成片时长
  const estimateProcessSec = Math.max(
    30,
    Math.ceil(videoCount * 20 + (totalMs / 1000) * 0.6),
  )

  return {
    combinations,
    itemsList: combinations.map(comboToItems),
    videoCount,
    sceneCounts,
    avgDurationMs,
    minDurationMs,
    maxDurationMs,
    estimateProcessSec,
  }
}

export function formatSceneMultiply(counts: number[]): string {
  return counts.map((n) => n).join(' × ')
}
