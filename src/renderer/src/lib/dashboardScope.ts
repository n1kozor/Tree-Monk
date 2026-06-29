import type { Family, Person } from '@shared/types'

/**
 * Which slice of the database the Dashboard's statistics are computed over.
 *
 * - `all`         — every person (the raw, unfiltered database).
 * - `blood`       — only the root's blood relatives (consanguinity): ancestors,
 *                   descendants, siblings, cousins, aunts/uncles, nieces/nephews…
 *                   Married-in spouses are NOT counted (that is the whole point —
 *                   your wife's relatives shouldn't skew "your" family stats).
 * - `ancestors`   — the root and their ancestors only (the pedigree line).
 * - `descendants` — the root and their descendants only.
 */
export type DashboardScope = 'all' | 'blood' | 'ancestors' | 'descendants'

export interface ScopeOptions {
  scope: DashboardScope
  rootId?: string
  /** Opt-in: also pull in the spouses who married into the in-scope people. */
  includeSpouses: boolean
}

export interface ScopeResult {
  /** People that fall inside the scope (fed to `computeDashboard`). */
  people: Person[]
  /** Families with at least one partner in scope (so couple/marriage/child stats line up). */
  families: Family[]
  /** Ids of every in-scope person — for quick membership checks. */
  ids: Set<string>
  /** Total people in the whole database. */
  total: number
  /** How many people the scope left out (`total - people.length`). */
  excluded: number
  /** How many married-in spouses were pulled in by `includeSpouses`. */
  spousesAdded: number
  /** The resolved root person, or null when none is set / found. */
  root: Person | null
  /** Generation depth around the root (independent of scope); null without a root. */
  depth: { up: number; down: number } | null
  /** True when no real filtering happened (the result equals the whole database). */
  isAll: boolean
}

type Adj = Map<string, Set<string>>

function addEdge(m: Adj, a: string, b: string): void {
  let s = m.get(a)
  if (!s) m.set(a, (s = new Set()))
  s.add(b)
}

interface Graph {
  /** child id → its parents. */
  parents: Adj
  /** parent id → its children. */
  children: Adj
  /** person id → their spouses. */
  spouses: Adj
}

function buildGraph(families: Family[]): Graph {
  const parents: Adj = new Map()
  const children: Adj = new Map()
  const spouses: Adj = new Map()
  for (const f of families) {
    const couple = [f.husbandId, f.wifeId].filter((x): x is string => !!x)
    if (f.husbandId && f.wifeId) {
      addEdge(spouses, f.husbandId, f.wifeId)
      addEdge(spouses, f.wifeId, f.husbandId)
    }
    for (const childId of f.childIds) {
      for (const parentId of couple) {
        addEdge(children, parentId, childId)
        addEdge(parents, childId, parentId)
      }
    }
  }
  return { parents, children, spouses }
}

/** Collect every node reachable from `start` along `adj` (inclusive of `start`). */
function reach(start: string, adj: Adj): Set<string> {
  const seen = new Set([start])
  const queue = [start]
  while (queue.length) {
    const cur = queue.shift()!
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

/** Like `reach`, but seeded with many starting nodes at once. */
function reachMany(starts: Iterable<string>, adj: Adj): Set<string> {
  const seen = new Set<string>(starts)
  const queue = [...seen]
  while (queue.length) {
    const cur = queue.shift()!
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

/** Number of layers reachable from `start` along `adj` (0 = none). */
function layers(start: string, adj: Adj): number {
  let frontier = new Set([start])
  const seen = new Set([start])
  let depth = 0
  for (;;) {
    const next = new Set<string>()
    for (const id of frontier) {
      for (const nx of adj.get(id) ?? []) {
        if (!seen.has(nx)) {
          seen.add(nx)
          next.add(nx)
        }
      }
    }
    if (next.size === 0) break
    depth++
    frontier = next
  }
  return depth
}

/**
 * Resolve the people/families that fall inside the chosen scope.
 *
 * The blood-relative set is the classic genealogical one: take the root's whole
 * ancestor line, then everyone descended from it. Crucially this never crosses a
 * spouse edge, so a partner who married in (and their relatives) is excluded —
 * even though they share children with a blood relative.
 */
export function scopePeople(
  allPeople: Person[],
  allFamilies: Family[],
  opts: ScopeOptions
): ScopeResult {
  const total = allPeople.length
  const byId = new Map(allPeople.map((p) => [p.id, p]))
  const root = opts.rootId ? byId.get(opts.rootId) ?? null : null

  const graph = buildGraph(allFamilies)
  const depth = root
    ? { up: layers(root.id, graph.parents), down: layers(root.id, graph.children) }
    : null

  // No filtering possible/requested → the whole database.
  if (opts.scope === 'all' || !root) {
    return {
      people: allPeople,
      families: allFamilies,
      ids: new Set(byId.keys()),
      total,
      excluded: 0,
      spousesAdded: 0,
      root,
      depth,
      isAll: true
    }
  }

  let ids: Set<string>
  if (opts.scope === 'ancestors') {
    ids = reach(root.id, graph.parents)
  } else if (opts.scope === 'descendants') {
    ids = reach(root.id, graph.children)
  } else {
    // Blood relatives = descendants of the root's entire ancestor line.
    const ancestorLine = reach(root.id, graph.parents)
    ids = reachMany(ancestorLine, graph.children)
  }

  let spousesAdded = 0
  if (opts.includeSpouses) {
    const withSpouses = new Set(ids)
    for (const id of ids) {
      for (const sp of graph.spouses.get(id) ?? []) {
        if (!withSpouses.has(sp) && byId.has(sp)) {
          withSpouses.add(sp)
          spousesAdded++
        }
      }
    }
    ids = withSpouses
  }

  const people = allPeople.filter((p) => ids.has(p.id))
  const families = allFamilies.filter(
    (f) => (f.husbandId && ids.has(f.husbandId)) || (f.wifeId && ids.has(f.wifeId))
  )

  return {
    people,
    families,
    ids,
    total,
    excluded: total - people.length,
    spousesAdded,
    root,
    depth,
    isAll: false
  }
}
