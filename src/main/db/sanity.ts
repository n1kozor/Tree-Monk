import { DismissedIssues, Families, People } from './repo'
import type { Person, SanityIssue } from '@shared/types'

/**
 * Month name → 1–12. Covers full names AND abbreviations in English, Hungarian
 * and German, because FamilySearch / GEDCOM dates arrive in many shapes:
 * "11 JAN 1906", "1. Januar 1907", "1850. április", "March 1900", "1900-03-01".
 * Each registered name also auto-adds its 3-letter prefix (the GEDCOM abbrev),
 * so "Jan", "Jän", "Már", "Szep" etc. all resolve too.
 */
const MONTH_TOKENS: Record<string, number> = {}
const addMonth = (n: number, ...names: string[]): void => {
  for (const name of names) {
    MONTH_TOKENS[name] = n
    const p = name.slice(0, 3)
    if (MONTH_TOKENS[p] === undefined) MONTH_TOKENS[p] = n
  }
}
addMonth(1, 'january', 'januar', 'január', 'jänner')
addMonth(2, 'february', 'februar', 'február')
addMonth(3, 'march', 'märz', 'marz', 'március', 'marcius')
addMonth(4, 'april', 'április', 'aprilis')
addMonth(5, 'may', 'mai', 'május', 'majus')
addMonth(6, 'june', 'juni', 'június', 'junius')
addMonth(7, 'july', 'juli', 'július', 'julius')
addMonth(8, 'august', 'augusztus')
addMonth(9, 'september', 'szeptember', 'sept')
addMonth(10, 'october', 'oktober', 'október')
addMonth(11, 'november')
addMonth(12, 'december', 'dezember')

/** The month (1–12) named anywhere in a free-form date, or null. Splits on
 *  non-letters so "11 JAN 1906", "1. Januar 1907" and "1850. április" all work. */
function monthIndex(date: string): number | null {
  for (const tok of date.toLowerCase().split(/[^\p{L}]+/u)) {
    if (tok && MONTH_TOKENS[tok] !== undefined) return MONTH_TOKENS[tok]
  }
  return null
}

/** Parses a free-form GEDCOM date into a decimal year (mid-year if no month). */
function decimalYear(date: string | null): number | null {
  if (!date) return null
  const iso = date.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return Number(iso[1]) + (Number(iso[2]) - 0.5) / 12
  const ym = date.match(/\b(\d{4})\b/)
  if (!ym) return null
  const y = Number(ym[0])
  const m = monthIndex(date)
  return m !== null ? y + (m - 0.5) / 12 : y + 0.5
}

const yearOf = (d: string | null): number | null => {
  const dy = decimalYear(d)
  return dy === null ? null : Math.floor(dy)
}

/**
 * Earliest/latest possible decimal year for a free-form date, respecting its
 * PRECISION: a year-only date spans the whole year [y, y+1), a year+month spans
 * that month, a full ISO date is a single day. Lets date comparisons avoid false
 * positives from partial dates (e.g. "1922" vs "April 1922").
 */
function dateBounds(date: string | null): { lo: number; hi: number } | null {
  if (!date) return null
  const iso = date.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const v = Number(iso[1]) + (Number(iso[2]) - 1) / 12 + (Number(iso[3]) - 1) / 365
    return { lo: v, hi: v + 1 / 365 }
  }
  const ym = date.match(/\b(\d{4})\b/)
  if (!ym) return null
  const y = Number(ym[0])
  const m = monthIndex(date)
  if (m !== null) return { lo: y + (m - 1) / 12, hi: y + m / 12 }
  return { lo: y, hi: y + 1 }
}

function name(p: Person): string {
  return `${p.givenName} ${p.surname}`.trim() || '—'
}

let counter = 0
const nid = (): string => `issue-${counter++}`

/** Current year — used to flag people who would be implausibly old if still alive. */
const NOW_YEAR = new Date().getFullYear()
// "Now" as a decimal year using the SAME convention as dateBounds (month-1)/12 +
// (day-1)/365, so a date earlier this year (e.g. April when it's June) is NOT
// mistaken for the future — the old year-only NOW_YEAR flagged any date after
// Jan 1 of the current year as future.
const _now = new Date()
const NOW_DECIMAL = _now.getFullYear() + _now.getMonth() / 12 + (_now.getDate() - 1) / 365
/** Past this age with no death recorded, a person is almost certainly deceased. */
const MAX_LIVING_AGE = 110

/**
 * Scans the whole database for biological / logical impossibilities.
 */
export function runSanityCheck(): SanityIssue[] {
  counter = 0
  const people = People.list()
  const families = Families.list()
  const byId = new Map(people.map((p) => [p.id, p]))
  const issues: SanityIssue[] = []
  const ref = (...ps: Person[]): { id: string; name: string }[] =>
    ps.map((p) => ({ id: p.id, name: name(p) }))

  // Per-person rules.
  for (const p of people) {
    const b = decimalYear(p.birthDate)
    const d = decimalYear(p.deathDate)

    // Rule 4: lived older than 120 years.
    if (b !== null && d !== null && d - b > 120) {
      issues.push({
        id: nid(),
        rule: 'age120',
        severity: 'high',
        detail: `${name(p)} — ${Math.round(d - b)} ${'years'}`,
        people: ref(p)
      })
    }

    // Rule 7: death recorded before birth (negative lifespan). Compared at the
    // YEAR level on purpose: intra-year ordering from imports is unreliable — an
    // infant "born March 1825, died 1825" (year-only, sometimes stored as Jan 1)
    // is NOT an error. Only flag when even the LATEST possible death year is
    // strictly before the EARLIEST possible birth year (e.g. born 1850 / died 1840).
    const bb = dateBounds(p.birthDate)
    const dd = dateBounds(p.deathDate)
    if (bb && dd && Math.floor(dd.hi - 1e-6) < Math.floor(bb.lo)) {
      issues.push({
        id: nid(),
        rule: 'deathBeforeBirth',
        severity: 'high',
        detail: `${name(p)} — * ${yearOf(p.birthDate)} / † ${yearOf(p.deathDate)}`,
        people: ref(p)
      })
    }

    // Death vs burial. Burial cannot precede death; and a burial recorded an
    // implausibly long time AFTER death (months/years) is worth a look — often a
    // sign of a mismatched merge. Precision-aware so year-only dates don't false-
    // flag (their ranges overlap).
    const bur = dateBounds(p.burialDate)
    if (bur && dd) {
      if (bur.hi < dd.lo - 1e-9) {
        issues.push({
          id: nid(),
          rule: 'burialBeforeDeath',
          severity: 'high',
          detail: `${name(p)} — † ${yearOf(p.deathDate)} / ⚰ ${yearOf(p.burialDate)}`,
          people: ref(p)
        })
      } else if (bur.lo - dd.hi > 0.4) {
        issues.push({
          id: nid(),
          rule: 'burialLongAfterDeath',
          severity: 'medium',
          detail: `${name(p)} — † ${yearOf(p.deathDate)} → ⚰ ${yearOf(p.burialDate)}`,
          people: ref(p)
        })
      }
    }

    // Rule 8: birth date lies in the future. Flag only if even the EARLIEST
    // possible birth instant (bb.lo) is after today — so a year-only "2026" or a
    // date earlier this year is not wrongly flagged. (~2-day epsilon.)
    if (bb && bb.lo - NOW_DECIMAL > 2 / 365) {
      issues.push({
        id: nid(),
        rule: 'birthInFuture',
        severity: 'high',
        detail: `${name(p)} — * ${yearOf(p.birthDate)}`,
        people: ref(p)
      })
    }

    // Rule 9: born long ago but still recorded as living → almost certainly
    // deceased. Offers a one-click "mark deceased" correction.
    if (b !== null && d === null && !p.deceased && NOW_YEAR - b > MAX_LIVING_AGE) {
      issues.push({
        id: nid(),
        rule: 'probablyDeceased',
        severity: 'medium',
        detail: `${name(p)} (* ${yearOf(p.birthDate)}) · ~${Math.round(NOW_YEAR - b)}`,
        people: ref(p),
        fixes: [{ kind: 'markDeceased', personId: p.id, personName: name(p) }]
      })
    }
  }

  for (const f of families) {
    const husband = f.husbandId ? byId.get(f.husbandId) : undefined
    const wife = f.wifeId ? byId.get(f.wifeId) : undefined
    const marrB = dateBounds(f.marriageDate)

    // Rule 5: marriage after a spouse's death. Precision-aware: only flag when the
    // EARLIEST the marriage could have happened is strictly after the LATEST the
    // spouse could have died — so "died 1900" + "married 1900" (both year-only) is
    // not a false positive.
    for (const sp of [husband, wife]) {
      if (!sp || !marrB) continue
      const dB = dateBounds(sp.deathDate)
      if (dB && marrB.lo - dB.hi > 1e-6) {
        issues.push({
          id: nid(),
          rule: 'marriageAfterDeath',
          severity: 'high',
          detail: `${name(sp)} († ${yearOf(sp.deathDate)}) — ⚭ ${yearOf(f.marriageDate)}`,
          people: ref(sp)
        })
      }
    }

    // Per-child parent rules.
    const children = f.childIds.map((id) => byId.get(id)).filter((c): c is Person => !!c)
    for (const c of children) {
      // All parent/child date rules compare PRECISION-AWARE bounds, so a year-only
      // date (which spans a whole year) is never falsely flagged against a precise
      // one (e.g. mother "† 1900" vs child "* 1900-05-12" → no overlap violation).
      const cbb = dateBounds(c.birthDate)
      if (!cbb) continue
      const cb = decimalYear(c.birthDate) as number // non-null when cbb is

      // Rule 1: child born after mother's death — only when the earliest possible
      // birth is strictly after the latest possible death.
      if (wife) {
        const mdd = dateBounds(wife.deathDate)
        if (mdd && cbb.lo - mdd.hi > 1e-6) {
          issues.push({
            id: nid(),
            rule: 'bornAfterMotherDeath',
            severity: 'high',
            detail: `${name(c)} (* ${yearOf(c.birthDate)}) — ${name(wife)} († ${yearOf(wife.deathDate)})`,
            people: ref(c, wife)
          })
        }
      }

      // Rule 3: father died before the child could be conceived (~9 months before
      // the earliest possible birth).
      if (husband) {
        const fdd = dateBounds(husband.deathDate)
        if (fdd && cbb.lo - 0.75 - fdd.hi > 1e-6) {
          issues.push({
            id: nid(),
            rule: 'fatherDiedBeforeConception',
            severity: 'high',
            detail: `${name(c)} (* ${yearOf(c.birthDate)}) — ${name(husband)} († ${yearOf(husband.deathDate)})`,
            people: ref(c, husband)
          })
        }
      }

      // Rules 2 & 10: parent age at child's birth.
      for (const parent of [husband, wife]) {
        if (!parent) continue
        const pbb = dateBounds(parent.birthDate)
        if (!pbb) continue
        const pb = decimalYear(parent.birthDate) as number
        if (pbb.lo - cbb.hi > 1e-6) {
          // Rule 10: parent born strictly after their own child — impossible.
          issues.push({
            id: nid(),
            rule: 'parentBornAfterChild',
            severity: 'high',
            detail: `${name(parent)} (* ${yearOf(parent.birthDate)}) — ${name(c)} (* ${yearOf(c.birthDate)})`,
            people: ref(parent, c)
          })
        } else if (cbb.hi - pbb.lo < 13) {
          // Rule 2: parent younger than 13 even at the MOST generous spacing → flag.
          issues.push({
            id: nid(),
            rule: 'parentTooYoung',
            severity: 'medium',
            detail: `${name(parent)} (* ${yearOf(parent.birthDate)}) — ${name(c)} (* ${yearOf(c.birthDate)}), ${Math.round(cb - pb)}`,
            people: ref(parent, c)
          })
        }
      }
    }

    // Rule 6: single births CERTAINLY less than 8 months apart. Precision-aware:
    // a year-only date spans a whole year, so it's too coarse to ever trigger
    // this — only flag when even the WIDEST plausible spacing is under 8 months.
    // (Guards against mixed FamilySearch date formats, e.g. "11 Jan 1906" vs
    // "1. Januar 1907", which are really 12 months apart.)
    const dated = children
      .map((c) => ({ c, pt: decimalYear(c.birthDate), bounds: dateBounds(c.birthDate) }))
      .filter(
        (x): x is { c: Person; pt: number; bounds: { lo: number; hi: number } } =>
          x.pt !== null && x.bounds !== null
      )
      .sort((a, b) => a.pt - b.pt)
    for (let i = 1; i < dated.length; i++) {
      const ptGap = dated[i].pt - dated[i - 1].pt
      const maxGap = dated[i].bounds.hi - dated[i - 1].bounds.lo
      if (ptGap > 0.02 && maxGap < 8 / 12) {
        issues.push({
          id: nid(),
          rule: 'siblingsTooClose',
          severity: 'medium',
          detail: `${name(dated[i - 1].c)} (* ${yearOf(dated[i - 1].c.birthDate)}) — ${name(dated[i].c)} (* ${yearOf(dated[i].c.birthDate)})`,
          people: ref(dated[i - 1].c, dated[i].c)
        })
      }
    }
  }

  // Attach a stable key and drop anomalies the user marked as false positives.
  const dismissed = DismissedIssues.all()
  const keyed = issues
    .map((i) => ({ ...i, key: `${i.rule}|${i.people.map((p) => p.id).sort().join(',')}` }))
    .filter((i) => !dismissed.has(i.key))
  // Highest severity first.
  return keyed.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
}
