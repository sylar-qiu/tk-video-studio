export function tagWithCount(name: string, videos?: number): string {
  if (videos != null && videos > 0) return `${name} (${videos})`
  return name
}

export function shotNameWithCount(name: string, videoCount?: number): string {
  if (videoCount != null && videoCount > 0) return `${name} (${videoCount})`
  return name
}

export function buildTagVideoMap(tags: { name: string; videos: number }[]): Map<string, number> {
  return new Map(tags.map((t) => [t.name, t.videos]))
}
