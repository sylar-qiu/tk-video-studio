const THUMB_W = 360
const THUMB_H = 640

export interface VideoThumbResult {
  thumbUrl: string
  durationMs: number
}

export function captureVideoThumbnail(file: File, atMs = 0): Promise<VideoThumbResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    const objectUrl = URL.createObjectURL(file)

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      video.removeAttribute('src')
      video.load()
    }

    video.onerror = () => {
      cleanup()
      reject(new Error('无法读取视频'))
    }

    video.onloadedmetadata = () => {
      const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0
      const seekSec =
        atMs > 0
          ? Math.min(atMs / 1000, Math.max(video.duration - 0.05, 0))
          : Math.min(0.1, Math.max(video.duration / 2, 0))

      video.onseeked = () => {
        try {
          const vw = video.videoWidth
          const vh = video.videoHeight
          if (!vw || !vh) {
            cleanup()
            reject(new Error('无法获取视频尺寸'))
            return
          }
          const canvas = document.createElement('canvas')
          canvas.width = THUMB_W
          canvas.height = THUMB_H
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            cleanup()
            reject(new Error('无法生成缩略图'))
            return
          }
          const scale = Math.max(THUMB_W / vw, THUMB_H / vh)
          const dw = vw * scale
          const dh = vh * scale
          const dx = (THUMB_W - dw) / 2
          const dy = (THUMB_H - dh) / 2
          ctx.fillStyle = '#000'
          ctx.fillRect(0, 0, THUMB_W, THUMB_H)
          ctx.drawImage(video, dx, dy, dw, dh)
          const thumbUrl = canvas.toDataURL('image/jpeg', 0.85)
          cleanup()
          resolve({ thumbUrl, durationMs })
        } catch (e) {
          cleanup()
          reject(e)
        }
      }

      video.currentTime = seekSec
    }

    video.src = objectUrl
  })
}
