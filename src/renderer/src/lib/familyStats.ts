import type { EventRecord, Family, Person } from '@shared/types'
import { monthNumber } from '@shared/months'
import { ageAt, dateSortKey, expandCompactDate } from './dates'
import { buildBirthParents } from './pedigreeCollapse'
import type { Bucket } from './dashboard'

/** Couple types as the Families page groups them ('none' and 'other' together). */
export type FamilyKind = 'married' | 'partner' | 'other'

/** One family (couple + children) with everything the Families page derives
 *  from it, computed once per data change so every view reads the same facts. */
export interface FamilyRow {
  family: Family
  husband: Person | null
  wife: Person | null
  /** Children present in the tree, oldest first. */
  children: Person[]
  kind: FamilyKind
  /** The family's own marriage date/place, else the first dated civil or
   *  church wedding among the family events. */
  marriageDate: string | null
  marriagePlace: string | null
  marriageYear: number | null
  firstChildYear: number | null
  lastChildYear: number | null
  /** Where the union starts on a time axis: the marriage year, else the year
   *  before the first child's birth (then `startEstimated`). */
  startYear: number | null
  startEstimated: boolean
  /** Divorce/separation year, else the first spouse's death year. */
  endYear: number | null
  endReason: 'divorce' | 'separation' | 'death' | null
  /** Both partners living and the union recent enough to still be running. */
  ongoing: boolean
  /** Whole years from the wedding to the end (or to today while ongoing). */
  durationYears: number | null
  /** Spouses' ages on the wedding day. */
  husbandAge: number | null
  wifeAge: number | null
  /** Birth-year difference, positive when the husband is older. */
  ageGap: number | null
  /** A divorce or separation is recorded. */
  divorced: boolean
  /** A spouse has more than one union in the tree. */
  remarriage: boolean
  /** Family-owned events (engagement, weddings, divorce…), stored order. */
  events: EventRecord[]
}

const END_TYPES = new Set(['divorce', 'separation'])
const WEDDING_TYPES = new Set(['civilMarriage', 'churchMarriage'])
/** A union this old with no recorded death has an unknown end — not "ongoing". */
const ONGOING_MAX_YEARS = 80

export function yearNum(date: string | null | undefined): number | null {
  const m = /\d{4}/.exec(date ?? '')
  return m ? Number(m[0]) : null
}

/** Month (1–12) of a stored date in any of the shapes the app keeps: ISO
 *  ("1850-05-10"), compact ("18500510"), GEDCOM ("10 MAY 1850") or a typed
 *  month name in one of the UI languages ("1850. május 10."). */
export function monthOf(date: string | null | undefined): number | null {
  if (!date) return null
  const iso = /\d{4}-(\d{1,2})/.exec(expandCompactDate(date))
  if (iso) {
    const m = Number(iso[1])
    return m >= 1 && m <= 12 ? m : null
  }
  for (const tok of date.toLowerCase().split(/[^\p{L}]+/u)) {
    if (!tok) continue
    const m = monthNumber(tok)
    if (m) return m
  }
  return null
}

const isDead = (p: Person): boolean => p.deceased || !!p.deathDate

export function familyKind(f: Family): FamilyKind {
  if (!f.relationship) return 'married'
  return f.relationship === 'partner' ? 'partner' : 'other'
}

function childYear(p: Person): number | null {
  return yearNum(p.birthDate) ?? yearNum(p.christeningDate)
}

function buildRow(
  f: Family,
  byId: ReadonlyMap<string, Person>,
  events: EventRecord[],
  unions: Map<string, number>,
  now: number
): FamilyRow {
  const husband = f.husbandId ? byId.get(f.husbandId) ?? null : null
  const wife = f.wifeId ? byId.get(f.wifeId) ?? null : null
  const children = f.childIds
    .map((id) => byId.get(id))
    .filter((p): p is Person => !!p)
    .sort(
      (a, b) => dateSortKey(a.birthDate ?? a.christeningDate) - dateSortKey(b.birthDate ?? b.christeningDate)
    )

  const weddings = events
    .filter((e) => WEDDING_TYPES.has(e.type) && yearNum(e.date) != null)
    .sort((a, b) => dateSortKey(a.date) - dateSortKey(b.date))
  const marriageDate = f.marriageDate?.trim() ? f.marriageDate : weddings[0]?.date ?? null
  const marriagePlace = f.marriagePlace?.trim() ? f.marriagePlace : weddings[0]?.place ?? null
  const marriageYear = yearNum(marriageDate)

  // Timing (first child, estimated start, open end) follows the couple's own
  // children only: an adopted or step-child — often born years before this
  // union — would date the marriage wrong.
  const birthOfBoth = (id: string): boolean => {
    const rel = f.childRelations?.[id]
    return !rel || (!rel.father && !rel.mother)
  }
  const childYears = children
    .filter((c) => birthOfBoth(c.id))
    .map(childYear)
    .filter((y): y is number => y != null)
  const firstChildYear = childYears.length ? Math.min(...childYears) : null
  const lastChildYear = childYears.length ? Math.max(...childYears) : null
  const startEstimated = marriageYear == null && firstChildYear != null
  const startYear = marriageYear ?? (firstChildYear != null ? firstChildYear - 1 : null)

  const ends = events.filter((e) => END_TYPES.has(e.type))
  const divorced = ends.length > 0
  const datedEnd = ends
    .map((e) => ({ type: e.type as 'divorce' | 'separation', year: yearNum(e.date) }))
    .filter((x): x is { type: 'divorce' | 'separation'; year: number } => x.year != null)
    .sort((a, b) => a.year - b.year)[0]
  let endYear: number | null = null
  let endReason: FamilyRow['endReason'] = null
  if (datedEnd) {
    endYear = datedEnd.year
    endReason = datedEnd.type
  } else if (!divorced) {
    const deaths = [husband, wife].map((p) => yearNum(p?.deathDate)).filter((y): y is number => y != null)
    if (deaths.length) {
      endYear = Math.min(...deaths)
      endReason = 'death'
    }
  }

  const living = (!!husband || !!wife) && !(husband && isDead(husband)) && !(wife && isDead(wife))
  const ongoing = !divorced && endYear == null && living && startYear != null && now - startYear <= ONGOING_MAX_YEARS

  let durationYears: number | null = null
  if (marriageYear != null) {
    if (endYear != null && endYear >= marriageYear) durationYears = endYear - marriageYear
    else if (ongoing) durationYears = now - marriageYear
  }

  const hBirth = yearNum(husband?.birthDate)
  const wBirth = yearNum(wife?.birthDate)

  return {
    family: f,
    husband,
    wife,
    children,
    kind: familyKind(f),
    marriageDate,
    marriagePlace,
    marriageYear,
    firstChildYear,
    lastChildYear,
    startYear,
    startEstimated,
    endYear,
    endReason,
    ongoing,
    durationYears,
    husbandAge: husband ? ageAt(husband.birthDate, marriageDate) : null,
    wifeAge: wife ? ageAt(wife.birthDate, marriageDate) : null,
    ageGap: hBirth != null && wBirth != null ? wBirth - hBirth : null,
    divorced,
    remarriage:
      (!!husband && (unions.get(husband.id) ?? 0) > 1) || (!!wife && (unions.get(wife.id) ?? 0) > 1),
    events
  }
}

/** Rows for EVERY family — pass the whole tree (not a scoped subset) so the
 *  "married more than once" count sees all of a person's unions. */
export function buildFamilyRows(
  families: Family[],
  peopleById: ReadonlyMap<string, Person>,
  eventsByFamily: ReadonlyMap<string, EventRecord[]>,
  now: number = new Date().getFullYear()
): FamilyRow[] {
  const unions = unionsPerPerson(families)
  return families.map((f) => buildRow(f, peopleById, eventsByFamily.get(f.id) ?? [], unions, now))
}

/** Unions per person across the whole tree. */
export function unionsPerPerson(families: Family[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const f of families) {
    for (const id of [f.husbandId, f.wifeId]) if (id) m.set(id, (m.get(id) ?? 0) + 1)
  }
  return m
}

/** Last year a row occupies on a time axis (null: nothing to draw). */
export function timelineEnd(row: FamilyRow, now: number = new Date().getFullYear()): number | null {
  if (row.startYear == null) return null
  if (row.endYear != null) return Math.max(row.endYear, row.startYear)
  if (row.ongoing) return now
  return Math.max(row.startYear, row.lastChildYear ?? row.startYear)
}

/* ------------------------------------------------------------ statistics */

export interface FamilyRecord {
  row: FamilyRow
  value: number
}

export interface FamilyStats {
  total: number
  withChildren: number
  avgChildren: number | null
  avgDuration: number | null
  avgAgeHusband: number | null
  avgAgeWife: number | null
  divorced: number
  kinds: Record<FamilyKind, number>
  /** Weddings per decade (label = first year of the decade), oldest first. */
  decades: Bucket[]
  /** Weddings per month, index 0 = January; `datedMonths` = their total. */
  months: number[]
  datedMonths: number
  /** Families by number of children: "0", "1", … "10+". */
  childrenHistogram: Bucket[]
  /** [wife older, husband older by 0–4, 5–9, 10–14, 15+ years]. */
  ageGaps: number[]
  records: {
    largest: FamilyRecord | null
    longest: FamilyRecord | null
    youngestBride: FamilyRecord | null
    youngestGroom: FamilyRecord | null
    ageGap: FamilyRecord | null
  }
  /** Distinct spouses in these rows who married more than once. */
  remarriedPeople: number
}

/** Plausible wedding ages only — a 3-year-old "bride" is a data error that
 *  would drag every average; the records list still shows the extremes. */
const plausibleAge = (a: number | null): a is number => a != null && a >= 10 && a <= 100

function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

function pickRecord(
  rows: FamilyRow[],
  value: (r: FamilyRow) => number | null,
  better: (a: number, b: number) => boolean
): FamilyRecord | null {
  let best: FamilyRecord | null = null
  for (const row of rows) {
    const v = value(row)
    if (v == null) continue
    if (!best || better(v, best.value)) best = { row, value: v }
  }
  return best
}

export function computeFamilyStats(rows: FamilyRow[], unionsPerPerson?: ReadonlyMap<string, number>): FamilyStats {
  const kinds: Record<FamilyKind, number> = { married: 0, partner: 0, other: 0 }
  const decadeCounts = new Map<number, number>()
  const months = new Array<number>(12).fill(0)
  const histogram = new Array<number>(11).fill(0)
  const ageGaps = [0, 0, 0, 0, 0]
  let withChildren = 0
  let divorced = 0

  for (const r of rows) {
    kinds[r.kind]++
    if (r.children.length) withChildren++
    if (r.divorced) divorced++
    histogram[Math.min(10, r.children.length)]++
    if (r.marriageYear != null) {
      const d = Math.floor(r.marriageYear / 10) * 10
      decadeCounts.set(d, (decadeCounts.get(d) ?? 0) + 1)
    }
    const m = monthOf(r.marriageDate)
    if (m) months[m - 1]++
    if (r.ageGap != null) {
      const g = r.ageGap
      ageGaps[g < 0 ? 0 : g < 5 ? 1 : g < 10 ? 2 : g < 15 ? 3 : 4]++
    }
  }

  const lastBucket = histogram.reduce((last, n, i) => (n > 0 ? i : last), 0)
  const childrenHistogram: Bucket[] = histogram
    .slice(0, Math.max(lastBucket, 1) + 1)
    .map((count, i) => ({ label: i === 10 ? '10+' : String(i), count }))

  const remarried = new Set<string>()
  if (unionsPerPerson) {
    for (const r of rows) {
      for (const p of [r.husband, r.wife]) if (p && (unionsPerPerson.get(p.id) ?? 0) > 1) remarried.add(p.id)
    }
  }

  return {
    total: rows.length,
    withChildren,
    avgChildren: rows.length ? rows.reduce((s, r) => s + r.children.length, 0) / rows.length : null,
    // Only marriages that have ended — a running one would pull the mean down.
    avgDuration: mean(
      rows.filter((r) => !r.ongoing).map((r) => r.durationYears).filter((d): d is number => d != null && d >= 0)
    ),
    avgAgeHusband: mean(rows.map((r) => r.husbandAge).filter(plausibleAge)),
    avgAgeWife: mean(rows.map((r) => r.wifeAge).filter(plausibleAge)),
    divorced,
    kinds,
    decades: continuousDecades(decadeCounts),
    months,
    datedMonths: months.reduce((s, n) => s + n, 0),
    childrenHistogram,
    ageGaps,
    records: {
      largest: pickRecord(rows, (r) => (r.children.length ? r.children.length : null), (a, b) => a > b),
      longest: pickRecord(rows, (r) => r.durationYears, (a, b) => a > b),
      youngestBride: pickRecord(rows, (r) => r.wifeAge, (a, b) => a < b),
      youngestGroom: pickRecord(rows, (r) => r.husbandAge, (a, b) => a < b),
      ageGap: pickRecord(rows, (r) => (r.ageGap == null ? null : Math.abs(r.ageGap)), (a, b) => a > b)
    },
    remarriedPeople: remarried.size
  }
}

/** Every decade from the first to the last wedding, empty ones as 0 — a time
 *  axis that skipped quiet decades would make the columns read wrong. */
function continuousDecades(counts: Map<number, number>): Bucket[] {
  if (!counts.size) return []
  const keys = [...counts.keys()]
  const out: Bucket[] = []
  for (let d = Math.min(...keys); d <= Math.max(...keys); d += 10) out.push({ label: String(d), count: counts.get(d) ?? 0 })
  return out
}

/* ------------------------------------------------- spouses' shared ancestry */

export interface SharedAncestry {
  /** Nearest common ancestor(s) — usually a couple, at most two ids. */
  ancestorIds: string[]
  /** Generations up from the husband / the wife to that ancestor. */
  genA: number
  genB: number
}

/** How far up the check looks; deeper links are rarely provable in records. */
export const ANCESTRY_MAX_GEN = 8

/**
 * For each couple, the NEAREST ancestor both spouses descend from (birth
 * parents only — adoptive, foster and step links do not make blood relatives).
 * Ancestor sets are walked breadth-first per person and cached, so a tree with
 * thousands of couples stays cheap. Couples with no shared ancestor within
 * `maxGen` generations are absent from the result.
 */
export function sharedAncestry(
  families: Family[],
  validIds: Set<string>,
  couples: { familyId: string; a: string; b: string }[],
  maxGen: number = ANCESTRY_MAX_GEN
): Map<string, SharedAncestry> {
  const parents = buildBirthParents(families, validIds)
  const cache = new Map<string, Map<string, number>>()
  const ancestors = (id: string): Map<string, number> => {
    const hit = cache.get(id)
    if (hit) return hit
    const seen = new Map<string, number>()
    let frontier = [id]
    for (let gen = 1; gen <= maxGen && frontier.length; gen++) {
      const next: string[] = []
      for (const cur of frontier) {
        const p = parents.get(cur)
        for (const par of [p?.father, p?.mother]) {
          if (!par || par === id || seen.has(par)) continue
          seen.set(par, gen)
          next.push(par)
        }
      }
      frontier = next
    }
    cache.set(id, seen)
    return seen
  }

  const out = new Map<string, SharedAncestry>()
  for (const { familyId, a, b } of couples) {
    if (a === b) continue
    const A = ancestors(a)
    const B = ancestors(b)
    if (!A.size || !B.size) continue
    const aSmaller = A.size <= B.size
    const small = aSmaller ? A : B
    const big = aSmaller ? B : A
    let best = Infinity
    let hits: { id: string; ga: number; gb: number }[] = []
    for (const [id, g] of small) {
      const g2 = big.get(id)
      if (g2 == null) continue
      const ga = aSmaller ? g : g2
      const gb = aSmaller ? g2 : g
      const sum = ga + gb
      if (sum < best) {
        best = sum
        hits = [{ id, ga, gb }]
      } else if (sum === best) hits.push({ id, ga, gb })
    }
    if (hits.length) {
      out.set(familyId, { ancestorIds: hits.slice(0, 2).map((h) => h.id), genA: hits[0].ga, genB: hits[0].gb })
    }
  }
  return out
}
