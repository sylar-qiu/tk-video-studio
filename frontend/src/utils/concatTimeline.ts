import type { TransitionType } from '../api'

export const FADE_MS = 500

export interface TimelineSegment {
  transition: TransitionType
  duration_ms: number
}

export function segmentPlayMs(entry: TimelineSegment, index: number): number {
  let ms = entry.duration_ms
  if (index > 0 && entry.transition === 'fade') {
    ms -= FADE_MS
  }
  return Math.max(ms, 0)
}

export function calcExportDurationMs(segments: TimelineSegment[]): number {
  let total = 0
  segments.forEach((entry, index) => {
    total += segmentPlayMs(entry, index)
  })
  return Math.max(total, 0)
}

export function segmentExportStartMs(segments: TimelineSegment[], index: number): number {
  let start = 0
  for (let i = 0; i < index; i++) {
    if (i > 0 && segments[i].transition === 'fade') {
      start -= FADE_MS
    }
    start += segmentPlayMs(segments[i], i)
  }
  return Math.max(start, 0)
}
