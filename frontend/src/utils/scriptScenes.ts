import type { Shot, TransitionType } from '../api'

export interface SceneTimelineEntry {
  shot: Shot
  transition: TransitionType
}

export interface SceneState {
  id: string
  name: string
  timeline: SceneTimelineEntry[]
}

export function createDefaultBatchScenes(): SceneState[] {
  return [
    { id: 'scene-1', name: '场景 1', timeline: [] },
    { id: 'scene-2', name: '场景 2', timeline: [] },
  ]
}

export function nextSceneId(): string {
  return `scene-${Date.now()}`
}

export function nextSceneName(count: number): string {
  return `场景 ${count}`
}
