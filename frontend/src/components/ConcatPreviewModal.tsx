import { useCallback, useEffect, useRef, useState } from 'react'
import { api, formatDuration } from '../api'
import Modal from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  projectId: number | null
  expectedTotalMs: number
  includeShotAudio: boolean
  shotAudioVolume: number
  bgmEnabled: boolean
  bgmVolume: number
  bgmUrl: string | null
}

type PreviewPhase = 'loading' | 'ready' | 'playing' | 'ended' | 'error'

function clampVolume(v: number): number {
  return Math.max(0, Math.min(v, 1))
}

function waitForMediaReady(media: HTMLMediaElement, timeoutMs = 60000): Promise<void> {
  if (media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('加载超时'))
    }, timeoutMs)
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('media load failed'))
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      media.removeEventListener('canplay', onReady)
      media.removeEventListener('error', onError)
    }
    media.addEventListener('canplay', onReady, { once: true })
    media.addEventListener('error', onError, { once: true })
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.trim()
    if (msg.startsWith('{')) {
      try {
        const parsed = JSON.parse(msg) as { detail?: string; error?: string }
        return parsed.detail || parsed.error || '预览准备失败'
      } catch {
        /* ignore */
      }
    }
    return msg || '预览准备失败'
  }
  return String(err)
}

export default function ConcatPreviewModal({
  open,
  onClose,
  title,
  projectId,
  expectedTotalMs,
  includeShotAudio,
  shotAudioVolume,
  bgmEnabled,
  bgmVolume,
  bgmUrl,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const bgmRef = useRef<HTMLAudioElement>(null)
  const prepareGenRef = useRef(0)
  const lastProgressPaintRef = useRef(0)

  const [phase, setPhase] = useState<PreviewPhase>('loading')
  const [prepareError, setPrepareError] = useState('')
  const [prepareProgress, setPrepareProgress] = useState('')
  const [buildProgress, setBuildProgress] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [totalMs, setTotalMs] = useState(0)
  const [positionMs, setPositionMs] = useState(0)

  const applyVideoVolume = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !includeShotAudio
    video.volume = includeShotAudio ? clampVolume(shotAudioVolume) : 0
  }, [includeShotAudio, shotAudioVolume])

  const pauseMedia = useCallback(() => {
    videoRef.current?.pause()
    bgmRef.current?.pause()
  }, [])

  const resetPlayback = useCallback(() => {
    pauseMedia()
    setPositionMs(0)
    const video = videoRef.current
    if (video) {
      try {
        video.currentTime = 0
      } catch {
        /* ignore */
      }
    }
    if (bgmRef.current) {
      bgmRef.current.currentTime = 0
    }
  }, [pauseMedia])

  useEffect(() => {
    if (!open) {
      prepareGenRef.current += 1
      resetPlayback()
      setPhase('loading')
      setPrepareError('')
      setPrepareProgress('')
      setBuildProgress(0)
      setPreviewUrl(null)
      setTotalMs(0)
      setPositionMs(0)
    }
  }, [open, resetPlayback])

  useEffect(() => {
    applyVideoVolume()
  }, [applyVideoVolume, phase])

  const preparePreview = useCallback(async () => {
    if (!projectId) {
      setPhase('error')
      setPrepareError('请先保存脚本')
      return
    }

    const gen = prepareGenRef.current + 1
    prepareGenRef.current = gen
    setPhase('loading')
    setPrepareError('')
    setPrepareProgress('')
    setBuildProgress(0)
    setPreviewUrl(null)
    resetPlayback()

    try {
      for (let attempt = 0; attempt < 300; attempt++) {
        if (gen !== prepareGenRef.current) return

        const preview = await api.getProjectPreview(projectId)
        if (gen !== prepareGenRef.current) return

        if (preview.status === 'ready' && preview.preview_url) {
          setBuildProgress(100)
          const video = videoRef.current
          if (!video) return

          video.src = preview.preview_url
          video.load()
          await waitForMediaReady(video)

          if (bgmEnabled && bgmUrl && bgmRef.current) {
            bgmRef.current.src = bgmUrl
            bgmRef.current.loop = true
            bgmRef.current.load()
            await waitForMediaReady(bgmRef.current)
          }

          if (gen !== prepareGenRef.current) return

          const fromFile = preview.duration_ms || Math.round(video.duration * 1000)
          const duration = fromFile > 0 ? fromFile : expectedTotalMs
          setTotalMs(duration)
          setPreviewUrl(preview.preview_url)
          applyVideoVolume()
          setPhase('ready')
          setPrepareProgress('')
          return
        }

        if (preview.status === 'error' || preview.status === 'empty') {
          throw new Error(preview.error || '预览不可用')
        }

        const pct = Math.min(Math.max(Math.round(preview.progress * 100), 0), 99)
        setBuildProgress(pct)
        setPrepareProgress(
          preview.status === 'building' ? `合成中 ${pct}%` : '准备中…',
        )
        await sleep(500)
      }

      throw new Error('预览生成超时，请重试')
    } catch (e) {
      if (gen !== prepareGenRef.current) return
      setPrepareError(formatError(e))
      setPhase('error')
    }
  }, [
    projectId,
    bgmEnabled,
    bgmUrl,
    resetPlayback,
    applyVideoVolume,
    expectedTotalMs,
  ])

  useEffect(() => {
    if (!open) return
    void preparePreview()
  }, [open, preparePreview])

  const startBgm = useCallback(async () => {
    const bgm = bgmRef.current
    if (!bgm || !bgmEnabled || !bgmUrl) return
    bgm.volume = clampVolume(bgmVolume)
    bgm.currentTime = 0
    await waitForMediaReady(bgm)
    await bgm.play()
  }, [bgmEnabled, bgmUrl, bgmVolume])

  const startPlayback = useCallback(async () => {
    if (phase !== 'ready' && phase !== 'ended') return

    const video = videoRef.current
    if (!video || !previewUrl) return

    resetPlayback()
    setPhase('playing')

    try {
      applyVideoVolume()
      await startBgm()
      await video.play()
    } catch {
      setPhase('ready')
    }
  }, [phase, previewUrl, resetPlayback, applyVideoVolume, startBgm])

  const syncBgmToVideo = useCallback((video: HTMLVideoElement) => {
    const bgm = bgmRef.current
    if (!bgm || !bgmEnabled || !bgmUrl || bgm.paused) return
    const drift = Math.abs(bgm.currentTime - video.currentTime)
    if (drift > 0.2) {
      try {
        bgm.currentTime = video.currentTime
      } catch {
        /* ignore */
      }
    }
  }, [bgmEnabled, bgmUrl])

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || phase !== 'playing') return

    const now = performance.now()
    const ms = Math.min(video.currentTime * 1000, totalMs)
    if (now - lastProgressPaintRef.current >= 120) {
      lastProgressPaintRef.current = now
      setPositionMs(ms)
    }
    syncBgmToVideo(video)
  }, [phase, totalMs, syncBgmToVideo])

  const handleEnded = useCallback(() => {
    pauseMedia()
    setPositionMs(totalMs)
    setPhase('ended')
  }, [pauseMedia, totalMs])

  const progressPct = totalMs > 0 ? Math.min((positionMs / totalMs) * 100, 100) : 0

  const playerOverlay = () => {
    if (!projectId) {
      return <div className="concat-preview-overlay empty">请先保存脚本</div>
    }
    if (phase === 'loading') {
      return (
        <div className="concat-preview-overlay">
          <span className="concat-preview-spinner" aria-hidden />
          <span>{prepareProgress || '正在准备预览…'}</span>
          <div className="concat-preview-build-progress">
            <div className="concat-preview-build-progress-track">
              <div
                className="concat-preview-build-progress-fill"
                style={{ width: `${Math.max(buildProgress, 4)}%` }}
              />
            </div>
          </div>
          <span className="muted concat-preview-build-hint">合成完成后可播放</span>
        </div>
      )
    }
    if (phase === 'error') {
      return (
        <div className="concat-preview-overlay">
          <span className="error">{prepareError || '预览准备失败'}</span>
          <button
            type="button"
            className="btn btn-secondary concat-preview-overlay-btn"
            onClick={() => void preparePreview()}
          >
            重试
          </button>
        </div>
      )
    }
    if (phase === 'ready') {
      return (
        <button
          type="button"
          className="concat-preview-action-overlay"
          onClick={() => void startPlayback()}
          aria-label="播放预览"
        >
          <span className="video-modal-play-overlay-icon" aria-hidden />
        </button>
      )
    }
    if (phase === 'ended') {
      return (
        <button
          type="button"
          className="concat-preview-action-overlay"
          onClick={() => void startPlayback()}
          aria-label="重新播放"
        >
          <span className="video-modal-play-overlay-icon" aria-hidden />
          <span className="concat-preview-action-label">重新播放</span>
        </button>
      )
    }
    return null
  }

  return (
    <Modal open={open} title={`预览 · ${title}`} onClose={onClose} size="video">
      <div className="concat-preview-body">
        <div className="concat-preview-player">
          <video
            ref={videoRef}
            className="concat-preview-video is-active"
            playsInline
            preload="auto"
            disablePictureInPicture
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
          />
          {playerOverlay()}
        </div>

        {bgmUrl && (
          <audio ref={bgmRef} preload="auto" className="concat-preview-bgm" />
        )}

        <div className="concat-preview-controls">
          <div className="concat-preview-progress-wrap">
            <div className="concat-preview-progress-track">
              <div
                className="concat-preview-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="concat-preview-time muted">
              {formatDuration(Math.round(positionMs))} / {formatDuration(totalMs)}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
