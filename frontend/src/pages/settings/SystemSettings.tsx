import { useEffect, useState } from 'react'
import { api, type SystemInfo } from '../../api'

export default function SystemSettings() {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getSystemInfo()
      .then(setInfo)
      .catch((e) => setError(String(e)))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!info) return <div className="empty">加载中…</div>

  const rows: { label: string; value: string | number | null | undefined }[] = [
    { label: '配置文件', value: info.config_path ?? '（未找到，使用内置默认值）' },
    { label: '视频数据目录', value: info.data_dir },
    { label: '后端地址', value: `${info.backend_host}:${info.backend_port}` },
    { label: '邀请码登录', value: info.auth_required ? '已启用' : '未启用' },
    { label: '前端 dev 地址', value: `${info.frontend_host}:${info.frontend_port}` },
    { label: '运行平台', value: info.platform },
    { label: 'Python', value: info.python },
    { label: 'FFmpeg 配置', value: info.ffmpeg ?? '（PATH 自动查找）' },
    { label: 'FFmpeg 实际路径', value: info.ffmpeg_resolved ?? '未找到' },
    { label: 'ffprobe 实际路径', value: info.ffprobe_resolved ?? '未找到' },
  ]

  return (
    <div className="card system-settings">
      <h2>系统信息</h2>
      <p className="muted system-settings-hint">
        以下项来自部署配置 <code>studio.config.json</code>（或环境变量），仅供核对，不能在此修改。
        未配置时默认：Linux <code>/data/tk-video-studio</code>，Windows{' '}
        <code>C:/data/tk-video-studio</code>。业务设置请用「类目管理」「标签管理」。
      </p>
      <dl className="system-settings-dl">
        {rows.map((row) => (
          <div key={row.label} className="system-settings-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
