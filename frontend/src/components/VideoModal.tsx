import { useEffect, useRef, useState, type ReactNode } from 'react'
import Modal from './Modal'

interface VideoModalProps {
  open: boolean
  title: string
  url: string | null
  downloadUrl?: string | null
  onClose: () => void
  meta?: ReactNode
  footer?: ReactNode
  autoPlay?: boolean
}

export default function VideoModal({
  open,
  title,
  url,
  downloadUrl,
  onClose,
  meta,
  footer,
  autoPlay = false,
}: VideoModalProps) {
  const [started, setStarted] = useState(autoPlay)
  const videoRef = useRef<HTMLVideoElement>(null)
  const showActions = !!(downloadUrl || footer)

  useEffect(() => {
    if (!open) setStarted(autoPlay)
  }, [open, autoPlay])

  useEffect(() => {
    setStarted(autoPlay)
  }, [url, autoPlay])

  useEffect(() => {
    if (!open || !autoPlay || !url) return
    void videoRef.current?.play()
  }, [open, autoPlay, url])

  const handleStartPlay = () => {
    setStarted(true)
    void videoRef.current?.play()
  }

  return (
    <Modal open={open} title={title} onClose={onClose} size="video">
      <div className="video-modal-body">
        {url ? (
          <div className="video-modal-player-wrap">
            <video
              ref={videoRef}
              key={url}
              src={url}
              controls
              playsInline
              className="video-modal-player"
            />
            {!started && !autoPlay && (
              <button
                type="button"
                className="video-modal-play-overlay"
                onClick={handleStartPlay}
                aria-label="播放视频"
              >
                <span className="video-modal-play-overlay-icon" aria-hidden />
              </button>
            )}
          </div>
        ) : (
          <div className="empty">视频暂不可用</div>
        )}
        {meta && <div className="video-modal-meta">{meta}</div>}
        {showActions && (
          <div className="video-modal-actions">
            {footer}
            {downloadUrl && (
              <a className="btn btn-secondary" href={downloadUrl} download>
                下载
              </a>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
