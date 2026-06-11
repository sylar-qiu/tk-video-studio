/** True when [aStart, aEnd) overlaps [bStart, bEnd). */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export function findOverlappingShots<T extends { start_ms: number; end_ms: number }>(
  shots: T[],
  startMs: number,
  endMs: number,
): T[] {
  return shots.filter((shot) => rangesOverlap(startMs, endMs, shot.start_ms, shot.end_ms))
}
