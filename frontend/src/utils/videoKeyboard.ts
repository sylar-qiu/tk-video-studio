import { useEffect, useRef } from 'react'

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function isSpaceKey(e: KeyboardEvent): boolean {
  return e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar'
}

export type VideoToggleResult = 'play' | 'pause' | 'replay'

/** Space: pause if playing, play if paused, replay from start if ended. */
export function toggleHtmlVideoPlayback(video: HTMLVideoElement): VideoToggleResult {
  const atEnd =
    video.ended ||
    (Number.isFinite(video.duration) &&
      video.duration > 0 &&
      video.currentTime >= video.duration - 0.05)

  if (atEnd) {
    video.currentTime = 0
    void video.play()
    return 'replay'
  }
  if (video.paused) {
    void video.play()
    return 'play'
  }
  video.pause()
  return 'pause'
}

export function useVideoSpacebar(active: boolean, onSpace: (e: KeyboardEvent) => void) {
  const handlerRef = useRef(onSpace)
  handlerRef.current = onSpace

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isSpaceKey(e)) return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      handlerRef.current(e)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active])
}
