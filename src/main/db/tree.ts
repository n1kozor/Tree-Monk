import { Families, People } from './repo'
import { documentCountsByPerson } from './documentCounts'
import type { Family, Person, TreeNodeDatum } from '@shared/types'

export type TreeMode = 'ancestors' | 'descendants'

function yearOf(date: string | null): string {
  if (!date) return ''
  const m = date.match(/\d{4}/)
  return m ? m[0] : ''
}

function lifespan(p: Person): string {
  const b = yearOf(p.birthDate)
  const d = yearOf(p.deathDate)
  if (d) return `${b || '?'}–${d}`
  // Deceased but death year unknown → dagger, so the node never reads as "alive".
  if (p.deceased) return b ? `${b}–†` : '†'
  if (!b) return ''
  return `${b}–`
}

function displayName(p: Person): string {
  return `${p.givenName} ${p.surname}`.trim() || '—'
}

function attributesFor(
  p: Person,
  docCounts: Map<string, number>,
  extra?: { spouse?: string }
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {}
  const span = lifespan(p)
  if (span) attributes.years = span
  if (extra?.spouse) attributes.spouse = extra.spouse
  const docs = docCounts.get(p.id) ?? 0
  if (docs) attributes.docs = docs
  return attributes
}

/**
 * Projects the relational data into a SINGLE rooted tree (react-d3-tree only
 * renders data[0], so a forest is never returned).
 */
export function buildTree(rootId?: string, mode: TreeMode = 'ancestors'): TreeNodeDatum[] {
  const people = People.list()
  const families = Families.list()
  if (people.length === 0) return []
  const byId = new Map<string, Person>(people.map((p) => [p.id, p]))
  const docCounts = documentCountsByPerson()

  // Indexes.
  const parentFamilies = new Map<string, Family[]>() // person -> families where parent
  const childFamilyOf = new Map<string, Family>() // person -> the family they are a child of
  const childIds = new Set<string>()
  const parentIds = new Set<string>()
  for (const f of families) {
    for (const pid of [f.husbandId, f.wifeId]) {
      if (!pid) continue
      parentIds.add(pid)
      const arr = parentFamilies.get(pid) ?? []
      arr.push(f)
      parentFamilies.set(pid, arr)
    }
    for (const c of f.childIds) {
      childIds.add(c)
      if (!childFamilyOf.has(c)) childFamilyOf.set(c, f)
    }
  }

  // --- builders ---

  const buildAncestors = (personId: string, visited: Set<string>): TreeNodeDatum | null => {
    const person = byId.get(personId)
    if (!person || visited.has(personId)) return null
    const seen = new Set(visited).add(personId)

    const fam = childFamilyOf.get(personId)
    const parents: TreeNodeDatum[] = []
    if (fam) {
      // Father first, then mother — both sides always included.
      for (const pid of [fam.husbandId, fam.wifeId]) {
        if (pid) {
          const node = buildAncestors(pid, seen)
          if (node) parents.push(node)
        }
      }
    }
    return {
      name: displayName(person),
      given: person.givenName,
      surname: person.surname,
      personId: person.id,
      sex: person.sex,
      birthYear: yearOf(person.birthDate),
      deathYear: yearOf(person.deathDate),
      attributes: attributesFor(person, docCounts),
      children: parents.length ? parents : undefined
    }
  }

  const buildDescendants = (personId: string, visited: Set<string>): TreeNodeDatum | null => {
    const person = byId.get(personId)
    if (!person || visited.has(personId)) return null
    visited.add(personId)

    const fams = parentFamilies.get(personId) ?? []
    const children: TreeNodeDatum[] = []
    const spouses: string[] = []
    for (const f of fams) {
      const spouseId = f.husbandId === personId ? f.wifeId : f.husbandId
      if (spouseId && byId.get(spouseId)) spouses.push(displayName(byId.get(spouseId)!))
      for (const cid of f.childIds) {
        const node = buildDescendants(cid, visited)
        if (node) children.push(node)
      }
    }
    return {
      name: displayName(person),
      given: person.givenName,
      surname: person.surname,
      personId: person.id,
      sex: person.sex,
      birthYear: yearOf(person.birthDate),
      deathYear: yearOf(person.deathDate),
      attributes: attributesFor(person, docCounts, { spouse: spouses.join(', ') }),
      children: children.length ? children : undefined
    }
  }

  // Count reachable nodes, to pick the most meaningful root.
  const countReachable = (startId: string, next: (id: string) => string[]): number => {
    const seen = new Set<string>()
    const stack = [startId]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      for (const n of next(id)) if (!seen.has(n)) stack.push(n)
    }
    return seen.size
  }

  const parentsOf = (id: string): string[] => {
    const f = childFamilyOf.get(id)
    return f ? [f.husbandId, f.wifeId].filter((x): x is string => !!x) : []
  }
  const childrenOf = (id: string): string[] =>
    (parentFamilies.get(id) ?? []).flatMap((f) => f.childIds)

  // --- pick root ---
  let rootPerson = rootId ? byId.get(rootId) : undefined

  if (!rootPerson) {
    if (mode === 'ancestors') {
      let candidates = people.filter((p) => childIds.has(p.id) && !parentIds.has(p.id))
      if (candidates.length === 0) candidates = people.filter((p) => childIds.has(p.id))
      if (candidates.length === 0) candidates = people
      rootPerson = candidates
        .map((p) => ({ p, score: countReachable(p.id, parentsOf) }))
        .sort((a, b) => b.score - a.score)[0]?.p
    } else {
      let candidates = people.filter((p) => !childIds.has(p.id))
      if (candidates.length === 0) candidates = people
      rootPerson = candidates
        .map((p) => ({ p, score: countReachable(p.id, childrenOf) }))
        .sort((a, b) => b.score - a.score)[0]?.p
    }
  }

  if (!rootPerson) return []

  const node =
    mode === 'ancestors'
      ? buildAncestors(rootPerson.id, new Set())
      : buildDescendants(rootPerson.id, new Set())
  return node ? [node] : []
}
