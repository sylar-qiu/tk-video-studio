export type ResourceKind = 'assets' | 'shots' | 'exports' | 'works' | 'products'

export interface ResourceFilterParams {
  productId?: number
  tag?: string
}

export function resourceFilterUrl(
  kind: ResourceKind,
  opts?: ResourceFilterParams,
): string {
  const params = new URLSearchParams()
  if (opts?.productId != null) params.set('product', String(opts.productId))
  if (opts?.tag) params.set('tag', opts.tag)
  const qs = params.toString()
  const paths: Record<ResourceKind, string> = {
    assets: '/',
    shots: '/shots',
    exports: '/exports',
    works: '/works',
    products: '/products',
  }
  return qs ? `${paths[kind]}?${qs}` : paths[kind]
}
