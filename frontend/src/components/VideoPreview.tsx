import { useState, type ReactNode } from 'react'
import { formatDuration } from '../api'
import { resourceMetaTitle, type ResourceMetaConfig } from '../types/resourceMeta'
import EditResourceMetaModal from './EditResourceMetaModal'
import ResourceMetaBreadcrumb from './ResourceMetaBreadcrumb'
import VideoModal from './VideoModal'

export interface VideoPreviewProps {
  title?: string
  videoUrl: string | null
  thumbUrl?: string | null
  durationMs?: number
  downloadUrl?: string | null
  className?: string
  imageClassName?: string
  disabled?: boolean
  ariaLabel?: string
  children?: ReactNode
  modalFooter?: ReactNode
  resourceMeta?: ResourceMetaConfig
  onDelete?: () => void
  hideCardMeta?: boolean
  hideThumbOverlay?: boolean
  autoPlay?: boolean
}

export default function VideoPreview({
  title,
  videoUrl,
  thumbUrl,
  durationMs,
  downloadUrl,
  className = '',
  imageClassName = '',
  disabled = false,
  ariaLabel,
  children,
  modalFooter,
  resourceMeta,
  onDelete,
  hideCardMeta = false,
  hideThumbOverlay = false,
  autoPlay = false,
}: VideoPreviewProps) {
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const canPlay = !!videoUrl && !disabled
  const modalTitle = title ?? resourceMetaTitle(resourceMeta)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (canPlay) setOpen(true)
  }

  const breadcrumb = resourceMeta ? (
    <ResourceMetaBreadcrumb
      productName={resourceMeta.productName}
      shotName={resourceMeta.shotName}
      tags={resourceMeta.tags}
    />
  ) : null

  const modalFooterContent = (
    <>
      {resourceMeta && canPlay && (
        <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(true)}>
          编辑属性
        </button>
      )}
      {modalFooter}
    </>
  )

  return (
    <div className="video-preview-wrap">
      <button
        type="button"
        className={`video-preview ${canPlay ? 'video-preview-playable' : ''} ${className}`.trim()}
        onClick={handleClick}
        disabled={!canPlay}
        aria-label={ariaLabel ?? (canPlay ? `播放 ${modalTitle}` : modalTitle)}
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className={imageClassName || undefined} />
        ) : (
          <div className={`video-preview-placeholder ${imageClassName}`.trim()} />
        )}
        {canPlay && !hideThumbOverlay && <span className="video-preview-play-icon" aria-hidden />}
        {durationMs != null && durationMs > 0 && !hideThumbOverlay && (
          <span className="video-preview-duration">{formatDuration(durationMs)}</span>
        )}
        {children}
      </button>
      {onDelete && (
        <button
          type="button"
          className="video-thumb-delete"
          aria-label="删除"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          ×
        </button>
      )}
      {breadcrumb && !hideCardMeta && breadcrumb}
      <VideoModal
        open={open}
        title={modalTitle}
        url={videoUrl}
        downloadUrl={downloadUrl}
        onClose={() => setOpen(false)}
        meta={breadcrumb}
        footer={modalFooterContent}
        autoPlay={autoPlay}
      />
      {resourceMeta && (
        <EditResourceMetaModal
          open={editOpen}
          productId={resourceMeta.productId}
          shotName={resourceMeta.shotName}
          tags={resourceMeta.tags}
          editableShotName={resourceMeta.editableShotName}
          onClose={() => setEditOpen(false)}
          onSave={async (data) => {
            await resourceMeta.onSave(data)
            setEditOpen(false)
          }}
        />
      )}
    </div>
  )
}
