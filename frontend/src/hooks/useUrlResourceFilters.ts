import { useSearchParams } from 'react-router-dom'

/** Parsed `?product=` / `?tag=` filters from the current URL. */
export function useUrlResourceFilters() {
  const [searchParams] = useSearchParams()
  return {
    product: searchParams.get('product') ?? '',
    tag: searchParams.get('tag') ?? '',
  }
}
