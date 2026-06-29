import type { CitationDetail } from '@shared/types'

const NOW = new Date().getFullYear()
const strip = (s: string): string => s.replace(/<[^>]*>/g, ' ')

/**
 * The record year of a FamilySearch citation. FamilySearch does NOT expose a
 * structured source date (it is absent from both the abbreviated and the full
 * source description), so the year lives only in the citation text — but at a
 * reliable position. A FamilySearch citation reads:
 *
 *   "Collection, 1636-1895", FamilySearch (https://… : <accessed date>),
 *    Entry for … , 1889.
 *
 * The record year (1889) is the LAST year, once we strip:
 *   • the parenthetical "(url : accessed date)" — kills the access/database year
 *     (2014, 2024, 2025) that previously polluted the result, and
 *   • collection date ranges like "1636-1895" / "1929-1942".
 *
 * Records whose citation carries no such year (e.g. some civil-registration
 * entries) return null and sort to the bottom.
 */
export function citationYear(
  c: Pick<CitationDetail, 'sourceTitle' | 'sourceAuthor' | 'sourcePublication' | 'page'>
): number | null {
  const text = strip([c.sourceTitle, c.sourceAuthor, c.sourcePublication, c.page].filter(Boolean).join(' '))
    .replace(/\([^)]*\)/g, ' ') // drop "(url : accessed date)" → removes access/db years
    .replace(/\b\d{4}\s*[-–]\s*\d{4}\b/g, ' ') // drop collection date ranges
  const years = (text.match(/\b(1[5-9]\d{2}|20\d{2})\b/g) ?? [])
    .map(Number)
    .filter((y) => y >= 1500 && y <= NOW)
  return years.length ? years[years.length - 1] : null
}

/**
 * Best year for a citation: a structured record date when one exists (GEDCOM
 * `DATA/DATE`, or a future FamilySearch field) and is plausible, otherwise the
 * text heuristic above. Sources with no derivable year return null.
 */
export function sourceYear(
  c: Pick<CitationDetail, 'recordDate' | 'sourceTitle' | 'sourceAuthor' | 'sourcePublication' | 'page'>
): number | null {
  const m = c.recordDate?.match(/\b(1[5-9]\d{2}|20\d{2})\b/)
  if (m) {
    const y = Number(m[1])
    if (y >= 1500 && y <= NOW) return y
  }
  return citationYear(c)
}
