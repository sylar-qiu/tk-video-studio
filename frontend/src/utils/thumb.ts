export function thumbImageClass(hasThumb?: string | boolean | null): string {
  return hasThumb ? 'video-thumb' : 'video-thumb video-thumb-empty'
}
