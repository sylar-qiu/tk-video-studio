import { useEffect, useState } from 'react'
import Modal from './Modal'
import ModalFooter from './ModalFooter'
import { formatDuration } from '../api'
import type { BatchCombinationPlan } from '../utils/batchCombinations'
import { formatSceneMultiply } from '../utils/batchCombinations'

type Phase = 'confirm' | 'generating' | 'done'

interface BatchGenerateModalProps {
  open: boolean
  plan: BatchCombinationPlan | null
  submitting: boolean
  progress: { done: number; total: number }
  countdownSec: number
  error?: string
  onClose: () => void
  onConfirm: () => void
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatEstimateRange(minMs: number, maxMs: number): string {
  if (minMs === maxMs) return formatDuration(minMs)
  return `${formatDuration(minMs)} ~ ${formatDuration(maxMs)}`
}

export default function BatchGenerateModal({
  open,
  plan,
  submitting,
  progress,
  countdownSec,
  error,
  onClose,
  onConfirm,
}: BatchGenerateModalProps) {
  const [phase, setPhase] = useState<Phase>('confirm')

  useEffect(() => {
    if (open) setPhase('confirm')
  }, [open])

  useEffect(() => {
    if (!submitting && progress.total > 0 && progress.done >= progress.total) {
      setPhase('done')
    } else if (submitting) {
      setPhase('generating')
    }
  }, [submitting, progress])

  const canClose = phase !== 'generating' || !submitting
  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0

  return (
    <Modal
      open={open}
      title={phase === 'confirm' ? '批量生成' : phase === 'generating' ? '正在批量生成' : '生成完成'}
      onClose={onClose}
      closeOnBackdrop={canClose}
      closeOnEscape={canClose}
      footer={
        phase === 'confirm' ? (
          <ModalFooter>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!plan || plan.videoCount < 1}
              onClick={onConfirm}
            >
              开始生成
            </button>
          </ModalFooter>
        ) : phase === 'done' ? (
          <ModalFooter>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              完成
            </button>
          </ModalFooter>
        ) : undefined
      }
    >
      {!plan ? (
        <p className="muted">请先为每个场景添加至少一段素材</p>
      ) : phase === 'confirm' ? (
        <div className="batch-generate-summary">
          <p className="batch-generate-highlight">
            将生成 <strong>{plan.videoCount}</strong> 个成片
          </p>
          <p className="muted">
            场景组合：{formatSceneMultiply(plan.sceneCounts)} = {plan.videoCount}
          </p>
          <p className="muted">
            单条时长约 {formatEstimateRange(plan.minDurationMs, plan.maxDurationMs)}
            {plan.minDurationMs !== plan.maxDurationMs && (
              <>（平均 {formatDuration(plan.avgDurationMs)}）</>
            )}
          </p>
          <p className="muted">
            预计总耗时约 {formatCountdown(plan.estimateProcessSec)}，提交后可在下方列表查看进度
          </p>
        </div>
      ) : (
        <div className="batch-generate-progress">
          <div className="batch-generate-countdown" aria-live="polite">
            <span className="batch-generate-countdown-value">
              {formatCountdown(Math.max(0, countdownSec))}
            </span>
            <span className="muted">预计剩余</span>
          </div>
          <p>
            已提交 {progress.done} / {progress.total} 个成片任务
          </p>
          <div className="batch-generate-progress-track">
            <div className="batch-generate-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="muted batch-generate-hint">
            {phase === 'generating'
              ? '任务提交完成后将自动关闭，成片在页面下方列表中合成与播放'
              : `全部 ${progress.total} 个任务已提交，请在列表中查看合成进度`}
          </p>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
