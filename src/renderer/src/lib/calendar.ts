import type { Family, Person } from '@shared/types'

export type EventKind = 'birth' | 'death' | 'marriage'

export interface CalEvent {
  kind: EventKind
  day: number // 1..31 (0 when the day is unknown — filtered out of the grid)
  year: number | null
  /** Person to open when clicked (for a marriage: one of the spouses). */
  personId: string
  primary: Person
  /** The other spouse, for marriages. */
  partner?: Person
  /** Age at death, when both years are known. */
  ageAtDeath?: number | null
}

interface Parts {
  y: number | null
  mo: number | null
  d: number | null
}

// Month names (Hungarian, English, German — full + common abbreviations) → 1..12.
const MONTHS: Record<string, number> = {}
const defMonth = (n: number, ...names: string[]): void => {
  for (const x of names) MONTHS[x] = n
}
// Hungarian
defMonth(1, 'január', 'jan')
defMonth(2, 'február', 'febr', 'feb')
defMonth(3, 'március', 'márc', 'már', 'mar', 'march')
defMonth(4, 'április', 'ápr', 'apr', 'april')
defMonth(5, 'május', 'máj', 'may', 'mai')
defMonth(6, 'június', 'jún', 'jun', 'june', 'juni')
defMonth(7, 'július', 'júl', 'jul', 'july', 'juli')
defMonth(8, 'augusztus', 'aug', 'august')
defMonth(9, 'szeptember', 'szept', 'szep', 'sep', 'sept', 'september')
defMonth(10, 'október', 'okt', 'oct', 'october', 'oktober')
defMonth(11, 'november', 'nov')
defMonth(12, 'december', 'dec', 'dez')
// English / German full forms not yet covered
defMonth(1, 'january', 'januar')
defMonth(2, 'february', 'februar')
defMonth(3, 'märz', 'maerz')
defMonth(12, 'dezember')

/**
 * Pull Y/M/D out of a genealogy date. Handles ISO-ish ("1923-05-17", "1923.05",
 * "1923"), day-first numeric ("17.05.1923") AND textual month names in HU/EN/DE
 * ("1913. február 24", "24 February 1913"). Any part may be missing.
 */
export function parts(date: string | null | undefined): Parts {
  const s = (date ?? '').toString().trim().toLowerCase()
  if (!s) return { y: null, mo: null, d: null }

  let mo: number | null = null
  for (const tok of s.split(/[^\p{L}]+/u)) {
    if (tok && MONTHS[tok] != null) {
      mo = MONTHS[tok]
      break
    }
  }

  const nums = (s.match(/\d+/g) ?? []).map((x) => ({ v: Number(x), len: x.length }))
  const yEntry = nums.find((n) => n.len === 4)
  const y = yEntry ? yEntry.v : null
  const small = nums.filter((n) => n.len <= 2)
  let d: number | null = null

  if (mo != null) {
    // Textual month → the day is the first plausible 1..31 number.
    const dd = small.find((n) => n.v >= 1 && n.v <= 31)
    if (dd) d = dd.v
  } else if (y != null) {
    const iso = /^\d{4}[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?/.exec(s)
    if (iso) {
      const a = Number(iso[1])
      const b = iso[2] ? Number(iso[2]) : null
      if (a >= 1 && a <= 12) {
        mo = a
        if (b != null && b >= 1 && b <= 31) d = b
      }
    } else {
      const df = /^(\d{1,2})[.\-/](\d{1,2})[.\-/]\d{4}/.exec(s) // day-first numeric
      if (df) {
        const dd = Number(df[1])
        const mm = Number(df[2])
        if (mm >= 1 && mm <= 12) {
          mo = mm
          if (dd >= 1 && dd <= 31) d = dd
        }
      }
    }
  }

  return { y, mo, d }
}

/** Ancestor person-ids of `rootId` (inclusive), walking parent families upward. */
export function ancestorIds(rootId: string | undefined, families: Family[]): Set<string> {
  const set = new Set<string>()
  if (!rootId) return set
  const childFam = new Map<string, Family>()
  for (const f of families) for (const c of f.childIds) if (!childFam.has(c)) childFam.set(c, f)
  set.add(rootId)
  const stack: string[] = [rootId]
  while (stack.length) {
    const id = stack.pop() as string
    const f = childFam.get(id)
    if (!f) continue
    for (const p of [f.husbandId, f.wifeId]) {
      if (p && !set.has(p)) {
        set.add(p)
        stack.push(p)
      }
    }
  }
  return set
}

export interface BuildOpts {
  month: number // 1..12
  people: Person[]
  families: Family[]
  peopleById: Map<string, Person>
  /** null = everyone; otherwise restrict to these person-ids (e.g. ancestors). */
  scopeIds: Set<string> | null
  kinds: Record<EventKind, boolean>
}

export interface MonthEvents {
  byDay: Map<number, CalEvent[]>
  dayUnknown: number // events in this month whose exact day is unknown
  total: number
}

/** All birth/death/marriage anniversaries that fall in `month` (any year), indexed by day. */
export function buildMonthEvents(o: BuildOpts): MonthEvents {
  const byDay = new Map<number, CalEvent[]>()
  let dayUnknown = 0
  let total = 0
  const inScope = (id: string | null | undefined): boolean => !o.scopeIds || (!!id && o.scopeIds.has(id))
  const add = (day: number | null, ev: CalEvent): void => {
    total++
    if (day == null) {
      dayUnknown++
      return
    }
    const arr = byDay.get(day)
    if (arr) arr.push(ev)
    else byDay.set(day, [ev])
  }

  for (const p of o.people) {
    if (!inScope(p.id)) continue
    if (o.kinds.birth) {
      const b = parts(p.birthDate)
      if (b.mo === o.month) add(b.d, { kind: 'birth', day: b.d ?? 0, year: b.y, personId: p.id, primary: p })
    }
    if (o.kinds.death) {
      const d = parts(p.deathDate)
      if (d.mo === o.month) {
        const ba = parts(p.birthDate)
        const ageAtDeath = ba.y != null && d.y != null ? d.y - ba.y : null
        add(d.d, { kind: 'death', day: d.d ?? 0, year: d.y, personId: p.id, primary: p, ageAtDeath })
      }
    }
  }

  if (o.kinds.marriage) {
    for (const f of o.families) {
      const m = parts(f.marriageDate)
      if (m.mo !== o.month) continue
      const h = f.husbandId ? o.peopleById.get(f.husbandId) : undefined
      const w = f.wifeId ? o.peopleById.get(f.wifeId) : undefined
      if (!h && !w) continue
      if (!inScope(f.husbandId) && !inScope(f.wifeId)) continue
      const primary = (h ?? w) as Person
      const partner = h && w ? (primary === h ? w : h) : undefined
      add(m.d, { kind: 'marriage', day: m.d ?? 0, year: m.y, personId: primary.id, primary, partner })
    }
  }

  const order: Record<EventKind, number> = { birth: 0, marriage: 1, death: 2 }
  for (const arr of byDay.values()) {
    arr.sort((a, b) => order[a.kind] - order[b.kind] || (a.year ?? 9999) - (b.year ?? 9999))
  }
  return { byDay, dayUnknown, total }
}
