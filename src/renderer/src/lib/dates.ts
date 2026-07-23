/**
 * Light, lossless date standardization for genealogical input.
 *
 * The goal is consistency without destroying data: confidently-numeric input is
 * canonicalised to ISO-ish `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, while qualified or
 * textual dates ("abt 1850", "before 1900", "Q2 1812") are left exactly as typed.
 *
 * Numeric formats understood:
 *   1850                       → 1850
 *   1850-3 / 1850.03 / 1850/3  → 1850-03
 *   1850-3-7 / 1850.03.07      → 1850-03-07
 *   7.3.1850 / 07/03/1850      → 1850-03-07   (European day-first)
 *   3.1850 / 03/1850           → 1850-03      (European month-year)
 */
const pad = (n: number): string => String(n).padStart(2, '0')
const okMonth = (m: number): boolean => m >= 1 && m <= 12
const okDay = (d: number): boolean => d >= 1 && d <= 31

/** Lowercase + strip diacritics, so "január"/"März"/"June" all match one table. */
function deaccent(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Month names + abbreviations in Hungarian, English and German → month number.
 * Keys are diacritic-stripped & lowercase (see deaccent). This is what lets the
 * offline parser recognise "1992 jan. 12", "12 January 1992", "január 1992" —
 * no network, no API (the FamilySearch Date authority is used when signed in;
 * this is the local equivalent).
 */
const MONTHS: Record<string, number> = (() => {
  const table: [number, string[]][] = [
    [1, ['january', 'jan', 'januar', 'januar', 'januar']],
    [2, ['february', 'feb', 'februar', 'februar']],
    [3, ['march', 'mar', 'marc', 'marcius', 'marz', 'mrz']],
    [4, ['april', 'apr', 'aprilis']],
    [5, ['may', 'maj', 'majus', 'mai']],
    [6, ['june', 'jun', 'junius', 'juni']],
    [7, ['july', 'jul', 'julius', 'juli']],
    [8, ['august', 'aug', 'augusztus']],
    [9, ['september', 'sep', 'sept', 'szeptember', 'szept', 'szep']],
    [10, ['october', 'oct', 'okt', 'oktober']],
    [11, ['november', 'nov']],
    [12, ['december', 'dec', 'dez', 'dezember']]
  ]
  const out: Record<string, number> = {}
  for (const [n, names] of table) for (const name of names) out[name] = n
  return out
})()

/** Roman-numeral months (I–XII) — common for the month in old church records
 *  ("1850. VII. 12." = 1850-07-12). Only the 12 canonical forms. */
const ROMAN_MONTHS: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12
}

/** Full month names (≥6 chars) used for typo tolerance — abbreviations are
 *  excluded so a one-edit fuzzy match can never confuse jun/jul, jan/jun, etc. */
const FUZZY_MONTHS: [string, number][] = Object.entries(MONTHS).filter(([k]) => k.length >= 6)

/** True if `a` is within one edit of `b` — Optimal String Alignment (Damerau–
 *  Levenshtein with ADJACENT transpositions), so "decmber"→"december" (deletion),
 *  "januray"/"janaury"→"january" and "szpetember"→"szeptember" (transposition)
 *  all count as distance 1. Specialised for the ≤1 case (no full DP matrix). */
function within1(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  if (la === lb) {
    let d1 = -1
    let d2 = -1
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        if (d1 < 0) d1 = i
        else if (d2 < 0) d2 = i
        else return false // >2 differences
      }
    }
    if (d2 < 0) return true // ≤1 substitution
    return d2 === d1 + 1 && a[d1] === b[d2] && a[d2] === b[d1] // adjacent transposition
  }
  // Lengths differ by 1 → exactly one insertion/deletion.
  const short = la < lb ? a : b
  const long = la < lb ? b : a
  let i = 0
  let j = 0
  let skipped = false
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++
      j++
    } else {
      if (skipped) return false
      skipped = true
      j++
    }
  }
  return true
}

/** Resolve a non-numeric token to a month number: exact name → Roman numeral →
 *  conservative typo match. Returns null if it isn't a month. */
function tokenToMonth(key: string): number | null {
  if (MONTHS[key] !== undefined) return MONTHS[key]
  if (ROMAN_MONTHS[key] !== undefined) return ROMAN_MONTHS[key]
  if (key.length >= 5) {
    for (const [name, n] of FUZZY_MONTHS) if (within1(key, name)) return n
  }
  return null
}

/**
 * Recognise a month-name date in any of hu/en/de, any order, with/without a
 * day and ordinal suffixes, Roman-numeral months, mixed separators, and small
 * typos: "1992 jan. 12", "12 January 1992", "January 12, 1992", "január 1992",
 * "1850. VII. 12", "12-Jan-1992", "decmber 1850". Requires a recognised month
 * AND a 4-digit year; the day is optional. Returns ISO-ish `YYYY-MM[-DD]`, or
 * null if the text isn't a month-name date (numeric branches / fallback handle it).
 */
function parseMonthName(s: string): string | null {
  const toks = s.split(/[\s.,/-]+/).filter(Boolean)
  if (toks.length < 2 || toks.length > 3) return null
  let mo: number | null = null
  let day: number | null = null
  let year: number | null = null
  for (const raw of toks) {
    if (/^\d{4}$/.test(raw)) {
      if (year !== null) return null
      year = Number(raw)
      continue
    }
    const dayM = /^(\d{1,2})(?:st|nd|rd|th)?$/i.exec(raw)
    if (dayM) {
      if (day !== null) return null
      day = Number(dayM[1])
      continue
    }
    const found = tokenToMonth(deaccent(raw).replace(/\.$/, ''))
    if (found === null || mo !== null) return null
    mo = found
  }
  if (mo === null || year === null) return null
  if (day !== null && !okDay(day)) return null
  return day !== null ? `${year}-${pad(mo)}-${pad(day)}` : `${year}-${pad(mo)}`
}

/** GEDCOM-style date qualifier, stored as a canonical prefix in the SAME text
 *  field ("ABT 1850", "BEF 1850-03", "BET 1850 AND 1860") — so every existing
 *  consumer (sorting, export, DB) keeps working with zero schema change. */
export type DateQualifier = 'ABT' | 'BEF' | 'AFT' | 'BET'

export interface QualifiedDate {
  qual: DateQualifier | null
  core: string
  /** Range end, only for BET … AND …. */
  end: string | null
}

/** Split a stored date into its qualifier and core value(s). */
export function splitQualifier(raw: string | null | undefined): QualifiedDate {
  const s = (raw ?? '').trim()
  let m = /^BET\.?\s+(.+?)\s+AND\s+(.+)$/i.exec(s)
  if (m) return { qual: 'BET', core: m[1].trim(), end: m[2].trim() }
  m = /^(ABT|BEF|AFT)\.?\s+(.+)$/i.exec(s)
  if (m) return { qual: m[1].toUpperCase() as DateQualifier, core: m[2].trim(), end: null }
  return { qual: null, core: s, end: null }
}

/**
 * Pull a typed qualifier off the raw INPUT (multi-language, symbol or word,
 * leading or trailing) so "kb 1850", "~1850", "1850 előtt", "vor 1850",
 * "between 1850 and 1860", "1850 és 1860 között" all canonicalise.
 */
function splitInputQualifier(s: string): QualifiedDate {
  // Already-canonical (or GEDCOM-imported) prefixes first.
  const canonical = splitQualifier(s)
  if (canonical.qual) return canonical
  let m =
    /^(?:between|zwischen)\s+(.+?)\s+(?:and|und)\s+(.+)$/i.exec(s) ??
    /^(.+?)\s+és\s+(.+?)\s+között$/i.exec(s)
  if (m) return { qual: 'BET', core: m[1].trim(), end: m[2].trim() }
  m = /^(?:~|kb\.?|ca\.?|cca\.?|abt\.?|about|approx\.?|um|etwa)\s*(.+)$/i.exec(s)
  if (m) return { qual: 'ABT', core: m[1].trim(), end: null }
  m = /^(?:<|bef\.?|before|vor)\s*(.+)$/i.exec(s)
  if (m) return { qual: 'BEF', core: m[1].trim(), end: null }
  m = /^(?:>|aft\.?|after|nach)\s*(.+)$/i.exec(s)
  if (m) return { qual: 'AFT', core: m[1].trim(), end: null }
  m = /^(.+?)\s+körül$/i.exec(s)
  if (m) return { qual: 'ABT', core: m[1].trim(), end: null }
  m = /^(.+?)\s+előtt$/i.exec(s)
  if (m) return { qual: 'BEF', core: m[1].trim(), end: null }
  m = /^(.+?)\s+után$/i.exec(s)
  if (m) return { qual: 'AFT', core: m[1].trim(), end: null }
  return { qual: null, core: s, end: null }
}

export function normalizeDate(raw: string): string {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''
  // Qualifier (typed in any supported language) → canonical GEDCOM-ish prefix,
  // with the numeric part(s) canonicalised the usual way.
  const q = splitInputQualifier(trimmed)
  if (q.qual === 'BET') {
    const a = normalizeCore(q.core)
    const b = normalizeCore(q.end ?? '')
    // Only canonicalise a range when BOTH ends are clean numeric dates —
    // anything murkier stays exactly as typed.
    if (/^\d{4}/.test(a) && /^\d{4}/.test(b)) return `BET ${a} AND ${b}`
    return trimmed
  }
  if (q.qual) {
    const core = normalizeCore(q.core)
    if (/^\d{4}/.test(core)) return `${q.qual} ${core}`
    return trimmed
  }
  return normalizeCore(trimmed)
}

function normalizeCore(raw: string): string {
  const s = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return ''

  // Julian-calendar marker at the END — "1700-02-11 (J)", "1700.02.11 julián"
  // → canonical "<normalized> (J)". Only applied when the rest is a clean
  // numeric date, so free text keeps its trailing words. The marker word must
  // be explicit ("julián/julianisch/…" or "(J)") — a bare trailing "jul" is a
  // JULY abbreviation, not the Julian flag, so it is NOT accepted here.
  const jm = /^(.*?)\s*(?:\(J\)|jul(?:ian|ián|iánus|ianisch|ianus)\.?)$/i.exec(s)
  if (jm && jm[1].trim() && jm[1].trim() !== s) {
    const core = normalizeCore(jm[1])
    if (/^\d{4}/.test(core)) return `${core} (J)`
  }

  // Dual (double-dated) year — the Julian/Gregorian year-start mismatch:
  // "1699/00" and "1699/1700" → canonical "1699/1700". ONLY when the two years
  // are CONSECUTIVE (that is what dual dating means); otherwise this is a plain
  // YYYY/M[M] year-month ("1850/3" → "1850-03"), which the ISO branch handles.
  // Sorting uses the first year; display passes the dual form through untouched.
  const dual = /^(\d{4})\s*\/\s*(\d{1,4})$/.exec(s)
  if (dual) {
    const y1 = Number(dual[1])
    let y2 = Number(dual[2])
    if (dual[2].length < 4) {
      y2 = Math.floor(y1 / 100) * 100 + y2
      if (y2 <= y1) y2 += 100
    }
    if (y2 === y1 + 1) return `${y1}/${y2}` // genuine dual date
    // else: fall through — it's a year/month, let the ISO branch canonicalise it
  }

  // Pure year.
  if (/^\d{4}$/.test(s)) return s

  // ISO-ish, year first: YYYY[-/. ]M[-/. ]D? (day optional). Space is accepted
  // as a separator too, so "1992 04 10" works like "1992-04-10".
  let m = /^(\d{4})[.\-/ ](\d{1,2})(?:[.\-/ ](\d{1,2}))?$/.exec(s)
  if (m) {
    const y = m[1]
    const mo = Number(m[2])
    const d = m[3] ? Number(m[3]) : undefined
    if (okMonth(mo) && (d === undefined || okDay(d))) {
      return d === undefined ? `${y}-${pad(mo)}` : `${y}-${pad(mo)}-${pad(d)}`
    }
  }

  // European, day first: D[-/. ]M[-/. ]YYYY — "10 04 1992" → "1992-04-10".
  m = /^(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{4})$/.exec(s)
  if (m) {
    const d = Number(m[1])
    const mo = Number(m[2])
    const y = m[3]
    if (okMonth(mo) && okDay(d)) return `${y}-${pad(mo)}-${pad(d)}`
  }

  // European month-year: M[-/. ]YYYY.
  m = /^(\d{1,2})[.\-/ ](\d{4})$/.exec(s)
  if (m) {
    const mo = Number(m[1])
    const y = m[2]
    if (okMonth(mo)) return `${y}-${pad(mo)}`
  }

  // Month-name dates in hu/en/de, any order: "1992 jan. 12", "12 January 1992",
  // "január 1992", "1992 Jul". Offline — the local equivalent of the FS Date
  // authority. Runs after the numeric branches (month-name input has letters, so
  // it never collides with them).
  const byName = parseMonthName(s)
  if (byName) return byName

  // Anything else (qualified/textual) — leave untouched.
  return s
}

export type DateDisplayFormat = 'iso' | 'eu' | 'us'

/**
 * Render a STORED (ISO-ish) date in the user's chosen display format. Only a
 * clean numeric date — `YYYY`, `YYYY-MM` or `YYYY-MM-DD` and nothing else — is
 * reformatted; anything qualified or textual ("abt 1850", "before 1900") is
 * returned exactly as stored, since it can't be safely re-arranged. A bare year
 * is a year in every format. Storage stays ISO; this is display-only.
 *
 *   1885-03-07  →  iso 1885-03-07 · eu 07.03.1885 · us 03/07/1885
 *   1885-03     →  iso 1885-03    · eu 03.1885    · us 03/1885
 *   1885 / "abt 1850"  →  unchanged in every format
 */
export function formatDisplayDate(
  raw: string | null | undefined,
  fmt: DateDisplayFormat,
  lang?: string
): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  // Qualified date → format the core value(s), then wrap in the localized affix.
  const q = splitQualifier(s)
  if (q.qual) {
    const core = formatCore(q.core, fmt)
    const end = q.end ? formatCore(q.end, fmt) : ''
    const l = (lang ?? 'en').slice(0, 2)
    if (q.qual === 'BET') {
      if (l === 'hu') return `${core} és ${end} között`
      if (l === 'de') return `zwischen ${core} und ${end}`
      return `between ${core} and ${end}`
    }
    if (q.qual === 'ABT') return l === 'hu' ? `kb. ${core}` : l === 'de' ? `um ${core}` : `abt. ${core}`
    if (q.qual === 'BEF') return l === 'hu' ? `${core} előtt` : l === 'de' ? `vor ${core}` : `before ${core}`
    return l === 'hu' ? `${core} után` : l === 'de' ? `nach ${core}` : `after ${core}`
  }
  return formatCore(s, fmt)
}

function formatCore(s: string, fmt: DateDisplayFormat): string {
  // Julian marker rides along: format the date part, re-append " (J)".
  const jm = /^(.*?)\s*\(J\)$/.exec(s)
  if (jm) return `${formatCore(jm[1].trim(), fmt)} (J)`
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s)
  if (!m || fmt === 'iso') return s
  const [, y, mo, d] = m
  if (!mo) return y
  if (fmt === 'eu') return d ? `${d}.${mo}.${y}` : `${mo}.${y}`
  return d ? `${mo}/${d}/${y}` : `${mo}/${y}` // us
}

/**
 * Live input mask for ISO date typing: as the user types digits, the `-`
 * separators appear automatically. `20220112` → `2022-01-12`, `202203` →
 * `2022-03`. Only kicks in for plain digit/dash input — anything else (dots,
 * slashes, "abt 1850", a typed day-first `12.01.2022`) is left untouched so the
 * existing `normalizeDate` can canonicalise it on blur.
 */
export function maskDateTyping(raw: string): string {
  if (!/^[\d-]*$/.test(raw)) return raw
  const d = raw.replace(/-/g, '').slice(0, 8)
  if (d.length <= 4) return d
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
}

interface DateParts {
  year: number | null
  month: number | null
  day: number | null
}

/** Pulls Y/M/D out of an ISO-ish date string (any part may be missing). */
function dateParts(date: string | null | undefined): DateParts {
  const m = /(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(date ?? '')
  if (!m) return { year: null, month: null, day: null }
  return {
    year: Number(m[1]),
    month: m[2] ? Number(m[2]) : null,
    day: m[3] ? Number(m[3]) : null
  }
}

/**
 * Sortable numeric key (yyyymmdd) for an ISO-ish date — FULL month/day
 * precision, so same-year events (siblings, marriages) order correctly
 * instead of falling back to insertion order. Unknown dates sort last.
 */
export function dateSortKey(date: string | null | undefined, missing = 99999999): number {
  const p = dateParts(date)
  if (p.year == null) return missing
  return p.year * 10000 + (p.month ?? 0) * 100 + (p.day ?? 0)
}

/**
 * Age (in whole years) of a person at a given event date. Accounts for month
 * and day when both dates carry them — so someone born in November who is buried
 * the following January is 67, not 68. Falls back to a plain year difference
 * when only years are known. Returns null if either year is missing.
 */
export function ageAt(birth: string | null | undefined, event: string | null | undefined): number | null {
  const b = dateParts(birth)
  const e = dateParts(event)
  if (b.year == null || e.year == null) return null
  let age = e.year - b.year
  if (b.month != null && e.month != null) {
    if (e.month < b.month) age--
    else if (e.month === b.month && b.day != null && e.day != null && e.day < b.day) age--
  }
  return age
}
