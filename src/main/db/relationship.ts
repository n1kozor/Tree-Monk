import { Families, People } from './repo'
import type { Person, RelationKind, RelationshipNode, RelationshipPath } from '@shared/types'

const yearOf = (d: string | null): string => {
  const m = d?.match(/\b(\d{4})\b/)
  return m ? m[1] : ''
}

function toNode(p: Person): RelationshipNode {
  const b = yearOf(p.birthDate)
  const d = yearOf(p.deathDate)
  const lifespan = b || d ? `${b || '?'}–${d || (p.deceased ? '†' : '')}` : ''
  return {
    id: p.id,
    name: `${p.givenName} ${p.surname}`.trim() || '—',
    sex: p.sex,
    lifespan
  }
}

/**
 * Shortest kinship path between two people through parent/child/spouse edges
 * (plain BFS). Returns the ordered chain plus, for each hop, how the next
 * person relates to the current one — so the UI can draw and label the line.
 */
export function findRelationshipPath(fromId: string, toId: string): RelationshipPath | null {
  const people = People.list()
  const byId = new Map(people.map((p) => [p.id, p]))
  if (!byId.has(fromId) || !byId.has(toId)) return null
  if (fromId === toId) return { nodes: [toNode(byId.get(fromId)!)], relations: [] }

  // Undirected family graph: spouse↔spouse, and parent↔child both ways. The
  // edge kind describes the DESTINATION relative to the source.
  const adj = new Map<string, { to: string; kind: RelationKind }[]>()
  const link = (a: string, b: string, kind: RelationKind): void => {
    const arr = adj.get(a) ?? []
    arr.push({ to: b, kind })
    adj.set(a, arr)
  }
  for (const f of Families.list()) {
    const parents = [f.husbandId, f.wifeId].filter((x): x is string => !!x)
    if (f.husbandId && f.wifeId) {
      link(f.husbandId, f.wifeId, 'spouse')
      link(f.wifeId, f.husbandId, 'spouse')
    }
    for (const childId of f.childIds) {
      for (const parentId of parents) {
        link(parentId, childId, 'child') // childId is a child of parentId
        link(childId, parentId, 'parent') // parentId is a parent of childId
      }
    }
  }

  const prev = new Map<string, { from: string; kind: RelationKind }>()
  const seen = new Set([fromId])
  const queue: string[] = [fromId]
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === toId) break
    for (const e of adj.get(cur) ?? []) {
      if (seen.has(e.to)) continue
      seen.add(e.to)
      prev.set(e.to, { from: cur, kind: e.kind })
      queue.push(e.to)
    }
  }
  if (!seen.has(toId)) return null

  // Walk back from the target, then reverse into start→target order.
  const ids: string[] = []
  const relations: RelationKind[] = []
  let cur = toId
  while (cur !== fromId) {
    const step = prev.get(cur)!
    ids.push(cur)
    relations.push(step.kind)
    cur = step.from
  }
  ids.push(fromId)
  ids.reverse()
  relations.reverse()
  return { nodes: ids.map((id) => toNode(byId.get(id)!)), relations }
}
