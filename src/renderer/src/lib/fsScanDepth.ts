import { DEFAULT_FS_SCAN_DEPTH, MAX_FS_SCAN_DEPTH } from '@shared/familysearch'
import type { Family, Person } from '@shared/types'

export type FsScanDepth = number | null

type WeightedEdge = { id: string; cost: 0 | 1 }
type Adj = Map<string, WeightedEdge[]>

function addEdge(graph: Adj, from: string, to: string, cost: 0 | 1): void {
  const edges = graph.get(from)
  if (edges) edges.push({ id: to, cost })
  else graph.set(from, [{ id: to, cost }])
}

export function normalizeFsScanDepth(value: unknown): FsScanDepth {
  if (value === null || value === 'all') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_FS_SCAN_DEPTH
  return Math.min(MAX_FS_SCAN_DEPTH, Math.max(1, Math.round(n)))
}

/**
 * People inside `maxDepth` generations of `rootId`.
 *
 * Parent/child movement costs one generation; spouses cost zero so a couple
 * remains in the same generation. Missing roots intentionally fall back to all
 * people, preserving the historical full-tree scan when no root is selected.
 */
export function peopleWithinFamilyTreeDepth(
  allPeople: Person[],
  allFamilies: Family[],
  rootId: string | undefined,
  maxDepth: FsScanDepth
): Person[] {
  const depth = normalizeFsScanDepth(maxDepth)
  if (depth === null || !rootId) return allPeople

  const byId = new Map(allPeople.map((p) => [p.id, p]))
  const root = byId.get(rootId)
  if (!root) return allPeople

  const graph: Adj = new Map()
  for (const family of allFamilies) {
    const parents = [family.husbandId, family.wifeId].filter((id): id is string => !!id && byId.has(id))
    if (parents.length === 2) {
      addEdge(graph, parents[0], parents[1], 0)
      addEdge(graph, parents[1], parents[0], 0)
    }
    for (const childId of family.childIds) {
      if (!byId.has(childId)) continue
      for (const parentId of parents) {
        addEdge(graph, parentId, childId, 1)
        addEdge(graph, childId, parentId, 1)
      }
    }
  }

  const distance = new Map<string, number>([[root.id, 0]])
  const queue = [root.id]
  while (queue.length) {
    const current = queue.shift()!
    const currentDistance = distance.get(current)!
    for (const edge of graph.get(current) ?? []) {
      const nextDistance = currentDistance + edge.cost
      if (nextDistance > depth) continue
      const previous = distance.get(edge.id)
      if (previous !== undefined && previous <= nextDistance) continue
      distance.set(edge.id, nextDistance)
      if (edge.cost === 0) queue.unshift(edge.id)
      else queue.push(edge.id)
    }
  }

  return allPeople.filter((p) => distance.has(p.id))
}
