import type { Family, Person } from '@shared/types'
import { computeInsights, type Insight } from './insights'
import { aggregateQuality } from './completeness'

/** A label + count pair used by the bar/list widgets. */
export interface Bucket {
  label: string
  count: number
}

/** A single "X of Y filled in" completeness metric. */
export interface Completeness {
  key: string
  have: number
  total: number
}

/** Everything the Dashboard renders, computed once from the (already scoped) data. */
export interface DashboardStats {
  total: number
  males: number
  females: number
  unknownSex: number
  living: number
  deceased: number
  families: number
  marriages: number
  avgLifespan: number | null
  avgChildren: number | null
  minYear: number | null
  maxYear: number | null
  topSurnames: Bucket[]
  topGivenNames: Bucket[]
  topBirthPlaces: Bucket[]
  topDeathPlaces: Bucket[]
  topOccupations: Bucket[]
  religions: Bucket[]
  birthsByCentury: Bucket[]
  deathsByCentury: Bucket[]
  /** Age histogram in 10-year bands (0–9 … 90+). */
  lifespanDist: Bucket[]
  completeness: Completeness[]
  /** Overall data-quality score (0–100): average per-person completeness. */
  qualityScore: number
  /** Notable "did you know" records (clickable people), reused from insights. */
  records: Insight[]
}

/** Tunable knobs the Dashboard settings expose. */
export interface DashboardComputeOptions {
  /** How many entries each "top N" list keeps. */
  topN?: number
  /** Person ids that have an occupation (stored in the occupations table, not the
   *  people.occupation column) — needed for accurate completeness scoring. */
  occPersonIds?: Set<string>
}

const DEFAULT_TOP_N = 8

const yearNum = (d: string | null): number | null => {
  const m = d?.match(/\b(\d{4})\b/)
  return m ? Number(m[1]) : null
}

const topN = (counts: Map<string, number>, n: number): Bucket[] =>
  [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)

const bump = <K>(m: Map<K, number>, key: K): void => {
  m.set(key, (m.get(key) ?? 0) + 1)
}

const byCentury = (map: Map<number, number>): Bucket[] =>
  [...map.entries()].sort((a, b) => a[0] - b[0]).map(([c, count]) => ({ label: `${c}s`, count }))

// Records that belong on the Dashboard's "notable" widget (the rest are KPIs).
const RECORD_KEYS = new Set([
  'oldestAncestor',
  'longestLived',
  'avgLifespan',
  'mostChildren',
  'largestFamily',
  'commonSurname',
  'commonBirthPlace',
  'youngestParent',
  'oldestParent'
])

export function computeDashboard(
  people: Person[],
  families: Family[],
  opts: DashboardComputeOptions = {}
): DashboardStats {
  const limit = Math.max(1, Math.round(opts.topN ?? DEFAULT_TOP_N))
  const isDeceased = (p: Person): boolean => !!(p.deceased || p.deathDate)

  const males = people.filter((p) => p.sex === 'M').length
  const females = people.filter((p) => p.sex === 'F').length
  const unknownSex = people.length - males - females
  const deceased = people.filter(isDeceased).length
  const living = people.length - deceased
  const marriages = families.filter((f) => f.husbandId && f.wifeId).length

  // --- Average lifespan + age histogram (sane 0–120 spans only) ---
  const ages: number[] = []
  const lifespanBands = new Map<string, number>()
  for (const p of people) {
    const b = yearNum(p.birthDate)
    const d = yearNum(p.deathDate)
    if (b !== null && d !== null && d - b >= 0 && d - b <= 120) {
      const age = d - b
      ages.push(age)
      bump(lifespanBands, age >= 90 ? '90+' : `${Math.floor(age / 10) * 10}–${Math.floor(age / 10) * 10 + 9}`)
    }
  }
  const avgLifespan = ages.length ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : null

  // Keep age bands in numeric order (90+ last).
  const lifespanDist: Bucket[] = [...lifespanBands.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => parseInt(a.label, 10) - parseInt(b.label, 10))

  // --- Average children per family that has any ---
  const famWithKids = families.filter((f) => f.childIds.length > 0)
  const avgChildren = famWithKids.length
    ? Math.round((famWithKids.reduce((s, f) => s + f.childIds.length, 0) / famWithKids.length) * 10) / 10
    : null

  // --- Distributions ---
  const surnames = new Map<string, number>()
  const givenNames = new Map<string, number>()
  const birthPlaces = new Map<string, number>()
  const deathPlaces = new Map<string, number>()
  const occupations = new Map<string, number>()
  const religions = new Map<string, number>()
  const birthCenturies = new Map<number, number>()
  const deathCenturies = new Map<number, number>()
  let minYear: number | null = null
  let maxYear: number | null = null

  for (const p of people) {
    const s = p.surname.trim()
    if (s) bump(surnames, s)
    const g = p.givenName.trim()
    if (g) bump(givenNames, g)
    const bp = (p.birthPlace ?? '').trim()
    if (bp) bump(birthPlaces, bp)
    const dp = (p.deathPlace ?? '').trim()
    if (dp) bump(deathPlaces, dp)
    const oc = (p.occupation ?? '').trim()
    if (oc) bump(occupations, oc)
    const rel = (p.religion ?? '').trim()
    if (rel) bump(religions, rel)

    for (const y of [yearNum(p.birthDate), yearNum(p.deathDate)]) {
      if (y === null) continue
      minYear = minYear === null ? y : Math.min(minYear, y)
      maxYear = maxYear === null ? y : Math.max(maxYear, y)
    }
    const by = yearNum(p.birthDate)
    if (by !== null) bump(birthCenturies, Math.floor(by / 100) * 100)
    const dy = yearNum(p.deathDate)
    if (dy !== null) bump(deathCenturies, Math.floor(dy / 100) * 100)
  }

  // --- Data completeness ---
  const occSet = opts.occPersonIds
  const hasOccupation = (p: Person): boolean => !!p.occupation?.trim() || !!occSet?.has(p.id)
  const have = (pred: (p: Person) => boolean): number => people.filter(pred).length
  const completeness: Completeness[] = [
    { key: 'birthDate', have: have((p) => !!p.birthDate), total: people.length },
    { key: 'birthPlace', have: have((p) => !!p.birthPlace), total: people.length },
    { key: 'deathInfo', have: have((p) => !!p.deathDate || isDeceased(p)), total: people.length },
    { key: 'photo', have: have((p) => !!p.profilePhotoId), total: people.length },
    { key: 'occupation', have: have(hasOccupation), total: people.length }
  ]

  const records = computeInsights(people, families).filter((i) => RECORD_KEYS.has(i.key))

  return {
    total: people.length,
    males,
    females,
    unknownSex,
    living,
    deceased,
    families: families.length,
    marriages,
    avgLifespan,
    avgChildren,
    minYear,
    maxYear,
    topSurnames: topN(surnames, limit),
    topGivenNames: topN(givenNames, limit),
    topBirthPlaces: topN(birthPlaces, limit),
    topDeathPlaces: topN(deathPlaces, limit),
    topOccupations: topN(occupations, limit),
    religions: topN(religions, limit),
    birthsByCentury: byCentury(birthCenturies),
    deathsByCentury: byCentury(deathCenturies),
    lifespanDist,
    completeness,
    qualityScore: aggregateQuality(people, occSet),
    records
  }
}
