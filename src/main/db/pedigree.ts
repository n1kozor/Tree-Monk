import { Families, People } from './repo'
import { documentCountsByPerson } from './documentCounts'
import type { Family, PedigreeCouple, PedigreePerson, Person, UnionRef } from '@shared/types'

// Deep enough for large printable pedigrees (the interactive view still expands
// lazily, so a deep cap costs nothing until those branches are opened/exported).
const MAX_GEN = 20
// How many generations of descendants to build for the focused root couple.
const MAX_DESC = 8

function yearOf(date: string | null): string {
  if (!date) return ''
  const m = date.match(/\d{4}/)
  return m ? m[0] : ''
}

/**
 * Shared building blocks for the pedigree, derived once from People/Families.
 * `buildPedigree` and the lazy subtree endpoints all reuse these so an inline
 * spouse-switch or sibling-expansion produces nodes identical to the main tree.
 */
function pedigreeContext() {
  const people = People.list()
  const families = Families.list()
  const byId = new Map<string, Person>(people.map((p) => [p.id, p]))
  const docCounts = documentCountsByPerson()

  const toPerson = (p: Person): PedigreePerson => ({
    id: p.id,
    name: `${p.givenName} ${p.surname}`.trim() || '—',
    given: p.givenName,
    surname: p.surname,
    sex: p.sex,
    birthYear: yearOf(p.birthDate),
    deathYear: yearOf(p.deathDate),
    living: !p.deceased && !p.deathDate,
    docs: docCounts.get(p.id) ?? 0
  })

  const childFamilyOf = new Map<string, Family>() // person -> family they are a child of
  const spouseFamiliesOf = new Map<string, Family[]>() // person -> families they are a parent in
  const childIds = new Set<string>()
  const parentIds = new Set<string>()
  for (const f of families) {
    for (const pid of [f.husbandId, f.wifeId]) {
      if (!pid) continue
      parentIds.add(pid)
      const arr = spouseFamiliesOf.get(pid) ?? []
      arr.push(f)
      spouseFamiliesOf.set(pid, arr)
    }
    for (const c of f.childIds) {
      childIds.add(c)
      if (!childFamilyOf.has(c)) childFamilyOf.set(c, f)
    }
  }
  // A person's unions in a sensible order: the user-set marriage number wins,
  // then the marriage year — so "first union" (spouse switcher default, the
  // descendant line) is the actual first marriage.
  const unionKey = (f: Family): number => {
    if (f.marriageOrder) return f.marriageOrder
    return 100 + (Number(yearOf(f.marriageDate)) || 9999)
  }
  for (const arr of spouseFamiliesOf.values()) arr.sort((a, b) => unionKey(a) - unionKey(b))

  // Children of a union, oldest first: full birth date when known, year as a
  // fallback; undated children keep their stored (GEDCOM/insertion) order at
  // the end. Stable sort → equal keys never reshuffle.
  const byBirth = (a: Person, b: Person): number => {
    const ya = Number(yearOf(a.birthDate)) || 9999
    const yb = Number(yearOf(b.birthDate)) || 9999
    if (ya !== yb) return ya - yb
    return (a.birthDate ?? '').localeCompare(b.birthDate ?? '')
  }
  const childrenOf = (fam: Family): Person[] =>
    fam.childIds
      .map((cid) => byId.get(cid))
      .filter((p): p is Person => !!p)
      .sort(byBirth)

  // A person plus their first-union spouse (one level, no further nesting) — used
  // for collateral people (siblings) so they can be shown beside their partner.
  const personWithSpouse = (p: Person): PedigreePerson => {
    const fam = (spouseFamiliesOf.get(p.id) ?? [])[0]
    const sid = fam ? (fam.husbandId === p.id ? fam.wifeId : fam.husbandId) : null
    const sp = sid ? byId.get(sid) ?? null : null
    return { ...toPerson(p), spouse: sp ? toPerson(sp) : null }
  }

  // All marriages/unions of a person, for the in-card spouse switcher.
  const unionsOf = (personId: string): UnionRef[] =>
    (spouseFamiliesOf.get(personId) ?? []).map((f) => {
      const sid = f.husbandId === personId ? f.wifeId : f.husbandId
      const sp = sid ? byId.get(sid) ?? null : null
      return {
        familyId: f.id,
        spouseId: sid ?? null,
        spouseName: sp ? `${sp.givenName} ${sp.surname}`.trim() || '—' : '—',
        spouseGiven: sp?.givenName ?? '',
        spouseSurname: sp?.surname ?? '',
        marriageOrder: f.marriageOrder
      }
    })

  // The couple = the parents-family of `personId`, recursing upward.
  const parentsCouple = (personId: string, gen: number, seen: Set<string>): PedigreeCouple | null => {
    if (gen > MAX_GEN || seen.has(personId)) return null
    const fam = childFamilyOf.get(personId)
    if (!fam) return null
    // Both parents deleted from this family → nothing to show (no empty card).
    if (!fam.husbandId && !fam.wifeId) return null
    return coupleFromFamily(fam, gen, new Set(seen).add(personId))
  }

  const coupleFromFamily = (fam: Family, gen: number, seen: Set<string>): PedigreeCouple => {
    const husband = fam.husbandId ? byId.get(fam.husbandId) ?? null : null
    const wife = fam.wifeId ? byId.get(fam.wifeId) ?? null : null
    return {
      id: fam.id,
      familyId: fam.id,
      primary: husband ? toPerson(husband) : null,
      partner: wife ? toPerson(wife) : null,
      marriageDate: fam.marriageDate,
      marriagePlace: fam.marriagePlace,
      marriageOrder: fam.marriageOrder,
      children: childrenOf(fam).map(personWithSpouse),
      primaryUnions: husband ? unionsOf(husband.id) : [],
      partnerUnions: wife ? unionsOf(wife.id) : [],
      fatherParents: husband ? parentsCouple(husband.id, gen + 1, seen) : null,
      motherParents: wife ? parentsCouple(wife.id, gen + 1, seen) : null,
      descendants: []
    }
  }

  // Descendants: each person's OWN union, recursing DOWN the tree. The lineage
  // person stays `primary` so the card layout matches the ancestor cards.
  // `preferFamilyId` (top level only) picks a SPECIFIC union instead of the first
  // one — so switching to a later spouse shows THAT marriage's children, not the
  // first marriage's. Deeper generations keep using each person's first union.
  const descCouple = (
    personId: string,
    gen: number,
    seen: Set<string>,
    preferFamilyId?: string
  ): PedigreeCouple => {
    const person = byId.get(personId)!
    const fams = spouseFamiliesOf.get(personId) ?? []
    const fam = (preferFamilyId ? fams.find((f) => f.id === preferFamilyId) : null) ?? fams[0] ?? null
    const spouseId = fam ? (fam.husbandId === personId ? fam.wifeId : fam.husbandId) : null
    const spouse = spouseId ? byId.get(spouseId) ?? null : null
    const kids = fam ? childrenOf(fam) : []
    const nextSeen = new Set(seen).add(personId)
    if (spouseId) nextSeen.add(spouseId)
    const descendants =
      fam && gen < MAX_DESC
        ? kids.filter((k) => !nextSeen.has(k.id)).map((k) => descCouple(k.id, gen + 1, nextSeen))
        : []
    return {
      id: fam ? `desc-${fam.id}-${personId}` : `descsolo-${personId}`,
      familyId: fam?.id ?? null,
      primary: toPerson(person),
      partner: spouse ? toPerson(spouse) : null,
      marriageDate: fam?.marriageDate ?? null,
      marriagePlace: fam?.marriagePlace ?? null,
      marriageOrder: fam?.marriageOrder ?? null,
      children: kids.map(toPerson),
      primaryUnions: unionsOf(person.id),
      partnerUnions: spouseId ? unionsOf(spouseId) : [],
      fatherParents: null,
      motherParents: null,
      descendants
    }
  }

  return {
    people,
    families,
    byId,
    childFamilyOf,
    spouseFamiliesOf,
    childIds,
    parentIds,
    toPerson,
    unionsOf,
    childrenOf,
    parentsCouple,
    coupleFromFamily,
    descCouple
  }
}

/**
 * Builds a FamilySearch-style ancestor pedigree of couple nodes, rooted at the
 * proband's marriage couple (or the proband alone if unmarried).
 */
export function buildPedigree(rootId?: string, rootFamilyId?: string): PedigreeCouple | null {
  const ctx = pedigreeContext()
  if (!ctx.people.length) return null
  const { byId, childFamilyOf, spouseFamiliesOf, childIds, parentIds, toPerson, unionsOf } = ctx

  // Choose proband: deepest ancestor chain among childless descendants, else any child.
  const ancestorReach = (startId: string): number => {
    const seen = new Set<string>()
    const stack = [startId]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      const f = childFamilyOf.get(id)
      if (f) for (const p of [f.husbandId, f.wifeId]) if (p) stack.push(p)
    }
    return seen.size
  }
  let proband = rootId ? byId.get(rootId) : undefined
  if (!proband) {
    let cands = ctx.people.filter((p) => childIds.has(p.id) && !parentIds.has(p.id))
    if (!cands.length) cands = ctx.people.filter((p) => childIds.has(p.id))
    if (!cands.length) cands = ctx.people
    proband = cands
      .map((p) => ({ p, score: ancestorReach(p.id) }))
      .sort((a, b) => b.score - a.score)[0]?.p
  }
  if (!proband) return null

  const attachDescendants = (root: PedigreeCouple, children: Person[], seed: string[]): PedigreeCouple => {
    const seen = new Set<string>(seed)
    root.descendants = children.map((c) => ctx.descCouple(c.id, 1, seen))
    return root
  }

  // Root: the proband's own marriage couple (so the spouse's line shows too).
  // Honour an explicit union choice (spouse switcher) when given.
  const marriages = spouseFamiliesOf.get(proband.id) ?? []
  const marriage = (rootFamilyId && marriages.find((f) => f.id === rootFamilyId)) || marriages[0]
  if (marriage) {
    const root = ctx.coupleFromFamily(marriage, 1, new Set())
    const seed = [marriage.husbandId, marriage.wifeId].filter((id): id is string => !!id)
    return attachDescendants(root, ctx.childrenOf(marriage), seed)
  }
  // Unmarried proband: show them alone with their ancestors.
  return {
    id: `solo-${proband.id}`,
    familyId: null,
    primary: toPerson(proband),
    partner: null,
    marriageDate: null,
    marriagePlace: null,
    marriageOrder: null,
    children: [],
    primaryUnions: unionsOf(proband.id),
    partnerUnions: [],
    fatherParents: ctx.parentsCouple(proband.id, 1, new Set()),
    motherParents: null,
    descendants: []
  }
}

/**
 * Builds a single couple node for a specific union family, WITH both spouses'
 * ancestral lines attached. Used for in-place spouse switching: the chosen
 * union's subtree replaces the old one without re-rooting the whole tree.
 */
export function buildUnionCouple(familyId: string): PedigreeCouple | null {
  const ctx = pedigreeContext()
  const fam = ctx.families.find((f) => f.id === familyId)
  if (!fam) return null
  return ctx.coupleFromFamily(fam, 1, new Set())
}

/**
 * Builds a person's OWN union couple plus their descendants (downward), so a
 * sibling/collateral person can be expanded in place to reveal their children.
 * `familyId` selects WHICH union to descend (default: the person's first) — used
 * by the portrait view so switching to a later spouse shows that marriage's kids.
 * Returns null if the person is unknown.
 */
export function buildPersonDescendants(
  personId: string,
  familyId?: string
): PedigreeCouple | null {
  const ctx = pedigreeContext()
  if (!ctx.byId.has(personId)) return null
  return ctx.descCouple(personId, 1, new Set(), familyId)
}
