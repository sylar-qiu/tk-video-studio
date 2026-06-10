import type { Category } from '../api'

export function flattenCategories(
  cats: Category[],
  depth = 0,
): { id: number; path: string; depth: number }[] {
  const result: { id: number; path: string; depth: number }[] = []
  for (const c of cats) {
    result.push({ id: c.id, path: c.path, depth })
    if (c.children.length) result.push(...flattenCategories(c.children, depth + 1))
  }
  return result
}
