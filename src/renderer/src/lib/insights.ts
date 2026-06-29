import type { Family, Person } from '@shared/types'

/** One computed "interesting fact" card for the tree's Insights tab. */
export interface Insight {
  /** i18n suffix under `tree.insights.<key>`. */
  key: string
  /** Icon name resolved by the panel. */
  icon: string
  /** Main display (a name or a number). */
  value: string
  /** Secondary line (a year, count or age). */
  sub?: string
  /** Whether `sub` is an age/years span (so the panel appends a unit). */
  years?: boolean
  /** When set, the card is clickable and opens this person. */
  personId?: string
}

const yearNum = (d: string | null): number | null => {
  const m = d?.match(/\b(\d{4})\b/)
  return m ? Number(m[1]) : null
}
const nm = (p: Person): string => `${p.givenName} ${p.surname}`.trim() || '—'
const topOf = (counts: Map<string, number>): [string, number] | null =>
  [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

/** Computes a rich set of "did you know" facts from the whole database. */
export function computeInsights(people: Person[], families: Family[]): Insight[] {
  const out: Insight[] = []
  if (people.length === 0) return out
  const byId = new Map(people.map((p) => [p.id, p]))

  // --- Totals ---
  const males = people.filter((p) => p.sex === 'M').length
  const females = people.filter((p) => p.sex === 'F').length
  const deceased = people.filter((p) => p.deceased || p.deathDate).length
  out.push({ key: 'totalPeople', icon: 'users', value: String(people.length), sub: `♂ ${males} · ♀ ${females}` })
  out.push({ key: 'families', icon: 'heart', value: String(families.length) })
  out.push({ key: 'deceased', icon: 'skull', value: `${deceased} / ${people.length}` })

  // --- Oldest ancestor (earliest birth year) ---
  let oldest: Person | null = null
  let oldestY = Infinity
  for (const p of people) {
    const y = yearNum(p.birthDate)
    if (y !== null && y < oldestY) {
      oldestY = y
      oldest = p
    }
  }
  if (oldest) out.push({ key: 'oldestAncestor', icon: 'crown', value: nm(oldest), sub: String(oldestY), personId: oldest.id })

  // --- Longest-lived + average lifespan ---
  let longest: Person | null = null
  let longestAge = -1
  const ages: number[] = []
  for (const p of people) {
    const b = yearNum(p.birthDate)
    const d = yearNum(p.deathDate)
    if (b !== null && d !== null && d - b >= 0 && d - b <= 120) {
      ages.push(d - b)
      if (d - b > longestAge) {
        longestAge = d - b
        longest = p
      }
    }
  }
  if (longest) out.push({ key: 'longestLived', icon: 'hourglass', value: nm(longest), sub: String(longestAge), years: true, personId: longest.id })
  if (ages.length) out.push({ key: 'avgLifespan', icon: 'activity', value: String(Math.round(ages.reduce((s, a) => s + a, 0) / ages.length)), years: true })

  // --- Most children (per parent) + largest family ---
  const childCount = new Map<string, number>()
  let bigFam: Family | null = null
  for (const f of families) {
    for (const pid of [f.husbandId, f.wifeId]) {
      if (pid) childCount.set(pid, (childCount.get(pid) ?? 0) + f.childIds.length)
    }
    if (!bigFam || f.childIds.length > bigFam.childIds.length) bigFam = f
  }
  let mostKids: string | null = null
  let mostKidsN = 0
  for (const [pid, n] of childCount) if (n > mostKidsN) ((mostKidsN = n), (mostKids = pid))
  if (mostKids && mostKidsN > 0) {
    const p = byId.get(mostKids)
    if (p) out.push({ key: 'mostChildren', icon: 'baby', value: nm(p), sub: String(mostKidsN), personId: p.id })
  }
  if (bigFam && bigFam.childIds.length > 0) {
    const fa = bigFam.husbandId ? byId.get(bigFam.husbandId) : undefined
    const mo = bigFam.wifeId ? byId.get(bigFam.wifeId) : undefined
    const names = [fa, mo].filter((x): x is Person => !!x).map(nm).join(' & ') || '—'
    out.push({ key: 'largestFamily', icon: 'usersRound', value: names, sub: String(bigFam.childIds.length), personId: bigFam.husbandId ?? bigFam.wifeId ?? undefined })
  }

  // --- Most common surname / birthplace ---
  const surnames = new Map<string, number>()
  const places = new Map<string, number>()
  for (const p of people) {
    const s = p.surname.trim()
    if (s) surnames.set(s, (surnames.get(s) ?? 0) + 1)
    const pl = (p.birthPlace ?? '').trim()
    if (pl) places.set(pl, (places.get(pl) ?? 0) + 1)
  }
  const topSurname = topOf(surnames)
  if (topSurname) out.push({ key: 'commonSurname', icon: 'tag', value: topSurname[0], sub: `${topSurname[1]}×` })
  const topPlace = topOf(places)
  if (topPlace) out.push({ key: 'commonBirthPlace', icon: 'map', value: topPlace[0], sub: `${topPlace[1]}×` })

  // --- Time span ---
  const births = people.map((p) => yearNum(p.birthDate)).filter((y): y is number => y !== null)
  const deaths = people.map((p) => yearNum(p.deathDate)).filter((y): y is number => y !== null)
  if (births.length) {
    const minY = Math.min(...births)
    const maxY = Math.max(...births, ...(deaths.length ? deaths : [minY]))
    out.push({ key: 'timeSpan', icon: 'calendar', value: `${minY}–${maxY}`, sub: String(maxY - minY), years: true })
  }

  // --- Youngest / oldest parent at a child's birth ---
  let youngP: { p: Person; age: number } | null = null
  let oldP: { p: Person; age: number } | null = null
  for (const f of families) {
    for (const pid of [f.husbandId, f.wifeId]) {
      if (!pid) continue
      const parent = byId.get(pid)
      const pb = parent ? yearNum(parent.birthDate) : null
      if (!parent || pb === null) continue
      for (const cid of f.childIds) {
        const cb = yearNum(byId.get(cid)?.birthDate ?? null)
        if (cb === null) continue
        const age = cb - pb
        if (age >= 12 && age <= 70) {
          if (!youngP || age < youngP.age) youngP = { p: parent, age }
          if (!oldP || age > oldP.age) oldP = { p: parent, age }
        }
      }
    }
  }
  if (youngP) out.push({ key: 'youngestParent', icon: 'baby', value: nm(youngP.p), sub: String(youngP.age), years: true, personId: youngP.p.id })
  if (oldP) out.push({ key: 'oldestParent', icon: 'baby', value: nm(oldP.p), sub: String(oldP.age), years: true, personId: oldP.p.id })

  return out
}
