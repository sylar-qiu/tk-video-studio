export interface ResourceMetaSaveData {
  product_id?: number | null
  tags?: string[]
  name?: string
}

export interface ResourceMetaConfig {
  productId: number | null
  productName?: string | null
  shotName?: string | null
  tags: string[]
  editableShotName?: boolean
  onSave: (data: ResourceMetaSaveData) => Promise<void>
}

export function resourceMetaTitle(meta?: ResourceMetaConfig | null): string {
  if (!meta) return '视频'
  const items: string[] = []
  if (meta.productName) items.push(meta.productName)
  if (meta.shotName?.trim()) items.push(meta.shotName.trim())
  items.push(...meta.tags.filter(Boolean))
  return items.length > 0 ? items.join(' › ') : '视频'
}
