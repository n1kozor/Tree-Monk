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

export function normalizeDate(raw: string): string {
  const s = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return ''

  // Pure year.
  if (/^\d{4}$/.test(s)) return s

  // ISO-ish, year first: YYYY[-/.]M[-/.]D? (day optional).
  let m = /^(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?$/.exec(s)
  if (m) {
    const y = m[1]
    const mo = Number(m[2])
    const d = m[3] ? Number(m[3]) : undefined
    if (okMonth(mo) && (d === undefined || okDay(d))) {
      return d === undefined ? `${y}-${pad(mo)}` : `${y}-${pad(mo)}-${pad(d)}`
    }
  }

  // European, day first: D[-/.]M[-/.]YYYY.
  m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(s)
  if (m) {
    const d = Number(m[1])
    const mo = Number(m[2])
    const y = m[3]
    if (okMonth(mo) && okDay(d)) return `${y}-${pad(mo)}-${pad(d)}`
  }

  // European month-year: M[-/.]YYYY.
  m = /^(\d{1,2})[.\-/](\d{4})$/.exec(s)
  if (m) {
    const mo = Number(m[1])
    const y = m[2]
    if (okMonth(mo)) return `${y}-${pad(mo)}`
  }

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
export function formatDisplayDate(raw: string | null | undefined, fmt: DateDisplayFormat): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
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
