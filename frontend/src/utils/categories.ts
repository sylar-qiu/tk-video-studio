import type { Category } from '../api'

export interface FlatCategory {
  id: number
  name: string
  parent_id: number | null
  path: string
  depth: number
  child_count: number
}

export function flattenCategories(
  cats: Category[],
  depth = 0,
  parentPath = '',
): FlatCategory[] {
  const result: FlatCategory[] = []
  for (const c of cats) {
    const path = c.path || (parentPath ? `${parentPath} > ${c.name}` : c.name)
    result.push({
      id: c.id,
      name: c.name,
      parent_id: c.parent_id,
      path,
      depth,
      child_count: c.children.length,
    })
    if (c.children.length) {
      result.push(...flattenCategories(c.children, depth + 1, path))
    }
  }
  return result
}

/** Root id plus all descendant ids (pre-order). */
export function collectSubtreeIds(flat: FlatCategory[], rootId: number): number[] {
  const ids = [rootId]
  const collect = (parentId: number) => {
    for (const item of flat) {
      if (item.parent_id === parentId) {
        ids.push(item.id)
        collect(item.id)
      }
    }
  }
  collect(rootId)
  return ids
}

export function countDescendants(flat: FlatCategory[], rootId: number): number {
  return collectSubtreeIds(flat, rootId).length - 1
}

/** Deepest nodes first — safe order for backend delete rules. */
export function idsForDeletionOrder(flat: FlatCategory[], rootId: number): number[] {
  return [...collectSubtreeIds(flat, rootId)].reverse()
}

function isAncestorCollapsed(
  flat: FlatCategory[],
  item: FlatCategory,
  collapsed: Set<number>,
): boolean {
  let parentId = item.parent_id
  while (parentId !== null) {
    const parent = flat.find((x) => x.id === parentId)
    if (!parent) break
    if (collapsed.has(parent.id)) return true
    parentId = parent.parent_id
  }
  return false
}

export function visibleInTree(flat: FlatCategory[], collapsed: Set<number>): FlatCategory[] {
  return flat.filter((item) => item.depth === 0 || !isAncestorCollapsed(flat, item, collapsed))
}

export function visibleInSearch(flat: FlatCategory[], query: string): FlatCategory[] {
  const q = query.trim().toLowerCase()
  if (!q) return flat

  const matchedIds = new Set<number>()
  for (const item of flat) {
    if (!item.name.toLowerCase().includes(q) && !item.path.toLowerCase().includes(q)) continue
    matchedIds.add(item.id)
    let parentId = item.parent_id
    while (parentId !== null) {
      matchedIds.add(parentId)
      const parent = flat.find((x) => x.id === parentId)
      parentId = parent ? parent.parent_id : null
    }
  }
  return flat.filter((item) => matchedIds.has(item.id))
}
