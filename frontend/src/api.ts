export interface TagResourceCounts {
  assets: number
  shots: number
  exports: number
  works: number
  products: number
}

export interface TagInfo {
  name: string
  counts: TagResourceCounts
  videos: number
}

export interface TagStats {
  name: string
  counts: TagResourceCounts
  videos: number
  total: number
}

export interface ShotNameInfo {
  name: string
  video_count: number
}

export interface Asset {
  id: number
  product_id: number | null
  product_name: string | null
  filename: string
  original_name: string
  duration_ms: number
  width: number
  height: number
  file_size: number
  tags: string[]
  created_at: string
  proxy_url: string | null
  thumb_url: string | null
}

export interface Shot {
  id: number
  asset_id: number
  product_id: number | null
  product_name: string | null
  name: string
  start_ms: number
  end_ms: number
  tags: string[]
  thumb_url: string | null
  clip_url: string | null
  status: string
  duration_ms: number
  clip_duration_ms: number | null
  created_at: string
  asset_name: string | null
}

export interface ExportJob {
  id: number
  name: string
  project_id: number | null
  product_id: number | null
  product_name: string | null
  tags: string[]
  status: string
  progress: number
  error: string
  stream_url: string | null
  download_url: string | null
  thumb_url: string | null
  work_id: number | null
  work_status: string | null
  created_at: string
}

export type WorkStatus = 'pending' | 'approved' | 'rejected'

export interface Work {
  id: number
  name: string
  status: WorkStatus
  project_id: number | null
  project_name: string | null
  product_id: number | null
  product_name: string | null
  tags: string[]
  export_job_id: number
  stream_url: string | null
  download_url: string | null
  thumb_url: string | null
  created_at: string
  reviewed_at: string | null
}

export interface ProductStats {
  assets: number
  shots: number
  exports: number
  works: number
}

export interface Product {
  id: number
  name: string
  category_id: number | null
  category_path: string | null
  tags: string[]
  stats: ProductStats
  created_at: string
}

export interface Category {
  id: number
  name: string
  parent_id: number | null
  sort_order: number
  path: string
  children: Category[]
}

export type ProjectPreviewStatus = 'empty' | 'missing' | 'building' | 'ready' | 'error'

export interface ProjectPreview {
  status: ProjectPreviewStatus
  preview_url: string | null
  progress: number
  error: string
  duration_ms: number
}

export interface BgmTrack {
  id: number
  original_name: string
  created_at: string
}

export interface ConcatProject {
  id: number
  name: string
  items: ConcatItem[]
  scenes?: ScriptScene[]
  duration_ms: number
  shot_count: number
  include_shot_audio: boolean
  shot_audio_volume: number
  bgm_enabled: boolean
  bgm_track_id: number | null
  bgm_filename: string | null
  bgm_original_name: string | null
  bgm_volume: number
  bgm_url: string | null
  source: 'manual' | 'batch'
  updated_at: string
  created_at: string
}

export type TransitionType = 'cut' | 'fade'

export interface ConcatItem {
  shot_id: number
  transition: TransitionType
}

export interface ScriptScene {
  id: string
  name: string
  items: ConcatItem[]
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  return res.json()
}

const BEIJING_TZ = 'Asia/Shanghai'
const BEIJING_OFFSET = '+08:00'

/** 解析 API 返回的时间（带 +08:00 或 legacy 无时区） */
export function parseApiDateTime(iso: string): number {
  const s = iso.trim()
  if (!s) return Number.NaN
  const parsed = new Date(s).getTime()
  if (!Number.isNaN(parsed)) return parsed
  const normalized = s.includes('T') ? s : s.replace(' ', 'T')
  return new Date(`${normalized}${BEIJING_OFFSET}`).getTime()
}

/** 当前北京时间对应的时刻（Unix 毫秒） */
export function beijingNowMs(): number {
  return Date.now()
}

export function formatDateTime(iso: string): string {
  const ms = parseApiDateTime(iso)
  if (Number.isNaN(ms)) return iso
  return new Date(ms).toLocaleString('zh-CN', {
    timeZone: BEIJING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeTime(iso: string, now = beijingNowMs()): string {
  const created = parseApiDateTime(iso)
  if (Number.isNaN(created)) return iso

  const diffMs = now - created
  if (diffMs < 0) return '刚刚'

  const minutes = Math.floor(diffMs / 60_000)
  const hours = Math.floor(diffMs / 3_600_000)
  const days = Math.floor(diffMs / 86_400_000)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  if (months < 12) return `${months}月前`
  return `${Math.max(1, years)}年前`
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  if (minutes === 0) return `${seconds}秒`
  if (seconds === 0) return `${minutes}分`
  return `${minutes}分${seconds}秒`
}

/** @deprecated Use formatDuration for display */
export function formatMs(ms: number): string {
  return formatDuration(ms)
}

export const api = {
  listAssets: (opts?: { productId?: number; tag?: string }) => {
    const params = new URLSearchParams()
    if (opts?.productId != null) params.set('product_id', String(opts.productId))
    if (opts?.tag) params.set('tag', opts.tag)
    const qs = params.toString()
    return request<Asset[]>(qs ? `/api/assets?${qs}` : '/api/assets')
  },
  uploadAsset: (file: File, productId: number, tags?: string[]) => {
    const form = new FormData()
    form.append('file', file)
    form.append('product_id', String(productId))
    if (tags?.length) form.append('tags', tags.join(','))
    return request<Asset>('/api/assets/upload', { method: 'POST', body: form })
  },
  updateAsset: (id: number, data: { product_id?: number | null; tags?: string[] }) =>
    request<Asset>(`/api/assets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteAsset: (id: number) =>
    request<{ ok: boolean }>(`/api/assets/${id}`, { method: 'DELETE' }),
  getAssetStream: (id: number) => `/api/assets/${id}/stream`,

  listTags: () => request<TagInfo[]>('/api/tags'),
  createTag: (name: string) =>
    request<{ name: string }>('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  listTagStats: () => request<TagStats[]>('/api/tags/stats'),

  listShots: (opts?: {
    tag?: string
    taggedOnly?: boolean
    readyOnly?: boolean
    assetId?: number
    productId?: number
    name?: string
  }) => {
    const params = new URLSearchParams()
    if (opts?.tag) params.set('tag', opts.tag)
    if (opts?.taggedOnly) params.set('tagged_only', 'true')
    if (opts?.readyOnly) params.set('ready_only', 'true')
    if (opts?.assetId != null) params.set('asset_id', String(opts.assetId))
    if (opts?.productId != null) params.set('product_id', String(opts.productId))
    if (opts?.name) params.set('name', opts.name)
    const qs = params.toString()
    return request<Shot[]>(qs ? `/api/shots?${qs}` : '/api/shots')
  },
  listShotNames: (opts?: { productId?: number; tag?: string }) => {
    const params = new URLSearchParams()
    if (opts?.productId != null) params.set('product_id', String(opts.productId))
    if (opts?.tag) params.set('tag', opts.tag)
    const qs = params.toString()
    return request<ShotNameInfo[]>(qs ? `/api/shots/names?${qs}` : '/api/shots/names')
  },
  createShot: (data: {
    asset_id: number
    name: string
    start_ms: number
    end_ms: number
    tags: string[]
    product_id?: number | null
  }) =>
    request<Shot>('/api/shots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateShot: (id: number, data: { name?: string; tags?: string[]; product_id?: number | null }) =>
    request<Shot>(`/api/shots/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteShot: (id: number) =>
    request<{ ok: boolean }>(`/api/shots/${id}`, { method: 'DELETE' }),

  listProjects: () => request<ConcatProject[]>('/api/projects'),
  createProject: (opts?: { name?: string; source?: 'manual' | 'batch' }) =>
    request<ConcatProject>('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(opts?.name ? { name: opts.name } : {}),
        ...(opts?.source ? { source: opts.source } : {}),
      }),
    }),
  getProject: (id: number) => request<ConcatProject>(`/api/projects/${id}`),
  updateProject: (
    id: number,
    data: {
      name?: string
      items?: ConcatItem[]
      scenes?: ScriptScene[]
      include_shot_audio?: boolean
      shot_audio_volume?: number
      bgm_enabled?: boolean
      bgm_volume?: number
    },
  ) =>
    request<ConcatProject>(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  uploadProjectBgm: async (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/projects/${id}/bgm`, { method: 'POST', body: form })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || res.statusText)
    }
    return res.json() as Promise<ConcatProject>
  },
  listBgmTracks: () => request<BgmTrack[]>('/api/bgm'),
  uploadBgmTrack: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/bgm', { method: 'POST', body: form })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || res.statusText)
    }
    return res.json() as Promise<BgmTrack>
  },
  selectProjectBgm: (projectId: number, trackId: number | null) =>
    request<ConcatProject>(`/api/projects/${projectId}/bgm/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: trackId }),
    }),
  deleteProjectBgm: (id: number) =>
    request<ConcatProject>(`/api/projects/${id}/bgm`, { method: 'DELETE' }),
  deleteProject: (id: number) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  getProjectPreview: (id: number) =>
    request<ProjectPreview>(`/api/projects/${id}/preview`),

  getNextExportName: () => request<{ name: string }>('/api/exports/next-name'),

  createExport: (
    name: string,
    projectId: number,
    items: ConcatItem[],
    productId?: number | null,
  ) =>
    request<ExportJob>('/api/exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, project_id: projectId, items, product_id: productId }),
    }),
  updateExport: (id: number, data: { product_id?: number | null; tags?: string[] }) =>
    request<ExportJob>(`/api/exports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  listExports: (opts?: { projectId?: number; productId?: number; tag?: string }) => {
    const params = new URLSearchParams()
    if (opts?.projectId != null) params.set('project_id', String(opts.projectId))
    if (opts?.productId != null) params.set('product_id', String(opts.productId))
    if (opts?.tag) params.set('tag', opts.tag)
    const qs = params.toString()
    return request<ExportJob[]>(qs ? `/api/exports?${qs}` : '/api/exports')
  },
  deleteExport: (id: number) =>
    request<{ ok: boolean }>(`/api/exports/${id}`, { method: 'DELETE' }),
  publishExport: (id: number) =>
    request<Work>(`/api/exports/${id}/publish`, { method: 'POST' }),

  listWorks: (opts?: { status?: WorkStatus; productId?: number; tag?: string }) => {
    const params = new URLSearchParams()
    if (opts?.status) params.set('status', opts.status)
    if (opts?.productId != null) params.set('product_id', String(opts.productId))
    if (opts?.tag) params.set('tag', opts.tag)
    const qs = params.toString()
    return request<Work[]>(qs ? `/api/works?${qs}` : '/api/works')
  },
  updateWork: (id: number, data: { product_id?: number | null; tags?: string[] }) =>
    request<Work>(`/api/works/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  reviewWork: (id: number, action: 'approve' | 'reject') =>
    request<Work>(`/api/works/${id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }),
  deleteWork: (id: number) =>
    request<{ ok: boolean }>(`/api/works/${id}`, { method: 'DELETE' }),

  listProducts: () => request<Product[]>('/api/products'),
  createProduct: (data: { name: string; category_id?: number | null; tags?: string[] }) =>
    request<Product>('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateProduct: (
    id: number,
    data: { name?: string; category_id?: number | null; tags?: string[] },
  ) =>
    request<Product>(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteProduct: (id: number) =>
    request<{ ok: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),

  listCategories: () => request<Category[]>('/api/categories'),
  createCategory: (data: { name: string; parent_id?: number | null; sort_order?: number }) =>
    request<Category>('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: number) =>
    request<{ ok: boolean }>(`/api/categories/${id}`, { method: 'DELETE' }),
}
